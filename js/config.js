// ============================================================
// SANDRAGON — Central Configuration
// Fill in the placeholder values before going live.
// ============================================================

// ---- Firebase project config (get from Firebase Console > Project Settings) ----
export const firebaseConfig = {
  apiKey: "AIzaSyB_MLu6BVdaLAEmezJzklL1u0V-sNXsiVI",
  authDomain: "sandragon-official.firebaseapp.com",
  projectId: "sandragon-official",
  storageBucket: "sandragon-official.firebasestorage.app",
  messagingSenderId: "129520923413",
  appId: "1:129520923413:web:0ebb06dea59f9bdc922f1c"
};

// ---- Cloudinary (unsigned upload preset for product images) ----
export const cloudinaryConfig = {
  cloudName: "ly0b9cqe",
  uploadPreset: "sandragon_unsigned" // create this in Cloudinary > Settings > Upload
};

// ---- Razorpay ----
export const razorpayConfig = {
  keyId: "YOUR_RAZORPAY_KEY_ID", // rzp_test_... or rzp_live_... (public key, safe on client)
  // The Key Secret NEVER goes here. It lives only in the Cloudflare Worker's
  // settings (see payment-worker/worker.js and the README).
  currency: "INR"
};

// ---- Payment server (Cloudflare Worker) ----
// The worker's address, e.g. "https://sandragon-pay.yourname.workers.dev"
// (no slash at the end). While this or the Key ID above is still a
// placeholder, checkout runs in demo mode with no real payment.
export const paymentServerUrl = "https://sandragon-pay.sandragonofficial.workers.dev";

// ---- Business details ----
export const business = {
  name: "SANDRAGON",
  email: "sandragonog@gmail.com",
  phonePrimary: "919791162430",   // WhatsApp + primary contact (91 + number, no +/spaces)
  phoneSecondary: "919025871881",
  instagram: "https://www.instagram.com/sandragonog",
  founder: "Shanmuganathan.K",
  // Vendor who prepares/packs the products — admin shares order details here
  vendorPhone: "91XXXXXXXXXX", // <-- set vendor's WhatsApp number
  address: "" // optional, shown in footer/invoice
};

// Admin login allow-list (Firebase Auth emails permitted into /admin)
export const adminEmails = [
  "sandragonofficial@gmail.com"
];
