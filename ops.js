// Warden Grid — ops.exe views. The engine (agents, score, paper autopilot) lives in opscore.js.
import { esc } from './ui.js';
import { sigilSVG } from './avatar.js';
import { O, NETS, AGENTS, RULES, CODES, WHALE_USD, usd, money, price, pct, short, ago, fmt, equity } from './opscore.js';
export * from './opscore.js';

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
      <div class="live-box"><b>Live trading · your own vault</b><p>This tab is the paper simulation. Real trading runs from a vault you own on Ethereum, Base or Robinhood Chain, traded 24/7 by the keeper bot inside limits you sign: open the <b>Live vault</b> tab.</p></div>
      <p class="src">Simulated fills charge an assumed 0.3% pool fee plus price impact ≈ size ÷ (2 × liquidity). Prices: GeckoTerminal at entry, DexScreener while open (every 30 s, only while this page is open). Paper account is kept in this browser only.</p>`;
  },
};
