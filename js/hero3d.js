import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createRealProductModel, setRendererCapabilities } from './product-models.js';

// --- Color & Theme Utilities ---
let probeEl = null;
let colorCanvas = null;
let colorCtx = null;

export function getCssColor(varName, fallbackHex) {
  if (!probeEl) {
    probeEl = document.createElement('div');
    probeEl.style.display = 'none';
    document.body.appendChild(probeEl);
  }
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

  return new THREE.Color(fallbackHex);
}

function updateThemeUniforms(uniforms) {
  const colA = getCssColor('--holo-a', '#FFC800');
  const colB = getCssColor('--holo-b', '#FF5A00');
  const colC = getCssColor('--holo-c', '#E10600');

  if (uniforms.uHoloA) uniforms.uHoloA.value.copy(colA);
  if (uniforms.uHoloB) uniforms.uHoloB.value.copy(colB);
  if (uniforms.uHoloC) uniforms.uHoloC.value.copy(colC);

  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const isLight = theme === 'light';
  if (uniforms.uLight) {
    uniforms.uLight.value = isLight ? 1.0 : 0.0;
  }
  return isLight;
}

// --- Hologram Scan Transition Shader for Center Product ---

const ScanTransitionVertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ScanTransitionFragmentShader = /* glsl */ `
  uniform float uScanY;
  uniform float uScanWidth;
  uniform vec3 uScanColor;
  uniform float uIntensity;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    float dist = abs(vWorldPos.y - uScanY);
    float beam = smoothstep(uScanWidth, 0.0, dist);

    float core = smoothstep(uScanWidth * 0.25, 0.0, dist);
    float glow = beam * 0.6 + core * 0.8;

    vec3 col = uScanColor * (1.0 + core * 0.8);
    float alpha = glow * uIntensity;

    gl_FragColor = vec4(col, alpha);
  }
`;

function createScanPlaneMaterial(sharedUniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: ScanTransitionVertexShader,
    fragmentShader: ScanTransitionFragmentShader,
    uniforms: {
      uScanY: { value: -2.0 },
      uScanWidth: { value: 0.25 },
      uScanColor: { value: sharedUniforms.uHoloA.value },
      uIntensity: { value: 0.0 }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
}

// --- Main Hero 3D Component ---

let isHero3DInitialized = false;

export function initHero3D() {
  const container = document.getElementById('hero-canvas');
  if (!container || isHero3DInitialized) return;
  if (container.querySelector('canvas')) return;
  isHero3DInitialized = true;
  container.style.zIndex = '0';
  container.style.pointerEvents = 'none';

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 8.0);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);
  setRendererCapabilities(renderer);

  window.__HERO_RENDERER = renderer;
  window.__HERO_SCENE = scene;
  window.__HERO_CAMERA = camera;

  // PMREM Environment for realistic packaging reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const roomEnv = new RoomEnvironment();
  const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
  scene.environment = envTexture;

  // Studio Lighting
  const dirLight1 = new THREE.DirectionalLight(0xfff5e6, 1.3);
  dirLight1.position.set(5, 7, 6);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffdfd0, 0.7);
  dirLight2.position.set(-6, 3, 5);
  scene.add(dirLight2);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const sharedUniforms = {
    uTime: { value: 0 },
    uHoloA: { value: new THREE.Color() },
    uHoloB: { value: new THREE.Color() },
    uHoloC: { value: new THREE.Color() },
    uLight: { value: 0.0 }
  };
  const isLightInitial = updateThemeUniforms(sharedUniforms);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // Center product group
  const centerContainer = new THREE.Group();
  worldGroup.add(centerContainer);

  window.__hero_debug = { worldGroup, centerContainer, scene, camera };

  const stageEl = document.querySelector('.hero-stage');

  let currentCenterH = 1.5;
  let currentStageHeightWorld = 2.1;

  // 1. Center Real Product Setup
  let productsList = (window.MGF_PRODUCTS && Array.isArray(window.MGF_PRODUCTS)) ? window.MGF_PRODUCTS : [];
  let centerProductIndex = 0;
  let currentCenterModel = null;
  let nextCenterModel = null;
  const centerModelCache = new Map();

  function getCenterModel(prod) {
    if (!prod) return null;
    if (centerModelCache.has(prod.id)) {
      const model = centerModelCache.get(prod.id);
      if (model.userData && model.userData.setTargetHeight) {
        model.userData.setTargetHeight(currentCenterH);
      }
      return model;
    }
    const model = createRealProductModel(prod, {
      withHoloRim: true,
      withContactGlow: true,
      rimColor: sharedUniforms.uHoloA.value
    });
    if (model.userData && model.userData.setTargetHeight) {
      model.userData.setTargetHeight(currentCenterH);
    }
    centerModelCache.set(prod.id, model);
    return model;
  }

  // Scan transition overlay cylinder/mesh
  const scanMat = createScanPlaneMaterial(sharedUniforms);
  const scanGeo = new THREE.CylinderGeometry(1.6, 1.6, 3.2, 32, 1, true);
  const scanMesh = new THREE.Mesh(scanGeo, scanMat);
  scanMesh.userData.isBeamOrScan = true;
  centerContainer.add(scanMesh);

  let isTransitioning = false;
  let transitionStartTime = 0;
  const TRANSITION_DURATION = 1.2;

  function setCenterProduct(index, animate = false) {
    if (productsList.length === 0) return;
    centerProductIndex = (index + productsList.length) % productsList.length;
    const prod = productsList[centerProductIndex];
    const newModel = getCenterModel(prod);

    if (!animate || !currentCenterModel) {
      if (currentCenterModel) centerContainer.remove(currentCenterModel);
      currentCenterModel = newModel;
      centerContainer.add(currentCenterModel);
    } else {
      nextCenterModel = newModel;
      transitionStartTime = clock.getElapsedTime();
      isTransitioning = true;
    }
  }

  // 2. Projector Base (Glowing Rings + Light Cone)
  const projectorGroup = new THREE.Group();
  projectorGroup.position.set(0, -0.95, 0);
  worldGroup.add(projectorGroup);

  const ringGeos = [
    new THREE.RingGeometry(0.20, 0.25, 48),
    new THREE.RingGeometry(0.35, 0.41, 64),
    new THREE.RingGeometry(0.50, 0.56, 64)
  ];
  const ringMeshes = [];

  const ringInitColors = [
    sharedUniforms.uHoloB.value,
    sharedUniforms.uHoloA.value,
    sharedUniforms.uHoloC.value
  ];

  ringGeos.forEach((geo, idx) => {
    const mat = new THREE.MeshBasicMaterial({
      color: ringInitColors[idx],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: (0.36 - idx * 0.08) * (isLightInitial ? 1.4 : 1.0),
      blending: isLightInitial ? THREE.NormalBlending : THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    projectorGroup.add(ring);
    ringMeshes.push(ring);
  });

  // Translucent Cone Light Beam
  const coneGeo = new THREE.CylinderGeometry(0.18, 0.38, 1.8, 32, 16, true);
  const coneMat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uLight;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        float yFade = smoothstep(0.0, 0.88, 1.0 - vUv.y);
        float beam = sin(vUv.x * 20.0 + uTime * 1.8) * 0.5 + 0.5;
        float baseAlpha = (uLight > 0.5) ? (0.04 + 0.04 * beam) : (0.09 + 0.14 * beam);
        float alpha = yFade * baseAlpha;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uColor: { value: sharedUniforms.uHoloB.value },
      uLight: sharedUniforms.uLight
    },
    transparent: true,
    blending: isLightInitial ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const coneMesh = new THREE.Mesh(coneGeo, coneMat);
  coneMesh.position.y = 1.05;
  coneMesh.userData.isBeamOrScan = true;
  projectorGroup.add(coneMesh);

  // 3. Floating Particles Rising from Projector
  const particleCount = 48;
  const pPos = new Float32Array(particleCount * 3);
  const pSpeed = new Float32Array(particleCount);
  const pRadius = new Float32Array(particleCount);
  const pAngle = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 0.2 + Math.random() * 1.2;
    pAngle[i] = angle;
    pRadius[i] = r;
    pSpeed[i] = 0.5 + Math.random() * 1.0;

    pPos[i * 3 + 0] = Math.cos(angle) * r;
    pPos[i * 3 + 1] = -1.65 + Math.random() * 3.6;
    pPos[i * 3 + 2] = Math.sin(angle) * r;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));

  const pCanvas = document.createElement('canvas');
  pCanvas.width = 32;
  pCanvas.height = 32;
  const pCtx = pCanvas.getContext('2d');
  const radGrad = pCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  radGrad.addColorStop(0, 'rgba(255, 90, 0, 1)');
  radGrad.addColorStop(0.4, 'rgba(225, 6, 0, 0.85)');
  radGrad.addColorStop(1, 'rgba(176, 0, 0, 0)');
  pCtx.fillStyle = radGrad;
  pCtx.fillRect(0, 0, 32, 32);
  const pTexture = new THREE.CanvasTexture(pCanvas);

  const particleMat = new THREE.PointsMaterial({
    map: pTexture,
    size: 0.16,
    transparent: true,
    blending: isLightInitial ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    color: isLightInitial ? sharedUniforms.uHoloB.value : sharedUniforms.uHoloA.value
  });
  const particleSystem = new THREE.Points(particleGeo, particleMat);
  particleSystem.userData.isBeamOrScan = true;
  worldGroup.add(particleSystem);

  // 4. Four Orbiters close around center with depth overlap (2 behind, 2 in front-low)
  // Symmetric and evenly spaced, each ≈ 40–45% of center product size (0.42x)
  const orbiterItems = [];

  const ORBITER_CONFIGS = [
    // 2 behind (higher, z < 0, peeking beside the center, >=70% visible)
    { id: 'back-left',   side: 'left',  type: 'pack', relX: -0.44, relY:  0.18, z: -0.55, phase: 0 },
    { id: 'back-right',  side: 'right', type: 'pack', relX:  0.44, relY:  0.18, z: -0.55, phase: (1 / 3) * Math.PI * 2 },
    // 2 in front-low (lower, z > 0, framing lower quarters of center product)
    { id: 'front-left',  side: 'left',  type: 'cup',  relX: -0.38, relY: -0.24, z:  0.55, phase: (2 / 3) * Math.PI * 2 },
    { id: 'front-right', side: 'right', type: 'bowl', relX:  0.38, relY: -0.24, z:  0.55, phase: Math.PI }
  ];

  function findProductForSlot(type, usedIds) {
    if (!productsList || productsList.length === 0) return null;
    const match = productsList.find((p) => p.type === type && !usedIds.has(p.id));
    if (match) return match;
    const anyUnused = productsList.find((p) => !usedIds.has(p.id));
    return anyUnused || productsList[0];
  }

  function populateOrbiters() {
    while (orbiterItems.length > 0) {
      const it = orbiterItems.pop();
      worldGroup.remove(it.mesh);
    }

    if (productsList.length === 0) return;

    const usedIds = new Set();
    const centerProd = productsList[centerProductIndex];
    if (centerProd) usedIds.add(centerProd.id);

    const targetOrbiterH = currentCenterH * 0.42;

    ORBITER_CONFIGS.forEach((slotDef) => {
      const prod = findProductForSlot(slotDef.type, usedIds);
      if (prod) usedIds.add(prod.id);

      const mesh = createRealProductModel(prod, {
        withHoloRim: true,
        withContactGlow: true,
        rimColor: sharedUniforms.uHoloA.value
      });

      if (mesh.userData && mesh.userData.setTargetHeight) {
        mesh.userData.setTargetHeight(targetOrbiterH);
      }

      worldGroup.add(mesh);
      orbiterItems.push({
        mesh,
        def: slotDef
      });
    });
  }

  // --- Initial Product Loading & Default Selection ---
  function initProductsData() {
    productsList = (window.MGF_PRODUCTS && Array.isArray(window.MGF_PRODUCTS)) ? window.MGF_PRODUCTS : [];
    if (productsList.length > 0) {
      const defaultIdx = productsList.findIndex((p) => p.id && p.id.includes('cung-dinh-bo-ham'));
      centerProductIndex = defaultIdx >= 0 ? defaultIdx : 0;
      setCenterProduct(centerProductIndex, false);
      populateOrbiters();
    }
  }

  initProductsData();
  if (productsList.length === 0) {
    const checkTimer = setInterval(() => {
      if (window.MGF_PRODUCTS && window.MGF_PRODUCTS.length > 0) {
        clearInterval(checkTimer);
        initProductsData();
      }
    }, 150);
  }

  // --- Theme Mode Application Function ---
  function applyThemeMode() {
    const isLight = updateThemeUniforms(sharedUniforms);
    const targetBlending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;

    if (ringMeshes[0]) {
      ringMeshes[0].material.color.copy(isLight ? sharedUniforms.uHoloC.value : sharedUniforms.uHoloB.value);
      ringMeshes[0].material.blending = targetBlending;
      ringMeshes[0].material.opacity = isLight ? 0.35 : 0.36;
      ringMeshes[0].material.needsUpdate = true;
    }
    if (ringMeshes[1]) {
      ringMeshes[1].material.color.copy(isLight ? sharedUniforms.uHoloB.value : sharedUniforms.uHoloA.value);
      ringMeshes[1].material.blending = targetBlending;
      ringMeshes[1].material.opacity = isLight ? 0.25 : 0.28;
      ringMeshes[1].material.needsUpdate = true;
    }
    if (ringMeshes[2]) {
      ringMeshes[2].material.color.copy(sharedUniforms.uHoloC.value);
      ringMeshes[2].material.blending = targetBlending;
      ringMeshes[2].material.opacity = isLight ? 0.15 : 0.2;
      ringMeshes[2].material.needsUpdate = true;
    }

    if (coneMat) {
      if (coneMat.uniforms.uColor) {
        coneMat.uniforms.uColor.value.copy(isLight ? sharedUniforms.uHoloA.value : sharedUniforms.uHoloB.value);
      }
      coneMat.blending = targetBlending;
      coneMat.needsUpdate = true;
    }

    if (particleMat) {
      particleMat.color.copy(isLight ? sharedUniforms.uHoloB.value : sharedUniforms.uHoloA.value);
      particleMat.blending = targetBlending;
      particleMat.needsUpdate = true;
    }

    const activeRimColor = sharedUniforms.uHoloA.value;
    centerModelCache.forEach((model) => {
      if (model.userData.updateRimColor) model.userData.updateRimColor(activeRimColor);
    });
    orbiterItems.forEach(({ mesh }) => {
      if (mesh.userData.updateRimColor) mesh.userData.updateRimColor(activeRimColor);
    });
  }

  // --- Stage Projection to fill .hero-stage rect ---
  function updateStagePlacement() {
    if (!container) return;
    const canvasRect = container.getBoundingClientRect();
    const stageRect = stageEl ? stageEl.getBoundingClientRect() : canvasRect;
    if (canvasRect.width === 0 || canvasRect.height === 0 || stageRect.height === 0) return;

    const canvasW = canvasRect.width;
    const canvasH = canvasRect.height;
    const aspect = canvasW / canvasH;

    if (Math.abs(camera.aspect - aspect) > 0.001) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(canvasW, canvasH);
    }

    const fovRad = (camera.fov * Math.PI) / 360;
    const vHeightWorld = 2 * Math.tan(fovRad) * camera.position.z;
    const vWidthWorld = vHeightWorld * aspect;

    // Convert .hero-stage center to world coordinates relative to full-bleed canvas
    const stageCenterX = (stageRect.left - canvasRect.left) + stageRect.width * 0.5;
    const stageCenterY = (stageRect.top - canvasRect.top) + stageRect.height * 0.5;

    const targetWorldX = ((stageCenterX / canvasW) - 0.5) * vWidthWorld;
    const targetWorldY = -((stageCenterY / canvasH) - 0.5) * vHeightWorld;
    const stageHeightWorld = (stageRect.height / canvasH) * vHeightWorld;

    currentStageHeightWorld = stageHeightWorld;
    const stageWidthWorld = (stageRect.width / canvasW) * vWidthWorld;
    const isMobileStage = window.innerWidth <= 860;
    // Center ≈ 70% of stage height on desktop and mobile
    currentCenterH = stageHeightWorld * 0.70;

    worldGroup.position.set(targetWorldX, targetWorldY, 0);

    if (currentCenterModel && currentCenterModel.userData && currentCenterModel.userData.setTargetHeight) {
      currentCenterModel.userData.setTargetHeight(currentCenterH);
    }
    if (nextCenterModel && nextCenterModel.userData && nextCenterModel.userData.setTargetHeight) {
      nextCenterModel.userData.setTargetHeight(currentCenterH);
    }

    const targetOrbiterH = currentCenterH * 0.42;
    orbiterItems.forEach(({ mesh, def }) => {
      if (mesh.userData && mesh.userData.setTargetHeight) {
        mesh.userData.setTargetHeight(targetOrbiterH);
      }
      mesh.position.set(def.relX * currentCenterH, def.relY * currentCenterH, def.z);
    });

    const baseScale = currentCenterH / 1.5;
    projectorGroup.position.set(0, -0.52 * currentCenterH, 0);
    projectorGroup.scale.set(baseScale, baseScale, baseScale);

    coneMesh.position.y = 0.90;
    coneMesh.scale.set(1.0, 1.0, 1.0);

    scanMesh.scale.set(baseScale, baseScale, baseScale);
    scanMesh.position.set(0, 0.05 * currentCenterH, 0);

    // Fit the WHOLE group (center + orbiters + ring) inside .hero-stage rect with contain
    worldGroup.scale.set(1.0, 1.0, 1.0);
    worldGroup.updateMatrixWorld(true);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    const corner = new THREE.Vector3();

    worldGroup.traverse((child) => {
      if (
        child.isMesh &&
        !child.userData.isContactGlow &&
        !child.userData.isBeamOrScan &&
        child !== scanMesh &&
        child !== coneMesh &&
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

    if (minX !== Infinity && maxX > minX && maxY > minY) {
      const groupW = maxX - minX;
      const groupH = maxY - minY;
      let containScale;
      if (isMobileStage) {
        // Fit by width: the group should span ~90% of the stage width, center ≈ 70% of the stage height, centered
        const targetW = stageRect.width * 0.90;
        const scaleByWidth = targetW / groupW;
        const maxH = Math.max(10, stageRect.height - 16);
        const maxScaleByHeight = maxH / groupH;
        containScale = Math.min(scaleByWidth, maxScaleByHeight);
      } else {
        const padX = 8;
        const padY = 12;
        const maxAllowedW = Math.max(10, stageRect.width - padX * 2);
        const maxAllowedH = Math.max(10, stageRect.height - padY * 2);
        containScale = Math.min(1.0, maxAllowedW / groupW, maxAllowedH / groupH);
      }
      worldGroup.scale.set(containScale, containScale, containScale);
      worldGroup.updateMatrixWorld(true);

      // Center the group within the stage rect both horizontally and vertically
      const currentGroupCenterX = (minX + maxX) * 0.5;
      const currentGroupCenterY = (minY + maxY) * 0.5;
      const scaledOffsetX = (currentGroupCenterX - stageCenterX) * containScale;
      const scaledOffsetY = (currentGroupCenterY - stageCenterY) * containScale;
      const adjustScreenX = -scaledOffsetX;
      const adjustScreenY = -scaledOffsetY;
      const adjustWorldX = (adjustScreenX / canvasW) * vWidthWorld;
      const adjustWorldY = -(adjustScreenY / canvasH) * vHeightWorld;
      worldGroup.position.set(targetWorldX + adjustWorldX, targetWorldY + adjustWorldY, 0);

      window.__HERO_DEBUG = {
        minX, maxX, minY, maxY, groupW, groupH, containScale,
        worldPosX: worldGroup.position.x,
        worldPosY: worldGroup.position.y,
        worldScale: worldGroup.scale.x,
        centerModel: Boolean(currentCenterModel),
        orbitersCount: orbiterItems.length,
        stageRect: { width: stageRect.width, height: stageRect.height, left: stageRect.left, top: stageRect.top }
      };
    } else {
      window.__HERO_DEBUG = {
        minX, maxX, minY, maxY,
        noBounds: true,
        centerModel: Boolean(currentCenterModel),
        orbitersCount: orbiterItems.length
      };
    }
  }

  // --- Parallax & Mouse Interactivity ---
  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  function onPointerMove(e) {
    const normX = (e.clientX / window.innerWidth) * 2 - 1;
    const normY = -(e.clientY / window.innerHeight) * 2 + 1;
    mouse.targetX = normX * 0.25;
    mouse.targetY = normY * 0.18;
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  function onResize() {
    updateStagePlacement();
  }

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);
  if (stageEl) resizeObserver.observe(stageEl);
  window.addEventListener('resize', onResize);
  updateStagePlacement();

  window.addEventListener('themechange', () => {
    applyThemeMode();
  });

  // --- Visibility & Offscreen Caching ---
  let isVisible = true;
  let isTabActive = !document.hidden;

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        isVisible = entry.isIntersecting;
      });
    },
    { threshold: 0.05 }
  );
  intersectionObserver.observe(container);

  document.addEventListener('visibilitychange', () => {
    isTabActive = !document.hidden;
  });

  // --- Animation & Hologram Transition Loop ---
  let animationFrameId = null;
  const clock = new THREE.Clock();
  let lastTime = 0;
  let cycleTimer = 0;

  function renderFrame(timeSec) {
    const dt = timeSec - lastTime;
    lastTime = timeSec;
    sharedUniforms.uTime.value = timeSec;

    updateStagePlacement();

    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;
    worldGroup.rotation.y = mouse.x * 0.45;
    worldGroup.rotation.x = -mouse.y * 0.25;

    // Cycle center product every ~6s
    if (!prefersReducedMotion && productsList.length > 1) {
      cycleTimer += dt;
      if (cycleTimer >= 6.0 && !isTransitioning) {
        cycleTimer = 0;
        setCenterProduct(centerProductIndex + 1, true);
        populateOrbiters();
      }
    }

    // Handle scan transition animation
    if (isTransitioning) {
      const progress = (timeSec - transitionStartTime) / TRANSITION_DURATION;
      if (progress < 1.0) {
        const scanY = 1.6 - progress * 3.2;
        scanMat.uniforms.uScanY.value = scanY;
        scanMat.uniforms.uIntensity.value = Math.sin(progress * Math.PI) * 1.5;

        if (progress >= 0.5 && nextCenterModel && currentCenterModel !== nextCenterModel) {
          centerContainer.remove(currentCenterModel);
          currentCenterModel = nextCenterModel;
          centerContainer.add(currentCenterModel);
        }
      } else {
        isTransitioning = false;
        scanMat.uniforms.uIntensity.value = 0.0;
        if (nextCenterModel && currentCenterModel !== nextCenterModel) {
          centerContainer.remove(currentCenterModel);
          currentCenterModel = nextCenterModel;
          centerContainer.add(currentCenterModel);
        }
        nextCenterModel = null;
      }
    }

    const omega = 1.35;
    const swayAngleMax = 18 * Math.PI / 180;
    const pitchAngle = 8 * Math.PI / 180;
    const bobMax = 0.06 * (currentCenterH / 1.5);

    // Center Product: upright, forward tilt ~8°, calm synchronized yaw sway ±18° + bob
    if (currentCenterModel) {
      const t = timeSec * omega;
      const sway = Math.sin(t) * swayAngleMax;
      const bob = Math.sin(t) * bobMax;

      currentCenterModel.position.set(0, 0.05 * currentCenterH + bob, 0);
      currentCenterModel.rotation.set(pitchAngle, sway, 0);
    }

    // Projector rings counter rotation
    if (ringMeshes[0]) ringMeshes[0].rotation.z = timeSec * 0.35;
    if (ringMeshes[1]) ringMeshes[1].rotation.z = -timeSec * 0.5;
    if (ringMeshes[2]) ringMeshes[2].rotation.z = timeSec * 0.22;

    // Rising Particles
    const posArr = particleGeo.attributes.position.array;
    const pScale = currentCenterH / 1.5;
    for (let i = 0; i < particleCount; i++) {
      let py = posArr[i * 3 + 1];
      py += pSpeed[i] * 0.018 * pScale;
      if (py > 2.0 * pScale) py = -1.65 * pScale;
      posArr[i * 3 + 1] = py;

      pAngle[i] += 0.007;
      const r = pRadius[i] * (0.8 + (py / pScale + 1.65) * 0.15) * pScale;
      posArr[i * 3 + 0] = Math.cos(pAngle[i]) * r;
      posArr[i * 3 + 2] = Math.sin(pAngle[i]) * r;
    }
    particleGeo.attributes.position.needsUpdate = true;

    // Four Orbiters close around center with depth overlap (2 behind, 2 in front-low)
    // Symmetric and evenly spaced, synchronized sway
    orbiterItems.forEach(({ mesh, def }) => {
      const t = timeSec * omega + def.phase;
      const sway = Math.sin(t) * swayAngleMax;
      const bob = Math.sin(t) * bobMax;

      const ox = def.relX * currentCenterH;
      const oy = def.relY * currentCenterH + bob;
      const oz = def.z;

      mesh.position.set(ox, oy, oz);
      mesh.rotation.x = pitchAngle;
      mesh.rotation.z = 0;

      if (def.side === 'left') {
        mesh.rotation.y = (20 * Math.PI / 180) + sway;
      } else {
        mesh.rotation.y = (-20 * Math.PI / 180) - sway;
      }
    });

    renderer.render(scene, camera);
  }

  if (prefersReducedMotion) {
    renderFrame(1.0);
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
    window.removeEventListener('pointermove', onPointerMove);
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
