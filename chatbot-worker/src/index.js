/* satownsend.com chatbot — Cloudflare Worker (issue #48).
 *
 * Answers natural-language questions about the dashboards' data using
 * Cloudflare Workers AI. The browser POSTs { messages: [...] }; this Worker
 * fetches the public Google Sheets, computes exact aggregates in code, stuffs
 * both into the prompt, calls the model, and returns { answer }.
 *
 * Aggregates (counts/sums/averages) are computed here in JS rather than left to
 * the model — LLMs are unreliable at summing dozens of rows. The COMPUTED
 * TOTALS block is marked authoritative so answers match the dashboards.
 *
 * No API keys: Workers AI runs on your Cloudflare account (free tier: 10k
 * Neurons/day). The whole dataset is ~8k tokens, so it fits the model context.
 */

// Swap to '@cf/openai/gpt-oss-120b' (128k ctx, stronger) if you want more power.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Friendly names for display (issue #54). Falls back to the raw id.
const MODEL_LABELS = {
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': 'Llama 3.3 70B',
  '@cf/openai/gpt-oss-120b': 'GPT-OSS 120B',
};
const modelLabel = id => MODEL_LABELS[id] || id;
const PROVIDER = 'Cloudflare Workers AI';

// Owner-only: the chatbot requires a valid Google login for this site's OAuth
// client (the same one the dashboards use). The browser sends the Google access
// token; we verify it below before answering. Optionally lock it to specific
// Google accounts by listing emails here (leave empty to allow anyone who has
// signed into this app — for a personal/testing OAuth app that's just you).
const GS_CLIENT_ID = '936411146633-16fq9oc08auslfprvgbl9bpoafbvo9uk.apps.googleusercontent.com';
const ALLOWED_EMAILS = []; // e.g. ['scott@example.com']

async function verifyGoogleToken(token){
  if(!token) return { ok: false };
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));
    if(!r.ok) return { ok: false };
    const info = await r.json();
    // Must be a token minted for THIS app.
    if(info.aud !== GS_CLIENT_ID && info.azp !== GS_CLIENT_ID) return { ok: false };
    // Optional per-email allowlist (only enforced if an email is present + list non-empty).
    if(ALLOWED_EMAILS.length && info.email && !ALLOWED_EMAILS.includes(info.email)) return { ok: false };
    return { ok: true, email: info.email || null };
  } catch(e){ return { ok: false }; }
}

// gid → tab by number; sheet → tab by name (used for the photography `photos`
// tab, which is auto-created so its gid isn't fixed).
const SHEETS = {
  plants:       { id: '1Q1kRZG0jjkYF7pCSZXZIgE5B_kCorDovO2I7ATE3vUM', gid: '0' },
  plants_log:   { id: '1Q1kRZG0jjkYF7pCSZXZIgE5B_kCorDovO2I7ATE3vUM', gid: '322094770' },
  beers:        { id: '1BXFTqV6xCZU63IutRAeAFPrZKLyDPkuGQ-SykIdAy_k', gid: '0' },
  instruments:  { id: '1dWWWIFBpWvNOIBuxA1EIoaffKckDFhsHvPDzhbxdnYg', gid: '0' },
  maintenance:  { id: '1dWWWIFBpWvNOIBuxA1EIoaffKckDFhsHvPDzhbxdnYg', gid: '834291047' },
  wildlife:     { id: '1Uq2Fgzron3yDZqYFWsUx1cYigp4w8GmQP2pmk33DG54', gid: '0' },
  photography:  { id: '1JXlI9RgLfwrpYgMZxyo8TipEiEn675Bwpnr9ORxUJFA', sheet: 'photos' },
};

const ALLOW_ORIGINS = [
  'https://satownsend.com',
  'https://www.satownsend.com',
  'https://satownsend.github.io',
  'http://localhost:8090',
  'http://localhost:8080',
];

function corsHeaders(origin){
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : 'https://satownsend.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

async function fetchCsv(spec){
  const url = spec.sheet
    ? `https://docs.google.com/spreadsheets/d/${spec.id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(spec.sheet)}`
    : `https://docs.google.com/spreadsheets/d/${spec.id}/export?format=csv&gid=${spec.gid}`;
  try {
    const r = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
    if(!r.ok) return '';
    return (await r.text()).replace(/^﻿/, '').trim();
  } catch(e){ return ''; }
}

async function loadAll(){
  const entries = Object.entries(SHEETS);
  const texts = await Promise.all(entries.map(([, s]) => fetchCsv(s)));
  const byName = {};
  entries.forEach(([name], i) => { byName[name] = texts[i]; });
  return byName;
}

/* ── Minimal CSV parsing (for the computed aggregates) ── */
function parseCSV(text){
  const rows = []; let row = [], cell = '', q = false;
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(q){
      if(c === '"' && text[i+1] === '"'){ cell += '"'; i++; }
      else if(c === '"') q = false;
      else cell += c;
    } else {
      if(c === '"') q = true;
      else if(c === ',') { row.push(cell); cell = ''; }
      else if(c === '\n' || c === '\r'){ if(c === '\r' && text[i+1] === '\n') i++; row.push(cell); cell = ''; if(row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else cell += c;
    }
  }
  row.push(cell);
  if(row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}
function toObjects(text){
  const rows = parseCSV(text || '');
  if(!rows.length) return [];
  const hdr = rows[0];
  return rows.slice(1).map(r => { const o = {}; hdr.forEach((h, i) => o[h] = r[i] || ''); return o; });
}
const num = s => { const n = parseFloat(String(s || '').replace(/[$,%\s]/g, '')); return isNaN(n) ? 0 : n; };
const yr = s => { const m = String(s || '').match(/(\d{4})/); return m ? m[1] : null; };
const money = n => '$' + Math.round(n).toLocaleString('en-US');

function computeTotals(byName){
  const P = toObjects(byName.plants);
  const B = toObjects(byName.beers);
  const I = toObjects(byName.instruments);
  const M = toObjects(byName.maintenance);
  const W = toObjects(byName.wildlife);

  const living = P.filter(p => (p.dead || '').toUpperCase() !== 'TRUE' && (p.wishlist || '').toUpperCase() !== 'TRUE');
  const spendAll = P.reduce((s, p) => s + num(p.price) * (num(p.quantity) || 1), 0);
  const spendByYear = {};
  P.forEach(p => { const y = yr(p.purchased), v = num(p.price) * (num(p.quantity) || 1); if(y && v) spendByYear[y] = (spendByYear[y] || 0) + v; });
  const spendYearTotal = Object.values(spendByYear).reduce((s, n) => s + n, 0);
  const perYear = Object.keys(spendByYear).sort().map(y => `${y}: ${money(spendByYear[y])}`).join(', ');

  const abvs = B.map(b => num(b.abv)).filter(n => n > 0);
  const avgAbv = abvs.length ? abvs.reduce((a, c) => a + c, 0) / abvs.length : 0;
  const last10 = B.filter(b => b.brewDate).sort((a, b) => String(b.brewDate).localeCompare(String(a.brewDate))).slice(0, 10);
  const last10Abv = last10.map(b => num(b.abv)).filter(n => n > 0);
  const avgLast10 = last10Abv.length ? last10Abv.reduce((a, c) => a + c, 0) / last10Abv.length : 0;

  const instValue = I.reduce((s, i) => s + num(i.price), 0);

  const species = new Set(W.map(s => (s.species || '').trim()).filter(Boolean));

  const PH = toObjects(byName.photography);
  const photoCatCounts = {};
  PH.forEach(p => { if(!p.key) return; const c = (p.category || 'Uncategorized').trim(); photoCatCounts[c] = (photoCatCounts[c] || 0) + 1; });
  const photoCatStr = Object.keys(photoCatCounts).sort().map(c => `${c}: ${photoCatCounts[c]}`).join(', ');
  const photoSubCounts = {};
  PH.forEach(p => { if(!p.key || !p.subcategory) return; const k = `${(p.category || '').trim()} / ${p.subcategory.trim()}`; photoSubCounts[k] = (photoSubCounts[k] || 0) + 1; });
  const photoSubStr = Object.keys(photoSubCounts).sort().map(k => `${k}: ${photoSubCounts[k]}`).join(', ');
  const photoYearCounts = {};
  PH.forEach(p => { if(!p.key) return; const y = yr(p.date); if(y && +y >= 1900) photoYearCounts[y] = (photoYearCounts[y] || 0) + 1; });
  const photoYearStr = Object.keys(photoYearCounts).sort().map(y => `${y}: ${photoYearCounts[y]}`).join(', ');
  const photoTotal = PH.filter(p => p.key).length;

  return [
    `# COMPUTED TOTALS`,
    `These are calculated exactly in code from the sheets — treat them as AUTHORITATIVE and do NOT recompute them by hand. Use them for any count/sum/average question they cover.`,
    ``,
    `Plants: ${P.length} total rows, ${living.length} living (excludes dead and wishlist).`,
    `Plant spending is price × quantity (some plants have quantity > 1). Total spent on plants: ${money(spendYearTotal)} — report THIS figure; it matches the "Money spent per year" chart on the site. (Aside, only if relevant: a few plants have a price but no purchase date; including those the fuller total would be ${money(spendAll)}.) Spend by year: ${perYear || 'none'}.`,
    `Beers: ${B.length} total. Average ABV across all with a value: ${avgAbv.toFixed(1)}%. Average ABV of the most recent 10 by brew date: ${avgLast10.toFixed(1)}% (from ${last10Abv.length} of those 10 that list an ABV).`,
    `Instruments: ${I.length} total. Combined value / total spent (sum of prices): ${money(instValue)}. Maintenance-log entries: ${M.length}.`,
    `Wildlife: ${W.length} sightings across ${species.size} distinct species.`,
    `Photography: ${photoTotal} photos${photoCatStr ? `. By category: ${photoCatStr}` : ''}${photoSubStr ? `. Sub-categories (category / sub): ${photoSubStr}` : ''}${photoYearStr ? `. By year: ${photoYearStr}` : ''}.`,
  ].join('\n');
}

function systemPrompt(computed, context, today){
  return [
    `You are the friendly assistant for Scott Townsend's personal dashboards at satownsend.com.`,
    `He tracks: plants (yard/garden inventory) and a plants care log (which includes frost events and frost dates), homebrewed beers, musical instruments and an instrument maintenance log (string changes, setups, etc.), wildlife sightings, and a photography collection (standalone photos organized by category — e.g. Astrophotography, Landscape, Trips — with an optional sub-category such as Trips → Hawaii).`,
    ``,
    `Rules:`,
    `- Answer ONLY from the information below. If it isn't there, say you don't have that information — do not make things up.`,
    `- For any count, sum, or average, use the COMPUTED TOTALS section — those are calculated exactly in code and are authoritative. Do NOT re-add rows by hand. Only compute yourself if the question isn't covered there, and if you do, say the figure is approximate.`,
    `- Be concise and conversational: a direct answer first, then a short supporting detail.`,
    `- The raw DATA is CSV with header rows. Join across sheets by id when needed (a maintenance row's instrument_id matches an instrument's id; a plants_log row's plantId matches a plant's id).`,
    `- Dates are YYYY-MM-DD. Today is ${today}.`,
    ``,
    `# REFERENCE (site facts not in the sheets)`,
    `Location: Lilly, PA 15938 (USDA hardiness zone 6a).`,
    `Average last spring frost: around May 13. Average first fall frost: around October 1.`,
    `The plants_log sheet also records individual frost events and low temperatures — use those for questions about specific/most-recent frosts.`,
    ``,
    computed,
    ``,
    `# DATA (raw rows, for details the computed totals don't cover)`,
    context,
  ].join('\n');
}

/* ── Plant care schedules (issue #69) ──
   POST { mode:'care', zone, lastFrost, firstFrost, city, plants:[{id,name,type,category,container,spot,tags,purchased,notes}] }
   → { schedules:[{ plant_id, tasks:[{ task, start:'MM-DD', end:'MM-DD', notes }] }] }
   The model is asked for strict JSON; we validate every field and drop anything
   malformed so the dashboard never stores junk. */
const MD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Accept "3-15", "03/15", "Mar 15" style slips and normalize to MM-DD.
const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
function toMD(v){
  const s = String(v || '').trim();
  let m = s.match(/^(\d{1,2})[-\/](\d{1,2})$/);
  if(m) return `${String(+m[1]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`;
  m = s.match(/^(?:\d{4}-)?(\d{2})-(\d{2})$/);
  if(m) return `${m[1]}-${m[2]}`;
  m = s.match(/^([a-z]{3,4})\.?\s+(\d{1,2})$/i);
  if(m && MONTHS[m[1].toLowerCase()]) return `${String(MONTHS[m[1].toLowerCase()]).padStart(2,'0')}-${String(+m[2]).padStart(2,'0')}`;
  return s;
}

function parseCareJson(raw){
  let text = String(raw || '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(fence) text = fence[1];
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if(a < 0 || b < 0) throw new Error('The model returned no JSON');
  let obj;
  try { obj = JSON.parse(text.slice(a, b + 1)); }
  catch(e){ throw new Error('Could not parse the schedule JSON'); }
  const out = [];
  for(const s of (Array.isArray(obj.schedules) ? obj.schedules : [])){
    if(!s || !s.plant_id) continue;
    const tasks = [];
    for(const t of (Array.isArray(s.tasks) ? s.tasks : [])){
      const start = toMD(t && t.start), end = toMD((t && t.end) || start);
      const task = String((t && t.task) || '').trim().toLowerCase().replace(/\.$/, '').slice(0, 60);
      if(!task || !MD_RE.test(start)) continue;
      tasks.push({ task, start, end: MD_RE.test(end) ? end : start, notes: String((t && t.notes) || '').trim().slice(0, 240) });
    }
    if(tasks.length) out.push({ plant_id: String(s.plant_id), tasks });
  }
  return out;
}

/* Claude (Anthropic API) for the care calendar. Used when the Worker has an
   ANTHROPIC_API_KEY secret (`wrangler secret put ANTHROPIC_API_KEY`); otherwise
   the care handler falls back to Workers AI above. The model id comes from the
   CARE_MODEL var in wrangler.toml (claude-opus-5-5 or claude-sonnet-5-5).
   Raw HTTP on purpose: the Worker has no bundler/npm deps. */
const CLAUDE_LABELS = { 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-sonnet-5-5': 'Claude Sonnet 5.5' };
const CARE_SCHEMA = {
  type: 'object',
  properties: {
    schedules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          plant_id: { type: 'string' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: { task: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, notes: { type: 'string' } },
              required: ['task', 'start', 'end', 'notes'],
              additionalProperties: false,
            },
          },
        },
        required: ['plant_id', 'tasks'],
        additionalProperties: false,
      },
    },
  },
  required: ['schedules'],
  additionalProperties: false,
};

async function claudeCare(env, sys, user){
  const model = env.CARE_MODEL || 'claude-opus-5-5';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 12000, // thinking + a batch of 6 schedules; only what's used is billed
      system: sys,
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema: CARE_SCHEMA } },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if(!r.ok){
    const msg = (data && data.error && data.error.message) || ('HTTP ' + r.status);
    throw new Error('Claude API: ' + msg);
  }
  if(data.stop_reason === 'refusal') throw new Error('Claude declined to answer this request');
  if(data.stop_reason === 'max_tokens') throw new Error('Claude ran out of room — try fewer plants per batch');
  const text = (Array.isArray(data.content) ? data.content : []).filter(b => b && b.type === 'text').map(b => b.text).join('');
  return { raw: text, model, modelLabel: CLAUDE_LABELS[model] || model, provider: 'Anthropic' };
}

/* Chatbot on Claude (issue #70). Same key as the care calendar; model from the
   CHAT_MODEL var. The big system prompt (all the sheet data) is marked for prompt
   caching so follow-up questions within a few minutes re-read it at a fraction
   of the price. Effort is kept low: these are lookups, not deep reasoning. */
function chatModelInfo(env){
  if(env.ANTHROPIC_API_KEY){
    const model = env.CHAT_MODEL || 'claude-opus-5-5';
    return { model, modelLabel: CLAUDE_LABELS[model] || model, provider: 'Anthropic' };
  }
  return { model: MODEL, modelLabel: modelLabel(MODEL), provider: PROVIDER };
}

async function claudeChat(env, system, history){
  const info = chatModelInfo(env);
  // Claude needs strictly alternating user/assistant turns starting with user.
  const messages = [];
  for(const m of history){
    if(!messages.length && m.role !== 'user') continue;
    const last = messages[messages.length - 1];
    if(last && last.role === m.role) last.content += '\n\n' + m.content;
    else messages.push({ role: m.role, content: m.content });
  }
  if(!messages.length) throw new Error('No question provided');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: info.model,
      max_tokens: 2000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low' },
      messages,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if(!r.ok){
    const msg = (data && data.error && data.error.message) || ('HTTP ' + r.status);
    throw new Error('Claude API: ' + msg);
  }
  if(data.stop_reason === 'refusal') throw new Error('Claude declined to answer that');
  const answer = (Array.isArray(data.content) ? data.content : []).filter(b => b && b.type === 'text').map(b => b.text).join('').trim();
  return { answer, ...info };
}

async function handleCare(body, env, cors){
  const plants = (Array.isArray(body.plants) ? body.plants : []).slice(0, 8);
  if(!plants.length) throw new Error('No plants provided');
  const sys = [
    `You are an expert horticulturist writing a yearly care schedule for a home garden in ${body.city || 'Lilly, PA'} (USDA hardiness zone ${body.zone || '6a'}). Average last spring frost: ${body.lastFrost || 'mid-May'}. Average first fall frost: ${body.firstFrost || 'early October'}.`,
    `Identify each plant from its common name AND its Latin name together. When the Latin name is missing, infer the most likely species and cultivar from the common name, category, tags, and notes, and base the schedule on that (never give generic advice because a field is blank). When the two names disagree, trust the Latin name.`,
    `For EACH plant, list 3 to 7 recurring yearly care tasks, each with a date window (start and end as MM-DD) tuned to this climate and to the specific species. Cover what actually matters for that plant: pruning in the correct season for the species, fertilizing, mulching, watering guidance for newly planted specimens, winter protection and when to remove it, pest or disease timing, deadheading or dividing for perennials, and repotting or moving in/out for container plants. Do not pad with generic filler.`,
    `Task names: short imperative phrases, at most 6 words, lowercase (e.g. "prune", "fertilize", "mulch", "deadhead", "winter protect", "uncover", "repot", "dormant oil spray", "bring inside", "take outside", "divide"). Notes: one concise, practical sentence.`,
    `Respond with ONLY valid JSON, no prose and no markdown fences, exactly in this shape: {"schedules":[{"plant_id":"...","tasks":[{"task":"...","start":"MM-DD","end":"MM-DD","notes":"..."}]}]}`,
  ].join('\n');
  const user = 'Plants:\n' + plants.map(p =>
    `- id=${p.id} | name="${p.name || ''}" | latin="${p.type || ''}" | category=${p.category || ''} | container=${p.container ? 'yes' : 'no'} | spot=${p.spot || ''} | tags=${p.tags || ''} | planted=${p.purchased || ''}${p.notes ? ` | notes="${String(p.notes).slice(0, 200)}"` : ''}`
  ).join('\n');
  let res;
  if(env.ANTHROPIC_API_KEY){
    res = await claudeCare(env, sys, user);
  } else {
    const ai = await env.AI.run(MODEL, { messages: [{ role:'system', content: sys }, { role:'user', content: user }], max_tokens: 2400, temperature: 0.2 });
    res = { raw: String((ai && (ai.response ?? ai.result)) || ''), model: MODEL, modelLabel: modelLabel(MODEL), provider: PROVIDER };
  }
  const schedules = parseCareJson(res.raw);
  return new Response(JSON.stringify({ schedules, model: res.model, modelLabel: res.modelLabel, provider: res.provider }), {
    status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env){
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if(request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Public info endpoint: which model is answering (issue #54). Not sensitive.
    if(request.method === 'GET'){
      return new Response(JSON.stringify(chatModelInfo(env)), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if(request.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });

    // Owner-only gate: require a valid Google login for this app.
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const v = await verifyGoogleToken(token);
    if(!v.ok){
      return new Response(JSON.stringify({ error: 'Sign in with Google to use the assistant.' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    try {
      const body = await request.json();
      if(body.mode === 'care') return await handleCare(body, env, cors);
      const history = (Array.isArray(body.messages) ? body.messages : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-8);
      if(!history.length) throw new Error('No question provided');

      const byName = await loadAll();
      const context = Object.entries(byName).filter(([, t]) => t).map(([n, t]) => `## ${n} (CSV)\n${t}`).join('\n\n');
      const computed = computeTotals(byName);
      const today = new Date().toISOString().slice(0, 10);
      const system = systemPrompt(computed, context, today);

      let res;
      if(env.ANTHROPIC_API_KEY){
        res = await claudeChat(env, system, history);
      } else {
        const ai = await env.AI.run(MODEL, { messages: [{ role: 'system', content: system }, ...history], max_tokens: 600, temperature: 0.3 });
        res = { answer: String((ai && (ai.response ?? ai.result)) || '').trim(), model: MODEL, modelLabel: modelLabel(MODEL), provider: PROVIDER };
      }
      const answer = res.answer || "Sorry, I couldn't come up with an answer for that.";

      return new Response(JSON.stringify({ answer, model: res.model, modelLabel: res.modelLabel, provider: res.provider }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    } catch(e){
      return new Response(JSON.stringify({ error: String((e && e.message) || e) }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};
