import * as THREE from 'three';
import { getCssColor } from './hero3d.js';

// --- Palette and Ramp Management ---

function createToonRampTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(4, 1);
  const shades = [60, 150, 220, 255];
  for (let i = 0; i < 4; i++) {
    imgData.data[i * 4 + 0] = shades[i];
    imgData.data[i * 4 + 1] = shades[i];
    imgData.data[i * 4 + 2] = shades[i];
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

const TOON_RAMP = createToonRampTexture();

const PALETTE = {
  red: new THREE.Color(),
  orange: new THREE.Color(),
  amber: new THREE.Color(),
  gold: new THREE.Color(),
  outline: new THREE.Color(),
  bg: new THREE.Color(),
  hexRed: '#E10600',
  hexOrange: '#FF5A00',
  hexAmber: '#FFB300',
  hexGold: '#FFC800'
};

function updatePaletteColors() {
  PALETTE.red.copy(getCssColor('--red', '#E10600'));
  PALETTE.orange.copy(getCssColor('--orange', '#FF5A00'));
  PALETTE.amber.copy(getCssColor('--amber', '#FFB300'));
  PALETTE.gold.copy(getCssColor('--gold', '#FFC800'));

  PALETTE.hexRed = '#' + PALETTE.red.getHexString();
  PALETTE.hexOrange = '#' + PALETTE.orange.getHexString();
  PALETTE.hexAmber = '#' + PALETTE.amber.getHexString();
  PALETTE.hexGold = '#' + PALETTE.gold.getHexString();

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) {
    PALETTE.outline.set('#200800');
    PALETTE.bg.set('#FFF8F0');
  } else {
    PALETTE.outline.set('#0E0402');
    PALETTE.bg.set('#070302');
  }
}

// Inverted Hull Outline Material generator
function createOutlineMaterial() {
  return new THREE.MeshBasicMaterial({
    color: PALETTE.outline,
    side: THREE.BackSide,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  });
}

function applyOutline(mesh, thickness = 0.04) {
  const outlineGeo = mesh.geometry.clone();
  const pos = outlineGeo.attributes.position;
  const normal = outlineGeo.attributes.normal;
  if (normal) {
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + normal.getX(i) * thickness,
        pos.getY(i) + normal.getY(i) * thickness,
        pos.getZ(i) + normal.getZ(i) * thickness
      );
    }
    pos.needsUpdate = true;
  }
  const outlineMat = createOutlineMaterial();
  const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
  mesh.add(outlineMesh);
  return outlineMat;
}

const allToonMaterials = [];
const allOutlineMaterials = [];

function registerToonMaterial(mat, role = 'orange') {
  mat.gradientMap = TOON_RAMP;
  allToonMaterials.push({ mat, role });
  return mat;
}

function registerOutlineMaterial(mat) {
  allOutlineMaterials.push(mat);
  return mat;
}

// --- Dynamic Palette Canvas Textures (Point 3) ---

function createCupLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  ctx.fillStyle = isLight ? '#FFF8F0' : '#1A0802';
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = PALETTE.hexOrange;
  ctx.fillRect(0, 20, 512, 30);
  ctx.fillRect(0, 206, 512, 30);

  ctx.fillStyle = PALETTE.hexRed;
  ctx.fillRect(0, 60, 512, 136);

  ctx.fillStyle = PALETTE.hexGold;
  ctx.font = '900 64px "Bungee", sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MÌ GÓI', 256, 128);

  ctx.fillStyle = '#FFF8F0';
  ctx.font = '700 24px sans-serif';
  ctx.fillText('★ 2026 FEST ★', 256, 172);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1);
  return tex;
}

function createPackLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PALETTE.hexOrange;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = '#FFF3E6';
  ctx.beginPath();
  ctx.arc(256, 256, 190, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.hexRed;
  ctx.beginPath();
  ctx.arc(256, 256, 165, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.hexGold;
  ctx.beginPath();
  ctx.arc(256, 290, 80, 0, Math.PI);
  ctx.fill();
  ctx.fillRect(206, 280, 100, 10);

  ctx.fillStyle = '#FFF8F0';
  ctx.font = '900 62px "Bungee", sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MÌ GÓI', 256, 180);

  ctx.font = '700 28px sans-serif';
  ctx.fillText('FESTIVAL', 256, 225);

  return new THREE.CanvasTexture(canvas);
}

function createSachetLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PALETTE.hexRed;
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = PALETTE.hexGold;
  ctx.fillRect(16, 16, 224, 224);

  ctx.fillStyle = PALETTE.hexRed;
  ctx.fillRect(28, 28, 200, 200);

  ctx.fillStyle = '#FFF8F0';
  ctx.font = '900 40px "Bungee", sans-serif, system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GIA VỊ', 128, 110);

  ctx.font = '700 20px sans-serif';
  ctx.fillText('ĐẶC BIỆT', 128, 160);

  return new THREE.CanvasTexture(canvas);
}

// Track textured materials to update them on themechange
const texturedMaterials = {
  cup: [],
  pack: [],
  sachet: []
};

function refreshTexturedMaterials() {
  const newCupTex = createCupLabelTexture();
  const newPackTex = createPackLabelTexture();
  const newSachetTex = createSachetLabelTexture();

  texturedMaterials.cup.forEach((m) => {
    if (m.map) m.map.dispose();
    m.map = newCupTex;
    m.needsUpdate = true;
  });

  texturedMaterials.pack.forEach((m) => {
    if (m.map) m.map.dispose();
    m.map = newPackTex;
    m.needsUpdate = true;
  });

  texturedMaterials.sachet.forEach((m) => {
    if (m.map) m.map.dispose();
    m.map = newSachetTex;
    m.needsUpdate = true;
  });
}

// --- Procedural Pop-Art Model Builders ---

/**
 * 1. CUP
 */
function buildCupModel() {
  const group = new THREE.Group();

  const bodyGeo = new THREE.CylinderGeometry(0.85, 0.6, 1.7, 32, 1, false);
  const cupLabelTex = createCupLabelTexture();
  const bodyMat = registerToonMaterial(
    new THREE.MeshToonMaterial({
      map: cupLabelTex,
      color: 0xffffff,
      transparent: true
    }),
    'white'
  );
  texturedMaterials.cup.push(bodyMat);

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);
  registerOutlineMaterial(applyOutline(bodyMesh, 0.04));

  const rimGeo = new THREE.TorusGeometry(0.87, 0.05, 16, 32);
  rimGeo.rotateX(Math.PI / 2);
  rimGeo.translate(0, 0.85, 0);
  const rimMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.gold, transparent: true }),
    'gold'
  );
  group.add(new THREE.Mesh(rimGeo, rimMat));

  const noodleMouthGeo = new THREE.CylinderGeometry(0.81, 0.81, 0.12, 24);
  noodleMouthGeo.translate(0, 0.78, 0);
  const noodleMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.amber, transparent: true }),
    'amber'
  );
  group.add(new THREE.Mesh(noodleMouthGeo, noodleMat));

  const lidGeo = new THREE.PlaneGeometry(1.3, 1.1, 16, 16);
  const lPos = lidGeo.attributes.position;
  for (let i = 0; i < lPos.count; i++) {
    const y = lPos.getY(i);
    const curl = Math.pow(Math.max(0, y + 0.55) / 1.1, 2) * 0.75;
    lPos.setZ(i, lPos.getZ(i) + curl);
  }
  lidGeo.computeVertexNormals();
  lidGeo.rotateX(-Math.PI / 2);
  lidGeo.rotateY(0.4);
  lidGeo.translate(0.1, 0.9, 0);

  const lidMat = registerToonMaterial(
    new THREE.MeshToonMaterial({
      color: PALETTE.red,
      side: THREE.DoubleSide,
      transparent: true
    }),
    'red'
  );
  group.add(new THREE.Mesh(lidGeo, lidMat));

  const smokeGroup = new THREE.Group();
  for (let s = 0; s < 3; s++) {
    const curvePoints = [];
    const offsetX = (s - 1) * 0.3;
    for (let p = 0; p <= 10; p++) {
      const py = 0.95 + p * 0.18;
      const px = offsetX + Math.sin(p * 0.8 + s * 2.0) * 0.12;
      const pz = Math.cos(p * 0.8 + s * 2.0) * 0.12;
      curvePoints.push(new THREE.Vector3(px, py, pz));
    }
    const smokeCurve = new THREE.CatmullRomCurve3(curvePoints);
    const smokeGeo = new THREE.TubeGeometry(smokeCurve, 20, 0.04 - s * 0.007, 8, false);
    const smokeMat = registerToonMaterial(
      new THREE.MeshToonMaterial({
        color: PALETTE.gold,
        transparent: true,
        opacity: 0.85
      }),
      'gold'
    );
    smokeGroup.add(new THREE.Mesh(smokeGeo, smokeMat));
  }
  group.add(smokeGroup);

  return group;
}

/**
 * 2. PACK (Point 1 fix: corrected front UV mapping so label is never mirrored)
 */
function buildPackModel() {
  const group = new THREE.Group();

  const w = 1.45, h = 1.9, d = 0.48;
  const geo = new THREE.BoxGeometry(w, h, d, 24, 30, 8);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const halfW = w * 0.5, halfH = h * 0.5, halfD = d * 0.5;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normX = x / halfW;
    const normY = y / halfH;
    const pillow = Math.max(0, 1 - normX * normX) * Math.max(0, 1 - normY * normY);

    if (Math.abs(z) > 0.001) {
      z = Math.sign(z) * (halfD * (0.25 + 0.75 * pillow));
    }

    const crimpDist = 0.15 * h;
    const topDist = halfH - y;
    const btmDist = y - (-halfH);

    if (topDist < crimpDist || btmDist < crimpDist) {
      const crimpFactor = 1 - Math.min(topDist, btmDist) / crimpDist;
      z *= (1 - crimpFactor * 0.85);
      const zigzag = Math.sin(normX * 36.0) * (0.02 * h * crimpFactor);
      y += (y > 0 ? zigzag : -zigzag);
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();

  // Ensure front face UV (face index 4 in BoxGeometry) maps correctly from left to right (Point 1)
  // In Three.js BoxGeometry: groups are +X (0..5), -X, +Y, -Y, +Z (front face), -Z (back face)
  // For front face (+Z), vertices have z > 0
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > halfD * 0.1) {
      const u = (pos.getX(i) + halfW) / w; // 0 (left) to 1 (right)
      const v = (pos.getY(i) + halfH) / h; // 0 (bottom) to 1 (top)
      uv.setXY(i, u, v);
    }
  }
  uv.needsUpdate = true;

  const packTex = createPackLabelTexture();
  const packMat = registerToonMaterial(
    new THREE.MeshToonMaterial({
      map: packTex,
      color: 0xffffff,
      transparent: true
    }),
    'white'
  );
  texturedMaterials.pack.push(packMat);

  const packMesh = new THREE.Mesh(geo, packMat);
  group.add(packMesh);
  registerOutlineMaterial(applyOutline(packMesh, 0.04));

  return group;
}

/**
 * 3. BOWL
 */
function buildBowlModel() {
  const group = new THREE.Group();

  const bowlGeo = new THREE.CylinderGeometry(1.1, 0.55, 0.75, 32, 8, false);
  const bPos = bowlGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const y = bPos.getY(i);
    const ny = (y + 0.375) / 0.75;
    const angle = Math.atan2(bPos.getZ(i), bPos.getX(i));
    const r = Math.hypot(bPos.getX(i), bPos.getZ(i)) + Math.sin(ny * Math.PI) * 0.1;
    bPos.setXYZ(i, Math.cos(angle) * r, y, Math.sin(angle) * r);
  }
  bowlGeo.computeVertexNormals();

  const bowlMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.red, transparent: true }),
    'red'
  );
  const bowlMesh = new THREE.Mesh(bowlGeo, bowlMat);
  group.add(bowlMesh);
  registerOutlineMaterial(applyOutline(bowlMesh, 0.04));

  const rimGeo = new THREE.TorusGeometry(1.12, 0.05, 12, 32);
  rimGeo.rotateX(Math.PI / 2);
  rimGeo.translate(0, 0.375, 0);
  const rimMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.gold, transparent: true }),
    'gold'
  );
  group.add(new THREE.Mesh(rimGeo, rimMat));

  const noodleGroup = new THREE.Group();
  for (let c = 0; c < 5; c++) {
    const points = [];
    const rad = 0.25 + c * 0.14;
    for (let a = 0; a <= 12; a++) {
      const theta = (a / 12) * Math.PI * 2 * 1.5;
      const px = Math.cos(theta) * rad + Math.sin(a * 2.0) * 0.07;
      const pz = Math.sin(theta) * rad + Math.cos(a * 2.0) * 0.07;
      const py = 0.26 + Math.sin(a * 3.0) * 0.05;
      points.push(new THREE.Vector3(px, py, pz));
    }
    const nCurve = new THREE.CatmullRomCurve3(points);
    const nGeo = new THREE.TubeGeometry(nCurve, 32, 0.035, 6, false);
    const nMat = registerToonMaterial(
      new THREE.MeshToonMaterial({ color: PALETTE.amber, transparent: true }),
      'amber'
    );
    noodleGroup.add(new THREE.Mesh(nGeo, nMat));
  }
  group.add(noodleGroup);

  for (let e = 0; e < 2; e++) {
    const eggGroup = new THREE.Group();
    const whiteGeo = new THREE.CylinderGeometry(0.22, 0.18, 0.13, 20);
    const whiteMat = registerToonMaterial(
      new THREE.MeshToonMaterial({ color: 0xfffcf0, transparent: true }),
      'white'
    );
    eggGroup.add(new THREE.Mesh(whiteGeo, whiteMat));

    const yolkGeo = new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    yolkGeo.translate(0, 0.055, 0);
    const yolkMat = registerToonMaterial(
      new THREE.MeshToonMaterial({ color: PALETTE.orange, transparent: true }),
      'orange'
    );
    eggGroup.add(new THREE.Mesh(yolkGeo, yolkMat));

    eggGroup.position.set(-0.3 + e * 0.5, 0.35, 0.22 - e * 0.2);
    eggGroup.rotation.set(0.2, e * 0.6, 0.15);
    group.add(eggGroup);
  }

  for (let s = 0; s < 4; s++) {
    const scallionGeo = new THREE.TorusGeometry(0.07, 0.022, 8, 12);
    const scallionMat = registerToonMaterial(
      new THREE.MeshToonMaterial({ color: 0x22aa33, transparent: true }),
      'custom-scallion'
    );
    const scallionMesh = new THREE.Mesh(scallionGeo, scallionMat);
    scallionMesh.position.set(0.08 + (s % 2) * 0.22, 0.35, -0.18 + (s * 0.14));
    scallionMesh.rotation.set(Math.PI / 2 + 0.1, 0.3 * s, 0);
    group.add(scallionMesh);
  }

  const sticksGroup = new THREE.Group();
  for (let st = 0; st < 2; st++) {
    const stickGeo = new THREE.CylinderGeometry(0.03, 0.055, 2.1, 8);
    stickGeo.translate(0, 1.05, 0);
    const stickMat = registerToonMaterial(
      new THREE.MeshToonMaterial({ color: PALETTE.gold, transparent: true }),
      'gold'
    );
    const stickMesh = new THREE.Mesh(stickGeo, stickMat);
    stickMesh.position.set((st - 0.5) * 0.1, 0, 0);
    stickMesh.rotation.z = -0.52;
    stickMesh.rotation.y = st * 0.06;
    sticksGroup.add(stickMesh);
  }
  const liftCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.25, 0),
    new THREE.Vector3(0.28, 0.7, 0.08),
    new THREE.Vector3(0.6, 1.0, 0.04),
    new THREE.Vector3(0.48, 0.55, -0.04)
  ]);
  const liftGeo = new THREE.TubeGeometry(liftCurve, 20, 0.035, 6, false);
  const liftMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.amber, transparent: true }),
    'amber'
  );
  sticksGroup.add(new THREE.Mesh(liftGeo, liftMat));

  sticksGroup.position.set(0.18, 0.28, 0);
  group.add(sticksGroup);

  return group;
}

/**
 * 4. SACHET (Point 1 fix: front face UV mapping corrected for left-to-right reading)
 */
function buildSachetModel() {
  const group = new THREE.Group();

  const w = 1.0, h = 1.25, d = 0.2;
  const sachetGeo = new THREE.BoxGeometry(w, h, d, 16, 20, 6);
  const pos = sachetGeo.attributes.position;
  const uv = sachetGeo.attributes.uv;
  const halfW = w * 0.5, halfH = h * 0.5;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const env = (1 - (x / halfW) ** 2) * (1 - (y / halfH) ** 2);
    if (Math.abs(z) > 0.001) {
      z = Math.sign(z) * (0.1 * (0.25 + 0.75 * env));
    }

    if (x > 0.25 * halfW && y > 0.4 * halfH) {
      const tear = (x - 0.25 * halfW) * 0.45;
      y -= tear;
      x -= tear * 0.3;
    }
    pos.setXYZ(i, x, y, z);
  }
  sachetGeo.computeVertexNormals();

  // Correct UVs on the front face (+Z)
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > d * 0.1) {
      const u = (pos.getX(i) + halfW) / w;
      const v = (pos.getY(i) + halfH) / h;
      uv.setXY(i, u, v);
    }
  }
  uv.needsUpdate = true;

  const sachetTex = createSachetLabelTexture();
  const sachetMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ map: sachetTex, color: 0xffffff, transparent: true }),
    'white'
  );
  texturedMaterials.sachet.push(sachetMat);

  const sachetMesh = new THREE.Mesh(sachetGeo, sachetMat);
  group.add(sachetMesh);
  registerOutlineMaterial(applyOutline(sachetMesh, 0.04));

  const spiceGroup = new THREE.Group();
  for (let sp = 0; sp < 12; sp++) {
    const dotGeo = new THREE.DodecahedronGeometry(0.032, 0);
    const dotMat = registerToonMaterial(
      new THREE.MeshToonMaterial({
        color: sp % 2 === 0 ? PALETTE.red : PALETTE.orange,
        transparent: true
      }),
      sp % 2 === 0 ? 'red' : 'orange'
    );
    const dotMesh = new THREE.Mesh(dotGeo, dotMat);
    dotMesh.position.set(
      0.4 + Math.random() * 0.5,
      0.6 + Math.random() * 0.6,
      (Math.random() - 0.5) * 0.3
    );
    spiceGroup.add(dotMesh);
  }
  group.add(spiceGroup);

  return group;
}

/**
 * 5. BRICK
 */
function buildBrickModel() {
  const group = new THREE.Group();

  const noodleCurves = [];
  const rows = 4;
  const cols = 5;
  const spacingX = 0.22;
  const spacingY = 0.22;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const baseX = (c - (cols - 1) * 0.5) * spacingX;
      const baseY = (r - (rows - 1) * 0.5) * spacingY;
      const pts = [];
      const waves = 8;
      for (let w = 0; w <= waves; w++) {
        const pz = -0.42 + (w / waves) * 0.84;
        const px = baseX + Math.sin(w * 2.2 + r) * 0.055;
        const py = baseY + Math.cos(w * 2.5 + c) * 0.055;
        pts.push(new THREE.Vector3(px, py, pz));
      }
      noodleCurves.push(new THREE.CatmullRomCurve3(pts));
    }
  }

  for (let cr = 0; cr < 6; cr++) {
    const pts = [];
    const py = -0.28 + cr * 0.11;
    for (let a = 0; a <= 10; a++) {
      const px = -0.5 + (a / 10) * 1.0;
      const pz = Math.sin(a * 2.4 + cr) * 0.38;
      pts.push(new THREE.Vector3(px, py + Math.cos(a * 1.8) * 0.035, pz));
    }
    noodleCurves.push(new THREE.CatmullRomCurve3(pts));
  }

  const noodleMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.gold, transparent: true }),
    'gold'
  );

  noodleCurves.forEach((curve) => {
    const tubeGeo = new THREE.TubeGeometry(curve, 18, 0.035, 6, false);
    group.add(new THREE.Mesh(tubeGeo, noodleMat));
  });

  return group;
}

/**
 * 6. CHOPSTICKS (Point 4 fix: clear pair with V-gap, 1.5x thicker + visible bundle of 8 noodle strands)
 */
function buildChopsticksModel() {
  const group = new THREE.Group();

  // Distinct pair of thick chopsticks with a visible V-spread gap
  const stickThicknessTop = 0.055; // ~1.5x thicker
  const stickThicknessBase = 0.095;
  const stickLength = 2.8;

  // Stick 1
  const geo1 = new THREE.CylinderGeometry(stickThicknessTop, stickThicknessBase, stickLength, 12);
  geo1.translate(0, stickLength * 0.5, 0);
  const mat1 = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.red, transparent: true }),
    'red'
  );
  const stick1 = new THREE.Mesh(geo1, mat1);
  stick1.position.set(-0.12, 0, 0);
  stick1.rotation.z = -0.42;
  stick1.rotation.x = 0.12;
  group.add(stick1);
  registerOutlineMaterial(applyOutline(stick1, 0.035));

  // Stick 2 (angled wider for clear V-gap)
  const geo2 = new THREE.CylinderGeometry(stickThicknessTop, stickThicknessBase, stickLength, 12);
  geo2.translate(0, stickLength * 0.5, 0);
  const mat2 = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.orange, transparent: true }),
    'orange'
  );
  const stick2 = new THREE.Mesh(geo2, mat2);
  stick2.position.set(0.12, 0, 0);
  stick2.rotation.z = -0.56; // V-angle
  stick2.rotation.x = -0.08;
  group.add(stick2);
  registerOutlineMaterial(applyOutline(stick2, 0.035));

  // Bundle of 8 wavy noodle strands hanging down between the chopsticks
  const nMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.gold, transparent: true }),
    'gold'
  );

  const strandConfigs = [
    { startX: -0.06, startZ: 0.02, phase: 0.1, length: 1.8 },
    { startX: 0.02, startZ: -0.04, phase: 0.9, length: 2.1 },
    { startX: 0.08, startZ: 0.05, phase: 1.7, length: 1.9 },
    { startX: -0.12, startZ: -0.02, phase: 2.4, length: 2.3 },
    { startX: 0.14, startZ: 0.0, phase: 3.2, length: 2.0 },
    { startX: -0.02, startZ: 0.08, phase: 4.1, length: 2.2 },
    { startX: 0.05, startZ: -0.08, phase: 4.9, length: 1.7 },
    { startX: -0.09, startZ: 0.04, phase: 5.6, length: 2.4 }
  ];

  strandConfigs.forEach((cfg) => {
    const pts = [];
    const segments = 10;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const py = 1.3 - t * cfg.length;
      const wave = Math.sin(t * 7.0 + cfg.phase) * (0.08 + t * 0.06);
      const px = cfg.startX + wave;
      const pz = cfg.startZ + Math.cos(t * 6.0 + cfg.phase) * 0.06;
      pts.push(new THREE.Vector3(px, py, pz));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.032, 6, false);
    group.add(new THREE.Mesh(tubeGeo, nMat));
  });

  return group;
}

const MODEL_FACTORIES = {
  cup: buildCupModel,
  pack: buildPackModel,
  bowl: buildBowlModel,
  sachet: buildSachetModel,
  brick: buildBrickModel,
  chopsticks: buildChopsticksModel
};

// --- Main Side 3D System ---

export function initSide3D() {
  const container = document.getElementById('side-stage');
  if (!container) return;

  // Show on screens >= 600px; < 600px off
  if (window.innerWidth < 600) {
    // Keep listener to initialize when resized above 600
    const onFirstResize = () => {
      if (window.innerWidth >= 600) {
        window.removeEventListener('resize', onFirstResize);
        initSide3D();
      }
    };
    window.addEventListener('resize', onFirstResize);
    return;
  }

  updatePaletteColors();

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 10);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.15);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(5, 8, 7);
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(PALETTE.gold, 1.2);
  rimLight.position.set(-6, -4, -4);
  scene.add(rimLight);

  const leftSlotGroup = new THREE.Group();
  const rightSlotGroup = new THREE.Group();
  scene.add(leftSlotGroup);
  scene.add(rightSlotGroup);

  const models = {
    left: {},
    right: {}
  };

  Object.keys(MODEL_FACTORIES).forEach((key) => {
    const factory = MODEL_FACTORIES[key];

    const modelL = factory();
    modelL.visible = false;
    leftSlotGroup.add(modelL);
    models.left[key] = modelL;

    const modelR = factory();
    modelR.visible = false;
    // Do NOT scale x by -1 to prevent text mirroring (Point 1 fix); position in right slot normally
    rightSlotGroup.add(modelR);
    models.right[key] = modelR;
  });

  // Accurate gutter placement & sizing (Point 2)
  let slotBaseX = 4.2;
  let slotScale = 1.0;

  function updateSlotTransforms() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;

    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);

    const vHeightHalf = Math.tan((45 * Math.PI) / 360) * 10;
    const vWidthHalf = vHeightHalf * aspect;

    // Gutter calculation in CSS pixels:
    // Container width is 1120px max. Free gutter on each side is (w - min(w, 1120)) / 2.
    const gutterPx = Math.max(0, (w - Math.min(w, 1120)) * 0.5);
    const pxToWorld = (vWidthHalf * 2) / w;

    // Container boundary world X (absolute position of container edge)
    const containerEdgeWorldX = (Math.min(w, 1120) * 0.5) * pxToWorld;

    if (w >= 1280) {
      // Model width in world units ~ 1.6 * scale
      // Gutter clearance: keep model outside containerEdgeWorldX + 24px safety buffer
      const safeBufferWorld = 24 * pxToWorld;
      slotScale = Math.min(1.0, (gutterPx * 0.85) / 160);
      const modelRadius = 0.85 * slotScale;

      slotBaseX = containerEdgeWorldX + safeBufferWorld + modelRadius;
      slotBaseX = Math.max(slotBaseX, vWidthHalf - modelRadius * 0.7);
    } else if (w >= 900) {
      // 900–1279px: medium scale (~0.55), safely outside content
      slotScale = 0.55;
      const safeBufferWorld = 18 * pxToWorld;
      const modelRadius = 0.85 * slotScale;
      slotBaseX = containerEdgeWorldX + safeBufferWorld + modelRadius;
    } else if (w >= 600) {
      // 600–899px: small models (≈140px, scale ~0.4) peeking ~50% from each viewport edge
      slotScale = 0.42;
      // Position model center directly at or slightly outside the viewport edge so ~50% peeks in
      slotBaseX = vWidthHalf - 0.05;
    } else {
      slotScale = 0;
    }

    leftSlotGroup.position.set(-slotBaseX, 0, 0);
    rightSlotGroup.position.set(slotBaseX, 0, 0);
  }
  updateSlotTransforms();

  window.addEventListener('resize', () => {
    if (window.innerWidth < 600) {
      leftSlotGroup.visible = false;
      rightSlotGroup.visible = false;
    } else {
      leftSlotGroup.visible = true;
      rightSlotGroup.visible = true;
      updateSlotTransforms();
    }
  });

  function getSideSections() {
    return Array.from(document.querySelectorAll('section[data-side-left], section[data-side-right]')).map((sec) => ({
      el: sec,
      leftKey: sec.getAttribute('data-side-left'),
      rightKey: sec.getAttribute('data-side-right')
    }));
  }

  let sideSections = getSideSections();

  function setModelOpacity(modelGroup, opacity) {
    modelGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            m.opacity = opacity;
          });
        } else {
          child.material.opacity = opacity;
        }
      }
    });
  }

  // Palette & Theme change listener (Point 3)
  window.addEventListener('themechange', () => {
    updatePaletteColors();
    rimLight.color.copy(PALETTE.gold);

    allToonMaterials.forEach(({ mat, role }) => {
      if (role === 'red') mat.color.copy(PALETTE.red);
      else if (role === 'orange') mat.color.copy(PALETTE.orange);
      else if (role === 'amber') mat.color.copy(PALETTE.amber);
      else if (role === 'gold') mat.color.copy(PALETTE.gold);
    });

    allOutlineMaterials.forEach((mat) => {
      mat.color.copy(PALETTE.outline);
    });

    // Regenerate canvas textures with new palette colors (Point 3)
    refreshTexturedMaterials();
  });

  // --- Scroll Scrubbing & Idle Loop ---
  let isTabActive = !document.hidden;
  document.addEventListener('visibilitychange', () => {
    isTabActive = !document.hidden;
  });

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();

  function update() {
    requestAnimationFrame(update);
    if (!isTabActive || window.innerWidth < 600) return;

    const time = clock.getElapsedTime();
    const vh = window.innerHeight;
    const viewCenter = vh * 0.5;

    const states = {
      left: {},
      right: {}
    };

    Object.keys(MODEL_FACTORIES).forEach((key) => {
      states.left[key] = { opacity: 0, y: 0, rotY: 0 };
      states.right[key] = { opacity: 0, y: 0, rotY: 0 };
    });

    let anyActive = false;

    sideSections.forEach((sec) => {
      const rect = sec.el.getBoundingClientRect();
      const secCenter = rect.top + rect.height * 0.5;
      const p = (secCenter - viewCenter) / vh;

      if (Math.abs(p) < 0.8) {
        anyActive = true;
        const fade = Math.max(0, 1 - Math.abs(p) / 0.75);
        const smoothFade = Math.sin(fade * Math.PI * 0.5);

        const slideY = -p * 1.8;
        const rotY = -p * 0.6;

        if (sec.leftKey && states.left[sec.leftKey]) {
          states.left[sec.leftKey].opacity = Math.max(states.left[sec.leftKey].opacity, smoothFade);
          states.left[sec.leftKey].y = slideY;
          states.left[sec.leftKey].rotY = rotY;
        }

        if (sec.rightKey && states.right[sec.rightKey]) {
          states.right[sec.rightKey].opacity = Math.max(states.right[sec.rightKey].opacity, smoothFade);
          states.right[sec.rightKey].y = slideY;
          states.right[sec.rightKey].rotY = rotY;
        }
      }
    });

    ['left', 'right'].forEach((side) => {
      Object.keys(MODEL_FACTORIES).forEach((key) => {
        const mesh = models[side][key];
        const state = states[side][key];

        if (state.opacity > 0.01) {
          mesh.visible = true;
          setModelOpacity(mesh, state.opacity);

          let idleY = 0;
          let idleRot = 0;
          if (!prefersReducedMotion) {
            idleY = Math.sin(time * 1.5 + (side === 'left' ? 0 : 1.5)) * 0.1;
            idleRot = Math.sin(time * 0.8) * 0.12;
          }

          const scale = slotScale * (0.8 + 0.2 * state.opacity);
          mesh.scale.set(scale, scale, scale);

          mesh.position.y = state.y + idleY;
          // Keep label facing camera: slight tilt inward, no mirrored flip
          const facingSign = side === 'left' ? 1 : -1;
          mesh.rotation.y = state.rotY * facingSign + idleRot;
          mesh.rotation.z = side === 'left' ? 0.06 : -0.06;
        } else {
          mesh.visible = false;
        }
      });
    });

    if (anyActive) {
      renderer.render(scene, camera);
    }
  }

  update();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSide3D);
} else {
  initSide3D();
}
