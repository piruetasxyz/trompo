#!/usr/bin/env node
// trompo MODELO [-o SALIDA] [--eje z|x] [--sentido ...] [--fondo COLOR|ninguno]
//              [--medidas AxL] [--segundos S] [--elevacion GRADOS]
//              [--color COLOR] [--arriba y|z] [--ancho-gif PX]
// trompo [-c trompo.yml] [--forzar] [--rutas ARCHIVO]

import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { girar, revisarMovimiento, exportar, EJES } from '../src/index.js';

const AYUDA = `uso: trompo MODELO [opciones]
     trompo [-c trompo.yml] [--forzar]

Dibuja un video de tornamesa en loop de un modelo 3D (.stl, .glb, .gltf, .obj, .ply).
Sin MODELO, exporta todos los modelos de trompo.yml.

opciones para un modelo:
  -o, --salida ARCHIVO   video a escribir, .mp4, .mov o .gif
                         (por defecto <modelo>-<eje>-<sentido>.mp4, o .mov sin fondo)
  --eje z|x              z: gira sobre su eje vertical, como un disco (por defecto)
                         x: rueda sobre el eje horizontal de la pantalla, como un tambor
  --sentido SENTIDO      ${Object.entries(EJES).map(([eje, sentidos]) => `${eje}: ${sentidos.join(' (por defecto) o ')}`).join('; ')}
  --fondo COLOR          color de ffmpeg ("#ff9ecf", "pink") o "ninguno" para
                         transparente, en .mov ProRes 4444 o .gif (por defecto #ffffff)
  --medidas AxL          ancho x alto en píxeles, pares (por defecto 1080x1080)
  --segundos S           duración del loop (por defecto 6)
  --elevacion GRADOS     desde qué altura se mira el giro en z (por defecto 20)
  --color COLOR          color de modelos sin color propio, como los STL (por defecto #a6a6a6)
  --arriba y|z           qué eje del archivo apunta hacia arriba
                         (por defecto z para STL, y para el resto)
  --ancho-gif PX         ancho al que se achican los .gif, 0 para no achicarlos (por defecto 480)

opciones para trompo.yml:
  -c, --configuracion ARCHIVO   la configuración (por defecto trompo.yml)
  --forzar               dibujar todo de nuevo, aunque nada haya cambiado
  --rutas ARCHIVO        escribir ahí las rutas de los videos, una por línea

  -h, --ayuda            muestra esta ayuda`;

function salir(mensaje) {
  if (process.stdout.isTTY) process.stdout.write('\r\x1b[K');
  console.error(`trompo: ${mensaje}`);
  process.exit(1);
}

// Progreso en una sola línea que se reescribe, solo en una terminal.
function avisar(mensaje) {
  if (process.stdout.isTTY) process.stdout.write(`\r  ${mensaje}\x1b[K`);
}

function registrar(linea) {
  if (process.stdout.isTTY) process.stdout.write('\r\x1b[K');
  console.log(linea);
}

let argumentos;
try {
  argumentos = parseArgs({
    allowPositionals: true,
    options: {
      salida: { type: 'string', short: 'o' },
      eje: { type: 'string', default: 'z' },
      sentido: { type: 'string' },
      fondo: { type: 'string', default: '#ffffff' },
      medidas: { type: 'string', default: '1080x1080' },
      segundos: { type: 'string', default: '6' },
      elevacion: { type: 'string', default: '20' },
      color: { type: 'string' },
      arriba: { type: 'string' },
      'ancho-gif': { type: 'string', default: '480' },
      configuracion: { type: 'string', short: 'c' },
      forzar: { type: 'boolean' },
      rutas: { type: 'string' },
      ayuda: { type: 'boolean', short: 'h' },
    },
  });
} catch (error) {
  salir(error.message);
}

const { values: valores, positionals: posicionales } = argumentos;
if (valores.ayuda) {
  console.log(AYUDA);
  process.exit(0);
}
if (posicionales.length > 1) salir(`sobran argumentos: ${posicionales.slice(1).join(' ')}`);

try {
  if (posicionales.length === 0) {
    const configuracion = valores.configuracion ?? 'trompo.yml';
    if (!existsSync(configuracion)) {
      salir(`falta el modelo, y no hay ${configuracion} en esta carpeta\n\n${AYUDA}`);
    }
    const { escritos, alDia } = await exportar(configuracion, {
      rutas: valores.rutas, forzar: valores.forzar, registrar, avisar,
    });
    registrar(`${escritos.length} videos dibujados, ${alDia.length} al día`);
  } else {
    const modelo = posicionales[0];
    const sentido = revisarMovimiento(valores.eje, valores.sentido);
    const fondo = valores.fondo === 'ninguno' ? null : valores.fondo;
    const medidas = valores.medidas.split('x').map(Number);
    if (medidas.length !== 2 || medidas.some(Number.isNaN)) salir(`medidas no válidas: ${valores.medidas}`);
    const anchoGif = Number(valores['ancho-gif']);
    const salida = valores.salida
      ?? `${path.parse(modelo).name}-${valores.eje}-${sentido}${fondo == null ? '.mov' : '.mp4'}`;

    await girar(modelo, salida, {
      eje: valores.eje,
      sentido,
      fondo,
      medidas,
      segundos: Number(valores.segundos),
      elevacion: Number(valores.elevacion),
      color: valores.color,
      arriba: valores.arriba,
      anchoGif: anchoGif === 0 ? null : anchoGif,
      avisar,
    });
    registrar(salida);
  }
} catch (error) {
  salir(error.message);
}
