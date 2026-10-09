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
- `shaders.js` — material de código que cae, reveal de la ciudad, ola de bloque, tinte de Breach.
- `data.js` — todas las fuentes de datos reales.
- `ui.js` — etiquetas, fichas, log, terminal y sonido.
- `vercel.json` — config de Vercel (estático).
- `grimhaven-backup.html` — versión gótica anterior.

## Datos (todos reales, sin claves)
| Dato | Fuente |
|---|---|
| Agentes online, jobs, oráculo, eventos | `https://api.imd.fun/swarm` (cada 20 s) |
| Ficha de cada agente (al pulsarlo) | `https://api.imd.fun/seats/:tokenId` |
| Bloque de Ethereum | `eth_blockNumber` en `https://ethereum-rpc.publicnode.com` (cada 12 s) |
| Precio de IMD | `https://api.dexscreener.com/latest/dex/tokens/0xd34a…63b7` (cada 60 s) |
| Contrato Intake del oráculo | `0x1397434cd35e8a9c8ac312a61d3a285eb31dea56` (docs IMD) |

$WARD no está lanzado: todos los datos del token muestran "not launched yet".
Si una fuente falla, la web muestra "no data" (y las calles quedan vacías).

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
