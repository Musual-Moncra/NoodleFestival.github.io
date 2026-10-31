import * as THREE from 'three';

// Shared texture loader & capabilities
let sharedTextureLoader = null;
let maxAnisotropy = 8;

export function setRendererCapabilities(renderer) {
  if (renderer && renderer.capabilities) {
    maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  }
}

export function configureTexture(tex) {
  if (!tex) return;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAnisotropy;
  if (tex.image) {
    tex.needsUpdate = true;
  }
}

function getTextureLoader() {
  if (!sharedTextureLoader) {
    sharedTextureLoader = new THREE.TextureLoader();
  }
  return sharedTextureLoader;
}

// On file:// Chrome blocks image files from WebGL (CORS), so index.html then loads
// js/products-textures.js, which maps each asset path to an embedded data URI.
function resolveAsset(url) {
  const embedded = typeof window !== 'undefined' && window.MGF_TEXTURES;
  return (embedded && embedded[url]) || url;
}

// Texture caching by URL
const textureCache = new Map();
export function loadTexture(url) {
  if (!url) return null;
  if (typeof document === 'undefined') {
    const dummy = new THREE.Texture();
    configureTexture(dummy);
    return dummy;
  }
  if (textureCache.has(url)) return textureCache.get(url);
  const tex = getTextureLoader().load(resolveAsset(url), (loaded) => {
    configureTexture(loaded);
    loaded.needsUpdate = true;
  });
  configureTexture(tex);
  textureCache.set(url, tex);
  return tex;
}

// Reusable contact glow texture (soft blurred ellipse sprite)
let contactGlowTexture = null;
export function getContactGlowTexture() {
  if (contactGlowTexture) return contactGlowTexture;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
  grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.12)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  contactGlowTexture = new THREE.CanvasTexture(canvas);
  configureTexture(contactGlowTexture);
  return contactGlowTexture;
}

export function createContactGlowMesh(glowColor, width = 1.6, depth = 0.9) {
  const geo = new THREE.PlaneGeometry(width, depth);
  const mat = new THREE.MeshBasicMaterial({
    map: getContactGlowTexture(),
    color: glowColor || new THREE.Color(0xffaa00),
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  mat.userData = { baseOpacity: 0.28 };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.isContactGlow = true;
  return { mesh, mat };
}

/**
 * Loads unrolled wrap texture for cups/bowls:
 * - If prod.wrap is defined, loads the official 360° unrolled label texture.
 * - Fallback: generates opaque 360° tileable wrap on 1024x512 canvas.
 */
const wrapTextureCache = new Map();

export function loadCupOrBowlWrapTexture(prod, onUpdate) {
  if (!prod) return null;
  const id = prod.id || 'cup';
  if (wrapTextureCache.has(id)) return wrapTextureCache.get(id);

  if (prod.wrap) {
    const tex = loadTexture(prod.wrap);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    wrapTextureCache.set(id, tex);
    return tex;
  }

  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const mainColor = (prod.colors && prod.colors.main) || '#7F221E';
  const accentColor = (prod.colors && prod.colors.accent) || mainColor;

  ctx.fillStyle = mainColor;
  ctx.fillRect(0, 0, 1024, 512);

  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 1024, 16);

  ctx.fillStyle = mainColor;
  ctx.fillRect(0, 512 - 16, 1024, 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  wrapTextureCache.set(id, tex);

  if (prod.front) {
    const img = new Image();
    if (typeof window !== 'undefined' && window.location && window.location.protocol !== 'file:') {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) return;

      const aspect = iw / ih;
      const drawH = 512;
      const drawW = Math.min(480, Math.round(drawH * aspect));
      const pasteX = Math.round(256 - drawW / 2);

      ctx.fillStyle = mainColor;
      ctx.fillRect(0, 0, 1024, 512);

      ctx.fillStyle = accentColor;
      ctx.fillRect(0, 0, 1024, 16);
      ctx.fillStyle = mainColor;
      ctx.fillRect(0, 512 - 16, 1024, 16);

      ctx.drawImage(img, 0, 0, iw, ih, pasteX, 0, drawW, drawH);

      ctx.save();
      ctx.translate(1024, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(canvas, 0, 0, 512, 512, 0, 0, 512, 512);
      ctx.restore();

      ctx.save();
      ctx.filter = 'blur(10px)';
      ctx.drawImage(canvas, 480, 0, 64, 512, 480, -10, 64, 532);
      ctx.drawImage(canvas, 0, 0, 32, 512, -16, -10, 32, 532);
      ctx.drawImage(canvas, 992, 0, 32, 512, 1008, -10, 32, 532);
      ctx.restore();
      ctx.filter = 'none';

      tex.needsUpdate = true;
      if (onUpdate) onUpdate(tex);
    };
    img.src = resolveAsset(prod.front);
  }

  return tex;
}

/**
 * Cup or Bowl Lathe Geometry:
 * - Recessed bottom foot rim.
 * - Tapered conical body with natural organic curve.
 * - Authentic rolled paper rim bead (viền mép cuộn).
 * - Exact UV mapping for 360 wrap label without distortion.
 */
export function createCupOrBowlGeometry(bodyData, type = 'cup', prod = null, opts = {}) {
  const isLowPoly = Boolean(opts && opts.lowPoly);
  const topW = (bodyData && bodyData.topW) ? bodyData.topW : 0.92;
  const bottomW = (bodyData && bodyData.bottomW) ? bodyData.bottomW : 0.7;
  const isBowl = type === 'bowl';

  let aspect = (prod && prod.h && prod.w) ? (prod.h / prod.w) : (isBowl ? 0.86 : 1.33);
  let totalHeight = isBowl
    ? THREE.MathUtils.clamp(1.3 * (aspect / 0.86), 1.15, 1.55)
    : THREE.MathUtils.clamp(1.95 * (aspect / 1.33), 1.7, 2.3);

  const halfH = totalHeight * 0.5;
  const rTop = isBowl
    ? (halfH / aspect) * (topW * 0.4 + 0.6)
    : (halfH / aspect) * (topW * 0.5 + 0.45);
  const rBottom = isBowl
    ? (halfH / aspect) * (bottomW * 0.4 + 0.4)
    : (halfH / aspect) * (bottomW * 0.5 + 0.35);

  const points = [];
  // 1. Recessed bottom center
  points.push(new THREE.Vector2(0.0, -halfH + 0.045));
  points.push(new THREE.Vector2(rBottom * 0.82, -halfH + 0.045));
  // 2. Bottom foot rim
  points.push(new THREE.Vector2(rBottom * 0.94, -halfH));
  points.push(new THREE.Vector2(rBottom, -halfH));

  // 3. Tapered body with gentle natural curve
  const steps = isLowPoly ? 8 : 16;
  const bodyTopY = halfH - 0.04;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = -halfH + t * (bodyTopY - (-halfH));
    const belly = Math.sin(t * Math.PI) * (isBowl ? 0.065 : 0.022);
    const r = THREE.MathUtils.lerp(rBottom, rTop, t) + belly;
    points.push(new THREE.Vector2(r, y));
  }

  // 4. Rolled paper rim bead (viền mép cuộn)
  // Torus cross-section curling out, up, and slightly inward
  const beadR = isBowl ? 0.032 : 0.028;
  const beadCenterX = rTop + beadR * 0.55;
  const beadCenterY = halfH - beadR * 0.45;
  const beadSteps = isLowPoly ? 4 : 7;
  for (let b = 0; b <= beadSteps; b++) {
    const angle = -Math.PI * 0.5 + (b / beadSteps) * Math.PI * 1.55;
    const bx = beadCenterX + Math.cos(angle) * beadR;
    const by = beadCenterY + Math.sin(angle) * beadR;
    points.push(new THREE.Vector2(bx, by));
  }

  const radialSegments = isLowPoly ? 24 : 48;
  const geo = new THREE.LatheGeometry(points, radialSegments, -Math.PI * 0.5, Math.PI * 2);

  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  // UV mapping: Body wall from yBottom to yRim gets v: 0.02..0.98.
  // Rolled rim gets v = 0.99 (matching top edge print).
  // Bottom foot gets v = 0.01 (matching bottom edge print).
  const yRim = bodyTopY;
  const yBottom = -halfH + 0.02;

  for (let k = 0; k < pos.count; k++) {
    const y = pos.getY(k);
    let v;
    if (y >= yRim) {
      v = 0.99; // Rolled rim lip inherits top edge accent
    } else if (y <= yBottom) {
      v = 0.01; // Bottom foot
    } else {
      v = THREE.MathUtils.clamp((y - yBottom) / (yRim - yBottom), 0.02, 0.98);
    }
    uv.setY(k, v);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();

  return { geo, rTop, rBottom, halfH, totalHeight };
}

/**
 * Top paper / foil lid geometry with subtle convex bulge (used when closed)
 */
export function createLidGeometry(radius = 1.0, opts = {}) {
  const segments = (opts && opts.lowPoly) ? 24 : 40;
  const uvScale = 0.82;
  const geo = new THREE.CircleGeometry(radius, segments);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const dist = Math.hypot(x, y) / radius;
    const bulge = Math.max(0, 1 - dist * dist) * 0.025;
    pos.setZ(i, bulge);
    uv.setXY(i, 0.5 + (x / radius) * 0.5 * uvScale, 0.5 + (y / radius) * 0.5 * uvScale);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates authentic 2-mesh FLAT peeled-back foil lid assembly:
 * 1. Top Mesh (base sealed half + flap top):
 *    - In texture -lid.webp, mapped with uvScale=0.82 to fit inside the opaque graphic circle.
 *    - Opacity 1.0, metalness 0.5, roughness 0.35, depthWrite true.
 * 2. Underside Mesh (facing forward/down towards the camera):
 *    - Shiny bright silver aluminum foil: MeshStandardMaterial (color #d9d9d9, metalness 0.7, roughness 0.3).
 *    - Flat rigid flap tilted up ~47° along straight hinge line (KHÔNG phải vòm).
 *    - NO holo rim on the lid.
 */
export function createPeeledLidAssembly(radius = 1.0, opts = {}) {
  const isLowPoly = Boolean(opts && opts.lowPoly);
  const segments = isLowPoly ? 24 : 36;
  const peelAngle = (opts && opts.peelAngle) || 0.82; // ~47° flat tilt
  const hingeFraction = -0.06;
  const uvScale = 0.82; // keeps UVs strictly within solid graphic area

  const hingeZ = radius * hingeFraction;
  const chordW = Math.sqrt(Math.max(0, radius * radius - hingeZ * hingeZ));
  const angleStart = Math.atan2(hingeZ, -chordW);
  const angleEnd = Math.atan2(hingeZ, chordW);

  const cosA = Math.cos(peelAngle);
  const sinA = Math.sin(peelAngle);

  // 1. TOP MESH (Sealed flat back half + lifted flat front flap, printed top side)
  const topPos = [];
  const topUv = [];
  const topIdx = [];

  // Base segment (z <= hingeZ)
  const baseCenterIdx = 0;
  topPos.push(0, 0, hingeZ);
  topUv.push(0.5, 0.5 + (hingeZ / radius) * 0.5 * uvScale);

  const baseSteps = Math.round(segments * 0.55);
  for (let i = 0; i <= baseSteps; i++) {
    const t = i / baseSteps;
    const a = angleStart - t * (angleStart - (angleEnd - Math.PI * 2));
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    topPos.push(x, 0, z);
    topUv.push(0.5 + (x / radius) * 0.5 * uvScale, 0.5 + (z / radius) * 0.5 * uvScale);
  }
  for (let i = 1; i <= baseSteps; i++) {
    topIdx.push(baseCenterIdx, i, i + 1);
  }

  // Flap top segment (z >= hingeZ)
  const flapCenterIdx = topPos.length / 3;
  topPos.push(0, 0, hingeZ);
  topUv.push(0.5, 0.5 + (hingeZ / radius) * 0.5 * uvScale);

  const flapSteps = Math.round(segments * 0.45);
  for (let i = 0; i <= flapSteps; i++) {
    const t = i / flapSteps;
    const a = angleEnd + t * (angleStart + Math.PI * 2 - angleEnd);
    const origX = Math.cos(a) * radius;
    const origZ = Math.sin(a) * radius;
    const dist = origZ - hingeZ;
    const posX = origX;
    const posY = dist * sinA;
    const posZ = hingeZ + dist * cosA;
    topPos.push(posX, posY, posZ);
    topUv.push(0.5 + (origX / radius) * 0.5 * uvScale, 0.5 + (origZ / radius) * 0.5 * uvScale);
  }
  for (let i = 1; i <= flapSteps; i++) {
    topIdx.push(flapCenterIdx, flapCenterIdx + i + 1, flapCenterIdx + i);
  }

  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(topPos, 3));
  topGeo.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
  topGeo.setIndex(topIdx);
  topGeo.computeVertexNormals();

  // 2. UNDERSIDE MESH (Bright silver aluminum foil flap facing the camera)
  const underPos = [];
  const underUv = [];
  const underIdx = [];

  // Hairline offset of 0.002 along underside normal (0, -cosA, sinA) to prevent z-fighting
  const offY = -cosA * 0.002;
  const offZ = sinA * 0.002;

  underPos.push(0, offY, hingeZ + offZ);
  underUv.push(0.5, 0.5);

  for (let i = 0; i <= flapSteps; i++) {
    const t = i / flapSteps;
    const a = angleEnd + t * (angleStart + Math.PI * 2 - angleEnd);
    const origX = Math.cos(a) * radius;
    const origZ = Math.sin(a) * radius;
    const dist = origZ - hingeZ;
    const posX = origX;
    const posY = dist * sinA + offY;
    const posZ = hingeZ + dist * cosA + offZ;
    underPos.push(posX, posY, posZ);
    underUv.push(t, 1);
  }
  for (let i = 1; i <= flapSteps; i++) {
    underIdx.push(0, i, i + 1);
  }

  const underGeo = new THREE.BufferGeometry();
  underGeo.setAttribute('position', new THREE.Float32BufferAttribute(underPos, 3));
  underGeo.setAttribute('uv', new THREE.Float32BufferAttribute(underUv, 2));
  underGeo.setIndex(underIdx);
  underGeo.computeVertexNormals();

  return { topGeo, underGeo };
}

// Backward compatibility alias
export function createFlatPeeledLidGeometry(radius = 1.0, opts = {}) {
  const { topGeo } = createPeeledLidAssembly(radius, opts);
  return topGeo;
}

export function createPeeledLidGeometries(radius = 1.0, opts = {}) {
  const { topGeo, underGeo } = createPeeledLidAssembly(radius, opts);
  return { topGeo, foilGeo: underGeo };
}

/**
 * Merges multiple BufferGeometries into a single BufferGeometry for draw-call batching.
 */
function mergeBufferGeometriesSimple(geos) {
  let totalPos = 0;
  let totalIdx = 0;
  for (let k = 0; k < geos.length; k++) {
    const g = geos[k];
    if (!g || !g.attributes.position) continue;
    totalPos += g.attributes.position.count;
    if (g.index) totalIdx += g.index.count;
  }
  if (totalPos === 0) return new THREE.BufferGeometry();

  const positions = new Float32Array(totalPos * 3);
  const normals = new Float32Array(totalPos * 3);
  const indices = new Uint32Array(totalIdx);

  let posOffset = 0;
  let idxOffset = 0;
  let vertexOffset = 0;

  for (let k = 0; k < geos.length; k++) {
    const g = geos[k];
    if (!g || !g.attributes.position) continue;
    const pArr = g.attributes.position.array;
    positions.set(pArr, posOffset * 3);

    if (g.attributes.normal) {
      normals.set(g.attributes.normal.array, posOffset * 3);
    }

    if (g.index) {
      const iArr = g.index.array;
      for (let j = 0; j < iArr.length; j++) {
        indices[idxOffset + j] = iArr[j] + vertexOffset;
      }
      idxOffset += g.index.count;
    }

    const count = g.attributes.position.count;
    posOffset += count;
    vertexOffset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (totalIdx > 0) {
    merged.setIndex(new THREE.BufferAttribute(indices, 1));
  }
  return merged;
}

/**
 * Creates curled shrimp geometry (tôm khô ăn liền)
 */
function createShrimpGeometry(scale = 1.0) {
  const pts = [];
  const segments = 10;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = -Math.PI * 0.22 + t * Math.PI * 1.15;
    const r = 0.082 * scale;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r * 0.82;
    const z = Math.sin(t * Math.PI) * (0.016 * scale);
    pts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 10, 0.024 * scale, 6, false);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = Math.floor(i / 7) / 10;
    let taper = 1.0;
    if (u < 0.25) taper = 0.5 + u * 2.0;
    else if (u > 0.55) taper = 1.0 - (u - 0.55) * 1.8;
    taper = Math.max(0.28, taper);
    pos.setXYZ(i, pos.getX(i) * taper, pos.getY(i) * taper, pos.getZ(i) * taper);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates 3D curly noodle strand (sợi mì xoăn 3D)
 */
function createCurlyNoodleStrand(cx, cz, baseR, arcAngle, turns, depth, scale = 1.0) {
  const pts = [];
  const steps = 16;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const angle = t * arcAngle;
    const r = baseR * (0.75 + 0.35 * Math.sin(t * Math.PI));
    const wave = Math.sin(t * Math.PI * turns * 2.0) * (0.028 * scale);
    const x = cx + Math.cos(angle) * (r + wave);
    const z = cz + Math.sin(angle) * (r + wave);
    const y = -depth + 0.032 * scale + Math.sin(t * Math.PI * turns * 1.6) * (0.016 * scale) + Math.sin(t * Math.PI) * (0.02 * scale);
    pts.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 12, 0.018 * scale, 5, false);
}

/**
 * Creates complete realistic noodle assembly inside the cup:
 * - Inner cup food-grade paper lining
 * - Rich savory broth disc
 * - Sculpted curly noodle mound
 * - 3D curly noodle strands
 * - Toppings: shrimp (tôm), scallions (hành lá), fluffy egg cubes (trứng)
 */
export function createNoodleAssembly(rTop, halfH, opts = {}) {
  const isLowPoly = Boolean(opts && opts.lowPoly);
  const group = new THREE.Group();
  group.userData.isNoodleAssembly = true;
  const materials = [];

  const noodleDepth = 0.22;
  const rLiningTop = rTop - 0.025;
  const rLiningBottom = rTop * 0.90;
  const liningH = noodleDepth + 0.02;

  // 1. Inner paper lining
  const liningGeo = new THREE.CylinderGeometry(
    rLiningTop,
    rLiningBottom,
    liningH,
    isLowPoly ? 24 : 40,
    1,
    true
  );
  const liningMat = new THREE.MeshPhysicalMaterial({
    color: 0xFAF7F2,
    roughness: 0.58,
    metalness: 0.0,
    clearcoat: 0.08,
    side: THREE.BackSide,
    transparent: false,
    depthWrite: true
  });
  liningMat.userData = { isSolid: true, baseOpacity: 1.0 };
  materials.push(liningMat);
  const liningMesh = new THREE.Mesh(liningGeo, liningMat);
  liningMesh.position.y = halfH - liningH * 0.5 - 0.005;
  group.add(liningMesh);

  // 2. Rich broth disc
  const brothGeo = new THREE.CircleGeometry(rLiningBottom * 0.98, isLowPoly ? 20 : 36);
  const brothMat = new THREE.MeshPhysicalMaterial({
    color: 0x9E3B1B,
    roughness: 0.1,
    metalness: 0.05,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true
  });
  brothMat.userData = { isSolid: true, baseOpacity: 1.0 };
  materials.push(brothMat);
  const brothMesh = new THREE.Mesh(brothGeo, brothMat);
  brothMesh.rotation.x = -Math.PI / 2;
  brothMesh.position.y = halfH - noodleDepth - 0.015;
  group.add(brothMesh);

  // 3. Curly noodle mound (sculpted bed)
  const bedRings = isLowPoly ? 6 : 10;
  const bedSegments = isLowPoly ? 20 : 32;
  const bedGeo = new THREE.RingGeometry(0.01, rLiningBottom * 0.96, bedSegments, bedRings);
  const bedPos = bedGeo.attributes.position;
  for (let i = 0; i < bedPos.count; i++) {
    const x = bedPos.getX(i);
    const y = bedPos.getY(i);
    const dist = Math.hypot(x, y) / (rLiningBottom * 0.96);
    const dome = Math.max(0, 1 - dist * dist) * 0.045;
    const wave = Math.sin(x * 32.0 + Math.cos(y * 24.0) * 2.0) * 0.02 +
                 Math.cos(y * 30.0 + Math.sin(x * 24.0) * 2.0) * 0.02;
    bedPos.setZ(i, dome + wave);
  }
  bedGeo.computeVertexNormals();

  const noodleMat = new THREE.MeshPhysicalMaterial({
    color: 0xF5C75D,
    roughness: 0.36,
    metalness: 0.0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.25,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true
  });
  noodleMat.userData = { isSolid: true, baseOpacity: 1.0 };
  materials.push(noodleMat);
  const bedMesh = new THREE.Mesh(bedGeo, noodleMat);
  bedMesh.rotation.x = -Math.PI / 2;
  bedMesh.position.y = halfH - noodleDepth + 0.025;
  group.add(bedMesh);

  // 4. 3D Curly noodle strands (winding tubes)
  const strandCount = isLowPoly ? 6 : 13;
  const strandGeos = [];
  const sScale = rTop / 0.68;

  for (let s = 0; s < strandCount; s++) {
    const angle = (s / strandCount) * Math.PI * 2 + (s % 2) * 0.3;
    const dist = (0.2 + (s % 3) * 0.22) * (rLiningBottom * 0.85);
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const baseR = (0.12 + (s % 4) * 0.04) * sScale;
    const arc = (Math.PI * 1.2) + (s % 3) * 0.6;
    const turns = 2.5 + (s % 3) * 0.8;

    const strand = createCurlyNoodleStrand(cx, cz, baseR, arc, turns, noodleDepth - 0.02, sScale);
    strandGeos.push(strand);
  }

  const mergedStrandsGeo = mergeBufferGeometriesSimple(strandGeos);
  const strandsMesh = new THREE.Mesh(mergedStrandsGeo, noodleMat);
  strandsMesh.position.y = halfH;
  group.add(strandsMesh);

  // 5. Topping: Tôm (Shrimp)
  const shrimpCount = isLowPoly ? 2 : 3;
  const shrimpGeos = [];
  const shrimpMat = new THREE.MeshPhysicalMaterial({
    color: 0xFF5834,
    roughness: 0.32,
    metalness: 0.0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.25,
    transparent: false,
    depthWrite: true
  });
  shrimpMat.userData = { isSolid: true, baseOpacity: 1.0 };
  materials.push(shrimpMat);

  const shrimpPlacements = [
    { x: 0.14 * rTop, y: halfH - noodleDepth + 0.075, z: 0.25 * rTop, rx: 0.3, ry: 0.8, rz: -0.2, s: 1.05 * sScale },
    { x: -0.22 * rTop, y: halfH - noodleDepth + 0.07, z: 0.32 * rTop, rx: -0.2, ry: -1.2, rz: 0.3, s: 0.95 * sScale },
    { x: -0.02 * rTop, y: halfH - noodleDepth + 0.08, z: 0.50 * rTop, rx: 0.4, ry: 2.1, rz: 0.1, s: 1.0 * sScale }
  ];

  for (let i = 0; i < shrimpCount; i++) {
    const p = shrimpPlacements[i];
    const sGeo = createShrimpGeometry(p.s);
    const mat4 = new THREE.Matrix4();
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    const rot = new THREE.Euler(p.rx, p.ry, p.rz);
    const sca = new THREE.Vector3(1, 1, 1);
    mat4.compose(pos, new THREE.Quaternion().setFromEuler(rot), sca);
    sGeo.applyMatrix4(mat4);
    shrimpGeos.push(sGeo);
  }

  const mergedShrimpGeo = mergeBufferGeometriesSimple(shrimpGeos);
  const shrimpMesh = new THREE.Mesh(mergedShrimpGeo, shrimpMat);
  group.add(shrimpMesh);

  // 6. Topping: Hành lá (Chopped scallion rings)
  const scallionCount = isLowPoly ? 8 : 16;
  const scallionGeos = [];
  const scallionMat = new THREE.MeshPhysicalMaterial({
    color: 0x2E7D32,
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.2,
    transparent: false,
    depthWrite: true
  });
  scallionMat.userData = { isSolid: true, baseOpacity: 1.0 };
  materials.push(scallionMat);

  for (let i = 0; i < scallionCount; i++) {
    const scR = (0.024 + (i % 4) * 0.004) * sScale;
    const scH = (0.012 + (i % 3) * 0.003) * sScale;
    const scGeo = new THREE.CylinderGeometry(scR, scR, scH, 8, 1, false);

    const angle = (i / scallionCount) * Math.PI * 2 + (i * 1.3);
    const dist = (0.15 + ((i * 7) % 10) * 0.065) * (rLiningBottom * 0.88);
    const sx = Math.cos(angle) * dist;
    const sz = Math.sin(angle) * dist;
    const sy = halfH - noodleDepth + 0.05 + Math.sin(i * 2.1) * 0.025;

    const mat4 = new THREE.Matrix4();
    const rot = new THREE.Euler(
      (Math.sin(i * 1.7) * 0.3),
      angle,
      (Math.cos(i * 1.9) * 0.3)
    );
    mat4.compose(
      new THREE.Vector3(sx, sy, sz),
      new THREE.Quaternion().setFromEuler(rot),
      new THREE.Vector3(1, 1, 1)
    );
    scGeo.applyMatrix4(mat4);
    scallionGeos.push(scGeo);
  }

  const mergedScallionGeo = mergeBufferGeometriesSimple(scallionGeos);
  const scallionMesh = new THREE.Mesh(mergedScallionGeo, scallionMat);
  group.add(scallionMesh);

  // 7. Topping: Trứng (Fluffy egg cubes)
  const eggCount = isLowPoly ? 3 : 5;
  const eggGeos = [];
  const eggMat = new THREE.MeshPhysicalMaterial({
    color: 0xFFD54F,
    roughness: 0.65,
    metalness: 0.0,
    clearcoat: 0.0,
    transparent: false,
    depthWrite: true
  });
  eggMat.userData = { isSolid: true, baseOpacity: 1.0 };
  materials.push(eggMat);

  const eggPlacements = [
    { x: 0.32 * rTop, y: halfH - noodleDepth + 0.065, z: 0.22 * rTop, ry: 0.4 },
    { x: -0.30 * rTop, y: halfH - noodleDepth + 0.06, z: 0.20 * rTop, ry: -0.5 },
    { x: 0.14 * rTop, y: halfH - noodleDepth + 0.07, z: 0.48 * rTop, ry: 1.1 },
    { x: -0.16 * rTop, y: halfH - noodleDepth + 0.065, z: 0.50 * rTop, ry: -1.3 },
    { x: 0.02 * rTop, y: halfH - noodleDepth + 0.075, z: 0.12 * rTop, ry: 0.8 }
  ];

  for (let i = 0; i < eggCount; i++) {
    const p = eggPlacements[i];
    const ew = (0.062 + (i % 2) * 0.008) * sScale;
    const eh = (0.052 + (i % 2) * 0.006) * sScale;
    const ed = (0.062 + (i % 2) * 0.008) * sScale;
    const eGeo = new THREE.BoxGeometry(ew, eh, ed, 1, 1, 1);

    const mat4 = new THREE.Matrix4();
    const rot = new THREE.Euler(0.15 * Math.sin(i), p.ry, 0.15 * Math.cos(i));
    mat4.compose(
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Quaternion().setFromEuler(rot),
      new THREE.Vector3(1, 1, 1)
    );
    eGeo.applyMatrix4(mat4);
    eggGeos.push(eGeo);
  }

  const mergedEggGeo = mergeBufferGeometriesSimple(eggGeos);
  const eggMesh = new THREE.Mesh(mergedEggGeo, eggMat);
  group.add(eggMesh);

  return { group, materials };
}

/**
 * Reusable soft steam wisp canvas texture
 */
let steamTexture = null;
function getSteamTexture() {
  if (steamTexture) return steamTexture;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(64, 256, 64, 0);
  grad.addColorStop(0.0, 'rgba(255, 252, 246, 0.0)');
  grad.addColorStop(0.2, 'rgba(255, 252, 246, 0.45)');
  grad.addColorStop(0.6, 'rgba(255, 252, 246, 0.32)');
  grad.addColorStop(0.9, 'rgba(255, 252, 246, 0.10)');
  grad.addColorStop(1.0, 'rgba(255, 252, 246, 0.0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(64, 256);
  ctx.bezierCurveTo(45, 200, 38, 140, 52, 80);
  ctx.bezierCurveTo(65, 40, 80, 20, 64, 0);
  ctx.bezierCurveTo(85, 30, 95, 70, 82, 120);
  ctx.bezierCurveTo(70, 170, 85, 220, 64, 256);
  ctx.closePath();
  ctx.fill();

  steamTexture = new THREE.CanvasTexture(canvas);
  configureTexture(steamTexture);
  return steamTexture;
}

/**
 * Creates rising steam plumes above the hot noodle cup:
 * Auto-animated in Three.js render loop via onBeforeRender.
 */
export function createSteamGroup(rTop, halfH, opts = {}) {
  const group = new THREE.Group();
  group.userData.isSteam = true;
  const materials = [];

  const count = (opts && opts.lowPoly) ? 3 : 5;
  const wisps = [];
  const map = getSteamTexture();

  for (let i = 0; i < count; i++) {
    const geo = new THREE.PlaneGeometry(0.35, 0.85);
    const mat = new THREE.MeshBasicMaterial({
      map,
      color: 0xFFFDF8,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    mat.userData = { baseOpacity: 0.24 };
    materials.push(mat);

    const mesh = new THREE.Mesh(geo, mat);
    const angle = (i / count) * Math.PI * 2;
    const radius = (0.08 + (i % 3) * 0.04) * rTop;
    const baseX = Math.cos(angle) * radius;
    const baseZ = Math.sin(angle) * radius + 0.15 * rTop; // bias towards opening

    mesh.userData = {
      baseX,
      baseZ,
      speed: 0.22 + (i % 3) * 0.08,
      offset: i / count,
      baseScale: 0.85 + (i % 2) * 0.3
    };
    wisps.push(mesh);
    group.add(mesh);
  }

  // Autonomous animation in standard Three.js render pass + explicit tickSteam hook
  group.userData.tickSteam = (timeSec) => {
    const time = (typeof timeSec === 'number')
      ? timeSec
      : ((typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001);
    const baseY = halfH + 0.02;
    for (let i = 0; i < wisps.length; i++) {
      const w = wisps[i];
      const u = w.userData;
      const cycle = ((time * u.speed + u.offset) % 1.0);
      w.position.y = baseY + cycle * 1.15;
      w.position.x = u.baseX + Math.sin(time * 1.6 + u.offset * 6.28) * 0.045;
      w.position.z = u.baseZ + Math.cos(time * 1.3 + u.offset * 6.28) * 0.045;

      const sc = u.baseScale * (0.8 + cycle * 1.35);
      w.scale.set(sc, sc * 1.45, sc);

      // Smooth rise envelope
      const alpha = Math.sin(cycle * Math.PI) * (1.0 - cycle * 0.35) * (w.material.userData.baseOpacity || 0.24);
      w.material.opacity = alpha;
    }
  };

  group.onBeforeRender = () => {
    group.userData.tickSteam();
  };

  return { group, materials };
}

/**
 * Pillow Pack geometry for rectangular instant noodle packages:
 * - Inflated center with realistic pillow curve.
 * - Crimped ends with zigzag border.
 * - Longitudinal rear fin seam.
 * - 15% darker flipped back face.
 */
export function createPackGeometry(aspect = 1.32, opts = {}) {
  const isLowPoly = Boolean(opts && opts.lowPoly);
  const w = 1.6;
  const h = w * (aspect || 1.32);
  const d = 0.46;

  const segX = isLowPoly ? 16 : 26;
  const segY = isLowPoly ? 18 : 30;
  const segZ = isLowPoly ? 4 : 8;

  const geo = new THREE.BoxGeometry(w, h, d, segX, segY, segZ);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  const halfD = d * 0.5;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const normX = x / halfW;
    const normY = y / halfH;
    const pillow = Math.max(0, 1 - normX * normX) * Math.max(0, 1 - normY * normY);

    if (Math.abs(z) > 0.001) {
      z = Math.sign(z) * (halfD * (0.24 + 0.76 * pillow));
    }

    const crimpDist = 0.15 * h;
    const topDist = halfH - y;
    const btmDist = y - (-halfH);

    if (topDist < crimpDist || btmDist < crimpDist) {
      const crimpFactor = 1 - Math.min(topDist, btmDist) / crimpDist;
      z *= (1 - crimpFactor * 0.86);
      const zigzag = Math.sin(normX * 36.0) * (0.018 * h * crimpFactor);
      y += (y > 0 ? zigzag : -zigzag);
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();

  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const v = (y + halfH) / h;
    let u;
    if (z >= 0) {
      u = (x + halfW) / w;
      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 1.0;
      colors[i * 3 + 2] = 1.0;
    } else {
      // Back face: flipped horizontal & 15% darker
      u = (halfW - x) / w;
      colors[i * 3 + 0] = 0.85;
      colors[i * 3 + 1] = 0.85;
      colors[i * 3 + 2] = 0.85;
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Inverted Hull Outline Material generator for thin & subtle palette rim (fresnel-like accent).
 * Strictly used for packs, never applied over open cup/bowl mouths or lids.
 */
export function createHoloRimOutline(mesh, rimColor, thickness = 0.012) {
  const geo = mesh.geometry.clone();
  const pos = geo.attributes.position;
  const normal = geo.attributes.normal;
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
  const mat = new THREE.MeshBasicMaterial({
    color: rimColor || new THREE.Color(0xffaa00),
    side: THREE.BackSide,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  mat.userData = { baseOpacity: 0.25 };
  const outlineMesh = new THREE.Mesh(geo, mat);
  outlineMesh.userData.isRim = true;
  mesh.add(outlineMesh);
  return { outlineMesh, mat };
}

/**
 * Builds a realistic 3D noodle product model from real data.
 * Supported options:
 * - withHoloRim: boolean (default true for pack; disabled on cups/bowls to keep lids and mouths clean)
 * - withContactGlow: boolean (default true)
 * - rimColor: THREE.Color
 * - peeledLid / open / openLid / peelLid: boolean (default true for cups/bowls when lid exists)
 * - steam: boolean (default false; when true, renders soft rising steam wisps)
 * - lowPoly: boolean (default false; optimizes polygon count for mobile)
 */
export function createRealProductModel(prod, opts = {}) {
  const root = new THREE.Group();
  root.userData.product = prod;

  const type = prod.type || 'pack';
  const isCupOrBowl = type === 'cup' || type === 'bowl';
  const isBowl = type === 'bowl';
  // Keep holo rim strictly for packs; cups and bowls have realistic rolled paper/plastic rims without neon wireframes
  const withRim = !isCupOrBowl && (opts.withHoloRim !== false);
  const rimColor = opts.rimColor || new THREE.Color(0xffb300);
  const isLowPoly = Boolean(opts && opts.lowPoly);

  const isOpenExplicitlyFalse = opts.open === false || opts.openLid === false || opts.peeledLid === false || opts.peelLid === false;
  const isOpenExplicitlyTrue = opts.open === true || opts.openLid === true || opts.peeledLid === true || opts.peelLid === true;
  const withPeeledLid = isCupOrBowl && Boolean(prod.lid) && (!isOpenExplicitlyFalse && (isOpenExplicitlyTrue || opts.peeledLid !== false));
  const withSteam = isCupOrBowl && Boolean(opts.steam);

  // Realistic PBR materials with clearcoat and authentic roughness
  let mainMat;
  if (type === 'pack') {
    // Glossy metallized polypropylene film packaging (OPP/MCPP)
    mainMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.26,
      metalness: 0.12,
      color: 0xffffff,
      clearcoat: 0.45,
      clearcoatRoughness: 0.22,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide,
      envMapIntensity: 0.75,
      vertexColors: true
    });
  } else if (type === 'bowl') {
    // Heat-resistant polypropylene (PP) plastic bowl with smooth sheen
    mainMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.32,
      metalness: 0.0,
      color: 0xffffff,
      clearcoat: 0.28,
      clearcoatRoughness: 0.28,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide,
      envMapIntensity: 0.6
    });
  } else {
    // Paper cup body with subtle wax/lacquer protective coating
    mainMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.38,
      metalness: 0.0,
      color: 0xffffff,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide,
      envMapIntensity: 0.55
    });
  }
  mainMat.userData = { isSolid: true, baseOpacity: 1.0 };

  const rimMaterials = [];
  const allMeshMats = [mainMat];

  if (isCupOrBowl) {
    const { geo, rTop, rBottom, halfH, totalHeight } = createCupOrBowlGeometry(prod.body, type, prod, { lowPoly: isLowPoly });
    root.userData.rawHeight = totalHeight;
    root.userData.rawWidth = (Math.max(rTop, rBottom) + 0.04) * 2;
    root.userData.type = type;

    const bodyMesh = new THREE.Mesh(geo, mainMat);
    root.add(bodyMesh);

    // Solid paper bottom cap so cups seen from below show authentic base
    const bottomGeo = new THREE.CircleGeometry(rBottom * 0.98, isLowPoly ? 20 : 36);
    const bottomMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.55,
      metalness: 0.0,
      color: (prod && prod.colors && prod.colors.main) ? prod.colors.main : 0xf5eedc,
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      envMapIntensity: 0.4
    });
    bottomMat.userData = { isSolid: true, baseOpacity: 1.0 };
    const bottomMesh = new THREE.Mesh(bottomGeo, bottomMat);
    bottomMesh.rotation.x = Math.PI / 2;
    bottomMesh.position.y = -halfH + 0.005;
    root.add(bottomMesh);
    allMeshMats.push(bottomMat);

    // Lid and internal noodle assembly
    if (prod.lid) {
      const lidTex = loadTexture(prod.lid);
      // For bowls, size lid snugly inside rim (0.94) to prevent any black alpha boundary; for cups, 0.985
      const lidRadius = isBowl ? (rTop * 0.94) : (rTop * 0.985);

      if (withPeeledLid) {
        // 1. Two-mesh flat foil lid (tấm phẳng bóc gập lên ~1 bên, KHÔNG phải vòm):
        // Mesh A: Top printed artwork (-lid.webp)
        // Mesh B: Underside shiny bright silver aluminum foil (MeshStandard color #d9d9d9, metalness 0.7, roughness 0.3)
        const { topGeo, underGeo } = createPeeledLidAssembly(lidRadius, { lowPoly: isLowPoly });

        // Printed top material
        const lidTopMat = new THREE.MeshStandardMaterial({
          roughness: 0.35,
          metalness: 0.5,
          color: 0xffffff,
          map: lidTex,
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
          side: THREE.FrontSide,
          envMapIntensity: 0.65
        });
        lidTopMat.userData = { isSolid: true, baseOpacity: 1.0 };
        allMeshMats.push(lidTopMat);

        const peeledLidTopMesh = new THREE.Mesh(topGeo, lidTopMat);
        peeledLidTopMesh.rotation.x = -Math.PI / 2;
        peeledLidTopMesh.position.y = halfH + 0.005;
        root.add(peeledLidTopMesh);

        // Underside metallic silver foil material (faces the camera when tilted up!)
        const foilUnderMat = new THREE.MeshStandardMaterial({
          color: 0xd9d9d9,
          roughness: 0.3,
          metalness: 0.7,
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
          side: THREE.FrontSide,
          envMapIntensity: 0.85
        });
        foilUnderMat.userData = { isSolid: true, baseOpacity: 1.0 };
        allMeshMats.push(foilUnderMat);

        const peeledLidUnderMesh = new THREE.Mesh(underGeo, foilUnderMat);
        peeledLidUnderMesh.rotation.x = -Math.PI / 2;
        peeledLidUnderMesh.position.y = halfH + 0.005;
        root.add(peeledLidUnderMesh);

        // 2. Realistic Noodle Assembly inside the cup:
        // lining, broth, curly noodles, shrimp, scallion, egg — clearly visible through the opening!
        const { group: noodleGroup, materials: noodleMats } = createNoodleAssembly(rTop, halfH, { lowPoly: isLowPoly });
        root.add(noodleGroup);
        root.userData.noodleAssembly = noodleGroup;
        noodleMats.forEach((m) => allMeshMats.push(m));
      } else {
        // Flat/convex closed lid: completely opaque, metalness ~0.5, roughness ~0.35
        const lidGeo = createLidGeometry(lidRadius, { lowPoly: isLowPoly });
        const lidMat = new THREE.MeshStandardMaterial({
          roughness: 0.35,
          metalness: 0.5,
          color: 0xffffff,
          map: lidTex,
          transparent: false,
          opacity: 1.0,
          depthWrite: true,
          side: THREE.FrontSide,
          envMapIntensity: 0.6
        });
        lidMat.userData = { isSolid: true, baseOpacity: 1.0 };
        allMeshMats.push(lidMat);

        const lidMesh = new THREE.Mesh(lidGeo, lidMat);
        lidMesh.rotation.x = -Math.PI / 2;
        lidMesh.position.y = halfH + 0.005;
        root.add(lidMesh);
      }
    }

    // Body Texture: full 360 wrap texture (or fallback wrap)
    const wrapTex = loadCupOrBowlWrapTexture(prod, () => {
      mainMat.needsUpdate = true;
    });
    mainMat.map = wrapTex;

    // 3. Optional Steam wisps (opts.steam)
    let createdSteamGroup = null;
    if (withSteam) {
      const { group: steamGroup, materials: steamMats } = createSteamGroup(rTop, halfH, { lowPoly: isLowPoly });
      root.add(steamGroup);
      root.userData.steamGroup = steamGroup;
      createdSteamGroup = steamGroup;
      steamMats.forEach((m) => allMeshMats.push(m));
    }

    root.userData.updateSteam = (timeSec) => {
      if (createdSteamGroup && typeof createdSteamGroup.userData.tickSteam === 'function') {
        createdSteamGroup.userData.tickSteam(timeSec);
      }
    };
    root.userData.tick = (timeSec) => {
      root.userData.updateSteam(timeSec);
    };
  } else {
    // Pack
    const aspect = (prod.h && prod.w) ? (prod.h / prod.w) : ((prod.body && prod.body.aspect) || 1.32);
    root.userData.rawHeight = 1.6 * aspect;
    root.userData.rawWidth = 1.6;
    root.userData.type = 'pack';

    const geo = createPackGeometry(aspect, { lowPoly: isLowPoly });
    const packMesh = new THREE.Mesh(geo, mainMat);
    root.add(packMesh);

    if (withRim) {
      const { mat } = createHoloRimOutline(packMesh, rimColor, 0.014);
      rimMaterials.push(mat);
    }

    if (prod.front) {
      const frontTex = loadTexture(prod.front);
      mainMat.map = frontTex;
    }
  }

  // Soft contact glow under the product
  const withGlow = opts.withContactGlow !== false;
  if (withGlow) {
    const isBowl = type === 'bowl';
    const isPack = type === 'pack';
    const glowW = isBowl ? 1.6 : (isPack ? 1.4 : 1.25);
    const glowD = isBowl ? 1.5 : (isPack ? 0.85 : 1.25);
    const { mesh: glowMesh, mat: glowMat } = createContactGlowMesh(rimColor, glowW, glowD);
    glowMesh.position.y = -root.userData.rawHeight * 0.5 - 0.02;
    root.add(glowMesh);
    root.userData.contactGlowMat = glowMat;
  }

  // Normalizes model bounding-box height to any target height
  root.userData.setTargetHeight = (targetH) => {
    const s = targetH / (root.userData.rawHeight || 1.8);
    root.scale.setScalar(s);
    return s;
  };

  if (!root.userData.updateSteam) {
    root.userData.updateSteam = () => {};
  }
  if (!root.userData.tick) {
    root.userData.tick = () => {};
  }

  root.userData.mainMat = mainMat;
  root.userData.rimMaterials = rimMaterials;
  root.userData.allMeshMats = allMeshMats;

  root.userData.updateRimColor = (newColor) => {
    rimMaterials.forEach((m) => {
      m.color.copy(newColor);
    });
    if (root.userData.contactGlowMat) {
      root.userData.contactGlowMat.color.copy(newColor);
    }
  };

  root.userData.setOpacity = (alpha) => {
    const isTrans = alpha < 0.999;
    allMeshMats.forEach((m) => {
      const baseOp = (m.userData && m.userData.baseOpacity !== undefined) ? m.userData.baseOpacity : 1.0;
      if (m.transparent !== isTrans && baseOp >= 0.999) {
        m.transparent = isTrans;
        m.needsUpdate = true;
      }
      // Preserve depthWrite: true on solid materials even while fading,
      // so inner surfaces and back faces are never rendered as ghostly x-ray!
      if (m.userData && m.userData.isSolid) {
        m.depthWrite = true;
      }
      m.opacity = alpha * baseOp;
    });
    rimMaterials.forEach((m) => {
      m.opacity = alpha * 0.25;
    });
    if (root.userData.contactGlowMat) {
      root.userData.contactGlowMat.opacity = alpha * 0.28;
    }
  };

  return root;
}
