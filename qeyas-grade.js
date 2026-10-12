/* ============================================================
   QeyasQuiz — AI Grading Endpoint (Server-side)
   Path: /api/ai/qeyas-grade
   Never exposes the AI provider to the client
   ============================================================ */

import crypto from "crypto";

/* ============================================================
   CONFIG
   ============================================================ */
const MODEL = process.env.AI_GRADING_MODEL || "gemini-3-flash-preview";
const MAX_ESSAYS_PER_REQUEST = 400;
const MAX_OUTPUT_TOKENS = 16000;
const MAX_INPUT_CHARS = 500_000;

const AI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Vercel config — زيادة الوقت الأقصى
export const config = { maxDuration: 60 };

/* ============================================================
   RESPONSE SCHEMA (lowercase types — متوافق مع Gemini 3)
   ============================================================ */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          attemptId: { type: "string" },
          questionScores: {
            type: "array",
            items: {
              type: "object",
              properties: {
                questionId: { type: "string" },
                score: { type: "number" },
                note: { type: "string" }
              },
              required: ["questionId", "score"]
            }
          }
        },
        required: ["attemptId", "questionScores"]
      }
    }
  },
  required: ["scores"]
};

/* ============================================================
   HELPERS
   ============================================================ */
function nowIso() { return new Date().toISOString(); }
function clampString(v, max) {
  const s = String(v ?? "");
  return s.length > max ? s.slice(0, max) : s;
}
function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ============================================================
   GOOGLE PUBLIC CERTIFICATES
   ============================================================ */
const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cachedCerts = null;
let cachedCertsExpiry = 0;

async function getGooglePublicKeys() {
  const now = Date.now();
  if (cachedCerts && now < cachedCertsExpiry) return cachedCerts;

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error("GOOGLE_CERTS_FETCH_FAILED");

  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) * 1000 : 3600000;

  cachedCerts = await res.json();
  cachedCertsExpiry = now + maxAge;
  return cachedCerts;
}

function base64UrlDecode(str) {
  let base64 = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  return Buffer.from(base64, "base64").toString("utf-8");
}

/* ============================================================
   AUTH — Verify Firebase ID Token
   ============================================================ */
async function verifyIdToken(idToken, projectId) {
  if (!idToken || typeof idToken !== "string") return null;

  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]));
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch { return null; }

  // audience
  if (payload.aud !== projectId) return null;

  // issuer
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;

  // sub
  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length < 10) return null;

  // exp
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return null;

  // iat
  if (typeof payload.iat === "number" && payload.iat * 1000 > Date.now() + 60_000) return null;

  // auth_time (optional)
  if (typeof payload.auth_time === "number" && payload.auth_time * 1000 > Date.now() + 60_000) return null;

  // signature
  let certs;
  try { certs = await getGooglePublicKeys(); }
  catch { return null; }

  const cert = certs[header.kid];
  if (!cert) return null;

  const signingInput = parts[0] + "." + parts[1];
  const signature = parts[2];
  const sigBuf = Buffer.from(
    String(signature).replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  );

  let isValid = false;
  try {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(signingInput);
    isValid = verifier.verify(cert, sigBuf);
  } catch { return null; }

  if (!isValid) return null;

  return {
    uid: payload.user_id || payload.sub || null,
    email: payload.email || null
  };
}

/* ============================================================
   FIRESTORE REST — Read/Write
   ============================================================ */
async function readCreditDoc(uid, idToken, projectId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/userCredits/${uid}`;

  let res;
  try {
    res = await fetch(url, { headers: { "Authorization": `Bearer ${idToken}` } });
  } catch { return null; }

  if (res.status === 404) {
    return { balance: 0, totalAdded: 0, totalSpent: 0, _exists: false, _updateTime: null };
  }

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (!data || !data.fields) return null;

  const f = data.fields;
  return {
    balance: safeNumber(f.balance?.integerValue, 0),
    totalAdded: safeNumber(f.totalAdded?.integerValue, 0),
    totalSpent: safeNumber(f.totalSpent?.integerValue, 0),
    _exists: true,
    _updateTime: data.updateTime || null
  };
}

async function writeCreditDeduction(uid, idToken, projectId, newBalance, newTotalSpent, expectedUpdateTime) {
  let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/userCredits/${uid}` +
    `?updateMask.fieldPaths=balance&updateMask.fieldPaths=totalSpent&updateMask.fieldPaths=updatedAt`;

  if (expectedUpdateTime) {
    url += `&currentDocument.updateTime=${encodeURIComponent(expectedUpdateTime)}`;
  }

  const body = {
    fields: {
      balance: { integerValue: String(newBalance) },
      totalSpent: { integerValue: String(newTotalSpent) },
      updatedAt: { timestampValue: nowIso() }
    }
  };

  let res;
  try {
    res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch { return { ok: false, conflict: false }; }

  if (res.status === 409 || res.status === 412) {
    return { ok: false, conflict: true };
  }

  if (!res.ok) return { ok: false, conflict: false };

  return { ok: true, conflict: false };
}

async function writeCreditTransaction(idToken, projectId, txData) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/creditTransactions`;

  const fields = {
    uid: { stringValue: txData.uid },
    type: { stringValue: "spend" },
    amount: { integerValue: String(-txData.amount) },
    source: { stringValue: "ai_grade_batch" },
    note: { stringValue: txData.note || "تصحيح AI" },
    balanceAfter: { integerValue: String(txData.balanceAfter) },
    examId: { stringValue: txData.examId || "" },
    attemptsCount: { integerValue: String(txData.attemptsCount || 0) },
    questionsCount: { integerValue: String(txData.questionsCount || 0) },
    createdAt: { timestampValue: nowIso() }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });
    return res.ok;
  } catch { return false; }
}

/* ============================================================
   PROMPT BUILDER
   ============================================================ */
function buildPrompt(examTitle, questions, submissions) {
  const lines = [];

  lines.push("أنت مصحح امتحانات خبير ودقيق.");
  lines.push("مهمتك: تصحيح الإجابات المقالية بموضوعية وإنصاف.");
  lines.push("");
  lines.push("قواعد:");
  lines.push("- صحح كل إجابة على حدة.");
  lines.push("- الدرجة من 0 إلى الدرجة الكاملة للسؤال.");
  lines.push("- يمكن إعطاء درجات كسرية (2.5، 3.75، إلخ).");
  lines.push("- كن عادلا: لا تظلم الطالب ولا تتساهل.");
  lines.push("- اعتمد على الإجابة النموذجية عند وجودها.");
  lines.push("- أضف ملاحظة قصيرة (سطر واحد) لكل إجابة.");
  lines.push("");
  lines.push(`=== الامتحان: ${examTitle || "بدون اسم"} ===`);
  lines.push("");
  lines.push("=== الأسئلة ===");

  questions.forEach((q, i) => {
    lines.push(`[س${i + 1}] id="${q.id}" - الدرجة الكاملة: ${q.score}`);
    if (q.header) lines.push(`رأس السؤال: ${clampString(q.header, 300)}`);
    lines.push(`نص السؤال: ${clampString(q.text, 1000)}`);
    if (q.modelAnswer) lines.push(`الإجابة النموذجية: ${clampString(q.modelAnswer, 2000)}`);
    if (q.justificationModelAnswer) lines.push(`التبرير النموذجي: ${clampString(q.justificationModelAnswer, 1500)}`);
    lines.push("");
  });

  lines.push("=== إجابات الطلاب ===");

  submissions.forEach((sub, i) => {
    lines.push(`[الطالب ${i + 1}] attemptId="${sub.attemptId}" - الاسم: ${clampString(sub.studentName, 100) || "-"}`);
    (sub.answers || []).forEach((ans) => {
      const q = questions.find((x) => x.id === ans.questionId);
      if (!q) return;

      let answerText;
      if (q.type === "essay") {
        answerText = clampString(ans.text, 3000) || "(لا إجابة)";
      } else {
        const mcqPart = ans.selectedIndex != null
          ? (q.options?.[ans.selectedIndex] || `الخيار ${ans.selectedIndex}`)
          : (ans.boolValue === true ? "صح" : ans.boolValue === false ? "خطأ" : "(لا إجابة)");
        const justifPart = clampString(ans.text, 2000) || "(لا تبرير)";
        answerText = `[الإجابة: ${mcqPart}] - [التبرير: ${justifPart}]`;
      }

      lines.push(`- ${q.id}: ${answerText}`);
    });
    lines.push("");
  });

  lines.push("=== المطلوب ===");
  lines.push("أعط النتيجة بصيغة JSON مطابقة للمخطط المحدد.");
  lines.push("لكل طالب: attemptId + قائمة questionScores (كل عنصر فيه questionId + score + note).");

  return lines.join("\n");
}

/* ============================================================
   INPUT VALIDATION
   ============================================================ */
function validateInput(body) {
  if (!body || typeof body !== "object") return "invalid_body";
  const { questions, submissions } = body;
  if (!Array.isArray(questions) || questions.length === 0) return "invalid_questions";
  if (!Array.isArray(submissions) || submissions.length === 0) return "invalid_submissions";

  const totalEssays = questions.length * submissions.length;
  if (totalEssays > MAX_ESSAYS_PER_REQUEST) return "too_many_essays";

  for (const q of questions) {
    if (!q.id || !q.text) return "invalid_question_data";
    if (!Number.isFinite(Number(q.score)) || Number(q.score) <= 0) return "invalid_question_score";
  }
  for (const s of submissions) {
    if (!s.attemptId || !Array.isArray(s.answers)) return "invalid_submission_data";
  }
  return null;
}

/* ============================================================
   MAIN HANDLER
   ============================================================ */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // Origin check
  const origin = req.headers.origin || "";
  const allowed = process.env.ALLOWED_ORIGIN || "";
  if (allowed && origin && origin !== allowed) {
    console.warn("[ai] forbidden origin:", origin);
    return res.status(403).json({ error: "forbidden_origin" });
  }

  const AI_KEY = process.env.AI_GRADING_KEY;
  const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;

  if (!AI_KEY || !PROJECT_ID) {
    console.error("[ai] missing env vars");
    return res.status(500).json({ error: "server_config_error" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }

  const authHeader = String(req.headers.authorization || "");
  const idToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!idToken) return res.status(401).json({ error: "unauthorized" });

  const user = await verifyIdToken(idToken, PROJECT_ID);
  if (!user || !user.uid) return res.status(401).json({ error: "unauthorized" });

  const validationErr = validateInput(body);
  if (validationErr) return res.status(400).json({ error: validationErr });

  const { examId = "", examTitle = "", questions, submissions } = body;

  // SERVER-SIDE cost calculation (لا يثق في الـ client)
  const totalEssays = questions.length * submissions.length;
  const cost = Math.max(1, Math.ceil(totalEssays / 10));

  // Read credits
  const credit = await readCreditDoc(user.uid, idToken, PROJECT_ID);
  if (!credit) return res.status(500).json({ error: "credit_read_failed" });

  if (credit.balance < cost) {
    return res.status(402).json({
      error: "insufficient_credits",
      balance: credit.balance,
      required: cost
    });
  }

  // Build prompt
  const prompt = buildPrompt(examTitle, questions, submissions);
  if (prompt.length > MAX_INPUT_CHARS) {
    return res.status(400).json({
      error: "input_too_large",
      limit: MAX_INPUT_CHARS,
      received: prompt.length
    });
  }

  // DEDUCT credits BEFORE AI call (with optimistic lock)
  const newBalance = Math.max(0, credit.balance - cost);
  const newTotalSpent = credit.totalSpent + cost;

  const deductionResult = await writeCreditDeduction(
    user.uid, idToken, PROJECT_ID,
    newBalance, newTotalSpent,
    credit._updateTime
  );

  if (!deductionResult.ok) {
    if (deductionResult.conflict) {
      return res.status(409).json({ error: "credit_conflict_retry" });
    }
    return res.status(500).json({ error: "credit_deduction_failed" });
  }

  // Helper: refund on AI failure
  const refund = async () => {
    try {
      const fresh = await readCreditDoc(user.uid, idToken, PROJECT_ID);
      if (!fresh) return;
      const refundBalance = (fresh.balance || 0) + cost;
      const refundSpent = Math.max(0, (fresh.totalSpent || 0) - cost);
      await writeCreditDeduction(user.uid, idToken, PROJECT_ID, refundBalance, refundSpent, fresh._updateTime);
    } catch (err) { console.warn("[ai] refund failed:", err.message); }
  };

  // Call AI
  const endpoint = `${AI_ENDPOINT_BASE}/${MODEL}:generateContent?key=${AI_KEY}`;

  const aiRequestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.9,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };

  let aiRes;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);
    aiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiRequestBody),
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (err) {
    console.error("[ai] network/timeout:", err.message);
    await refund();
    return res.status(502).json({ error: "ai_service_error" });
  }

  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => "");
    console.error("[ai] rejected:", aiRes.status, errText.slice(0, 500));

    await refund();

    if (aiRes.status === 429) {
      const retryAfter = parseInt(aiRes.headers.get("retry-after") || "30", 10);
      return res.status(429).json({ error: "quota_exceeded", retryAfter: Number.isFinite(retryAfter) ? retryAfter : 30 });
    }
    if (aiRes.status === 400 || aiRes.status === 422) {
      return res.status(400).json({ error: "ai_bad_request" });
    }
    return res.status(502).json({ error: "ai_service_error" });
  }

  const aiData = await aiRes.json().catch(() => null);
  if (!aiData) { await refund(); return res.status(502).json({ error: "ai_empty_response" }); }

  const candidate = aiData.candidates?.[0];
  if (!candidate) {
    console.error("[ai] no candidate:", JSON.stringify(aiData).slice(0, 300));
    await refund();
    return res.status(502).json({ error: "ai_empty_response" });
  }

  const textPart = candidate.content?.parts?.[0]?.text;
  if (!textPart) {
    console.error("[ai] no text part");
    await refund();
    return res.status(502).json({ error: "ai_empty_response" });
  }

  let parsed;
  try { parsed = JSON.parse(textPart); }
  catch (err) {
    console.error("[ai] bad JSON:", textPart.slice(0, 300));
    await refund();
    return res.status(502).json({ error: "ai_bad_format" });
  }

  const rawScores = Array.isArray(parsed?.scores) ? parsed.scores : [];
  if (!rawScores.length) { await refund(); return res.status(502).json({ error: "ai_no_scores" }); }

  // Sanitize
  const cleanScores = [];
  for (const item of rawScores) {
    if (!item || typeof item !== "object") continue;
    if (!item.attemptId || !Array.isArray(item.questionScores)) continue;

    const questionScores = [];
    for (const qs of item.questionScores) {
      if (!qs || !qs.questionId) continue;
      const q = questions.find((x) => x.id === qs.questionId);
      if (!q) continue;

      let score = safeNumber(qs.score, 0);
      const max = safeNumber(q.score, 1);
      if (score < 0) score = 0;
      if (score > max) score = max;

      questionScores.push({
        questionId: qs.questionId,
        score,
        note: clampString(qs.note || "", 300)
      });
    }

    if (questionScores.length) {
      cleanScores.push({ attemptId: item.attemptId, questionScores });
    }
  }

  if (!cleanScores.length) { await refund(); return res.status(502).json({ error: "ai_no_valid_scores" }); }

  // Log transaction
  await writeCreditTransaction(idToken, PROJECT_ID, {
    uid: user.uid,
    amount: cost,
    balanceAfter: newBalance,
    note: `تصحيح ${submissions.length} ورقة × ${questions.length} سؤال`,
    examId,
    attemptsCount: submissions.length,
    questionsCount: questions.length
  });

  const usage = aiData.usageMetadata || {};

  return res.status(200).json({
    success: true,
    scores: cleanScores,
    credits: {
      used: cost,
      balanceBefore: credit.balance,
      balanceAfter: newBalance
    },
    tokens: {
      input: safeNumber(usage.promptTokenCount, 0),
      output: safeNumber(usage.candidatesTokenCount, 0),
      total: safeNumber(usage.totalTokenCount, 0)
    }
  });
}
