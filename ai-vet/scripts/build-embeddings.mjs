// Precomputes bge-m3 embeddings for every KB chunk and writes them into the
// Worker bundle (worker/src/kb-embeddings.json). Run once whenever kb.json changes:
//   CF_ACCOUNT=... CF_TOKEN=... node ai-vet/scripts/build-embeddings.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACCOUNT = process.env.CF_ACCOUNT;
const TOKEN = process.env.CF_TOKEN;
const EMBED_MODEL = "@cf/baai/bge-m3";
if (!ACCOUNT || !TOKEN) throw new Error("Set CF_ACCOUNT and CF_TOKEN env vars");

const kb = JSON.parse(readFileSync(join(__dirname, "../kb/kb.json"), "utf8"));

async function embed(texts) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${EMBED_MODEL}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts }),
  });
  const json = await res.json();
  if (!json.success) throw new Error("Embed failed: " + JSON.stringify(json.errors));
  return json.result.data;
}

const round = (v) => Math.round(v * 100000) / 100000;

const vectors = await embed(kb.map((c) => c.text));
const out = kb.map((c, i) => ({ id: c.id, text: c.text, embedding: vectors[i].map(round) }));

const outPath = join(__dirname, "../worker/src/kb-embeddings.json");
writeFileSync(outPath, JSON.stringify(out));
console.log(`Wrote ${out.length} chunks, dim=${out[0].embedding.length} -> ${outPath}`);
