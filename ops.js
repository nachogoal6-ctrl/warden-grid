// Warden Grid — ops.exe: the operations terminal. Eight agents read live markets; the Warden scores what they find;
// the Autopilot trades it ON PAPER (simulation with real prices). No real funds move from this page.
//
// Sources (all public, no key, CORS-open — checked 2026-10-10):
//   GeckoTerminal  https://api.geckoterminal.com/api/v2/networks/{eth|base}/new_pools · /trending_pools · /pools/{pool}/trades
//   DexScreener    https://api.dexscreener.com/token-profiles/latest/v1 · /token-boosts/top/v1 · /tokens/v1/{chain}/{csv}
//   DefiLlama      https://api.llama.fi/v2/chains · https://api.llama.fi/overview/dexs/{chain}
//   CoinGecko      https://api.coingecko.com/api/v3/simple/price (ETH, BTC)
//   Public RPCs    ethereum-rpc.publicnode.com · base-rpc.publicnode.com (eth_getCode, owner(), EIP-1967 slot)
// Every score is computed from those numbers with the rules printed in the Radar. A stage without a source says "limited".
import { esc, fmt } from './ui.js';
import { sigilSVG } from './avatar.js';

export const NETS = {
  eth:  { name: 'Ethereum', gt: 'eth', ds: 'ethereum', llama: 'Ethereum', rpc: 'https://ethereum-rpc.publicnode.com' },
  base: { name: 'Base', gt: 'base', ds: 'base', llama: 'Base', rpc: 'https://base-rpc.publicnode.com' },
};
export const AGENTS = [
  { id: 'scout', name: 'SCOUT', job: 'finds new & trending pools' },
  { id: 'risk', name: 'RISK', job: 'contract & liquidity review' },
  { id: 'whale', name: 'WHALE', job: 'large trades on the tape' },
  { id: 'momentum', name: 'MOMENTUM', job: 'price & volume' },
  { id: 'social', name: 'SOCIAL', job: 'profiles, links, boosts' },
  { id: 'dev', name: 'DEV', job: 'who controls the contract' },
  { id: 'exit', name: 'EXIT', job: 'watches open positions' },
  { id: 'warden', name: 'WARDEN', job: 'final decision' },
];
const EIP1967 = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const CYCLE_MS = 90000, PRICE_MS = 30000, WHALE_USD = 5000;

/* ------------------------------ helpers ------------------------------ */
async function getJSON(url, opts) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const rpc = (net, method, params) => getJSON(NETS[net].rpc, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then(j => { if (j.error) throw new Error(j.error.message); return j.result; });
const num = x => x == null || x === '' ? null : Number(x);
export const usd = n => n == null || !isFinite(n) ? '—' : (n < 0 ? '-' : '') + '$' + (Math.abs(n) >= 1e9 ? (Math.abs(n) / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e3 ? (Math.abs(n) / 1e3).toFixed(1) + 'K' : Math.abs(n).toFixed(2));
const price = p => p == null ? '—' : p >= 1 ? '$' + p.toFixed(4) : p >= 0.0001 ? '$' + p.toPrecision(4) : '$' + p.toExponential(3);
export const money = n => n == null || !isFinite(n) ? '—' : (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = v => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%';
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';
const ago = ms => { const s = (Date.now() - ms) / 1000; return s < 60 ? Math.round(s) + 's' : s < 3600 ? Math.round(s / 60) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lin = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

/* ------------------------------ state ------------------------------ */
const store = { get(k, d) { try { const v = localStorage.getItem('wg-ops-' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('wg-ops-' + k, JSON.stringify(v)); } catch {} } };
const DEF_CFG = { on: false, bank: 1000, size: 100, maxPos: 5, minScore: 85, stop: 15, take: 40, trail: 12, maxHoldH: 24 };
export const O = {
  net: store.get('net', 'eth'), cands: new Map(), riskCache: new Map(), tape: [], intel: [], market: null, majors: null,
  agents: {}, cycleAt: 0, nextAt: 0, running: false,
  cfg: { ...DEF_CFG, ...store.get('cfg', {}) },
  book: store.get('book', { cash: null, pos: [], closed: [] }),
};
if (O.book.cash == null) O.book.cash = O.cfg.bank;
const save = () => { store.set('cfg', O.cfg); store.set('book', O.book); store.set('net', O.net); };
const listeners = new Set(); export const onOps = fn => listeners.add(fn); const ping = (ev, x) => listeners.forEach(fn => fn(ev, x));
function agent(id, state, stat, note) { O.agents[id] = { state, stat, note, at: Date.now() }; ping('agent', id); }
function intel(kind, text, extra = {}) { O.intel.unshift({ at: Date.now(), kind, text, ...extra }); O.intel = O.intel.slice(0, 120); ping('intel'); }

/* ------------------------------ agents ------------------------------ */
async function scout() {
  const n = NETS[O.net]; agent('scout', 'working', '…');
  const got = [];
  for (const kind of ['new_pools', 'trending_pools']) {
    try {
      const j = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${n.gt}/${kind}?include=base_token`);
      const toks = new Map((j.included || []).map(t => [t.id, t.attributes]));
      for (const p of j.data || []) {
        const a = p.attributes, bt = toks.get(p.relationships?.base_token?.data?.id) || {};
        if (!bt.address) continue;
        got.push({ key: bt.address.toLowerCase(), pool: a.address, name: a.name, symbol: bt.symbol || a.name.split(' / ')[0], token: bt.address.toLowerCase(),
          src: kind === 'new_pools' ? 'new' : 'trending', price: num(a.base_token_price_usd), fdv: num(a.fdv_usd), liq: num(a.reserve_in_usd),
          vol1: num(a.volume_usd?.h1), vol24: num(a.volume_usd?.h24), ch1: num(a.price_change_percentage?.h1), ch6: num(a.price_change_percentage?.h6), ch24: num(a.price_change_percentage?.h24),
          b1: a.transactions?.h1?.buyers ?? null, s1: a.transactions?.h1?.sellers ?? null, buys24: a.transactions?.h24?.buys ?? null, sells24: a.transactions?.h24?.sells ?? null,
          created: a.pool_created_at ? Date.parse(a.pool_created_at) : null, seen: Date.now() });
      }
    } catch (e) { intel('sys', `scout: GeckoTerminal ${kind.replace('_', ' ')} not reachable (${e.message})`); }
  }
  // keep the most liquid pool per token
  const byTok = new Map(); for (const c of got) { const o = byTok.get(c.key); if (!o || (c.liq || 0) > (o.liq || 0)) byTok.set(c.key, { ...c, src: o && o.src !== c.src ? 'new+trending' : c.src }); }
  let fresh = 0;
  for (const [k, c] of byTok) { if (!O.cands.has(k)) { fresh++; if (fresh <= 4) intel('scout', `found ${c.symbol} (${c.src}) · liq ${usd(c.liq)} · vol 24h ${usd(c.vol24)}`, { token: k }); } O.cands.set(k, { ...(O.cands.get(k) || {}), ...c }); }
  // forget candidates not seen for 30 min (unless held)
  const held = new Set(O.book.pos.map(p => p.token));
  for (const [k, c] of O.cands) if (Date.now() - c.seen > 30 * 60e3 && !held.has(k)) O.cands.delete(k);
  agent('scout', got.length ? 'done' : 'limited', fmt(byTok.size), got.length ? `${fresh} new this cycle` : 'no source reachable');
}

function momentum() {
  let sig = 0;
  for (const c of O.cands.values()) {
    const turn = c.liq ? (c.vol24 || 0) / c.liq : 0;
    const press = c.b1 != null && c.s1 != null && c.b1 + c.s1 > 0 ? c.b1 / (c.b1 + c.s1) : null;
    c.m = { turn, press };
    if ((c.ch1 || 0) > 5 && (press || 0) > 0.55) sig++;
  }
  agent('momentum', 'done', fmt(sig), 'tokens with rising price and more buyers than sellers (1h)');
}

async function risk() {
  agent('risk', 'working', '…'); agent('dev', 'working', '…');
  const list = [...O.cands.values()].sort((a, b) => (b.liq || 0) - (a.liq || 0)).slice(0, 18);
  let reviewed = 0, blocked = 0, renounced = 0, failed = 0;
  await Promise.all(list.map(async c => {
    const cached = O.riskCache.get(c.token);
    if (cached && Date.now() - cached.at < 10 * 60e3) { c.r = cached; }
    else {
      try {
        const [code, owner, impl] = await Promise.all([
          rpc(O.net, 'eth_getCode', [c.token, 'latest']),
          rpc(O.net, 'eth_call', [{ to: c.token, data: '0x8da5cb5b' }, 'latest']).catch(() => null),
          rpc(O.net, 'eth_getStorageAt', [c.token, EIP1967, 'latest']).catch(() => null),
        ]);
        const ownerAddr = owner && owner.length >= 66 ? '0x' + owner.slice(-40) : null;
        c.r = { at: Date.now(), code: code && code !== '0x' ? (code.length - 2) / 2 : 0, owner: ownerAddr,
          renounced: !ownerAddr ? null : /^0x0{40}$/.test(ownerAddr) || ownerAddr.toLowerCase().endsWith('dead'),
          proxy: impl ? BigInt(impl) !== 0n : null };
        O.riskCache.set(c.token, c.r);
      } catch { failed++; return; }
    }
    reviewed++; if (c.r.renounced) renounced++;
  }));
  for (const c of O.cands.values()) {
    const why = [];
    if (c.r && !c.r.code) why.push('no contract code');
    if ((c.liq || 0) < 20000) why.push('liquidity under $20K');
    if (c.created && Date.now() - c.created < 15 * 60e3) why.push('pool younger than 15 min');
    if (c.r?.proxy && c.r?.renounced === false) why.push('upgradeable and owner still set');
    c.blocked = why; if (why.length) blocked++;
  }
  agent('risk', !reviewed ? 'limited' : 'done', `${fmt(reviewed)} / ${fmt(blocked)}`, 'reviewed / blocked');
  agent('dev', reviewed ? 'done' : 'limited', fmt(renounced), `ownership renounced, of ${reviewed} checked · deployer history needs an indexer (not connected)`);
}

async function whale() {
  agent('whale', 'working', '…');
  const n = NETS[O.net];
  const top = [...O.cands.values()].filter(c => !c.blocked?.length).sort((a, b) => (b.vol1 || 0) - (a.vol1 || 0)).slice(0, 4);
  let big = 0;
  for (const c of top) {
    try {
      const j = await getJSON(`https://api.geckoterminal.com/api/v2/networks/${n.gt}/pools/${c.pool}/trades?trade_volume_in_usd_greater_than=${WHALE_USD}`);
      let net = 0, cnt = 0;
      for (const t of j.data || []) {
        const a = t.attributes; const at = Date.parse(a.block_timestamp); const v = num(a.volume_in_usd) || 0;
        if (Date.now() - at > 3600e3) continue;
        cnt++; net += a.kind === 'buy' ? v : -v;
        const id = a.tx_hash + a.kind;
        if (!O.tape.some(x => x.id === id)) { O.tape.unshift({ id, at, side: a.kind, sym: c.symbol, usd: v, from: a.tx_from_address, tx: a.tx_hash, token: c.token }); big++; }
      }
      c.w = { net, cnt };
    } catch {}
  }
  O.tape.sort((a, b) => b.at - a.at); O.tape = O.tape.slice(0, 60);
  if (big) intel('whale', `${big} trades over ${usd(WHALE_USD)} in the last hour on watched pools`);
  agent('whale', top.length ? 'done' : 'limited', fmt(O.tape.filter(t => Date.now() - t.at < 3600e3).length), `trades over ${usd(WHALE_USD)} · last hour`);
}

async function social() {
  agent('social', 'working', '…');
  try {
    const [prof, boost] = await Promise.all([
      getJSON('https://api.dexscreener.com/token-profiles/latest/v1').catch(() => []),
      getJSON('https://api.dexscreener.com/token-boosts/top/v1').catch(() => []),
    ]);
    const ds = NETS[O.net].ds; const P = new Map(), B = new Map();
    for (const p of prof || []) if (p.chainId === ds) P.set(p.tokenAddress.toLowerCase(), p);
    for (const b of boost || []) if (b.chainId === ds) B.set(b.tokenAddress.toLowerCase(), b);
    let withLinks = 0;
    for (const c of O.cands.values()) {
      const p = P.get(c.token), b = B.get(c.token);
      if (p) c.links = (p.links || []).length; if (b) c.boost = b.totalAmount;
      if (c.links) withLinks++;
    }
    agent('social', 'limited', fmt(withLinks), 'with a DexScreener profile · X / Telegram / news need a paid source (not connected)');
  } catch { agent('social', 'limited', '—', 'no source reachable'); }
}

/* ------------------------------ the Warden's score ------------------------------ */
// 100 points, every part printed in the Radar. Hard blocks (RISK) always win.
export const RULES = [
  ['Liquidity', 20, '$20K → $1M (log scale)'],
  ['Turnover', 15, '24h volume ÷ liquidity, 0.2× → 3×'],
  ['Momentum', 15, '1h change 0 → +25%, 6h not below -20%'],
  ['Buy pressure', 10, 'buyers ÷ (buyers + sellers), last hour, 50% → 75%'],
  ['Age', 10, 'best between 6 h and 30 days'],
  ['Contract', 20, 'code present 4 · not a proxy 6 · owner renounced 10'],
  ['Large trades', 10, 'net buys over $5K in the last hour, $0 → $50K'],
];
const CODES = ['liq', 'turn', 'mom', 'buy', 'age', 'ctr', 'big'];
function score(c) {
  const parts = [];
  parts.push(c.liq ? 20 * lin(Math.log10(c.liq), Math.log10(2e4), 6) : 0);
  parts.push(15 * lin(c.m?.turn || 0, 0.2, 3));
  parts.push(c.ch1 == null ? 0 : 15 * lin(c.ch1, 0, 25) * ((c.ch6 ?? 0) < -20 ? 0.3 : 1));
  parts.push(c.m?.press == null ? 0 : 10 * lin(c.m.press, 0.5, 0.75));
  const ageH = c.created ? (Date.now() - c.created) / 3600e3 : null;
  parts.push(ageH == null ? 0 : ageH < 6 ? 10 * lin(ageH, 0.25, 6) : ageH <= 720 ? 10 : 10 * (1 - lin(ageH, 720, 4320)) * 0.6 + 4);
  parts.push(c.r ? (c.r.code ? 4 : 0) + (c.r.proxy === false ? 6 : 0) + (c.r.renounced ? 10 : 0) : 0);
  parts.push(c.w ? 10 * lin(c.w.net, 0, 50000) : 0);
  const total = Math.round(parts.reduce((a, b) => a + b, 0));
  // what's missing, so a low score can be read honestly
  const missing = []; if (!c.r) missing.push('contract not reviewed yet'); if (!c.w) missing.push('tape not read');
  return { total, parts: parts.map(p => Math.round(p * 10) / 10), missing };
}
function decide() {
  let top = null, picks = 0;
  for (const c of O.cands.values()) { c.s = score(c); if (!c.blocked?.length && c.s.total >= O.cfg.minScore) picks++; if (!top || c.s.total > top.s.total) top = c; }
  agent('warden', 'done', `${picks}`, `over ${O.cfg.minScore} · best ${top ? top.symbol + ' ' + top.s.total : '—'}`);
  return picks;
}

/* ------------------------------ market ------------------------------ */
async function market() {
  const n = NETS[O.net];
  try {
    const [chains, dex] = await Promise.all([getJSON('https://api.llama.fi/v2/chains'), getJSON(`https://api.llama.fi/overview/dexs/${n.llama.toLowerCase()}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`)]);
    const ch = chains.find(c => c.name === n.llama);
    O.market = { at: Date.now(), tvl: ch?.tvl ?? null, vol24: dex.total24h ?? null, ch1d: dex.change_1d ?? null, ch7d: dex.change_7d ?? null, vol7: dex.total7d ?? null,
      dexes: (dex.protocols || []).filter(p => p.total24h).sort((a, b) => b.total24h - a.total24h).slice(0, 6).map(p => ({ name: p.displayName || p.name, v: p.total24h, ch: p.change_1d })) };
  } catch { O.market = { at: Date.now(), err: true }; }
  try { O.majors = await getJSON('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true'); } catch {}
  ping('market');
}

/* ------------------------------ autopilot (paper) ------------------------------ */
// A fill costs the pool fee (assumed 0.3%) plus price impact ≈ size ÷ (2 × liquidity). Both are shown on each fill.
const fillCost = (size, liq) => 0.003 + (liq ? size / (2 * liq) : 0.05);
function autopilot() {
  const C = O.cfg, B = O.book; if (!C.on) return;
  const open = new Set(B.pos.map(p => p.token));
  const picks = [...O.cands.values()].filter(c => !c.blocked?.length && c.s?.total >= C.minScore && !open.has(c.token) && c.price)
    .sort((a, b) => b.s.total - a.s.total);
  for (const c of picks) {
    if (B.pos.length >= C.maxPos || B.cash < C.size) break;
    const cost = fillCost(C.size, c.liq), entry = c.price * (1 + cost);
    B.cash -= C.size;
    B.pos.push({ id: Date.now() + '-' + c.token.slice(2, 8), token: c.token, sym: c.symbol, pool: c.pool, net: O.net, size: C.size, entry, qty: C.size / entry, at: Date.now(), last: c.price, peak: c.price, score: c.s.total, cost });
    intel('auto', `PAPER BUY ${c.symbol} · ${usd(C.size)} at ${price(entry)} (score ${c.s.total}, est. cost ${(cost * 100).toFixed(2)}%)`, { token: c.token });
    ping('trade', { side: 'buy', sym: c.symbol });
  }
  save();
}
function exitCheck() {
  const C = O.cfg, B = O.book; let watched = 0;
  for (const p of [...B.pos]) {
    watched++;
    const ch = (p.last / p.entry - 1) * 100, fromPeak = (p.last / p.peak - 1) * 100, holdH = (Date.now() - p.at) / 3600e3;
    let why = null;
    if (ch <= -C.stop) why = `stop-loss ${pct(ch)}`;
    else if (ch >= C.take) why = `take-profit ${pct(ch)}`;
    else if (p.peak > p.entry * 1.05 && fromPeak <= -C.trail) why = `trailing stop ${pct(fromPeak)} from peak`;
    else if (holdH >= C.maxHoldH) why = `max hold ${C.maxHoldH}h`;
    if (why) closePos(p, why);
  }
  agent('exit', B.pos.length || watched ? 'done' : 'idle', fmt(B.pos.length), 'open paper positions watched');
}
export function closePos(p, why) {
  const B = O.book; const liq = O.cands.get(p.token)?.liq; const cost = fillCost(p.qty * p.last, liq);
  const out = p.qty * p.last * (1 - cost);
  B.cash += out; B.pos = B.pos.filter(x => x.id !== p.id);
  B.closed.unshift({ ...p, exit: p.last * (1 - cost), out, pnl: out - p.size, closedAt: Date.now(), why }); B.closed = B.closed.slice(0, 200);
  intel('auto', `PAPER SELL ${p.sym} · ${why} · P/L ${money(out - p.size)}`, { token: p.token });
  ping('trade', { side: 'sell', sym: p.sym }); save();
}
async function refreshPrices() {
  const B = O.book; if (!B.pos.length) return;
  const byNet = {}; for (const p of B.pos) (byNet[p.net] ||= []).push(p);
  for (const [net, list] of Object.entries(byNet)) {
    try {
      const j = await getJSON(`https://api.dexscreener.com/tokens/v1/${NETS[net].ds}/${[...new Set(list.map(p => p.token))].slice(0, 30).join(',')}`);
      const best = new Map();
      for (const pr of j || []) { const k = pr.baseToken?.address?.toLowerCase(); if (!k || !pr.priceUsd) continue; const o = best.get(k); if (!o || (pr.liquidity?.usd || 0) > (o.liquidity?.usd || 0)) best.set(k, pr); }
      for (const p of list) { const pr = best.get(p.token); if (pr) { p.last = Number(pr.priceUsd); p.peak = Math.max(p.peak, p.last); p.pricedAt = Date.now(); } }
    } catch {}
  }
  exitCheck(); save(); ping('book');
}
export function stopAll() {
  O.cfg.on = false; for (const p of [...O.book.pos]) closePos(p, 'stop all');
  intel('auto', 'STOP ALL · autopilot off, every paper position closed'); save(); ping('book');
}
export function resetBook() { O.book = { cash: O.cfg.bank, pos: [], closed: [] }; save(); ping('book'); intel('auto', `paper account reset to ${usd(O.cfg.bank)}`); }
export function setCfg(patch) { Object.assign(O.cfg, patch); save(); ping('book'); }
export function setNet(n) { if (!NETS[n] || n === O.net) return; O.net = n; O.cands.clear(); O.tape = []; save(); intel('sys', `network → ${NETS[n].name}`); runCycle(); }
export function equity() { return O.book.cash + O.book.pos.reduce((s, p) => s + p.qty * p.last, 0); }

/* ------------------------------ the cycle ------------------------------ */
export async function runCycle() {
  if (O.running) return; O.running = true; ping('cycle');
  try {
    await scout(); momentum(); await risk(); await whale(); await social();
    const picks = decide();
    if (picks) intel('warden', `${picks} token${picks > 1 ? 's' : ''} over the threshold of ${O.cfg.minScore}`);
    autopilot(); exitCheck();
  } finally { O.running = false; O.cycleAt = Date.now(); O.nextAt = Date.now() + CYCLE_MS; ping('cycle'); }
}
let started = false;
export function startOps() {
  if (started) return; started = true;
  AGENTS.forEach(a => agent(a.id, 'idle', '—', 'waiting for the first cycle'));
  market(); runCycle(); setInterval(runCycle, CYCLE_MS); setInterval(refreshPrices, PRICE_MS); setInterval(market, 10 * 60e3);
}

/* ------------------------------ views ------------------------------ */
export const views = {
  matrix() {
    return `<div class="mx">${AGENTS.map(a => { const s = O.agents[a.id] || {};
      return `<div class="mx-a s-${s.state || 'idle'}">${sigilSVG('ops:' + a.id, 34)}<div class="mx-t"><b>${a.name}</b><span>${esc(a.job)}</span></div>
        <div class="mx-v"><strong>${esc(s.stat ?? '—')}</strong><em>${esc(s.state || 'idle')}</em></div><p>${esc(s.note || '')}</p></div>`; }).join('')}</div>
      <p class="src">Each number is counted from the data the terminal holds right now. A stage without a data source says <b>limited</b> instead of showing zero.</p>`;
  },
  radar() {
    const all = [...O.cands.values()].filter(c => c.s).sort((a, b) => b.s.total - a.s.total);
    const sel = all.filter(c => !c.blocked?.length && c.s.total >= O.cfg.minScore);
    const near = all.filter(c => !c.blocked?.length && c.s.total < O.cfg.minScore).slice(0, 10);
    const blocked = all.filter(c => c.blocked?.length).slice(0, 8);
    const row = c => `<tr data-tok="${esc(c.token)}"><td>${sigilSVG(c.token, 20)}<b>${esc(c.symbol)}</b><small>${esc(c.src)}</small></td><td class="sc">${c.s.total}</td>
      <td>${usd(c.liq)}</td><td>${usd(c.vol24)}</td><td class="${(c.ch1 || 0) >= 0 ? 'up' : 'dn'}">${pct(c.ch1)}</td><td>${c.created ? ago(c.created) : '—'}</td>
      <td class="why">${c.blocked?.length ? esc(c.blocked.join(' · ')) : RULES.map((r, i) => `${CODES[i]} ${c.s.parts[i]}`).join(' · ') + (c.s.missing.length ? ' · ' + esc(c.s.missing.join(', ')) : '')}</td></tr>`;
    const head = '<tr><th>Token</th><th>Score</th><th>Liquidity</th><th>Vol 24h</th><th>1h</th><th>Age</th><th>Detail</th></tr>';
    return `<div class="rd-h"><b>${sel.length ? sel.length + ' over the threshold' : 'Nothing over the threshold right now'}</b>
        <span>threshold <strong>${O.cfg.minScore}</strong> · ${fmt(all.length)} tokens scored on ${esc(NETS[O.net].name)}</span></div>
      ${sel.length ? `<table class="rd">${head}${sel.map(row).join('')}</table>` : `<p class="note">An empty list is a result, not a failure. The nearest candidates are shown below so you can see how far the market is, not as buy suggestions.</p>`}
      ${near.length ? `<p class="sect">Closest to the threshold</p><table class="rd">${head}${near.map(row).join('')}</table>` : ''}
      ${blocked.length ? `<p class="sect">Blocked by RISK</p><table class="rd dim">${head}${blocked.map(row).join('')}</table>` : ''}
      <details class="rules"><summary>How the Warden scores (100 points)</summary><ul>${RULES.map(r => `<li><b>${r[0]} (${CODES[RULES.indexOf(r)]}) · ${r[1]}</b><span>${esc(r[2])}</span></li>`).join('')}
        <li><b>Hard blocks</b><span>no contract code · liquidity under $20K · pool younger than 15 min · upgradeable with an owner still set</span></li></ul>
        <p>Sources: GeckoTerminal (pools, trades), DexScreener (profiles), public RPC (contract). A score is arithmetic on public data, not advice.</p></details>`;
  },
  market() {
    const m = O.market, mj = O.majors;
    const tiles = [...O.cands.values()].filter(c => c.vol24).sort((a, b) => b.vol24 - a.vol24).slice(0, 24);
    const maxV = Math.max(1, ...tiles.map(t => t.vol24));
    return `<div class="mk">
      <div class="kv2"><span>${esc(NETS[O.net].name)} TVL</span><strong>${m?.tvl != null ? usd(m.tvl) : 'no data'}</strong></div>
      <div class="kv2"><span>DEX volume 24h</span><strong>${m?.vol24 != null ? usd(m.vol24) : 'no data'}</strong><em class="${(m?.ch1d || 0) >= 0 ? 'up' : 'dn'}">${m?.ch1d != null ? pct(m.ch1d) + ' vs day before' : ''}</em></div>
      <div class="kv2"><span>DEX volume 7d</span><strong>${m?.vol7 != null ? usd(m.vol7) : 'no data'}</strong><em>${m?.ch7d != null ? pct(m.ch7d) + ' vs week before' : ''}</em></div>
      <div class="kv2"><span>ETH · BTC</span><strong>${mj ? usd(mj.ethereum.usd) + ' · ' + usd(mj.bitcoin.usd) : 'no data'}</strong><em>${mj ? pct(mj.ethereum.usd_24h_change) + ' · ' + pct(mj.bitcoin.usd_24h_change) : ''}</em></div></div>
      ${m?.dexes?.length ? `<p class="sect">Top DEXs by 24h volume</p><ul class="dexl">${m.dexes.map(d => `<li><span>${esc(d.name)}</span><b>${usd(d.v)}</b><em class="${(d.ch || 0) >= 0 ? 'up' : 'dn'}">${pct(d.ch)}</em></li>`).join('')}</ul>` : ''}
      <p class="sect">Heatmap · size = 24h volume · shade = 24h change</p>
      <div class="heat">${tiles.length ? tiles.map(t => { const s = Math.sqrt(t.vol24 / maxV); const c = t.ch24 ?? 0;
        return `<div class="ht" data-tok="${esc(t.token)}" style="flex-grow:${(0.6 + s * 4).toFixed(2)};--a:${(0.12 + Math.min(1, Math.abs(c) / 60) * 0.6).toFixed(2)}" title="${esc(t.symbol)} ${pct(c)}"><b>${esc(t.symbol)}</b><span class="${c >= 0 ? 'up' : 'dn'}">${pct(c)}</span></div>`; }).join('') : '<p class="note">Waiting for SCOUT.</p>'}</div>
      <p class="src">Sources: DefiLlama (TVL, DEX volume) · CoinGecko (ETH, BTC) · GeckoTerminal (heatmap)${m?.at ? ' · read ' + ago(m.at) + ' ago' : ''}</p>`;
  },
  tape() {
    return O.tape.length ? `<table class="rd tp"><tr><th>When</th><th>Side</th><th>Token</th><th>Amount</th><th>Wallet</th></tr>${O.tape.slice(0, 40).map(t =>
      `<tr><td>${ago(t.at)}</td><td class="${t.side === 'buy' ? 'up' : 'dn'}">${t.side === 'buy' ? 'BUY' : 'SELL'}</td><td>${esc(t.sym)}</td><td>${usd(t.usd)}</td><td>${sigilSVG(t.from || '', 16)}<code>${esc(short(t.from))}</code></td></tr>`).join('')}</table>
      <p class="src">Trades over ${usd(WHALE_USD)} on the four busiest unblocked pools, last hour. Source: GeckoTerminal trades. Other wallets, not yours. Large is not the same as smart.</p>`
      : '<p class="note">No large trades read yet. WHALE reads the tape once per cycle.</p>';
  },
  intel() {
    return `<ul class="intel">${O.intel.slice(0, 80).map(i => `<li class="k-${i.kind}"><span class="t">${new Date(i.at).toLocaleTimeString([], { hour12: false })}</span><span class="k">${esc(i.kind)}</span><span>${esc(i.text)}</span></li>`).join('') || '<li><span>Waiting for the first cycle.</span></li>'}</ul>
      <p class="src">Built from what the agents find. News and social feeds are not connected (no free source), so they are not shown.</p>`;
  },
  auto() {
    const C = O.cfg, B = O.book, eq = equity(), pnl = eq - C.bank;
    const realized = B.closed.reduce((s, c) => s + c.pnl, 0), wins = B.closed.filter(c => c.pnl > 0).length;
    return `<div class="ap-h ${C.on ? 'on' : ''}"><div><b>AUTOPILOT · ${C.on ? 'RUNNING' : 'OFF'}</b><span>Paper trading: real prices, simulated fills, no funds. Every buy and sell follows the limits below.</span></div>
        <div class="ap-btns"><button class="ap-go" data-ap="toggle">${C.on ? 'pause' : 'start autopilot'}</button><button class="ap-stop" data-ap="stop">stop all</button></div></div>
      <div class="mk">
        <div class="kv2"><span>Equity (paper)</span><strong>${money(eq)}</strong><em class="${pnl >= 0 ? 'up' : 'dn'}">${pct(pnl / C.bank * 100)} since start</em></div>
        <div class="kv2"><span>Cash</span><strong>${money(B.cash)}</strong></div>
        <div class="kv2"><span>Realized P/L</span><strong class="${realized >= 0 ? 'up' : 'dn'}">${money(realized)}</strong><em>${B.closed.length} trades · ${B.closed.length ? Math.round(wins / B.closed.length * 100) + '% won' : '—'}</em></div>
        <div class="kv2"><span>Open</span><strong>${B.pos.length} / ${C.maxPos}</strong></div></div>
      <form class="ap-cfg" id="ap-cfg">
        ${[['size', 'Per trade ($)', 10, 100000], ['maxPos', 'Max positions', 1, 20], ['minScore', 'Min score', 50, 100], ['stop', 'Stop-loss %', 1, 90], ['take', 'Take-profit %', 1, 1000], ['trail', 'Trailing stop %', 1, 90], ['maxHoldH', 'Max hold (h)', 1, 720], ['bank', 'Starting bank ($)', 100, 1e7]]
          .map(([k, l, mn, mx]) => `<label><span>${l}</span><input type="number" name="${k}" min="${mn}" max="${mx}" value="${C[k]}"></label>`).join('')}
        <button type="submit">save limits</button><button type="button" data-ap="reset">reset paper account</button></form>
      <p class="sect">Open positions</p>
      ${B.pos.length ? `<table class="rd"><tr><th>Token</th><th>Size</th><th>Entry</th><th>Now</th><th>P/L</th><th>Held</th><th></th></tr>${B.pos.map(p => { const v = p.qty * p.last, pl = v - p.size;
        return `<tr><td>${sigilSVG(p.token, 18)}<b>${esc(p.sym)}</b><small>${esc(NETS[p.net]?.name || '')}</small></td><td>${usd(p.size)}</td><td>${price(p.entry)}</td><td>${price(p.last)}</td><td class="${pl >= 0 ? 'up' : 'dn'}">${money(pl)} · ${pct((p.last / p.entry - 1) * 100)}</td><td>${ago(p.at)}</td><td><button class="mini" data-close="${esc(p.id)}">close</button></td></tr>`; }).join('')}</table>` : '<p class="note">No open positions.</p>'}
      ${B.closed.length ? `<p class="sect">History</p><table class="rd dim"><tr><th>Token</th><th>Size</th><th>P/L</th><th>Reason</th><th>Closed</th></tr>${B.closed.slice(0, 20).map(c => `<tr><td><b>${esc(c.sym)}</b></td><td>${usd(c.size)}</td><td class="${c.pnl >= 0 ? 'up' : 'dn'}">${money(c.pnl)}</td><td>${esc(c.why)}</td><td>${ago(c.closedAt)} ago</td></tr>`).join('')}</table>` : ''}
      <div class="live-box"><b>Live trading · not enabled</b><p>Real execution needs two decisions first (network, and whether you sign each trade or a limited vault + 24/7 bot trades for you). Until then the Autopilot only trades on paper, in this browser.</p></div>
      <p class="src">Simulated fills charge an assumed 0.3% pool fee plus price impact ≈ size ÷ (2 × liquidity). Prices: GeckoTerminal at entry, DexScreener while open (every 30 s, only while this page is open). Paper account is kept in this browser only.</p>`;
  },
};
