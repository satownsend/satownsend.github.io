/* A visual editor for the existing frame.js query-string contract. */
(() => {
  const form = document.getElementById('frameForm');
  const checks = [...form.querySelectorAll('[name=src]')];
  const known = checks.map(input => input.value);
  const status = document.getElementById('formStatus');
  const copyStatus = document.getElementById('copyStatus');
  const link = document.getElementById('frameLink');
  const open = document.getElementById('openFrame');
  const preview = document.getElementById('framePreview');
  const storageKey = 'satownsend.frameSetup';
  let initial = location.search;
  try {
    const theme = localStorage.getItem('satownsend.theme');
    if (theme && theme !== 'default') document.documentElement.dataset.theme = theme;
    if (!initial) initial = localStorage.getItem(storageKey) || '';
  } catch (_) { /* Configuration still works without browser storage. */ }
  const q = new URLSearchParams(initial);
  const selected = (q.get('src') || 'all').toLowerCase().split(',').map(s => s.trim());
  const valid = known.filter(key => selected.includes('all') || selected.includes(key));
  checks.forEach(input => { input.checked = !valid.length || valid.includes(input.value); });
  const seconds = Number(q.get('interval'));
  form.elements.interval.value = Number.isFinite(seconds) && seconds >= 3 && seconds <= 3600 ? Math.round(seconds) : 20;
  form.elements.fit.value = q.get('fit') === 'cover' ? 'cover' : 'contain';
  form.elements.shuffle.value = q.get('shuffle') === '0' ? '0' : '1';
  form.elements.clock.checked = q.get('clock') === '1';
  form.elements.caption.checked = q.get('caption') !== '0';
  form.elements.kb.checked = q.get('kb') === '1';

  function parameters() {
    const chosen = checks.filter(input => input.checked).map(input => input.value);
    checks[0].setCustomValidity(chosen.length ? '' : 'Choose at least one collection.');
    if (!form.checkValidity()) return null;
    return new URLSearchParams({
      src: chosen.length === known.length ? 'all' : chosen.join(','),
      interval: form.elements.interval.value,
      fit: form.elements.fit.value,
      clock: form.elements.clock.checked ? '1' : '0',
      caption: form.elements.caption.checked ? '1' : '0',
      kb: form.elements.kb.checked ? '1' : '0',
      shuffle: form.elements.shuffle.value
    });
  }
  function updateLinks() {
    const params = parameters();
    if (!params) {
      open.removeAttribute('href');
      open.setAttribute('aria-disabled', 'true');
      link.value = '';
      document.getElementById('copyLink').disabled = true;
      status.textContent = checks.some(input => input.checked) ? 'Enter a whole number from 3 to 3,600 seconds.' : 'Choose at least one collection.';
      return null;
    }
    const url = new URL('/slideshow/', location.origin);
    url.search = params.toString();
    link.value = url.href;
    open.href = url.href;
    open.removeAttribute('aria-disabled');
    document.getElementById('copyLink').disabled = false;
    return params;
  }
  function applyPreview() {
    const params = updateLinks();
    if (!params) return;
    const url = new URL(link.value);
    if (preview.getAttribute('src') !== url.href) preview.src = url.href;
    document.getElementById('previewSummary').textContent = `${checks.filter(input => input.checked).length} collections · ${params.get('interval')}s per photo`;
    status.textContent = 'Preview is up to date.';
    try { localStorage.setItem(storageKey, params.toString()); } catch (_) {}
    history.replaceState(null, '', `${location.pathname}?${params}`);
  }
  form.addEventListener('input', () => {
    if (updateLinks()) status.textContent = 'Settings changed. Update the preview to see them.';
    copyStatus.textContent = 'Copy this link to the device you want to use.';
  });
  form.addEventListener('submit', event => { event.preventDefault(); applyPreview(); });
  document.getElementById('copyLink').addEventListener('click', async () => {
    const copied = link.value;
    try {
      await navigator.clipboard.writeText(copied);
      copyStatus.textContent = 'Frame link copied.';
    } catch (_) {
      link.focus(); link.select();
      copyStatus.textContent = 'Select and copy the highlighted link.';
    }
  });
  applyPreview();
})();
