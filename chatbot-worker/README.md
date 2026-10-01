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

## Claude (issues #69, #70)

Both the chatbot and the plant care calendar (`mode: "care"`) use **Claude**
when the Worker has an Anthropic API key, and Workers AI (Llama) otherwise. The
key is a Worker **secret** — never in the repo:

```sh
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key at the prompt
npx wrangler deploy
```

Models are `CHAT_MODEL` (`claude-sonnet-5-5` — the math is done in code, so the
model is mostly reading rows back) and `CARE_MODEL` (`claude-opus-5-5` — species
knowledge matters) in `wrangler.toml`. Sonnet is about half the price of Opus;
cached reads cost the same on both.

- **Chatbot:** the full sheet data goes in the system prompt (Claude's 1M
  context makes the old 24k overflow moot) with prompt caching, so follow-up
  questions within ~5 minutes re-read it at ~5% of the price. Effort is `low`
  — these are lookups. Roughly a dime for the first question, a cent after.
- **Care calendar:** structured outputs guarantee the JSON shape; the Worker
  still validates every field.

## Notes

- **Fallback model (no API key):** `@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
  24k context — the dataset has outgrown it (issue #70), so without a key the
  chatbot will error on large sheets. `@cf/openai/gpt-oss-120b` (128k) is the
  Workers AI alternative if you ever drop the key.
- **Data:** all sheets are already public (read via CSV export). The Worker
  holds no secrets, so its source can live in the repo safely.
- **CORS:** allowed origins are listed in `ALLOW_ORIGINS` in `src/index.js`
  (satownsend.com, the github.io domain, and localhost for testing).
