// Isolated renderer: the existing nine scenes keep their pinned Three.js version.
// Scan bytes stay local; no upload, credential or public URL is created here.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { scanExtension, frameBounds } from './model.js';

const host = document.querySelector('#viewport'), status = document.querySelector('#status');
const fileInput = document.querySelector('#scanFile'), reset = document.querySelector('#reset'), flip = document.querySelector('#flip');
let renderer, controls, camera, scene, spark, mesh, home, request = 0, destroyed = false;
const message = text => { status.textContent = text; };

async function init(){
  if (renderer) return;
  // Lazy load the decoder/worker only when a scan is actually selected.
  const { SparkRenderer } = await import('@sparkjsdev/spark');
  if (destroyed) throw new Error('Viewer closed.');
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.setAttribute('aria-label', 'Interactive reconstructed yard. Drag to orbit; scroll or pinch to zoom.');
  host.prepend(renderer.domElement);
  scene = new THREE.Scene(); scene.background = new THREE.Color('#0b1619');
  camera = new THREE.PerspectiveCamera(55, 1, .01, 10000);
  controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI; controls.minDistance = .01;
  spark = new SparkRenderer({ renderer, lodSplatScale: Number(document.querySelector('#quality').value) }); scene.add(spark);
  const resize = () => { const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  renderer.setAnimationLoop(() => { if (!document.hidden) { controls.update(); renderer.render(scene, camera); } });
  window.addEventListener('pagehide', () => { destroyed = true; request++; observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); mesh?.dispose(); spark.dispose(); renderer.dispose(); }, { once: true });
}

function frame(){
  const box = mesh.getBoundingBox(false).applyMatrix4(mesh.matrixWorld);
  const view = frameBounds(box.min.toArray(), box.max.toArray(), camera.aspect, camera.fov);
  const center = new THREE.Vector3(...view.center);
  camera.near = view.near; camera.far = view.far; camera.updateProjectionMatrix();
  controls.minDistance = view.radius * .002; controls.maxDistance = view.distance * 12;
  controls.target.copy(center); camera.position.copy(center).add(new THREE.Vector3(.6, .35, 1).normalize().multiplyScalar(view.distance));
  controls.update(); home = { position: camera.position.clone(), target: center.clone() };
}

export async function loadScan(file){
  const id = ++request;
  let next;
  try {
    scanExtension(file.name);
    if (!file.size) throw new Error('This file is empty. Choose an exported Gaussian splat scan.');
    if (file.size > 512 * 1024 * 1024) throw new Error('This scan exceeds 512 MB. Crop or compress it to SPZ or bundled SOG before opening it here.');
    fileInput.disabled = true;
    message('Preparing the 3D renderer…');
    await init(); if (id !== request || destroyed) return;
    const { SplatMesh } = await import('@sparkjsdev/spark');
    message('Reading and reconstructing the scan display…');
    const bytes = await file.arrayBuffer(); if (id !== request || destroyed) return;
    next = new SplatMesh({ fileBytes: bytes, fileName: file.name, lod: true, nonLod: true, raycastable: false });
    await next.initialized;
    if (id !== request || destroyed) { next.dispose(); return; }
    if (!next.numSplats) throw new Error('No Gaussian splats found. A plain mesh or point-cloud PLY is not a Gaussian splat scan.');
    // Validate before replacing the last successful scan.
    const bounds = next.getBoundingBox(false); frameBounds(bounds.min.toArray(), bounds.max.toArray(), camera.aspect, camera.fov);
    const previous = mesh; mesh = next; scene.add(mesh); mesh.updateMatrixWorld(true); frame();
    if (previous) { scene.remove(previous); previous.dispose(); }
    next = null;
    document.querySelector('#empty').hidden = true; reset.disabled = flip.disabled = false;
    message(`${file.name} · ${mesh.numSplats.toLocaleString()} splats · drag to orbit, pinch or scroll to zoom. Local preview; not uploaded or saved.`);
  } catch (error) {
    next?.dispose();
    if (id === request && !destroyed) message(`Could not open scan: ${error.message || error}. Your previous view is kept.`);
  } finally { if (id === request && !destroyed) { fileInput.disabled = false; fileInput.value = ''; } }
}

fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadScan(fileInput.files[0]); });
reset.addEventListener('click', () => { if (home) { camera.position.copy(home.position); controls.target.copy(home.target); controls.update(); } });
flip.addEventListener('click', () => { if (mesh) { mesh.rotation.x += Math.PI; mesh.updateMatrixWorld(true); frame(); } });
document.querySelector('#quality').addEventListener('change', event => { if (spark) spark.lodSplatScale = Number(event.target.value); });
