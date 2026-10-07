// La escena que corre dentro de Chromium: carga el modelo, encuadra la
// cámara para toda la vuelta y entrega cada cuadro como png transparente.
// trompo.js la maneja desde Node con window.trompo.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

// Puntos de la vuelta donde se revisa que el modelo quepa en el cuadro.
const PASOS_SONDEO = 32;
// Máximo de vértices que se proyectan en cada paso del sondeo.
const MAXIMO_VERTICES = 20000;
// Fracción del cuadro que puede ocupar el modelo, para que no toque los bordes.
const MARGEN = 0.9;

let renderizador, escena, camara, giro;
let eje = 'z';
let signo = 1;

async function cargarModelo(url, formato, colorMaterial) {
  const material = () => new THREE.MeshStandardMaterial({
    color: colorMaterial, roughness: 0.6, metalness: 0,
    // Por las dos caras: los escaneos y algunos STL son mallas abiertas.
    side: THREE.DoubleSide,
  });

  if (formato === 'glb' || formato === 'gltf') {
    const cargadorDraco = new DRACOLoader();
    cargadorDraco.setDecoderPath('/three/examples/jsm/libs/draco/');
    const cargador = new GLTFLoader();
    cargador.setDRACOLoader(cargadorDraco);
    return (await cargador.loadAsync(url)).scene;
  }
  if (formato === 'stl') {
    const geometria = await new STLLoader().loadAsync(url);
    geometria.computeVertexNormals();
    // Algunos STL traen colores por cara (STL binario de Materialise o VisCAM).
    const mat = material();
    if (geometria.hasColors) {
      mat.vertexColors = true;
      mat.color.set(0xffffff);
    }
    return new THREE.Mesh(geometria, mat);
  }
  if (formato === 'ply') {
    const geometria = await new PLYLoader().loadAsync(url);
    // Los escaneos suelen traer el color en los vértices.
    const conColor = geometria.hasAttribute('color');
    if (!geometria.index) {
      // Sin caras: una nube de puntos. El tamaño es en píxeles, porque el
      // modelo se escala después de cargarlo.
      return new THREE.Points(geometria, new THREE.PointsMaterial({
        size: 2, sizeAttenuation: false, vertexColors: conColor,
        color: conColor ? 0xffffff : colorMaterial,
      }));
    }
    if (!geometria.hasAttribute('normal')) geometria.computeVertexNormals();
    const mat = material();
    if (conColor) {
      mat.vertexColors = true;
      mat.color.set(0xffffff);
    }
    return new THREE.Mesh(geometria, mat);
  }
  if (formato === 'obj') {
    const cargador = new OBJLoader();
    // El .mtl con el mismo nombre, si existe, trae materiales y texturas.
    const urlMtl = url.replace(/\.obj$/i, '.mtl');
    const respuesta = await fetch(urlMtl);
    if (respuesta.ok) {
      const materiales = new MTLLoader().parse(await respuesta.text(), urlMtl.replace(/[^/]*$/, ''));
      materiales.preload();
      cargador.setMaterials(materiales);
    }
    const modelo = await cargador.loadAsync(url);
    if (!respuesta.ok) {
      modelo.traverse((objeto) => {
        if (objeto.isMesh) objeto.material = material();
      });
    }
    return modelo;
  }
  throw new Error(`formato no soportado: ${formato}`);
}

// Vértices del modelo en coordenadas del mundo, con a lo más MAXIMO_VERTICES.
function verticesDelModelo(raiz) {
  raiz.updateMatrixWorld(true);
  const mallas = [];
  let total = 0;
  raiz.traverse((objeto) => {
    const posiciones = objeto.geometry?.attributes?.position;
    if (posiciones) {
      mallas.push([objeto, posiciones]);
      total += posiciones.count;
    }
  });
  const salto = Math.max(1, Math.ceil(total / MAXIMO_VERTICES));
  const vertices = [];
  for (const [objeto, posiciones] of mallas) {
    for (let i = 0; i < posiciones.count; i += salto) {
      vertices.push(new THREE.Vector3().fromBufferAttribute(posiciones, i).applyMatrix4(objeto.matrixWorld));
    }
  }
  return vertices;
}

// Gira el modelo a la fracción `t` (0 a 1) de la vuelta.
function girarA(t) {
  const angulo = signo * 2 * Math.PI * t;
  if (eje === 'z') giro.rotation.set(0, angulo, 0);
  else giro.rotation.set(angulo, 0, 0);
  giro.updateMatrixWorld(true);
}

// El zoom más cercano con el que el modelo cabe en el cuadro durante toda
// la vuelta. Con la cámara quieta, el zoom escala las coordenadas de
// pantalla de forma exacta, así que basta con medir una vez con zoom 1.
function encuadrar(vertices) {
  camara.zoom = 1;
  camara.updateProjectionMatrix();
  camara.updateMatrixWorld(true);
  const proyectado = new THREE.Vector3();
  let maximo = 0;
  for (let paso = 0; paso < PASOS_SONDEO; paso++) {
    girarA(paso / PASOS_SONDEO);
    for (const vertice of vertices) {
      proyectado.copy(vertice).applyMatrix4(giro.matrixWorld).project(camara);
      maximo = Math.max(maximo, Math.abs(proyectado.x), Math.abs(proyectado.y));
    }
  }
  camara.zoom = MARGEN / maximo;
  camara.updateProjectionMatrix();
  girarA(0);
}

window.trompo = {
  async preparar({ url, formato, arriba, colorMaterial, ancho, alto, ejeGiro, sentido, elevacion }) {
    eje = ejeGiro;
    signo = sentido;

    renderizador = new THREE.WebGLRenderer({
      antialias: true, alpha: true, preserveDrawingBuffer: true,
    });
    renderizador.setPixelRatio(1);
    renderizador.setSize(ancho, alto);
    renderizador.setClearColor(0x000000, 0);
    document.body.appendChild(renderizador.domElement);

    escena = new THREE.Scene();

    // Las mismas luces que el visor 3D de piruetas.xyz. Van pegadas a la
    // cámara, así la elevación no cambia qué lado queda iluminado.
    camara = new THREE.PerspectiveCamera(30, ancho / alto, 0.01, 100);
    camara.add(new THREE.AmbientLight(0xffffff, 1.2));
    const luzPrincipal = new THREE.DirectionalLight(0xffffff, 1.5);
    luzPrincipal.position.set(1, 1, 2);
    camara.add(luzPrincipal);
    const luzRelleno = new THREE.DirectionalLight(0xffffff, 0.6);
    luzRelleno.position.set(-1, 0.5, -1);
    camara.add(luzRelleno);
    escena.add(camara);

    const modelo = await cargarModelo(url, formato, colorMaterial);

    // three.js usa y hacia arriba; los STL vienen con z hacia arriba (la
    // normal de la cama de impresión).
    const orientacion = new THREE.Group();
    if (arriba === 'z') orientacion.rotation.x = -Math.PI / 2;
    orientacion.add(modelo);

    // Centrar el modelo en el eje de giro y llevarlo a radio 1.
    const caja = new THREE.Box3().setFromObject(orientacion);
    const esfera = caja.getBoundingSphere(new THREE.Sphere());
    const normalizado = new THREE.Group();
    normalizado.add(orientacion);
    orientacion.position.sub(esfera.center);
    normalizado.scale.setScalar(1 / esfera.radius);

    giro = new THREE.Group();
    giro.add(normalizado);
    escena.add(giro);

    // El eje z se mira desde arriba, en ángulo; el eje x, de frente.
    const anguloElevacion = THREE.MathUtils.degToRad(eje === 'z' ? elevacion : 0);
    const distancia = 6;
    camara.position.set(0, distancia * Math.sin(anguloElevacion), distancia * Math.cos(anguloElevacion));
    camara.lookAt(0, 0, 0);

    encuadrar(verticesDelModelo(giro));
  },

  // Un cuadro de la vuelta, como png en data URL.
  cuadro(t) {
    girarA(t);
    renderizador.render(escena, camara);
    return renderizador.domElement.toDataURL('image/png');
  },
};
