/**
 * Storage layer — backed by Firebase Firestore.
 *
 * This is the shared "database" for the app: every location reads and writes to the
 * same Firestore project, so data stays in sync across devices in real time (well,
 * as soon as each screen re-fetches — see the note in App.jsx's useSharedState if you
 * want live push updates instead of fetch-on-load).
 *
 * The app only ever uses 5 keys, all stored as one document each in the "supplyData"
 * collection: items, checks, shipments, queue, lists. Each document just holds the
 * same JSON string the rest of the app already works with, so nothing in App.jsx
 * needed to change to use this.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAhYZppB6ZvhhHjNTUCExMsutwecOEo2P4",
  authDomain: "mann-ortho---supply.firebaseapp.com",
  projectId: "mann-ortho---supply",
  storageBucket: "mann-ortho---supply.firebasestorage.app",
  messagingSenderId: "691046914486",
  appId: "1:691046914486:web:4a3c38430d79a231acc917",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COLLECTION = "supplyData";

export async function getValue(key, shared = true) {
  const ref = doc(db, COLLECTION, key);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return data && data.value !== undefined ? data.value : null;
}

export async function setValue(key, value, shared = true) {
  const ref = doc(db, COLLECTION, key);
  await setDoc(ref, { value, updatedAt: Date.now() });
  return { key, value, shared };
}
