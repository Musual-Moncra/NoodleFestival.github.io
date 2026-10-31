import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { getCssColor } from './hero3d.js';
import { createRealProductModel, setRendererCapabilities } from './product-models.js';

// --- Palette and Ramp Management ---

const PALETTE = {
  red: new THREE.Color('#E10600'),
  orange: new THREE.Color('#FF5A00'),
  amber: new THREE.Color('#FF8C00'),
  gold: new THREE.Color('#FFC800'),
  outline: new THREE.Color('#1A1412')
};

// 3-step discrete toon ramp
function createToonRampTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(4, 1);
  const data = imgData.data;

  // Step 0: Shadow
  data[0] = 70; data[1] = 70; data[2] = 70; data[3] = 255;
  // Step 1: Midtone
  data[4] = 160; data[5] = 160; data[6] = 160; data[7] = 255;
  // Step 2: Bright mid
  data[8] = 215; data[9] = 215; data[10] = 215; data[11] = 255;
  // Step 3: Highlight
  data[12] = 255; data[13] = 255; data[14] = 255; data[15] = 255;

  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

const TOON_RAMP = createToonRampTexture();

function updatePaletteColors() {
  const cRed = getCssColor('--holo-c', '#E10600');
  const cOrange = getCssColor('--holo-b', '#FF5A00');
  const cGold = getCssColor('--holo-a', '#FFC800');

  PALETTE.red.copy(cRed);
  PALETTE.orange.copy(cOrange);
  PALETTE.amber.lerpColors(cOrange, cGold, 0.45);
  PALETTE.gold.copy(cGold);

  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  if (theme === 'light') {
    PALETTE.outline.set('#2D201A');
  } else {
    PALETTE.outline.set('#0A0807');
  }
}

// Inverted Hull Outline Material generator for procedural models
function createOutlineMaterial() {
  return new THREE.MeshBasicMaterial({
    color: PALETTE.outline,
    side: THREE.BackSide,
    transparent: true,
    opacity: 1.0,
    depthWrite: true
  });
}

function applyOutline(mesh, thickness = 0.04) {
  const outlineMat = createOutlineMaterial();
  const outlineGeo = mesh.geometry.clone();

  const pos = outlineGeo.attributes.position;
  const norm = outlineGeo.attributes.normal;
  if (norm) {
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        pos.getX(i) + norm.getX(i) * thickness,
        pos.getY(i) + norm.getY(i) * thickness,
        pos.getZ(i) + norm.getZ(i) * thickness
      );
    }
    pos.needsUpdate = true;
  }

  const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
  mesh.add(outlineMesh);
  return outlineMat;
}

const allToonMaterials = [];
const allOutlineMaterials = [];
const allRealModels = [];

function registerToonMaterial(mat, role = 'orange') {
  mat.gradientMap = TOON_RAMP;
  allToonMaterials.push({ mat, role });
  return mat;
}

function registerOutlineMaterial(mat) {
  allOutlineMaterials.push(mat);
  return mat;
}

// --- Dynamic Palette Canvas Textures for Procedural Models ---

function createCupLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PALETTE.gold.getStyle();
  ctx.fillRect(0, 0, 512, 256);

  ctx.fillStyle = PALETTE.orange.getStyle();
  ctx.beginPath();
  ctx.ellipse(256, 128, 180, 85, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.red.getStyle();
  ctx.beginPath();
  ctx.ellipse(256, 128, 150, 65, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MÌ GÓI', 256, 112);

  ctx.fillStyle = PALETTE.gold.getStyle();
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('FESTIVAL', 256, 154);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPackLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PALETTE.orange.getStyle();
  ctx.fillRect(0, 0, 512, 384);

  ctx.strokeStyle = PALETTE.red.getStyle();
  ctx.lineWidth = 14;
  for (let x = -384; x < 512 * 2; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 384, 384);
    ctx.stroke();
  }

  ctx.fillStyle = PALETTE.gold.getStyle();
  ctx.beginPath();
  ctx.roundRect(40, 60, 432, 264, 28);
  ctx.fill();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = PALETTE.red.getStyle();
  ctx.font = '900 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HẢO HẢO', 256, 150);

  ctx.fillStyle = '#1A1412';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('TÔM CHUA CAY', 256, 210);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSachetLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = PALETTE.red.getStyle();
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = PALETTE.gold.getStyle();
  ctx.beginPath();
  ctx.moveTo(128, 40);
  ctx.lineTo(216, 128);
  ctx.lineTo(128, 216);
  ctx.lineTo(40, 128);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#1A1412';
  ctx.lineWidth = 4;
  ctx.font = '900 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText('SA TẾ', 128, 128);
  ctx.fillText('SA TẾ', 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const texturedMaterials = {
  cup: [],
  pack: [],
  sachet: []
};

function refreshTexturedMaterials() {
  const newCupTex = createCupLabelTexture();
  texturedMaterials.cup.forEach((mat) => {
    mat.map.dispose();
    mat.map = newCupTex;
    mat.needsUpdate = true;
  });

  const newPackTex = createPackLabelTexture();
  texturedMaterials.pack.forEach((mat) => {
    mat.map.dispose();
    mat.map = newPackTex;
    mat.needsUpdate = true;
  });

  const newSachetTex = createSachetLabelTexture();
  texturedMaterials.sachet.forEach((mat) => {
    mat.map.dispose();
    mat.map = newSachetTex;
    mat.needsUpdate = true;
  });
}

// --- Procedural Fallbacks for Pop-Art Models ---

function buildCupModel() {
  const group = new THREE.Group();

  const bodyPoints = [];
  bodyPoints.push(new THREE.Vector2(0.55, -1.0));
  bodyPoints.push(new THREE.Vector2(0.85, 0.95));
  bodyPoints.push(new THREE.Vector2(0.92, 1.0));
  bodyPoints.push(new THREE.Vector2(0.88, 1.05));
  bodyPoints.push(new THREE.Vector2(0.82, 1.0));

  const bodyGeo = new THREE.LatheGeometry(bodyPoints, 32);
  const cupTex = createCupLabelTexture();
  const bodyMat = registerToonMaterial(
    new THREE.MeshToonMaterial({
      map: cupTex,
      color: 0xffffff,
      transparent: true
    }),
    'gold'
  );
  texturedMaterials.cup.push(bodyMat);

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);
  registerOutlineMaterial(applyOutline(bodyMesh, 0.045));

  const lidGeo = new THREE.CylinderGeometry(0.94, 0.90, 0.12, 32);
  const lidMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.orange, transparent: true }),
    'orange'
  );
  const lidMesh = new THREE.Mesh(lidGeo, lidMat);
  lidMesh.position.y = 1.04;
  group.add(lidMesh);
  registerOutlineMaterial(applyOutline(lidMesh, 0.04));

  const tabShape = new THREE.Shape();
  tabShape.moveTo(-0.15, 0);
  tabShape.lineTo(0.15, 0);
  tabShape.lineTo(0.12, 0.28);
  tabShape.lineTo(-0.12, 0.28);
  tabShape.closePath();

  const tabGeo = new THREE.ShapeGeometry(tabShape);
  const tabMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.red, transparent: true, side: THREE.DoubleSide }),
    'red'
  );
  const tabMesh = new THREE.Mesh(tabGeo, tabMat);
  tabMesh.rotation.x = -Math.PI / 2 + 0.25;
  tabMesh.position.set(0, 1.11, 0.88);
  group.add(tabMesh);

  return group;
}

function buildPackModel() {
  const group = new THREE.Group();

  const w = 1.9;
  const h = 1.45;
  const d = 0.52;
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  const halfD = d * 0.5;

  const geo = new THREE.BoxGeometry(w, h, d, 16, 16, 8);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normX = x / halfW;
    const normY = y / halfH;
    const pillow = Math.max(0, 1 - normX * normX) * Math.max(0, 1 - normY * normY);

    if (Math.abs(z) > 0.001) {
      z = Math.sign(z) * (halfD * (0.28 + 0.72 * pillow));
    }

    const crimpDist = 0.16 * h;
    const topDist = halfH - y;
    const btmDist = y - (-halfH);

    if (topDist < crimpDist || btmDist < crimpDist) {
      const crimpFactor = 1 - Math.min(topDist, btmDist) / crimpDist;
      z *= (1 - crimpFactor * 0.82);
      const zigzag = Math.sin(normX * 32.0) * (0.016 * h * crimpFactor);
      y += (y > 0 ? zigzag : -zigzag);
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();

  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > d * 0.1) {
      const u = (pos.getX(i) + halfW) / w;
      const v = (pos.getY(i) + halfH) / h;
      uv.setXY(i, u, v);
    }
  }
  uv.needsUpdate = true;

  const packLabelTex = createPackLabelTexture();
  const packMat = registerToonMaterial(
    new THREE.MeshToonMaterial({
      map: packLabelTex,
      color: 0xffffff,
      transparent: true
    }),
    'orange'
  );
  texturedMaterials.pack.push(packMat);

  const packMesh = new THREE.Mesh(geo, packMat);
  group.add(packMesh);
  registerOutlineMaterial(applyOutline(packMesh, 0.045));

  return group;
}

function buildBowlModel() {
  const group = new THREE.Group();

  const bowlPoints = [];
  bowlPoints.push(new THREE.Vector2(0.52, -0.65));
  bowlPoints.push(new THREE.Vector2(0.75, -0.4));
  bowlPoints.push(new THREE.Vector2(1.22, 0.25));
  bowlPoints.push(new THREE.Vector2(1.36, 0.65));
  bowlPoints.push(new THREE.Vector2(1.42, 0.72));
  bowlPoints.push(new THREE.Vector2(1.38, 0.76));
  bowlPoints.push(new THREE.Vector2(1.30, 0.72));

  const bowlGeo = new THREE.LatheGeometry(bowlPoints, 32);
  const bowlMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.red, transparent: true }),
    'red'
  );
  const bowlMesh = new THREE.Mesh(bowlGeo, bowlMat);
  group.add(bowlMesh);
  registerOutlineMaterial(applyOutline(bowlMesh, 0.045));

  const footGeo = new THREE.CylinderGeometry(0.56, 0.52, 0.14, 32);
  const footMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.gold, transparent: true }),
    'gold'
  );
  const footMesh = new THREE.Mesh(footGeo, footMat);
  footMesh.position.y = -0.72;
  group.add(footMesh);
  registerOutlineMaterial(applyOutline(footMesh, 0.035));

  const brothGeo = new THREE.CircleGeometry(1.28, 32);
  const brothMat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.orange, transparent: true }),
    'orange'
  );
  const brothMesh = new THREE.Mesh(brothGeo, brothMat);
  brothMesh.rotation.x = -Math.PI / 2;
  brothMesh.position.y = 0.58;
  group.add(brothMesh);

  return group;
}

function buildSachetModel() {
  const group = new THREE.Group();

  const sSize = 1.35;
  const sThick = 0.16;
  const sGeo = new THREE.BoxGeometry(sSize, sSize * 1.15, sThick, 14, 14, 4);

  const pos = sGeo.attributes.position;
  const uv = sGeo.attributes.uv;
  const halfS = sSize * 0.5;
  const halfH = sSize * 1.15 * 0.5;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);

    const nx = x / halfS;
    const ny = y / halfH;
    const puff = Math.max(0, 1 - nx * nx) * Math.max(0, 1 - ny * ny);
    if (Math.abs(z) > 0.001) {
      z = Math.sign(z) * (sThick * 0.5 * (0.3 + 0.7 * puff));
    }
    pos.setXYZ(i, x, y, z);

    if (z > sThick * 0.1) {
      uv.setXY(i, (x + halfS) / sSize, (y + halfH) / (sSize * 1.15));
    }
  }
  sGeo.computeVertexNormals();
  uv.needsUpdate = true;

  const sTex = createSachetLabelTexture();
  const sMat = registerToonMaterial(
    new THREE.MeshToonMaterial({
      map: sTex,
      color: 0xffffff,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide
    }),
    'red'
  );
  texturedMaterials.sachet.push(sMat);

  const sMesh = new THREE.Mesh(sGeo, sMat);
  group.add(sMesh);
  registerOutlineMaterial(applyOutline(sMesh, 0.04));

  return group;
}

function buildChopsticksModel() {
  const group = new THREE.Group();

  const stickLength = 2.4;
  const geo1 = new THREE.CylinderGeometry(0.04, 0.08, stickLength, 12);
  geo1.translate(0, stickLength * 0.5, 0);
  const mat1 = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.red, transparent: true }),
    'red'
  );
  const stick1 = new THREE.Mesh(geo1, mat1);
  stick1.position.set(-0.1, -stickLength * 0.35, 0);
  stick1.rotation.z = -0.38;
  group.add(stick1);
  registerOutlineMaterial(applyOutline(stick1, 0.035));

  const geo2 = new THREE.CylinderGeometry(0.04, 0.08, stickLength, 12);
  geo2.translate(0, stickLength * 0.5, 0);
  const mat2 = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.orange, transparent: true }),
    'orange'
  );
  const stick2 = new THREE.Mesh(geo2, mat2);
  stick2.position.set(0.1, -stickLength * 0.35, 0);
  stick2.rotation.z = -0.52;
  group.add(stick2);
  registerOutlineMaterial(applyOutline(stick2, 0.035));

  return group;
}

function buildBrickModel() {
  const group = new THREE.Group();

  const w = 1.6;
  const h = 1.35;
  const d = 0.55;
  const geo = new THREE.BoxGeometry(w, h, d, 12, 12, 6);
  const mat = registerToonMaterial(
    new THREE.MeshToonMaterial({ color: PALETTE.gold, transparent: true }),
    'gold'
  );
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);
  registerOutlineMaterial(applyOutline(mesh, 0.04));

  return group;
}

const PROCEDURAL_FACTORIES = {
  cup: buildCupModel,
  pack: buildPackModel,
  bowl: buildBowlModel,
  sachet: buildSachetModel,
  chopsticks: buildChopsticksModel,
  brick: buildBrickModel
};

function ensureModelHelpers(model, defaultRawH = 1.8) {
  if (!model) return model;

  if (!model.userData.rawHeight || !model.userData.rawWidth) {
    const box = new THREE.Box3().setFromObject(model);
    const rawH = Math.max(0.1, box.max.y - box.min.y) || defaultRawH;
    const rawW = Math.max(0.1, box.max.x - box.min.x) || (rawH * 0.8);
    model.userData.rawHeight = model.userData.rawHeight || rawH;
    model.userData.rawWidth = model.userData.rawWidth || rawW;
  }

  if (!model.userData.setTargetHeight) {
    model.userData.setTargetHeight = (targetH) => {
      const s = targetH / (model.userData.rawHeight || defaultRawH);
      model.scale.set(s, s, s);
      return s;
    };
  }

  if (!model.userData.setOpacity) {
    model.userData.setOpacity = (alpha) => {
      const isTrans = alpha < 0.999;
      model.traverse((child) => {
        if (child.isMesh && child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            if (m.transparent !== isTrans) {
              m.transparent = isTrans;
              m.needsUpdate = true;
            }
            m.opacity = alpha;
          });
        }
      });
    };
  }

  return model;
}

// Hero products to avoid in section slots where possible
const HERO_PRODUCT_IDS = new Set([
  'cung-dinh-bo-ham',
  'hao-hao-tom-chua-cay',
  'indomie-mi-goreng',
  '3mien-gold-tom-chua-cay',
  'siukay-hai-san'
]);

// Section-specific product assignment for realistic models
// Ensures no product id repeats across slots and hero products are avoided where possible
const SECTION_SLOT_PRODUCTS = {
  about: {
    mainId: 'omachi-bo-ham',
    compDef: 'gau-do-lau-thai-tom'
  },
  flavors: {
    mainId: 'hao-hao-tom-chua-cay',
    compDef: 'sachet'
  },
  activities: {
    mainId: 'siukay-hai-san',
    compDef: 'indomie-mi-goreng'
  },
  schedule: {
    mainId: 'shin-super-spicy',
    compDef: 'mi-lau-thai-tom'
  },
  tickets: {
    mainId: 'buldak-cheese',
    compDef: 'kokomi-tom'
  },
  faq: {
    mainId: 'cupnoodle-seafood',
    compDef: 'koreno-bulgogi'
  }
};

function getProductDataById(id) {
  if (window.MGF_PRODUCTS && Array.isArray(window.MGF_PRODUCTS)) {
    return window.MGF_PRODUCTS.find((p) => p.id === id) || null;
  }
  return null;
}

function getProductDataByType(type, excludeId = null) {
  if (window.MGF_PRODUCTS && Array.isArray(window.MGF_PRODUCTS)) {
    const list = window.MGF_PRODUCTS.filter((p) => p.type === type && p.id !== excludeId);
    if (list.length > 0) return list[0];
  }
  return null;
}

// --- Main Side 3D Component ---

let isSide3DInitialized = false;

export function initSide3D() {
  const container = document.getElementById('side-stage');
  if (!container) return;
  if (container.querySelector('canvas') || isSide3DInitialized) return;

  isSide3DInitialized = true;
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  setRendererCapabilities(renderer);

  // PMREM Environment for packaging reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
  scene.environment = envTexture;

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(5, 8, 7);
  scene.add(dirLight);

  const rimLight = new THREE.DirectionalLight(PALETTE.gold, 1.2);
  rimLight.position.set(-6, -4, -4);
  scene.add(rimLight);

  // Builder for slot models with strict real-product enforcement:
  // Rule: cup, pack and bowl must ALWAYS be real products.
  // If unique ones run out, reuse a real product (preferring non-hero) rather than a procedural model.
  // Procedural is only for sachet.
  function createSlotModel(typeKey, preferredId, usedIds = new Set()) {
    if (!typeKey) return null;

    const allProducts = (window.MGF_PRODUCTS && Array.isArray(window.MGF_PRODUCTS))
      ? window.MGF_PRODUCTS
      : [];

    // Procedural is strictly for sachet
    if (typeKey === 'sachet' || preferredId === 'sachet') {
      if (PROCEDURAL_FACTORIES['sachet']) {
        return ensureModelHelpers(PROCEDURAL_FACTORIES['sachet']());
      }
    }

    // 1. If preferredId is a valid product ID that hasn't been used yet
    if (preferredId && preferredId !== 'cup' && preferredId !== 'pack' && preferredId !== 'bowl') {
      const preferredProd = allProducts.find((p) => p.id === preferredId);
      if (preferredProd && !usedIds.has(preferredProd.id)) {
        usedIds.add(preferredProd.id);
        const model = createRealProductModel(preferredProd, {
          withHoloRim: true,
          withContactGlow: true,
          rimColor: PALETTE.gold
        });
        allRealModels.push(model);
        return ensureModelHelpers(model);
      }
    }

    // 2. Otherwise find an unused product matching typeKey
    // Prioritize products that are NOT in HERO_PRODUCT_IDS
    let candidate = allProducts.find(
      (p) => p.type === typeKey && !usedIds.has(p.id) && !HERO_PRODUCT_IDS.has(p.id)
    );

    // If none found, allow any unused product of that type
    if (!candidate) {
      candidate = allProducts.find((p) => p.type === typeKey && !usedIds.has(p.id));
    }

    // 3. If unique ones run out: reuse a real product (prefer one not visible in hero) rather than procedural!
    if (!candidate) {
      candidate = allProducts.find((p) => p.type === typeKey && !HERO_PRODUCT_IDS.has(p.id));
    }
    if (!candidate) {
      candidate = allProducts.find((p) => p.type === typeKey);
    }

    if (candidate) {
      usedIds.add(candidate.id);
      const model = createRealProductModel(candidate, {
        withHoloRim: true,
        withContactGlow: true,
        rimColor: PALETTE.gold
      });
      allRealModels.push(model);
      return ensureModelHelpers(model);
    }

    // Non-noodle fallbacks
    if (PROCEDURAL_FACTORIES[typeKey]) {
      const model = PROCEDURAL_FACTORIES[typeKey]();
      return ensureModelHelpers(model);
    }

    return null;
  }

  // Find all .product-slot elements declared in HTML
  const slotElements = Array.from(document.querySelectorAll('.product-slot[data-products]'));
  const sectionSlots = [];

  function buildSlots() {
    sectionSlots.forEach((slot) => {
      scene.remove(slot.group);
    });
    sectionSlots.length = 0;
    allRealModels.length = 0;

    const usedIds = new Set();

    slotElements.forEach((slotEl, idx) => {
      const productsAttr = slotEl.getAttribute('data-products') || '';
      const tokens = productsAttr.trim().split(/\s+/);
      const typeA = tokens[0] || 'cup';
      const typeB = tokens[1] || 'pack';

      const sectionEl = slotEl.closest('section');
      const secId = sectionEl ? sectionEl.id : `sec-${idx}`;
      const isLeft = slotEl.classList.contains('product-left') || Boolean(slotEl.closest('.product-left'));

      const mapping = SECTION_SLOT_PRODUCTS[secId];
      const preferredIdA = mapping ? mapping.mainId : null;
      const preferredIdB = mapping ? mapping.compDef : null;

      const modelA = createSlotModel(typeA, preferredIdA, usedIds);
      const modelB = createSlotModel(typeB, preferredIdB, usedIds);

      const group = new THREE.Group();
      group.visible = false;
      scene.add(group);

      if (modelA) group.add(modelA);
      if (modelB) group.add(modelB);

      sectionSlots.push({
        slotEl,
        secId,
        isLeft,
        typeA,
        typeB,
        modelA,
        modelB,
        group,
        idx
      });
    });
  }

  buildSlots();

  if (!window.MGF_PRODUCTS || window.MGF_PRODUCTS.length === 0) {
    const checkTimer = setInterval(() => {
      if (window.MGF_PRODUCTS && window.MGF_PRODUCTS.length > 0) {
        clearInterval(checkTimer);
        buildSlots();
      }
    }, 150);
  }

  // Universal helper to set model opacity across all materials
  function setModelOpacity(model, opacity) {
    if (!model) return;
    if (model.userData && model.userData.setOpacity) {
      model.userData.setOpacity(opacity);
      return;
    }
    const isTrans = opacity < 0.999;
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (m.transparent !== isTrans) {
            m.transparent = isTrans;
            m.needsUpdate = true;
          }
          m.opacity = opacity;
        });
      }
    });
  }

  // Box3 contain projection: returns bounding box dimensions projected to screen
  const tempCorner = new THREE.Vector3();
  function getProjectedGroupSpan(grp, cam, screenW, screenH) {
    grp.updateMatrixWorld(true);
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    grp.traverse((child) => {
      if (child.isMesh && !child.userData.isContactGlow && child.geometry) {
        if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
        const b = child.geometry.boundingBox;
        for (let ix = 0; ix < 2; ix++) {
          for (let iy = 0; iy < 2; iy++) {
            for (let iz = 0; iz < 2; iz++) {
              tempCorner.set(
                ix === 0 ? b.min.x : b.max.x,
                iy === 0 ? b.min.y : b.max.y,
                iz === 0 ? b.min.z : b.max.z
              );
              tempCorner.applyMatrix4(child.matrixWorld);
              tempCorner.project(cam);
              const sx = (tempCorner.x * 0.5 + 0.5) * screenW;
              const sy = (-(tempCorner.y * 0.5) + 0.5) * screenH;
              if (sx < minX) minX = sx;
              if (sx > maxX) maxX = sx;
              if (sy < minY) minY = sy;
              if (sy > maxY) maxY = sy;
            }
          }
        }
      }
    });

    if (minX === Infinity) return { width: 0, height: 0 };
    return { width: maxX - minX, height: maxY - minY };
  }

  // --- Resize Handler ---
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // --- Theme Change Listener ---
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

    allRealModels.forEach((model) => {
      if (model.userData && model.userData.updateRimColor) {
        model.userData.updateRimColor(PALETTE.gold);
      }
    });

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
    if (!isTabActive) return;

    const time = clock.getElapsedTime();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const viewCenter = h * 0.5;

    const fovRad = (camera.fov * Math.PI) / 360;
    const vHeightWorld = 2 * Math.tan(fovRad) * camera.position.z;
    const vWidthWorld = vHeightWorld * (w / h);

    const pitchAngle = 8 * Math.PI / 180;
    const swayAngleMax = 18 * Math.PI / 180;
    const bobMax = 0.06;
    const omega = 1.35;

    let anyActive = false;

    sectionSlots.forEach((slot) => {
      const { slotEl, isLeft, modelA, modelB, group, idx } = slot;
      const rect = slotEl.getBoundingClientRect();

      // Check if slot is near or inside viewport
      const centerY = rect.top + rect.height * 0.5;
      const p = (centerY - viewCenter) / h;

      if (Math.abs(p) < 0.85 && rect.width > 0 && rect.height > 0) {
        anyActive = true;
        group.visible = true;

        const fade = Math.max(0, 1 - Math.abs(p) / 0.72);
        const smoothFade = Math.sin(fade * Math.PI * 0.5);

        if (modelA) setModelOpacity(modelA, smoothFade);
        if (modelB) setModelOpacity(modelB, smoothFade);

        // Convert slot center to world coordinates
        const slotCenterX = rect.left + rect.width * 0.5;
        const slotCenterY = rect.top + rect.height * 0.5;

        const worldX = ((slotCenterX / w) - 0.5) * vWidthWorld;
        const worldY = -((slotCenterY / h) - 0.5) * vHeightWorld;

        const idleBob = prefersReducedMotion ? 0 : Math.sin(time * omega + idx * 0.9) * bobMax;
        const idleSway = prefersReducedMotion ? 0 : Math.sin(time * omega + idx * 0.9) * swayAngleMax;

        group.position.set(worldX, worldY + idleBob, 0);

        // Convert slot box dimensions to world units
        const slotWidthWorld = (rect.width / w) * vWidthWorld;
        const slotHeightWorld = (rect.height / h) * vHeightWorld;

        // typeA is main at ~85% of slot height and centered
        const targetHeightA = slotHeightWorld * 0.85;
        // typeB is a companion at ~55% of slot height
        const targetHeightB = slotHeightWorld * 0.55;

        if (modelA && modelA.userData.setTargetHeight) {
          modelA.userData.setTargetHeight(targetHeightA);
        }
        if (modelB && modelB.userData.setTargetHeight) {
          modelB.userData.setTargetHeight(targetHeightB);
        }

        // Poses: mirrored yaw (left +20°, right -20°), slight forward tilt ~8°
        const baseYawA = isLeft ? (20 * Math.PI / 180) : (-20 * Math.PI / 180);
        const baseYawB = isLeft ? (16 * Math.PI / 180) : (-16 * Math.PI / 180);

        // Calculate model widths in local space
        const sA = (modelA && modelA.userData.rawHeight) ? (targetHeightA / modelA.userData.rawHeight) : 1.0;
        const currWA = (modelA && modelA.userData.rawWidth) ? (modelA.userData.rawWidth * sA) : (targetHeightA * 0.7);
        const halfWA = currWA * 0.5;

        const sB = (modelB && modelB.userData.rawHeight) ? (targetHeightB / modelB.userData.rawHeight) : 1.0;
        const currWB = (modelB && modelB.userData.rawWidth) ? (modelB.userData.rawWidth * sB) : (targetHeightB * 0.7);
        const halfWB = currWB * 0.5;

        // Beside main with <=30% overlap (aiming for 20% overlap so companion reads clearly)
        const overlap = 0.20 * currWB;
        const separation = halfWA + halfWB - overlap;

        const outerSign = isLeft ? -1 : 1;
        const rawOffsetX = outerSign * separation;
        const offsetY = -0.08 * targetHeightA; // slightly lower
        const offsetZ = -0.30; // slightly behind

        // Center the combined pair horizontally inside group
        const pairMinX = Math.min(-halfWA, rawOffsetX - halfWB);
        const pairMaxX = Math.max(halfWA, rawOffsetX + halfWB);
        const pairCenterX = (pairMinX + pairMaxX) * 0.5;

        if (modelA) {
          modelA.position.set(-pairCenterX, 0, 0);
          modelA.rotation.set(pitchAngle, baseYawA + idleSway, 0);
        }

        if (modelB) {
          modelB.position.set(rawOffsetX - pairCenterX, offsetY, offsetZ);
          modelB.rotation.set(pitchAngle, baseYawB + idleSway * 0.85, 0);
        }

        // Fit with contain so nothing exceeds the slot
        const pairW = pairMaxX - pairMinX;
        const pairH = Math.max(targetHeightA, targetHeightB - offsetY);
        const projW = (pairW / vWidthWorld) * w;
        const projH = (pairH / vHeightWorld) * h;
        const maxAllowedW = Math.max(10, rect.width - 24);
        const maxAllowedH = Math.max(10, rect.height - 24);
        const containScale = Math.min(1.0, maxAllowedW / projW, maxAllowedH / projH);
        group.scale.set(containScale, containScale, containScale);
      } else {
        group.visible = false;
      }
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
