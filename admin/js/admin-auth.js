import { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "../../js/firebase-init.js";
import { adminEmails } from "../../js/config.js";

const loginBtn = document.getElementById('loginBtn');
const errorMsg = document.getElementById('errorMsg');

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    errorMsg.style.display = 'none';
    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (!adminEmails.includes(email)) {
        await signOut(auth);
        throw new Error('This account is not authorized for admin access.');
      }
      window.location.href = 'dashboard.html';
    } catch (err) {
      errorMsg.textContent = err.message.replace('Firebase: ', '');
      errorMsg.style.display = 'block';
    }
  });
}

// Guard: call this at the top of every protected admin page
export function requireAdmin(callback) {
  onAuthStateChanged(auth, (user) => {
    if (!user || !adminEmails.includes(user.email)) {
      window.location.href = 'login.html';
    } else {
      callback(user);
    }
  });
}

export function setupLogoutButton() {
  const btn = document.getElementById('logoutBtn');
  if (btn) {
    btn.addEventListener('click', async () => {
      await signOut(auth);
      window.location.href = 'login.html';
    });
  }
}
