# Scheduled weather collection

The `Collect backyard weather` GitHub Actions workflow wakes at minute 17 of every hour, including when the site is closed. `config.json` sets the location, units, timezone, spreadsheet, enabled flag, and capture interval (1–24 whole hours). The default is one hourly capture for Lilly, PA. Configuration is independent of an individual browser's Plants settings.

The collector uses NWS first, Open-Meteo as a fallback, active NWS alerts, and Open-Meteo archive rainfall estimates. Rainfall estimates are reused for up to six hours. It shares normalization, risk thresholds, and snapshot serialization with the browser. Unknown precipitation and unavailable alerts remain unknown. Source failures appear in snapshot metadata and collector status.

## One-time activation after merge

1. In a Google Cloud project, enable the **Google Sheets API** and create a dedicated service account. No broad project role or domain-wide delegation is needed for this collector.
2. Share **only the Plants spreadsheet** (`config.json` → `sheetId`) with that service account's email as **Editor**. Do not share the separate credentials vault. Sheets API permissions cover a spreadsheet, not just individual tabs; the collector code writes only `weather_history` and `weather_collector`.
3. Create a JSON key for this service account. In this GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret**. Name it **`WEATHER_GOOGLE_SERVICE_ACCOUNT`** and paste the full key JSON into the secret value. Never commit the JSON key or paste it into an issue, chat, or workflow log. Remove the downloaded key after storing it securely.
4. Once this workflow is on `main`, open **Actions → Collect backyard weather → Run workflow**, choose `main`, and run it. A manual run without the secret fails with a setup message; scheduled runs without the secret report awaiting setup and perform no writes.
5. Confirm the run summary and **Plants → Forecast → Weather history** show a saved scheduled capture. The collector creates the two weather tabs on first use. If setup fails, check that the API is enabled and the service account has Editor access to the configured spreadsheet.

The service account signs a short-lived OAuth assertion using Node's built-in crypto module and exchanges it directly with Google's fixed token endpoint. The workflow grants the GitHub token only `contents: read`, does not persist checkout credentials, does not run on pull requests, and does not accept an arbitrary branch on manual runs. The only runtime secret is passed through the job environment and never logged.

## Pause, resume, and cadence

- In **Settings → Secrets and variables → Actions → Variables**, set **`WEATHER_COLLECTOR_PAUSED`** to **`true`** to pause captures. The next scheduled/manual run updates the status to paused. Set it to **`false`** or remove it to resume.
- Alternatively set `enabled` to `false` in `config.json`. Plants reads this setting and displays paused immediately after deployment.
- `intervalHours` determines UTC-aligned capture slots. With `3`, hourly workflow wakeups capture only one snapshot per three-hour slot. To wake more frequently than hourly, both the workflow cron and collector's supported cadence would need to change.
- GitHub's **Disable workflow** control stops all runs, including status updates. Plants detects overdue collection from the last capture. Re-enable the workflow to resume.
- A paused collector still authenticates to write its paused status. Without credentials it reports awaiting setup instead.

## History, retries, and coverage

`weather_history` retains the existing `id,captured_at,part,payload` schema. Scheduled IDs use location, units, and UTC interval slot; `capturedAt` is the actual request time, never a backdated prediction. `collection.kind = "scheduled"` and slot/cadence/source-warning metadata distinguish scheduled captures from dashboard visits. Future station data can remain a separate observation type.

Runs are serialized with workflow concurrency. Before appending, the collector reads existing rows, validates the header, and checks for a complete matching ID. After an ambiguous append failure it reads again before retrying. A retry within a slot reuses an existing complete capture; it never updates or deletes prior history. Unexpected headers or incomplete records abort writes rather than mixing payload chunks. Google Sheets has no cross-client uniqueness constraint; deterministic scheduled IDs and the dashboard's second hourly/alert-change check minimize duplicates from simultaneous browser activity, and readers merge repeated IDs.

`weather_collector` holds a fixed two-row status record: `collector,status_json`. It reports last attempt, last successful run, last saved capture, current location/cadence, source gaps, and missing scheduled slots in a window of up to seven days since setup. Snapshot history is retained when status updates fail; the workflow reports a failure and retries on a later run. Browser captures do not fill scheduled coverage gaps. Changing location, units, or cadence starts a new coverage window. The history UI marks overdue collection based on capture age, even if the status record itself is stale.

Schedules are best effort: GitHub may delay or skip jobs and automatically disables scheduled workflows in public repositories after 60 days without repository activity. Missed slots stay missing; the collector cannot reconstruct what an old forecast would have said. Check overdue warnings and re-enable a disabled workflow in Actions.

## Verification

Run with Node 20+:

```sh
node tests/weather-collector.cjs
node tests/forecast-history.cjs
```

Tests use simulated providers and Sheets plus a disposable local signing key. They cover slot deduplication, ambiguous appends, retries, malformed headers, optional-source failures, total forecast failure, pause/resume, coverage gaps, location changes, service-account assertions, status staleness, and weather-tab-only writes. They do not require credentials or modify a real spreadsheet.

## Primary references

- [GitHub schedule behavior and inactivity limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Google service-account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Google Sheets append API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)
- [NWS API](https://www.weather.gov/documentation/services-web-api)
- [Open-Meteo archive data](https://open-meteo.com/en/docs/historical-weather-api)
