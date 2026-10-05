/* satownsend.com — the one theme list shared by every page.
 * Loaded synchronously in <head> (not deferred) because each page's inline
 * script reads window.THEMES while it parses. The colors live in
 * /shared/styles.css ([data-theme="…"] blocks); this list just drives the
 * picker: id = data-theme value ('default' = no attribute), bg/accent = swatch,
 * meta = the <meta name="theme-color"> for the browser chrome on phones.
 * To add a theme: a CSS block in styles.css + one line here. */
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
