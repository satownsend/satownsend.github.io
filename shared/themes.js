/* satownsend.com — the one theme list (and font list) shared by every page.
 * Loaded synchronously in <head> (not deferred) because each page's inline
 * script reads window.THEMES while it parses, and because the saved font has
 * to be applied before first paint to avoid a flash.
 *
 * Themes: the colors live in /shared/styles.css ([data-theme="…"] blocks);
 * this list just drives the picker: id = data-theme value ('default' = no
 * attribute), bg/accent = swatch, meta = the <meta name="theme-color"> for the
 * browser chrome on phones. To add a theme: a CSS block in styles.css + one
 * line here.
 *
 * Fonts (issue #87): same idea. styles.css has a [data-font="…"] block per
 * option setting --font-body / --font-display; this file applies the saved
 * choice on <html>, loads the Google Fonts stylesheet the option needs, and
 * renders the "Font" rows that each page appends to its theme popover
 * (window.Fonts.pickerHtml()). Clicks on those rows are handled here. */
window.THEMES = [
  // Dark
  { id:'default',   label:'Teal Dark',       bg:'#08191c', accent:'#4dd0c1', meta:'#0d2629' },
  { id:'slate',     label:'Slate',           bg:'#13171b', accent:'#9aafc4', meta:'#1a1f24' },
  { id:'midnight',  label:'Midnight',        bg:'#0a0f1f', accent:'#e3e8ff', meta:'#101830' },
  { id:'forest',    label:'Forest',          bg:'#0d1611', accent:'#8fc06a', meta:'#11201a' },
  { id:'maple',     label:'Bloodgood Maple', bg:'#16080a', accent:'#d2554a', meta:'#1f0e10' },
  { id:'amber',     label:'Amber',           bg:'#170f08', accent:'#e8b03c', meta:'#21160c' },
  { id:'sunburst',  label:'Sunburst',        bg:'#0c0907', accent:'#e08a3c', meta:'#150f0b' },
  { id:'black',     label:'Pure Black',      bg:'#000000', accent:'#ffffff', meta:'#000000' },
  // Light
  { id:'light',     label:'Cream Light',     bg:'#e6f1f2', accent:'#118a7d', meta:'#f3f9fa' },
  { id:'redwood',   label:'Dawn Redwood',    bg:'#dde9d4', accent:'#5a8a32', meta:'#e8f0e0' },
  { id:'frost',     label:'Frost',           bg:'#e9eef3', accent:'#3f6f9e', meta:'#f4f7fa' },
  { id:'hydrangea', label:'Hydrangea',       bg:'#efeaf5', accent:'#7a4a8f', meta:'#f7f4fb' },
];

window.FONTS = [
  { id:'default',   label:'Clean',     blurb:'System text, clother titles',     sample:'Aa', url:'' },
  { id:'editorial', label:'Editorial', blurb:'Source Serif text, Fraunces titles', sample:'Aa',
    url:'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap' },
  { id:'grotesk',   label:'Grotesk',   blurb:'Inter text, Space Grotesk titles', sample:'Aa',
    url:'https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Space+Grotesk:wght@600;700&display=swap' },
  { id:'rounded',   label:'Rounded',   blurb:'Nunito throughout',               sample:'Aa',
    url:'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;800&display=swap' },
  { id:'mono',      label:'Mono',      blurb:'JetBrains Mono throughout',       sample:'Aa',
    url:'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap' },
];

(function(){
  const KEY = 'satownsend.font';
  const loaded = new Set();
  function ensureLoaded(f){
    if (!f || !f.url || loaded.has(f.id)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = f.url;
    (document.head || document.documentElement).appendChild(l);
    loaded.add(f.id);
  }
  function current(){
    let id = 'default';
    try { id = localStorage.getItem(KEY) || 'default'; } catch(e){}
    return window.FONTS.some(f => f.id === id) ? id : 'default';
  }
  function apply(id){
    const f = window.FONTS.find(x => x.id === id) || window.FONTS[0];
    ensureLoaded(f);
    if (f.id === 'default') document.documentElement.removeAttribute('data-font');
    else document.documentElement.setAttribute('data-font', f.id);
    try { localStorage.setItem(KEY, f.id); } catch(e){}
    document.querySelectorAll('.fp-row').forEach(r => {
      const on = r.dataset.font === f.id;
      r.classList.toggle('is-current', on);
      const c = r.querySelector('.fp-check'); if (c) c.textContent = on ? '✓' : '';
    });
  }
  function pickerHtml(){
    const cur = current();
    return `<div class="fp-head">Font</div>` + window.FONTS.map(f => `
      <div class="fp-row${f.id === cur ? ' is-current' : ''}" data-font="${f.id}" title="${f.blurb}">
        <span class="fp-sample" style="font-family:${fontStack(f.id)}">${f.sample}</span>
        <span>${f.label}</span>
        <span class="fp-check">${f.id === cur ? '✓' : ''}</span>
      </div>`).join('');
  }
  // The sample swatch shows each option in its own face (and triggers the
  // font download for the hover/preview), independent of the page's choice.
  function fontStack(id){
    return ({ default:'"clother",-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif', editorial:'"Fraunces",Georgia,serif', grotesk:'"Space Grotesk","Inter",sans-serif', rounded:'"Nunito",sans-serif', mono:'"JetBrains Mono",ui-monospace,monospace' })[id] || 'inherit';
  }
  // Apply the saved font before first paint (this script runs in <head>).
  apply(current());
  // Preload the other options' faces lazily so the picker's samples render.
  window.addEventListener('load', () => setTimeout(() => window.FONTS.forEach(ensureLoaded), 2500));
  document.addEventListener('click', e => {
    const row = e.target.closest('.fp-row[data-font]'); if (!row) return;
    e.stopPropagation();
    apply(row.dataset.font);
  }, true);
  window.Fonts = { apply, current, pickerHtml };
})();
