import * as THREE from 'three';
import { getCssColor } from './hero3d.js';

/**
 * Procedural Pop-Art 3D Noodle Pack pillow geometry with crimped zigzag edges.
 */
function createPillowPackGeometry(w = 1.6, h = 2.15, d = 0.52, segW = 24, segH = 30, segD = 8) {
  const geo = new THREE.BoxGeometry(w, h, d, segW, segH, segD);
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
      z = Math.sign(z) * (halfD * (0.22 + 0.78 * pillow));
    }

    const crimpDist = 0.16 * h;
    const topDist = halfH - y;
    const btmDist = y - (-halfH);

    if (topDist < crimpDist || btmDist < crimpDist) {
      const crimpFactor = 1 - Math.min(topDist, btmDist) / crimpDist;
      z *= (1 - crimpFactor * 0.88);
      const zigzag = Math.sin(normX * 32.0) * (0.02 * h * crimpFactor);
      y += (y > 0 ? zigzag : -zigzag);
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();

  // Correct UV orientation on front face (+Z) so label reads left-to-right
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > halfD * 0.1) {
      const u = (pos.getX(i) + halfW) / w;
      const v = (pos.getY(i) + halfH) / h;
      uv.setXY(i, u, v);
    }
  }
  uv.needsUpdate = true;

  return geo;
}

/**
 * 3-step toon ramp texture for MeshToonMaterial.
 */
function createToonRamp() {
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

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

const TOON_RAMP = createToonRamp();

/**
 * Generates high-res pop-art label texture for an instant noodle pack.
 */
function createFlavorLabelTexture(flavorText, baseColorHex, accentColorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Background base
  ctx.fillStyle = baseColorHex;
  ctx.fillRect(0, 0, 512, 512);

  // Pop-art angled dynamic stripes
  ctx.fillStyle = accentColorHex;
  ctx.beginPath();
  ctx.moveTo(0, 60);
  ctx.lineTo(512, 140);
  ctx.lineTo(512, 200);
  ctx.lineTo(0, 120);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.lineTo(512, 420);
  ctx.lineTo(512, 470);
  ctx.lineTo(0, 410);
  ctx.closePath();
  ctx.fill();

  // Center Pop-Art Emblem badge
  ctx.fillStyle = '#FFF8F0';
  ctx.beginPath();
  ctx.arc(256, 256, 175, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = baseColorHex;
  ctx.beginPath();
  ctx.arc(256, 256, 155, 0, Math.PI * 2);
  ctx.fill();

  // Top header text
  ctx.fillStyle = '#FFC800';
  ctx.font = '900 36px "Bungee", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MÌ GÓI FEST', 256, 175);

  // Big flavor name badge
  ctx.fillStyle = '#FFF8F0';
  ctx.fillRect(76, 225, 360, 72);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1A0600';
  ctx.strokeRect(76, 225, 360, 72);

  ctx.fillStyle = '#1A0600';
  ctx.font = '900 42px "Bungee", system-ui, sans-serif';
  ctx.fillText(flavorText.toUpperCase(), 256, 264);

  // Instant Noodle Bowl Icon
  ctx.fillStyle = '#FFC800';
  ctx.beginPath();
  ctx.arc(256, 345, 45, 0, Math.PI);
  ctx.fill();
  ctx.fillRect(226, 340, 60, 6);

  // Chopsticks
  ctx.strokeStyle = '#FFF8F0';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(215, 325);
  ctx.lineTo(295, 305);
  ctx.moveTo(215, 332);
  ctx.lineTo(295, 312);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

// Inverted Hull Outline
function applyOutline(mesh, outlineColorHex = '#140602', thickness = 0.045) {
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
    color: new THREE.Color(outlineColorHex),
    side: THREE.BackSide,
    transparent: true,
    opacity: 1.0,
    depthWrite: false
  });
  const outlineMesh = new THREE.Mesh(geo, mat);
  mesh.add(outlineMesh);
  return mat;
}

// --- Main Shared 3D Packs System ---

let isPacks3DInitialized = false;

export function initPacks3D() {
  if (isPacks3DInitialized) return;
  const flavorsSection = document.getElementById('flavors');
  const packCards = Array.from(document.querySelectorAll('.pack-grid .pack'));
  if (!flavorsSection || packCards.length === 0) return;
  isPacks3DInitialized = true;

  // Single shared WebGLRenderer positioned over the section or full viewport
  // We attach a full-size canvas covering the #flavors grid or create lightweight individual canvases.
  // Using lightweight individual canvas per .pack-art (exactly 4 cards) guarantees 100% pixel-perfect
  // alignment with cards at any scroll position, resize, or zoom.
  const cardsData = [];

  packCards.forEach((card, idx) => {
    const artEl = card.querySelector('.pack-art');
    const spanEl = card.querySelector('.pack-art span');
    if (!artEl) return;

    const flavorName = spanEl ? spanEl.textContent.trim() : `Vị ${idx + 1}`;

    // Read --pack color on this card via probe
    function getCardPackColor() {
      const probe = document.createElement('div');
      probe.style.display = 'none';
      card.appendChild(probe);
      probe.style.color = 'var(--pack)';
      const computed = getComputedStyle(probe).color;
      card.removeChild(probe);
      return computed || '#FF5A00';
    }

    // Canvas container
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '4';
    artEl.appendChild(canvas);

    // Hide original flat CSS mockup elements visually, but keep span accessible
    if (spanEl) {
      spanEl.style.opacity = '0';
      spanEl.style.pointerEvents = 'none';
    }
    artEl.style.background = 'transparent';
    artEl.style.border = 'none';
    artEl.style.boxShadow = 'none';
    artEl.classList.add('has-3d-pack');

    // Create Three.js mini scene for this card
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 0, 3.8);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    // Toon lighting
    const ambLight = new THREE.AmbientLight(0xffffff, 1.25);
    scene.add(ambLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(4, 5, 5);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0xffc800, 1.2);
    rimLight.position.set(-4, -3, -3);
    scene.add(rimLight);

    // Build Pop-Art 3D Pack Mesh
    const packGeo = createPillowPackGeometry(1.4, 1.85, 0.46, 24, 28, 8);
    const initialPackColor = getCardPackColor();
    const initialTex = createFlavorLabelTexture(flavorName, initialPackColor, '#E10600');

    const packMat = new THREE.MeshToonMaterial({
      map: initialTex,
      color: 0xffffff,
      gradientMap: TOON_RAMP,
      transparent: true
    });

    const packMesh = new THREE.Mesh(packGeo, packMat);
    scene.add(packMesh);

    const outlineMat = applyOutline(packMesh, '#120400', 0.04);

    // Pointer hover interaction
    const pointer = { targetX: 0, targetY: 0, currentX: 0, currentY: 0, isHovered: false };

    card.addEventListener('pointerenter', () => {
      pointer.isHovered = true;
    });

    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const normY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      pointer.targetX = normX * 0.45;
      pointer.targetY = normY * 0.35;
    });

    card.addEventListener('pointerleave', () => {
      pointer.isHovered = false;
      pointer.targetX = 0;
      pointer.targetY = 0;
    });

    cardsData.push({
      card,
      artEl,
      flavorName,
      canvas,
      renderer,
      scene,
      camera,
      packMesh,
      packMat,
      outlineMat,
      pointer,
      getCardPackColor,
      phaseOffset: idx * 1.5
    });
  });

  // Handle Resize
  function onResize() {
    cardsData.forEach((item) => {
      const rect = item.artEl.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      item.camera.aspect = w / h;
      item.camera.updateProjectionMatrix();
      item.renderer.setSize(w, h, false);
    });
  }
  window.addEventListener('resize', onResize);
  onResize();

  // Theme & Palette update listener
  function updateAllPacksTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const goldColor = getCssColor('--gold', '#FFC800');

    cardsData.forEach((item) => {
      const packCol = item.getCardPackColor();
      const newTex = createFlavorLabelTexture(item.flavorName, packCol, isLight ? '#C2005A' : '#FF5A00');
      if (item.packMat.map) item.packMat.map.dispose();
      item.packMat.map = newTex;
      item.packMat.needsUpdate = true;

      item.outlineMat.color.set(isLight ? '#280800' : '#100400');
      item.outlineMat.needsUpdate = true;
    });
  }
  window.addEventListener('themechange', updateAllPacksTheme);

  // IntersectionObserver to pause rendering when #flavors is out of view
  let isSectionVisible = true;
  let isTabActive = !document.hidden;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        isSectionVisible = entry.isIntersecting;
      });
    },
    { threshold: 0.05 }
  );
  observer.observe(flavorsSection);

  document.addEventListener('visibilitychange', () => {
    isTabActive = !document.hidden;
  });

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();

  function render() {
    requestAnimationFrame(render);
    if (!isSectionVisible || !isTabActive) return;

    const time = clock.getElapsedTime();

    cardsData.forEach((item) => {
      const { pointer, packMesh, renderer, scene, camera, phaseOffset } = item;

      // Pointer lerp
      pointer.currentX += (pointer.targetX - pointer.currentX) * 0.08;
      pointer.currentY += (pointer.targetY - pointer.currentY) * 0.08;

      if (!prefersReducedMotion) {
        // Normal state: slow rotation + gentle bobbing
        // Hover state: faster spin + tilt towards pointer
        const spinSpeed = pointer.isHovered ? 2.2 : 0.65;
        const bobAmount = pointer.isHovered ? 0.08 : 0.05;

        packMesh.rotation.y = (time * spinSpeed + phaseOffset) % (Math.PI * 2) + pointer.currentX * 0.5;
        packMesh.rotation.x = Math.sin(time * 1.5 + phaseOffset) * 0.08 - pointer.currentY * 0.45;
        packMesh.rotation.z = Math.cos(time * 1.2 + phaseOffset) * 0.05;
        packMesh.position.y = Math.sin(time * 2.0 + phaseOffset) * bobAmount;
      } else {
        packMesh.rotation.set(0.1, 0.25, 0);
        packMesh.position.set(0, 0, 0);
      }

      renderer.render(scene, camera);
    });
  }

  render();
}

// Auto-boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPacks3D);
} else {
  initPacks3D();
}
