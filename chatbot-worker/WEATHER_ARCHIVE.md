# Permanent backyard weather archive

The existing `satownsend-chatbot` Worker now also serves a read-only weather archive and runs its importer. The archive is fixed to Lilly (40.4238, -78.6231), America/New_York, starting **2020-10-01**. It uses Open-Meteo Historical Weather with the explicit **ERA5** model, not Best match or the historical-forecast stitch. No photo, care-log, Google Sheets, AI, or NWS-forecast data is written into it.

## Deployment and initial import

The repository's existing Cloudflare Workers Builds connection deploys `chatbot-worker` on merges to main. `wrangler.toml` declares `WEATHER_ARCHIVE` bound to the existing **plant-photos** R2 bucket, and a cron at minutes 7, 22, 37 and 52 of each UTC hour. Deployment needs the existing build token to be allowed to bind that bucket and configure cron triggers. No new API key, Google service account or local Node installation is required for activation. Verify the Cloudflare build succeeds; merging alone is not evidence that the import ran. Cron changes may take time to propagate.

On the first ticks the importer fills the latest two available months, then the oldest missing month per tick. The initial 2020–present backfill should take roughly a day at this cadence, subject to provider/runtime availability. It is deliberately not a single long request. The calendar shows imported month count, continuous complete daily coverage from move-in, and the latest stored day; these are different measures. It reads stored data automatically, checks progress while visible, and never initiates source imports. No need to manually load or reload years.

After backfill, the cron checks the manifest but downloads only the latest two months once per New York calendar day, revisiting recent estimates and month boundaries. ERA5 is published with about five days' delay; the importer uses a **six-day buffer**. Recent uncovered days remain unknown; current forecasts and the on-demand historical-forecast choices remain separate. This is not activation of deferred PR #113's Google Sheets forecast collector.

## Storage contract

All R2 keys are under `weather/v1/lilly-era5/`:

- `manifest.json`: monthly daily summaries, immutable payload references, source import times, grid coordinates/units and update error/progress metadata.
- `months/YYYY-MM/<uuid>.json`: immutable monthly daily/hourly data plus original request URLs, source units, grid, timezone, selected model and import timestamp.
- `update-lease.json`: a ten-minute conditional-write lease preventing overlapping importers.

There are no bucket listing, arbitrary-key, arbitrary-location, client write, or deletion endpoints. The Worker code reads/writes only this namespace. The R2 binding itself is bucket-scoped, not prefix-scoped; keep that distinction in mind when auditing permissions. Existing photo storage and credentials are untouched. No credentials are exposed in the new frontend. Weather archive reads are public, matching the existing public location/weather information.

Data is stored canonically as °C / mm / mph. The frontend converts temperature and precipitation for the selected unit set, preserving original unit/provenance metadata. Daily aggregation is the provider's timezone-specific ISO calendar series. Hourly timestamps are UTC instants requested with one padded date on each side and filtered to local calendar dates, preserving DST repeated/missing hours. Hourly precipitation refers to the hour ending at the timestamp. ERA5 gusts are not available in this selected dataset; they remain null and the UI explains the omission. Do not fill them from a different model silently.

A successful month writes its immutable payload before conditionally publishing the manifest, so readers never follow a reference before its object exists. Manifest publication and the lease use R2 conditional operations. Repeated ticks choose missing/unfinished work from persisted progress; no destructive restart is needed. Revisions that would remove any previously stored numeric daily/hourly field are rejected and leave the previous version published. Initial nulls/gaps remain explicit and coverage counts require high, low, rain, precipitation and wind. Earlier immutable versions are retained; no lifecycle deletion is configured. They allow manual recovery if needed and consume some additional storage as recent months are revised. Browser caches and worker HTTP caching are only accelerators; R2 retains the archive across devices and browser resets.

## Read-only endpoints and verification

- `https://satownsend-chatbot.satownsend.workers.dev/weather-archive/status` — progress, cutoff, continuous coverage, latest date, pause/error state.
- `/weather-archive?year=2020` — canonical daily summaries plus monthly provenance.
- `/weather-archive?month=2020-10` — stored hourly estimates and provenance for that month.

No POST endpoint runs imports. After deployment verify the binding, cron trigger, first R2 manifest/payload and changing status. Check the move-in date, a daylight-saving day, current source-delay gap, and another device/browser. If the build or provider fails, inspect Workers logs and status; the existing archive is retained. A missing binding returns a setup message rather than fetching directly from Open-Meteo on visitor requests.

To pause source updates, set `WEATHER_ARCHIVE_PAUSED = "1"` in the Worker's `[vars]` config and deploy; set it back to `"0"` to resume. Public reads continue while paused. Source failures are retried on later ticks, not in tight loops. If R2 is temporarily unavailable, archive endpoints return 503 and clients can retry automatically while the calendar is visible.

## Limits and attribution

Each imported month uses two bounded provider HTTP requests (five daily and three hourly variables), not a full multi-year hourly request. Open-Meteo counts long time periods as multiple quota units; monitor provider and Cloudflare usage if traffic grows. The free API is noncommercial and subject to rate limits. R2 shares the account's storage/request allowance with photos; retained monthly revisions also count. No zero-cost guarantee is made. Attribution and dataset identification remain visible in the calendar.

Sources: [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api), [Open-Meteo terms](https://open-meteo.com/en/terms), [licence](https://open-meteo.com/en/licence), [R2 conditional operations](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations).

## Validation performed

No tests were added, per the user's preference. Changed JS parses and whitespace checks pass. A read-only live import of October 2020 returned 31 daily summaries and all 744 local-day hours, starting October 1, with ERA5 units/grid metadata and null gusts. The browser verified the default permanent-source choice, automatic attempt, 2020 year minimum and an explicit not-yet-deployed message against the older live Worker. The existing on-demand Best match choice still loaded 366/366 days for 2024. Production R2 writes, scheduler/lease behavior, complete multi-year import and cross-device reading require the merged Worker deployment and have not yet been exercised.
