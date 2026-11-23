/** Which way can this browser install Flipwise? Pure, so every platform is unit-testable. */
export type InstallMethod = 'installed' | 'prompt' | 'ios' | 'safari-mac' | 'firefox' | 'other';

export interface InstallEnv {
  userAgent: string;
  maxTouchPoints: number;
  /** display-mode: standalone, or iOS navigator.standalone */
  standalone: boolean;
  /** a beforeinstallprompt event was captured (Chrome/Edge on Mac, Windows, Linux, Android) */
  hasPrompt: boolean;
  /** appinstalled fired in this session */
  installed: boolean;
}

export function installMethod(env: InstallEnv): InstallMethod {
  if (env.standalone || env.installed) return 'installed';
  if (env.hasPrompt) return 'prompt';
  const ua = env.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1); // iPadOS says "Mac"
  if (iOS) return 'ios';
  const chromium = /Chrome|Chromium|CriOS|Edg\/|OPR\//.test(ua);
  if (/Firefox|FxiOS/.test(ua)) return 'firefox';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !chromium) return 'safari-mac';
  return 'other';
}

export const INSTALL_HELP: Record<Exclude<InstallMethod, 'installed' | 'prompt'>, { title: string; steps: string[] }> = {
  'safari-mac': {
    title: 'Add Flipwise to your Dock',
    steps: ['In Safari, choose File › Add to Dock.', 'Click Add. Flipwise opens in its own window, like any Mac app.'],
  },
  ios: {
    title: 'Add Flipwise to your Home Screen',
    steps: ['Tap the Share button in Safari.', 'Choose Add to Home Screen, then Add.'],
  },
  firefox: {
    title: 'Install from another browser',
    steps: ['Firefox can’t install web apps.', 'Open this page in Chrome, Edge or Safari and choose Install app there.'],
  },
  other: {
    title: 'Install Flipwise',
    steps: ['Look for the install icon at the right of the address bar,', 'or open the browser menu and choose Install Flipwise (in Edge: Apps › Install this site as an app).'],
  },
};
