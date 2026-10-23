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
    'Is frost or rain forecast for my plants this week?',
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
  .cb-hbtn{background:none;border:1px solid var(--line);color:var(--muted);border-radius:999px;padding:3px 10px;font:inherit;
    font-size:12px;cursor:pointer;white-space:nowrap;margin-left:auto}
  .cb-hbtn:hover,.cb-hbtn.on{color:var(--accent);border-color:var(--accent)}
  .cb-hbtn + .cb-x{margin-left:0}
  .cb-acts{align-self:flex-start;display:flex;gap:4px;margin:-6px 0 0 4px}
  .cb-act{background:none;border:none;color:var(--muted);font:inherit;font-size:11px;cursor:pointer;padding:2px 6px;border-radius:6px}
  .cb-act:hover{color:var(--ink);background:var(--panel2,var(--bg2))}
  .cb-act.on{color:var(--accent)}
  .cb-saved{flex:1;overflow-y:auto;padding:14px;display:none;flex-direction:column;gap:10px}
  .cb-panel.saved-view .cb-saved{display:flex}
  .cb-panel.saved-view .cb-body,.cb-panel.saved-view .cb-foot{display:none}
  .cb-sv-tools{display:flex;gap:6px;flex-wrap:wrap}
  .cb-sv-tools button{background:var(--panel2,var(--bg2));border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:5px 10px;
    font:inherit;font-size:12px;cursor:pointer}
  .cb-sv-tools button:hover{border-color:var(--accent);color:var(--accent)}
  .cb-sv-tools button:disabled{opacity:.45;cursor:default;border-color:var(--line);color:var(--ink)}
  .cb-sv-status{font-size:11px;color:var(--muted)}
  .cb-sv-status:empty{display:none}
  .cb-sv{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:var(--panel2,var(--bg2))}
  .cb-sv-meta{font-size:11px;color:var(--muted);display:flex;gap:6px;align-items:center}
  .cb-sv-q{font-weight:600;font-size:13px;color:var(--ink);margin:4px 0}
  .cb-sv-a{font-size:13px;line-height:1.45;color:var(--ink);white-space:pre-wrap;word-wrap:break-word;
    display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer}
  .cb-sv.open .cb-sv-a{display:block;-webkit-line-clamp:unset}
  .cb-sv-acts{display:flex;gap:2px;margin:6px 0 0 -6px}
  .cb-sv-empty{color:var(--muted);font-size:13px;line-height:1.5}
  @media (max-width:520px){
    .cb-panel{right:8px;left:8px;bottom:8px;width:auto;height:min(78vh,560px)}
    .cb-fab{right:12px;bottom:12px}
  }`;

  function el(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text!=null) e.textContent = text; return e; }

  /* Saved answers and conversations (issue #145).
   * Kept in a chat_saved tab of the plants spreadsheet so they follow you to
   * any device, with a localStorage copy so the list opens instantly. Writes
   * are row-level: an append per save and a single-row delete per removal,
   * never a tab rewrite. A save or delete that fails (offline, token expired)
   * stays queued locally and is retried the next time the list loads. */
  const SAVE_SHEET_ID = '1Q1kRZG0jjkYF7pCSZXZIgE5B_kCorDovO2I7ATE3vUM';
  const SAVE_TAB = 'chat_saved';
  const SAVE_HEADER = ['id','saved_at','page','kind','question','answer'];
  const SAVE_KEY = 'satownsend.chatSaved';
  const CELL_MAX = 45000;   // Sheets caps a cell at 50,000 characters
  const Saved = (function(){
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${SAVE_SHEET_ID}`;
    let items = [], deleted = [], tabReady = false;
    try { const c = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); items = c.items || []; deleted = c.deleted || []; } catch(e){}
    function persist(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify({ items, deleted })); } catch(e){} }
    async function api(url, opts = {}){
      const token = window.GAuth && GAuth.token();
      if(!token) throw new Error('not signed in');
      const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
      if(!r.ok){ const t = await r.text().catch(()=>''); throw new Error(`Sheets ${r.status}: ${t.slice(0, 120)}`); }
      return r.json();
    }
    async function gid(){
      const meta = await api(`${base}?fields=sheets.properties(sheetId,title)`);
      const s = (meta.sheets || []).find(x => x.properties.title === SAVE_TAB);
      return s ? s.properties.sheetId : null;
    }
    async function ensureTab(){
      if(tabReady) return;
      if(await gid() == null){
        try { await api(`${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: SAVE_TAB } } }] }) }); }
        catch(e){ if(!/already exists/i.test(e.message)) throw e; }
      }
      const head = await api(`${base}/values/${SAVE_TAB}!A1:F1`);
      if(!(head.values && head.values[0] && head.values[0][0] === 'id')){
        await api(`${base}/values/${SAVE_TAB}!A1?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values: [SAVE_HEADER] }) });
      }
      tabReady = true;
    }
    const toRow = s => [s.id, s.savedAt, s.page, s.kind, String(s.question || '').slice(0, CELL_MAX), String(s.answer || '').slice(0, CELL_MAX)];
    async function pushOne(s){
      await ensureTab();
      await api(`${base}/values/${SAVE_TAB}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: 'POST', body: JSON.stringify({ values: [toRow(s)] }) });
      delete s.pending;
      // Un-saved while the append was in flight: take the new row back out.
      if(!items.includes(s)){ deleted.push(s.id); persist(); await deleteRow(s.id); return; }
      persist();
    }
    async function deleteRow(id){
      const ids = await api(`${base}/values/${SAVE_TAB}!A:A`);
      const idx = (ids.values || []).findIndex((r, i) => i > 0 && r[0] === id);
      if(idx > 0){
        const g = await gid(); if(g == null) throw new Error('tab missing');
        await api(`${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId: g, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } } }] }) });
      }
      deleted = deleted.filter(x => x !== id); persist();
    }
    function list(){ return items.slice().sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || '')); }
    function has(id){ return items.some(s => s.id === id); }
    async function add(s){
      s = { ...s, savedAt: new Date().toISOString(), page: (location.pathname.split('/').filter(Boolean)[0] || 'home'), pending: true };
      items.push(s); persist();
      await pushOne(s);   // throws → stays pending, retried by refresh()
      return s;
    }
    async function remove(id){
      const s = items.find(x => x.id === id); if(!s) return;
      items = items.filter(x => x.id !== id);
      if(!s.pending) deleted.push(id);   // never reached the sheet → nothing to delete there
      persist();
      if(!s.pending) await deleteRow(id);
    }
    // Reload from the sheet, after first retrying any queued saves/deletes.
    // An empty or failed read never wipes the local copy.
    async function refresh(){
      for(const s of items.filter(x => x.pending)) await pushOne(s);
      for(const id of deleted.slice()) await deleteRow(id);
      await ensureTab();
      const data = await api(`${base}/values/${SAVE_TAB}`);
      const rows = (data.values || []).slice(1).filter(r => r[0]);
      if(!rows.length && items.length) return list();
      const remote = rows.map(r => ({ id: r[0], savedAt: r[1] || '', page: r[2] || '', kind: r[3] || 'answer', question: r[4] || '', answer: r[5] || '' }));
      const ids = new Set(remote.map(s => s.id));
      items = remote.concat(items.filter(s => s.pending && !ids.has(s.id)));
      persist();
      return list();
    }
    return { list, has, add, remove, refresh, count: () => items.length };
  })();
  const sid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  async function copyText(t, btn){
    try { await navigator.clipboard.writeText(t); }
    catch(e){ const ta = el('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch(_){} ta.remove(); }
    if(btn){ const was = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = was; }, 1200); }
  }

  function render(){
    if(document.getElementById('cb-fab')) return;
    const style = el('style'); style.id = 'cb-css'; style.textContent = CSS; document.head.appendChild(style);

    const fab = el('button', 'cb-fab'); fab.id = 'cb-fab';
    fab.innerHTML = '<span class="cb-ico">\u{1F4AC}</span><span>Ask</span>';

    const panel = el('div', 'cb-panel');
    panel.innerHTML =
      `<div class="cb-head">
         <div><div class="cb-title">Ask satownsend</div><div class="cb-sub">plants · weather · beer · instruments · wildlife</div></div>
         <button class="cb-hbtn" id="cb-savedbtn" title="Saved answers and conversations">★ Saved</button>
         <button class="cb-x" aria-label="Close">&times;</button>
       </div>
       <div class="cb-body"></div>
       <div class="cb-saved"></div>
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
      const intro = el('div', 'cb-intro', 'Ask me anything about the plants, weather forecasts, beers, instruments, or wildlife tracked here. Try:');
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

    const bubbleSyncs = [];
    // An answer bubble plus its ☆ Save / Copy row. Save keeps the question
    // with it, so the saved item reads on its own later.
    function addAnswer(question, answer){
      const m = addMsg('bot', answer);
      const acts = el('div', 'cb-acts');
      const save = el('button', 'cb-act', '☆ Save'), copy = el('button', 'cb-act', 'Copy');
      save.title = 'Keep this answer (with its question) in Saved';
      let savedId = null;
      // Deleted from the Saved list since → show it as unsaved again.
      bubbleSyncs.push(() => { if(savedId && !Saved.has(savedId)){ savedId = null; save.textContent = '☆ Save'; save.classList.remove('on'); } });
      save.onclick = async () => {
        if(savedId && Saved.has(savedId)){
          const id = savedId; savedId = null; save.textContent = '☆ Save'; save.classList.remove('on');
          try { await Saved.remove(id); } catch(e){ console.warn('chat unsave', e); }
        } else {
          savedId = sid(); save.textContent = '★ Saved'; save.classList.add('on');
          try { await Saved.add({ id: savedId, kind: 'answer', question, answer }); }
          catch(e){ save.title = 'Saved on this device. It will sync to the sheet next time Saved opens.'; console.warn('chat save', e); }
        }
        updateSavedBtn();
      };
      copy.onclick = () => copyText(answer, copy);
      acts.append(save, copy); body.appendChild(acts); scrollDown();
    }

    // ---- Saved view (issue #145) ----
    const savedBox = panel.querySelector('.cb-saved');
    const savedBtn = panel.querySelector('#cb-savedbtn');
    function updateSavedBtn(){
      const n = Saved.count(), on = panel.classList.contains('saved-view');
      savedBtn.textContent = on ? '← Chat' : (n ? `★ Saved (${n})` : '★ Saved');
      savedBtn.classList.toggle('on', on);
      bubbleSyncs.forEach(f => f());
    }
    const fmtWhen = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
    function transcript(){ return messages.map(m => (m.role === 'user' ? 'You: ' : 'Assistant: ') + m.content).join('\n\n'); }
    function toMarkdown(list){
      return '# Saved chatbot answers\n\n' + list.map(s =>
        `## ${s.kind === 'chat' ? 'Conversation: ' : ''}${(s.question || '').replace(/\s+/g, ' ').trim()}\n\n_${fmtWhen(s.savedAt)} · ${s.page}_\n\n${s.answer}\n`).join('\n');
    }
    function renderSaved(status){
      savedBox.innerHTML = '';
      const tools = el('div', 'cb-sv-tools');
      const saveChat = el('button', null, '＋ Save this conversation');
      saveChat.disabled = !messages.some(m => m.role === 'assistant');
      saveChat.title = saveChat.disabled ? 'Ask something first' : 'Save every question and answer in the current chat as one item';
      saveChat.onclick = async () => {
        const first = (messages.find(m => m.role === 'user') || {}).content || 'Conversation';
        const p = Saved.add({ id: sid(), kind: 'chat', question: first, answer: transcript() });
        renderSaved('Saving…'); updateSavedBtn();
        try { await p; renderSaved('Saved.'); } catch(e){ renderSaved('Saved on this device. It will sync to the sheet next time.'); }
      };
      const exp = el('button', null, 'Export .md');
      exp.disabled = !Saved.count();
      exp.onclick = () => {
        const blob = new Blob([toMarkdown(Saved.list())], { type: 'text/markdown' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `saved-answers-${new Date().toISOString().slice(0, 10)}.md`;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      tools.append(saveChat, exp);
      savedBox.appendChild(tools);
      savedBox.appendChild(el('div', 'cb-sv-status', status || ''));
      const list = Saved.list();
      if(!list.length){
        savedBox.appendChild(el('div', 'cb-sv-empty', 'Nothing saved yet. Tap ☆ Save under any answer, or save the whole conversation above.'));
        return;
      }
      for(const s of list){
        const card = el('div', 'cb-sv');
        const meta = el('div', 'cb-sv-meta', `${s.kind === 'chat' ? 'Conversation · ' : ''}${fmtWhen(s.savedAt)} · ${s.page}${s.pending ? ' · not synced yet' : ''}`);
        const q = el('div', 'cb-sv-q', s.question);
        const a = el('div', 'cb-sv-a', s.answer);
        a.title = 'Click to expand';
        a.onclick = () => card.classList.toggle('open');
        const acts = el('div', 'cb-sv-acts');
        const copy = el('button', 'cb-act', 'Copy'), ask = el('button', 'cb-act', 'Ask again'), del = el('button', 'cb-act', 'Delete');
        copy.onclick = () => copyText(s.kind === 'chat' ? s.answer : `Q: ${s.question}\n\n${s.answer}`, copy);
        ask.title = 'Put this question back in the chat box';
        ask.onclick = () => { showChat(); input.value = s.question; input.dispatchEvent(new Event('input')); input.focus(); };
        del.onclick = async () => {
          if(!confirm('Delete this saved item?')) return;
          const p = Saved.remove(s.id); renderSaved(); updateSavedBtn();
          try { await p; } catch(e){ renderSaved("Deleted here. The sheet copy will be removed next time it's reachable."); }
        };
        if(s.kind === 'chat') acts.append(copy, del); else acts.append(copy, ask, del);
        card.append(meta, q, a, acts);
        savedBox.appendChild(card);
      }
    }
    async function showSaved(){
      panel.classList.add('saved-view'); updateSavedBtn();
      renderSaved(Saved.count() ? 'Checking the sheet…' : 'Loading…');
      try { await Saved.refresh(); if(panel.classList.contains('saved-view')) renderSaved(); }
      catch(e){ if(panel.classList.contains('saved-view')) renderSaved("Showing this device's copy. Couldn't reach the sheet: " + (e.message || e)); }
      updateSavedBtn();
    }
    function showChat(){ panel.classList.remove('saved-view'); updateSavedBtn(); input.focus(); }
    savedBtn.onclick = () => panel.classList.contains('saved-view') ? showChat() : showSaved();
    updateSavedBtn();

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
          addAnswer(q, answer);
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
