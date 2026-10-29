/* 06 · Yard viewpoints: the yard map as the ground, with a little camera at
 * each saved photo viewpoint (yard_view_pins) facing the way it was set,
 * its view cone drawn out across the grass. Signed in, that viewpoint's yard
 * photos stand in its cone; click a camera to drop to eye level there. Plants
 * you've placed on the yard map on this device appear as markers. */
const SIZE = 40;                   // the 1254 px square map → 40 units (~306 ft, so 1 unit ≈ 7.7 ft)
const EYE = 0.75;                  // ~5.5 ft
const MAP = 'photos/yard-map.jpg';

export default {
  async build(ctx){
    const { THREE, scene, camera, controls, data, ui, colors, reducedMotion } = ctx;
    ctx.status('Unrolling the yard map…');
    const authed = data.isAuthed();
    const [pins, photos, plants] = await Promise.all([data.viewPins(), data.yardPhotos().catch(() => []), data.plants().catch(() => [])]);
    const mapTex = await new THREE.TextureLoader().loadAsync(data.imageURL(MAP)).catch(() => null);
    if (!ctx.alive()){ mapTex && mapTex.dispose(); return; }
    if (!pins.length) throw new Error('No viewpoints have been placed on the yard map yet.');

    const toWorld = (x, y) => new THREE.Vector3((x - 0.5) * SIZE, 0, (y - 0.5) * SIZE);
    const dirOf = deg => { const a = deg * Math.PI / 180; return new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)); };
    const nice = s => s.replace(/\b\w/g, c => c.toUpperCase());
    const compass = deg => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
    const byView = new Map(pins.map(p => [p.name.toLowerCase(), []]));
    for (const ph of photos) for (const v of ph.views) if (byView.has(v.toLowerCase())) byView.get(v.toLowerCase()).push(ph);
    for (const list of byView.values()) list.sort((a, b) => b.date.localeCompare(a.date));

    // Light & ground
    scene.background = new THREE.Color(colors.light ? '#dfe9ec' : '#0b1416');
    scene.fog = new THREE.Fog(scene.background, 60, 120);
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a4a3a', 1.1));
    const sun = new THREE.DirectionalLight('#fff3dc', 1.6); sun.position.set(-14, 24, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 });
    scene.add(sun);
    if (mapTex){ mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy(); }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ map: mapTex, color: mapTex ? '#ffffff' : '#3d5a3a', roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const base = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 0.6, 0.8, SIZE + 0.6), new THREE.MeshStandardMaterial({ color: colors.light ? '#c9d4d1' : '#1a2a2a', roughness: 1 }));
    base.position.y = -0.41; scene.add(base);
    // North arrow
    const n = ctx.text('N ↑', { size: 0.9, color: colors.light ? '#173a3a' : '#e8f4f4', weight: 800 }); n.position.set(-SIZE / 2 - 1.6, 0.5, -SIZE / 2 + 1); scene.add(n);

    // Cone texture: fades out with distance
    const fadeCanvas = document.createElement('canvas'); fadeCanvas.width = fadeCanvas.height = 256;
    const g = fadeCanvas.getContext('2d'), grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,.75)'); grd.addColorStop(0.7, 'rgba(255,255,255,.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const fadeTex = new THREE.CanvasTexture(fadeCanvas);

    const coneCol = colors.light ? '#0b7fa8' : '#7fe0ff';
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#1d2427', roughness: 0.35, metalness: 0.4 });
    const lensMat = new THREE.MeshStandardMaterial({ color: '#0d1214', roughness: 0.1, metalness: 0.8, emissive: coneCol, emissiveIntensity: 0.25 });
    const poleMat = new THREE.MeshStandardMaterial({ color: '#d8dede', roughness: 0.6 });
    const loader = new THREE.TextureLoader();
    const views = [];
    for (const p of pins){
      const pos = toWorld(p.x, p.y), dir = dirOf(p.angle), list = byView.get(p.name.toLowerCase()) || [];
      const grp = new THREE.Group(); grp.position.copy(pos); scene.add(grp);
      const L = 6 + Math.min(8, list.length * 0.8);
      // view cone on the grass
      const fov = p.fov * Math.PI / 180;
      const cone = new THREE.Mesh(new THREE.CircleGeometry(L, 40, Math.PI / 2 - fov / 2, fov), new THREE.MeshBasicMaterial({ color: coneCol, map: fadeTex, transparent: true, depthWrite: false, opacity: 0.9 }));
      cone.rotation.x = -Math.PI / 2; cone.rotation.z = -p.angle * Math.PI / 180; cone.position.y = 0.03; grp.add(cone);
      // edge lines of the cone
      const e1 = dirOf(p.angle - p.fov / 2).multiplyScalar(L), e2 = dirOf(p.angle + p.fov / 2).multiplyScalar(L);
      const edges = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.05, 0), e1.setY(0.05), new THREE.Vector3(0, 0.05, 0), e2.setY(0.05)]), new THREE.LineBasicMaterial({ color: coneCol, transparent: true, opacity: 0.7 }));
      grp.add(edges);
      // the little camera on a pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, EYE, 10), poleMat); pole.position.y = EYE / 2; pole.castShadow = true; grp.add(pole);
      const cam = new THREE.Group(); cam.position.y = EYE + 0.18; cam.rotation.y = -p.angle * Math.PI / 180; grp.add(cam);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.36, 0.3), bodyMat); body.castShadow = true; cam.add(body);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.24, 18).rotateX(Math.PI / 2), lensMat); lens.position.z = -0.26; cam.add(lens);
      const bump = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.12), bodyMat); bump.position.set(-0.14, 0.22, 0); cam.add(bump);
      const label = ctx.text(nice(p.name) + (authed ? ` · ${list.length}` : ''), { size: 0.42, color: colors.ink, bg: colors.light ? 'rgba(255,255,255,.88)' : 'rgba(8,22,25,.82)', weight: 700 });
      label.position.set(0, EYE + 0.95, 0); grp.add(label);
      const v = { p, pos, dir, list, grp, cam, label, cards: [] };
      views.push(v);
      const tip = () => `<span class="t-head">📷 ${data.esc(nice(p.name))}</span>Faces ${compass(p.angle)} · ${Math.round(p.fov)}° view`
        + (authed ? `<br>${list.length ? `${list.length} photo${list.length > 1 ? 's' : ''}, ${data.fmtDate(list[list.length - 1].date, { month: 'short', year: 'numeric' })} – ${data.fmtDate(list[0].date, { month: 'short', year: 'numeric' })}` : 'No photos tagged from here yet'}` : '<span class="t-sub">Sign in on Plants to see the photos taken from here</span>')
        + '<span class="t-sub">Click to stand here</span>';
      for (const o of [body, lens, label, pole]) ctx.pick(o, { tip, click: () => enter(v) });
      // photo cards standing in the cone (signed in only)
      list.slice(0, 9).forEach((ph, i) => {
        const row = Math.floor(i / 3), col = i % 3 - 1, dist = 3.2 + row * 2.2;
        const spread = Math.min(fov * 0.55, 0.9);
        const a = p.angle * Math.PI / 180 + col * spread / 2;
        const at = new THREE.Vector3(Math.sin(a) * dist, 0, -Math.cos(a) * dist);
        const card = new THREE.Group(); card.position.set(at.x, 0.55 + row * 0.55, at.z); grp.add(card);
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshStandardMaterial({ color: '#f7f5ef', roughness: 0.8, side: THREE.DoubleSide }));
        frame.castShadow = true; card.add(frame);
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 0.98), new THREE.MeshBasicMaterial({ color: '#33403f', side: THREE.FrontSide }));
        pic.position.z = 0.005; card.add(pic);
        card.rotation.y = Math.atan2(-at.x, -at.z);   // face back toward the camera
        v.cards.push({ card, pic, ph });
        loader.loadAsync(data.thumbURL(ph.key)).catch(() => loader.loadAsync(data.imageURL(ph.key))).then(tex => {
          if (!ctx.alive()){ tex.dispose(); return; }
          tex.colorSpace = THREE.SRGBColorSpace;
          const ar = tex.image.width / tex.image.height;
          pic.material.map = tex; pic.material.color.set('#ffffff'); pic.material.needsUpdate = true;
          const w = ar >= 1 ? 1.38 : 0.98 * ar, h = ar >= 1 ? 1.38 / ar : 0.98;
          pic.scale.set(w / 1.38, h / 0.98, 1); frame.scale.set((w + 0.12) / 1.5, (h + 0.12) / 1.1, 1);
        }).catch(() => {});
        const cardTip = () => `<span class="t-head">${data.esc(nice(p.name))}</span>${data.fmtDate(ph.date)}${ph.caption ? `<br>${data.esc(ph.caption)}` : ''}<span class="t-sub">Click to open</span>`;
        ctx.pick(frame, { tip: cardTip, click: () => openPhoto(ph, nice(p.name)) });
        ctx.pick(pic, { tip: cardTip, click: () => openPhoto(ph, nice(p.name)) });
      });
    }

    // Plants placed on this device's yard map (local-only positions)
    let placed = [];
    try {
      const st = JSON.parse(localStorage.getItem('yardDashboard.v4') || '{}');
      const live = new Map(plants.filter(p => !p.dead).map(p => [p.id, p]));
      placed = (st.plants || []).filter(p => p.mapPos && live.has(p.id)).map(p => ({ p: live.get(p.id), x: p.mapPos.x, y: p.mapPos.y }));
    } catch(e){}
    const treeMat = new THREE.MeshStandardMaterial({ color: '#4f9a52', roughness: 0.7 }), flowerMat = new THREE.MeshStandardMaterial({ color: '#e07ab0', roughness: 0.5 }), trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4a32' });
    for (const pl of placed){
      const pos = toWorld(pl.x, pl.y), grp = new THREE.Group(); grp.position.copy(pos); scene.add(grp);
      const tree = pl.p.category === 'Tree';
      if (tree){
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 8), trunkMat); tr.position.y = 0.2; grp.add(tr);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 12), treeMat); crown.position.y = 0.75; crown.castShadow = true; grp.add(crown);
        ctx.pick(crown, { tip: () => `<span class="t-head">🌳 ${data.esc(pl.p.name)}</span>${data.esc(pl.p.type || pl.p.category)}` });
      } else {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), pl.p.category === 'Flower' ? flowerMat : treeMat); blob.position.y = 0.2; blob.castShadow = true; grp.add(blob);
        ctx.pick(blob, { tip: () => `<span class="t-head">🌱 ${data.esc(pl.p.name)}</span>${data.esc(pl.p.type || pl.p.category)}` });
      }
    }

    // Lightbox
    const dlg = document.createElement('dialog'); dlg.className = 'y3-light';
    dlg.innerHTML = '<button type="button" class="y3-btn ghost">Close</button><img alt=""><p></p>';
    document.body.appendChild(dlg);
    dlg.querySelector('button').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    function openPhoto(ph, view){
      dlg.querySelector('img').src = data.imageURL(ph.key); dlg.querySelector('img').alt = view;
      dlg.querySelector('p').textContent = `${view} · ${data.fmtDate(ph.date)}${ph.caption ? ' · ' + ph.caption : ''}`;
      dlg.showModal();
    }

    // Standing at a viewpoint
    let inside = null;
    const overviewBtn = ui.button({ label: '← Back to the whole yard', onClick: () => leave() });
    overviewBtn.hidden = true;
    function enter(v){
      inside = v;
      const eye = v.pos.clone().add(new THREE.Vector3(0, EYE + 0.5, 0)).addScaledVector(v.dir, -1.6);
      const look = v.pos.clone().add(new THREE.Vector3(0, 0.9, 0)).addScaledVector(v.dir, 5);
      ctx.flyTo(eye, look, 1400);
      controls.minDistance = 0.5;
      overviewBtn.hidden = false;
      views.forEach(o => { o.label.visible = o === v || !authed; });
      ui.readout(`<strong>📷 ${data.esc(nice(v.p.name))}</strong>Facing ${compass(v.p.angle)}${authed ? ` · ${v.list.length} photo${v.list.length === 1 ? '' : 's'} from here` : ''}${authed && v.list.length ? '<br><span class="k">Click a photo to open it</span>' : ''}`);
    }
    function leave(){
      inside = null; overviewBtn.hidden = true;
      views.forEach(o => { o.label.visible = true; });
      ctx.stage.goHome(1200);
      ui.readout(summary());
    }
    const total = views.reduce((s, v) => s + v.list.length, 0);
    const summary = () => `<strong>${views.length} viewpoints</strong>${authed ? `${total} yard photos tagged to them` : 'Sign in on Plants to see the yard photos from each one'}${placed.length ? `<br>${placed.length} plant${placed.length > 1 ? 's' : ''} placed on this device’s map` : ''}`;
    ui.readout(summary());
    ui.legend([{ color: coneCol, label: 'View cone (the camera’s field of view)', shape: 'bar' }, ...(placed.length ? [{ color: '#4f9a52', label: 'Plants you placed on the yard map', shape: 'dot' }] : [])]);
    ctx.about(`<p>The yard map from the Plants dashboard, laid flat, with a little camera at every <strong>viewpoint</strong> you’ve pinned. Each one faces the way you set it, and the pale cone on the grass is what its photos take in. ${authed ? 'The yard photos tagged to each viewpoint stand inside its cone, newest at the front.' : 'Yard photos are private, so they only appear here when you’re signed in.'}</p><p>Click a camera to drop down to eye level and look the way it looks${authed ? '; click any photo to open it full size' : ''}. ${placed.length ? 'The small trees and shrubs are plants you’ve placed on the yard map on this device.' : 'Plants you place on the yard map on this device also show up here.'}</p>`);

    // Frame the cluster of viewpoints rather than the whole map.
    const mid = views.reduce((a, v) => a.add(v.pos), new THREE.Vector3()).divideScalar(views.length);
    camera.position.set(mid.x + 3, 27, mid.z + 27); controls.target.copy(mid);
    controls.maxDistance = 80; controls.maxPolarAngle = Math.PI * 0.47;
    return {
      reset(){ if (inside) leave(); else ctx.stage.goHome(); },
      update(t){
        if (reducedMotion) return;
        for (const v of views) v.cam.position.y = EYE + 0.18 + Math.sin(t * 1.4 + v.pos.x) * 0.02;
      },
      dispose(){ dlg.remove(); fadeTex.dispose(); },
    };
  },
};
