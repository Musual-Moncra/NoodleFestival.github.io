/**
 * Mì Gói Festival — UI interactions
 * Handles:
 * - Theme toggle & persistence (localStorage 'mgf-theme', prefers-color-scheme, CustomEvent 'themechange')
 * - Navigation drawer toggle (#navToggle <-> #siteNav .is-open, aria-expanded, ESC/link close)
 * - Countdown timer ([data-countdown] -> [data-unit=days|hours|mins|secs], zero-padded, clamp 0)
 * - IntersectionObserver reveal animations (.reveal -> .is-visible, sibling index transition-delay)
 * - Hologram 3D card tilt & glare (.holo-card pointermove --mx, --my, --rx, --ry, respects pointer & reduced motion)
 * - Site header elevation (.is-scrolled on scroll > 20px)
 * - Nav scrollspy (highlight the nav link of the section currently in view)
 */

(function () {
  'use strict';

  /* -------------------------------------------------------------------------- */
  /* 1. Theme & Palette Management                                              */
  /* -------------------------------------------------------------------------- */
  const THEME_KEY = 'mgf-theme';
  const PALETTE_KEY = 'mgf-palette';
  const themeToggleBtn = document.getElementById('themeToggle');
  const paletteButtons = document.querySelectorAll('.palette-switch [data-palette-option]');

  function getCurrentTheme() {
    const root = document.documentElement;
    let theme = root.getAttribute('data-theme');
    if (theme === 'dark' || theme === 'light') return theme;
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  function getCurrentPalette() {
    const root = document.documentElement;
    let palette = root.getAttribute('data-palette');
    if (palette === 'orange' || palette === 'green' || palette === 'pink') return palette;
    try {
      const saved = localStorage.getItem(PALETTE_KEY);
      if (saved === 'orange' || saved === 'green' || saved === 'pink') return saved;
    } catch (e) {}
    return 'orange';
  }

  function syncPaletteButtons(activePalette) {
    paletteButtons.forEach(function (btn) {
      const opt = btn.getAttribute('data-palette-option');
      const isSelected = opt === activePalette;
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  }

  function applyThemeAndPalette(theme, palette, persistTheme, persistPalette) {
    const root = document.documentElement;
    if (theme) {
      root.setAttribute('data-theme', theme);
      if (persistTheme) {
        try {
          localStorage.setItem(THEME_KEY, theme);
        } catch (e) {}
      }
    }
    if (palette) {
      root.setAttribute('data-palette', palette);
      syncPaletteButtons(palette);
      if (persistPalette) {
        try {
          localStorage.setItem(PALETTE_KEY, palette);
        } catch (e) {}
      }
    }

    const currentT = root.getAttribute('data-theme') || 'dark';
    const currentP = root.getAttribute('data-palette') || 'orange';

    window.dispatchEvent(
      new CustomEvent('themechange', {
        detail: { theme: currentT, palette: currentP }
      })
    );
  }

  // Initial sync of button states
  syncPaletteButtons(getCurrentPalette());

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function () {
      const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      applyThemeAndPalette(nextTheme, null, true, false);
    });
  }

  paletteButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const chosen = btn.getAttribute('data-palette-option');
      if (chosen) {
        applyThemeAndPalette(null, chosen, false, true);
      }
    });
  });

  // Follow system theme changes only if user hasn't set an explicit preference
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = function (e) {
      let hasSaved = false;
      try {
        hasSaved = !!localStorage.getItem(THEME_KEY);
      } catch (err) {}

      if (!hasSaved) {
        applyThemeAndPalette(e.matches ? 'dark' : 'light', null, false, false);
      }
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleSystemThemeChange);
    }
  }

  /* -------------------------------------------------------------------------- */
  /* 2. Navigation Mobile Drawer                                                */
  /* -------------------------------------------------------------------------- */
  const navToggleBtn = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');

  function setNavOpen(open) {
    if (!siteNav || !navToggleBtn) return;
    siteNav.classList.toggle('is-open', open);
    navToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (navToggleBtn && siteNav) {
    navToggleBtn.addEventListener('click', function () {
      const isOpen = siteNav.classList.contains('is-open');
      setNavOpen(!isOpen);
    });

    // Close when clicking nav links
    siteNav.addEventListener('click', function (e) {
      const link = e.target.closest('a');
      if (link) {
        setNavOpen(false);
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (siteNav.classList.contains('is-open')) {
          setNavOpen(false);
          navToggleBtn.focus();
        }
      }
    });
  }

  /* -------------------------------------------------------------------------- */
  /* 3. Countdown Timer                                                         */
  /* -------------------------------------------------------------------------- */
  const countdownElements = document.querySelectorAll('[data-countdown]');

  function updateCountdowns() {
    const now = Date.now();

    countdownElements.forEach(function (el) {
      const targetStr = el.getAttribute('data-countdown');
      if (!targetStr) return;

      const targetTime = new Date(targetStr).getTime();
      if (isNaN(targetTime)) return;

      let diff = Math.max(0, targetTime - now);

      const secondsTotal = Math.floor(diff / 1000);
      const days = Math.floor(secondsTotal / 86400);
      const hours = Math.floor((secondsTotal % 86400) / 3600);
      const mins = Math.floor((secondsTotal % 3600) / 60);
      const secs = secondsTotal % 60;

      const pad = function (num) {
        return String(num).padStart(2, '0');
      };

      const daysEl = el.querySelector('[data-unit="days"]');
      const hoursEl = el.querySelector('[data-unit="hours"]');
      const minsEl = el.querySelector('[data-unit="mins"]');
      const secsEl = el.querySelector('[data-unit="secs"]');

      if (daysEl) daysEl.textContent = pad(days);
      if (hoursEl) hoursEl.textContent = pad(hours);
      if (minsEl) minsEl.textContent = pad(mins);
      if (secsEl) secsEl.textContent = pad(secs);
    });
  }

  if (countdownElements.length > 0) {
    updateCountdowns();
    setInterval(updateCountdowns, 1000);
  }

  /* -------------------------------------------------------------------------- */
  /* 4. IntersectionObserver: Reveal Elements with Stagger                      */
  /* -------------------------------------------------------------------------- */
  const reveals = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && reveals.length > 0) {
    // Group sibling reveals or calculate stagger index relative to parent container
    reveals.forEach(function (el) {
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.prototype.filter.call(parent.children, function (child) {
          return child.classList.contains('reveal');
        });
        if (siblings.length > 1) {
          const index = siblings.indexOf(el);
          // Stagger siblings by index up to max 300ms (e.g., 60ms * index, capped at 300ms)
          const delay = Math.min(300, index * 75);
          if (delay > 0) {
            el.style.transitionDelay = delay + 'ms';
          }
        }
      }
    });

    const observer = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            const target = entry.target;
            target.classList.add('is-visible');
            obs.unobserve(target);

            // Clean up inline transitionDelay after reveal animation finishes
            // so subsequent interactions (like .holo-card hover & 3D tilt) don't lag
            const rawDelay = parseFloat(target.style.transitionDelay) || 0;
            const cleanupMs = rawDelay + 700;

            const handleTransitionEnd = function (e) {
              if (e.target === target && (e.propertyName === 'opacity' || e.propertyName === 'transform')) {
                target.style.transitionDelay = '';
                target.removeEventListener('transitionend', handleTransitionEnd);
              }
            };
            target.addEventListener('transitionend', handleTransitionEnd);

            setTimeout(function () {
              target.style.transitionDelay = '';
              target.removeEventListener('transitionend', handleTransitionEnd);
            }, cleanupMs);
          }
        });
      },
      {
        rootMargin: '0px 0px -50px 0px',
        threshold: 0.1
      }
    );

    reveals.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // Fallback if IntersectionObserver is not supported
    reveals.forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  /* -------------------------------------------------------------------------- */
  /* 5. Holo Card Tilt & Glare                                                  */
  /* -------------------------------------------------------------------------- */
  const holoCards = document.querySelectorAll('.holo-card');

  const canTilt = function () {
    const hasCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return !hasCoarse && !reducedMotion;
  };

  holoCards.forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      if (!canTilt()) return;

      const rect = card.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Mouse percent within card (0% to 100%)
      const mx = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const my = Math.max(0, Math.min(100, (y / rect.height) * 100));

      // Normalized coordinates (-1 to 1)
      const nx = (x / rect.width - 0.5) * 2;
      const ny = (y / rect.height - 0.5) * 2;

      // Max tilt angle = 10deg
      // Tilting on X axis rotates around horizontal line (up/down mouse movement -> rx)
      // Tilting on Y axis rotates around vertical line (left/right mouse movement -> ry)
      const maxTilt = 10;
      const rx = -(ny * maxTilt);
      const ry = nx * maxTilt;

      card.style.setProperty('--mx', mx.toFixed(2) + '%');
      card.style.setProperty('--my', my.toFixed(2) + '%');
      card.style.setProperty('--rx', rx.toFixed(2) + 'deg');
      card.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    });

    const resetTilt = function () {
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '50%');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    };

    card.addEventListener('pointerleave', resetTilt);
    card.addEventListener('pointercancel', resetTilt);
  });

  /* -------------------------------------------------------------------------- */
  /* 6. Header Scroll Elevation                                                 */
  /* -------------------------------------------------------------------------- */
  const siteHeader = document.querySelector('.site-header');

  if (siteHeader) {
    const handleScroll = function () {
      if (window.scrollY > 20) {
        siteHeader.classList.add('is-scrolled');
      } else {
        siteHeader.classList.remove('is-scrolled');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
  }

  /* -------------------------------------------------------------------------- */
  /* 7. Nav Scrollspy                                                           */
  /* -------------------------------------------------------------------------- */
  const navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.site-nav a[href^="#"]')
  );
  const spySections = navLinks
    .map(function (link) {
      var id = link.getAttribute('href').slice(1);
      return document.getElementById(id);
    })
    .filter(Boolean);

  if ('IntersectionObserver' in window && spySections.length > 0) {
    var currentSpyId = null;
    var spyObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          currentSpyId = entry.target.id;
          navLinks.forEach(function (link) {
            var active = link.getAttribute('href') === '#' + currentSpyId;
            link.classList.toggle('is-active', active);
          });
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );
    spySections.forEach(function (sec) { spyObserver.observe(sec); });

    window.addEventListener('scroll', function () {
      if (window.scrollY < 80 && currentSpyId !== null) {
        currentSpyId = null;
        navLinks.forEach(function (link) { link.classList.remove('is-active'); });
      }
    }, { passive: true });
  }
})();
