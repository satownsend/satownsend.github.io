/* Shared Google auth for all satownsend.com dashboards.
 *
 * - ONE token, shared across every dashboard (same origin → shared
 *   localStorage), so signing in on any dashboard signs you into all of them.
 * - Near-silent renewal: when your token has expired but you're still logged
 *   into Google and previously authorized the app, loading a dashboard does a
 *   top-level prompt=none redirect that bounces to Google and straight back
 *   with a fresh token — no click, just a brief redirect. Reliable because it's
 *   a normal navigation (no popups, no third-party-cookie iframe).
 * - Only the owner is auto-renewed: the silent redirect fires only when this
 *   browser has an expired token (i.e. signed in before). Public visitors and
 *   brand-new browsers are never redirected — they just see the sign-in button.
 *
 * True background (no-redirect) renewal would need a backend holding a refresh
 * token, which a static GitHub Pages site can't have.
 *
 * API (window.GAuth):
 *   token()        → string|null   current valid access token
 *   isAuthed()     → bool
 *   handleReturn() → 'signed-in'|'error'|'none'  parse redirect result (call early)
 *   trySilent()    → bool          maybe redirect to renew; true = navigating away
 *   signIn()                       interactive sign-in (top-level redirect)
 *   signOut()                      clear the shared token
 */
(function(){
  const CLIENT_ID = '936411146633-16fq9oc08auslfprvgbl9bpoafbvo9uk.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const TOKEN_KEY = 'satownsend.gsToken';                 // shared across dashboards
  const FAILED_FLAG = 'satownsend.gsSilentFailed';        // sessionStorage: suppress auto-retry this tab

  function readToken(){
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch(e){ return null; }
  }
  function valid(){
    const t = readToken();
    return (t && t.access_token && (!t.expires_at || t.expires_at > Date.now())) ? t : null;
  }
  function hasExpired(){
    const t = readToken();
    return !!(t && t.access_token && t.expires_at && t.expires_at <= Date.now());
  }

  function isAuthed(){ return !!valid(); }
  function token(){ const t = valid(); return t ? t.access_token : null; }

  function store(accessToken, expiresIn){
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      access_token: accessToken,
      expires_at: Date.now() + (Number(expiresIn) || 3600) * 1000,
    }));
  }

  function authUrl(extra){
    const params = new URLSearchParams(Object.assign({
      client_id: CLIENT_ID,
      redirect_uri: location.origin + location.pathname,
      response_type: 'token',
      scope: SCOPE,
      include_granted_scopes: 'true',
    }, extra || {}));
    return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  }

  function handleReturn(){
    if (!location.hash || location.hash.length < 2) return 'none';
    const p = new URLSearchParams(location.hash.substring(1));
    const at = p.get('access_token');
    const err = p.get('error');
    if (at){
      store(at, p.get('expires_in'));
      try { sessionStorage.removeItem(FAILED_FLAG); } catch(e){}
      history.replaceState(null, '', location.pathname + location.search);
      return 'signed-in';
    }
    if (err){
      // A prompt=none attempt that needs interaction returns here with an error.
      try { sessionStorage.setItem(FAILED_FLAG, '1'); } catch(e){}
      history.replaceState(null, '', location.pathname + location.search);
      return 'error';
    }
    return 'none';
  }

  function trySilent(){
    if (isAuthed()) return false;
    if (!hasExpired()) return false;                       // no prior sign-in on this browser
    try { if (sessionStorage.getItem(FAILED_FLAG)) return false; } catch(e){}
    location.href = authUrl({ prompt: 'none' });
    return true;
  }

  function signIn(){
    try { sessionStorage.removeItem(FAILED_FLAG); } catch(e){}
    location.href = authUrl();
  }

  function signOut(){ localStorage.removeItem(TOKEN_KEY); }

  window.GAuth = { token, isAuthed, handleReturn, trySilent, signIn, signOut };
})();
