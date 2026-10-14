// Shared Firebase app + Firestore initialization (modular SDK via CDN).
// Storefront pages only need Firestore, so Firebase Auth lives in its own
// module (js/firebase-auth.js) that only the admin portal loads. That keeps
// roughly 100 KB of auth code off every customer page navigation.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc,
  deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
  increment, runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

import { firebaseConfig } from "./config.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export {
  app, db,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
  increment, runTransaction
};
