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
| **[Plants](https://satownsend.com/plants)** | Yard/garden inventory | Care log, watering/feeding, weather forecast + frost alerts, yard map with pins, spend & acquisition stats, per-plant thumbnails, an AI-generated **care calendar** (Dashboard / Care calendar tabs) and an **AI overview** per plant (size, sun, soil, issues) |
| **[Beer](https://satownsend.com/beer)** | Homebrew log | Recipes (grain/hop/yeast bills), fermentation temps, OG/FG/ABV/SRM, tasting notes, **label thumbnail** per brew |
| **[Instruments](https://satownsend.com/instruments)** | Instrument collection | Maintenance log (string changes, setups), string/pickup specs, value stats (hidden unless signed in) |
| **[Wildlife](https://satownsend.com/wildlife)** | Sighting log | One row per species (grouped sightings), calendar view, seasonal patterns, life list, first-of-year tracking, **photo _and_ video** support |
| **[Photography](https://satownsend.com/photography)** | Photo wall | Standalone photos (a photo _is_ the record) in a masonry wall that loads a page at a time as you scroll, category chips (astro/landscape/trips/misc/Puck + auto-discovered), full-screen slideshow, larger/less-compressed uploads |
| **[Home](https://satownsend.com)** | Hub | A full-bleed **combined slideshow** of photos from every dashboard with the site name over it, one photo card per section with live counts, and the [chatbot](#the-chatbot) |

Shared per-dashboard features:

- **Photo/video gallery** — a crossfade slideshow; click a photo to open a
  lightbox (caption, delete, set-as-thumbnail, hide-from-slideshow, feature-on-homepage).
- **Capture-date detection** — uploaded photos/videos use their EXIF /
  file-modified date, not the upload date.
- **Column show/hide**, search, sort, and category filters on every table.
- **Themes** — twelve color themes (eight dark, four light; `data-theme`),
  remembered per browser and shared across pages. Colors live in
  `shared/styles.css`, the picker list in `shared/themes.js` — adding one is a
  CSS block plus one line.
- **Section details** — optional styling in the theme picker: botanical plant labels, recipe-card brew details, and wildlife observation captions. Off by default, remembered across pages, and independent of the chosen color theme and font.
- **Fonts** — eleven font options in the same picker (`data-font`): Clean
  (system text + clother titles, the default), Editorial, Grotesk, Rounded,
  Mono, Classic, Humanist, Slab, Geometric, Typewriter, Garden. Each is a
  `--font-body` / `--font-display` pair in `styles.css`; the non-default ones
  load from Google Fonts on demand (`shared/themes.js`).
- **Mobile-friendly** — tables collapse to cards; the nav becomes a dropdown.

---

## How it works

```
Browser (static HTML/JS)
├── reads data     ──► Google Sheets (public CSV export)         no login needed
├── writes data    ──► Google Sheets API v4                      requires Google login
├── photos/videos  ──► Cloudflare R2 (S3 API, signed in-browser) requires R2 creds
└── chatbot        ──► Cloudflare Worker ──► Claude (Anthropic)  requires Google login
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
- **Thumbnails:** every image upload also writes a 640px `<key>.thumb.jpg`
  next to the original. Tables, card grids and the photo wall load the
  thumbnail (with an automatic fallback to the original if a thumb doesn't
  exist yet); lightboxes and slideshows use the original. For photos uploaded
  before this existed, Plants → Settings → Account & storage → Advanced →
  **Build thumbnails** scans the bucket and makes the missing ones for all five
  sections (resumable; videos skipped).
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
  stuffs the data into the prompt, and calls **Claude** (Sonnet 5.5 via an
  `ANTHROPIC_API_KEY` Worker secret, with prompt caching; falls back to
  Cloudflare Workers AI / Llama without a key).
- **Owner-only:** the button only shows when signed in, and the Worker verifies
  your Google token before answering (401 otherwise) — this keeps the
  signed-in-only instrument prices private.
- The panel shows which model is answering, fetched from the Worker.
- **Saved answers (issue #145):** every answer has **☆ Save** and **Copy**.
  Save keeps the question with it. The **★ Saved** button in the panel header
  opens the saved list, where each item can be copied, asked again, or deleted.
  The list can also save the whole current conversation as one item and export
  everything as a Markdown file. Saved items live in a `chat_saved` tab of the
  plants sheet (`id, saved_at, page, kind, question, answer`), so they follow you
  across devices, with a local copy for instant loading. Writes are row-level
  appends and single-row deletes. A save made offline is queued and syncs the
  next time the Saved list opens.

Deploy/redeploy instructions for the Worker are in
[`chatbot-worker/README.md`](chatbot-worker/README.md).

### Plant care calendar (`plants/index.html` + Worker `mode: "care"`)

The Plants page has two views — **Dashboard** and **Care calendar**. The
calendar holds a yearly care schedule per plant (prune, fertilize, mulch,
winter protect, repot…), each task a `MM-DD` window that repeats every year.

- **Generating:** "Generate schedules" sends plants (a few per request) to the
  same Worker with `mode: "care"`; **Claude** (Opus 5.5 by default, via an
  `ANTHROPIC_API_KEY` Worker secret — falls back to Workers AI without one)
  writes a species-specific schedule for zone 6a and the configured frost dates
  and returns strict JSON, which the Worker validates before the browser stores it. Plants without a schedule
  trigger a nudge in Today's brief. "Regenerate" replaces a plant's AI tasks
  but keeps any you added or edited yourself.
- **Storage:** a `care_schedule` tab in the plants sheet
  (`id, plant_id, task, start, end, notes, source, updatedAt, skipped`), created on
  first use and synced row-by-row like the other tabs.
- **Done tracking:** a task shows ✓ once the matching action is logged inside
  its window (prune → "pruned", fertilize → "fertilized", cover → "covered", …;
  tasks with no mapped action are matched by their own wording). A **✓ Done**
  button on any active task row writes that log entry for today itself
  (undoable for 10 s); a "plant …" task, or the Quick log's "planted" action,
  also fills in the plant's planted date when it's blank.
- **Skip:** next to Done, **Skip** passes on this year's occurrence without
  logging anything. The task drops out of In progress, Today's brief and the
  tab badge, shows as "skipped" elsewhere with an **↶ Unskip** button, and
  comes back by itself next year. The skip is stored in the task's `skipped`
  column as the start date of the skipped window.
- Tasks in progress or starting within a week also appear in Today's brief and
  as a count badge on the tab.

### Yard photos

Under the yard map on the Plants dashboard is a **Yard photos** wall for wide
shots of the whole yard that don't belong to one plant. They upload like any
plant photo and sync as `plant_photos` rows with `plant_id = "yard"`. They are
**signed-in only**: the panel and the dashboard gallery show them only when
signed in, and the homepage slideshow and photo-frame pages skip them.

**View tags:** tag upload batches or open a yard photo and use **Yard view tags → Save tags** (comma-separated, e.g. `Office window, Porch`). Filter the wall by a named view or **Untagged**, alongside newest/oldest sorting. Tags sync in the appended `viewTags` column of `plant_photos` as pipe-separated labels; older photos remain untagged until edited. The selected view filter is remembered in the current browser.

### AI plant overviews (`plants/index.html` + Worker `mode: "overview"`)

Each plant card has a collapsible **AI overview**: a short summary plus mature
size, growth rate, sun, water, soil, hardiness zones, bloom/seasonal interest,
notable features, the pests/diseases to watch for, and a line each for what
the plant looks like in spring, summer, autumn and winter, written for zone 6a.

- **Generating:** "Generate" on a plant card does one plant; the
  "✨ AI overviews" button above the plants table does the plants that have
  none, or regenerates all. Same Worker and model as the care calendar
  (`CARE_MODEL`), a few plants per request, structured JSON validated in the
  Worker.
- **Storage:** a `plant_overview` tab in the plants sheet, one row per plant
  (`plant_id, summary, height, width, growth, sun, water, soil, hardiness,
  bloom, features, issues, spring, summer, autumn, winter, calendar, model,
  updatedAt`), created on first use and synced row-by-row. The chatbot reads
  it too, so "how big will the Hinoki get?" works.
- **Year view:** the Plants page's third tab draws the whole yard on one
  12-month strip from each overview's `calendar` (JSON: month ranges with a
  kind — bloom, foliage, fruit, bark, cone, bare, evergreen — and a
  representative color). Legend chips hide/show kinds; a month summary row
  counts what's in bloom and coloring; click a plant name for its card.
  Overviews generated before this existed show "Update older overviews" in
  the AI overviews popover.

### Digital photo frame (`/<section>-slideshow/` + `shared/frame.js`)

Full-screen slideshow pages meant for a Raspberry Pi (or any browser in kiosk
mode) showing the site's photos as a photo frame. No login needed — everything
they read is public.

| URL | Shows |
|-----|-------|
| `/all-slideshow/` | every section |
| `/plants-slideshow/`, `/beer-slideshow/`, `/instruments-slideshow/`, `/wildlife-slideshow/`, `/photography-slideshow/` | one section |
| `/slideshow/?src=plants,wildlife` | any combination |

Configure these options visually at **[/photo-frame/](https://satownsend.com/photo-frame/)**. Choose collections, timing, image fit, clock, captions, slow drift, and skipping portrait photos; see control changes apply to the live preview, then open or copy the generated frame link. The setup remembers your last applied settings and can be bookmarked.

Options go on the query string: `interval=20` (seconds per photo), `fit=cover`
(fill the screen instead of letterboxing), `clock=1`, `caption=0`, `kb=1`
(slow drift), `shuffle=0` (newest first), `landscape=1` (skip portrait photos; square photos are included). Keys: space pauses, arrows step,
`c`/`k` toggle caption/clock, `f` toggles fullscreen; click or tap steps forward.
The page keeps the screen awake, hides the cursor, re-reads the sheets hourly
so new uploads show up, and reloads itself once a day. Same photo rules as the
homepage slideshow: videos and hidden-from-gallery photos are skipped, wishlist
plants are skipped.

**Raspberry Pi:** on Raspberry Pi OS with the desktop, run Chromium in kiosk
mode (the exact binary name varies by OS version):

```sh
chromium-browser --kiosk --noerrdialogs --disable-infobars --incognito \
  --autoplay-policy=no-user-gesture-required \
  "https://satownsend.com/all-slideshow/?clock=1"
```

Add it to `~/.config/lxsession/LXDE-pi/autostart` (or a systemd user service) to
run on boot, and disable screen blanking (`xset s off -dpms`, or in
`raspi-config` → Display → Screen Blanking).

### Shared front-end (`shared/`)

| File | Role |
|------|------|
| `styles.css` | Theme system (CSS variables + `data-theme`) and shared component styles |
| `themes.js` | The theme and font lists for the picker (loaded synchronously in `<head>`; colors and font stacks are in `styles.css`) |
| `nav.js` | The cross-page dropdown menu (mounts into `<div id="siteNav">`) |
| `gauth.js` | Shared Google login + silent renewal (`window.GAuth`) |
| `chat.js` | The floating chatbot widget |
| `frame.js` / `frame.css` | The digital photo frame slideshow (loaded by the `*-slideshow/` pages) |

Each is a self-contained script included with `<script defer src="/shared/…">`.

### Fonts

The Typekit stylesheet (the `clother` display face) is loaded **async** via
`rel=preload` + swap on load, with a `<noscript>` fallback, so pages paint
immediately in the system font and swap when it arrives.

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
├── all-slideshow/, plants-slideshow/, … , slideshow/   # photo-frame stubs (load shared/frame.js)
├── shared/
│   ├── styles.css        # themes + shared component styles
│   ├── themes.js         # theme picker list
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
- **Sheet ids are duplicated** in `index.html` (homepage cards + slideshow) and
  `shared/frame.js` (photo frame). If a sheet or photos-tab gid ever changes,
  update both.
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

### A year in your backyard

`/backyard-year/?year=2026` brings together public Plants and Wildlife photos, observations, planting dates, and journal entries in a seasonal recap. Choose a year, browse seasonal chapters, compare earlier/later plant photos, and see recorded trunk measurements. Measurement changes compare only the same recorded point; photos are not used to infer measurements or unlogged seasonal events.

Favorite photos are saved per year in the current browser. Copy year link shares the public recap, while favorites remain local. Hidden slideshow photos, videos, yard-wide photos, wishlist plants, and orphan photo rows are excluded. Missing sources are identified in the page so a partial recap does not appear complete.

### Weather history

Plants → Forecast combines NWS daily temperatures with Open-Meteo hourly temperatures, rain probability and amounts, sustained wind, and gusts. Select any day for a temperature chart and hourly table in the forecast location's time zone. Refresh weather bypasses the one-hour cache. Either provider can serve as a fallback; official NWS alerts are fetched independently. Missing measurements stay unavailable, including in rainfall totals and existing watering advice. Rainfall is a model estimate, not a station observation.

This is the first part of [#115](https://github.com/satownsend/satownsend.github.io/issues/115), tracked in [#120](https://github.com/satownsend/satownsend.github.io/issues/120). Watering guidance is described in [docs/watering-guidance.md](docs/watering-guidance.md). No service account or scheduled collector is required for the browser forecast.

Overnight protection planning ([#121](https://github.com/satownsend/satownsend.github.io/issues/121)) analyzes 6 PM–10 AM in the forecast location's time zone. Daily detail and Today's brief show approximate ≤36°F (2.2°C) frost-risk windows, ≤32°F (0°C) freezing windows, time between consecutive cold samples, the coldest available hour, and wind/gust context. Threshold crossings are bracketed by hourly samples rather than interpolated into exact times. Missing samples split windows, and partial or elapsed nights are marked incomplete; DST duration uses real elapsed time.

Inventory matches explain tender/tropical/citrus tags, containers, Japanese maples, or an explicit tree planting date within the last year. Dead and wishlist plants are excluded. Purchase dates do not imply recent planting, and matches do not establish hardiness, current outdoor exposure, or vulnerable growth. Suggested protection is conditional; official NWS alerts remain separate. Version-3 history snapshots preserve the analysis and inventory matches as recorded at capture time, while older versions remain readable.

Plants → Forecast → **Before you water** combines recent modeled precipitation, today/tomorrow's amount and probability, and plant watering logs into soil-check reminders. Missing/stale estimates remain unavailable; rain never resets a watering log or automatically means watering can be skipped. Expand the plant list for inventory facts, log dates, and care guidance. The soil/ET research and model-selection decision for [#122](https://github.com/satownsend/satownsend.github.io/issues/122) are recorded in [docs/watering-guidance.md](docs/watering-guidance.md).

Plants → Forecast → **Weather history** archives the forecast as it appeared at capture time: daily highs/lows, rain chance and available precipitation amounts, wind, official NWS alert text, and the dashboard's frost/heat/wind risks. New version-2 snapshots also retain hourly detail, gusts, time zone, and per-field providers; older snapshots remain readable. Each snapshot retains its capture timestamp, location, units, provider, and the available past rainfall estimates from Open-Meteo's archive. NWS does not supply precipitation amounts in its forecast endpoint; those values remain unavailable, rather than being recorded as zero. Archive rainfall is a model estimate, not a weather-station observation.

Captures happen after successful weather refreshes, at most once an hour per location/unit combination, plus changes to official alerts or alert availability. The static site does not collect weather while closed and cannot reconstruct old forecasts. Date filters use the viewer's local capture date; selecting a snapshot shows its original seven-day forecast and alerts. Export JSON downloads the filtered snapshots, including source metadata for a future weather-station integration.

Snapshots are retained locally until an authenticated sync saves them to the Plants spreadsheet's new `weather_history` tab (created on first use). This tab is **append-only**: `id,captured_at,part,payload` rows hold JSON split into cells of at most 30,000 characters to preserve long alert descriptions within Sheets limits. Sync reads current keys before appending, retries missing parts, and never deletes or replaces another browser's history. Public viewers can read the shared history; signed-out captures remain in their own browser until sign-in. The browser caches 90 recent shared snapshots plus every pending capture; older shared history is loaded from Sheets. Storage and sync failures are shown in the history panel.

Validation: `node tests/forecast-history.cjs` exercises snapshot provenance, missing values, alert changes, hourly capture, location/unit separation, chunked sheet round-trips, append-only retries, local retention, and the production forecast-fetch failure paths with fake services.

### Plant damage reports

Plants → Quick log supports frost, wind, deer, rabbit, insect, disease, heat/sun, drought, hail, snow/ice, and other damage. Log one report for selected plants or a yard-wide event, then open an entry to add notes and attach plant photos. The Damage & frost log filters by damage category and keeps existing frost events, temperatures, and caused-by links available. Temperature and frost-event linking apply only to frost/frost-damage entries; switching to another cause clears those frost-only fields on save.

Damage categories use the existing log `action` column, so no sheet migration is needed. Linked damage photos follow the existing frost-damage gallery-hiding behavior, and damage entries can appear among Backyard Year's seasonal milestones. `node tests/plant-damage.cjs` exercises production save/edit/render and sheet import/export code with simulated state and no live writes.

### Instrument thumbnails

The Instruments collection shows an uncropped thumbnail beside each name. The Thumbnails checkbox saves its visibility preference in the current browser. Open an instrument photo and, while signed in, choose **Use as thumbnail** to save that instrument's preferred photo; select the same photo again to reset to automatic selection. The record cover uses the same choice. This is independent of the homepage feature setting.

The preferred key is stored in a `thumbKey` column added to the instruments sheet on first use. Only the new header and selected instrument's cell are written; ordinary instrument edits preserve the preference and other unedited columns. Legacy rows use their first available image, videos are skipped, missing thumbnail files fall back to originals, and a deleted/missing preferred key falls back to a remaining photo. Uploading or deleting photos refreshes the collection thumbnails immediately.

Validation: `node tests/instrument-thumbnails.cjs` checks selection, fallbacks, failed saves, signed-out guards, additive column creation, and preservation of existing data using simulated services.


### Yard photo view pins

Signed-in Plants → Yard map offers separate **Plant pins** and **Photo views** toggles; turn both off for a clean map. **Edit photo views** places one camera position per existing yard-photo view tag. Choose a view, click the map (or enter percentages), adjust direction and cone width, then save. Direction is relative to the map image (0° up, 90° right), and the cone is illustrative rather than a calibrated camera field of view. Edits remain a preview until saved; Cancel discards them. Click a saved camera pin to filter and jump to that view's yard photos.

Pins sync in a `yard_view_pins` tab, created on first save, with columns `view,x,y,angle,fov`. Positions are normalized to the image; a changed map image may require repositioning. View keys use the existing normalized photo-view tags. Retagging all photos does not silently move a pin to a different view: an orphaned pin remains editable/removable and opens an empty filtered gallery. Save/remove writes only that view's row (removal leaves an empty position), preserves other views, and checks the loaded row against the editor's starting state before writing. Simultaneous writes are not an atomic transaction; duplicate rows cause a visible error rather than being silently overwritten. Failed saves retain the draft. The map and yard gallery keep their existing signed-in-only display.

Validation for #129: inline-script syntax and whitespace checks; signed-out page load. Authenticated editing and Google Sheets writes require a signed-in browser and were not exercised in this session. No tests written or run, per user preference.

### Weather calendar

Plants → **Weather calendar** displays a year or one month of saved predictions. Select a location/unit set and a year. For each date it chooses the latest loaded snapshot containing that forecast date whose capture calendar date is strictly earlier than the target date, in the selected location's calendar time zone. That zone comes from the newest snapshot for the group, with UTC as the fallback for legacy records. Same-day/later snapshots remain available for comparison but never color the tile. The detail shows the chosen capture time, provider, and lead time in calendar days.

Colors represent the forecast high, dots indicate rain chance ≥40%, and symbols indicate predicted frost/heat/wind risk. Official-alert symbols require a saved effective/expiry interval overlapping the date; unbounded alerts remain readable in the saved alert list. Missing snapshots are explicitly unknown, and missing high temperatures use a striped tile. Coverage counts dates once, not captures or confirmed events. This is not a calendar of observed or modeled historical weather.

Selecting a day shows all saved forecasts containing that date, visible plant photos, and care log entries matched by recorded date. Those site records are not verified to belong to the selected weather location. Hidden photos and wishlist plants are excluded, and yard photos retain their sign-in requirement. Photo buttons open the existing lightbox. The calendar uses all loaded archive records independently of the Weather history date filters; cache-only/offline coverage may be incomplete until shared history loads.

Validation for #110: syntax/whitespace checks; local browser review of year/month controls, a 29-day February in 2024, known and unknown days, capture/lead labels, dated care notes, and opening a photo. No tests were written or run, per user preference. Multiple-location/unit combinations and synthetic official-alert intervals were not exercised in the browser.


### Bulk plant-log corrections

Signed-in Quick log offers checkboxes, date/action filters, Select matching, and a Bulk edit log disclosure. Choose which fields to change: date, action, or notes (replace/clear/append). Other fields remain unchanged; selection spans filters and the editor lists the selected entries before Apply. Changing an action clears incompatible temperature/measurement/frost-cause fields and applies damage-photo hiding consistently. The existing Sheets sync saves updates under the same log IDs. Undo is available for 10 seconds and preserves subsequent edits to changed fields. Individual editing remains available by clicking the row outside its checkbox.

Quick log now defaults to the browser's local calendar date instead of UTC, matching its time field. Last-log lookups choose the latest dated/time-stamped entry rather than spreadsheet order, so corrections update last-watered/fed displays correctly. Validation: syntax/whitespace checks and signed-out browser review of the local date and hidden editing controls; authenticated bulk writes/undo were not exercised. No tests written or run, per user preference.


### Signed-in plant Growth stories

Open a plant → Photos → **Growth story** while signed in. The dialog provides chronological crossfades, play/pause, speed, previous/next, a scrubber and year selection. Choose similar viewpoints manually; there is no automatic photo alignment or inferred viewpoint metadata. Select photos individually, select/clear a range, or choose up to nine evenly spaced photos. Hidden photos and invalid/missing photo dates are excluded. Optional milestone captions use matching recorded dates for planted, repotted, moved and bloom actions; no dates or plant events are invented.

Download a local PNG collage using 4–9 selected photos. Full originals are fitted without cropping, with plant name, date range and per-photo dates. The image is not uploaded or hosted. Export requires image-storage CORS permission, and load/export failures are reported without downloading a partial collage. The current R2 photo response permits cross-origin access. Play starts only when requested, crossfades respect reduced-motion preferences, and background tabs pause playback. Sign-out closes/clears the story, and open/play/export guard authentication. This is a UI feature restriction, not a change to existing public photo hosting.

This implements the slideshow and shareable-collage portion of #11; downloadable video/GIF encoding remains outside this change. Validation: syntax/whitespace checks, signed-out hidden-control review and a read-only R2 CORS header check. Authenticated playback and PNG downloads were not exercised in the signed-out local browser. No tests written or run, per user preference.

### Adding plants

While signed in, Plants → **+ Add plant** opens a draft form. Common name is required; Latin name, type, location and container status are available immediately. **More details** includes quantity (defaults to one), price, purchase/planting dates, tags and notes. Blank or whitespace-only names and invalid numeric values are rejected. Cancel or Escape discards the draft without creating a record. Submitting adds one plant through the existing local-save/Sheets-sync path and opens its saved record, even when the table filter excludes it. Signing out closes and clears the draft.

Validation for issue #68: inline JavaScript syntax and whitespace checks passed; the updated page loaded in the signed-out browser with Add plant hidden. Authenticated creation and Sheets sync were not exercised. No tests were added.

### Historical conditions in the Weather Calendar

Plants → Weather calendar → **Data: Historical conditions (estimated)** provides an on-demand historical layer, separate from **Saved predictions**. Select a location/unit set, model and year, then **Load historical year**. Tiles use estimated daily highs; the rain dot marks positive modeled rain plus showers. Select a day for high/low, rain plus showers, total precipitation (including snow water equivalent), maximum wind/gusts, source details and the same visibility-filtered photos and care notes as the saved-predictions view. **Load hourly estimates** requests that day’s temperature, precipitation and wind detail. Today and future days are excluded, and unavailable values remain unknown.

The module `shared/historical-weather.js` uses [Open-Meteo Historical Forecast](https://open-meteo.com/en/docs/historical-forecast-api). Best match is the default automatic model selection (UI years from 2022); GFS Seamless is an explicit alternative (from 2021). Coverage varies by field/date. The response does not identify each contributing Best match model, so provenance states that limitation. This stitched short-lead model history is neither a station observation nor the forecast/official alert previously shown on this site. Model-version changes make it unsuitable for unqualified long-term trend comparisons; a consistent reanalysis source should be evaluated for #151.

Requests preserve requested coordinates, returned grid/elevation, local timezone, units, model selection, API window, retrieval timestamp and source type. Daily ISO calendar keys come directly from the provider’s timezone-specific aggregation. Hourly requests use a three-date UTC window, then filter absolute timestamps through the selected IANA zone, preserving both repeated autumn hours and the 23-hour spring day. The UI reports returned/expected hours and complete measurements, with gaps in temperature lines. These source aggregates are estimates; do not infer backyard frost, measured rainfall or watering needs from them.

Caching/storage decision: use bounded browser memory/localStorage, not Google Sheets or the chatbot Worker. Cache identity includes coordinates, units, zone, model, period and resolution. Keep up to four daily-year entries and eight hourly-day entries. Data within the last seven days expires after six hours; older periods after 30 days. Stale results remain labeled and can be refreshed explicitly. Requests are deduplicated while in flight, time out after 25 seconds, and retain previous cached data on failure. Storage failures fall back to memory. Changing selections during a request never displays another selection’s result. This avoids a Worker deployment, public shared-cache location concerns and bulk hourly snapshot-Sheet storage; a shared cache can be considered if traffic warrants it.

One year loads seven daily variables in one HTTP request; hourly detail uses four variables across a bounded three-date window. Long periods count as multiple API calls under [Open-Meteo’s pricing](https://open-meteo.com/en/pricing), so do not treat one year as one quota unit. No automatic history polling, retries or full-year hourly downloads occur. Free endpoints are for [noncommercial use](https://open-meteo.com/en/terms), currently subject to 600/minute, 5,000/hour and 10,000/day limits; attribution links to Open-Meteo and [CC BY 4.0](https://open-meteo.com/en/licence) appear in the calendar. Review terms/capacity before commercial use. This feature neither activates PR #113 nor writes into `weather_history`.

Validation for #149: JavaScript syntax and whitespace checks passed. Read-only live API checks confirmed daily units/values and a full 25-hour New York autumn clock-change day using UTC-window filtering. Browser checks loaded all 366 daily summaries for 2024, displayed all 25 hourly records for November 3 (including both 1 AM hours with EDT/EST labels), retained the year cache after reload, showed two matching April 29 plant photos and returned to saved-prediction mode without reusing imported values. The narrow browser layout was inspected. No tests were added. Other locations, metric units, authenticated yard photos, storage-denied behavior and provider-outage/rate-limit scenarios were not exercised end to end.

### Plants Weather tab

Plants now has **Dashboard / Weather / Care calendar / Seasons** views, plus the Backyard year link. Dashboard keeps Today’s brief and a compact **Weather ahead** card: up to three upcoming forecast days, a seven-complete-day modeled precipitation figure, and up to three short official-alert/risk links with a link for additional flags. Missing or stale precipitation stays unavailable; forecast source, update time and stale/failed-refresh status stay visible. Relevant protection and soil-check reminders link to details. Plants and Quick log remain on Dashboard.

**Weather** holds the full forecast, day/hourly dialog, rainfall charts and data, Before you water, upcoming alerts, protection planning, saved history and Weather Calendar (including imported historical estimates). Dashboard day/protection links switch to Weather and open the relevant day; closing returns focus to its full-forecast button. Rainfall and watering links focus/scroll to their section, expanding watering details. Both views reuse one forecast/rainfall state and refresh path, without added data requests or archive captures.

`/plants/#weather` opens Weather directly. Tab changes create browser-history entries; Back/Forward and external hash changes restore the selected view. Existing `#calendar` and `#year` links and remembered view preferences remain supported. Tabs expose panel relationships and support arrow keys, Home and End. Browser navigation away closes the weather dialog and focuses the destination tab.

Validation for #153: JavaScript syntax and whitespace checks passed. In the browser, Dashboard showed three forecast buttons while Weather retained seven. Protection and compact forecast links opened the selected day, Back/Forward changed views and closed the dialog, `#weather` survived reload, and rainfall/watering links reached the corresponding Weather sections. The narrow Dashboard layout was inspected. No tests added. Live official-alert, provider-outage and authenticated editing scenarios were not exercised end to end.

### Permanent weather archive from move-in

The Weather Calendar defaults to a permanent **ERA5 archive starting October 1, 2020**. Years and hourly detail load automatically from the shared R2 archive; browser cache eviction does not remove stored history. The existing Cloudflare Worker imports monthly daily/hourly records in resumable batches and revisits recent months daily. ERA5 has approximately five days' latency, with a six-day import buffer. The initial import takes roughly a day after successful Worker deployment; its progress, coverage and source gaps are shown. Existing on-demand forecast-model choices and saved predictions remain separate. No Google service account setup is involved.

Deployment, fixed-prefix R2 storage, cron/batching, pause controls, read-only endpoints, retention and validation limits are documented in [chatbot-worker/WEATHER_ARCHIVE.md](chatbot-worker/WEATHER_ARCHIVE.md). This supersedes the browser-only storage decision above for the default ERA5 archive; the on-demand Historical Forecast choices still use that browser cache.

### Comparing weather across years

Plants → Weather → **Compare years** reads the same permanent Lilly ERA5 archive in Fahrenheit and inches. Choose any of the available years and a full year, spring (March–May), summer (June–August), autumn (September–November), or custom MM-DD range within a calendar year. By default, the entire selected period is shown: Full year always spans January–December, with unavailable dates left empty. Enable **Compare matching dates** to clip every series to October 1 or later when 2020 is selected, and to the current archive cutoff when the current year is selected. Missing imported months remain gaps. There is no maximum selection count; at least one year must stay selected. Year colors and line styles stay consistent when the selection changes.

The temperature strip colors daily highs using the Weather Calendar key. The precipitation chart accumulates total precipitation (including snow water equivalent) from zero at the start of the selected period and stops each series at its first missing measurement. Incomplete available-day sums are labeled and must not be compared as complete totals. Hover/tap either chart or use the keyboard-accessible date slider for synchronized exact readings; a daily table provides the underlying values. February 29 has its own slot in leap years and is explicitly inapplicable in other years. Refresh reads stored data; it does not start imports. These are regional model estimates, not backyard observations or explanations of plant performance.

### Home-screen app (#165)

The site is an online-only installable web app, named **Scott's Yard** on the Home Screen. `/app/` contains installation instructions for iPhone/iPad and Android/desktop, plus a native install button when the browser supplies `beforeinstallprompt`. The shared site menu links to it. The manifest at `/app/manifest.webmanifest` has a stable root identity and scope, launches `/plants/`, uses standalone display, and includes 192/512px icons and Care/Weather shortcuts. Apple touch metadata uses the 180px icon. The geometric sprout source is `app/icons/yard.svg`; raster icons have an opaque background and mask-safe artwork.

Plants restores its existing `plants.view` preference on launch. A narrow-screen navigation bar provides Plants search, Quick log, Care and Weather using the existing view logic. Signed-out Quick log opens Settings → Account & storage; no Google scope, redirect URI, token behavior, storage backend or editing permissions change. Existing photo inputs keep the phone's image picker. Safe-area padding keeps controls above the home indicator; the shortcut bar hides behind existing modal dialogs.

No service worker, offline queue, background sync or notification permission is registered. Live data and writes require connectivity. The installation page notes that an installed app can require a separate sign-in from the browser. Google may renew expired sessions through the existing full-page redirect flow; do not promise indefinite sign-in. Deploy the normal GitHub Pages site, then visit `https://satownsend.com/app/` on the phone to install. App content updates through normal website deployments.

Browser preview validates the install instructions, manifest/assets, view navigation and signed-out guard. Actual Home Screen installation, standalone window behavior, Google sign-in/return, a signed-in care log and photo upload must be checked on a real phone after deployment. Browser install prompts and OS-level installation are not simulated by the preview. Keep #165 open until that device check is complete.
