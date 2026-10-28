# Owner media storage — #49

The five dashboards use `/shared/media-storage.js` for upload, delete, recovery,
and thumbnail rebuilding. The client sends the current Google access token to
the fixed `satownsend-chatbot` Worker endpoint. It neither signs S3 requests nor
reads/writes an R2 credential vault. Public viewing continues through the
existing R2 public URLs; this migration does not make media private.

## Server enforcement

Every `/media/` request except CORS preflight requires the existing
`ALLOWED_GOOGLE_SUBJECTS` owner allowlist and a valid Google access token for the
site's OAuth client. Missing configuration fails closed. Browser requests from
unlisted origins are rejected. Tokens are never included in media URLs.

The existing `WEATHER_ARCHIVE` bucket binding points to `plant-photos`. The media
API can access only `photos/`, `beer-photos/`, `instrument-photos/`,
`wildlife-photos/`, and `photography/`. Exact prefixes are required for listing;
there is no bucket-root listing or arbitrary-key API. Archive files remain
inaccessible through media routes.

- `GET /media/status`: verify owner access and bucket availability without writes.
- `GET /media/list?prefix=…&cursor=…`: paginated media keys, 500 per request.
- `PUT /media/object?key=…`: upload a supported media file with matching MIME type
  and extension. Images: JPEG, PNG, WebP, GIF, maximum 20 MiB. Videos: MP4, MOV,
  WebM, maximum 90 MiB, restricted to Wildlife and Photography namespaces.
- `GET`/`HEAD /media/object?key=…`: authenticated originals for maintenance.
- `DELETE /media/object?key=…`: delete that media object and its image thumbnail.

Paths reject traversal, escaped separators, empty segments, control characters,
and unsupported formats (including HTML and SVG). PUT requires a positive,
bounded Content-Length. Cloudflare's FixedLengthStream enforces actual byte
count while streaming to R2; video bodies are not buffered in Worker memory.
Browser ArrayBuffer uploads supply Content-Length through fetch. Client-side
size checks provide an earlier error; server validation is authoritative.
Provider/bucket errors are returned as a generic failure without upstream
messages. Existing image conversion, EXIF dating, sheet metadata, featured
photos, and labels retain their existing behavior.

The API accepts the owner's existing media paths for compatibility; it does
not independently authorize individual sheet rows or prevent an owner token
from overwriting media within the supported namespaces. Rate/cost controls
and broader script/XSS risks remain tracked in #163.

## Rollout and credential retirement

1. Retain the Worker's existing `ALLOWED_GOOGLE_SUBJECTS` secret and R2 binding.
   Deploy `chatbot-worker/src/index.js` and `media.js` first. Verify the Cloudflare
   build succeeds and unauthenticated `/media/status` returns 401 rather than
   model information. Do not deploy the client while this route is unavailable.
2. Publish the shared media client and all five updated dashboard pages.
   Hard-refresh open tabs; loading the new client removes all five old dashboard
   R2 credential entries from localStorage without reading them. It does not
   automatically remove copies on devices that have not loaded the update.
3. Sign in as the owner. In Settings → photo storage, **Check connection** should
   succeed. Upload a disposable image, confirm both the original and thumbnail,
   then delete it. Verify a Wildlife/Photography video, photo recovery listing,
   and thumbnail rebuilding as needed. Check a phone upload with a fresh login.
   Production media writes are deliberately reserved for the owner's test.
4. In Cloudflare R2 API Tokens, revoke the old dashboard R2 token. Identify the
   token used by these dashboards first; do not revoke a token used by another
   service. The native Worker binding needs no replacement access key. Revoking
   the old token invalidates cached browser copies and historical vault copies.
5. Remove the credential values from the private Google R2 vault (or delete that
   vault if it is used only for these credentials). Config-tab `r2_vault_id`
   pointers may be removed afterwards; other config values such as featured
   photos, labels, and view pins must stay intact. Vault cleanup is manual and
   should never copy its values into logs, issues, or chat.
6. Keep #49 open until deployment, owner media tests, and token retirement are
   confirmed. Returning to the old client after revocation will not restore
   uploads; fix forward or retain the new client when rolling back unrelated UI.

## Validation

`node tests/media-storage.cjs` checks the real Worker routing with mocked Google
and R2, upload/read/delete/list behavior, path/type/size enforcement, actual-byte
mismatches, redacted errors, browser credential removal and token transport.
`node tests/security-auth.cjs` checks authentication regressions.
`node tests/yard-photo-views.cjs` and `node tests/instrument-thumbnails.cjs` cover
existing media metadata behavior. The mock byte-counting stream is not the
Cloudflare runtime; live image/video tests remain required after deployment.

The native binding and streaming behavior follow Cloudflare's [R2 Workers API
reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
