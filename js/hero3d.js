import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createRealProductModel, setRendererCapabilities } from './product-models.js';

// --- Color & Theme Utilities ---
let probeEl = null;
let colorCanvas = null;
let colorCtx = null;

export function getCssColor(varName, fallbackHex) {
  if (!probeEl && typeof document !== 'undefined' && document.body) {
    probeEl = document.createElement('div');
    probeEl.style.display = 'none';
    document.body.appendChild(probeEl);
  }
  if (probeEl) {
    probeEl.style.color = `var(${varName})`;
    const computed = getComputedStyle(probeEl).color;

    if (computed) {
      if (computed.startsWith('color(srgb')) {
        const match = computed.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
        if (match) {
          return new THREE.Color(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
        }
      }
      try {
        const c = new THREE.Color(computed);
        if (!(c.r === 1 && c.g === 1 && c.b === 1 && !computed.includes('255, 255, 255'))) {
          return c;
        }
      } catch {}

      if (!colorCanvas) {
        colorCanvas = document.createElement('canvas');
        colorCanvas.width = 1;
        colorCanvas.height = 1;
        colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
      }
      if (colorCtx) {
        colorCtx.clearRect(0, 0, 1, 1);
        colorCtx.fillStyle = computed;
        colorCtx.fillRect(0, 0, 1, 1);
        const d = colorCtx.getImageData(0, 0, 1, 1).data;
        return new THREE.Color(d[0] / 255, d[1] / 255, d[2] / 255);
      }
    }
  }

  return new THREE.Color(fallbackHex);
}

// Doc palette constants: noodle yellow #F5D547, spice red #E94B35, cream #F8F0DF, pop blue #354CBA
const DOC_PALETTE = {
  yellow: new THREE.Color('#F5D547'),
  red: new THREE.Color('#E94B35'),
  cream: new THREE.Color('#F8F0DF'),
  blue: new THREE.Color('#354CBA')
};

function updateThemeColors(state) {
  const colA = getCssColor('--holo-a', '#F5D547');
  const colB = getCssColor('--holo-b', '#E94B35');
  const colC = getCssColor('--holo-c', '#354CBA');

  // Blend CSS palette variables gently with the authentic doc palette so it stays warm & cohesive
  state.rimColor.copy(colA).lerp(DOC_PALETTE.yellow, 0.35);
  state.warmAccent.copy(colB).lerp(DOC_PALETTE.red, 0.35);
  state.subAccent.copy(colC);

  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  state.isLight = theme === 'light';
  return state.isLight;
}

/**
 * Soft grounded contact shadow + subtle warm studio floor reflection
 */
function createStudioContactShadow() {
  const group = new THREE.Group();

  // 1. Dark soft ambient occlusion shadow directly beneath the cup base
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sCtx = shadowCanvas.getContext('2d');
  const sGrad = sCtx.createRadialGradient(128, 128, 8, 128, 128, 120);
  sGrad.addColorStop(0.0, 'rgba(12, 5, 2, 0.72)');
  sGrad.addColorStop(0.38, 'rgba(18, 7, 3, 0.42)');
  sGrad.addColorStop(0.72, 'rgba(24, 9, 4, 0.12)');
  sGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 256, 256);

  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadowTex.colorSpace = THREE.SRGBColorSpace;

  const shadowGeo = new THREE.PlaneGeometry(2.1, 2.1);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.userData.isContactGlow = true;
  group.add(shadowMesh);

  // 2. Subtle warm studio floor rim/plinth ring (non-neon, tasteful doc palette accent)
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 256;
  glowCanvas.height = 256;
  const gCtx = glowCanvas.getContext('2d');
  const gGrad = gCtx.createRadialGradient(128, 128, 24, 128, 128, 124);
  gGrad.addColorStop(0.0, 'rgba(245, 213, 71, 0.22)');
  gGrad.addColorStop(0.55, 'rgba(233, 75, 53, 0.10)');
  gGrad.addColorStop(1.0, 'rgba(233, 75, 53, 0)');
  gCtx.fillStyle = gGrad;
  gCtx.fillRect(0, 0, 256, 256);

  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;

  const glowGeo = new THREE.PlaneGeometry(2.8, 2.8);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    color: 0xffffff,
    transparent: true,
    opacity: 0.45,
    depthWrite: false
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.rotation.x = -Math.PI / 2;
  glowMesh.position.y = -0.01;
  glowMesh.userData.isContactGlow = true;
  group.add(glowMesh);

  group.userData.isContactGlow = true;
  group.userData.shadowMat = shadowMat;
  group.userData.glowMat = glowMat;
  return group;
}

/**
 * Fallback subtle rising steam wisps above the hero cup (used if product-models doesn't attach its own steam)
 */
function createHeroSteamWisps() {
  const group = new THREE.Group();
  group.userData.isSteam = true;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  grad.addColorStop(0.0, 'rgba(248, 240, 223, 0.32)');
  grad.addColorStop(0.45, 'rgba(248, 240, 223, 0.14)');
  grad.addColorStop(1.0, 'rgba(248, 240, 223, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  const wisps = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const wispGeo = new THREE.PlaneGeometry(0.42, 0.52);
    const mesh = new THREE.Mesh(wispGeo, mat);
    mesh.userData.isSteam = true;
    const phase = (i / count) * Math.PI * 2;
    const radius = 0.06 + (i % 3) * 0.07;
    const speed = 0.28 + (i % 4) * 0.05;
    wisps.push({ mesh, mat, phase, radius, speed, angle: i * 1.1 });
    group.add(mesh);
  }

  group.userData.updateSteam = (t, baseH, isLight) => {
    const maxAlpha = isLight ? 0.22 : 0.34;
    for (let i = 0; i < wisps.length; i++) {
      const w = wisps[i];
      const progress = ((t * w.speed + w.phase / (Math.PI * 2)) % 1 + 1) % 1;
      const y = baseH * 0.46 + progress * (baseH * 0.42);
      const sway = Math.sin(t * 1.2 + w.phase) * 0.08 * (0.4 + progress);
      w.mesh.position.set(
        Math.cos(w.angle) * w.radius * (1 + progress * 0.5) + sway,
        y,
        Math.sin(w.angle) * w.radius * 0.6
      );
      const s = (0.65 + progress * 0.85) * (baseH / 1.8);
      w.mesh.scale.set(s, s * 1.15, 1);
      const fade = Math.sin(progress * Math.PI);
      w.mat.opacity = fade * maxAlpha;
    }
  };

  return group;
}

// --- Main Hero 3D Component ---

let isHero3DInitialized = false;

export function initHero3D() {
  const container = document.getElementById('hero-canvas');
  if (!container || isHero3DInitialized) return;
  if (container.querySelector('canvas')) return;
  isHero3DInitialized = true;
  container.style.pointerEvents = 'none';

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.48, 7.6);
  camera.lookAt(0, -0.05, 0);

  const isMobileViewport = () => window.innerWidth <= 860;
  const getTargetDpr = () => Math.min(window.devicePixelRatio || 1, isMobileViewport() ? 1.5 : 2.0);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(getTargetDpr());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);
  setRendererCapabilities(renderer);

  window.__HERO_RENDERER = renderer;
  window.__HERO_SCENE = scene;
  window.__HERO_CAMERA = camera;

  // Authentic Studio PMREM Environment
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
  scene.environment = envTexture;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // Realistic Studio Lighting (warm key light, soft cream fill, golden noodle rim, subtle pop-blue back kicker)
  const hemiLight = new THREE.HemisphereLight(0xf8f0df, 0x261710, 0.65);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff6e5, 1.45);
  keyLight.position.set(4.2, 6.5, 5.8);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xf8f0df, 0.65);
  fillLight.position.set(-5.0, 2.5, 4.2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xf5d547, 0.95);
  rimLight.position.set(0.5, 4.5, -5.5);
  scene.add(rimLight);

  const kickerLight = new THREE.DirectionalLight(0xe94b35, 0.45);
  kickerLight.position.set(-3.8, -2.5, -3.5);
  scene.add(kickerLight);

  const themeState = {
    rimColor: new THREE.Color('#F5D547'),
    warmAccent: new THREE.Color('#E94B35'),
    subAccent: new THREE.Color('#354CBA'),
    isLight: false
  };
  updateThemeColors(themeState);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // Foreground Hero Cup container (1 large cup in the center, front & prominent)
  const centerContainer = new THREE.Group();
  worldGroup.add(centerContainer);

  // Grounded contact shadow under the hero cup
  const contactShadowGroup = createStudioContactShadow();
  worldGroup.add(contactShadowGroup);

  // Fallback subtle steam above the hero cup
  const fallbackSteam = createHeroSteamWisps();
  centerContainer.add(fallbackSteam);

  // Optional subtle background companion models (smaller, further back, lower opacity so hero cup dominates)
  const bgCompanionsGroup = new THREE.Group();
  worldGroup.add(bgCompanionsGroup);

  window.__hero_debug = { worldGroup, centerContainer, bgCompanionsGroup, scene, camera };

  const stageEl = document.querySelector('.hero-stage');

  let currentCenterH = 2.2;
  let productsList = (window.MGF_PRODUCTS && Array.isArray(window.MGF_PRODUCTS)) ? window.MGF_PRODUCTS : [];
  let cupProducts = [];
  let centerProductIndex = 0;
  let currentCenterModel = null;
  const centerModelCache = new Map();
  const companionItems = [];

  // Forward tilt (~20°) so the top rim, 55% flat printed foil lid, 45% peeled flap, curly noodles & toppings are clearly visible
  const BASE_PITCH = 20 * (Math.PI / 180);
  const COMPANION_PITCH = 16 * (Math.PI / 180);

  let lastCanvasW = 0;
  let lastCanvasH = 0;
  let lastStageLeft = 0;
  let lastStageTop = 0;
  let lastStageW = 0;
  let lastStageH = 0;

  // Background companion slots: tucked softly behind the hero cup at negative Z and lower opacity
  const COMPANION_SLOTS = [
    { id: 'bg-left', type: 'cup', relX: -0.78, relY: -0.08, z: -1.5, scale: 0.32, rotY: 0.38, rotZ: 0.08, opacity: 0.44, phase: 0.8 },
    { id: 'bg-right', type: 'pack', relX: 0.78, relY: -0.10, z: -1.5, scale: 0.30, rotY: -0.38, rotZ: -0.08, opacity: 0.44, phase: 2.9 }
  ];

  function buildHeroCupModel(prod) {
    if (!prod) return null;
    if (centerModelCache.has(prod.id)) {
      const cached = centerModelCache.get(prod.id);
      if (cached.userData && cached.userData.setTargetHeight) {
        cached.userData.setTargetHeight(currentCenterH);
      }
      return cached;
    }

    const model = createRealProductModel(prod, {
      withHoloRim: false,
      withContactGlow: false,
      rimColor: themeState.rimColor,
      steam: true,
      open: true,
      openLid: true,
      peelLid: true,
      withNoodles: true,
      withToppings: true,
      hero: true,
      detail: 'high'
    });

    if (model.userData && model.userData.setTargetHeight) {
      model.userData.setTargetHeight(currentCenterH);
    }

    centerModelCache.set(prod.id, model);
    return model;
  }

  function hasBuiltInSteam(model) {
    if (!model) return false;
    if (
      model.userData &&
      (model.userData.steam ||
        model.userData.steamGroup ||
        model.userData.updateSteam ||
        model.userData.tick ||
        (Array.isArray(model.userData.steamMats) && model.userData.steamMats.length > 0))
    ) {
      return true;
    }
    let found = false;
    model.traverse((child) => {
      if (
        child !== fallbackSteam &&
        child.userData &&
        (child.userData.isSteam || child.userData.phase !== undefined || child.name === 'steam')
      ) {
        found = true;
      }
    });
    return found;
  }

  function setCenterCup(index) {
    if (cupProducts.length === 0) return;
    centerProductIndex = (index + cupProducts.length) % cupProducts.length;
    const prod = cupProducts[centerProductIndex];
    const nextModel = buildHeroCupModel(prod);
    if (!nextModel) return;

    if (currentCenterModel && currentCenterModel !== nextModel) {
      centerContainer.remove(currentCenterModel);
    }
    currentCenterModel = nextModel;
    centerContainer.add(currentCenterModel);

    // Show fallback steam only if product-models.js didn't already include its own steam
    fallbackSteam.visible = !hasBuiltInSteam(currentCenterModel);
  }

  function populateCompanions() {
    while (companionItems.length > 0) {
      const item = companionItems.pop();
      bgCompanionsGroup.remove(item.mesh);
    }

    if (productsList.length === 0) return;

    const usedIds = new Set();
    const activeHero = cupProducts[centerProductIndex];
    if (activeHero) usedIds.add(activeHero.id);

    COMPANION_SLOTS.forEach((slot) => {
      const prod =
        productsList.find((p) => p.type === slot.type && !usedIds.has(p.id)) ||
        productsList.find((p) => !usedIds.has(p.id));
      if (!prod) return;
      usedIds.add(prod.id);

      const mesh = createRealProductModel(prod, {
        withHoloRim: false,
        withContactGlow: false,
        rimColor: themeState.rimColor,
        steam: false,
        open: false
      });

      if (mesh.userData && mesh.userData.setOpacity) {
        mesh.userData.setOpacity(slot.opacity);
      }

      bgCompanionsGroup.add(mesh);
      companionItems.push({ mesh, slot });
    });
  }

  function initProductsData() {
    productsList = (window.MGF_PRODUCTS && Array.isArray(window.MGF_PRODUCTS)) ? window.MGF_PRODUCTS : [];
    if (productsList.length === 0) return;

    // Hero focuses on authentic cup models; prioritize cups with photo wraps/lids
    cupProducts = productsList.filter((p) => p.type === 'cup');
    if (cupProducts.length === 0) {
      cupProducts = productsList.slice();
    }

    const preferredIdx = cupProducts.findIndex((p) => p.id === 'cung-dinh-bo-ham' || p.id === 'cupnoodle-seafood');
    centerProductIndex = preferredIdx >= 0 ? preferredIdx : 0;

    setCenterCup(centerProductIndex);
    populateCompanions();
    updateStagePlacement();
  }

  initProductsData();
  if (productsList.length === 0) {
    const checkTimer = setInterval(() => {
      if (window.MGF_PRODUCTS && window.MGF_PRODUCTS.length > 0) {
        clearInterval(checkTimer);
        initProductsData();
      }
    }, 120);
  }

  function applyThemeMode() {
    const isLight = updateThemeColors(themeState);

    hemiLight.intensity = isLight ? 0.82 : 0.65;
    keyLight.intensity = isLight ? 1.55 : 1.45;
    rimLight.color.copy(themeState.rimColor);
    kickerLight.color.copy(themeState.warmAccent);

    if (contactShadowGroup.userData.shadowMat) {
      contactShadowGroup.userData.shadowMat.opacity = isLight ? 0.42 : 0.72;
    }
    if (contactShadowGroup.userData.glowMat) {
      contactShadowGroup.userData.glowMat.color.copy(themeState.rimColor);
      contactShadowGroup.userData.glowMat.opacity = isLight ? 0.28 : 0.42;
    }

    centerModelCache.forEach((model) => {
      if (model.userData && model.userData.updateRimColor) {
        model.userData.updateRimColor(themeState.rimColor);
      }
    });
  }

  applyThemeMode();

  // --- Fit the Hero Cup into .hero-stage ---
  function updateStagePlacement(force = false) {
    if (!container) return;
    const canvasRect = container.getBoundingClientRect();
    const stageElCurrent = stageEl || document.querySelector('.hero-stage');
    const stageRect = stageElCurrent ? stageElCurrent.getBoundingClientRect() : canvasRect;
    if (canvasRect.width === 0 || canvasRect.height === 0 || stageRect.height === 0) return;

    const canvasW = canvasRect.width;
    const canvasH = canvasRect.height;

    const stageChanged =
      force ||
      Math.abs(canvasW - lastCanvasW) > 0.5 ||
      Math.abs(canvasH - lastCanvasH) > 0.5 ||
      Math.abs(stageRect.left - lastStageLeft) > 0.5 ||
      Math.abs(stageRect.top - lastStageTop) > 0.5 ||
      Math.abs(stageRect.width - lastStageW) > 0.5 ||
      Math.abs(stageRect.height - lastStageH) > 0.5;

    if (!stageChanged) return;

    lastCanvasW = canvasW;
    lastCanvasH = canvasH;
    lastStageLeft = stageRect.left;
    lastStageTop = stageRect.top;
    lastStageW = stageRect.width;
    lastStageH = stageRect.height;

    const dpr = getTargetDpr();
    if (renderer.getPixelRatio() !== dpr) {
      renderer.setPixelRatio(dpr);
    }

    const aspect = canvasW / canvasH;
    if (Math.abs(camera.aspect - aspect) > 0.001) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(canvasW, canvasH, false);

    const fovRad = (camera.fov * Math.PI) / 360;
    const dist = camera.position.z;
    const vHeightWorld = 2 * Math.tan(fovRad) * dist;
    const vWidthWorld = vHeightWorld * aspect;

    // Map .hero-stage center to world coordinates
    const stageCenterX = (stageRect.left - canvasRect.left) + stageRect.width * 0.5;
    const stageCenterY = (stageRect.top - canvasRect.top) + stageRect.height * 0.5;

    const targetWorldX = ((stageCenterX / canvasW) - 0.5) * vWidthWorld;
    const targetWorldY = -((stageCenterY / canvasH) - 0.5) * vHeightWorld;
    const stageHeightWorld = (stageRect.height / canvasH) * vHeightWorld;
    const stageWidthWorld = (stageRect.width / canvasW) * vWidthWorld;

    const isMobile = isMobileViewport();

    // Base world height reference for the main hero cup
    currentCenterH = stageHeightWorld * 0.88;

    worldGroup.position.set(targetWorldX, targetWorldY, 0);
    worldGroup.scale.set(1, 1, 1);

    if (currentCenterModel) {
      if (currentCenterModel.userData && currentCenterModel.userData.setTargetHeight) {
        currentCenterModel.userData.setTargetHeight(currentCenterH);
      }
      // Ensure BASE_PITCH is applied before bounding-box projection so tilted lid + body fit ~88% of stage without clipping
      if (Math.abs(currentCenterModel.rotation.x) < 0.05) {
        currentCenterModel.rotation.set(BASE_PITCH, 0, 0);
      }
    }

    // Position grounded contact shadow right under the hero cup base
    const shadowScale = currentCenterH / 2.0;
    contactShadowGroup.position.set(0, -currentCenterH * 0.48, 0);
    contactShadowGroup.scale.setScalar(shadowScale);

    // Position subtle background companions on desktop/tablet; hide or tuck on very narrow screens so cup stays clean
    bgCompanionsGroup.visible = stageRect.width >= 340;
    companionItems.forEach(({ mesh, slot }) => {
      const compH = currentCenterH * slot.scale * (isMobile ? 0.85 : 1.0);
      if (mesh.userData && mesh.userData.setTargetHeight) {
        mesh.userData.setTargetHeight(compH);
      }
      const spreadFactor = isMobile ? 0.72 : 0.92;
      const xOffset = Math.min(stageWidthWorld * 0.36, slot.relX * currentCenterH * spreadFactor);
      const clampedX = slot.relX < 0 ? -Math.abs(xOffset) : Math.abs(xOffset);
      mesh.position.set(clampedX, slot.relY * currentCenterH, slot.z);
      if (mesh.userData && mesh.userData.setOpacity) {
        mesh.userData.setOpacity(isMobile ? slot.opacity * 0.75 : slot.opacity);
      }
    });

    // Project centerContainer bounding box so the hero cup fills ~88% of .hero-stage height across all viewports
    worldGroup.updateMatrixWorld(true);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const corner = new THREE.Vector3();

    if (currentCenterModel) {
      currentCenterModel.traverse((child) => {
        if (child !== currentCenterModel && child.userData && child.userData.isSteam) return;
        if (
          child.isMesh &&
          !child.userData.isContactGlow &&
          !child.userData.isSteam &&
          !(child.parent && child.parent.userData && child.parent.userData.isSteam) &&
          child.userData.phase === undefined &&
          child.userData.speed === undefined &&
          child.geometry
        ) {
          if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
          const b = child.geometry.boundingBox;
          for (let ix = 0; ix < 2; ix++) {
            for (let iy = 0; iy < 2; iy++) {
              for (let iz = 0; iz < 2; iz++) {
                corner.set(
                  ix === 0 ? b.min.x : b.max.x,
                  iy === 0 ? b.min.y : b.max.y,
                  iz === 0 ? b.min.z : b.max.z
                );
                corner.applyMatrix4(child.matrixWorld);
                corner.project(camera);
                const sx = (corner.x * 0.5 + 0.5) * canvasW;
                const sy = (-(corner.y * 0.5) + 0.5) * canvasH;
                if (sx < minX) minX = sx;
                if (sx > maxX) maxX = sx;
                if (sy < minY) minY = sy;
                if (sy > maxY) maxY = sy;
              }
            }
          }
        }
      });
    }

    if (minX !== Infinity && maxX > minX && maxY > minY) {
      const cupScreenW = maxX - minX;
      const cupScreenH = maxY - minY;
      // Target 88% of .hero-stage height (within 85–90% spec), constrained only by 92% stage width
      const targetScreenH = stageRect.height * 0.88;
      const maxAllowedW = Math.max(40, stageRect.width * 0.92);

      const containScale = Math.min(targetScreenH / cupScreenH, maxAllowedW / cupScreenW);
      worldGroup.scale.setScalar(containScale);
      worldGroup.updateMatrixWorld(true);

      const cupCenterX = (minX + maxX) * 0.5;
      const cupCenterY = (minY + maxY) * 0.5;
      const adjustScreenX = -(cupCenterX - stageCenterX) * containScale;
      const adjustScreenY = -(cupCenterY - stageCenterY) * containScale;
      const adjustWorldX = (adjustScreenX / canvasW) * vWidthWorld;
      const adjustWorldY = -(adjustScreenY / canvasH) * vHeightWorld;

      worldGroup.position.set(targetWorldX + adjustWorldX, targetWorldY + adjustWorldY, 0);

      window.__HERO_DEBUG = {
        minX,
        maxX,
        minY,
        maxY,
        groupW: cupScreenW * containScale,
        groupH: cupScreenH * containScale,
        containScale,
        worldPosX: worldGroup.position.x,
        worldPosY: worldGroup.position.y,
        worldScale: worldGroup.scale.x,
        centerModel: Boolean(currentCenterModel),
        companionsCount: companionItems.length,
        stageRect: {
          width: stageRect.width,
          height: stageRect.height,
          left: stageRect.left,
          top: stageRect.top
        }
      };
    }
  }

  // --- Pointer & Gyro Tilt Interaction ---
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };

  function onPointerMove(e) {
    if (prefersReducedMotion) return;
    const normX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
    const normY = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    pointer.targetX = THREE.MathUtils.clamp(normX, -1, 1) * 0.32;
    pointer.targetY = THREE.MathUtils.clamp(normY, -1, 1) * 0.22;
  }

  function onDeviceOrientation(e) {
    if (prefersReducedMotion || e.gamma == null || e.beta == null) return;
    const gx = THREE.MathUtils.clamp(e.gamma / 35, -1, 1);
    const gy = THREE.MathUtils.clamp((e.beta - 45) / 35, -1, 1);
    pointer.targetX = gx * 0.28;
    pointer.targetY = -gy * 0.18;
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });

  function onResize() {
    updateStagePlacement(true);
    if (prefersReducedMotion) {
      renderFrame(0.5);
    }
  }

  const resizeObserver = new ResizeObserver(() => onResize());
  resizeObserver.observe(container);
  if (stageEl) resizeObserver.observe(stageEl);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('scroll', () => updateStagePlacement(false), { passive: true });

  window.addEventListener('themechange', () => {
    applyThemeMode();
    if (prefersReducedMotion) {
      renderFrame(0.5);
    }
  });

  // --- Visibility & Off-screen Pause ---
  let isVisible = true;
  let isTabActive = !document.hidden;

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        isVisible = entry.isIntersecting;
      });
    },
    { threshold: 0.02 }
  );
  intersectionObserver.observe(container);

  function onVisibilityChange() {
    isTabActive = !document.hidden;
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  // --- Animation Loop ---
  let animationFrameId = null;
  const clock = new THREE.Clock();

  function renderFrame(timeSec) {
    updateStagePlacement(false);

    pointer.x += (pointer.targetX - pointer.x) * 0.06;
    pointer.y += (pointer.targetY - pointer.y) * 0.06;

    if (currentCenterModel) {
      if (prefersReducedMotion) {
        currentCenterModel.position.set(0, 0, 0);
        currentCenterModel.rotation.set(BASE_PITCH, -0.18, 0.02);
      } else {
        // Calm, showcase rotation showing off the 360° label wrap + front face, plus gentle float
        const slowYaw = Math.sin(timeSec * 0.55) * 0.42 + pointer.x * 0.65;
        const tiltPitch = BASE_PITCH - pointer.y * 0.32 + Math.cos(timeSec * 0.7) * 0.03;
        const tiltRoll = -pointer.x * 0.08 + Math.sin(timeSec * 0.45) * 0.025;
        const bobY = Math.sin(timeSec * 1.35) * (0.035 * currentCenterH);

        currentCenterModel.position.set(0, bobY, 0);
        currentCenterModel.rotation.set(tiltPitch, slowYaw, tiltRoll);

        // Drive built-in steam/animation hooks on product-models if present
        if (currentCenterModel.userData) {
          if (typeof currentCenterModel.userData.updateSteam === 'function') {
            currentCenterModel.userData.updateSteam(timeSec);
          }
          if (typeof currentCenterModel.userData.tick === 'function') {
            currentCenterModel.userData.tick(timeSec);
          }
        }
      }
    }

    if (fallbackSteam.visible && fallbackSteam.userData.updateSteam) {
      fallbackSteam.userData.updateSteam(prefersReducedMotion ? 1.2 : timeSec, currentCenterH, themeState.isLight);
    }

    // Subtle parallax & float on background companions (also tilted forward ~16° to match hero angle)
    companionItems.forEach(({ mesh, slot }) => {
      if (prefersReducedMotion) {
        mesh.rotation.set(COMPANION_PITCH, slot.rotY, slot.rotZ);
      } else {
        const t = timeSec * 0.9 + slot.phase;
        const bob = Math.sin(t) * (0.025 * currentCenterH);
        mesh.position.y = slot.relY * currentCenterH + bob;
        mesh.rotation.set(
          COMPANION_PITCH - pointer.y * 0.15,
          slot.rotY + Math.sin(t * 0.6) * 0.16 + pointer.x * 0.25,
          slot.rotZ
        );
      }
    });

    renderer.render(scene, camera);
  }

  updateStagePlacement(true);

  if (prefersReducedMotion) {
    renderFrame(0.5);
    return;
  }

  function tick() {
    animationFrameId = requestAnimationFrame(tick);
    if (!isVisible || !isTabActive) return;
    const elapsedTime = clock.getElapsedTime();
    renderFrame(elapsedTime);
  }

  tick();

  return () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('deviceorientation', onDeviceOrientation);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
  };
}

// Auto boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHero3D);
} else {
  initHero3D();
}
