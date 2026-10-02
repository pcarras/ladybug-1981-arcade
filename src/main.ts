/**
 * Application entry point for Lady Bug Arcade.
 * Wires Phaser game, PWA auto-update, auto-fullscreen, responsive scaling,
 * virtual arcade controls, and the Global Hall of Fame.
 */
import Phaser from 'phaser';
import './style.css';
import { assetUrl } from './game/assets';
import { FONT, SCREEN } from './game/layout/screenLayout';
import { GameScene } from './game/scenes/GameScene';
import { setupHallOfFameUi } from './game/leaderboard/hallOfFame';

export const APP_VERSION = 'v0.2.0';

function installArcadeFontCss(fontUrl: string): void {
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: '${FONT.family}';
      src: url('${fontUrl}') format('truetype');
      font-weight: 400;
      font-style: normal;
      font-display: block;
    }
  `;
  document.head.appendChild(style);
}

async function loadArcadeFont(): Promise<void> {
  const fontUrl = assetUrl('assets/fonts/PressStart2P-Regular.ttf');
  installArcadeFontCss(fontUrl);

  if (!('fonts' in document) || !('FontFace' in window)) {
    return;
  }

  try {
    const arcadeFont = new FontFace(FONT.family, `url('${fontUrl}') format('truetype')`);
    const loadedFont = await arcadeFont.load();
    document.fonts.add(loadedFont);
    await document.fonts.load(`${FONT.topSizePx}px ${FONT.family}`);
    await document.fonts.ready;
  } catch (error) {
    console.warn('[LadyBugWeb] Could not load arcade HUD font.', error);
  }
}

function usesNativePixelScale(): boolean {
  return new URLSearchParams(window.location.search).has('native');
}

/**
 * Checks for Service Worker updates on start and when window regains focus.
 * When a new version is detected, downloads and reloads automatically with a toast notification.
 */
function registerServiceWorkerWithAutoUpdate(): void {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');
        console.log(`[LadyBug PWA ${APP_VERSION}] Service Worker active:`, reg.scope);

        // Always check for latest version on startup
        void reg.update();

        // Listen for new version updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              const toast = document.getElementById('update-toast');
              if (toast) {
                toast.textContent = `NOVA VERSÃO ${APP_VERSION} DETETADA! A ATUALIZAR...`;
                toast.classList.remove('hidden');
              }
              newWorker.postMessage({ action: 'skipWaiting' });
            }
          });
        });
      } catch (err) {
        console.warn('[LadyBug PWA] Service Worker failed:', err);
      }
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // Also check for updates when user switches back to this tab/app
    window.addEventListener('focus', () => {
      void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
    });
  }
}

/**
 * Automatically triggers fullscreen on the very first touch/click gesture on screen.
 */
function enableAutoFullscreenOnFirstTouch(): void {
  const enterFs = (e: MouseEvent | TouchEvent | PointerEvent) => {
    // Don't auto-fullscreen if tapping UI buttons
    if ((e.target as HTMLElement)?.closest('button, input, select')) return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  window.addEventListener('pointerdown', enterFs, { once: true });
}

function setupArcadeInterface(): void {
  // CRT filter toggle
  const crtOverlay = document.getElementById('crt-overlay');
  const btnCrt = document.getElementById('btn-crt');
  const toggleCrt = () => {
    if (!crtOverlay || !btnCrt) return;
    const isActive = crtOverlay.classList.toggle('crt-active');
    btnCrt.textContent = isActive ? 'CRT: ON' : 'CRT: OFF';
  };
  btnCrt?.addEventListener('click', toggleCrt);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') toggleCrt();
  });

  // Fullscreen button
  const btnFullscreen = document.getElementById('btn-fullscreen');
  btnFullscreen?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Controls visibility toggle
  const controls = document.getElementById('arcade-virtual-controls');
  const btnPad = document.getElementById('btn-pad-toggle');
  btnPad?.addEventListener('click', () => {
    if (!controls || !btnPad) return;
    const isHidden = controls.classList.toggle('controls-hidden');
    btnPad.textContent = isHidden ? 'PAD: OFF' : 'PAD: ON';
  });

  // PWA Install prompt handler
  let deferredPrompt: any = null;
  const btnInstall = document.getElementById('btn-install');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (btnInstall) btnInstall.style.display = 'block';
  });
  btnInstall?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted' && btnInstall) {
      btnInstall.style.display = 'none';
    }
    deferredPrompt = null;
  });

  // Virtual D-Pad buttons
  const directions: Array<{ id: string; dir: 'up' | 'down' | 'left' | 'right' }> = [
    { id: 'dpad-up', dir: 'up' },
    { id: 'dpad-down', dir: 'down' },
    { id: 'dpad-left', dir: 'left' },
    { id: 'dpad-right', dir: 'right' },
  ];

  for (const { id, dir } of directions) {
    const btn = document.getElementById(id);
    if (!btn) continue;

    const handlePress = (e: Event) => {
      e.preventDefault();
      btn.classList.add('pressed');
      window.dispatchEvent(new CustomEvent('ladybug-virtual-direction', { detail: { dir } }));
    };

    const handleRelease = (e: Event) => {
      e.preventDefault();
      btn.classList.remove('pressed');
    };

    btn.addEventListener('touchstart', handlePress, { passive: false });
    btn.addEventListener('touchend', handleRelease, { passive: false });
    btn.addEventListener('mousedown', handlePress);
    btn.addEventListener('mouseup', handleRelease);
    btn.addEventListener('mouseleave', handleRelease);
  }

  // Start / Tap button
  const btnStart = document.getElementById('arcade-btn-start');
  const triggerStart = () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' }));
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    }
  };

  btnStart?.addEventListener('click', triggerStart);
  btnStart?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    triggerStart();
  }, { passive: false });
}

/**
 * Creates the Phaser game once the arcade font is ready enough for the HUD.
 */
async function bootstrap(): Promise<void> {
  registerServiceWorkerWithAutoUpdate();
  enableAutoFullscreenOnFirstTouch();
  setupArcadeInterface();
  setupHallOfFameUi();

  const app = document.querySelector<HTMLDivElement>('#app') ?? document.body;
  const container = document.createElement('div');
  const nativePixelScale = usesNativePixelScale();

  document.body.classList.toggle('native-pixel-scale', nativePixelScale);

  container.id = 'game-container';
  app.appendChild(container);

  await loadArcadeFont();

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: SCREEN.width,
    height: SCREEN.height,
    backgroundColor: '#000000',
    pixelArt: true,
    roundPixels: true,
    input: {
      gamepad: true,
    },
    scale: {
      mode: nativePixelScale ? Phaser.Scale.NONE : Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [GameScene],
  });
}

void bootstrap();
