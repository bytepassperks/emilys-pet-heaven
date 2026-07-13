// Viral Pet Sticker backend: sticker orders in D1, live trend fetch,
// Workers-AI prompt generation for the admin panel.
import { requireAdmin } from "./petcard.js";

const MAX_PHOTO_CHARS = 700_000; // ~500 KB data URL per image
const TRENDS_TTL = 24 * 3600 * 1000; // refresh live trend feed daily

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function sanitize(v, max = 200) {
  return (v == null ? "" : String(v)).trim().slice(0, max);
}

function randomSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => alphabet[n % alphabet.length]).join("");
}

async function ensureTables(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sticker_orders (
       id TEXT PRIMARY KEY,
       pet_name TEXT, owner TEXT, phone TEXT, email TEXT, address TEXT,
       pin TEXT, sheets INTEGER DEFAULT 2, notes TEXT,
       photo1 TEXT, photo2 TEXT,
       prompts TEXT, status TEXT DEFAULT 'ordered',
       created_at TEXT, updated_at TEXT)`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sticker_images (
       order_id TEXT, idx INTEGER, data TEXT, label TEXT,
       PRIMARY KEY (order_id, idx))`,
  ).run();
}

// ---- Live trend feed (free, keyless sources; India + Bengali focus) ----
function pickTitles(xml, limit) {
  const out = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) && out.length < limit) {
    const t = m[1].match(/<title>([\s\S]*?)<\/title>/);
    if (t) {
      const title = t[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
      if (title) out.push(title);
    }
  }
  return out;
}

async function fetchFeed(url) {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (EmilysPetHeaven TrendBot)" },
    });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, text: await r.text() };
  } catch (e) {
    return { ok: false, status: String(e).slice(0, 80) };
  }
}

const TREND_QUERIES = [
  ["memes", "viral meme trend"],
  ["india", "viral trend India reels"],
  ["animals", "viral video animal dog cat"],
  ["bengali", "viral Bengali meme Kolkata"],
  ["bengal_reels", "viral video West Bengal Instagram"],
  ["kym", '"know your meme" weekly roundup'],
];

async function fetchTrends() {
  const sources = {};
  await Promise.all(
    TREND_QUERIES.map(async ([key, q]) => {
      const r = await fetchFeed(
        `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss`,
      );
      const norm = (s) => s.replace(/&quot;|"/g, "").trim().toLowerCase();
      sources[key] = r.ok
        ? pickTitles(r.text, 15).filter((t) => norm(t) !== norm(q))
        : [`FAILED ${r.status}`];
    }),
  );
  return sources;
}

async function getTrendsCached(env, force) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)").run();
  const now = Date.now();
  if (!force) {
    const row = await env.DB.prepare("SELECT v FROM kv WHERE k = 'sticker_trends'").first();
    if (row && row.v) {
      try {
        const saved = JSON.parse(row.v);
        if (saved.at && now - saved.at < TRENDS_TTL) return { trends: saved.trends, cached: true, at: saved.at };
      } catch { /* refetch */ }
    }
  }
  const trends = await fetchTrends();
  const okCount = Object.values(trends).filter((v) => v.length && !String(v[0]).startsWith("FAILED")).length;
  if (okCount > 0) {
    await env.DB.prepare("INSERT INTO kv (k, v) VALUES ('sticker_trends', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v")
      .bind(JSON.stringify({ at: now, trends }))
      .run();
  }
  return { trends, cached: false, at: now };
}

const PROMPT_SYSTEM =
  "You are the sticker-prompt engine for Emily's Pet Heaven, an Indian pet brand in Barrackpore, West Bengal. " +
  "Below is a LIVE trend feed fetched from news sources moments ago (current viral memes/trends, India and Bengali/West Bengal included). " +
  "From it, identify the 12 best CURRENT viral memes/trends — a mix of last month and this month; prefer India-relevant, Bengali/Kolkata and pet-adaptable ones; ignore tragedies and anything dark. " +
  "Then write 12 SEPARATE, SELF-CONTAINED ChatGPT text-to-image prompts — one per trend, one image each. The admin pastes each prompt into ChatGPT individually, attaching the customer's pet photo every time. " +
  "EVERY prompt must independently include ALL of this: " +
  "(a) 'Use the attached pet photo: keep the pet's face, fur colours, markings and expression clearly recognizable, redrawn in a flat cartoon-vector style'; " +
  "(b) a VERY detailed vivid scene description of the meme/trend adapted around the pet — pose, props, background elements, colours, mood, at least 3-4 sentences; " +
  "(c) exact caption text in double quotes if the sticker has one, with 'spell the caption exactly as written' — otherwise say 'no text'; " +
  "(d) 'Render as ONE single large die-cut sticker with a thick solid white outline around the whole silhouette and a subtle drop shadow, centered on a PLAIN SOLID LIGHT-GREY (#EEEEEE) background with generous empty margin around the sticker, nothing else in the image'; " +
  "(e) 'square image, high resolution, print quality, no watermark'. " +
  "If a PET NAME is provided below, weave it naturally into any meme that involves a name — name-plates, caption text, jersey text, etc. (e.g. a summit name-plate reading the pet's name) — spelling it exactly as given; never invent a different name. " +
  "Format the output as: 'STICKER 1 — <Trend Name>:' then the full prompt on the following lines, blank line, then STICKER 2, etc. through STICKER 12. Output nothing else.";

// Main entry: handle any /stickers/* route (null = not ours).
export async function handleStickers(request, env, url, cors) {
  const path = url.pathname;
  if (!path.startsWith("/stickers")) return null;
  if (!env.DB) return json({ error: "Sticker storage not configured" }, 503, cors);

  // ---- Public: customer places an order ----
  if (path === "/stickers/order" && request.method === "POST") {
    if (request.headers.get("Origin") && !cors["Access-Control-Allow-Origin"]) {
      return json({ error: "Origin not allowed" }, 403, cors);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const petName = sanitize(body.petName, 120);
    if (!petName) return json({ error: "Pet name is required" }, 400, cors);
    const photo1 = sanitize(body.photo1, MAX_PHOTO_CHARS);
    const photo2 = sanitize(body.photo2, MAX_PHOTO_CHARS);
    if (!photo1) return json({ error: "At least one pet photo is required" }, 400, cors);
    await ensureTables(env);
    const now = new Date().toISOString();
    let lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = randomSlug();
      try {
        await env.DB.prepare(
          `INSERT INTO sticker_orders (id, pet_name, owner, phone, email, address, pin, sheets, notes, photo1, photo2, status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?, 'ordered', ?)`,
        )
          .bind(
            id,
            petName,
            sanitize(body.owner, 120),
            sanitize(body.phone, 40),
            sanitize(body.email, 120),
            sanitize(body.address, 400),
            sanitize(body.pin, 6),
            Math.min(6, Math.max(1, parseInt(body.sheets, 10) || 2)),
            sanitize(body.notes, 300),
            photo1,
            photo2,
            now,
          )
          .run();
        return json({ ok: true, id, createdAt: now }, 200, cors);
      } catch (e) {
        lastErr = e;
      }
    }
    return json({ error: "Could not create order", detail: String(lastErr).slice(0, 200) }, 500, cors);
  }

  // ---- Admin: list orders ----
  if (path === "/stickers/admin/list" && request.method === "GET") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    await ensureTables(env);
    const { results } = await env.DB.prepare(
      `SELECT id, pet_name, owner, phone, email, address, pin, sheets, notes, photo1, photo2, prompts, status, created_at
       FROM sticker_orders ORDER BY created_at DESC LIMIT 200`,
    ).all();
    const counts = await env.DB.prepare(
      `SELECT order_id, COUNT(*) AS n FROM sticker_images GROUP BY order_id`,
    ).all();
    const nById = {};
    for (const r of counts.results || []) nById[r.order_id] = r.n;
    return json(
      { items: (results || []).map((r) => ({ ...r, images: nById[r.id] || 0 })) },
      200,
      cors,
    );
  }

  // ---- Admin: update order (status / fields) ----
  if (path === "/stickers/admin/update" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const id = sanitize(body.id, 40);
    if (!id) return json({ error: "id required" }, 400, cors);
    const existing = await env.DB.prepare(`SELECT * FROM sticker_orders WHERE id = ?`).bind(id).first();
    if (!existing) return json({ error: "Not found" }, 404, cors);
    const status = ["ordered", "generating", "ready", "shipped"].includes(body.status) ? body.status : existing.status;
    await env.DB.prepare(
      `UPDATE sticker_orders SET pet_name=?, owner=?, phone=?, email=?, address=?, pin=?, sheets=?, notes=?, status=?, updated_at=? WHERE id=?`,
    )
      .bind(
        body.petName != null ? sanitize(body.petName, 120) : existing.pet_name,
        body.owner != null ? sanitize(body.owner, 120) : existing.owner,
        body.phone != null ? sanitize(body.phone, 40) : existing.phone,
        body.email != null ? sanitize(body.email, 120) : existing.email,
        body.address != null ? sanitize(body.address, 400) : existing.address,
        body.pin != null ? sanitize(body.pin, 6) : existing.pin,
        body.sheets != null ? Math.min(6, Math.max(1, parseInt(body.sheets, 10) || 2)) : existing.sheets,
        body.notes != null ? sanitize(body.notes, 300) : existing.notes,
        status,
        new Date().toISOString(),
        id,
      )
      .run();
    return json({ ok: true }, 200, cors);
  }

  // ---- Admin: delete order (and its images) ----
  if (path === "/stickers/admin/delete" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const id = sanitize(body.id, 40);
    if (!id) return json({ error: "id required" }, 400, cors);
    await env.DB.prepare(`DELETE FROM sticker_images WHERE order_id = ?`).bind(id).run();
    const res = await env.DB.prepare(`DELETE FROM sticker_orders WHERE id = ?`).bind(id).run();
    if (!(res.meta && res.meta.changes)) return json({ error: "Not found" }, 404, cors);
    return json({ ok: true }, 200, cors);
  }

  // ---- Admin: live trends (debug/inspection) ----
  if (path === "/stickers/admin/trends" && request.method === "GET") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    const force = url.searchParams.get("force") === "1";
    const t = await getTrendsCached(env, force);
    return json({ ok: true, ...t }, 200, cors);
  }

  // ---- Admin: generate the 12 ChatGPT prompts from live trends ----
  if (path === "/stickers/admin/prompts" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body = {};
    try {
      body = await request.json();
    } catch { /* optional body */ }
    const id = sanitize(body.id, 40);
    let petName = sanitize(body.petName, 120);
    try {
      if (id && !petName) {
        await ensureTables(env);
        const row = await env.DB.prepare(`SELECT pet_name FROM sticker_orders WHERE id = ?`).bind(id).first();
        if (row) petName = row.pet_name || "";
      }
      const { trends, cached } = await getTrendsCached(env, body.force === true);
      const feed = Object.entries(trends)
        .map(([k, v]) => k.toUpperCase() + ":\n- " + v.join("\n- "))
        .join("\n\n");
      const ai = await env.AI.run(env.CHAT_MODEL, {
        messages: [
          { role: "system", content: PROMPT_SYSTEM },
          {
            role: "user",
            content:
              (petName ? `PET NAME: ${petName}\n\n` : "") +
              `LIVE TREND FEED (fetched ${cached ? "within the last 24h" : "just now"}, today is ${new Date().toDateString()}):\n\n${feed}`,
          },
        ],
        max_tokens: 3200,
        temperature: 0.8,
      });
      const prompts = (ai.response || (ai.result && ai.result.response) || "").trim();
      if (!prompts) return json({ error: "Empty model response" }, 502, cors);
      if (id) {
        await ensureTables(env);
        await env.DB.prepare(`UPDATE sticker_orders SET prompts=?, status='generating', updated_at=? WHERE id=?`)
          .bind(prompts, new Date().toISOString(), id)
          .run();
      }
      return json({ ok: true, prompts, trends, cached }, 200, cors);
    } catch (e) {
      return json({ error: "Prompt generation failed", detail: String(e).slice(0, 200) }, 502, cors);
    }
  }

  // ---- Admin: upload a generated sticker image for an order slot ----
  if (path === "/stickers/admin/upload" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const id = sanitize(body.id, 40);
    const idx = parseInt(body.idx, 10);
    const data = sanitize(body.data, MAX_PHOTO_CHARS);
    if (!id || !(idx >= 0 && idx < 12)) return json({ error: "id and idx (0-11) required" }, 400, cors);
    await ensureTables(env);
    const order = await env.DB.prepare(`SELECT id FROM sticker_orders WHERE id = ?`).bind(id).first();
    if (!order) return json({ error: "Order not found" }, 404, cors);
    if (!data) {
      await env.DB.prepare(`DELETE FROM sticker_images WHERE order_id = ? AND idx = ?`).bind(id, idx).run();
      return json({ ok: true, removed: true }, 200, cors);
    }
    await env.DB.prepare(
      `INSERT INTO sticker_images (order_id, idx, data, label) VALUES (?,?,?,?)
       ON CONFLICT(order_id, idx) DO UPDATE SET data = excluded.data, label = excluded.label`,
    )
      .bind(id, idx, data, sanitize(body.label, 120))
      .run();
    return json({ ok: true }, 200, cors);
  }

  // ---- Admin: fetch stored sticker images for an order ----
  if (path === "/stickers/admin/images" && request.method === "GET") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    const id = sanitize(url.searchParams.get("id") || "", 40);
    if (!id) return json({ error: "id required" }, 400, cors);
    await ensureTables(env);
    const { results } = await env.DB.prepare(
      `SELECT idx, data, label FROM sticker_images WHERE order_id = ? ORDER BY idx ASC`,
    )
      .bind(id)
      .all();
    return json({ ok: true, images: results || [] }, 200, cors);
  }

  return json({ error: "Not found" }, 404, cors);
}
