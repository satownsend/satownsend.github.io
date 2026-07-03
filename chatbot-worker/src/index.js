/* satownsend.com chatbot — Cloudflare Worker (issue #48).
 *
 * Answers natural-language questions about the dashboards' data using
 * Cloudflare Workers AI. The browser POSTs { messages: [...] }; this Worker
 * fetches the public Google Sheets, stuffs them into the prompt as context,
 * calls the model, and returns { answer }.
 *
 * No API keys: Workers AI runs on your Cloudflare account (free tier: 10k
 * Neurons/day). The whole dataset is ~8k tokens, so it fits the model context
 * with room to spare — no trimming needed.
 */

// Swap to '@cf/openai/gpt-oss-120b' (128k ctx, stronger) if you want more power.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

async function buildContext(){
  const entries = Object.entries(SHEETS);
  const csvs = await Promise.all(entries.map(([, s]) => fetchCsv(s.id, s.gid)));
  return entries
    .map(([name], i) => csvs[i] ? `## ${name} (CSV)\n${csvs[i]}` : '')
    .filter(Boolean)
    .join('\n\n');
}

function systemPrompt(context, today){
  return [
    `You are the friendly assistant for Scott Townsend's personal dashboards at satownsend.com.`,
    `He tracks: plants (yard/garden inventory) and a plants care log (which includes frost events and frost dates), homebrewed beers, musical instruments and an instrument maintenance log (string changes, setups, etc.), and wildlife sightings.`,
    ``,
    `Rules:`,
    `- Answer ONLY from the DATA below. If it isn't there, say you don't have that information — do not make things up.`,
    `- Be concise and conversational. Prefer a direct answer first, then a short supporting detail.`,
    `- The data is CSV with header rows. Join across sheets by id when needed (e.g. a maintenance row's instrument_id matches an instrument's id; a plants_log row's plantId matches a plant's id).`,
    `- For calculations (averages, counts, "last time", "how many"), work precisely from the rows and show the key numbers you used. ABV values may include a "%" sign — strip it before averaging.`,
    `- Dates are YYYY-MM-DD. Today is ${today}.`,
    ``,
    `# DATA`,
    context,
  ].join('\n');
}

export default {
  async fetch(request, env){
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if(request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if(request.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });

    try {
      const body = await request.json();
      const history = (Array.isArray(body.messages) ? body.messages : [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-8);
      if(!history.length) throw new Error('No question provided');

      const context = await buildContext();
      const today = new Date().toISOString().slice(0, 10);
      const messages = [{ role: 'system', content: systemPrompt(context, today) }, ...history];

      const ai = await env.AI.run(MODEL, { messages, max_tokens: 600, temperature: 0.3 });
      const answer = String((ai && (ai.response ?? ai.result)) || '').trim()
        || "Sorry, I couldn't come up with an answer for that.";

      return new Response(JSON.stringify({ answer }), {
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
