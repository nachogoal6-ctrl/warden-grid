// Warden Grid — Live vault panel: the owner's side of a WardenVault (create, fund, limits, keeper, pause, withdraw).
// Every action is a transaction the owner signs in their own wallet. Nothing here holds keys or moves funds by itself.
// viem is loaded from jsdelivr only when this panel opens.
import { esc } from './ui.js';
import { CHAINS, NETS } from './opscore.js';

// Factory per chain: filled in once deployed (script/DeployVaultFactory.s.sol in warden-hook). null = not deployed yet.
export const FACTORY = { eth: null, base: null, rh: null };

const VIEM = 'https://cdn.jsdelivr.net/npm/viem@2.21.54/+esm';
let V = null; const viem = async () => (V ||= await import(VIEM));
const ABI_SRC = {
  factory: ['function create(address keeper, (uint128 maxPerTrade, uint128 dailyCap, uint16 maxPositions, uint16 maxSellLossBps) limits) payable returns (address)', 'function vaultsOf(address owner) view returns (address[])'],
  vault: ['function owner() view returns (address)', 'function keeper() view returns (address)', 'function paused() view returns (bool)', 'function allowlistOnly() view returns (bool)',
    'function limits() view returns (uint128 maxPerTrade, uint128 dailyCap, uint16 maxPositions, uint16 maxSellLossBps)', 'function spentTodayNow() view returns (uint256)',
    'function positions() view returns (address[])', 'function costBasis(address) view returns (uint256)', 'function weth() view returns (address)', 'function router() view returns (address)',
    'function setKeeper(address)', 'function setPaused(bool)', 'function setLimits((uint128 maxPerTrade, uint128 dailyCap, uint16 maxPositions, uint16 maxSellLossBps))',
    'function withdraw(address token, uint256 amount, address to)', 'function withdrawETH(uint256 amount, address to)', 'function forget(address token)', 'function wrap()'],
  erc20: ['function balanceOf(address) view returns (uint256)', 'function symbol() view returns (string)'],
};
const L = { net: 'eth', account: null, vault: null, state: null, msg: '', busy: false };
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
  const [owner, keeper, paused, lim, spent, pos, weth, router] = await Promise.all(['owner', 'keeper', 'paused', 'limits', 'spentTodayNow', 'positions', 'weth', 'router'].map(f => rd(f)));
  const wethBal = await p.readContract({ address: weth, abi: A.e, functionName: 'balanceOf', args: [L.vault] });
  const ethRaw = await p.getBalance({ address: L.vault });
  const positions = await Promise.all(pos.map(async t => ({ t, bal: await p.readContract({ address: t, abi: A.e, functionName: 'balanceOf', args: [L.vault] }).catch(() => null),
    sym: await p.readContract({ address: t, abi: A.e, functionName: 'symbol' }).catch(() => short(t)), cost: await rd('costBasis', [t]) })));
  L.state = { owner, keeper, paused, lim, spent, weth, router, wethBal, ethRaw, positions, okRouter: router.toLowerCase() === CHAINS[L.net].router };
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
function view() {
  const f = FACTORY[L.net], s = L.state, isOwner = s && L.account && s.owner.toLowerCase() === L.account.toLowerCase();
  const nets = Object.keys(CHAINS).map(k => `<option value="${k}" ${k === L.net ? 'selected' : ''}>${esc(NETS[k].name)}</option>`).join('');
  return `<div class="lv">
    <div class="ap-h on"><div><b>LIVE VAULT · REAL FUNDS</b><span>Your own vault contract. A keeper bot trades it 24/7 only inside the limits you sign here. You can pause, revoke or withdraw at any moment. Not audited: test with small amounts first.</span></div>
      <div class="ap-btns"><select class="lv-net" aria-label="Network">${nets}</select><button class="ap-go" data-lv="connect">${L.account ? short(L.account) : 'connect wallet'}</button></div></div>
    ${L.msg ? `<p class="lv-msg">${L.msg}</p>` : ''}
    <div class="lv-grid">
      <section class="lv-card"><h4>1 · Open a vault</h4>
        ${f ? `<p>Factory on ${esc(NETS[L.net].name)}: <code>${short(f)}</code></p>` : `<p class="note">The vault factory is <b>not deployed on ${esc(NETS[L.net].name)} yet</b>. It goes live once it is deployed from the project wallet. Until then you can manage an existing vault below.</p>`}
        <form data-lvf="create">
          <label><span>Keeper address (the bot)</span><input name="keeper" placeholder="0x…" spellcheck="false" required></label>
          <label><span>Max per trade (ETH)</span><input name="mpt" type="number" step="any" min="0" value="0.05"></label>
          <label><span>Daily cap on buys (ETH)</span><input name="cap" type="number" step="any" min="0" value="0.2"></label>
          <label><span>Max positions (≤ 50)</span><input name="pos" type="number" min="1" max="50" value="5"></label>
          <label><span>Sell floor: max loss % the bot may sell at</span><input name="loss" type="number" min="0" max="100" value="30"></label>
          <label><span>Initial deposit (ETH)</span><input name="dep" type="number" step="any" min="0" value="0"></label>
          <button ${f ? '' : 'disabled'}>create vault</button></form></section>
      <section class="lv-card"><h4>2 · Your vault</h4>
        <form data-lvf="open"><label><span>Vault address</span><input name="addr" value="${esc(L.vault || '')}" placeholder="0x…" spellcheck="false"></label><button>open</button>${f && L.account ? '<button type="button" data-lv="mine">find mine</button>' : ''}</form>
        ${s ? `${s.okRouter ? '' : '<p class="serr">This vault uses a different router than the one verified for this network.</p>'}
          <ul class="rows">
            <li><span>Owner</span><span>${short(s.owner)}${isOwner ? ' · you' : ''}</span></li>
            <li><span>Keeper</span><span>${/^0x0{40}$/.test(s.keeper) ? 'revoked' : short(s.keeper)}</span></li>
            <li><span>Status</span><span class="${s.paused ? 'dn' : 'up'}">${s.paused ? 'paused' : 'active'}</span></li>
            <li><span>WETH</span><span>${eth(s.wethBal)}${s.ethRaw > 0n ? ` · raw ETH ${eth(s.ethRaw)} (wrap it)` : ''}</span></li>
            <li><span>Max per trade · daily cap</span><span>${eth(s.lim[0])} · ${eth(s.lim[1])} ETH (spent today ${eth(s.spent)})</span></li>
            <li><span>Max positions · sell floor</span><span>${s.lim[2]} · −${Number(s.lim[3]) / 100}%</span></li></ul>
          ${s.positions.length ? `<p class="sect">Positions</p><table class="rd"><tr><th>Token</th><th>Balance</th><th>Cost (WETH)</th><th></th></tr>${s.positions.map(x => `<tr><td><b>${esc(x.sym)}</b> <code>${short(x.t)}</code></td><td>${x.bal == null ? '?' : eth(x.bal, 2)}</td><td>${eth(x.cost)}</td><td>${isOwner ? `<button class="mini" data-lv="wtok" data-t="${x.t}">withdraw</button> <button class="mini" data-lv="forget" data-t="${x.t}">forget</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="note">No positions.</p>'}
          ${isOwner ? `<div class="lv-acts">
            <form data-lvf="deposit"><input name="amt" type="number" step="any" min="0" placeholder="ETH"><button>deposit</button></form>
            <button class="ap-stop" data-lv="${s.paused ? 'unpause' : 'pause'}">${s.paused ? 'resume bot' : 'pause bot'}</button>
            <button class="ap-stop" data-lv="revoke">revoke keeper</button>
            <button class="ap-stop" data-lv="wall">withdraw all ETH</button>
            ${s.ethRaw > 0n ? '<button class="mini" data-lv="wrap">wrap raw ETH</button>' : ''}</div>
            <form data-lvf="limits" class="lv-lim"><span>Change limits</span>
              <input name="mpt" type="number" step="any" placeholder="max/trade ETH" value="${eth(s.lim[0])}"><input name="cap" type="number" step="any" placeholder="daily ETH" value="${eth(s.lim[1])}">
              <input name="pos" type="number" min="1" max="50" value="${s.lim[2]}"><input name="loss" type="number" min="0" max="100" value="${Number(s.lim[3]) / 100}"><button>save</button></form>
            <form data-lvf="keeper" class="lv-lim"><span>Set keeper</span><input name="k" placeholder="0x…" spellcheck="false"><button>set</button></form>` : L.account ? '<p class="note">Connected wallet is not this vault\'s owner: read only.</p>' : '<p class="note">Connect the owner wallet to manage it.</p>'}`
          : '<p class="note">Open a vault to see it.</p>'}</section>
    </div>
    <p class="src">Contracts: WardenVault + WardenVaultFactory (warden-hook repo, 65 tests, internal review). Router per network: Uniswap SwapRouter02, verified on-chain. The keeper bot is warden-keeper (dry-run by default).</p></div>`;
}

export function mountLive(el) {
  root = el; draw();
  if (L.vault) load().then(draw).catch(e => { L.msg = esc(e.shortMessage || e.message); draw(); });
  el.onchange = e => { if (e.target.matches('.lv-net')) { L.net = e.target.value; L.state = null; remember(); load().then(draw).catch(() => draw()); draw(); } };
  el.onclick = async e => {
    const b = e.target.closest('[data-lv]'); if (!b) return; e.preventDefault();
    const a = b.dataset.lv, { parseEther, maxUint256 } = await viem();
    const call = (functionName, args, extra = {}) => (w, A) => w.writeContract({ address: L.vault, abi: A.v, functionName, args, ...extra });
    if (a === 'connect') { try { await wallet(); L.msg = ''; await load(); } catch (er) { L.msg = esc(er.shortMessage || er.message); } draw(); }
    if (a === 'mine') { try { const p = await pub(), A = await abis(); const list = await p.readContract({ address: FACTORY[L.net], abi: A.f, functionName: 'vaultsOf', args: [L.account] }); if (list.length) { L.vault = list[list.length - 1]; remember(); await load(); } else L.msg = 'No vault for this wallet on this network.'; } catch (er) { L.msg = esc(er.message); } draw(); }
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
    const lim = () => ({ maxPerTrade: parseEther(String(d.mpt || 0)), dailyCap: parseEther(String(d.cap || 0)), maxPositions: Number(d.pos), maxSellLossBps: Math.round(Number(d.loss) * 100) });
    try {
      if (f.dataset.lvf === 'open') { if (!isAddress(d.addr)) throw new Error('Not an address.'); L.vault = getAddress(d.addr); remember(); L.msg = ''; await load(); draw(); return; }
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
