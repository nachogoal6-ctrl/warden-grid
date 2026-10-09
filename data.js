// Warden Grid — live data. Every number on the page comes from here; nothing is made up.
//   IMD network:  https://api.imd.fun/swarm            (public, open CORS — imd docs "Agents and seats")
//   One seat:     https://api.imd.fun/seats/:tokenId    (public — imd docs "Agents and seats")
//   Block height: eth_blockNumber on https://ethereum-rpc.publicnode.com (public RPC, no key)
//   IMD price:    https://api.dexscreener.com/latest/dex/tokens/0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7
// When a source can't be reached the page says "no data".
export const IMD = '0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7';
export const INTAKE = '0x1397434cd35e8a9c8ac312a61d3a285eb31dea56';   // oracle intake, same on every chain (imd docs "Pay on chain")

export const S = { swarm: null, swarmAt: 0, block: null, imdUsd: null, events: [], seen: new Set(), online: false, seatOrder: [] };
const listeners = {};
export const on = (ev, fn) => ((listeners[ev] ||= []).push(fn));
const emit = (ev, x) => (listeners[ev] || []).forEach(fn => fn(x));

async function getJSON(url, opts) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

export async function pollSwarm(first) {
  try {
    const j = await getJSON('https://api.imd.fun/swarm');
    S.swarm = j; S.swarmAt = Date.now(); S.online = true;
    // seats ordered by most recent work: unit i in the city stands for seat S.seatOrder[i]
    S.seatOrder = Object.values(j.seats || {}).filter(s => s.last).sort((a, b) => new Date(b.last) - new Date(a.last)).map(s => s.tokenId);
    const evs = (j.events || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
    for (const e of evs) {
      const id = `${e.kind}|${e.at}|${e.jobId || ''}|${e.tokenId ?? ''}|${e.step || ''}|${e.state || ''}`;
      if (S.seen.has(id)) continue; S.seen.add(id); S.events.unshift(e);
      emit('event', { e, live: !first });
    }
    S.events = S.events.slice(0, 80);
  } catch {
    S.online = false; if (first) emit('offline');
  }
  emit('swarm', S);
}

export async function pollBlock() {
  try {
    const j = await getJSON('https://ethereum-rpc.publicnode.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) });
    const b = parseInt(j.result, 16);
    if (b && b !== S.block) { const had = S.block != null; S.block = b; emit('block', { block: b, live: had }); }
  } catch {}
}

export async function pollPrice() {
  try {
    const j = await getJSON(`https://api.dexscreener.com/latest/dex/tokens/${IMD}`);
    const pairs = (j.pairs || []).filter(p => p.baseToken?.address?.toLowerCase() === IMD && p.priceUsd);
    pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    if (pairs[0]) { S.imdUsd = Number(pairs[0].priceUsd); emit('price', S.imdUsd); }
  } catch {}
}

const seatCache = new Map();
export async function getSeat(tokenId) {
  if (seatCache.has(tokenId)) return seatCache.get(tokenId);
  const j = await getJSON(`https://api.imd.fun/seats/${tokenId}?work=5&reviews=0&collaborators=0`);
  seatCache.set(tokenId, j); return j;
}

export function start() {
  pollSwarm(true); pollBlock(); pollPrice();
  setInterval(pollSwarm, 20000); setInterval(pollBlock, 12000); setInterval(pollPrice, 60000);
}
