import { initHero3D } from './hero3d.js';
import { initSide3D } from './side3d.js';
import { initPacks3D } from './packs3d.js';

function boot() {
  initHero3D();
  initSide3D();
  initPacks3D();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
