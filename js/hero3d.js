import * as THREE from 'three';

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
    // 1. Check for color(srgb r g b)
    if (computed.startsWith('color(srgb')) {
      const match = computed.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
      if (match) {
        return new THREE.Color(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
      }
    }
    // 2. Check for standard rgb / rgba / hex
    try {
      const c = new THREE.Color(computed);
      // Ensure it didn't fail-open to pure white unless computed was white
      if (!(c.r === 1 && c.g === 1 && c.b === 1 && !computed.includes('255, 255, 255'))) {
        return c;
      }
    } catch {
      // fallback
    }

    // 3. 2D Canvas parser fallback
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

// --- Geometry Generators ---

/**
 * Creates an instant noodle pillow pack geometry.
 * Subdivided box with convex bulge in Z/X, tapered sealed side flaps, and crimped top/bottom edges.
 */
function createNoodlePackGeometry(w = 1.6, h = 2.2, d = 0.55, segW = 28, segH = 36, segD = 10) {
  const geo = new THREE.BoxGeometry(w, h, d, segW, segH, segD);
  const pos = geo.attributes.position;
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  const halfD = d * 0.5;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normX = x / halfW;
    const normY = y / halfH;

    const envX = Math.max(0, 1 - normX * normX);
    const envY = Math.max(0, 1 - normY * normY);
    const pillowFactor = envX * envY;

    if (Math.abs(z) > 0.001) {
      const signZ = Math.sign(z);
      z = signZ * (halfD * (0.2 + 0.8 * pillowFactor));
    }

    const crimpDist = 0.14 * h;
    const topEdgeDist = halfH - y;
    const btmEdgeDist = y - (-halfH);

    if (topEdgeDist < crimpDist || btmEdgeDist < crimpDist) {
      const crimpFactor = 1 - Math.min(topEdgeDist, btmEdgeDist) / crimpDist;
      z *= (1 - crimpFactor * 0.88);
      x *= (1 + crimpFactor * 0.05);

      const crimpWave = Math.sin(normX * 42.0) * (0.018 * h * crimpFactor);
      if (y > 0) {
        y += crimpWave;
      } else {
        y -= crimpWave;
      }
    }

    const sideDist = halfW - Math.abs(x);
    if (sideDist < 0.08 * w) {
      z *= 0.65;
    }

    pos.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a stylized ramen cup / noodle bowl geometry with rim lip and tapered body.
 */
function createNoodleCupGeometry(radiusTop = 0.7, radiusBottom = 0.45, height = 0.9, radialSegments = 24, heightSegments = 16) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, true);
  const pos = geo.attributes.position;
  const halfH = height * 0.5;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const normY = (y + halfH) / height;

    const bulge = Math.sin(normY * Math.PI) * 0.04;
    const rim = Math.pow(Math.max(0, (normY - 0.85) / 0.15), 2) * 0.08;

    const angle = Math.atan2(z, x);
    const currentR = Math.hypot(x, z) + bulge + rim;

    pos.setXYZ(i, Math.cos(angle) * currentR, y, Math.sin(angle) * currentR);
  }

  geo.computeVertexNormals();
  return geo;
}

// --- Hologram Shaders ---

const HoloVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const HoloFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uHoloA;
  uniform vec3 uHoloB;
  uniform vec3 uHoloC;
  uniform float uScanFreq;
  uniform float uScanSpeed;
  uniform float uFresnelPow;
  uniform float uFlickerStrength;
  uniform float uNoiseStrength;
  uniform float uAlpha;
  uniform float uLight;

  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  varying vec3 vViewPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Fresnel rim glow
    float NdotV = max(0.0, dot(normal, viewDir));
    float fresnel = pow(1.0 - NdotV, uFresnelPow);

    // Thin, sharp horizontal scanlines
    float scanline = sin((vWorldPosition.y * uScanFreq) - (uTime * uScanSpeed));
    scanline = smoothstep(0.35, 0.95, scanline);

    // Subtle micro scanlines
    float microScan = sin(vWorldPosition.y * (uScanFreq * 4.0) - (uTime * uScanSpeed * 1.5));
    microScan = smoothstep(0.5, 1.0, microScan) * 0.15;

    // Subtle holographic jitter / flicker
    float tSeed = floor(uTime * 24.0);
    float noise = hash(vUv * 60.0 + vec2(tSeed * 0.04, 0.0));
    float flicker = sin(uTime * 35.0) * 0.5 + sin(uTime * 70.0) * 0.25;
    float jitter = 1.0 + flicker * uFlickerStrength + (noise - 0.5) * uNoiseStrength;

    if (uLight > 0.5) {
      // LIGHT THEME (NormalBlending on warm background):
      // Saturated body tint and deep solid rim - NO white mixing, NO pastel pink.
      vec3 bodyTint = mix(uHoloA, uHoloB, 0.35 + 0.35 * sin(vWorldPosition.y * 1.5 + uTime * 0.6));
      vec3 rimColor = uHoloC; // deep rich accent at edges

      vec3 lightHoloColor = mix(bodyTint, rimColor, fresnel * 0.95);
      lightHoloColor = mix(lightHoloColor, uHoloB, scanline * 0.4);

      float alpha = clamp((0.36 + fresnel * 0.62 + (scanline + microScan) * 0.14) * uAlpha * jitter, 0.0, 1.0);
      gl_FragColor = vec4(lightHoloColor, alpha);
    } else {
      // DARK THEME (AdditiveBlending on dark background):
      // Translucent glass body with strong, glowing gold rim highlights and subtle bloom.
      vec3 bodyColor = mix(uHoloC, uHoloB, 0.45 + 0.45 * sin(vWorldPosition.y * 1.2 + uTime * 0.5));
      vec3 holoColor = mix(bodyColor, uHoloA, fresnel * 0.92);

      float rimIntensity = fresnel * 1.45;
      float lineIntensity = (scanline + microScan) * 0.28;
      float interiorIntensity = 0.38;

      vec3 finalRgb = holoColor * (interiorIntensity + lineIntensity + rimIntensity) * jitter;
      finalRgb = min(finalRgb, vec3(1.15, 0.95, 0.5));

      float alpha = clamp((0.24 + fresnel * 0.74 + scanline * 0.15) * uAlpha * jitter, 0.0, 0.95);
      gl_FragColor = vec4(finalRgb, alpha);
    }
  }
`;

function createHoloMaterial(sharedUniforms, opts = {}) {
  const uniforms = {
    uTime: sharedUniforms.uTime,
    uHoloA: sharedUniforms.uHoloA,
    uHoloB: sharedUniforms.uHoloB,
    uHoloC: sharedUniforms.uHoloC,
    uLight: sharedUniforms.uLight,
    uScanFreq: { value: opts.scanFreq || 30.0 },
    uScanSpeed: { value: opts.scanSpeed || 5.0 },
    uFresnelPow: { value: opts.fresnelPow || 2.1 },
    uFlickerStrength: { value: opts.flicker || 0.04 },
    uNoiseStrength: { value: opts.noise || 0.06 },
    uAlpha: { value: opts.alpha || 0.92 }
  };

  const initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const isLight = initialTheme === 'light';

  return new THREE.ShaderMaterial({
    vertexShader: HoloVertexShader,
    fragmentShader: HoloFragmentShader,
    uniforms,
    transparent: true,
    blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
    side: opts.side !== undefined ? opts.side : THREE.FrontSide,
    depthWrite: false
  });
}

// --- Main Hero 3D Component ---

export function initHero3D() {
  const container = document.getElementById('hero-canvas');
  if (!container) return;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 7.8);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  const sharedUniforms = {
    uTime: { value: 0 },
    uHoloA: { value: new THREE.Color() },
    uHoloB: { value: new THREE.Color() },
    uHoloC: { value: new THREE.Color() },
    uLight: { value: 0.0 }
  };
  const isLightInitial = updateThemeUniforms(sharedUniforms);

  let isMobile = window.innerWidth <= 600;
  let isDesktop = window.innerWidth > 900;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  function updateLayout() {
    isMobile = window.innerWidth <= 600;
    isDesktop = window.innerWidth > 900;

    if (isMobile) {
      camera.position.set(0, 0, 9.4);
      worldGroup.position.set(0, -0.85, 0);
    } else {
      camera.position.set(0, 0, 7.8);
      worldGroup.position.set(0, -0.92, 0);
    }
  }
  updateLayout();

  const AXIS_X = new THREE.Vector3(1, 0, 0);
  const AXIS_Z = new THREE.Vector3(0, 0, 1);

  const holoMaterials = [];
  const wireMaterials = [];

  // 1. Center Hero Pack
  const packW = isDesktop ? 1.78 : 1.5;
  const packH = isDesktop ? 2.36 : 2.0;
  const packD = isDesktop ? 0.54 : 0.46;

  const centerPackGeo = createNoodlePackGeometry(packW, packH, packD, 28, 36, 10);
  const centerPackMat = createHoloMaterial(sharedUniforms, {
    scanFreq: 26.0,
    scanSpeed: 4.8,
    fresnelPow: 2.0,
    flicker: 0.03,
    noise: 0.05,
    alpha: 0.95,
    side: THREE.FrontSide
  });
  holoMaterials.push(centerPackMat);

  const centerPack = new THREE.Mesh(centerPackGeo, centerPackMat);
  centerPack.position.set(0, 0.15, 0);
  worldGroup.add(centerPack);

  // Wireframe accent overlay
  const wireGeo = new THREE.WireframeGeometry(centerPackGeo);
  const centerWireMat = new THREE.LineBasicMaterial({
    color: isLightInitial ? sharedUniforms.uHoloB.value : sharedUniforms.uHoloA.value,
    transparent: true,
    opacity: isLightInitial ? 0.18 : 0.045,
    blending: isLightInitial ? THREE.NormalBlending : THREE.AdditiveBlending
  });
  wireMaterials.push(centerWireMat);
  const centerWire = new THREE.LineSegments(wireGeo, centerWireMat);
  centerPack.add(centerWire);

  // Soft Hologram Bloom Halo Sprite behind the center pack
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = 128;
  haloCanvas.height = 128;
  const haloCtx = haloCanvas.getContext('2d');
  const hGrad = haloCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  hGrad.addColorStop(0, 'rgba(255, 120, 0, 0.45)');
  hGrad.addColorStop(0.4, 'rgba(255, 60, 0, 0.22)');
  hGrad.addColorStop(0.8, 'rgba(225, 6, 0, 0.06)');
  hGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  haloCtx.fillStyle = hGrad;
  haloCtx.fillRect(0, 0, 128, 128);
  const haloTexture = new THREE.CanvasTexture(haloCanvas);

  const haloMat = new THREE.SpriteMaterial({
    map: haloTexture,
    color: sharedUniforms.uHoloB.value,
    transparent: true,
    blending: isLightInitial ? THREE.NormalBlending : THREE.AdditiveBlending,
    opacity: isLightInitial ? 0.35 : 0.65,
    depthWrite: false
  });
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.scale.set(3.4, 4.0, 1.0);
  haloSprite.position.set(0, 0.15, -0.2);
  worldGroup.add(haloSprite);

  // 2. Projector Base (Glowing Rings + Light Cone)
  const projectorGroup = new THREE.Group();
  projectorGroup.position.set(0, -1.65, 0);
  worldGroup.add(projectorGroup);

  const ringGeos = [
    new THREE.RingGeometry(0.55, 0.64, 48),
    new THREE.RingGeometry(1.0, 1.12, 64),
    new THREE.RingGeometry(1.5, 1.62, 64)
  ];
  const ringMeshes = [];
  const ringMaterials = [];

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
    ringMaterials.push(mat);
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    projectorGroup.add(ring);
    ringMeshes.push(ring);
  });

  // Translucent Cone Light Beam
  const coneGeo = new THREE.CylinderGeometry(0.35, 1.55, 2.1, 32, 16, true);
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
        float baseAlpha = (uLight > 0.5) ? (0.24 + 0.22 * beam) : (0.09 + 0.14 * beam);
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
  projectorGroup.add(coneMesh);

  // 3. Floating Particles Rising from Projector
  const particleCount = isMobile ? 32 : 60;
  const pPos = new Float32Array(particleCount * 3);
  const pSpeed = new Float32Array(particleCount);
  const pRadius = new Float32Array(particleCount);
  const pAngle = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 0.2 + Math.random() * 1.4;
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
  worldGroup.add(particleSystem);

  // 4. Orbiting Items: 5 smaller packs + noodle bowl
  const orbiters = [];
  const smallPackGeo = createNoodlePackGeometry(0.65, 0.88, 0.22, 16, 20, 6);
  const bowlGeo = createNoodleCupGeometry(0.42, 0.28, 0.55, 24, 12);

  const orbitConfigs = [
    { type: 'pack', radius: 2.7, speed: 0.38, tiltX: 0.15, tiltZ: 0.1, yOffset: -0.25, phase: 0.3, scale: 0.9 },
    { type: 'bowl', radius: 3.3, speed: -0.32, tiltX: -0.2, tiltZ: -0.15, yOffset: -0.15, phase: 1.5, scale: 1.0 },
    { type: 'pack', radius: 3.8, speed: 0.25, tiltX: 0.25, tiltZ: -0.2, yOffset: -0.35, phase: 2.8, scale: 0.8 },
    { type: 'pack', radius: 2.9, speed: -0.4, tiltX: -0.15, tiltZ: 0.2, yOffset: -0.2, phase: 3.9, scale: 0.85 },
    { type: 'pack', radius: 4.1, speed: 0.2, tiltX: 0.3, tiltZ: 0.18, yOffset: -0.4, phase: 4.9, scale: 0.75 },
    { type: 'pack', radius: 3.5, speed: -0.28, tiltX: -0.25, tiltZ: 0.12, yOffset: -0.3, phase: 5.8, scale: 0.8 }
  ];

  const activeConfigs = isMobile ? orbitConfigs.slice(0, 3) : orbitConfigs;

  activeConfigs.forEach((cfg, idx) => {
    const geo = cfg.type === 'bowl' ? bowlGeo : smallPackGeo;
    const mat = createHoloMaterial(sharedUniforms, {
      scanFreq: 34.0,
      scanSpeed: 5.5 + idx * 0.4,
      fresnelPow: 2.2,
      flicker: 0.04,
      noise: 0.06,
      alpha: 0.85,
      side: THREE.FrontSide
    });
    holoMaterials.push(mat);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(cfg.scale);

    const wireMat = new THREE.LineBasicMaterial({
      color: isLightInitial ? sharedUniforms.uHoloC.value : sharedUniforms.uHoloB.value,
      transparent: true,
      opacity: isLightInitial ? 0.18 : 0.04,
      blending: isLightInitial ? THREE.NormalBlending : THREE.AdditiveBlending
    });
    wireMaterials.push(wireMat);

    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), wireMat);
    mesh.add(wire);

    worldGroup.add(mesh);
    orbiters.push({ mesh, cfg });
  });

  // --- Theme Mode Application Function ---
  function applyThemeMode() {
    const isLight = updateThemeUniforms(sharedUniforms);
    const targetBlending = isLight ? THREE.NormalBlending : THREE.AdditiveBlending;

    holoMaterials.forEach((m) => {
      m.blending = targetBlending;
      m.needsUpdate = true;
    });

    wireMaterials.forEach((wm, idx) => {
      wm.blending = targetBlending;
      wm.color.copy(isLight ? sharedUniforms.uHoloC.value : (idx === 0 ? sharedUniforms.uHoloA.value : sharedUniforms.uHoloB.value));
      wm.opacity = isLight ? 0.18 : 0.045;
      wm.needsUpdate = true;
    });

    if (haloMat) {
      haloMat.blending = targetBlending;
      haloMat.color.copy(isLight ? sharedUniforms.uHoloC.value : sharedUniforms.uHoloB.value);
      haloMat.opacity = isLight ? 0.35 : 0.65;
      haloMat.needsUpdate = true;
    }

    if (ringMeshes[0]) {
      ringMeshes[0].material.color.copy(isLight ? sharedUniforms.uHoloC.value : sharedUniforms.uHoloB.value);
      ringMeshes[0].material.blending = targetBlending;
      ringMeshes[0].material.opacity = isLight ? 0.5 : 0.36;
      ringMeshes[0].material.needsUpdate = true;
    }
    if (ringMeshes[1]) {
      ringMeshes[1].material.color.copy(isLight ? sharedUniforms.uHoloB.value : sharedUniforms.uHoloA.value);
      ringMeshes[1].material.blending = targetBlending;
      ringMeshes[1].material.opacity = isLight ? 0.4 : 0.28;
      ringMeshes[1].material.needsUpdate = true;
    }
    if (ringMeshes[2]) {
      ringMeshes[2].material.color.copy(sharedUniforms.uHoloC.value);
      ringMeshes[2].material.blending = targetBlending;
      ringMeshes[2].material.opacity = isLight ? 0.3 : 0.2;
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

  // --- Resize Observer ---
  function onResize() {
    if (!container) return;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    if (width === 0 || height === 0) return;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    updateLayout();
  }

  const resizeObserver = new ResizeObserver(() => {
    onResize();
  });
  resizeObserver.observe(container);
  onResize();

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

  // --- Animation Loop ---
  let animationFrameId = null;
  const clock = new THREE.Clock();

  function renderFrame(timeSec) {
    sharedUniforms.uTime.value = timeSec;

    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;
    worldGroup.rotation.y = mouse.x * 0.55;
    worldGroup.rotation.x = -mouse.y * 0.35;

    // Center Pack: gentle slow rotation + soft bobbing
    centerPack.rotation.y = timeSec * 0.48;
    centerPack.rotation.x = Math.sin(timeSec * 0.85) * 0.09;
    centerPack.rotation.z = Math.cos(timeSec * 0.65) * 0.05;
    centerPack.position.y = 0.15 + Math.sin(timeSec * 1.4) * 0.09;

    // Projector rings counter rotation
    if (ringMeshes[0]) ringMeshes[0].rotation.z = timeSec * 0.35;
    if (ringMeshes[1]) ringMeshes[1].rotation.z = -timeSec * 0.5;
    if (ringMeshes[2]) ringMeshes[2].rotation.z = timeSec * 0.22;

    // Rising Particles
    const posArr = particleGeo.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      let py = posArr[i * 3 + 1];
      py += pSpeed[i] * 0.018;
      if (py > 2.0) {
        py = -1.65;
      }
      posArr[i * 3 + 1] = py;

      pAngle[i] += 0.007;
      const r = pRadius[i] * (0.8 + (py + 1.65) * 0.15);
      posArr[i * 3 + 0] = Math.cos(pAngle[i]) * r;
      posArr[i * 3 + 2] = Math.sin(pAngle[i]) * r;
    }
    particleGeo.attributes.position.needsUpdate = true;

    // Orbiters
    orbiters.forEach(({ mesh, cfg }) => {
      const angle = cfg.phase + timeSec * cfg.speed;
      const x = Math.cos(angle) * cfg.radius;
      const z = Math.sin(angle) * cfg.radius;
      const y = cfg.yOffset + Math.sin(angle * 2.0 + cfg.phase) * 0.42;

      mesh.position.set(x, y, z);
      mesh.position.applyAxisAngle(AXIS_X, cfg.tiltX);
      mesh.position.applyAxisAngle(AXIS_Z, cfg.tiltZ);

      mesh.rotation.x += 0.012;
      mesh.rotation.y += 0.016;
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
    renderer.dispose();
  };
}

// Auto-boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHero3D);
} else {
  initHero3D();
}
