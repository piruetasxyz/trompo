# trompo

Videos de tornamesa en loop de modelos 3D: piezas STL para imprimir en 3D y escaneos 3D (GLB, OBJ, PLY), como los retratos hechos con Structure Sensor de [piruetas.xyz/personas](https://piruetas.xyz/personas/).

Es el hermano de [kicad-visor](https://github.com/piruetasxyz/kicad-visor), que hace lo mismo con placas KiCad, para el resto de los archivos 3D de piruetas.

## Requisitos

- Node.js 20 o más nuevo
- `ffmpeg`

Los cuadros los dibuja [three.js](https://threejs.org) dentro de Chromium sin ventana, con [Playwright](https://playwright.dev). Al instalar trompo se descarga el Chromium que usa.

## Instalación

```bash
npm install -g github:piruetasxyz/trompo
```

O, desde un clon, `npm install` y luego `npm link` para tener el comando `trompo`.

## Uso rápido

```bash
# Una pieza para imprimir, girando sobre la cama de impresión.
trompo pieza.stl

# Un escaneo 3D, vertical para celulares, sobre rosado.
trompo retrato.glb --medidas 1080x1920 --fondo "#ff9ecf"

# Rodando hacia arriba, sobre fondo transparente, para un editor de video.
trompo pieza.stl --eje x --sentido arriba --fondo ninguno
```

```js
import { girar } from 'trompo';

await girar('retrato.glb', 'retrato.mp4', { fondo: '#ff9ecf', medidas: [1080, 1920] });
```

## Videos de tornamesa

Imagina el modelo sobre una tornamesa: eliges el eje en que gira y hacia dónde, y la cámara queda quieta. Cada video es una vuelta completa, así que el último cuadro empalma con el primero y el loop no se nota.

| eje | gira sobre | como | sentido (hacia dónde se mueve la cara que mira a la cámara) |
| --- | --- | --- | --- |
| `z` | el eje vertical del modelo | un disco en una tornamesa | `antihorario` (por defecto) u `horario`, vistos desde arriba |
| `x` | el eje horizontal de la pantalla | un tambor que rueda | `abajo` (por defecto) o `arriba` |

El giro en `z` se mira un poco desde arriba (`elevacion`, 20° por defecto; con 0 se mira de frente, como en el visor de piruetas.xyz); el giro en `x` se mira de frente. Antes de dibujar, trompo encuadra la cámara: gira el modelo por toda la vuelta, mide dónde cae cada vértice en la pantalla y elige el acercamiento más cercano que lo mantiene dentro del cuadro, sea cual sea su forma.

Las luces son las mismas del visor 3D de piruetas.xyz, así que un escaneo se ve igual en el video que en la web.

### Formatos

| extensión | arriba, por defecto | color |
| --- | --- | --- |
| `.stl` | `z`, la normal de la cama de impresión | `color`, salvo que el STL traiga colores por cara |
| `.glb`, `.gltf` | `y` | sus materiales y texturas; acepta compresión Draco |
| `.obj` | `y` | el `.mtl` con el mismo nombre y sus texturas, si están en la misma carpeta; si no, `color` |
| `.ply` | `y` | los colores por vértice, si los trae; si no, `color`. Sin caras, se dibuja como nube de puntos |

Si un modelo queda acostado, cambia `arriba`.

### Desde la línea de comandos

```bash
trompo MODELO [-o SALIDA] [--eje z|x] [--sentido ...] [--fondo COLOR|ninguno]
              [--medidas AxL] [--segundos S] [--elevacion GRADOS]
              [--color COLOR] [--arriba y|z]
```

La salida por defecto es `<modelo>-<eje>-<sentido>.mp4` en la carpeta actual (`.mov` con `--fondo ninguno`). `trompo --ayuda` muestra todas las opciones.

### Desde JavaScript

```js
girar(modelo, salida, opciones)
```

| opción | por defecto | |
| --- | --- | --- |
| `eje` | `"z"` | `"z"` o `"x"` |
| `sentido` | el primero del eje | ver la tabla de arriba |
| `fondo` | `"#ffffff"` | cualquier [color de ffmpeg](https://ffmpeg.org/ffmpeg-utils.html#Color): `"#ff9ecf"`, `"pink"`. `null` para transparente |
| `medidas` | `[1080, 1080]` | `[ancho, alto]` en píxeles, pares |
| `segundos` | `6` | duración del loop |
| `cuadrosPorSegundo` | `30` | |
| `elevacion` | `20` | grados sobre el horizonte desde donde se mira el giro en `z` |
| `color` | `"#a6a6a6"` | color de los modelos sin color propio |
| `arriba` | `"z"` para STL, `"y"` para el resto | qué eje del archivo apunta hacia arriba |
| `avisar` | — | función que recibe mensajes de progreso |

Devuelve la ruta del video. Si falta `ffmpeg` o falla, lanza `ErrorHerramienta`. Para usar un `ffmpeg` que no está en el PATH, define la variable `FFMPEG`.

| extensión | códec | fondo transparente |
| --- | --- | --- |
| `.mp4` | H.264 | no: necesita un color |
| `.mov` | ProRes 4444 si es transparente, H.264 si no | sí, abre en cualquier editor de video |

## Notas

- **WebGL sin GPU**: Chromium dibuja con SwiftShader, por software, para que el resultado sea el mismo en un Mac que en GitHub Actions. Un video de 6 segundos de un escaneo de unos 2,5 MB tarda alrededor de medio minuto.
- **Unidades**: el tamaño del modelo no importa, porque la cámara se encuadra igual para una pieza de milímetros que para un escaneo en metros.

## Licencia

[MIT](./LICENSE)
