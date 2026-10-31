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
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.isContactGlow = true;
  return { mesh, mat };
}

/**
 * Loads unrolled wrap texture for cups/bowls:
 * - If prod.wrap is defined, loads the official 360° unrolled label texture (assets/products/<id>-wrap.webp).
 * - Fallback: generates opaque 360° tileable wrap on 1024x512 canvas:
 *   - Solid brand background (prod.colors.main) to eliminate any black cutout wedges.
 *   - Top rim edge band (prod.colors.accent) and bottom foot band.
 *   - Front half (u: 0.0..0.5, pixels 0..512, centered at x=256 / u=0.25).
 *   - Right half (u: 0.5..1.0, pixels 512..1024, mirrored back face).
 *   - Cross-faded tileable seams at x=512 and x=0/1024.
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

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const mainColor = (prod.colors && prod.colors.main) || '#7F221E';
  const accentColor = (prod.colors && prod.colors.accent) || mainColor;

  // 1. Solid opaque brand background - NO TRANSPARENCY, NO BLACK WEDGE!
  ctx.fillStyle = mainColor;
  ctx.fillRect(0, 0, 1024, 512);

  // Top rim edge band (for rim lip)
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, 0, 1024, 16);

  // Bottom foot edge band
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

      // Re-fill solid brand background
      ctx.fillStyle = mainColor;
      ctx.fillRect(0, 0, 1024, 512);

      // Top rim & bottom bands
      ctx.fillStyle = accentColor;
      ctx.fillRect(0, 0, 1024, 16);
      ctx.fillStyle = mainColor;
      ctx.fillRect(0, 512 - 16, 1024, 16);

      // Draw front label cutout onto left half (centered at x=256, u=0.25)
      ctx.drawImage(img, 0, 0, iw, ih, pasteX, 0, drawW, drawH);

      // Mirror left half (0..512) to right half (512..1024)
      ctx.save();
      ctx.translate(1024, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(canvas, 0, 0, 512, 512, 0, 0, 512, 512);
      ctx.restore();

      // Smooth cross-fade blur at seams
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
 * Cup or Bowl Lathe Geometry
 */
export function createCupOrBowlGeometry(bodyData, type = 'cup', prod = null) {
  const topW = (bodyData && bodyData.topW) ? bodyData.topW : 0.92;
  const bottomW = (bodyData && bodyData.bottomW) ? bodyData.bottomW : 0.7;
  const isBowl = type === 'bowl';

  let aspect = (prod && prod.h && prod.w) ? (prod.h / prod.w) : (isBowl ? 0.86 : 1.33);
  let totalHeight = isBowl
    ? THREE.MathUtils.clamp(1.3 * (aspect / 0.86), 1.15, 1.55)
    : THREE.MathUtils.clamp(1.95 * (aspect / 1.33), 1.7, 2.3);

  const halfH = totalHeight * 0.5;
  // Authentic radius derived from product's actual aspect ratio and body proportions
  const rTop = isBowl
    ? (halfH / aspect) * (topW * 0.4 + 0.6)
    : (halfH / aspect) * (topW * 0.5 + 0.45);
  const rBottom = isBowl
    ? (halfH / aspect) * (bottomW * 0.4 + 0.4)
    : (halfH / aspect) * (bottomW * 0.5 + 0.35);

  const points = [];
  // 1. Recessed bottom center
  points.push(new THREE.Vector2(0.0, -halfH + 0.05));
  points.push(new THREE.Vector2(rBottom * 0.8, -halfH + 0.05));
  // 2. Bottom foot rim
  points.push(new THREE.Vector2(rBottom * 0.95, -halfH));
  points.push(new THREE.Vector2(rBottom, -halfH));
  // 3. Tapered body with gentle natural curve
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = -halfH + t * totalHeight;
    const belly = Math.sin(t * Math.PI) * (isBowl ? 0.08 : 0.03);
    const r = THREE.MathUtils.lerp(rBottom, rTop, t) + belly;
    points.push(new THREE.Vector2(r, y));
  }
  // 4. Curled outer lip at rim
  const rimR = rTop + 0.035;
  points.push(new THREE.Vector2(rimR, halfH - 0.02));
  points.push(new THREE.Vector2(rTop, halfH));
  // 5. Inward bevel
  points.push(new THREE.Vector2(rTop * 0.97, halfH - 0.02));

  // Lathe around Y axis starting at -Math.PI * 0.5:
  // u = 0.0 at left flank (-r, 0)
  // u = 0.25 at center front (0, +r, facing camera at rest)
  // u = 0.50 at right flank (+r, 0)
  // u = 0.75 at center back (0, -r)
  // u = 1.00 at left flank seam (-r, 0)
  const geo = new THREE.LatheGeometry(points, 48, -Math.PI * 0.5, Math.PI * 2);

  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;

  // v from curled rim lip down; clean label fills full height with <=2% top/bottom rim lips
  const rimBandHeight = 0.02 * totalHeight;
  const yRim = halfH - rimBandHeight;
  const yBottom = -halfH + 0.02 * totalHeight;

  for (let k = 0; k < pos.count; k++) {
    const y = pos.getY(k);
    let v;
    if (y >= yRim) {
      v = 0.99; // Top edge colour (rim lip)
    } else if (y <= yBottom) {
      v = 0.01; // Bottom edge colour
    } else {
      v = THREE.MathUtils.clamp((y - yBottom) / (yRim - yBottom), 0.01, 0.99);
    }
    uv.setY(k, v);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();

  return { geo, rTop, rBottom, halfH, totalHeight };
}

/**
 * Top paper / foil lid geometry with subtle convex bulge
 */
export function createLidGeometry(radius = 1.0) {
  const geo = new THREE.CircleGeometry(radius * 1.02, 40);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const dist = Math.hypot(x, y) / radius;
    const bulge = Math.max(0, 1 - dist * dist) * 0.04;
    pos.setZ(i, bulge);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Pillow Pack geometry for rectangular instant noodle packages
 * Includes crimped ends, zigzag border, and 15% darker flipped back face.
 */
export function createPackGeometry(aspect = 1.32) {
  const w = 1.6;
  const h = w * (aspect || 1.32);
  const d = 0.46;

  const geo = new THREE.BoxGeometry(w, h, d, 26, 30, 8);
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
 * Inverted Hull Outline Material generator for thin & subtle palette rim (fresnel-like accent)
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
  const outlineMesh = new THREE.Mesh(geo, mat);
  outlineMesh.userData.isRim = true;
  mesh.add(outlineMesh);
  return { outlineMesh, mat };
}

/**
 * Builds a realistic 3D noodle product model from real data with optional thin palette hologram rim.
 * Opaque bodies (transparent: false, depthWrite: true, FrontSide) to eliminate ghosting.
 */
export function createRealProductModel(prod, opts = {}) {
  const root = new THREE.Group();
  root.userData.product = prod;

  const type = prod.type || 'pack';
  const withRim = opts.withHoloRim !== false;
  const rimColor = opts.rimColor || new THREE.Color(0xffb300);

  // Opaque standard material with crisp saturation and controlled reflections
  const mainMat = new THREE.MeshStandardMaterial({
    roughness: 0.35,
    metalness: 0.0,
    color: 0xffffff,
    transparent: false,
    depthWrite: true,
    side: THREE.FrontSide,
    envMapIntensity: 0.55,
    vertexColors: type === 'pack'
  });

  const rimMaterials = [];
  const allMeshMats = [mainMat];

  if (type === 'cup' || type === 'bowl') {
    const { geo, rTop, rBottom, halfH, totalHeight } = createCupOrBowlGeometry(prod.body, type, prod);
    root.userData.rawHeight = totalHeight;
    root.userData.rawWidth = (Math.max(rTop, rBottom) + 0.035) * 2;
    root.userData.type = type;

    const bodyMesh = new THREE.Mesh(geo, mainMat);
    root.add(bodyMesh);

    if (withRim) {
      const { mat } = createHoloRimOutline(bodyMesh, rimColor, 0.012);
      rimMaterials.push(mat);
    }

    // Solid paper bottom cap so cups seen from below show authentic base
    const bottomGeo = new THREE.CircleGeometry(rBottom * 0.98, 36);
    const bottomMat = new THREE.MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0.0,
      color: (prod && prod.colors && prod.colors.main) ? prod.colors.main : 0xf5eedc,
      transparent: false,
      depthWrite: true,
      side: THREE.DoubleSide,
      envMapIntensity: 0.4
    });
    const bottomMesh = new THREE.Mesh(bottomGeo, bottomMat);
    bottomMesh.rotation.x = Math.PI / 2;
    bottomMesh.position.y = -halfH + 0.005;
    root.add(bottomMesh);
    allMeshMats.push(bottomMat);

    if (prod.lid) {
      const lidGeo = createLidGeometry(rTop);
      const lidMat = new THREE.MeshStandardMaterial({
        roughness: 0.4,
        metalness: 0.0,
        color: 0xffffff,
        transparent: false,
        depthWrite: true,
        side: THREE.FrontSide,
        envMapIntensity: 0.55
      });
      allMeshMats.push(lidMat);
      const lidTex = loadTexture(prod.lid);
      if (lidTex) lidMat.map = lidTex;
      const lidMesh = new THREE.Mesh(lidGeo, lidMat);
      lidMesh.rotation.x = -Math.PI / 2;
      lidMesh.position.y = halfH + 0.005;
      root.add(lidMesh);
    }

    // Body Texture: full 360 wrap texture (or fallback wrap)
    const wrapTex = loadCupOrBowlWrapTexture(prod, () => {
      mainMat.needsUpdate = true;
    });
    mainMat.map = wrapTex;
  } else {
    // Pack
    const aspect = (prod.h && prod.w) ? (prod.h / prod.w) : ((prod.body && prod.body.aspect) || 1.32);
    root.userData.rawHeight = 1.6 * aspect;
    root.userData.rawWidth = 1.6;
    root.userData.type = 'pack';

    const geo = createPackGeometry(aspect);
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
      if (m.transparent !== isTrans) {
        m.transparent = isTrans;
        m.needsUpdate = true;
      }
      m.opacity = alpha;
    });
    rimMaterials.forEach((m) => {
      m.opacity = alpha * 0.28;
    });
    if (root.userData.contactGlowMat) {
      root.userData.contactGlowMat.opacity = alpha * 0.28;
    }
  };

  return root;
}
