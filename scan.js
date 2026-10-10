// Warden Grid — scan.exe: the Council checks a token. Facts only, every line with its source. No score, no "buy".
//   Market:   https://api.dexscreener.com/latest/dex/tokens/<address>   (pairs, liquidity, volume, FDV, age, socials)
//   Mirrors:  https://api.dexscreener.com/latest/dex/search?q=<symbol>   (other tokens using the same ticker)
//   Contract: public RPCs (no key) — eth_getCode, owner() 0x8da5cb5b, EIP-1967 implementation slot,
//             totalSupply() 0x18160ddd, decimals() 0x313ce567, balanceOf(0x…dEaD) 0x70a08231
// Thresholds used for flags are printed next to each flag so the reader can judge them.
import { esc, fmt } from './ui.js';
import { sigilSVG } from './avatar.js';

const RPC = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  base: 'https://base-rpc.publicnode.com',
  bsc: 'https://bsc-rpc.publicnode.com',
};
const EIP1967 = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const DEAD = '000000000000000000000000000000000000dead';
const LOW_LIQ = 50000, YOUNG_DAYS = 7;

async function getJSON(url, opts) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
  try { const r = await fetch(url, { ...opts, signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const rpc = (chain, method, params) => getJSON(RPC[chain], { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then(j => { if (j.error) throw new Error(j.error.message); return j.result; });
const call = (chain, to, data) => rpc(chain, 'eth_call', [{ to, data }, 'latest']);
const usd = n => n == null ? '—' : '$' + (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Number(n).toFixed(2));
const short = a => a.slice(0, 6) + '…' + a.slice(-4);
const age = ms => { const d = (Date.now() - ms) / 864e5; return d < 1 ? Math.round(d * 24) + ' h' : d < 60 ? Math.round(d) + ' days' : Math.round(d / 30) + ' months'; };
const big = hex => (hex && hex !== '0x') ? BigInt(hex) : null;

export const AGENTS = [
  { id: 'scout', name: 'SCOUT', job: 'markets & liquidity' },
  { id: 'risk', name: 'RISK', job: 'contract on-chain' },
  { id: 'mirror', name: 'MIRROR', job: 'impostor tickers' },
  { id: 'signal', name: 'SIGNAL', job: 'links & socials' },
  { id: 'warden', name: 'WARDEN', job: 'final report' },
];

export async function runScan(addr, { onStep } = {}) {
  const a = addr.trim().toLowerCase();
  const R = { addr: a, flags: [], facts: {}, step: {} };
  const step = (id, state, html) => { R.step[id] = { state, html }; onStep?.(id, state, html, R); };

  /* SCOUT */
  step('scout', 'working');
  let pairs = [];
  try {
    const j = await getJSON(`https://api.dexscreener.com/latest/dex/tokens/${a}`);
    pairs = (j.pairs || []).filter(p => p.baseToken?.address?.toLowerCase() === a);
  } catch (e) { step('scout', 'nodata', `DexScreener not reachable (${esc(e.message)}). No data.`); }
  if (R.step.scout.state === 'working') {
    if (!pairs.length) { step('scout', 'nodata', 'No trading pair found for this address on DexScreener.'); R.flags.push(['No trading pair listed', 'DexScreener has no pair where this token is the base token']); }
    else {
      pairs.sort((x, y) => (y.liquidity?.usd || 0) - (x.liquidity?.usd || 0));
      const p = pairs[0]; const liq = pairs.reduce((s, x) => s + (x.liquidity?.usd || 0), 0);
      Object.assign(R.facts, { name: p.baseToken.name, symbol: p.baseToken.symbol, chain: p.chainId, pair: p, liq, nPairs: pairs.length });
      const created = Math.min(...pairs.map(x => x.pairCreatedAt || Infinity));
      const tx = p.txns?.h24;
      step('scout', 'done', `<div class="sg">
        <div><span>Main pool</span><b>${esc(p.dexId)} · ${esc(p.baseToken.symbol)}/${esc(p.quoteToken.symbol)} · ${esc(p.chainId)}</b></div>
        <div><span>Liquidity (all ${pairs.length} pairs)</span><b>${usd(liq)}</b></div>
        <div><span>Volume 24h (main)</span><b>${usd(p.volume?.h24)}</b></div>
        <div><span>FDV</span><b>${usd(p.fdv)}</b></div>
        <div><span>Price change 24h</span><b>${p.priceChange?.h24 != null ? p.priceChange.h24 + '%' : '—'}</b></div>
        <div><span>Trades 24h (buys · sells)</span><b>${tx ? fmt(tx.buys) + ' · ' + fmt(tx.sells) : '—'}</b></div>
        <div><span>Oldest pair</span><b>${isFinite(created) ? age(created) : '—'}</b></div></div>
        <p class="ssrc">Source: DexScreener · <a href="${esc(p.url)}" target="_blank" rel="noopener">open pair</a></p>`);
      if (liq < LOW_LIQ) R.flags.push(['Low liquidity', `${usd(liq)} across all pairs (flag under ${usd(LOW_LIQ)})`]);
      if (isFinite(created) && (Date.now() - created) / 864e5 < YOUNG_DAYS) R.flags.push(['Very new', `oldest pair is ${age(created)} old (flag under ${YOUNG_DAYS} days)`]);
    }
  }

  /* RISK */
  const chain = R.facts.chain || 'ethereum';
  step('risk', 'working');
  if (!RPC[chain]) step('risk', 'nodata', `On-chain checks run for Ethereum, Base and BNB Chain. This token trades on <b>${esc(chain)}</b>, so they are skipped.`);
  else {
    try {
      const [code, owner, impl, ts, dec, dead] = await Promise.all([
        rpc(chain, 'eth_getCode', [a, 'latest']),
        call(chain, a, '0x8da5cb5b').catch(() => null),
        rpc(chain, 'eth_getStorageAt', [a, EIP1967, 'latest']).catch(() => null),
        call(chain, a, '0x18160ddd').catch(() => null),
        call(chain, a, '0x313ce567').catch(() => null),
        call(chain, a, '0x70a08231' + DEAD.padStart(64, '0')).catch(() => null),
      ]);
      if (!code || code === '0x') { step('risk', 'done', `No contract code at this address on ${esc(chain)}.`); R.flags.push(['Not a contract here', `no code on ${chain}`]); }
      else {
        const ownerAddr = owner && owner.length >= 66 ? '0x' + owner.slice(-40) : null;
        const renounced = ownerAddr && (/^0x0{40}$/.test(ownerAddr) || ownerAddr.endsWith(DEAD));
        const proxy = impl && BigInt(impl) !== 0n;
        const d = dec ? Number(BigInt(dec)) : null; const supply = big(ts), burned = big(dead);
        const burnPct = supply && burned != null && supply > 0n ? Number(burned * 10000n / supply) / 100 : null;
        const supplyTxt = supply != null && d != null && d <= 36 ? fmt(Math.round(Number(supply) / 10 ** d)) : '—';
        step('risk', 'done', `<div class="sg">
          <div><span>Contract</span><b>${fmt((code.length - 2) / 2)} bytes on ${esc(chain)}</b></div>
          <div><span>Owner</span><b>${ownerAddr ? (renounced ? 'renounced' : short(ownerAddr)) : 'no owner() function'}</b></div>
          <div><span>Upgradeable proxy (EIP-1967)</span><b>${proxy ? 'yes · impl ' + short('0x' + impl.slice(-40)) : 'no'}</b></div>
          <div><span>Total supply</span><b>${supplyTxt}</b></div>
          <div><span>Sent to 0x…dEaD</span><b>${burnPct != null ? burnPct + '%' : '—'}</b></div></div>
          <p class="ssrc">Source: ${esc(RPC[chain].replace('https://', ''))} (eth_getCode, eth_call, eth_getStorageAt)</p>`);
        if (ownerAddr && !renounced) R.flags.push(['Owner still set', `${short(ownerAddr)} can call owner-only functions, if the contract has any`]);
        if (proxy) R.flags.push(['Upgradeable', 'the contract logic can be replaced by whoever controls the proxy']);
      }
    } catch (e) { step('risk', 'nodata', `RPC not reachable (${esc(e.message)}). No data.`); }
  }

  /* MIRROR */
  step('mirror', 'working');
  if (!R.facts.symbol) step('mirror', 'nodata', 'No ticker known, so impostors can\'t be searched.');
  else {
    try {
      const j = await getJSON(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(R.facts.symbol)}`);
      const others = new Map();
      for (const p of j.pairs || []) {
        const t = p.baseToken; if (!t || t.symbol?.toLowerCase() !== R.facts.symbol.toLowerCase() || t.address.toLowerCase() === a) continue;
        const k = p.chainId + ':' + t.address.toLowerCase(); const o = others.get(k) || { chain: p.chainId, addr: t.address, liq: 0 };
        o.liq += p.liquidity?.usd || 0; others.set(k, o);
      }
      const list = [...others.values()].sort((x, y) => y.liq - x.liq);
      step('mirror', 'done', list.length
        ? `<p><b>${list.length}</b> other token${list.length > 1 ? 's' : ''} use the ticker <b>${esc(R.facts.symbol)}</b> in the first page of search results:</p>
           <ul class="mir">${list.slice(0, 6).map(o => `<li>${sigilSVG(o.addr, 18)}<span>${esc(o.chain)}</span><code>${esc(short(o.addr))}</code><span>${usd(o.liq)} liq.</span></li>`).join('')}</ul>
           <p class="ssrc">Source: DexScreener search. Always check the full address, not the ticker.</p>`
        : `<p>No other token with the ticker <b>${esc(R.facts.symbol)}</b> in the first page of search results.</p><p class="ssrc">Source: DexScreener search</p>`);
      if (list.length) R.flags.push(['Ticker is shared', `${list.length} other token${list.length > 1 ? 's' : ''} called ${R.facts.symbol}: mirror.exe risk`]);
    } catch (e) { step('mirror', 'nodata', `Search not reachable (${esc(e.message)}). No data.`); }
  }

  /* SIGNAL */
  step('signal', 'working');
  const info = R.facts.pair?.info;
  if (!R.facts.pair) step('signal', 'nodata', 'No pair, so no listed links.');
  else {
    const links = [...(info?.websites || []).map(w => ['web', w.url]), ...(info?.socials || []).map(s => [s.type, s.url])].filter(l => /^https:\/\//.test(l[1]));
    step('signal', 'done', links.length
      ? `<ul class="lnk">${links.slice(0, 6).map(([t, u]) => `<li><span>${esc(t)}</span><a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(u.replace(/^https:\/\//, '').slice(0, 42))}</a></li>`).join('')}</ul><p class="ssrc">Links as listed on DexScreener by the token's team. Not checked by the Grid.</p>`
      : '<p>No website or socials listed on DexScreener.</p><p class="ssrc">Source: DexScreener</p>');
    if (!links.length) R.flags.push(['No links listed', 'no website or socials on DexScreener']);
  }

  /* WARDEN */
  step('warden', 'done', R.flags.length
    ? `<ul class="flags">${R.flags.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ul>`
    : '<p>No flags from these checks. That doesn\'t make a token safe. It means none of these specific checks tripped.</p>');
  return R;
}

export function scanHeader(R) {
  const f = R.facts;
  return `<div class="sh">${sigilSVG(R.addr, 46)}<div><b>${esc(f.name || 'Unknown token')}${f.symbol ? ' · ' + esc(f.symbol) : ''}</b><code>${esc(R.addr)}</code></div></div>`;
}
