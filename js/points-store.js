// SANDRAGON — purchase points (loyalty), set per product.
//
// Each product has two numbers, set in Admin → Products:
//   earnPoints   : points a customer earns for each one bought
//                  (10 → buying 2 earns 20)
//   redeemPoints : the most points a customer can use on each one
//                  (5 → up to ₹5 off each)
// 1 point = ₹1.
//
// Rules (unchanged): an order that uses a coupon can't use points and earns
// none; an order paid partly with points earns none. Points are credited when
// the admin marks the order Confirmed.
import { db, doc, getDoc } from "./firebase-init.js";

export const POINT_VALUE = 1; // ₹ per point

// Kept for older callers: the programme is always on, 1 point = ₹1.
export const DEFAULT_POINTS = { enabled: true, pointValue: POINT_VALUE };
export function getCachedPointsConfig() { return { ...DEFAULT_POINTS }; }
export async function getPointsConfig() { return { ...DEFAULT_POINTS }; }

const whole = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

// Points set on a product (or a cart item copied from it), per item.
export function earnPointsOf(p) { return whole(p?.earnPoints); }
export function redeemPointsOf(p) { return whole(p?.redeemPoints); }

// Totals for a list of cart items ({ earnPoints, redeemPoints, qty }).
export function earnForItems(items) {
  return (items || []).reduce((s, i) => s + earnPointsOf(i) * (Number(i.qty) || 0), 0);
}
export function redeemCapForItems(items) {
  return (items || []).reduce((s, i) => s + redeemPointsOf(i) * (Number(i.qty) || 0), 0);
}

export function pointsToRupees(points) {
  return Math.round((Number(points) || 0) * POINT_VALUE);
}

// Customer's current balance straight from Firestore (never trust a cached copy for money).
export async function fetchPointsBalance(phone) {
  if (!phone) return 0;
  try {
    const snap = await getDoc(doc(db, 'customers', phone));
    return snap.exists() ? Math.max(0, Number(snap.data().pointsBalance) || 0) : 0;
  } catch (err) {
    console.warn('Could not load points balance', err);
    return 0;
  }
}

export function pointsRuleText() {
  return 'Each product shows the points it earns and how many points you can use on it. 1 point = ₹1.';
}
