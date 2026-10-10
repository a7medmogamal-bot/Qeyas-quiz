import crypto from "crypto";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  if (!apiSecret || !apiKey || !cloudName) {
    console.error("[signature] missing env vars");
    return res.status(500).json({ error: "server_config_error" });
  }

  const rawFolder = String(req.body?.folder || "qeyasquiz");
  const folder = rawFolder.replace(/[^a-zA-Z0-9_/\-]/g, "").slice(0, 200) || "qeyasquiz";
  const timestamp = Math.round(Date.now() / 1000);

  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = crypto
    .createHash("sha1")
    .update(paramsToSign + apiSecret)
    .digest("hex");

  res.status(200).json({
    signature,
    timestamp,
    folder,
    apiKey,
    cloudName
  });
}
