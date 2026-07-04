/* Shared cross-page navigation for satownsend.com (issue #42).
 *
 * A themed dropdown menu that replaces the old row of nav links. Works on
 * desktop and mobile (large tap targets, closes on outside tap / Escape /
 * selection). The button shows the current section for orientation.
 *
 * Usage: put <div id="siteNav"></div> where the menu should appear and include
 * <script defer src="/shared/nav.js"></script>. One list to maintain for every
 * page.
 */
(function(){
  const SECTIONS = [
    { href:'/',            label:'Home',        icon:'\u{1F3E0}', key:'home' },
    { href:'/plants',      label:'Plants',      icon:'\u{1F331}', key:'plants' },
    { href:'/beer',        label:'Beer',        icon:'\u{1F37A}', key:'beer' },
    { href:'/instruments', label:'Instruments', icon:'\u{1F3B8}', key:'instruments' },
    { href:'/wildlife',    label:'Wildlife',    icon:'\u{1F989}', key:'wildlife' },
    { href:'/photography', label:'Photography', icon:'\u{1F4F7}', key:'photography' },
  ];

  function currentKey(){
    const p = location.pathname.toLowerCase();
    for(const s of SECTIONS){
      if(s.key !== 'home' && (p === '/'+s.key || p.indexOf('/'+s.key+'/') === 0)) return s.key;
    }
    return 'home';
  }

  const CSS = `
  .sitenav{position:relative;display:inline-block;font-size:14px}
  .sitenav-btn{display:inline-flex;align-items:center;gap:8px;background:var(--panel2,var(--panel));color:var(--ink);
    border:1px solid var(--line);border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer;transition:border-color .15s}
  .sitenav-btn:hover{border-color:var(--accent)}
  .sitenav-btn .sn-ico{font-size:15px;line-height:1}
  .sitenav-caret{color:var(--muted);font-size:10px;transition:transform .15s}
  .sitenav.open .sitenav-caret{transform:rotate(180deg)}
  .sitenav-menu{position:absolute;top:calc(100% + 6px);left:0;min-width:200px;background:var(--panel);
    border:1px solid var(--line2,var(--line));border-radius:10px;padding:6px;box-shadow:var(--shadow);z-index:80;
    display:none;flex-direction:column;gap:2px}
  .sitenav.open .sitenav-menu{display:flex}
  .sitenav-menu a{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:7px;color:var(--ink);
    text-decoration:none;white-space:nowrap;transition:background .12s}
  .sitenav-menu a:hover{background:var(--panel2,var(--chip))}
  .sitenav-menu a.active{color:var(--accent);font-weight:600;background:var(--panel2,var(--chip))}
  .sitenav-menu a .sn-ico{width:20px;text-align:center;flex:none;font-size:16px;line-height:1}
  .sitenav-menu a .sn-check{margin-left:auto;color:var(--accent)}
  @media (max-width:520px){
    .sitenav-menu{min-width:210px}
    .sitenav-menu a{padding:12px}
  }`;

  function injectCss(){
    if(document.getElementById('sitenav-css')) return;
    const st = document.createElement('style');
    st.id = 'sitenav-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function render(){
    const mount = document.getElementById('siteNav');
    if(!mount) return;
    injectCss();
    const cur = currentKey();
    const curSec = SECTIONS.find(s=>s.key===cur) || SECTIONS[0];

    const wrap = document.createElement('div');
    wrap.className = 'sitenav';
    wrap.innerHTML =
      `<button class="sitenav-btn" id="sitenavBtn" aria-haspopup="true" aria-expanded="false" aria-label="Site menu">
         <span class="sn-ico">${curSec.icon}</span><span>${curSec.label}</span><span class="sitenav-caret">▾</span>
       </button>
       <div class="sitenav-menu" id="sitenavMenu" role="menu">
         ${SECTIONS.map(s=>`<a role="menuitem" href="${s.href}" class="${s.key===cur?'active':''}">`
           + `<span class="sn-ico">${s.icon}</span><span>${s.label}</span>`
           + `${s.key===cur?'<span class="sn-check">✓</span>':''}</a>`).join('')}
       </div>`;
    mount.replaceWith(wrap);

    const btn = wrap.querySelector('#sitenavBtn');
    const setOpen = (open)=>{ wrap.classList.toggle('open', open); btn.setAttribute('aria-expanded', open?'true':'false'); };
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); setOpen(!wrap.classList.contains('open')); });
    document.addEventListener('click', (e)=>{ if(!wrap.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') setOpen(false); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
