# satownsend.com chatbot Worker (issue #48)

A tiny Cloudflare Worker that answers questions about the dashboards' data
using **Cloudflare Workers AI** (no API keys — runs on your Cloudflare account,
free tier is 10,000 Neurons/day, which easily covers personal use).

The browser (`/shared/chat.js`) POSTs `{ messages: [...] }`; the Worker fetches
the public Google Sheets, stuffs them into the prompt, calls the model, and
returns `{ answer }`.

## Automatic deployment

The existing `satownsend-chatbot` Worker is connected to `satownsend/satownsend.github.io` through Cloudflare Workers Builds. Pushes to `main` trigger production deployment, with root directory `chatbot-worker`, no build command, and deploy command `npx wrangler deploy`. Preview builds are disabled. Existing runtime secrets and the AI binding remain on the Worker. No local Node.js installation is needed for this flow.

Inspect build and deployment status in Cloudflare → satownsend-chatbot → Deployments / Settings → Builds. GitHub Pages hosts the site separately; Cloudflare builds deploy the chatbot.

## Manual deployment (optional)

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

## Weather context (#132)

Weather-related conversations (including the retained follow-up messages) load read-only context on the Worker, so questions work from any site page:

- NWS daily temperatures, with Open-Meteo fallback and supplemental precipitation/gusts; Open-Meteo supplies the next 48 hourly samples.
- Official NWS alerts are fetched independently of either forecast.
- The prior seven complete Lilly-local calendar days of Open-Meteo modeled precipitation, with complete-only three-/seven-day totals.
- The existing `weather_history` sheet, including chunked payload reassembly. Context includes up to 90 unique pre-day forecast dates and 12 recent snapshot summaries, with original units and capture times. Only Lilly snapshots are selected; each date uses the latest capture before that date in America/New_York, matching the current site's calendar rule. Repeated captures are not counted as events.

Current values use °F, inches and mph; saved records retain explicit original units. Missing data stays null. Provider requests time out independently and may cache for five minutes. `retrievedAt` is the context-read time, not a model issuance time. Retrieval is independent of the dashboard browser's one-hour cache, so small differences are possible. The shared archive read is limited to 3 MB; oversized or unavailable history is labeled unavailable instead of being partially parsed. Browser-only pending captures are not visible until synced.

This does not provide observed temperatures, soil moisture, or proof of an actual frost. Historical precipitation is modeled, while saved history contains predictions as seen at capture time. Assistant instructions distinguish these from logged events, forbid deducing a frost from average seasonal dates, and do not treat estimated rain as a watering action. Text in source data is not an instruction. Non-weather questions avoid the extra provider calls. No new service account, scheduled collector, archive writes or paid weather API is introduced.

**Activation:** merges to `main` now trigger the connected Cloudflare build. Verify the build and deployment succeed before expecting the live chatbot to use the new code. GitHub Pages deployment alone does not deploy Worker changes. Keep existing bindings, model variables and secrets. No secret values need to be changed or posted. The existing Google sign-in gate remains in place. PR #113's scheduled collector stays deferred and unrelated.

Validation: syntax/whitespace checks and a live read-only loader call against providers and the shared archive; no AI inference was called. No tests written or run. An authenticated end-to-end chatbot reply requires redeploying the Worker and was not exercised before merge.
