// Pet Aadhaar Card backend: D1-backed registry, unique IDs, admin auth.
// All responses reuse the CORS headers computed by the main worker.

const TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12h admin session
const MAX_PHOTO_CHARS = 700_000; // ~500 KB data URL ceiling

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

const enc = new TextEncoder();

function b64url(bytes) {
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(sig);
}

async function makeToken(email, secret) {
  const payload = b64url(enc.encode(JSON.stringify({ e: email, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })));
  const sig = await hmac(payload, secret);
  return `${payload}.${sig}`;
}

async function verifyToken(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if ((await hmac(payload, secret)) !== sig) return null;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

function randomSlug() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // no easily-confused chars
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  return [...arr].map((n) => alphabet[n % alphabet.length]).join("");
}

function randomPetNo() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let d = [...arr].map((n) => (n % 10).toString());
  if (d[0] === "0") d[0] = "2"; // keep a 12-digit look
  const s = d.join("");
  return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 12)}`;
}

function sanitize(v, max = 200) {
  return (v == null ? "" : String(v)).trim().slice(0, max);
}

function publicRecord(row) {
  return {
    id: row.id,
    petNo: row.pet_no,
    awb: row.awb || "",
    courier: row.courier || "",
    name: row.name,
    owner: row.owner,
    breed: row.breed,
    gender: row.gender,
    dob: row.dob,
    address: row.address,
    photo: row.photo,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function requireAdmin(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const data = await verifyToken(token, env.SESSION_SECRET || "");
  return data && data.e === (env.ADMIN_EMAIL || "") ? data : null;
}

// ---- Shiprocket integration (credentials live in worker secrets) ----
let srToken = null;
let srTokenAt = 0;

async function srAuth(env) {
  if (!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD) throw new Error("Shiprocket not configured");
  if (srToken && Date.now() - srTokenAt < 8 * 24 * 3600 * 1000) return srToken;
  const res = await fetch("https://apiv2.shiprocket.in/v1/external/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(`Shiprocket auth failed (${res.status})`);
  srToken = data.token;
  srTokenAt = Date.now();
  return srToken;
}

async function srFetch(env, path, opts = {}) {
  const token = await srAuth(env);
  const res = await fetch(`https://apiv2.shiprocket.in/v1/external${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

const PICKUP_PIN = "700122";
const PICKUP_LOCATION = "Emilys Pet Heaven";

function pinFrom(address) {
  const m = String(address || "").match(/\b[1-9][0-9]{5}\b/);
  return m ? m[0] : "";
}

async function pinLookup(pin) {
  try {
    const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const d = await r.json();
    const po = d && d[0] && d[0].PostOffice && d[0].PostOffice[0];
    return po ? { city: po.District, state: po.State } : null;
  } catch {
    return null;
  }
}

function phone10(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.slice(-10);
}

async function ensureShipColumns(env) {
  for (const col of ["sr_order_id TEXT", "sr_shipment_id TEXT", "awb TEXT", "courier TEXT"]) {
    try {
      await env.DB.prepare(`ALTER TABLE pets ADD COLUMN ${col}`).run();
    } catch {
      // column already exists
    }
  }
}

// ---- Off-Cloudflare backup: dump the whole table to a private GitHub repo ----
async function putGithubFile(repo, token, path, content, message) {
  const api = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "emilys-petcard-backup",
    "Content-Type": "application/json",
  };
  let sha;
  const cur = await fetch(api, { headers });
  if (cur.status === 200) sha = (await cur.json()).sha;
  const b64 = btoa(unescape(encodeURIComponent(content)));
  const body = { message, content: b64 };
  if (sha) body.sha = sha;
  const res = await fetch(api, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`GitHub PUT ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function runBackup(env) {
  if (!env.DB) throw new Error("DB not configured");
  if (!env.BACKUP_REPO || !env.GITHUB_BACKUP_TOKEN) throw new Error("Backup not configured");
  const { results } = await env.DB.prepare(`SELECT * FROM pets ORDER BY created_at ASC`).all();
  const now = new Date();
  const payload = { exportedAt: now.toISOString(), count: (results || []).length, records: results || [] };
  const content = JSON.stringify(payload, null, 2);
  const date = now.toISOString().slice(0, 10);
  const msg = `Backup ${now.toISOString()} (${payload.count} records)`;
  await putGithubFile(env.BACKUP_REPO, env.GITHUB_BACKUP_TOKEN, `backups/petcards-${date}.json`, content, msg);
  await putGithubFile(env.BACKUP_REPO, env.GITHUB_BACKUP_TOKEN, `backups/petcards-latest.json`, content, msg);
  return payload.count;
}

// Main entry: handle any /petcard/* route. Returns a Response, or null if the
// path is not a petcard route (so the caller can continue its own routing).
export async function handlePetcard(request, env, url, cors) {
  const path = url.pathname;
  if (!path.startsWith("/petcard")) return null;

  if (!env.DB) return json({ error: "Pet card storage not configured" }, 503, cors);

  // ---- Admin login ----
  if (path === "/petcard/admin/login" && request.method === "POST") {
    if (cors["Access-Control-Allow-Origin"] === undefined && request.headers.get("Origin")) {
      return json({ error: "Origin not allowed" }, 403, cors);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const email = sanitize(body.email, 120).toLowerCase();
    const password = sanitize(body.password, 200);
    const okEmail = email === (env.ADMIN_EMAIL || "").toLowerCase();
    const okPass = (await sha256hex(password)) === (env.ADMIN_PASSWORD_HASH || "");
    if (!okEmail || !okPass) return json({ error: "Invalid email or password" }, 401, cors);
    const token = await makeToken(env.ADMIN_EMAIL, env.SESSION_SECRET || "");
    return json({ token, ttl: TOKEN_TTL_SECONDS }, 200, cors);
  }

  // ---- Admin: create a card ----
  if (path === "/petcard/admin/create" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const name = sanitize(body.name, 120);
    if (!name) return json({ error: "Pet name is required" }, 400, cors);
    const photo = sanitize(body.photo, MAX_PHOTO_CHARS);
    const rec = {
      name,
      owner: sanitize(body.owner, 120),
      breed: sanitize(body.breed, 120),
      gender: sanitize(body.gender, 40),
      dob: sanitize(body.dob, 40),
      address: sanitize(body.address, 400),
      phone: sanitize(body.phone, 40),
      email: sanitize(body.email, 120),
      pack: body.pack === 2 || body.pack === "2" ? 2 : 1,
    };

    const now = new Date().toISOString();
    let lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      const id = randomSlug();
      const petNo = randomPetNo();
      try {
        await env.DB.prepare(
          `INSERT INTO pets (id, pet_no, name, owner, breed, gender, dob, address, photo, phone, email, pack, status, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'ordered', ?)`,
        )
          .bind(id, petNo, rec.name, rec.owner, rec.breed, rec.gender, rec.dob, rec.address, photo, rec.phone, rec.email, rec.pack, now)
          .run();
        return json({ id, petNo, createdAt: now }, 200, cors);
      } catch (e) {
        lastErr = e; // unique-constraint collision -> retry with new ids
      }
    }
    return json({ error: "Could not create card", detail: String(lastErr).slice(0, 200) }, 500, cors);
  }

  // ---- Admin: list / search ----
  if (path === "/petcard/admin/list" && request.method === "GET") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    const q = sanitize(url.searchParams.get("q") || "", 120);
    let stmt;
    if (q) {
      const like = `%${q}%`;
      stmt = env.DB.prepare(
        `SELECT * FROM pets WHERE name LIKE ? OR owner LIKE ? OR pet_no LIKE ? OR id LIKE ? OR phone LIKE ?
         ORDER BY created_at DESC LIMIT 200`,
      ).bind(like, like, like, like, like);
    } else {
      stmt = env.DB.prepare(`SELECT * FROM pets ORDER BY created_at DESC LIMIT 200`);
    }
    const { results } = await stmt.all();
    return json({ items: (results || []).map(publicRecord) }, 200, cors);
  }

  // ---- Admin: update (edit fields / mark shipped) ----
  if (path === "/petcard/admin/update" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const id = sanitize(body.id, 40);
    if (!id) return json({ error: "id required" }, 400, cors);
    const existing = await env.DB.prepare(`SELECT * FROM pets WHERE id = ?`).bind(id).first();
    if (!existing) return json({ error: "Not found" }, 404, cors);
    const merged = {
      name: body.name != null ? sanitize(body.name, 120) : existing.name,
      owner: body.owner != null ? sanitize(body.owner, 120) : existing.owner,
      breed: body.breed != null ? sanitize(body.breed, 120) : existing.breed,
      gender: body.gender != null ? sanitize(body.gender, 40) : existing.gender,
      dob: body.dob != null ? sanitize(body.dob, 40) : existing.dob,
      address: body.address != null ? sanitize(body.address, 400) : existing.address,
      phone: body.phone != null ? sanitize(body.phone, 40) : existing.phone,
      photo: body.photo != null ? sanitize(body.photo, MAX_PHOTO_CHARS) : existing.photo,
      status: body.status === "shipped" || body.status === "ordered" ? body.status : existing.status,
    };
    await env.DB.prepare(
      `UPDATE pets SET name=?, owner=?, breed=?, gender=?, dob=?, address=?, phone=?, photo=?, status=?, updated_at=? WHERE id=?`,
    )
      .bind(merged.name, merged.owner, merged.breed, merged.gender, merged.dob, merged.address, merged.phone, merged.photo, merged.status, new Date().toISOString(), id)
      .run();
    return json({ ok: true }, 200, cors);
  }

  // ---- Admin: delete a card ----
  if (path === "/petcard/admin/delete" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const id = sanitize(body.id, 40);
    if (!id) return json({ error: "id required" }, 400, cors);
    const res = await env.DB.prepare(`DELETE FROM pets WHERE id = ?`).bind(id).run();
    const deleted = res.meta && res.meta.changes ? res.meta.changes : 0;
    if (!deleted) return json({ error: "Not found" }, 404, cors);
    return json({ ok: true, deleted }, 200, cors);
  }

  // ---- Admin: full export (backup) ----
  if (path === "/petcard/admin/export" && request.method === "GET") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    const { results } = await env.DB.prepare(`SELECT * FROM pets ORDER BY created_at ASC`).all();
    return json({ ok: true, exportedAt: new Date().toISOString(), count: (results || []).length, records: results || [] }, 200, cors);
  }

  // ---- Admin: run a backup now (also runs daily via cron) ----
  if (path === "/petcard/admin/backup-now" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    try {
      const n = await runBackup(env);
      return json({ ok: true, backedUp: n }, 200, cors);
    } catch (e) {
      return json({ error: "Backup failed", detail: String(e).slice(0, 300) }, 500, cors);
    }
  }

  // ---- Public: shipping cost for a PIN code (rounded, cached, rate-limited) ----
  if (path === "/petcard/shiprate" && request.method === "GET") {
    const pin = sanitize(url.searchParams.get("pin"), 6);
    if (!/^[1-9][0-9]{5}$/.test(pin)) return json({ error: "Invalid PIN" }, 400, cors);
    const cache = caches.default;
    const cacheKey = new Request("https://petcard.cache/shiprate/" + pin);
    const hit = await cache.match(cacheKey);
    if (hit) {
      const cached = await hit.json();
      return json(cached, 200, cors);
    }
    const ip = request.headers.get("CF-Connecting-IP") || "?";
    const now = Date.now();
    globalThis.__rateHits = globalThis.__rateHits || new Map();
    const hits = (globalThis.__rateHits.get(ip) || []).filter((t) => now - t < 60000);
    if (hits.length >= 10) return json({ error: "Too many requests — try again in a minute" }, 429, cors);
    hits.push(now);
    globalThis.__rateHits.set(ip, hits);
    try {
      const r = await srFetch(env, `/courier/serviceability/?pickup_postcode=${PICKUP_PIN}&delivery_postcode=${pin}&weight=0.05&cod=0`);
      const list = (r.body.data && r.body.data.available_courier_companies) || [];
      if (!list.length) return json({ error: "Delivery not available for this PIN" }, 404, cors);
      const cheapest = list.reduce((a, b) => (a.rate <= b.rate ? a : b));
      const shipping = Math.ceil(cheapest.rate / 5) * 5;
      const out = { ok: true, pin, shipping, etd: cheapest.etd || "", days: cheapest.estimated_delivery_days || "" };
      await cache.put(cacheKey, new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=21600" } }));
      return json(out, 200, cors);
    } catch (e) {
      return json({ error: String(e.message || e).slice(0, 200) }, 502, cors);
    }
  }

  // ---- Admin: Shiprocket courier rates for an order ----
  if (path === "/petcard/admin/ship/rates" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const id = sanitize(body.id, 40);
    const row = await env.DB.prepare(`SELECT * FROM pets WHERE id = ?`).bind(id).first();
    if (!row) return json({ error: "Not found" }, 404, cors);
    const pin = sanitize(body.pin, 6) || pinFrom(row.address);
    if (!pin) return json({ error: "No PIN code — pass one", needPin: true }, 400, cors);
    try {
      const r = await srFetch(env, `/courier/serviceability/?pickup_postcode=${PICKUP_PIN}&delivery_postcode=${pin}&weight=0.05&cod=0`);
      const list = ((r.body.data && r.body.data.available_courier_companies) || [])
        .map((c) => ({ id: c.courier_company_id, name: c.courier_name, rate: c.rate, etd: c.etd, days: c.estimated_delivery_days }))
        .sort((a, b) => a.rate - b.rate)
        .slice(0, 8);
      return json({ ok: true, pin, couriers: list }, 200, cors);
    } catch (e) {
      return json({ error: String(e.message || e).slice(0, 200) }, 502, cors);
    }
  }

  // ---- Admin: create Shiprocket shipment (order + AWB + pickup) ----
  if (path === "/petcard/admin/ship/create" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const id = sanitize(body.id, 40);
    const row = await env.DB.prepare(`SELECT * FROM pets WHERE id = ?`).bind(id).first();
    if (!row) return json({ error: "Not found" }, 404, cors);
    const shipAddress = sanitize(body.address, 300) || sanitize(row.address, 300);
    const shipName = sanitize(body.name, 80) || String(row.owner || "Pet Owner");
    const pin = sanitize(body.pin, 6) || pinFrom(shipAddress);
    if (!pin) return json({ error: "No PIN code — pass one", needPin: true }, 400, cors);
    const phone = phone10(sanitize(body.phone, 20) || row.phone);
    if (phone.length !== 10) return json({ error: "No valid 10-digit phone" }, 400, cors);
    if (!shipAddress) return json({ error: "No delivery address" }, 400, cors);
    const pack = Math.max(1, parseInt(body.pack, 10) || row.pack || 1);
    const amount = 199 + (pack - 1) * 150 + 49;
    const loc = (await pinLookup(pin)) || { city: "", state: "" };
    const ownerParts = String(shipName).trim().split(/\s+/);
    try {
      await ensureShipColumns(env);
      // Reuse an existing Shiprocket order awaiting AWB (e.g. wallet was low) instead of duplicating it.
      let shipmentId = !row.awb && row.sr_shipment_id ? row.sr_shipment_id : null;
      let srOrderId = shipmentId ? row.sr_order_id : null;
      const reused = !!shipmentId;
      if (!shipmentId) {
      const orderId = `PET-${String(row.pet_no).replace(/\s/g, "")}-${Date.now().toString().slice(-5)}`;
      const now = new Date();
      const orderRes = await srFetch(env, "/orders/create/adhoc", {
        method: "POST",
        body: JSON.stringify({
          order_id: orderId,
          order_date: now.toISOString().slice(0, 10) + " " + now.toISOString().slice(11, 16),
          pickup_location: PICKUP_LOCATION,
          billing_customer_name: ownerParts[0],
          billing_last_name: ownerParts.slice(1).join(" ") || ".",
          billing_address: shipAddress,
          billing_city: loc.city || "India",
          billing_pincode: pin,
          billing_state: loc.state || "India",
          billing_country: "India",
          billing_email: row.email || "contact@emilyspetheaven.com",
          billing_phone: phone,
          shipping_is_billing: true,
          order_items: [{ name: "Pet ID Card (laminated)", sku: "PETCARD", units: pack, selling_price: Math.round((amount - 49) / pack) }],
          payment_method: "Prepaid",
          shipping_charges: 49,
          sub_total: amount - 49,
          length: 32,
          breadth: 24,
          height: 1,
          weight: 0.05,
        }),
      });
      shipmentId = orderRes.body.shipment_id;
      if (!orderRes.ok || !shipmentId) {
        return json({ error: "Order create failed", detail: JSON.stringify(orderRes.body).slice(0, 300) }, 502, cors);
      }
      srOrderId = String(orderRes.body.order_id || orderId);
      }
      const awbRes = await srFetch(env, "/courier/assign/awb", {
        method: "POST",
        body: JSON.stringify(body.courierId ? { shipment_id: shipmentId, courier_id: body.courierId } : { shipment_id: shipmentId }),
      });
      const awbData = (awbRes.body.response && awbRes.body.response.data) || {};
      const awb = awbData.awb_code || "";
      const courier = awbData.courier_name || "";
      let pickup = null;
      if (awb) {
        const pk = await srFetch(env, "/courier/generate/pickup", {
          method: "POST",
          body: JSON.stringify({ shipment_id: [shipmentId] }),
        });
        pickup = pk.body && (pk.body.response || pk.body.message || null);
      }
      await env.DB.prepare(`UPDATE pets SET sr_order_id=?, sr_shipment_id=?, awb=?, courier=?, status='shipped', updated_at=? WHERE id=?`)
        .bind(String(srOrderId), String(shipmentId), awb, courier, new Date().toISOString(), id)
        .run();
      return json(
        {
          ok: true,
          reused,
          orderId: srOrderId,
          shipmentId,
          awb,
          courier,
          pickup,
          awbError: awb ? undefined : JSON.stringify(awbRes.body).slice(0, 300),
          tracking: awb ? `https://shiprocket.co/tracking/${awb}` : "",
        },
        200,
        cors,
      );
    } catch (e) {
      return json({ error: String(e.message || e).slice(0, 200) }, 502, cors);
    }
  }

  // ---- Admin: official Shiprocket label PDF for a shipment ----
  if (path === "/petcard/admin/ship/label" && request.method === "POST") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, cors);
    }
    const id = sanitize(body.id, 40);
    const row = await env.DB.prepare(`SELECT * FROM pets WHERE id = ?`).bind(id).first();
    if (!row) return json({ error: "Not found" }, 404, cors);
    if (!row.sr_shipment_id) return json({ error: "No Shiprocket shipment for this order", noShipment: true }, 400, cors);
    try {
      const r = await srFetch(env, "/courier/generate/label", {
        method: "POST",
        body: JSON.stringify({ shipment_id: [Number(row.sr_shipment_id) || row.sr_shipment_id] }),
      });
      const labelUrl = r.body.label_url || "";
      if (!r.ok || !labelUrl) return json({ error: "Label not ready", detail: JSON.stringify(r.body).slice(0, 300) }, 502, cors);
      if (body.raw) {
        const pdfRes = await fetch(labelUrl);
        if (!pdfRes.ok) return json({ error: "Label fetch failed" }, 502, cors);
        return new Response(pdfRes.body, { status: 200, headers: { ...cors, "Content-Type": "application/pdf" } });
      }
      return json({ ok: true, labelUrl }, 200, cors);
    } catch (e) {
      return json({ error: String(e.message || e).slice(0, 200) }, 502, cors);
    }
  }

  // ---- Admin: track a Shiprocket shipment ----
  if (path === "/petcard/admin/ship/track" && request.method === "GET") {
    if (!(await requireAdmin(request, env))) return json({ error: "Unauthorized" }, 401, cors);
    const awb = sanitize(url.searchParams.get("awb") || "", 40);
    if (!awb) return json({ error: "awb required" }, 400, cors);
    try {
      const r = await srFetch(env, `/courier/track/awb/${encodeURIComponent(awb)}`);
      const td = r.body.tracking_data || {};
      const latest = (td.shipment_track && td.shipment_track[0]) || {};
      return json(
        { ok: true, status: latest.current_status || td.shipment_status || "", destination: latest.destination || "", edd: latest.edd || "", activities: (td.shipment_track_activities || []).slice(0, 6) },
        200,
        cors,
      );
    } catch (e) {
      return json({ error: String(e.message || e).slice(0, 200) }, 502, cors);
    }
  }

  // ---- Public: fetch a card for the verification page ----
  // /petcard/p/<id>
  const pub = path.match(/^\/petcard\/p\/([A-Za-z0-9]+)$/);
  if (pub && request.method === "GET") {
    const id = pub[1];
    const row = await env.DB.prepare(`SELECT * FROM pets WHERE id = ?`).bind(id).first();
    if (!row) return json({ error: "Card not found" }, 404, cors);
    return json({ card: publicRecord(row) }, 200, cors);
  }

  return json({ error: "Not found" }, 404, cors);
}
