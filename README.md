# satownsend.com

Personal dashboards for the things we grow, brew, and track — a set of
**plants**, **beer**, **instruments**, and **wildlife** trackers, plus a home
page that ties them together.

Live at **[satownsend.com](https://satownsend.com)**.

It's a **static site on GitHub Pages** with no build step: each page is a single
hand-written HTML file. All the "backend" is off-the-shelf services —
**Google Sheets** for data, **Cloudflare R2** for photos/videos, and a small
**Cloudflare Worker** for the chatbot. Anyone can view the dashboards read-only;
signing in with Google unlocks editing.

---

## The dashboards

Each dashboard is a filterable, sortable table with a detail view, a rotating
photo gallery, stats/charts, and photo upload. All four share the same look,
theming, navigation, auth, and photo pipeline.

| Page | What it tracks | Highlights |
|------|----------------|------------|
| **[Plants](https://satownsend.com/plants)** | Yard/garden inventory | Care log, watering/feeding, weather forecast + frost alerts, yard map with pins, spend & acquisition stats, per-plant thumbnails |
| **[Beer](https://satownsend.com/beer)** | Homebrew log | Recipes (grain/hop/yeast bills), fermentation temps, OG/FG/ABV/SRM, tasting notes, **label thumbnail** per brew |
| **[Instruments](https://satownsend.com/instruments)** | Instrument collection | Maintenance log (string changes, setups), string/pickup specs, value stats (hidden unless signed in) |
| **[Wildlife](https://satownsend.com/wildlife)** | Sighting log | One row per species (grouped sightings), calendar view, seasonal patterns, life list, first-of-year tracking, **photo _and_ video** support |
| **[Photography](https://satownsend.com/photography)** | Photo wall | Standalone photos (a photo _is_ the record) in a masonry wall, category chips (astro/landscape/trips/misc/Puck + auto-discovered), full-screen slideshow, larger/less-compressed uploads |
| **[Home](https://satownsend.com)** | Hub | Live stat cards per section, a **combined slideshow** of photos from every dashboard, and the [chatbot](#the-chatbot) |

Shared per-dashboard features:

- **Photo/video gallery** — a crossfade slideshow; click a photo to open a
  lightbox (caption, delete, set-as-thumbnail, hide-from-slideshow, feature-on-homepage).
- **Capture-date detection** — uploaded photos/videos use their EXIF /
  file-modified date, not the upload date.
- **Column show/hide**, search, sort, and category filters on every table.
- **Themes** — six color themes (`data-theme`), remembered per browser.
- **Mobile-friendly** — tables collapse to cards; the nav becomes a dropdown.

---

## How it works

```
Browser (static HTML/JS)
├── reads data     ──► Google Sheets (public CSV export)         no login needed
├── writes data    ──► Google Sheets API v4                      requires Google login
├── photos/videos  ──► Cloudflare R2 (S3 API, signed in-browser) requires R2 creds
└── chatbot        ──► Cloudflare Worker ──► Workers AI (LLM)    requires Google login
```

### Data — Google Sheets

Each dashboard is backed by one Google Spreadsheet with a tab per entity
(e.g. plants has `plants`, `plant_tags`, `plant_photos`, `log`). Sheet IDs and
tab GIDs are constants at the top of each page's `<script>`.

- **Reading** uses the public CSV export (`/export?format=csv&gid=…`), so the
  dashboards work for anyone with **no login**. The sheets are shared
  "anyone with the link → viewer".
- **Writing** (add/edit/delete rows) uses the **Google Sheets API v4** with the
  signed-in user's token.

> ⚠️ **Footgun guarded:** Google's CSV endpoint intermittently returns an empty
> body or HTTP 500. The plants dashboard's sync guards against adopting an empty
> read and against pushing an empty state, so a transient blip can never wipe the
> sheet. (See the guards in `plants/index.html`.)

### Auth — Google OAuth (`shared/gauth.js`)

- One shared module gives **one login across all dashboards** — the token is
  stored under a single origin-wide key, so signing in on any page signs you
  into all of them.
- Uses the OAuth **implicit flow**. When a token expires but you're still logged
  into Google, a top-level `prompt=none` redirect **silently renews** it (a brief
  redirect, no click). Public visitors are never redirected.
- True background renewal isn't possible on a static site (no refresh token), so
  the redirect is the best available; the trade-off is a ~1s flash on renewal.

### Photos & videos — Cloudflare R2 (`plant-photos` bucket)

- Uploads are signed **in the browser with AWS SigV4** (R2 is S3-compatible) and
  served from R2's public URL. Images are resized and HEIC-converted before
  upload; videos are uploaded as-is.
- **R2 credential vault:** rather than re-entering R2 keys on every device, they
  live in a **private Google Sheet** the app auto-creates. Signing in with Google
  auto-loads them (the vault's id is stored in a `config` tab of the main sheet;
  the id isn't a secret, but the vault itself is private). See issue #47.
- Note: the R2 secret still reaches the browser to sign uploads (same exposure as
  before, just no retyping). Moving that behind a Worker is tracked in issue #49.

### The chatbot (`shared/chat.js` + `chatbot-worker/`)

A floating **"Ask"** widget on every page answers natural-language questions
about your data ("What have I spent on plants?", "When did I last change strings
on my Warmoth bass?", "Frost?").

- A **Cloudflare Worker** (`chatbot-worker/`) fetches the sheets, computes exact
  aggregates (counts/sums/averages) **in code** so numbers match the dashboards,
  stuffs the data into the prompt, and calls **Cloudflare Workers AI**
  (Llama 3.3 70B — no API keys, free tier).
- **Owner-only:** the button only shows when signed in, and the Worker verifies
  your Google token before answering (401 otherwise) — this keeps the
  signed-in-only instrument prices private.
- The panel shows which model is answering, fetched from the Worker.

Deploy/redeploy instructions for the Worker are in
[`chatbot-worker/README.md`](chatbot-worker/README.md).

### Shared front-end (`shared/`)

| File | Role |
|------|------|
| `styles.css` | Theme system (CSS variables + `data-theme`) and shared component styles |
| `nav.js` | The cross-page dropdown menu (mounts into `<div id="siteNav">`) |
| `gauth.js` | Shared Google login + silent renewal (`window.GAuth`) |
| `chat.js` | The floating chatbot widget |

Each is a self-contained script included with `<script defer src="/shared/…">`.

### Analytics

Google Analytics 4 (`G-SSCCK0JXVB`) is loaded in the `<head>` of every page.

---

## Repo layout

```
.
├── index.html            # home page (stat cards + combined slideshow + chatbot)
├── plants/index.html     # plants dashboard
├── beer/index.html       # beer dashboard
├── instruments/index.html
├── wildlife/index.html
├── photography/index.html # photo wall (standalone photos, read by tab name)
├── shared/
│   ├── styles.css        # themes + shared component styles
│   ├── nav.js            # cross-page dropdown menu
│   ├── gauth.js          # shared Google auth
│   └── chat.js           # chatbot widget
├── chatbot-worker/       # Cloudflare Worker for the chatbot (deployed separately)
│   ├── src/index.js
│   ├── wrangler.toml
│   └── README.md         # deploy instructions
└── CNAME                 # custom domain (satownsend.com)
```

---

## Running & deploying

**Locally:** it's plain static files — serve the folder with any static server
and open the pages:

```sh
python3 -m http.server 8090   # then visit http://localhost:8090
```

Editing/photo-upload/chatbot won't work against `localhost` unless the relevant
service allows that origin (the chatbot Worker's CORS list already includes
`http://localhost:8090`).

**Production:** the repo is served by **GitHub Pages** at the `satownsend.com`
custom domain (see `CNAME`). Push to the default branch and Pages redeploys.
Note that Pages/CDN caches static assets, so a changed `shared/*.js` or
`styles.css` can take a few minutes (or a hard refresh) to appear.

---

## Configuration reference

These IDs live in the page source (the site is public, so none are secrets):

- **Google OAuth client:** `936411146633-…apps.googleusercontent.com`, scope
  `…/auth/spreadsheets`. Authorized redirect URIs must include each dashboard path.
- **Cloudflare R2:** bucket `plant-photos`, public host `pub-…r2.dev`. The R2
  access key/secret are **never** in the repo — they're entered once and stored
  in the private vault sheet.
- **Chatbot Worker:** `satownsend-chatbot.satownsend.workers.dev` (set as
  `CHAT_WORKER_URL` in `shared/chat.js`).
- **Photography sheet:** each dashboard hardcodes its own Google Sheet id. The
  photography dashboard's id goes in two places — `PHOTO_SHEET_ID` in
  `photography/index.html` and `PHOTOGRAPHY_SHEET` in `index.html` (for the
  homepage card + slideshow). Unlike the others it reads its `photos` tab **by
  name** (gviz), so there's no gid to configure; the tab is auto-created on the
  first upload.

## Notes for future changes

- **Keep the chatbot's numbers in sync with the dashboards.** Aggregates are
  computed in `chatbot-worker/src/index.js` (`computeTotals`) to match each
  dashboard's definition (e.g. plant spend = price × quantity, reported as the
  year-attributed total so it matches the chart). If a dashboard changes how it
  computes a stat, update the Worker too.
- **Frost dates are duplicated.** The frost planning dates + location live in the
  plants app config *and* in the Worker's reference block (they're not in a
  sheet). Change both if they ever change.
