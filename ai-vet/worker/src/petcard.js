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
        `SELECT id, pet_no, name, owner, breed, gender, dob, address, photo, phone, status, created_at
         FROM pets WHERE name LIKE ? OR owner LIKE ? OR pet_no LIKE ? OR id LIKE ? OR phone LIKE ?
         ORDER BY created_at DESC LIMIT 200`,
      ).bind(like, like, like, like, like);
    } else {
      stmt = env.DB.prepare(
        `SELECT id, pet_no, name, owner, breed, gender, dob, address, photo, phone, status, created_at
         FROM pets ORDER BY created_at DESC LIMIT 200`,
      );
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
