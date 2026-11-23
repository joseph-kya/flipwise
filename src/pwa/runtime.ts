/**
 * PWA runtime: captures install events as early as possible, registers the service worker in
 * production builds only, and exposes install + update state to React (useSyncExternalStore).
 */
import { installMethod, type InstallMethod } from './install';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState { install: InstallMethod; updateReady: boolean }

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let waiting: ServiceWorker | null = null;
let state: PwaState;
const listeners = new Set<() => void>();

const standalone = () => {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch { return false; }
};

function compute(): PwaState {
  return {
    install: installMethod({
      userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0,
      standalone: standalone(), hasPrompt: !!deferred, installed,
    }),
    updateReady: !!waiting,
  };
}
function emit() { state = compute(); listeners.forEach((l) => l()); }

export const pwa = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  getSnapshot: () => state,
  /** Chrome/Edge: show the browser's own install dialog. Returns true if the user accepted. */
  async promptInstall(): Promise<boolean> {
    const event = deferred;
    if (!event) return false;
    deferred = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    emit();
    return outcome === 'accepted';
  },
  /** Activate the waiting service worker; the page reloads once it controls the page. */
  applyUpdate() {
    if (!waiting) return location.reload();
    waiting.postMessage({ type: 'SKIP_WAITING' });
  },
};

if (typeof window !== 'undefined') {
  state = compute();
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BeforeInstallPromptEvent; emit(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; emit(); });
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const base = import.meta.env.BASE_URL;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then((reg) => {
        const watch = (worker: ServiceWorker | null) => {
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) { waiting = worker; emit(); }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) { waiting = reg.waiting; emit(); }
        reg.addEventListener('updatefound', () => watch(reg.installing));
        // Look for a new build when the app comes back to the foreground, and hourly.
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update().catch(() => undefined); });
        setInterval(() => void reg.update().catch(() => undefined), 60 * 60_000);
      }).catch(() => undefined);
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !waiting) return; // first install claims the page silently; only updates reload
        reloading = true;
        location.reload();
      });
    });
  }
} else {
  state = { install: 'other', updateReady: false };
}
