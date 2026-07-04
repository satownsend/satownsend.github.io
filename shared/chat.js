/* Shared chatbot widget for satownsend.com (issue #48).
 *
 * A floating "Ask" button + chat panel on every page. Questions go to the
 * Cloudflare Worker (chatbot-worker/), which grounds the answer in the
 * dashboards' data via Cloudflare Workers AI.
 *
 * Setup: deploy chatbot-worker/ (see its README), then paste the Worker URL
 * into CHAT_WORKER_URL below. Until then the panel shows a "not configured" note.
 */
(function(){
  const CHAT_WORKER_URL = 'https://satownsend-chatbot.satownsend.workers.dev';

  const SUGGESTIONS = [
    'When is my last frost date?',
    'What months do I usually see hummingbirds?',
    "Average ABV of my last 10 beers?",
    'When did I last change strings on my Warmoth bass?',
  ];

  const CSS = `
  .cb-fab{position:fixed;right:18px;bottom:18px;z-index:90;display:inline-flex;align-items:center;gap:8px;
    background:var(--accent);color:#04211d;border:none;border-radius:999px;padding:11px 16px;font:inherit;font-size:14px;
    font-weight:700;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35)}
  .cb-fab:hover{filter:brightness(1.06)}
  .cb-fab .cb-ico{font-size:16px;line-height:1}
  .cb-panel{position:fixed;right:18px;bottom:18px;z-index:101;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 24px));
    display:none;flex-direction:column;background:var(--panel);border:1px solid var(--line2,var(--line));border-radius:16px;
    box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden}
  .cb-panel.open{display:flex}
  .cb-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);flex:none}
  .cb-head .cb-title{font-weight:700;font-size:14px;color:var(--ink)}
  .cb-head .cb-sub{font-size:11px;color:var(--muted)}
  .cb-x{margin-left:auto;background:none;border:none;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:2px 4px}
  .cb-x:hover{color:var(--ink)}
  .cb-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
  .cb-msg{max-width:85%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}
  .cb-msg.user{align-self:flex-end;background:var(--accent);color:#04211d;border-bottom-right-radius:4px}
  .cb-msg.bot{align-self:flex-start;background:var(--panel2,var(--bg2));color:var(--ink);border:1px solid var(--line);border-bottom-left-radius:4px}
  .cb-msg.err{align-self:flex-start;background:rgba(245,154,138,.12);color:#f59a8a;border:1px solid rgba(245,154,138,.3);font-size:13px}
  .cb-intro{color:var(--muted);font-size:13px;line-height:1.5}
  .cb-sugs{display:flex;flex-direction:column;gap:6px;margin-top:4px}
  .cb-sug{text-align:left;background:var(--panel2,var(--bg2));border:1px solid var(--line);color:var(--ink);border-radius:9px;
    padding:8px 11px;font:inherit;font-size:13px;cursor:pointer}
  .cb-sug:hover{border-color:var(--accent);color:var(--accent)}
  .cb-typing{align-self:flex-start;color:var(--muted);font-size:13px;font-style:italic}
  .cb-foot{flex:none;border-top:1px solid var(--line);padding:10px;display:flex;gap:8px;align-items:flex-end}
  .cb-input{flex:1;resize:none;background:var(--bg2,var(--panel2));color:var(--ink);border:1px solid var(--line2,var(--line));
    border-radius:10px;padding:9px 11px;font:inherit;font-size:14px;max-height:120px;line-height:1.4}
  .cb-input:focus{outline:none;border-color:var(--accent)}
  .cb-send{flex:none;background:var(--accent);color:#04211d;border:none;border-radius:10px;padding:9px 14px;font:inherit;
    font-weight:700;font-size:14px;cursor:pointer}
  .cb-send:disabled{opacity:.5;cursor:default}
  .cb-model{flex:none;padding:0 12px 8px;font-size:10px;color:var(--muted);text-align:center}
  .cb-model:empty{display:none}
  @media (max-width:520px){
    .cb-panel{right:8px;left:8px;bottom:8px;width:auto;height:min(78vh,560px)}
    .cb-fab{right:12px;bottom:12px}
  }`;

  function el(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text!=null) e.textContent = text; return e; }

  function render(){
    if(document.getElementById('cb-fab')) return;
    const style = el('style'); style.id = 'cb-css'; style.textContent = CSS; document.head.appendChild(style);

    const fab = el('button', 'cb-fab'); fab.id = 'cb-fab';
    fab.innerHTML = '<span class="cb-ico">\u{1F4AC}</span><span>Ask</span>';

    const panel = el('div', 'cb-panel');
    panel.innerHTML =
      `<div class="cb-head">
         <div><div class="cb-title">Ask satownsend</div><div class="cb-sub">plants · beer · instruments · wildlife</div></div>
         <button class="cb-x" aria-label="Close">&times;</button>
       </div>
       <div class="cb-body"></div>
       <div class="cb-foot">
         <textarea class="cb-input" rows="1" placeholder="Ask about your data…"></textarea>
         <button class="cb-send">Send</button>
       </div>
       <div class="cb-model" id="cb-model"></div>`;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    const body = panel.querySelector('.cb-body');
    const input = panel.querySelector('.cb-input');
    const sendBtn = panel.querySelector('.cb-send');
    const messages = [];
    let busy = false;

    function scrollDown(){ body.scrollTop = body.scrollHeight; }

    function showIntro(){
      body.innerHTML = '';
      const intro = el('div', 'cb-intro', 'Ask me anything about the plants, beers, instruments, or wildlife tracked here. Try:');
      body.appendChild(intro);
      const sugs = el('div', 'cb-sugs');
      SUGGESTIONS.forEach(q=>{
        const b = el('button', 'cb-sug', q);
        b.onclick = ()=>{ input.value = q; send(); };
        sugs.appendChild(b);
      });
      body.appendChild(sugs);
    }

    function addMsg(role, text){
      const m = el('div', 'cb-msg ' + (role === 'user' ? 'user' : role === 'error' ? 'err' : 'bot'), text);
      body.appendChild(m); scrollDown(); return m;
    }

    function open(){ panel.classList.add('open'); fab.style.display = 'none'; if(!messages.length) showIntro(); showModel(); input.focus(); }
    function close(){ panel.classList.remove('open'); fab.style.display = ''; }

    // Show which model the Worker is using (issue #54). Fetched once, from the
    // Worker so it stays correct if the model is ever swapped there.
    let modelShown = false;
    async function showModel(){
      if(modelShown || !CHAT_WORKER_URL) return;
      modelShown = true;
      try {
        const r = await fetch(CHAT_WORKER_URL, { method: 'GET' });
        if(!r.ok) throw 0;
        const d = await r.json();
        const label = d.modelLabel || d.model;
        const line = panel.querySelector('#cb-model');
        if(label && line) line.textContent = `⚡ ${label}${d.provider ? ' · ' + d.provider : ''}`;
      } catch(e){ modelShown = false; }
    }

    fab.onclick = open;
    panel.querySelector('.cb-x').onclick = close;

    async function send(){
      const q = input.value.trim();
      if(!q || busy) return;
      if(!messages.length) body.innerHTML = '';
      input.value = ''; input.style.height = 'auto';
      messages.push({ role: 'user', content: q });
      addMsg('user', q);

      if(!CHAT_WORKER_URL){
        addMsg('error', "The chatbot isn't wired up yet — deploy the Worker (chatbot-worker/) and set its URL in /shared/chat.js.");
        return;
      }
      const token = (window.GAuth && GAuth.token && GAuth.token()) || '';
      if(!token){
        addMsg('error', 'Please sign in with Google (Settings on any dashboard) to use the assistant.');
        return;
      }

      busy = true; sendBtn.disabled = true;
      const typing = el('div', 'cb-typing', 'thinking…'); body.appendChild(typing); scrollDown();
      try {
        const r = await fetch(CHAT_WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ messages: messages.slice(-8) }),
        });
        const data = await r.json().catch(()=>({}));
        typing.remove();
        if(!r.ok || data.error){ addMsg('error', 'Error: ' + (data.error || ('HTTP ' + r.status))); }
        else {
          const answer = (data.answer || '').trim() || "I didn't get an answer for that.";
          messages.push({ role: 'assistant', content: answer });
          addMsg('bot', answer);
        }
      } catch(e){
        typing.remove();
        addMsg('error', "Couldn't reach the chatbot: " + (e.message || e));
      } finally {
        busy = false; sendBtn.disabled = false; input.focus();
      }
    }

    sendBtn.onclick = send;
    input.addEventListener('keydown', e=>{
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
    });
    input.addEventListener('input', ()=>{ input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && panel.classList.contains('open')) close(); });

    // Owner-only: the assistant is available only when signed in with Google.
    // Show/hide the button as auth state changes (sign in/out, silent renewal).
    function authed(){ return !!(window.GAuth && GAuth.isAuthed()); }
    function syncAuth(){
      if(!authed()){
        if(panel.classList.contains('open')) close();
        fab.style.display = 'none';
      } else if(!panel.classList.contains('open')){
        fab.style.display = '';
      }
    }
    syncAuth();
    setInterval(syncAuth, 2500);
    window.addEventListener('focus', syncAuth);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
