/** Firebase web config from Vite env. Returns null (account UI hidden, Firebase never loaded) if incomplete. */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface FirebaseSetup {
  config: FirebaseWebConfig;
  /** Talk to local emulators (auth :9099, firestore :8080). Only via VITE_FIREBASE_EMULATOR=1. */
  emulator: boolean;
}

type Env = Record<string, string | boolean | undefined>;

export function firebaseSetup(env: Env = import.meta.env as Env): FirebaseSetup | null {
  const emulator = env.VITE_FIREBASE_EMULATOR === '1' || env.VITE_FIREBASE_EMULATOR === 'true';
  const pick = (k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');
  const config: FirebaseWebConfig = {
    apiKey: pick('VITE_FIREBASE_API_KEY'),
    authDomain: pick('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: pick('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: pick('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: pick('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: pick('VITE_FIREBASE_APP_ID'),
  };
  if (emulator) {
    // Emulators accept any key; a demo- project id guarantees the real project is never touched.
    return {
      emulator,
      config: { ...config, apiKey: config.apiKey || 'demo-key', authDomain: '127.0.0.1', projectId: 'demo-flipwise', appId: config.appId || 'demo-app' },
    };
  }
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) return null;
  return { config, emulator };
}
