const functions = require("firebase-functions");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const cors = require("cors")({ origin: true });

// Set these with:
//   firebase functions:config:set razorpay.key_id="rzp_live_xxx" razorpay.key_secret="xxx"
const RAZORPAY_KEY_ID = functions.config().razorpay?.key_id;
const RAZORPAY_KEY_SECRET = functions.config().razorpay?.key_secret;

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

// Creates a Razorpay order server-side. The frontend never sees the key_secret.
exports.createRazorpayOrder = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { amount } = req.body; // amount in INR rupees
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }
      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100), // paise
        currency: "INR",
        receipt: `sandragon_${Date.now()}`
      });
      res.status(200).json(order);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Could not create order" });
    }
  });
});

// Verifies the payment signature Razorpay returns after checkout completes.
exports.verifyRazorpayPayment = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      const expectedSignature = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      const valid = expectedSignature === razorpay_signature;
      res.status(200).json({ valid });
    } catch (err) {
      console.error(err);
      res.status(500).json({ valid: false, error: "Verification failed" });
    }
  });
});
