import { db, doc, getDoc, setDoc, serverTimestamp } from "./firebase-init.js";

const SESSION_KEY = 'sandragon_customer';

export function getCustomer() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistLocal(customer) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(customer));
}

export function clearCustomer() {
  localStorage.removeItem(SESSION_KEY);
}

export function isLoggedIn() {
  return !!getCustomer();
}

// Creates a brand new account, or updates an existing one if the phone
// number already has a record (used both for signup and profile edits).
export async function saveCustomer({ name, phone, email, address, pincode }) {
  const ref = doc(db, 'customers', phone);
  let createdAt = serverTimestamp();
  try {
    const existing = await getDoc(ref);
    if (existing.exists() && existing.data().createdAt) {
      createdAt = existing.data().createdAt;
    }
  } catch (err) {
    console.warn('Could not check for existing customer record', err);
  }
  const payload = { name, phone, email: email || '', address: address || '', pincode: pincode || '', createdAt, updatedAt: serverTimestamp() };
  await setDoc(ref, payload, { merge: true });
  const local = { name, phone, email: email || '', address: address || '', pincode: pincode || '' };
  persistLocal(local);
  return local;
}

// Looks up an existing account by phone for the "Sign In" flow.
// Returns null if no account exists for that number.
export async function findCustomerByPhone(phone) {
  const ref = doc(db, 'customers', phone);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const local = { name: data.name || '', phone, email: data.email || '', address: data.address || '', pincode: data.pincode || '' };
  persistLocal(local);
  return local;
}
