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
    { href:'/backyard/',   label:'Backyard',    icon:'\u{1F333}', key:'backyard' },
    { href:'/beer',        label:'Beer',        icon:'\u{1F37A}', key:'beer' },
    { href:'/instruments', label:'Instruments', icon:'\u{1F3B8}', key:'instruments' },
    { href:'/photography', label:'Photography', icon:'\u{1F4F7}', key:'photography' },
    { href:'/photo-frame/', label:'Photo frame', icon:'\u{1F5BC}', key:'photo-frame' },
    { href:'/app/', label:'Install app', icon:'↗', key:'app' },
  ];
  const BACKYARD = [
    { href:'/plants/#dashboard', label:'Plants', key:'plants', icon:'🌱' },
    { href:'/plants/#weather', label:'Weather', key:'weather', icon:'🌦️' },
    { href:'/plants/#calendar', label:'Care calendar', key:'calendar', icon:'🗓️' },
    { href:'/plants/#year', label:'Seasons', key:'year', icon:'🍂' },
    { href:'/yard-3d/', label:'Yard in 3D', key:'yard-3d', icon:'🧊' },
    { href:'/backyard-year/', label:'Backyard year', key:'backyard-year', icon:'🍃' },
    { href:'/wildlife/', label:'Wildlife', key:'wildlife', icon:'🦉' },
  ];
  function inBackyard(){ return /^\/(backyard|plants|yard-3d|backyard-year|wildlife)(\/|$)/i.test(location.pathname); }
  function backyardKey(){
    const section = location.pathname.split('/')[1];
    return section === 'plants' && ['weather','calendar','year'].includes(location.hash.slice(1)) ? location.hash.slice(1) : section;
  }
  // Full-screen slideshows (the photo-frame pages, issue #72). Listed under the
  // sections; the current section's own slideshow is marked.
  const SLIDESHOWS = [
    { href:'/all-slideshow/',         label:'All photos',  key:'home' },
    { href:'/plants-slideshow/',      label:'Plants',      key:'plants' },
    { href:'/beer-slideshow/',        label:'Beer',        key:'beer' },
    { href:'/instruments-slideshow/', label:'Instruments', key:'instruments' },
    { href:'/wildlife-slideshow/',    label:'Wildlife',    key:'wildlife' },
    { href:'/photography-slideshow/', label:'Photography', key:'photography' },
  ];

  function currentKey(){
    const p = location.pathname.toLowerCase();
    if(inBackyard()) return 'backyard';
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
    display:none;flex-direction:column;gap:2px;max-height:70vh;overflow-y:auto}
  .sitenav.open .sitenav-menu{display:flex}
  .sitenav-menu a{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:7px;color:var(--ink);
    text-decoration:none;white-space:nowrap;transition:background .12s}
  .sitenav-menu a:hover{background:var(--panel2,var(--chip))}
  .sitenav-menu a.active{color:var(--accent);font-weight:600;background:var(--panel2,var(--chip))}
  .sitenav-menu a .sn-ico{width:20px;text-align:center;flex:none;font-size:16px;line-height:1}
  .sitenav-menu a .sn-check{margin-left:auto;color:var(--accent)}
  .sitenav-menu .sn-head{margin:6px 12px 2px;padding-top:8px;border-top:1px solid var(--line);font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
  .sitenav-menu a.sn-show{padding:7px 12px;font-size:13px;color:var(--ink-soft)}
  .sitenav-menu a.sn-show .sn-ico{font-size:13px;color:var(--muted)}
  .backyard-nav{display:flex;flex-wrap:wrap;gap:4px 12px;margin:10px 0;font-size:13px}
  .backyard-nav a{color:var(--muted);padding:7px 0;text-decoration:none}
  .backyard-nav a:hover,.backyard-nav a[aria-current]{color:var(--accent);text-decoration:underline;text-underline-offset:4px}
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
         <div class="sn-head">Full-screen slideshows</div>
         ${SLIDESHOWS.map(s=>`<a role="menuitem" href="${s.href}" class="sn-show" title="Open the ${s.label} photo-frame slideshow">`
           + `<span class="sn-ico">⤢</span><span>${s.label}</span>`
           + `${s.key===cur?'<span class="sn-check" title="This section">•</span>':''}</a>`).join('')}
       </div>`;
    mount.replaceWith(wrap);
    if(inBackyard()){
      const local = document.createElement('nav');
      local.setAttribute('aria-label', 'Backyard');
      local.className = 'backyard-nav';
      local.innerHTML = [{href:'/backyard/',label:'Backyard',key:'backyard'}, ...BACKYARD].map(s=>`<a href="${s.href}" data-backyard-key="${s.key}">${s.label}</a>`).join('');
      wrap.after(local);
      const update = ()=>local.querySelectorAll('a').forEach(a=>{
        if(a.dataset.backyardKey === backyardKey()) a.setAttribute('aria-current','page');
        else a.removeAttribute('aria-current');
      });
      update();
      window.addEventListener('hashchange',update);
      window.addEventListener('popstate',update);
      document.addEventListener('click',()=>queueMicrotask(update));
    }

    const btn = wrap.querySelector('#sitenavBtn');
    const setOpen = (open)=>{ wrap.classList.toggle('open', open); btn.setAttribute('aria-expanded', open?'true':'false'); };
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); setOpen(!wrap.classList.contains('open')); });
    document.addEventListener('click', (e)=>{ if(!wrap.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') setOpen(false); });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
