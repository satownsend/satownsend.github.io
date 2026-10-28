# Security pass — issue #163

This is a targeted source review and authentication hardening pass, not a complete penetration test or certification. The OAuth state and owner authorization fixes were deployed on October 25, 2026, and the owner confirmed a successful chat response. The R2 migration below is prepared for review; deployment and credential retirement are tracked in #49.

## Fixed in this pass

- **OAuth login injection:** previously any URL fragment containing `access_token` was adopted as the browser's shared Google session. Sign-in and silent renewal now generate a cryptographically random 256-bit state, save it in tab-scoped session storage, and require an exact match on return. The pending attempt expires after ten minutes, is bound to the callback path, and is consumed once. Success and error fragments are removed from the URL before processing. Invalid callbacks cannot overwrite the existing token. Storage failures prevent starting sign-in rather than disabling validation.
- **Worker account authorization:** the old OAuth-client check was not an owner check. The optional email allowlist was empty and also allowed tokens without email to bypass it. Chat, care, and overview now require a configured Google subject allowlist, matching audience/authorized party, and positive token lifetime. Missing configuration fails closed with HTTP 503; invalid credentials return 401. Public model information and weather archive reads remain public. Sign-in requests `openid` alongside the existing Sheets permission to obtain account identity; no email permission is requested.

OAuth state handling follows [Google's client-side OAuth guidance](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow). Google describes stable account subjects in its [OpenID Connect documentation](https://developers.google.com/identity/openid-connect/openid-connect).

## Deployment prerequisite

Configure the existing Worker's secret `ALLOWED_GOOGLE_SUBJECTS` before deploying this Worker change. It must contain the owner's Google account `sub` identifier (a string, not an email); multiple explicitly authorized subjects may be comma-separated. Use the Cloudflare dashboard's secret setting or `npx wrangler secret put ALLOWED_GOOGLE_SUBJECTS` from `chatbot-worker/`. Do not commit tokens or paste them into issues or chat.

To obtain the ID, sign in on the trusted site after the updated shared auth script is served, then use the browser developer console on that site:

```js
fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(GAuth.token()))
  .then(r => { if (!r.ok) throw new Error('Token verification failed'); return r.json(); })
  .then(info => console.log(info.sub || 'No subject: sign out and sign in again'));
```

This sends the access token only to Google's validation endpoint and prints only the account ID. Configure the ID belonging to the intended owner. Existing sessions without identity information may need sign-out/sign-in. After deployment, verify owner chat, care generation, overview generation, and interactive/silent sign-in on the actual site and installed phone app. Confirm an unlisted account is denied. Authentication tests use mocked Google responses, not real credentials.

## Remaining risks and follow-up work

1. **R2 migration (#49):** the proposed media API uses the existing Worker bucket binding with explicit owner authorization, constrained media paths and file limits. All five dashboards stop reading the credential vault and purge their legacy localStorage key entries. Keep #49 open until the owner verifies a live upload/delete and revokes the old R2 API token; cached clients and old vault copies remain a risk until revocation. See [the rollout checklist](r2-media-storage.md).
2. **Public data is public:** sheets are fetched through public CSV exports. Hiding instrument prices in the UI does not make their source data confidential. If those values must be private, move them to a private data source and return them only through server-side authorization. Changing the chatbot gate does not change sheet sharing.
3. **Browser token storage and script trust:** Google tokens remain in localStorage for cross-page login. A stored/DOM XSS or compromised third-party script could access them. This pass did not exhaustively audit every HTML interpolation, external library, or upload path. A follow-up should review URL/HTML sinks, pin external dependencies, and plan CSP deployment around the site's many inline scripts. State validation prevents login injection; it does not prevent XSS or token theft.
4. **AI resource limits:** explicit owner authorization narrows exposure, but the Worker still needs independent request-body limits and rate/cost controls for a stolen owner token or accidental repeated requests. Provider errors are still returned to clients and should be reviewed for redaction.

## Validation

Run `node tests/security-auth.cjs`. It exercises the shared browser script and actual Worker request handler in isolated VM contexts with mocked storage, navigation, and Google verification. Coverage includes valid login/silent renewal, absent/wrong/replayed/stale/path-mismatched state, invalid token metadata, sign-out invalidation, unavailable session storage, missing Worker configuration, wrong/missing subject, audience/authorized-party mismatches, expired tokens, and Google network failure. No live data writes or billable model calls occur.

The follow-up checklist for public-sheet privacy, script security, and AI limits is recorded in [#163](https://github.com/satownsend/satownsend.github.io/issues/163#issuecomment-6401074382). Media-specific tests are in `tests/media-storage.cjs`; they exercise the Worker handler with a mocked R2 binding and byte-counting stand-in for Cloudflare’s FixedLengthStream. Live owner upload/delete and phone checks remain deployment checks.
