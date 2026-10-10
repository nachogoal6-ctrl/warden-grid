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

/* ------------------------------ guide: how it all works (live) ------------------------------ */
const WIRE = [ // agent, x, y on a 640×300 board; the Warden chip sits in the middle
  ['scout', 70, 40], ['risk', 70, 110], ['whale', 70, 180], ['dev', 70, 250],
  ['momentum', 570, 40], ['social', 570, 110], ['exit', 570, 250],
];
function wiring() {
  const live = id => { const a = O.agents[id]; return a && (a.state === 'working' || (a.state === 'done' && Date.now() - a.at < 2 * 90000)); };
  const cx = 320, cy = 140;
  const traces = WIRE.map(([id, x, y], i) => {
    const left = x < cx, xe = left ? cx - 62 : cx + 62, xm = left ? x + 90 + i * 6 : x - 90 - i * 6;
    const d = `M${left ? x + 52 : x - 52},${y} H${xm} V${cy - 30 + (i % 4) * 20} H${xe}`;
    const on = live(id), st = O.agents[id] || {};
    return `<path d="${d}" class="tr ${on ? 'on' : ''}" id="tr-${id}"/>
      ${on ? `<circle r="3.2" class="pk"><animateMotion dur="${1.6 + (i % 3) * 0.4}s" repeatCount="indefinite"><mpath href="#tr-${id}"/></animateMotion></circle>` : ''}
      <g class="node ${st.state || 'idle'}" transform="translate(${x},${y})"><rect x="-52" y="-18" width="104" height="36"/><text y="-3">${id.toUpperCase()}</text><text y="11" class="sub">${esc((st.state || 'idle') + ' · ' + (st.stat ?? '—'))}</text></g>`;
  }).join('');
  const w = O.agents.warden || {};
  return `<svg class="wire-board" viewBox="0 0 640 300" role="img" aria-label="How the agents feed the Warden">
    <defs><pattern id="pcb" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" class="grid"/></pattern></defs>
    <rect width="640" height="300" fill="url(#pcb)"/>
    ${traces}
    <path d="M${cx},${cy + 34} V285 H470" class="tr ${O.cfg.on ? 'on' : ''}" id="tr-exec"/>
    <g class="node exec" transform="translate(520,285)"><rect x="-50" y="-13" width="100" height="26"/><text y="4">EXECUTION</text></g>
    <g class="chip" transform="translate(${cx},${cy})"><rect x="-62" y="-34" width="124" height="68"/>
      ${[-44, -22, 0, 22, 44].map(x => `<line x1="${x}" y1="-34" x2="${x}" y2="-42"/><line x1="${x}" y1="34" x2="${x}" y2="42"/>`).join('')}
      <text y="-8">WARDEN</text><text y="10" class="sub">${esc(w.state || 'idle')}</text><text y="24" class="sub">${esc(w.stat ?? '—')} over ${O.cfg.minScore}</text></g>
  </svg>`;
}
function funnel() {
  const all = [...O.cands.values()], scored = all.filter(c => c.s);
  const passed = scored.filter(c => !c.blocked?.length), floor = passed.filter(c => c.s.total >= 60), sel = passed.filter(c => c.s.total >= O.cfg.minScore);
  const rows = [['Detected', all.length, 'pools SCOUT sees on ' + NETS[O.net].name], ['Passed RISK', passed.length, `${scored.length - passed.length} blocked by a hard rule`],
    ['Score ≥ 60', floor.length, 'the keeper never buys under this floor'], [`Score ≥ ${O.cfg.minScore}`, sel.length, 'what an agent with the default threshold would buy'],
    ['Executed on paper', O.book.pos.length, O.cfg.on ? 'open paper positions in this browser' : 'paper autopilot is off']];
  const max = Math.max(1, rows[0][1]);
  return `<div class="fn">${rows.map(([l, n, sub]) => `<div class="fn-r"><span class="fn-l">${l}</span><div class="fn-b"><i style="width:${Math.max(n ? 3 : 0, n / max * 100).toFixed(1)}%"></i></div><b>${fmt(n)}</b><em>${esc(sub)}</em></div>`).join('')}</div>`;
}
function decision() {
  const top = [...O.cands.values()].filter(c => c.s && !c.blocked?.length).sort((a, b) => b.s.total - a.s.total)[0];
  if (!top) return '<p class="note">Waiting for the first cycle of the agents.</p>';
  const r = 52, C = 2 * Math.PI * r, v = top.s.total;
  return `<div class="dc"><svg viewBox="0 0 130 130" class="ring"><circle cx="65" cy="65" r="${r}" class="bg"/><circle cx="65" cy="65" r="${r}" class="fg" stroke-dasharray="${(C * v / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 65 65)"/>
      <text x="65" y="66">${v}</text><text x="65" y="84" class="sub">/ 100</text></svg>
    <div class="dc-i"><span>Best token right now</span><b>${sigilSVG(top.token, 18)} ${esc(top.symbol)}</b><em>${v >= O.cfg.minScore ? 'over the threshold' : `${O.cfg.minScore - v} points short of ${O.cfg.minScore} · not bought`}</em>
      <div class="dc-bars">${RULES.map((rl, i) => `<div><span>${rl[0]}</span><i style="--w:${(top.s.parts[i] / rl[1] * 100).toFixed(0)}%"></i><b>${top.s.parts[i]}/${rl[1]}</b></div>`).join('')}</div>
      ${top.s.missing.length ? `<p class="note">${esc(top.s.missing.join(' · '))}: those parts count as 0 until read.</p>` : ''}</div></div>`;
}
views.guide = () => `
  <section class="gd-hero"><div><p class="eyebrow">how it works</p><h2>The Grid hunts while you sleep.</h2>
    <p>Eight agents read the market from different angles. The Warden turns what they find into one decision. Your agent trades it, inside the limits you sign. You can stop it at any moment.</p>
    <div class="gd-cta"><button class="ap-go" data-goto="live">create your agent</button><button class="mini" data-goto="matrix">see the agents live</button></div></div>
    ${wiring()}</section>
  <p class="src">Live wiring: a trace carries moving light only while that agent is really working (or reported in the last two cycles). It is the real pipeline, not an illustration.</p>
  <div class="gd-steps">
    <div><i>01</i><b>Discover</b><p>SCOUT reads new and trending pools on ${esc(NETS[O.net].name)} and keeps the token behind each one.</p></div>
    <div><i>02</i><b>Analyze</b><p>RISK and DEV open the contract, WHALE reads the large trades, MOMENTUM the price and the buyers, SOCIAL what it can hear.</p></div>
    <div><i>03</i><b>Decide</b><p>The Warden adds the seven parts into a 0–100 score. Hard rules block first. Only scores over the threshold get bought.</p></div>
    <div><i>04</i><b>Trade &amp; exit</b><p>Your agent buys inside your limits. EXIT sells on your stop, target, trailing stop or time limit.</p></div></div>
  <h3 class="gd-h">From the whole board to a candidate <span>live</span></h3>${funnel()}
  <p class="src">Each stage only counts what passed the one before. An empty end is a result, not a failure: the threshold doesn't drop because the market is quiet.</p>
  <h3 class="gd-h">The Warden decides <span>live</span></h3>${decision()}
  <h3 class="gd-h">Reasoning, as it happens <span>live</span></h3>
  <ul class="intel">${O.intel.slice(0, 8).map(i => `<li class="k-${i.kind}"><span class="t">${new Date(i.at).toLocaleTimeString([], { hour12: false })}</span><span class="k">${esc(i.kind)}</span><span>${esc(i.text)}</span></li>`).join('') || '<li><span>Waiting for the first cycle.</span></li>'}</ul>
  <h3 class="gd-h">From decision to trade</h3>
  <ol class="gd-flow">${['Connect your wallet', 'Name your agent', 'Pick a risk profile', 'Check the limits and strategy', 'Choose the keeper and its fee', 'Sign once: your agent is live'].map((t, i) => `<li><i>${i + 1}</i>${t}</li>`).join('')}</ol>
  <p class="note">Nothing moves outside the per-trade cap, the daily cap and the sell floor you signed. Pause, change or withdraw at any time.</p>
  <h3 class="gd-h">How your funds are protected</h3>
  <div class="gd-rules">
    <div><b>Your keys stay yours.</b><p>Every step is signed in your own wallet. The site and the keeper never see a private key or a seed phrase.</p></div>
    <div><b>The bot can only swap.</b><p>Through one fixed Uniswap router, with your agent as the only recipient. It can't withdraw or send funds anywhere else.</p></div>
    <div><b>Hard limits on-chain.</b><p>Per trade, per day, number of positions and a sell floor, enforced by the contract, not by trust.</p></div>
    <div><b>You can always leave.</b><p>Pause stops new trades at once. Revoke removes the bot. Withdraw works even while paused or if the site is down.</p></div></div>
  <h3 class="gd-h">Questions</h3>
  <div class="gd-faq">
    <details><summary>What is an agent here?</summary><p>A vault contract that only you own, plus the strategy you set for it. A keeper bot runs the eight Warden agents and trades your vault when the score says so.</p></details>
    <details><summary>Where does the data come from?</summary><p>GeckoTerminal, DexScreener, DefiLlama, CoinGecko and public blockchain RPCs, read live. A stage without a source says "limited" instead of inventing a number.</p></details>
    <details><summary>Can it spend my wallet?</summary><p>No. It can only trade what you deposit into your agent, inside your limits. Your wallet is never connected to the bot.</p></details>
    <details><summary>What does it cost?</summary><p>The keeper fee you choose (up to 1%) on each buy the keeper makes, which pays its gas. Sells and your own trades are free. Plus normal pool fees.</p></details>
    <details><summary>Can I stop it?</summary><p>Yes, any time: pause, revoke the keeper, or withdraw everything, from the My agent tab or straight on the contract.</p></details>
    <details><summary>Is it audited?</summary><p>The contracts have 73 tests and two independent internal reviews, all findings fixed. They are not externally audited yet: start with small amounts.</p></details>
    <details><summary>Will it make money?</summary><p>Nobody can promise that. The agents read public data and follow rules; markets can still go against any position. Only trade what you can afford to lose.</p></details>
  </div>`;
