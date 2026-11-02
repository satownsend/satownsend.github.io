# Wildlife photos and dated sightings

Uploading media from a species detail creates or reuses that species' sighting on the capture date. Several files for the same species/day share one sighting. Capture dates come from original photo metadata or a YYYYMMDD / YYYY-MM-DD filename; the optional Photo date field overrides either. Files with no reliable date require an entered date rather than silently using the upload date. Species comes from the selected detail page, not image recognition.

The photo and a new sighting are appended in one atomic Sheets batch after media upload succeeds. A failed or interrupted save is reported, with an exact-key verification for lost responses. A failed sheet save can leave an unattached storage object; it does not create an empty sighting. Simultaneous uploads in separate browser tabs are not serialized by Google Sheets; upload batches within one page are serialized.

## Existing media

While signed in, open any species and choose **Create missing sightings from existing photos** below its photos. This checks all species, preserves original sighting rows and media objects, creates missing species/date sightings, and updates only the photo's sighting ID. It verifies the result and is safe to repeat after an interruption. Invalid dates or photos without a linked species are reported for manual attention. Leave other editing sessions idle while the check runs because Sheets does not support conditional row updates.

The November 1, 2026 audit found 53 media records: 36 need a different sighting association and 15 new sightings are needed. The connected Drive account could read these records but its write attempt returned HTTP 403, so that attempt made no changes. Run the signed-in site action to apply the repair with the site's Google account.

Run `node tests/wildlife-photo-sightings.cjs` for date matching, repeatable reconciliation, atomic save requests, and interrupted-save recovery.
