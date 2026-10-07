# trompo

Videos de tornamesa en loop de modelos 3D: piezas STL para imprimir en 3D y escaneos 3D (GLB, OBJ, PLY), como los retratos hechos con Structure Sensor de [piruetas.xyz/personas](https://piruetas.xyz/personas/). Escribe mp4, mov (también transparente) y gif.

Se usa desde la línea de comandos, desde JavaScript o como acción de GitHub que mantiene al día los videos de todos los modelos de un repositorio.

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

# Un gif chico y transparente, para un README.
trompo retrato.glb -o retrato.gif --fondo ninguno

# Rodando hacia arriba, sobre fondo transparente, para un editor de video.
trompo pieza.stl --eje x --sentido arriba --fondo ninguno

# Todos los modelos de trompo.yml (ver más abajo).
trompo
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

### Modelos

| extensión | arriba, por defecto | color |
| --- | --- | --- |
| `.stl` | `z`, la normal de la cama de impresión | `color`, salvo que el STL traiga colores por cara |
| `.glb`, `.gltf` | `y` | sus materiales y texturas; acepta compresión Draco |
| `.obj` | `y` | el `.mtl` con el mismo nombre y sus texturas, si están en la misma carpeta; si no, `color` |
| `.ply` | `y` | los colores por vértice, si los trae; si no, `color`. Sin caras, se dibuja como nube de puntos |

Si un modelo queda acostado, cambia `arriba`.

### Videos

| extensión | códec | fondo transparente |
| --- | --- | --- |
| `.mp4` | H.264 | no: necesita un color |
| `.mov` | ProRes 4444 si es transparente, H.264 si no | sí, abre en cualquier editor de video |
| `.gif` | paleta propia de 256 colores | sí, con borde duro (un píxel es transparente o no) |

Un gif pesa mucho más que un video, así que trompo lo achica a 480 píxeles de ancho (`ancho-gif`) y a 15 cuadros por segundo (`cuadros-por-segundo-gif`), la mitad de los 30 del video: queda uno sí y uno no, y el loop sigue sin cortes. Un escaneo con textura de 6 segundos pesa unos 4,5 MB; una pieza STL de un solo color, mucho menos. GitHub no muestra imágenes de más de 10 MB en un README.

### Desde la línea de comandos

```bash
trompo MODELO [-o SALIDA] [--eje z|x] [--sentido ...] [--fondo COLOR|ninguno]
              [--medidas AxL] [--segundos S] [--elevacion GRADOS]
              [--color COLOR] [--arriba y|z] [--ancho-gif PX]
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
| `anchoGif` | `480` | ancho máximo de los gif; `null` para no achicarlos |
| `cuadrosPorSegundoGif` | `15` | |
| `avisar` | — | función que recibe mensajes de progreso |

Devuelve la ruta del video. `girarVarios(modelo, [{ salida, fondo }, ...], opciones)` dibuja la vuelta una sola vez y escribe varios videos con ella. Si falta `ffmpeg` o falla, lanzan `ErrorHerramienta`. Para usar un `ffmpeg` que no está en el PATH, define la variable `FFMPEG`.

## Todos los modelos de un repositorio: trompo.yml

Un `trompo.yml` en la raíz del repositorio lista los modelos y qué videos sacar de cada uno (ver [ejemplos/trompo.yml](./ejemplos/trompo.yml)):

```yaml
carpeta-videos: docs/videos
medidas:
  cuadrado: 1080x1080
  vertical: 1080x1920
fondos:
  rosado: "#ff9ecf"
modelos:
  - nombre: carcasa
    archivo: impresion/carcasa.stl
  - nombre: retrato
    archivo: escaneos/retrato.glb
    elevacion: 5
    formatos: [mp4, gif]
```

`trompo` sin modelo, en esa carpeta, escribe un video por cada giro × medida × fondo × formato de cada modelo, con nombres como `retrato-z-antihorario-vertical-rosado.mp4`. Todas las rutas son relativas a la carpeta donde se corre.

| clave | descripción | por defecto |
| --- | --- | --- |
| `carpeta-videos` | Dónde quedan los videos y `trompo.json`. | `docs/videos` |
| `modelos` | Lista de modelos (obligatoria). | — |
| `giros` | Lista de giros: `z`, `x`, o con sentido, como `z-horario` o `x-arriba`. | `[z]` |
| `medidas` | Mapa de nombre: `anchoxalto`. | `{cuadrado: 1080x1080}` |
| `fondos` | Mapa de nombre: color. `ninguno` es transparente: el mp4 sale como `.mov`. | `{blanco: "#ffffff"}` |
| `formatos` | `mp4`, `gif` o los dos. | `[mp4]` |
| `segundos` | Duración del loop. | `6` |
| `elevacion` | Grados desde donde se mira el giro en `z`. | `20` |
| `color` | Color de los modelos sin color propio. | `"#a6a6a6"` |
| `ancho-gif` | Ancho máximo de los gif. | `480` |
| `cuadros-por-segundo-gif` | | `15` |

Cada modelo lleva `nombre` (usado en los nombres de los videos), `archivo` y, si hace falta, `arriba`; también puede cambiar cualquiera de las claves de arriba, salvo `carpeta-videos`.

En `trompo.json` queda una huella de cada video: el archivo del modelo (y su `.mtl`, si es un OBJ), sus opciones y la versión de trompo. Si la huella no cambió, el video no se vuelve a dibujar; `--forzar` los dibuja todos de nuevo. Las texturas de un OBJ o un glTF con archivos aparte no entran en la huella: si solo cambia una textura, usa `--forzar`.

Si en la carpeta quedan videos que ya no salen de `trompo.yml` (porque se borró un modelo o se cambió un nombre), trompo avisa pero no los borra.

## Acción de GitHub

La acción corre `trompo` sobre el `trompo.yml` del repositorio y, si algún video cambió, hace commit y push.

1. Agregar un `trompo.yml` en la raíz del repositorio (ver arriba).

2. Agregar un workflow en `.github/workflows/` (ver [ejemplos/girar.yml](./ejemplos/girar.yml)):

   ```yaml
   permissions:
     contents: write

   jobs:
     girar:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v7
         - uses: piruetasxyz/trompo@v0
   ```

3. Mostrar los videos, por ejemplo un gif en el README:

   ```markdown
   ![Retrato girando](./docs/videos/retrato-z-antihorario-cuadrado-transparente.gif)
   ```

| entrada | descripción | por defecto |
| --- | --- | --- |
| `configuracion` | Archivo de configuración. | `trompo.yml` |
| `forzar` | `"true"` para dibujar todo de nuevo. | `"false"` |
| `hacer-commit` | `"false"` para solo generar los archivos, sin commit ni push. | `"true"` |
| `mensaje-commit` | Mensaje del commit automático. | `Actualizar videos de tornamesa [skip ci]` |

Salida: `hubo-cambios`, `"true"` si algún video cambió.

### Notas

- **Disparadores**: GitHub no puede leer las rutas desde `trompo.yml`, así que el workflow de ejemplo escucha cualquier `.stl`, `.glb`, `.gltf`, `.obj`, `.mtl` y `.ply`. Si cambia un modelo que no está en `trompo.yml`, la acción corre igual pero no hace commit.
- **Peso del repositorio**: cada video que cambia queda para siempre en la historia de git. Conviene pocas combinaciones de medidas y fondos, y videos cortos. Para muchos videos, usa `hacer-commit: "false"` y publícalos de otra forma (por ejemplo, subiéndolos como artefacto o a GitHub Pages en el mismo workflow).
- **GitHub Pages**: los commits que hace la acción con el `GITHUB_TOKEN` no disparan el evento `push` de otros workflows. Si el sitio se despliega con un workflow propio, hay que dispararlo también con `workflow_run` al terminar este, o desplegar en el mismo workflow después de la acción.
- **.gitignore**: los videos que el repositorio ignora (por ejemplo, con `*.mov` en su `.gitignore`) se dibujan igual pero no se suben; la acción deja un aviso por cada uno.
- **Pull requests**: en un pull request no se hace commit (HEAD no está en una rama). Se puede usar `hacer-commit: "false"` y revisar la salida `hubo-cambios`.

## Detalles

- **WebGL sin GPU**: Chromium dibuja con SwiftShader, por software, para que el resultado sea el mismo en un Mac que en GitHub Actions. Un video de 6 segundos de un escaneo de unos 2,5 MB tarda alrededor de medio minuto.
- **Unidades**: el tamaño del modelo no importa, porque la cámara se encuadra igual para una pieza de milímetros que para un escaneo en metros.

## Versiones

Se usa [versionado semántico](https://semver.org/lang/es/). Cada versión tiene su etiqueta (`v0.0.1`) y la etiqueta mayor (`v0`) se mueve a la última versión de esa serie, así los repositorios que usan `@v0` reciben los arreglos sin cambiar su workflow. Antes de publicar una versión, sube la `version` de `package.json`: es parte de la huella, así que los repositorios que usan la acción vuelven a dibujar sus videos con la versión nueva.

```bash
gh release create v0.0.1 -R piruetasxyz/trompo --target main --generate-notes
```

El workflow [mover-etiqueta-mayor.yml](./.github/workflows/mover-etiqueta-mayor.yml) mueve entonces la etiqueta mayor (`v0`) a la versión nueva. Las versiones marcadas como pre-release no la mueven.

## Licencia

[MIT](./LICENSE)
