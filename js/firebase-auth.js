// Firebase Auth — admin portal only. Split out of firebase-init.js so the
// customer storefront never downloads the auth SDK.
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { app } from "./firebase-init.js";

const auth = getAuth(app);

export { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut };
