# Warden Grid ($WARD)

Web 3D del proyecto $WARD: una ciudad hecha de código que cae, patrullada por el swarm de IMD.
Cada figura en las calles es un agente IMD conectado (dato real de `api.imd.fun/swarm`, máx. 1.000).

Independent community project. Not run or endorsed by Identity.md.

## Archivos
- `index.html` — estructura de la página (sin build; Three.js 0.160.0 desde jsdelivr vía importmap).
- `style.css` — interfaz (todo verde, letra de terminal).
- `main.js` — renderer, postproducción, cámara (intro cinemática), estados del grid y conexión de datos → ciudad.
- `city.js` — la ciudad: los 7 distritos con arquitectura propia, edificios, puentes, antenas y cables de datos.
- `agents.js` — el swarm a pie: una figura animada por agente IMD online (máx. 1.000).
- `swarm.js` — bandadas de luz entre distritos (GPU, decorativo).
- `fx.js` — paquetes de luz y etiquetas flotantes.
- `warden.js` — The Warden: holograma original del guardián sobre la Gate.
- `shaders.js` — material de código que cae, reveal de la ciudad, ola de bloque, tinte de Breach.
- `data.js` — todas las fuentes de datos reales.
- `ui.js` — etiquetas, fichas, log, terminal y sonido.
- `codex.js` — el Codex: lore de la ciudad por capítulos (con bloques "on record" que separan ficción y datos reales).
- `scan.js` — scan.exe: el Consejo revisa un token (mercados, contrato, tickers copiados, enlaces). Solo hechos con fuente, sin puntuación ni señales.
- `council.js` — panel de scan.exe y el avatar del Warden (frases a partir del estado real).
- `opscore.js` — motor de ops.exe sin dependencias del navegador (agentes, puntuación, autopiloto en papel, direcciones verificadas por red). Lo usa también el bot `warden-keeper` (copia idéntica).
- `livevault.js` — pestaña Live vault: el dueño crea y gestiona su WardenVault (depositar, límites, keeper, pausa, retirar) firmando en su wallet. viem se carga de jsdelivr al abrirla.
- `ops.js` — vistas de ops.exe: 8 agentes (scout, risk, whale, momentum, social, dev, exit, warden), radar con puntuación transparente, mercado, operaciones grandes, intel y autopiloto en papel (precios reales, operaciones simuladas).
- `opsui.js` — ventana de ops.exe (pestañas, red, reloj de ciclo, controles del autopiloto).
- `avatar.js` — avatar pixel del Warden y sigilos pixel deterministas por dirección o seat.
- `vercel.json` — config de Vercel (estático).
- `grimhaven-backup.html` — versión gótica anterior.

## Datos (todos reales, sin claves)
| Dato | Fuente |
|---|---|
| Agentes online, jobs, oráculo, eventos | `https://api.imd.fun/swarm` (cada 20 s) |
| Ficha de cada agente (al pulsarlo) | campos `seats` y `owners` de `https://api.imd.fun/swarm` |
| Bloque de Ethereum | `eth_blockNumber` en `https://ethereum-rpc.publicnode.com` (cada 12 s) |
| Precio de IMD | `https://api.dexscreener.com/latest/dex/tokens/0xd34a…63b7` (cada 60 s) |
| Gas de Ethereum | `eth_gasPrice` en el mismo RPC (cada 12 s) |
| scan.exe · mercados, copias, enlaces | `api.dexscreener.com/latest/dex/tokens/<addr>` y `/search?q=<ticker>` |
| scan.exe · contrato | RPC públicos publicnode (Ethereum, Base, BNB Chain): `eth_getCode`, `owner()`, slot EIP-1967, `totalSupply()`, `decimals()`, `balanceOf(0x…dEaD)` |
| ops.exe · pools nuevos/tendencia, operaciones | `api.geckoterminal.com/api/v2/networks/{eth,base}/…` |
| ops.exe · TVL y volumen DEX | `api.llama.fi/v2/chains`, `api.llama.fi/overview/dexs/{chain}` |
| ops.exe · ETH/BTC | `api.coingecko.com/api/v3/simple/price` |
| Contrato Intake del oráculo | `0x1397434cd35e8a9c8ac312a61d3a285eb31dea56` (docs IMD) |

$WARD no está lanzado: todos los datos del token muestran "not launched yet".
Si una fuente falla, la web muestra "no data" (y las calles quedan vacías).

## Comandos del terminal
`ops [pestaña]` · `autopilot` · `scan 0x…` · `lore [capítulo]` · `fragment` · `go <distrito>` · `state <calm|panic|buyback|milestone>` · `seat <n>` · `stats` · `intro` · `home` · `clear`

## Calidad
La web elige calidad sola (baja en móviles y equipos pequeños) y ajusta la resolución en vivo para mantener la fluidez. El botón `quality` de la barra inferior la fija en auto / high / low (se recuerda en ese navegador). En calidad baja se muestran como máximo 400 figuras y la ficha del Nest lo indica.

## Probar en local
```
npx serve .
```
y abrir http://localhost:3000

## Desplegar (Vercel, scope mini-834b)
Desde esta carpeta:
```
npx vercel deploy --prod
```
Si npx se niega, usar el CLI cacheado:
```
node "$env:LOCALAPPDATA\npm-cache\_npx\67eb4586ca667318\node_modules\vercel\dist\index.js" deploy --prod --yes
```
Comprobar la línea "Aliased" y abrir la web real.

## Al lanzar $WARD (pendiente)
- Cambiar el nombre provisional WARDEN/$WARD si el token se llama distinto.
- Poner la dirección del token y del hook en el cajón "The Gate" y conectar precio/swaps reales.
