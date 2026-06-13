# AI Vet — Emily's Pet Heaven

A free, multilingual (English / हिंदी / বাংলা) "AI Vet" chat assistant for
emilyspetheaven.com. It answers general pet-care questions and questions about
Emily's Pet Heaven's services, prices, hours and location. Every reply opens
with a disclaimer that it is an AI (not a real vet) and gives general advice
only, and clear emergencies are escalated to "see a vet immediately" with the
24/7 phone number.

## How it works

```
Static site (GitHub Pages)            Cloudflare Worker (free)
┌───────────────────────┐  POST /chat ┌────────────────────────────────┐
│ js/ai-vet-widget.js    │ ──────────▶ │ 1. embed question (bge-m3)      │
│  floating chat bubble  │            │ 2. retrieve top KB chunks (RAG)│
│                        │ ◀────────── │ 3. Llama 4 Scout + guardrails  │
└───────────────────────┘   reply     └────────────────────────────────┘
```

- **Frontend:** `js/ai-vet-widget.js` is a self-contained widget loaded on every
  page via `<script src="js/ai-vet-widget.js" defer></script>`. No build step,
  no dependencies, no change to hosting/DNS.
- **Backend:** a Cloudflare Worker (this `worker/` folder) running on Cloudflare
  Workers AI (free tier). It does in-Worker RAG: a small knowledge base
  (`kb/kb.json`) is embedded once with `@cf/baai/bge-m3`
  (`worker/src/kb-embeddings.json`), and at query time the Worker picks the most
  relevant chunks by cosine similarity and feeds them to
  `@cf/meta/llama-4-scout-17b-16e-instruct`.
- **Guardrails:** reply in the user's language, mandatory AI disclaimer,
  no diagnosis/dosage, emergency triage, and prices/hours answered only from the
  knowledge base.

## Knowledge base

Edit `kb/kb.json` (array of `{ "id", "text" }` chunks), then regenerate
embeddings:

```bash
CF_ACCOUNT=<cloudflare-account-id> CF_TOKEN=<cloudflare-api-token> \
  node ai-vet/scripts/build-embeddings.mjs
```

This rewrites `worker/src/kb-embeddings.json`. Redeploy the worker afterwards.

## Deploy the worker

```bash
cd ai-vet/worker
npm install
export CLOUDFLARE_API_TOKEN=<token-with-Workers-AI-+-Workers-Scripts-edit>
export CLOUDFLARE_ACCOUNT_ID=<cloudflare-account-id>
npx wrangler deploy
```

The account ID and API token are **never** stored in this repo — they are passed
via environment variables at deploy time. Current deployment:
`https://emilys-ai-vet.emilys-pet-heaven.workers.dev` (health check at `/health`).

If you change the worker URL, update `ENDPOINT` at the top of
`js/ai-vet-widget.js`.
