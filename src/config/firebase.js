/**
 * Firebase Admin SDK configuration for FCM (Firebase Cloud Messaging).
 *
 * Supports two ways to provide credentials:
 * 1. GOOGLE_APPLICATION_CREDENTIALS - path to a service account JSON file
 * 2. FIREBASE_SERVICE_ACCOUNT_JSON - raw JSON string (e.g. in env or secret manager)
 *
 * For production, prefer GOOGLE_APPLICATION_CREDENTIALS with a mounted secret path,
 * or FIREBASE_SERVICE_ACCOUNT_JSON from your secret manager (never commit the JSON).
 */

import { readFileSync } from 'fs';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let messagingInstance = null;

/**
 * Returns Firebase Messaging instance. Initializes the app once.
 * @returns {import('firebase-admin').messaging.Messaging | null} Messaging instance or null if not configured
 */
function getFirebaseMessaging() {
  if (messagingInstance !== null) {
    return messagingInstance;
  }

  if (getApps().length > 0) {
    messagingInstance = getMessaging();
    return messagingInstance;
  }

  const credentials = resolveCredentials();
  if (!credentials) {
    return null;
  }

  try {
    initializeApp({ credential: cert(credentials) });
    messagingInstance = getMessaging();
    return messagingInstance;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Firebase initialization failed:', err.message);
    return null;
  }
}

/**
 * Resolves credentials from environment.
 * @returns {object | null} Service account object or null
 */
function resolveCredentials() {
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonEnv) {
    try {
      return typeof jsonEnv === 'string' ? JSON.parse(jsonEnv) : jsonEnv;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON');
      return null;
    }
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    try {
      const raw = readFileSync(credPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load GOOGLE_APPLICATION_CREDENTIALS:', e.message);
      return null;
    }
  }

  return null;
}

/**
 * Check if FCM is available (credentials configured).
 * @returns {boolean}
 */
function isFCMAvailable() {
  return getFirebaseMessaging() !== null;
}

export { getFirebaseMessaging, isFCMAvailable };
