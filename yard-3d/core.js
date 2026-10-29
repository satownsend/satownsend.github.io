/* The yard in 3D: shared stage (renderer, camera, controls, bloom, picking,
 * labels) that every scene in /yard-3d/scenes/ is built on.
 *
 * A scene module default-exports { id, title, … , build(ctx) }. build() adds
 * objects to ctx.scene and may return { update(t, dt), dispose() }. Everything
 * added to the scene is disposed automatically when the next scene loads. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function luminance(hex){
  const c = new THREE.Color(hex || '#000'); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
// The current site theme as colors a scene can use (they change with the picker).
export function themeColors(){
  const get = (n, d) => cssVar(n) || d;
  const t = {
    bg: get('--bg', '#08191c'), bg2: get('--bg2', '#0d2629'), panel: get('--panel', '#102d31'),
    ink: get('--ink', '#e3eef0'), muted: get('--muted', '#8ea3a6'), line: get('--line2', '#2a5159'),
    accent: get('--accent', '#4dd0c1'), accent2: get('--accent2', '#f0a868'), cool: get('--cool', '#7ec4cc'),
  };
  t.light = luminance(t.bg) > 0.45;
  return t;
}

/* ---------- colour ramps ---------- */
const TEMP_STOPS = [[-10, '#2c2a7e'], [10, '#3c6bd6'], [25, '#6fb3ee'], [32, '#a8e6f5'], [45, '#7fd6a8'],
  [58, '#b6dc6c'], [70, '#f0d25a'], [82, '#f39a3d'], [92, '#e4572e'], [104, '#a3202f']];
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
export function tempColor(f, out = new THREE.Color()){
  if (f == null || !Number.isFinite(f)) return out.set('#666');
  if (f <= TEMP_STOPS[0][0]) return out.set(TEMP_STOPS[0][1]);
  for (let i = 1; i < TEMP_STOPS.length; i++){
    const [t1, c1] = TEMP_STOPS[i];
    if (f <= t1){
      const [t0, c0] = TEMP_STOPS[i - 1];
      tmpA.set(c0); tmpB.set(c1);
      return out.copy(tmpA).lerp(tmpB, (f - t0) / (t1 - t0));
    }
  }
  return out.set(TEMP_STOPS[TEMP_STOPS.length - 1][1]);
}
export const TEMP_GRADIENT = TEMP_STOPS.map(([t, c]) => ({ t, c }));

export const ease = {
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- text labels (canvas sprites) ---------- */
function bodyFont(){ return getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'; }
/** A camera-facing text label. `size` is the world height of one line of text. */
export function textSprite(text, o = {}){
  const { size = 0.5, color = '#ffffff', bg = null, weight = 600, padding = 0.35, align = 'center',
    depthTest = true, opacity = 1, italic = false, border = null, radius = 0.35 } = o;
  const px = 64, lines = String(text).split('\n');
  const font = `${italic ? 'italic ' : ''}${weight} ${px}px ${o.font || bodyFont()}`;
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = font;
  const pad = bg ? px * padding : px * 0.08;
  const w = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width)) + pad * 2);
  const lh = px * 1.22, h = Math.ceil(lh * lines.length + pad * 2);
  c.width = w; c.height = h;
  g.font = font; g.textBaseline = 'middle';
  if (bg){
    g.fillStyle = bg; const r = px * radius;
    g.beginPath(); g.roundRect(0, 0, w, h, r); g.fill();
    if (border){ g.strokeStyle = border; g.lineWidth = 3; g.stroke(); }
  }
  g.fillStyle = color;
  g.textAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center';
  const x = align === 'left' ? pad : align === 'right' ? w - pad : w / 2;
  lines.forEach((l, i) => g.fillText(l, x, pad + lh * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest, opacity });
  const s = new THREE.Sprite(mat);
  const unit = size / lh;
  s.scale.set(w * unit, h * unit, 1);
  if (align === 'left') s.center.set(0, 0.5); else if (align === 'right') s.center.set(1, 0.5);
  s.userData.isLabel = true;
  return s;
}

/** A soft round glow texture for sprites/points. */
let _glow = null;
export function glowTexture(){
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.75)');
  grd.addColorStop(0.6, 'rgba(255,255,255,.18)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c); _glow.colorSpace = THREE.SRGBColorSpace; _glow.userData.shared = true;
  return _glow;
}

/** An emoji / glyph rendered to a sprite (for event markers). */
export function glyphSprite(glyph, size = 0.6, ring = null){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  if (ring){ g.fillStyle = ring; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill(); }
  g.font = '80px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

/* ---------- disposal ---------- */
function disposeMaterial(m){
  if (!m) return;
  for (const k of Object.keys(m)){
    const v = m[k];
    if (v && v.isTexture && !v.userData.shared) v.dispose();
  }
  if (m.uniforms) for (const u of Object.values(m.uniforms)){ if (u.value && u.value.isTexture && !u.value.userData.shared) u.value.dispose(); }
  m.dispose();
}
export function disposeTree(root){
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(disposeMaterial);
  });
}

/* ---------- the stage ---------- */
export class Stage {
  constructor(host, tip){
    this.host = host; this.tip = tip; this.token = 0;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1;   // keeps data colors true
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 'y3-canvas';
    r.domElement.setAttribute('aria-hidden', 'true');
    host.prepend(r.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 3000);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.scene = new THREE.Scene();
    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.5, 0.82);
    this.composer.addPass(this.renderPass); this.composer.addPass(this.bloomPass); this.composer.addPass(new OutputPass());
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(); this.pointerPx = { x: 0, y: 0 };
    this.pickables = new Map(); this.frameFns = []; this.current = null;
    this.hovered = null; this.pointerDirty = false; this.pointerInside = false;
    this.visible = true;

    new ResizeObserver(() => this.resize()).observe(host);
    new IntersectionObserver(es => { this.visible = es[0].isIntersecting; }).observe(host);
    const el = r.domElement;
    el.addEventListener('pointermove', e => this.onPointer(e));
    el.addEventListener('pointerleave', () => { this.pointerInside = false; this.setHover(null); });
    let down = null;
    el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; this.onPointer(e); });
    el.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6) return;
      this.onPointer(e); this.pick(true);
    });
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }
  resize(){
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.current && this.current.resize) this.current.resize(w, h);
  }
  onPointer(e){
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerPx = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.pointer.set((this.pointerPx.x / rect.width) * 2 - 1, -(this.pointerPx.y / rect.height) * 2 + 1);
    this.pointerDirty = true; this.pointerInside = true;
  }
  /** Find the registered object under the pointer (walking up to a registered ancestor). */
  hit(){
    if (!this.pickables.size) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.params.Points.threshold = 0.15;
    this.raycaster.params.Line.threshold = 0.1;
    const objs = [...this.pickables.keys()].filter(o => o.visible !== false && o.parent);
    const hits = this.raycaster.intersectObjects(objs, true);
    for (const h of hits){
      let o = h.object;
      while (o && !this.pickables.has(o)) o = o.parent;
      if (!o) continue;
      if (!isVisibleInScene(o)) continue;
      const handler = this.pickables.get(o);
      const info = { ...h, target: o };
      if (handler.accept && !handler.accept(info)) continue;
      return { info, handler };
    }
    return null;
  }
  pick(click){
    const found = this.hit();
    this.setHover(found);
    if (click && found && found.handler.click) found.handler.click(found.info);
    else if (click && !found && this.current && this.current.clickEmpty) this.current.clickEmpty();
  }
  setHover(found){
    const prev = this.hovered;
    const same = prev && found && prev.info.target === found.info.target && prev.info.instanceId === found.info.instanceId && prev.info.faceIndex === found.info.faceIndex;
    if (prev && !same && prev.handler.hover) prev.handler.hover(prev.info, false);
    this.hovered = found;
    if (found && !same && found.handler.hover) found.handler.hover(found.info, true);
    const html = found && found.handler.tip ? found.handler.tip(found.info) : null;
    this.renderer.domElement.style.cursor = found && found.handler.click ? 'pointer' : '';
    if (!html){ this.tip.hidden = true; return; }
    this.tip.innerHTML = html; this.tip.hidden = false;
    const W = this.host.clientWidth, H = this.host.clientHeight, tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let x = this.pointerPx.x + 16, y = this.pointerPx.y + 16;
    if (x + tw > W - 8) x = this.pointerPx.x - tw - 16;
    if (y + th > H - 8) y = this.pointerPx.y - th - 16;
    this.tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  frame(){
    if (!this.visible || document.hidden){ this.clock.getDelta(); return; }
    const dt = Math.min(this.clock.getDelta(), 0.1), t = this.clock.elapsedTime;
    for (const f of this.frameFns) f(t, dt);
    if (this.current && this.current.update) this.current.update(t, dt);
    if (this.controls.enabled) this.controls.update(dt);
    if (this.pointerDirty && this.pointerInside){ this.pointerDirty = false; this.pick(false); }
    this.composer.render(dt);
  }
  /** Tear down the current scene and every GPU resource it made. */
  clear(){
    if (this.current && this.current.dispose){ try { this.current.dispose(); } catch(e){ console.warn(e); } }
    this.current = null;
    disposeTree(this.scene);
    this.scene = new THREE.Scene();
    this.renderPass.scene = this.scene;
    this.pickables.clear(); this.frameFns = []; this.hovered = null; this.tip.hidden = true;
    this.renderer.domElement.style.cursor = '';
  }
  resetCameraDefaults(){
    const c = this.controls, cam = this.camera;
    cam.fov = 45; cam.near = 0.1; cam.far = 3000; cam.up.set(0, 1, 0); cam.updateProjectionMatrix();
    c.enabled = true; c.enableDamping = true; c.dampingFactor = 0.08; c.enablePan = true; c.enableZoom = true; c.enableRotate = true;
    c.autoRotate = false; c.autoRotateSpeed = 0.6; c.minDistance = 1; c.maxDistance = 600;
    c.minPolarAngle = 0; c.maxPolarAngle = Math.PI * 0.495; c.screenSpacePanning = true;
    c.minAzimuthAngle = -Infinity; c.maxAzimuthAngle = Infinity;
    c.target.set(0, 0, 0);
    this.bloomPass.strength = 0.45; this.bloomPass.radius = 0.5; this.bloomPass.threshold = 0.82;
    this.renderer.toneMappingExposure = 1;
  }
  /** Save the camera pose a scene starts with, for "Reset view". */
  rememberHome(){ this.home = { pos: this.camera.position.clone(), target: this.controls.target.clone() }; }
  goHome(ms = 900){ if (this.home) this.flyTo(this.home.pos, this.home.target, ms); }
  flyTo(pos, target, ms = 1100, done){
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone(), start = performance.now();
    const token = this.token;
    if (this._fly) this.frameFns = this.frameFns.filter(f => f !== this._fly);
    const step = () => {
      if (token !== this.token) return;
      const k = reducedMotion ? 1 : ease.inOut(clamp((performance.now() - start) / ms, 0, 1));
      this.camera.position.lerpVectors(p0, pos, k);
      this.controls.target.lerpVectors(t0, target, k);
      if (k >= 1){ this.frameFns = this.frameFns.filter(f => f !== step); this._fly = null; if (done) done(); }
    };
    this._fly = step; this.frameFns.push(step);
  }
  snapshot(name){
    this.composer.render(0);
    const url = this.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = name + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  }
}

function isVisibleInScene(o){
  for (let x = o; x; x = x.parent){ if (x.visible === false) return false; }
  return true;
}
