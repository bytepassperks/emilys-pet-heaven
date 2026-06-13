import KB from "./kb-embeddings.json";

const TOP_K = 5;
const MIN_SCORE = 0.3;
const MAX_MESSAGE_CHARS = 1200;
const MAX_HISTORY = 6;

const SYSTEM_TEMPLATE = `You are "AI Vet", the friendly assistant on the website of Emily's Pet Heaven, a pet boarding, grooming and pet-care business in Barrackpore, Kolkata, India. You help pet owners with general guidance about dogs and cats, and answer questions about Emily's Pet Heaven's services, prices, hours and location.

STRICT RULES:
1. ALWAYS reply in the SAME language the user wrote in (English, Hindi, Bengali, or Hinglish). Match their script.
2. Begin EVERY reply with a one-line disclaimer, in the user's language, that you are an AI assistant, not a real veterinarian, and this is general advice only.
3. Never give exact medicine names, dosages, or a definitive medical diagnosis. Give general care guidance only.
4. If the situation sounds serious or like an emergency (e.g. trouble breathing, collapse, seizures, suspected poisoning, bloated/hard abdomen, repeated vomiting or vomiting blood, heavy bleeding, unable to urinate, pale gums, sudden severe weakness), tell them to see a vet immediately and that they can call Emily's Pet Heaven 24/7 at +91 6363590332.
5. For questions about services, prices, timings, location, booking or policies, use ONLY the CONTEXT below. If the answer is not in the CONTEXT, say you are not sure and suggest contacting +91 6363590332 (call/WhatsApp). Never invent prices.
6. Keep answers concise, warm and practical, and gently remind them to confirm with a real vet for anything important.

CONTEXT (Emily's Pet Heaven knowledge base):
{{CONTEXT}}`;

function corsHeaders(origin, allowed) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && (allowed.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function detectLang(text) {
  if (/[\u0980-\u09FF]/.test(text)) return "Bengali (বাংলা)";
  if (/[\u0900-\u097F]/.test(text)) return "Hindi (हिंदी)";
  return "English";
}

function cosine(a, b) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embed(env, text) {
  const res = await env.AI.run(env.EMBED_MODEL, { text: [text] });
  const data = res.data || (res.result && res.result.data);
  return data[0];
}

function retrieve(queryVec) {
  return KB.map((c) => ({ id: c.id, text: c.text, score: cosine(queryVec, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .filter((c, i) => i < TOP_K && c.score >= MIN_SCORE);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/health" || url.pathname === "/") {
      return json({ ok: true, service: "Emily's Pet Heaven AI Vet", chunks: KB.length }, 200, cors);
    }

    if (url.pathname === "/chat" && request.method === "POST") {
      if (origin && !cors["Access-Control-Allow-Origin"]) {
        return json({ error: "Origin not allowed" }, 403, cors);
      }
      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: "Invalid JSON" }, 400, cors);
      }
      const message = (payload.message || "").toString().trim();
      if (!message) return json({ error: "Empty message" }, 400, cors);
      if (message.length > MAX_MESSAGE_CHARS)
        return json({ error: "Message too long" }, 413, cors);

      const history = Array.isArray(payload.history)
        ? payload.history
            .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
            .slice(-MAX_HISTORY)
            .map((m) => ({ role: m.role, content: m.content.toString().slice(0, MAX_MESSAGE_CHARS) }))
        : [];

      try {
        const queryVec = await embed(env, message);
        const hits = retrieve(queryVec);
        const context = hits.length
          ? hits.map((h) => `- ${h.text}`).join("\n")
          : "(No specific business info matched. Answer general pet-care questions normally and, for business-specific questions, suggest calling +91 6363590332.)";

        const lang = detectLang(message);
        const langDirective =
          `IMPORTANT: The user's message is written in ${lang}. Write your ENTIRE reply, ` +
          `including the opening disclaimer, in ${lang} only. Do not switch to any other language.`;

        const messages = [
          { role: "system", content: SYSTEM_TEMPLATE.replace("{{CONTEXT}}", context) },
          ...history,
          { role: "user", content: message },
          { role: "system", content: langDirective },
        ];

        const ai = await env.AI.run(env.CHAT_MODEL, {
          messages,
          max_tokens: 700,
          temperature: 0.3,
        });
        const reply = (ai.response || (ai.result && ai.result.response) || "").trim();
        if (!reply) return json({ error: "Empty model response" }, 502, cors);

        return json({ reply, sources: hits.map((h) => h.id) }, 200, cors);
      } catch (err) {
        return json({ error: "AI request failed", detail: String(err).slice(0, 200) }, 502, cors);
      }
    }

    return json({ error: "Not found" }, 404, cors);
  },
};
