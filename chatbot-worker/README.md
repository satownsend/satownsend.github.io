# satownsend.com chatbot Worker (issue #48)

A tiny Cloudflare Worker that answers questions about the dashboards' data
using **Cloudflare Workers AI** (no API keys — runs on your Cloudflare account,
free tier is 10,000 Neurons/day, which easily covers personal use).

The browser (`/shared/chat.js`) POSTs `{ messages: [...] }`; the Worker fetches
the public Google Sheets, stuffs them into the prompt, calls the model, and
returns `{ answer }`.

## Deploy (one time)

From this folder:

```sh
npm install -g wrangler      # or use: npx wrangler ...
wrangler login               # opens a browser to authorize your Cloudflare account
wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.:

```
https://satownsend-chatbot.<your-subdomain>.workers.dev
```

## Wire it up

Put that URL into `CHAT_WORKER_URL` at the top of `/shared/chat.js` and push.
Until it's set, the chat panel shows a "not configured yet" note.

## Notes

- **Model:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (24k context — the whole
  dataset is ~8k tokens, so everything fits). To use a stronger model, change
  `MODEL` in `src/index.js` to `@cf/openai/gpt-oss-120b` (128k context) and
  redeploy.
- **Cost:** ~450–900 Neurons per question → roughly 10–20 free questions/day on
  the free tier; overages are ~$0.011 / 1,000 Neurons (pennies).
- **Data:** all sheets are already public (read via CSV export). The Worker
  holds no secrets, so its source can live in the repo safely.
- **CORS:** allowed origins are listed in `ALLOW_ORIGINS` in `src/index.js`
  (satownsend.com, the github.io domain, and localhost for testing).
