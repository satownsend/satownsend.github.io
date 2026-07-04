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

const SHEETS = {
  plants:       { id: '1Q1kRZG0jjkYF7pCSZXZIgE5B_kCorDovO2I7ATE3vUM', gid: '0' },
  plants_log:   { id: '1Q1kRZG0jjkYF7pCSZXZIgE5B_kCorDovO2I7ATE3vUM', gid: '322094770' },
  beers:        { id: '1BXFTqV6xCZU63IutRAeAFPrZKLyDPkuGQ-SykIdAy_k', gid: '0' },
  instruments:  { id: '1dWWWIFBpWvNOIBuxA1EIoaffKckDFhsHvPDzhbxdnYg', gid: '0' },
  maintenance:  { id: '1dWWWIFBpWvNOIBuxA1EIoaffKckDFhsHvPDzhbxdnYg', gid: '834291047' },
  wildlife:     { id: '1Uq2Fgzron3yDZqYFWsUx1cYigp4w8GmQP2pmk33DG54', gid: '0' },
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

async function fetchCsv(id, gid){
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  try {
    const r = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
    if(!r.ok) return '';
    return (await r.text()).replace(/^﻿/, '').trim();
  } catch(e){ return ''; }
}

async function loadAll(){
  const entries = Object.entries(SHEETS);
  const texts = await Promise.all(entries.map(([, s]) => fetchCsv(s.id, s.gid)));
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

  return [
    `# COMPUTED TOTALS`,
    `These are calculated exactly in code from the sheets — treat them as AUTHORITATIVE and do NOT recompute them by hand. Use them for any count/sum/average question they cover.`,
    ``,
    `Plants: ${P.length} total rows, ${living.length} living (excludes dead and wishlist).`,
    `Plant spending is price × quantity (some plants have quantity > 1). Total spent on plants: ${money(spendYearTotal)} — report THIS figure; it matches the "Money spent per year" chart on the site. (Aside, only if relevant: a few plants have a price but no purchase date; including those the fuller total would be ${money(spendAll)}.) Spend by year: ${perYear || 'none'}.`,
    `Beers: ${B.length} total. Average ABV across all with a value: ${avgAbv.toFixed(1)}%. Average ABV of the most recent 10 by brew date: ${avgLast10.toFixed(1)}% (from ${last10Abv.length} of those 10 that list an ABV).`,
    `Instruments: ${I.length} total. Combined value / total spent (sum of prices): ${money(instValue)}. Maintenance-log entries: ${M.length}.`,
    `Wildlife: ${W.length} sightings across ${species.size} distinct species.`,
  ].join('\n');
}

function systemPrompt(computed, context, today){
  return [
    `You are the friendly assistant for Scott Townsend's personal dashboards at satownsend.com.`,
    `He tracks: plants (yard/garden inventory) and a plants care log (which includes frost events and frost dates), homebrewed beers, musical instruments and an instrument maintenance log (string changes, setups, etc.), and wildlife sightings.`,
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

export default {
  async fetch(request, env){
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if(request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Public info endpoint: which model is answering (issue #54). Not sensitive.
    if(request.method === 'GET'){
      return new Response(JSON.stringify({ model: MODEL, modelLabel: modelLabel(MODEL), provider: PROVIDER }), {
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
      const history = (Array.isArray(body.messages) ? body.messages : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-8);
      if(!history.length) throw new Error('No question provided');

      const byName = await loadAll();
      const context = Object.entries(byName).filter(([, t]) => t).map(([n, t]) => `## ${n} (CSV)\n${t}`).join('\n\n');
      const computed = computeTotals(byName);
      const today = new Date().toISOString().slice(0, 10);
      const messages = [{ role: 'system', content: systemPrompt(computed, context, today) }, ...history];

      const ai = await env.AI.run(MODEL, { messages, max_tokens: 600, temperature: 0.3 });
      const answer = String((ai && (ai.response ?? ai.result)) || '').trim()
        || "Sorry, I couldn't come up with an answer for that.";

      return new Response(JSON.stringify({ answer, model: MODEL, modelLabel: modelLabel(MODEL), provider: PROVIDER }), {
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
