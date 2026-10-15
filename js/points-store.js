// SANDRAGON — purchase points (loyalty) settings + helpers.
//
// Admin configures (Admin → Points), stored at settings/points:
//   enabled      : programme on/off
//   spendAmount  : every ₹X spent ...            (e.g. 100)
//   earnPoints   : ... earns Y points             (e.g. 10)
//   pointValue   : 1 point is worth ₹Z at checkout (e.g. 1)
//
// Earning: on the amount actually paid for items (after coupon and points,
// excluding delivery), counted in whole steps: ₹250 at 100→10 earns 20.
// Points are credited when the admin marks the order Confirmed.
//
// Redeeming: only on products the admin ticked "Points redeem applicable",
// and at most maxRedeemPercent of those products' value, rounded off
// (5% of ₹449 = ₹22.45 → 22 points). The rest is paid normally, and that
// payment earns new points like any other purchase.
import { db, doc, getDoc, setDoc } from "./firebase-init.js";
import { readCache, writeCache } from "./data-cache.js";

export const DEFAULT_POINTS = { enabled: false, spendAmount: 100, earnPoints: 10, pointValue: 1, maxRedeemPercent: 5 };

function normalize(d) {
  return {
    enabled: !!d?.enabled,
    spendAmount: Math.max(1, Number(d?.spendAmount) || DEFAULT_POINTS.spendAmount),
    earnPoints: Math.max(0, Number(d?.earnPoints) || 0),
    pointValue: Math.max(0, Number(d?.pointValue) || 0),
    // Most of an order's eligible value that points may pay for (e.g. 5%).
    // Older settings without this field get the 5% default.
    maxRedeemPercent: d?.maxRedeemPercent === undefined || d?.maxRedeemPercent === null || d?.maxRedeemPercent === ''
      ? DEFAULT_POINTS.maxRedeemPercent
      : Math.min(100, Math.max(0, Number(d.maxRedeemPercent) || 0))
  };
}

// Instant answer from cache when available (for rendering), fresh from Firestore otherwise.
export function getCachedPointsConfig() {
  const hit = readCache('points');
  return hit ? normalize(hit.v) : null;
}

export async function getPointsConfig() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'points'));
    const cfg = snap.exists() ? normalize(snap.data()) : { ...DEFAULT_POINTS };
    writeCache('points', cfg);
    return cfg;
  } catch (err) {
    console.error('Could not load points settings', err);
    return getCachedPointsConfig() || { ...DEFAULT_POINTS };
  }
}

export async function savePointsConfig(cfg) {
  const payload = normalize(cfg);
  await setDoc(doc(db, 'settings', 'points'), payload);
  writeCache('points', payload);
  return payload;
}

// Points earned for spending `amount` rupees (whole steps only).
export function pointsForAmount(amount, cfg) {
  if (!cfg?.enabled || !cfg.earnPoints) return 0;
  return Math.floor(Math.max(0, Number(amount) || 0) / cfg.spendAmount) * cfg.earnPoints;
}

// Rupee cap on points for an order: maxRedeemPercent of the eligible value, rounded off.
export function redeemCapRupees(eligibleAmount, cfg) {
  const pct = cfg?.maxRedeemPercent ?? DEFAULT_POINTS.maxRedeemPercent;
  return Math.max(0, Math.round((Number(eligibleAmount) || 0) * pct / 100));
}

export function pointsToRupees(points, cfg) {
  return Math.round((Number(points) || 0) * (cfg?.pointValue || 0));
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

// One-line plain-language rule, e.g. "Earn 10 points for every ₹100 you spend. 1 point = ₹1."
export function pointsRuleText(cfg) {
  const value = cfg.pointValue === 1 ? '₹1' : `₹${cfg.pointValue}`;
  return `Earn ${cfg.earnPoints} points for every ₹${cfg.spendAmount.toLocaleString('en-IN')} you spend. 1 point = ${value}.`;
}
