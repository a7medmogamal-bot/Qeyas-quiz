/* ============================================================
   QeyasQuiz — Public Config Endpoint
   Path: /api/config
   Returns ONLY the values the browser needs.
   Never exposes secrets or AI provider info.
   ============================================================ */

export default function handler(req, res) {
  // No caching — config should always be fresh
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const {
    FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID,
    CLOUDINARY_CLOUD_NAME
  } = process.env;

  // Basic sanity check — fail loudly if public config is missing
  if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID || !CLOUDINARY_CLOUD_NAME) {
    console.error("[config] missing public env vars");
    return res.status(500).json({ error: "config_unavailable" });
  }

  res.status(200).json({
    firebase: {
      apiKey: FIREBASE_API_KEY,
      authDomain: FIREBASE_AUTH_DOMAIN,
      projectId: FIREBASE_PROJECT_ID,
      storageBucket: FIREBASE_STORAGE_BUCKET,
      messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
      appId: FIREBASE_APP_ID
    },
    upload: {
      cloudName: CLOUDINARY_CLOUD_NAME
    }
  });
}
