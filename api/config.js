/* ============================================================
   QeyasQuiz — Public Config Endpoint
   Path: /api/config
   Returns ONLY the values the browser needs.
   Never exposes secrets or AI provider info.
   ============================================================ */

export default function handler(req, res) {
  // CORS — اسمح بالطلبات من نفس الدومين فقط
  const origin = req.headers.origin || "";
  const allowed = process.env.ALLOWED_ORIGIN || "";
  if (allowed && origin && origin !== allowed) {
    return res.status(403).json({ error: "forbidden_origin" });
  }

  // Method check
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // No caching — config should always be fresh
  res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

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
  if (
    !FIREBASE_API_KEY ||
    !FIREBASE_AUTH_DOMAIN ||
    !FIREBASE_PROJECT_ID ||
    !FIREBASE_APP_ID ||
    !CLOUDINARY_CLOUD_NAME
  ) {
    console.error("[config] missing public env vars:", {
      hasApiKey: !!FIREBASE_API_KEY,
      hasAuthDomain: !!FIREBASE_AUTH_DOMAIN,
      hasProjectId: !!FIREBASE_PROJECT_ID,
      hasAppId: !!FIREBASE_APP_ID,
      hasCloudName: !!CLOUDINARY_CLOUD_NAME
    });
    return res.status(500).json({ error: "config_unavailable" });
  }

  res.status(200).json({
    firebase: {
      apiKey: FIREBASE_API_KEY,
      authDomain: FIREBASE_AUTH_DOMAIN,
      projectId: FIREBASE_PROJECT_ID,
      storageBucket: FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: FIREBASE_MESSAGING_SENDER_ID || "",
      appId: FIREBASE_APP_ID
    },
    upload: {
      cloudName: CLOUDINARY_CLOUD_NAME,
      preset: "qeyasquiz_unsigned"
    }
  });
}
