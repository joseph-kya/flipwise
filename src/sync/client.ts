/**
 * Firebase entry point. Only ever loaded with a dynamic import, so a signed-out first visit
 * never downloads Firebase.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore/lite';
import type { CloudAdapter } from './engine';
import type { FirebaseSetup } from './config';
import { firestoreAdapter } from './firestoreAdapter';

export interface AccountUser {
  uid: string;
  name: string;
  email: string;
  photoURL: string | null;
}

export interface FirebaseClient {
  onUser(cb: (user: AccountUser | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Error from a sign-in redirect that just returned, if any. */
  redirectError: Promise<string | null>;
  cloud: CloudAdapter;
}

let instance: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;

/** Detect installed display mode for callers that need installation-specific UI. */
export function isStandalonePwa(): boolean {
  try {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches === true;
  } catch {
    return false;
  }
}

const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);
const NEEDS_REDIRECT = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported']);

export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string } | null)?.code ?? '';
  if (code === 'auth/network-request-failed') return 'No connection. Try again when you’re online.';
  if (code === 'auth/unauthorized-domain') return 'This address isn’t authorised for sign-in.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Try again later.';
  return 'Sign-in failed. Please try again.';
}

export function createFirebaseClient(setup: FirebaseSetup): FirebaseClient {
  if (!instance) {
    const app = initializeApp(setup.config, 'flipwise');
    const auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    // Firestore Lite (REST, no cache): our IndexedDB outbox is the offline story, so no second local copy.
    const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
    if (setup.emulator) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    instance = { app, auth, db };
  }
  const { auth, db } = instance;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  return {
    onUser: (cb) =>
      onAuthStateChanged(auth, (u) =>
        cb(u ? { uid: u.uid, name: u.displayName ?? u.email ?? 'Signed in', email: u.email ?? '', photoURL: u.photoURL } : null),
      ),
    redirectError: getRedirectResult(auth).then(
      () => null,
      (e) => (SILENT.has((e as { code?: string })?.code ?? '') ? null : friendlyAuthError(e)),
    ),
    async signIn() {
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        const code = (e as { code?: string })?.code ?? '';
        if (SILENT.has(code)) throw new Error('Sign-in was cancelled. Please try again.');
        if (NEEDS_REDIRECT.has(code)) return signInWithRedirect(auth, provider);
        throw new Error(friendlyAuthError(e));
      }
    },
    signOut: () => fbSignOut(auth),
    cloud: firestoreAdapter(db),
  };
}
