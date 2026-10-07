// Exporta todos los modelos de un trompo.yml: un video por cada giro x
// medida x fondo x formato de cada modelo.
//
// Cada video lleva una huella (el archivo del modelo, sus opciones y la
// versión de trompo) guardada en trompo.json, en la carpeta de los videos.
// Si la huella no cambió, el video no se vuelve a dibujar: así una nueva
// corrida no cambia archivos que ya estaban bien, ni hace commits vacíos.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { completarOpciones, girarVarios, revisarMovimiento } from './trompo.js';

const VERSION = JSON.parse(await readFile(new URL('../package.json', import.meta.url))).version;

const ARCHIVO_HUELLAS = 'trompo.json';
const FORMATOS_SALIDA = ['mp4', 'gif'];

// Opciones que se pueden poner para todos los modelos y cambiar en cada uno.
const POR_DEFECTO = {
  giros: ['z'],
  medidas: { cuadrado: '1080x1080' },
  fondos: { blanco: '#ffffff' },
  formatos: ['mp4'],
  segundos: 6,
  elevacion: 20,
  color: '#a6a6a6',
  'ancho-gif': 480,
  'cuadros-por-segundo-gif': 15,
};
const CLAVES_GLOBALES = ['carpeta-videos', 'modelos', ...Object.keys(POR_DEFECTO)];
const CLAVES_MODELO = ['nombre', 'archivo', 'arriba', ...Object.keys(POR_DEFECTO)];

function revisarClaves(objeto, permitidas, donde) {
  for (const clave of Object.keys(objeto)) {
    if (!permitidas.includes(clave)) {
      throw new Error(`${donde}: clave desconocida "${clave}" (las válidas son ${permitidas.join(', ')})`);
    }
  }
}

function esMapa(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

// "z" o "x-arriba" → ["z", "antihorario"], ["x", "arriba"].
function leerGiro(texto, donde) {
  const [eje, ...resto] = String(texto).split('-');
  try {
    return [eje, revisarMovimiento(eje, resto.length ? resto.join('-') : undefined)];
  } catch (error) {
    throw new Error(`${donde}: ${error.message}`);
  }
}

// "1080x1920" → [1080, 1920].
function leerMedidas(texto, donde) {
  const medidas = String(texto).split('x').map(Number);
  if (medidas.length !== 2 || medidas.some((medida) => !(medida > 0))) {
    throw new Error(`${donde}: medidas no válidas "${texto}", se escriben como 1080x1920`);
  }
  return medidas;
}

// La lista de trabajos de un modelo: uno por giro x medida, cada uno con
// los videos (fondo x formato) que salen de esos mismos cuadros.
function trabajosDelModelo(modelo, globales, carpetaVideos, indice) {
  const donde = `modelos[${indice}]`;
  if (!esMapa(modelo)) throw new Error(`${donde}: debe ser un mapa con nombre y archivo`);
  revisarClaves(modelo, CLAVES_MODELO, donde);
  if (!modelo.nombre) throw new Error(`${donde}: falta el nombre`);
  if (!modelo.archivo) throw new Error(`${donde} (${modelo.nombre}): falta el archivo`);
  const opciones = { ...globales, ...modelo };
  const aqui = `${donde} (${modelo.nombre})`;

  for (const clave of ['giros', 'formatos']) {
    if (!Array.isArray(opciones[clave]) || !opciones[clave].length) {
      throw new Error(`${aqui}: ${clave} debe ser una lista no vacía`);
    }
  }
  for (const clave of ['medidas', 'fondos']) {
    if (!esMapa(opciones[clave]) || !Object.keys(opciones[clave]).length) {
      throw new Error(`${aqui}: ${clave} debe ser un mapa no vacío de nombre: valor`);
    }
  }
  for (const formato of opciones.formatos) {
    if (!FORMATOS_SALIDA.includes(formato)) {
      throw new Error(`${aqui}: formato "${formato}" no válido (los válidos son ${FORMATOS_SALIDA.join(', ')})`);
    }
  }

  const trabajos = [];
  for (const giro of opciones.giros) {
    const [eje, sentido] = leerGiro(giro, aqui);
    for (const [nombreMedida, textoMedidas] of Object.entries(opciones.medidas)) {
      const opcionesGiro = completarOpciones(modelo.archivo, {
        eje,
        sentido,
        medidas: leerMedidas(textoMedidas, aqui),
        segundos: opciones.segundos,
        elevacion: opciones.elevacion,
        color: opciones.color,
        arriba: opciones.arriba,
        anchoGif: opciones['ancho-gif'],
        cuadrosPorSegundoGif: opciones['cuadros-por-segundo-gif'],
      });
      const salidas = [];
      for (const [nombreFondo, color] of Object.entries(opciones.fondos)) {
        const fondo = color == null || color === 'ninguno' ? null : String(color);
        for (const formato of opciones.formatos) {
          // Un video transparente no puede ser .mp4: va en .mov.
          const extension = formato === 'mp4' && fondo == null ? 'mov' : formato;
          const nombreArchivo = `${modelo.nombre}-${eje}-${sentido}-${nombreMedida}-${nombreFondo}.${extension}`;
          salidas.push({ salida: path.join(carpetaVideos, nombreArchivo), nombreArchivo, fondo });
        }
      }
      trabajos.push({
        nombre: modelo.nombre,
        archivo: modelo.archivo,
        etiqueta: `${modelo.nombre} ${eje}-${sentido} ${nombreMedida}`,
        opciones: opcionesGiro,
        salidas,
      });
    }
  }
  return trabajos;
}

export async function leerConfiguracion(rutaConfiguracion) {
  const configuracion = parse(await readFile(rutaConfiguracion, 'utf8')) ?? {};
  if (!esMapa(configuracion)) throw new Error(`${rutaConfiguracion}: debe ser un mapa`);
  revisarClaves(configuracion, CLAVES_GLOBALES, rutaConfiguracion);
  if (!Array.isArray(configuracion.modelos) || !configuracion.modelos.length) {
    throw new Error(`${rutaConfiguracion}: falta la lista de modelos`);
  }

  const carpetaVideos = configuracion['carpeta-videos'] ?? 'docs/videos';
  const globales = { ...POR_DEFECTO };
  for (const clave of Object.keys(POR_DEFECTO)) {
    if (clave in configuracion) globales[clave] = configuracion[clave];
  }

  const nombres = new Set();
  const trabajos = [];
  configuracion.modelos.forEach((modelo, indice) => {
    if (nombres.has(modelo?.nombre)) throw new Error(`modelos: el nombre "${modelo.nombre}" está repetido`);
    nombres.add(modelo?.nombre);
    trabajos.push(...trabajosDelModelo(modelo, globales, carpetaVideos, indice));
  });
  return { carpetaVideos, trabajos };
}

// Lo que tiene que cambiar para volver a dibujar un video: el modelo (y su
// .mtl, si es un OBJ), las opciones, el fondo y la versión de trompo.
async function huella(trabajo, fondo, extension) {
  const hash = createHash('sha1');
  hash.update(JSON.stringify([VERSION, trabajo.opciones, fondo, extension]));
  hash.update(await readFile(trabajo.archivo));
  const mtl = trabajo.archivo.replace(/\.obj$/i, '.mtl');
  if (mtl !== trabajo.archivo && existsSync(mtl)) hash.update(await readFile(mtl));
  return hash.digest('hex').slice(0, 16);
}

/**
 * Exporta los videos de todos los modelos de un trompo.yml. Las rutas del
 * archivo son relativas a la carpeta actual.
 *
 * opciones:
 *   rutas: archivo donde escribir, una por línea, las rutas de los videos
 *     y de trompo.json (para hacer `git add` de ellas).
 *   forzar: dibujar todo de nuevo, aunque las huellas no hayan cambiado.
 *   registrar: función que recibe una línea de resumen por trabajo.
 *   avisar: función que recibe mensajes de progreso.
 *
 * Devuelve { escritos, alDia }: las rutas de los videos dibujados y de los
 * que ya estaban al día.
 */
export async function exportar(rutaConfiguracion, opciones = {}) {
  const registrar = opciones.registrar ?? (() => {});
  const avisar = opciones.avisar ?? (() => {});
  const { carpetaVideos, trabajos } = await leerConfiguracion(rutaConfiguracion);

  const rutaHuellas = path.join(carpetaVideos, ARCHIVO_HUELLAS);
  const anteriores = existsSync(rutaHuellas) ? JSON.parse(await readFile(rutaHuellas, 'utf8')) : {};
  const huellas = {};
  const escritos = [];
  const alDia = [];

  for (const trabajo of trabajos) {
    if (!existsSync(trabajo.archivo)) {
      throw new Error(`${trabajo.nombre}: no se encontró el modelo ${trabajo.archivo}`);
    }
    const pendientes = [];
    for (const salida of trabajo.salidas) {
      const actual = await huella(trabajo, salida.fondo, path.extname(salida.salida));
      huellas[salida.nombreArchivo] = actual;
      if (!opciones.forzar && anteriores[salida.nombreArchivo] === actual && existsSync(salida.salida)) {
        alDia.push(salida.salida);
      } else {
        pendientes.push(salida);
      }
    }
    if (!pendientes.length) {
      registrar(`${trabajo.etiqueta}: al día`);
      continue;
    }
    await girarVarios(trabajo.archivo, pendientes, {
      ...trabajo.opciones,
      avisar: (mensaje) => avisar(`${trabajo.etiqueta}: ${mensaje}`),
    });
    escritos.push(...pendientes.map(({ salida }) => salida));
    registrar(`${trabajo.etiqueta}: ${pendientes.map(({ nombreArchivo }) => nombreArchivo).join(', ')}`);
  }

  // Videos que están en la carpeta pero que ya no salen de la configuración.
  const sobrantes = readdirSync(carpetaVideos)
    .filter((nombre) => /\.(mp4|mov|gif)$/i.test(nombre) && !(nombre in huellas));
  if (sobrantes.length) {
    registrar(`aviso: estos videos de ${carpetaVideos} ya no salen de ${rutaConfiguracion}: ${sobrantes.join(', ')}`);
  }

  // Solo se reescribe si cambió, para no dejar un trompo.json distinto sin
  // que haya cambiado ningún video.
  const ordenadas = Object.fromEntries(Object.entries(huellas).sort(([a], [b]) => a.localeCompare(b)));
  const texto = `${JSON.stringify(ordenadas, null, 2)}\n`;
  await mkdir(carpetaVideos, { recursive: true });
  if (!existsSync(rutaHuellas) || (await readFile(rutaHuellas, 'utf8')) !== texto) {
    await writeFile(rutaHuellas, texto);
  }

  if (opciones.rutas) {
    const todas = [...trabajos.flatMap((trabajo) => trabajo.salidas.map(({ salida }) => salida)), rutaHuellas];
    await writeFile(opciones.rutas, `${todas.join('\n')}\n`);
  }
  return { escritos, alDia };
}
