// Warden Grid — Live vault panel: the owner's side of a WardenVault (create, fund, limits, keeper, pause, withdraw).
// Every action is a transaction the owner signs in their own wallet. Nothing here holds keys or moves funds by itself.
// viem is loaded from jsdelivr only when this panel opens.
import { esc } from './ui.js';
import { CHAINS, NETS } from './opscore.js';
import { CREATE2_DEPLOYER, FACTORY_SALT, FACTORY_INITCODE } from './factorycode.js';
import { SERVICE, PROFILES } from './config.js';
import { sigilSVG } from './avatar.js';

// Factory per chain: its CREATE2 address is computed from (deployer, salt, creation code + WETH + router), and the page
// checks on-chain whether code is there. FACTORY[net] = address once deployed, null before.
export const FACTORY = { eth: null, base: null, rh: null };
const EXPECTED = {};
async function factoryInfo(net) {
  const { getContractAddress, encodeAbiParameters, concat } = await viem();
  const code = concat([FACTORY_INITCODE, encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [CHAINS[net].weth, CHAINS[net].router])]);
  const addr = getContractAddress({ opcode: 'CREATE2', from: CREATE2_DEPLOYER, salt: FACTORY_SALT, bytecode: code });
  const p = await pub(); const onchain = await p.getBytecode({ address: addr }).catch(() => null);
  EXPECTED[net] = { addr, code };
  FACTORY[net] = onchain && onchain !== '0x' ? addr : null;
  return EXPECTED[net];
}

const VIEM = 'https://cdn.jsdelivr.net/npm/viem@2.21.54/+esm';
let V = null; const viem = async () => (V ||= await import(VIEM));
const ABI_SRC = {
  factory: ['function create(address keeper, (uint128 maxPerTrade, uint128 dailyCap, uint16 maxPositions, uint16 maxSellLossBps, uint16 keeperFeeBps) limits, (uint8 minScore, uint8 stopPct, uint16 takePct, uint8 trailPct, uint16 maxHoldH, uint16 slippageBps, uint8 profile) strategy, bytes32 name) payable returns (address)', 'function vaultsOf(address owner) view returns (address[])', 'function vaultCount() view returns (uint256)'],
  vault: ['function owner() view returns (address)', 'function keeper() view returns (address)', 'function paused() view returns (bool)', 'function allowlistOnly() view returns (bool)',
    'function limits() view returns (uint128 maxPerTrade, uint128 dailyCap, uint16 maxPositions, uint16 maxSellLossBps, uint16 keeperFeeBps)', 'function spentTodayNow() view returns (uint256)',
    'function strategy() view returns (uint8 minScore, uint8 stopPct, uint16 takePct, uint8 trailPct, uint16 maxHoldH, uint16 slippageBps, uint8 profile)', 'function name() view returns (bytes32)',
    'function setStrategy((uint8 minScore, uint8 stopPct, uint16 takePct, uint8 trailPct, uint16 maxHoldH, uint16 slippageBps, uint8 profile), bytes32)',
    'function positions() view returns (address[])', 'function costBasis(address) view returns (uint256)', 'function weth() view returns (address)', 'function router() view returns (address)',
    'function setKeeper(address)', 'function setPaused(bool)', 'function setLimits((uint128 maxPerTrade, uint128 dailyCap, uint16 maxPositions, uint16 maxSellLossBps, uint16 keeperFeeBps))',
    'function withdraw(address token, uint256 amount, address to)', 'function withdrawETH(uint256 amount, address to)', 'function forget(address token)', 'function wrap()'],
  erc20: ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'],
};
const L = { net: 'eth', account: null, vault: null, state: null, msg: '', busy: false, step: 1, draft: { name: '', profile: 2, ...PROFILES[2].limits, ...PROFILES[2].strat, dep: 0, keeper: SERVICE.keeper || '', fee: SERVICE.feeBps / 100 } };
try { const s = JSON.parse(localStorage.getItem('wg-live') || '{}'); if (s.net) L.net = s.net; if (s.vault) L.vault = s.vault; } catch {}
const remember = () => { try { localStorage.setItem('wg-live', JSON.stringify({ net: L.net, vault: L.vault })); } catch {} };

const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—';
const eth = (v, d = 4) => v == null ? '—' : (Number(v) / 1e18).toFixed(d);
const pub = async () => { const { createPublicClient, http } = await viem(); return createPublicClient({ transport: http(NETS[L.net].rpc) }); };
const abis = async () => { const { parseAbi } = await viem(); return { f: parseAbi(ABI_SRC.factory), v: parseAbi(ABI_SRC.vault), e: parseAbi(ABI_SRC.erc20) }; };

async function wallet() {
  if (!window.ethereum) throw new Error('No browser wallet found. Install one (e.g. a MetaMask-compatible wallet) to manage a vault.');
  const { createWalletClient, custom, defineChain } = await viem();
  const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const id = CHAINS[L.net].chainId, hex = '0x' + id.toString(16);
  try { await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }); }
  catch (e) {
    if (e.code !== 4902) throw e;
    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: NETS[L.net].name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: [NETS[L.net].rpc], blockExplorerUrls: [CHAINS[L.net].explorer] }] });
  }
  L.account = addr;
  const chain = defineChain({ id, name: NETS[L.net].name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [NETS[L.net].rpc] } } });
  return createWalletClient({ account: addr, chain, transport: custom(window.ethereum) });
}

async function load() {
  if (!L.vault) { L.state = null; return; }
  const p = await pub(), A = await abis(); const rd = (fn, args = []) => p.readContract({ address: L.vault, abi: A.v, functionName: fn, args });
  const [owner, keeper, paused, lim, spent, pos, weth, router, strat, nameHex] = await Promise.all(['owner', 'keeper', 'paused', 'limits', 'spentTodayNow', 'positions', 'weth', 'router', 'strategy', 'name'].map(f => rd(f)));
  const { hexToString } = await viem(); let agentName = ''; try { agentName = hexToString(nameHex, { size: 32 }).replace(/\0+$/, ''); } catch {}
  const wethBal = await p.readContract({ address: weth, abi: A.e, functionName: 'balanceOf', args: [L.vault] });
  const ethRaw = await p.getBalance({ address: L.vault });
  const positions = await Promise.all(pos.map(async t => ({ t, bal: await p.readContract({ address: t, abi: A.e, functionName: 'balanceOf', args: [L.vault] }).catch(() => null),
    sym: await p.readContract({ address: t, abi: A.e, functionName: 'symbol' }).catch(() => short(t)), cost: await rd('costBasis', [t]) })));
  L.state = { owner, keeper, paused, lim, spent, weth, router, wethBal, ethRaw, positions, strat, agentName, okRouter: router.toLowerCase() === CHAINS[L.net].router };
}

async function tx(label, fn) {
  if (L.busy) return; L.busy = true; L.msg = `${label}: confirm in your wallet…`; draw();
  try {
    const w = await wallet(); const p = await pub();
    const hash = await fn(w, await abis());
    L.msg = `${label}: sent, waiting… ${hash}`; draw();
    const rc = await p.waitForTransactionReceipt({ hash });
    L.msg = `${label}: ${rc.status} · <a href="${CHAINS[L.net].explorer}/tx/${hash}" target="_blank" rel="noopener">view transaction</a>`;
    await load();
  } catch (e) { L.msg = `${label}: ${esc(e.shortMessage || e.message)}`; }
  L.busy = false; draw();
}

let root = null;
function draw() { if (root) root.innerHTML = view(); }
const STEPS = ['Name', 'Profile', 'Limits', 'Keeper', 'Review'];
function wizard(f) {
  const d = L.draft, st = L.step;
  const bar = `<ol class="wz-steps">${STEPS.map((n, i) => `<li class="${i + 1 === st ? 'on' : i + 1 < st ? 'done' : ''}">${i + 1}<span>${n}</span></li>`).join('')}</ol>`;
  const nav = (next = 'next') => `<div class="wz-nav">${st > 1 ? '<button type="button" class="mini" data-lv="back">back</button>' : '<span></span>'}<button>${next}</button></div>`;
  let body = '';
  if (st === 1) body = `<form data-lvf="wz" class="wz"><div class="wz-hero">${sigilSVG((L.account || 'agent') + ':' + (d.name || 'new'), 64)}<p>Your agent is a vault only you own. A keeper bot trades it for you around the clock, inside the limits you sign.</p></div>
      <label><span>Agent name</span><input name="name" maxlength="31" value="${esc(d.name)}" placeholder="e.g. Night Owl" required></label>
      <label><span>Network</span><select name="net">${Object.keys(CHAINS).map(k => `<option value="${k}" ${k === L.net ? 'selected' : ''}>${esc(NETS[k].name)}</option>`).join('')}</select></label>${nav()}</form>`;
  if (st === 2) body = `<form data-lvf="wz" class="wz"><div class="wz-prof">${Object.entries(PROFILES).map(([k, p]) => `<label class="pf ${Number(k) === d.profile ? 'on' : ''}"><input type="radio" name="profile" value="${k}" ${Number(k) === d.profile ? 'checked' : ''}><b>${p.label}</b><span>${esc(p.blurb)}</span><em>score ≥ ${p.strat.minScore} · ${p.limits.mpt} ETH/trade · stop ${p.strat.stopPct}%</em></label>`).join('')}</div>${nav()}</form>`;
  if (st === 3) body = `<form data-lvf="wz" class="wz wz-grid">
      ${[['mpt', 'Max per trade (ETH)', 'any'], ['cap', 'Daily cap on buys (ETH)', 'any'], ['pos', 'Max positions (≤ 50)', '1'], ['loss', 'Sell floor: max loss %', '1'], ['minScore', 'Buy at score ≥', '1'], ['stopPct', 'Stop-loss %', '1'], ['takePct', 'Take-profit %', '1'], ['trailPct', 'Trailing stop %', '1'], ['maxHoldH', 'Max hold (hours)', '1'], ['slippageBps', 'Slippage (bps)', '1'], ['dep', 'Initial deposit (ETH)', 'any']]
        .map(([k, l, step]) => `<label><span>${l}</span><input name="${k}" type="number" step="${step}" min="0" value="${d[k]}"></label>`).join('')}${nav()}</form>`;
  if (st === 4) body = `<form data-lvf="wz" class="wz">
      ${SERVICE.keeper ? `<p>Warden keeper service: <code>${short(SERVICE.keeper)}</code>. It finds your agent by itself once it's created.</p>` : `<p class="note">The project's keeper service address is not announced yet. Paste the keeper you want to trade your agent (for example your own warden-keeper). You can change it later.</p>`}
      <label><span>Keeper address</span><input name="keeper" value="${esc(d.keeper)}" placeholder="0x…" spellcheck="false" required></label>
      <label><span>Service fee per keeper buy (%) · max 1</span><input name="fee" type="number" step="0.01" min="0" max="1" value="${d.fee}"></label>
      <p class="note">You pay the service: that share of each buy the keeper makes goes to the keeper, which pays the gas. Sells and your own trades are free. Most it can earn per day: fee × daily cap.</p>${nav()}</form>`;
  if (st === 5) body = `<form data-lvf="wz" class="wz"><div class="ag-head">${sigilSVG((L.account || 'agent') + ':' + d.name, 48)}<div><b>${esc(d.name)}</b><span>${esc(PROFILES[d.profile]?.label || 'Custom')} on ${esc(NETS[L.net].name)}</span></div></div>
      <ul class="rows"><li><span>Per trade · daily cap</span><span>${d.mpt} · ${d.cap} ETH</span></li><li><span>Positions · sell floor</span><span>${d.pos} · −${d.loss}%</span></li>
        <li><span>Buys at score ≥</span><span>${d.minScore}</span></li><li><span>Stop · take · trail · max hold</span><span>${d.stopPct}% · ${d.takePct}% · ${d.trailPct}% · ${d.maxHoldH}h</span></li>
        <li><span>Keeper · fee</span><span>${short(d.keeper)} · ${d.fee}%</span></li><li><span>Deposit now</span><span>${d.dep} ETH</span></li></ul>
      <p class="note">One transaction in your wallet creates the agent with these settings. You can pause, change or withdraw everything later.</p>
      ${nav(f ? 'sign & create agent' : 'factory not deployed on this network')}</form>`;
  return bar + body;
}

function view() {
  const f = FACTORY[L.net], s = L.state, isOwner = s && L.account && s.owner.toLowerCase() === L.account.toLowerCase();
  const nets = Object.keys(CHAINS).map(k => `<option value="${k}" ${k === L.net ? 'selected' : ''}>${esc(NETS[k].name)}</option>`).join('');
  return `<div class="lv">
    <div class="ap-h on"><div><b>YOUR AGENT · REAL FUNDS</b><span>Your own trading agent: a vault only you own, traded 24/7 by a keeper inside the limits and strategy you sign. Pause, change or withdraw at any moment. Contracts reviewed internally, not externally audited: start small.</span></div>
      <div class="ap-btns"><select class="lv-net" aria-label="Network">${nets}</select><button class="ap-go" data-lv="connect">${L.account ? short(L.account) : 'connect wallet'}</button></div></div>
    ${L.msg ? `<p class="lv-msg">${L.msg}</p>` : ''}
    <div class="lv-grid">
      <section class="lv-card"><h4>Create your agent</h4>
        ${f ? `<p>Factory on ${esc(NETS[L.net].name)}: <a href="${CHAINS[L.net].explorer}/address/${f}" target="_blank" rel="noopener"><code>${short(f)}</code></a></p>`
          : EXPECTED[L.net] ? `<p class="note">The vault factory is <b>not deployed on ${esc(NETS[L.net].name)} yet</b>. Its address will be <code>${short(EXPECTED[L.net].addr)}</code> (fixed by CREATE2). Anyone can deploy it with one transaction: the factory has no owner and gives the deployer no control.</p>
            <button type="button" class="ap-go lv-deploy" data-lv="deploy">deploy factory on ${esc(NETS[L.net].name)}</button>`
          : '<p class="note">Checking the factory on-chain…</p>'}
        ${wizard(f)}</section>
      <section class="lv-card"><h4>Your agent</h4>
        <form data-lvf="open"><label><span>Vault address</span><input name="addr" value="${esc(L.vault || '')}" placeholder="0x…" spellcheck="false"></label><button>open</button>${f && L.account ? '<button type="button" data-lv="mine">find mine</button>' : ''}</form>
        ${s ? `${s.okRouter ? '' : '<p class="serr">This vault uses a different router than the one verified for this network.</p>'}
          <div class="ag-head">${sigilSVG(L.vault, 48)}<div><b>${esc(s.agentName || 'Unnamed agent')}</b><span>${esc(PROFILES[s.strat[6]]?.label || 'Custom')} · score ≥ ${s.strat[0]} · stop ${s.strat[1]}% · take ${s.strat[2]}% · trail ${s.strat[3]}% · max ${s.strat[4]}h</span></div></div>
          <ul class="rows">
            <li><span>Owner</span><span>${short(s.owner)}${isOwner ? ' · you' : ''}</span></li>
            <li><span>Keeper</span><span>${/^0x0{40}$/.test(s.keeper) ? 'revoked' : short(s.keeper)}</span></li>
            <li><span>Status</span><span class="${s.paused ? 'dn' : 'up'}">${s.paused ? 'paused' : 'active'}</span></li>
            <li><span>WETH</span><span>${eth(s.wethBal)}${s.ethRaw > 0n ? ` · raw ETH ${eth(s.ethRaw)} (wrap it)` : ''}</span></li>
            <li><span>Max per trade · daily cap</span><span>${eth(s.lim[0])} · ${eth(s.lim[1])} ETH (spent today ${eth(s.spent)})</span></li>
            <li><span>Max positions · sell floor</span><span>${s.lim[2]} · −${Number(s.lim[3]) / 100}%</span></li>
            <li><span>Service fee (keeper buys only)</span><span>${Number(s.lim[4]) / 100}%</span></li></ul>
          ${s.positions.length ? `<p class="sect">Positions</p><table class="rd"><tr><th>Token</th><th>Balance</th><th>Cost (WETH)</th><th></th></tr>${s.positions.map(x => `<tr><td><b>${esc(x.sym)}</b> <code>${short(x.t)}</code></td><td>${x.bal == null ? '?' : eth(x.bal, 2)}</td><td>${eth(x.cost)}</td><td>${isOwner ? `<button class="mini" data-lv="wtok" data-t="${x.t}">withdraw</button> <button class="mini" data-lv="forget" data-t="${x.t}">forget</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="note">No positions.</p>'}
          ${isOwner ? `<div class="lv-acts">
            <form data-lvf="deposit"><input name="amt" type="number" step="any" min="0" placeholder="ETH"><button>deposit</button></form>
            <button class="ap-stop" data-lv="${s.paused ? 'unpause' : 'pause'}">${s.paused ? 'resume bot' : 'pause bot'}</button>
            <button class="ap-stop" data-lv="revoke">revoke keeper</button>
            <button class="ap-stop" data-lv="wall">withdraw all ETH</button>
            ${s.ethRaw > 0n ? '<button class="mini" data-lv="wrap">wrap raw ETH</button>' : ''}</div>
            <form data-lvf="limits" class="lv-lim"><span>Change limits</span>
              <input name="mpt" type="number" step="any" placeholder="max/trade ETH" value="${eth(s.lim[0])}"><input name="cap" type="number" step="any" placeholder="daily ETH" value="${eth(s.lim[1])}">
              <input name="pos" type="number" min="1" max="50" value="${s.lim[2]}" title="max positions"><input name="loss" type="number" min="0" max="100" value="${Number(s.lim[3]) / 100}" title="sell floor %"><input name="fee" type="number" step="0.01" min="0" max="1" value="${Number(s.lim[4]) / 100}" title="service fee %"><button>save</button></form>
            <form data-lvf="strategy" class="lv-lim"><span>Strategy</span>
              <input name="name" maxlength="31" value="${esc(s.agentName)}" placeholder="name"><input name="minScore" type="number" min="0" max="100" value="${s.strat[0]}" title="min score"><input name="stopPct" type="number" min="0" max="100" value="${s.strat[1]}" title="stop %"><input name="takePct" type="number" min="0" max="10000" value="${s.strat[2]}" title="take %"><input name="trailPct" type="number" min="0" max="100" value="${s.strat[3]}" title="trail %"><input name="maxHoldH" type="number" min="0" max="8760" value="${s.strat[4]}" title="max hold h"><input name="slippageBps" type="number" min="10" max="2000" value="${s.strat[5]}" title="slippage bps"><button>save</button></form>
            <form data-lvf="keeper" class="lv-lim"><span>Set keeper</span><input name="k" placeholder="0x…" spellcheck="false"><button>set</button></form>` : L.account ? '<p class="note">Connected wallet is not this vault\'s owner: read only.</p>' : '<p class="note">Connect the owner wallet to manage it.</p>'}`
          : '<p class="note">Open a vault to see it.</p>'}</section>
    </div>
    <p class="src">Contracts: WardenVault + WardenVaultFactory (warden-hook repo, 73 tests, two internal reviews). Router per network: Uniswap SwapRouter02, verified on-chain. The keeper bot is warden-keeper (dry-run by default).</p></div>`;
}

async function refreshFactory() { try { await factoryInfo(L.net); } catch (e) { L.msg = esc(e.shortMessage || e.message); } draw(); }

export function mountLive(el) {
  root = el; draw(); refreshFactory();
  if (L.vault) load().then(draw).catch(e => { L.msg = esc(e.shortMessage || e.message); draw(); });
  el.onchange = e => { if (e.target.matches('.lv-net')) { L.net = e.target.value; L.state = null; remember(); refreshFactory(); load().then(draw).catch(() => draw()); draw(); } };
  el.onclick = async e => {
    const b = e.target.closest('[data-lv]'); if (!b) return; e.preventDefault();
    const a = b.dataset.lv, { parseEther, maxUint256 } = await viem();
    const call = (functionName, args, extra = {}) => (w, A) => w.writeContract({ address: L.vault, abi: A.v, functionName, args, ...extra });
    if (a === 'connect') { try { await wallet(); L.msg = ''; await load(); } catch (er) { L.msg = esc(er.shortMessage || er.message); } draw(); }
    if (a === 'mine') { try { const p = await pub(), A = await abis(); const list = await p.readContract({ address: FACTORY[L.net], abi: A.f, functionName: 'vaultsOf', args: [L.account] }); if (list.length) { L.vault = list[list.length - 1]; remember(); await load(); } else L.msg = 'No vault for this wallet on this network.'; } catch (er) { L.msg = esc(er.message); } draw(); }
    if (a === 'deploy') {
      const info = EXPECTED[L.net] || await factoryInfo(L.net);
      await tx(`Deploy factory on ${NETS[L.net].name}`, (w) => w.sendTransaction({ to: CREATE2_DEPLOYER, data: FACTORY_SALT + info.code.slice(2) }));
      await refreshFactory(); return;
    }
    if (a === 'back') { L.step = Math.max(1, L.step - 1); draw(); return; }
    if (a === 'pause') tx('Pause', call('setPaused', [true]));
    if (a === 'unpause') tx('Resume', call('setPaused', [false]));
    if (a === 'revoke') tx('Revoke keeper', call('setKeeper', ['0x0000000000000000000000000000000000000000']));
    if (a === 'wall') tx('Withdraw all ETH', call('withdrawETH', [maxUint256, L.account]));
    if (a === 'wrap') tx('Wrap raw ETH', call('wrap', []));
    if (a === 'wtok') tx('Withdraw token', call('withdraw', [b.dataset.t, maxUint256, L.account]));
    if (a === 'forget') tx('Forget token', call('forget', [b.dataset.t]));
  };
  el.onsubmit = async e => {
    const f = e.target.closest('[data-lvf]'); if (!f) return; e.preventDefault();
    const d = Object.fromEntries(new FormData(f)), { parseEther, isAddress, getAddress } = await viem();
    const lim = () => ({ maxPerTrade: parseEther(String(d.mpt || 0)), dailyCap: parseEther(String(d.cap || 0)), maxPositions: Number(d.pos), maxSellLossBps: Math.round(Number(d.loss) * 100), keeperFeeBps: Math.round(Number(d.fee || 0) * 100) });
    try {
      if (f.dataset.lvf === 'open') { if (!isAddress(d.addr)) throw new Error('Not an address.'); L.vault = getAddress(d.addr); remember(); L.msg = ''; await load(); draw(); return; }
      if (f.dataset.lvf === 'wz') {
        const D = L.draft;
        if (L.step === 1) { D.name = String(d.name || '').trim(); if (!D.name) throw new Error('Give your agent a name.'); if (new TextEncoder().encode(D.name).length > 31) throw new Error('Name too long.'); if (d.net && d.net !== L.net) { L.net = d.net; remember(); refreshFactory(); } }
        if (L.step === 2) { const p = Number(d.profile || 2); D.profile = p; Object.assign(D, PROFILES[p].limits, PROFILES[p].strat); }
        if (L.step === 3) { for (const k of ['mpt', 'cap', 'pos', 'loss', 'minScore', 'stopPct', 'takePct', 'trailPct', 'maxHoldH', 'slippageBps', 'dep']) D[k] = Number(d[k]); D.profile = Object.entries(PROFILES).find(([, p]) => Object.entries(p.strat).every(([k, v]) => D[k] === v) && Object.entries(p.limits).every(([k, v]) => D[k] === v))?.[0] * 1 || 0;
          if (D.mpt > D.cap) throw new Error('Max per trade must not exceed the daily cap.'); if (D.pos < 1 || D.pos > 50) throw new Error('Positions must be 1 to 50.'); if (D.slippageBps < 10 || D.slippageBps > 2000) throw new Error('Slippage must be 10 to 2000 bps.'); }
        if (L.step === 4) { if (!isAddress(d.keeper)) throw new Error('Keeper must be an address.'); D.keeper = getAddress(d.keeper); D.fee = Number(d.fee); if (!(D.fee >= 0 && D.fee <= 1)) throw new Error('Fee must be 0 to 1 %.'); }
        if (L.step < 5) { L.step++; L.msg = ''; draw(); return; }
        if (!FACTORY[L.net]) throw new Error('The factory is not deployed on this network yet.');
        const { stringToHex } = await viem();
        const limits = { maxPerTrade: parseEther(String(D.mpt)), dailyCap: parseEther(String(D.cap)), maxPositions: D.pos, maxSellLossBps: Math.round(D.loss * 100), keeperFeeBps: Math.round(D.fee * 100) };
        const strategy = { minScore: D.minScore, stopPct: D.stopPct, takePct: D.takePct, trailPct: D.trailPct, maxHoldH: D.maxHoldH, slippageBps: D.slippageBps, profile: D.profile };
        const value = parseEther(String(D.dep || 0));
        await tx(`Create agent "${D.name}"`, (w, A) => w.writeContract({ address: FACTORY[L.net], abi: A.f, functionName: 'create', args: [D.keeper, limits, strategy, stringToHex(D.name, { size: 32 })], value }));
        try { const p = await pub(), A = await abis(); const list = await p.readContract({ address: FACTORY[L.net], abi: A.f, functionName: 'vaultsOf', args: [L.account] }); if (list.length) { L.vault = list[list.length - 1]; L.step = 1; remember(); await load(); draw(); } } catch {}
        return;
      }
      if (f.dataset.lvf === 'strategy') {
        const { stringToHex } = await viem(); const nm = String(d.name || '').trim();
        if (new TextEncoder().encode(nm).length > 31) throw new Error('Name too long.');
        const st = { minScore: Number(d.minScore), stopPct: Number(d.stopPct), takePct: Number(d.takePct), trailPct: Number(d.trailPct), maxHoldH: Number(d.maxHoldH), slippageBps: Number(d.slippageBps), profile: 0 };
        tx('Set strategy', (w, A) => w.writeContract({ address: L.vault, abi: A.v, functionName: 'setStrategy', args: [st, stringToHex(nm, { size: 32 })] })); return;
      }
      if (f.dataset.lvf === 'create') {
        if (!isAddress(d.keeper)) throw new Error('Keeper must be an address.');
        const l = lim(); if (l.maxPerTrade > l.dailyCap) throw new Error('Max per trade must not exceed the daily cap.');
        const value = parseEther(String(d.dep || 0));
        await tx('Create vault', (w, A) => w.writeContract({ address: FACTORY[L.net], abi: A.f, functionName: 'create', args: [getAddress(d.keeper), l], value }));
        try { const p = await pub(), A = await abis(); const list = await p.readContract({ address: FACTORY[L.net], abi: A.f, functionName: 'vaultsOf', args: [L.account] }); if (list.length) { L.vault = list[list.length - 1]; remember(); await load(); draw(); } } catch {}
        return;
      }
      if (f.dataset.lvf === 'deposit') { const value = parseEther(String(d.amt || 0)); if (value <= 0n) throw new Error('Enter an amount.'); tx('Deposit', (w) => w.sendTransaction({ to: L.vault, value })); return; }
      if (f.dataset.lvf === 'limits') { const l = lim(); tx('Set limits', (w, A) => w.writeContract({ address: L.vault, abi: A.v, functionName: 'setLimits', args: [l] })); return; }
      if (f.dataset.lvf === 'keeper') { if (!isAddress(d.k)) throw new Error('Keeper must be an address.'); tx('Set keeper', (w, A) => w.writeContract({ address: L.vault, abi: A.v, functionName: 'setKeeper', args: [getAddress(d.k)] })); return; }
    } catch (er) { L.msg = esc(er.shortMessage || er.message); draw(); }
  };
}
