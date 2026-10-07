// Videos de tornamesa en loop de modelos 3D.
//
// Imagina el modelo sobre una tornamesa: eliges el eje en que gira y hacia
// dónde, y la cámara queda quieta. Cada video es una vuelta completa, así
// que el último cuadro empalma con el primero y el loop no se nota.
//
// Los cuadros los dibuja three.js dentro de Chromium sin ventana
// (Playwright), con las mismas luces que el visor 3D de piruetas.xyz, y
// ffmpeg los junta en un video.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Los ejes en que puede girar el modelo y hacia dónde: hacia dónde se mueve
// la cara que mira a la cámara. El primer sentido es el por defecto.
//   z: el eje vertical del modelo, como un disco en una tornamesa, visto
//      desde arriba en ángulo: "antihorario" u "horario", vistos desde arriba.
//   x: el eje horizontal de la pantalla, como un tambor que rueda: "abajo"
//      o "arriba".
export const EJES = {
  z: ['antihorario', 'horario'],
  x: ['abajo', 'arriba'],
};

// Formatos que se pueden cargar, por extensión, y qué eje apunta hacia
// arriba en cada uno si no se dice otra cosa: los STL vienen con z hacia
// arriba (la cama de impresión); glTF, OBJ y PLY, con y.
export const FORMATOS = {
  '.stl': { formato: 'stl', arriba: 'z' },
  '.glb': { formato: 'glb', arriba: 'y' },
  '.gltf': { formato: 'gltf', arriba: 'y' },
  '.obj': { formato: 'obj', arriba: 'y' },
  '.ply': { formato: 'ply', arriba: 'y' },
};

const ORIGEN = 'http://trompo.local';
const CARPETA_ESCENA = fileURLToPath(new URL('./escena/', import.meta.url));
const CARPETA_THREE = path.resolve(path.dirname(fileURLToPath(import.meta.resolve('three'))), '..');

export class ErrorHerramienta extends Error {}

export function revisarMovimiento(eje, sentido) {
  if (!(eje in EJES)) {
    throw new Error(`el eje debe ser uno de ${Object.keys(EJES).join(', ')}, no "${eje}"`);
  }
  if (sentido == null) return EJES[eje][0];
  if (!EJES[eje].includes(sentido)) {
    throw new Error(`el sentido en el eje ${eje} debe ser ${EJES[eje].join(' o ')}, no "${sentido}"`);
  }
  return sentido;
}

function argumentosCodec(salida, transparente) {
  const extension = path.extname(salida).toLowerCase();
  if (!['.mp4', '.mov', '.gif'].includes(extension)) {
    throw new Error(`${path.basename(salida)}: los videos son .mp4, .mov o .gif`);
  }
  if (extension === '.gif') return [];
  if (extension === '.mov' && transparente) {
    // ProRes 4444 mantiene el canal alfa y abre en cualquier editor de video.
    return ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le'];
  }
  if (transparente) {
    throw new Error(`${path.basename(salida)}: un fondo transparente necesita un .mov o un .gif; el .mp4 no tiene canal alfa`);
  }
  return ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
}

function correr(programa, argumentos) {
  return new Promise((resolver, rechazar) => {
    let proceso;
    try {
      proceso = spawn(programa, argumentos, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (error) {
      rechazar(new ErrorHerramienta(`no se pudo correr ${programa}: ${error.message}`));
      return;
    }
    let errores = '';
    proceso.stderr.on('data', (dato) => { errores += dato; });
    proceso.on('error', (error) => {
      rechazar(new ErrorHerramienta(error.code === 'ENOENT'
        ? `no se encontró ${programa}; instálalo o define la variable FFMPEG`
        : `${programa}: ${error.message}`));
    });
    proceso.on('close', (codigo) => {
      if (codigo === 0) resolver();
      else rechazar(new ErrorHerramienta(`${programa} falló (${codigo}):\n${errores.trim()}`));
    });
  });
}

// Sirve a Chromium la escena, three.js y la carpeta del modelo (para que
// encuentre los .bin, .mtl y texturas que el modelo nombra).
async function servir(pagina, carpetaModelo) {
  const raices = { escena: CARPETA_ESCENA, three: CARPETA_THREE, modelo: carpetaModelo };
  await pagina.route(`${ORIGEN}/**`, async (ruta) => {
    const { pathname } = new URL(ruta.request().url());
    const [, raiz, ...resto] = decodeURIComponent(pathname).split('/');
    const base = raices[raiz];
    const archivo = base && path.resolve(base, ...resto);
    if (!archivo || !archivo.startsWith(base) || !existsSync(archivo)) {
      await ruta.fulfill({ status: 404 });
      return;
    }
    await ruta.fulfill({ path: archivo });
  });
}

// Dibuja la vuelta completa y deja un png transparente por cuadro en `carpeta`.
async function dibujarCuadros(modelo, carpeta, opciones, avisar) {
  const { formato, arriba } = opciones;
  const [ancho, alto] = opciones.medidas;
  const cantidad = Math.max(1, Math.round(opciones.segundos * opciones.cuadrosPorSegundo));

  const navegador = await chromium.launch({
    // SwiftShader dibuja WebGL sin GPU: igual en un Mac que en GitHub Actions.
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1 });
    const errores = [];
    pagina.on('pageerror', (error) => errores.push(error.message));
    await servir(pagina, path.dirname(modelo));
    await pagina.goto(`${ORIGEN}/escena/escena.html`);
    await pagina.waitForFunction(() => window.trompo, null, { timeout: 30000 }).catch(() => {
      throw new Error(`la escena no cargó${errores.length ? `: ${errores.join('; ')}` : ''}`);
    });

    avisar('encuadrando');
    await pagina.evaluate((datos) => window.trompo.preparar(datos), {
      url: `/modelo/${encodeURIComponent(path.basename(modelo))}`,
      formato,
      arriba,
      colorMaterial: opciones.color,
      ancho,
      alto,
      ejeGiro: opciones.eje,
      sentido: opciones.sentido === EJES[opciones.eje][0] ? 1 : -1,
      elevacion: opciones.elevacion,
    });

    for (let i = 0; i < cantidad; i++) {
      const dataUrl = await pagina.evaluate((t) => window.trompo.cuadro(t), i / cantidad);
      const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      await writeFile(path.join(carpeta, `${String(i).padStart(4, '0')}.png`), png);
      avisar(`cuadro ${i + 1}/${cantidad}`);
    }
  } finally {
    await navegador.close();
  }
}

// Pone los cuadros sobre el fondo y escribe el video. Los .gif se achican a
// `anchoGif` de ancho, van a `cuadrosPorSegundoGif` y usan una paleta hecha
// para sus propios colores.
async function codificar(carpeta, salida, fondo, opciones) {
  const [ancho, alto] = opciones.medidas;
  const fps = String(opciones.cuadrosPorSegundo);
  const transparente = fondo == null;
  const codec = argumentosCodec(salida, transparente);
  const argumentos = ['-y', '-loglevel', 'error', '-framerate', fps,
    '-i', path.join(carpeta, '%04d.png')];
  let grafo;
  if (transparente) {
    grafo = '[0]format=rgba';
  } else {
    argumentos.push('-f', 'lavfi', '-i', `color=c=${fondo}:s=${ancho}x${alto}:r=${fps}`);
    grafo = '[1][0]overlay=(W-w)/2:(H-h)/2:shortest=1';
  }
  if (path.extname(salida).toLowerCase() === '.gif') {
    // Menos cuadros por segundo: con 15 de 30 queda uno sí y uno no, así
    // que el loop sigue sin cortes y pesa la mitad.
    if (opciones.cuadrosPorSegundoGif < opciones.cuadrosPorSegundo) {
      grafo += `,fps=${opciones.cuadrosPorSegundoGif}`;
    }
    // Solo se achica: un video más angosto que anchoGif queda igual.
    if (opciones.anchoGif) grafo += `,scale='min(${opciones.anchoGif},iw)':-2:flags=lanczos`;
    // stats_mode=diff y diff_mode=rectangle hacen la paleta con lo que se
    // mueve y solo reescriben esa parte de cada cuadro: el fondo quieto no
    // pesa. El tramado ordenado (bayer) también comprime mejor que el difuso.
    const paleta = transparente ? 'palettegen=stats_mode=diff:reserve_transparent=1' : 'palettegen=stats_mode=diff';
    const uso = `paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle${transparente ? ':alpha_threshold=128' : ''}`;
    grafo += `,split[a][b];[a]${paleta}[p];[b][p]${uso}`;
    argumentos.push('-filter_complex', grafo, '-loop', '0', salida);
  } else {
    argumentos.push('-filter_complex', grafo, ...codec, salida);
  }
  await mkdir(path.dirname(path.resolve(salida)), { recursive: true });
  await correr(process.env.FFMPEG || 'ffmpeg', argumentos);
}

// Las opciones de `girar` revisadas y con sus valores por defecto.
export function completarOpciones(modelo, opciones = {}) {
  const tipo = FORMATOS[path.extname(modelo).toLowerCase()];
  if (!tipo) {
    throw new Error(`${path.basename(modelo)}: los modelos son ${Object.keys(FORMATOS).join(', ')}`);
  }
  const eje = opciones.eje ?? 'z';
  const completas = {
    eje,
    sentido: revisarMovimiento(eje, opciones.sentido),
    medidas: opciones.medidas ?? [1080, 1080],
    segundos: opciones.segundos ?? 6,
    cuadrosPorSegundo: opciones.cuadrosPorSegundo ?? 30,
    elevacion: opciones.elevacion ?? 20,
    color: opciones.color ?? '#a6a6a6',
    anchoGif: opciones.anchoGif === undefined ? 480 : opciones.anchoGif,
    cuadrosPorSegundoGif: opciones.cuadrosPorSegundoGif ?? 15,
    formato: tipo.formato,
    arriba: opciones.arriba ?? tipo.arriba,
  };
  if (!['y', 'z'].includes(completas.arriba)) {
    throw new Error(`arriba debe ser "y" o "z", no "${completas.arriba}"`);
  }
  const [ancho, alto] = completas.medidas;
  if (!(ancho > 0 && alto > 0) || ancho % 2 || alto % 2) {
    // H.264 en yuv420p necesita medidas pares.
    throw new Error(`las medidas deben ser pares y positivas, no ${ancho}x${alto}`);
  }
  for (const clave of ['segundos', 'cuadrosPorSegundo', 'cuadrosPorSegundoGif']) {
    if (!(completas[clave] > 0)) throw new Error(`${clave} debe ser positivo`);
  }
  if (!Number.isFinite(completas.elevacion)) throw new Error('la elevación debe ser un número');
  if (completas.anchoGif !== null && !(completas.anchoGif > 0)) {
    throw new Error('el ancho de los gif debe ser positivo, o null para no achicarlos');
  }
  return completas;
}

/**
 * Dibuja una vuelta del modelo y escribe varios videos con ella, uno por
 * cada { salida, fondo } de `salidas`, sin volver a dibujar.
 *
 * Las opciones son las de `girar`, salvo `fondo`, que va en cada salida.
 * Devuelve las rutas de los videos.
 */
export async function girarVarios(modelo, salidas, opciones = {}) {
  modelo = path.resolve(modelo);
  if (!existsSync(modelo)) throw new Error(`no se encontró el modelo: ${modelo}`);
  const completas = completarOpciones(modelo, opciones);
  for (const { salida, fondo } of salidas) {
    argumentosCodec(salida, fondo == null); // fallar antes de dibujar, no después
  }

  const avisar = opciones.avisar ?? (() => {});
  const carpeta = await mkdtemp(path.join(tmpdir(), 'trompo-'));
  try {
    await dibujarCuadros(modelo, carpeta, completas, avisar);
    for (const { salida, fondo } of salidas) {
      avisar(`codificando ${path.basename(salida)}`);
      await codificar(carpeta, salida, fondo, completas);
    }
  } finally {
    await rm(carpeta, { recursive: true, force: true });
  }
  return salidas.map(({ salida }) => salida);
}

/**
 * Dibuja un video de tornamesa en loop de un modelo 3D.
 *
 * modelo: el archivo .stl, .glb, .gltf, .obj o .ply.
 * salida: el video a escribir, .mp4 (H.264), .mov o .gif. Un fondo
 *   transparente necesita .mov (ProRes 4444) o .gif.
 * opciones:
 *   eje: en qué gira el modelo, "z" o "x" (ver EJES). Por defecto "z".
 *   sentido: hacia dónde, ver EJES; por defecto el primero del eje.
 *   fondo: cualquier color de ffmpeg ("#ff9ecf", "pink"), o null para
 *     transparente. Por defecto "#ffffff".
 *   medidas: [ancho, alto] en píxeles. Por defecto [1080, 1080].
 *   segundos: duración del loop. Por defecto 6.
 *   cuadrosPorSegundo: por defecto 30.
 *   elevacion: grados sobre el horizonte desde donde la cámara mira el
 *     giro en z. Por defecto 20.
 *   color: color del material para modelos sin color propio (STL, OBJ sin
 *     .mtl, PLY sin colores). Por defecto "#a6a6a6".
 *   arriba: qué eje del archivo apunta hacia arriba, "y" o "z". Por
 *     defecto "z" para STL e "y" para el resto.
 *   anchoGif: ancho en píxeles al que se achican los .gif, que pesan
 *     mucho más que un video. Por defecto 480; null para no achicarlos.
 *   cuadrosPorSegundoGif: por defecto 15. Si divide a cuadrosPorSegundo,
 *     el loop sigue sin cortes.
 *   avisar: función que recibe mensajes de progreso.
 *
 * Devuelve la ruta del video.
 */
export async function girar(modelo, salida, opciones = {}) {
  const fondo = opciones.fondo === undefined ? '#ffffff' : opciones.fondo;
  const [escrita] = await girarVarios(modelo, [{ salida, fondo }], opciones);
  return escrita;
}
