/* ============================================================
   QeyasQuiz — Application Logic (Arabic)
   Version: 2.0 — Role-based system (Teacher / Student)
   ============================================================ */

/* ============================================================
   CONFIG BOOTSTRAP
   ============================================================ */
let APP_CONFIG = null;

async function loadConfig() {
  if (APP_CONFIG) return APP_CONFIG;
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error("config fetch failed");
    APP_CONFIG = await res.json();
    if (!APP_CONFIG?.firebase?.apiKey) throw new Error("missing firebase config");
    if (!APP_CONFIG?.upload?.cloudName) throw new Error("missing upload config");
  } catch (err) {
    console.error("[config] failed:", err);
    document.body.innerHTML = `
      <div style="padding:40px;text-align:center;font-family:'IBM Plex Sans Arabic',sans-serif;direction:rtl">
        <h1 style="margin-bottom:16px">خطأ في إعداد التطبيق</h1>
        <p style="color:#666">تعذّر تحميل الإعدادات. يرجى تحديث الصفحة.</p>
      </div>`;
    throw err;
  }
  return APP_CONFIG;
}

/* ============================================================
   IMPORTS
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut as fbSignOut, onAuthStateChanged, setPersistence,
  browserLocalPersistence, updateProfile, sendPasswordResetEmail,
  EmailAuthProvider, reauthenticateWithCredential, deleteUser
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy, limit, getDocs,
  serverTimestamp, runTransaction, Timestamp, onSnapshot, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============================================================
   BOOT
   ============================================================ */
const cfg = await loadConfig();

const firebaseApp = initializeApp(cfg.firebase);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

setPersistence(auth, browserLocalPersistence).catch(() => {});

const UPLOAD = {
  cloudName: cfg.upload.cloudName,
  preset: "qeyasquiz_unsigned",
  avatarFolder: "qeyasquiz/avatars",
  questionFolder: "qeyasquiz/questions"
};

/* ============================================================
   CONSTANTS
   ============================================================ */
const SUPPORT_PHONE = "01016212814";
const SUPPORT_WHATSAPP = "201016212814";

const CREDIT_COIN_IMG = "https://i.ibb.co/WpcGCWFD/file-000000009804820a9c2e8456e982f039-removebg-preview.png";

const CREDIT_PACKS = {
  free:    { id: "free",    name: "Free",    credits: 10,   priceEGP: 0,    badge: null,              order: 1, description: "للتجربة" },
  plus:    { id: "plus",    name: "Plus",    credits: 500,  priceEGP: 200,  badge: "الأكثر اختيارًا", order: 2, description: "للمعلم المتوسط" },
  premium: { id: "premium", name: "Premium", credits: 2000, priceEGP: 700,  badge: null,              order: 3, description: "للمعلم المكثف" },
  school:  { id: "school",  name: "مدرسة",   credits: 6000, priceEGP: 1800, badge: null,              order: 4, description: "للمدارس والمعاهد" }
};

const AI_CONSTANTS = {
  MAX_ESSAYS_PER_REQUEST: 400,
  MAX_CONCURRENT_AI: 3,
  QUEUE_POLL_INTERVAL: 3000,
  QUEUE_MAX_WAIT_SEC: 300
};

const LEAVE_CONFIG = {
  TOTAL_CHANCES: 3,
  GRACE_SECONDS: 5
};

const SYSTEM_LIMITS = {
  MAX_TEACHERS_PER_STUDENT: 100,
  STUDENT_REQUEST_COOLDOWN_DAYS: 7,
  ROOM_CODE_LENGTH: 12
};

const SUBJECTS = [
  { id: "studies",     ar: "دراسات" },
  { id: "arabic",      ar: "عربي" },
  { id: "english",     ar: "إنجليزي" },
  { id: "math",        ar: "رياضيات" },
  { id: "philosophy",  ar: "فلسفة" },
  { id: "french",      ar: "فرنساوي" },
  { id: "german",      ar: "ألماني" },
  { id: "history",     ar: "تاريخ" },
  { id: "geography",   ar: "جغرافيا" },
  { id: "programming", ar: "برمجة" },
  { id: "science",     ar: "علوم" },
  { id: "chemistry",   ar: "كيمياء" },
  { id: "physics",     ar: "فيزياء" },
  { id: "biology",     ar: "أحياء" }
];

const GRADE_LABELS = {
  p1: "الأول الابتدائي", p2: "الثاني الابتدائي", p3: "الثالث الابتدائي",
  p4: "الرابع الابتدائي", p5: "الخامس الابتدائي", p6: "السادس الابتدائي",
  prep1: "الأول الإعدادي", prep2: "الثاني الإعدادي", prep3: "الثالث الإعدادي",
  sec1: "الأول الثانوي", sec2: "الثاني الثانوي", sec3: "الثالث الثانوي"
};

const GOVERNORATES = [
  "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "الشرقية", "القليوبية",
  "كفر الشيخ", "الغربية", "المنوفية", "البحيرة", "الإسماعيلية", "بورسعيد",
  "السويس", "شمال سيناء", "جنوب سيناء", "الفيوم", "بني سويف", "المنيا",
  "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان", "البحر الأحمر", "الوادي الجديد",
  "مطروح", "دمياط"
];

function subjectLabel(id) {
  if (!id) return "-";
  if (String(id).startsWith("custom:")) return String(id).slice(7);
  const s = SUBJECTS.find((x) => x.id === id);
  return s ? s.ar : id;
}

function gradeLabel(id) { return GRADE_LABELS[id] || id || "-"; }

function statusLabel(s) {
  return {
    draft: "مسودة", scheduled: "مجدول", active: "نشط", completed: "مكتمل", paused: "متوقف",
    submitted: "تم التسليم", graded: "تم التصحيح", in_progress: "قيد الحل",
    pending: "بانتظار الموافقة", approved: "مقبول", rejected: "مرفوض", expired: "منتهي"
  }[s] || s;
}

function planLabel(p) { return CREDIT_PACKS[p]?.name || "Free"; }

/* ============================================================
   UTILITIES
   ============================================================ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  });
  (children || []).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

function svgIcon(id, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${id}`);
  svg.appendChild(use);
  return svg;
}

function creditCoinImg(size = 22) {
  const img = document.createElement("img");
  img.src = CREDIT_COIN_IMG;
  img.alt = "";
  img.className = "credit-coin-img";
  img.setAttribute("draggable", "false");
  img.style.width = size + "px";
  img.style.height = size + "px";
  return img;
}

function debounce(fn, wait) {
  let tm;
  return (...args) => {
    clearTimeout(tm);
    tm = setTimeout(() => fn(...args), wait);
  };
}

function uid(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) s += chars[arr[i] % chars.length];
  return s;
}

function generateRoomCode() {
  const raw = uid(SYSTEM_LIMITS.ROOM_CODE_LENGTH);
  return raw;
}

function formatRoomCode(code) {
  if (!code) return "";
  const clean = String(code).replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return clean.match(/.{1,4}/g)?.join("-") || clean;
}

function normalizeRoomCode(input) {
  return String(input || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function generateResultCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(8);
  crypto.getRandomValues(arr);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[arr[i] % chars.length];
    if (i === 3) code += "-";
  }
  return code;
}

function generatePublicId() {
  const rand = Math.floor(Math.random() * 10000000).toString().padStart(7, "0");
  return parseInt("1" + rand, 10);
}

async function generateUniquePublicId(maxTries = 5) {
  for (let i = 0; i < maxTries; i++) {
    const id = generatePublicId();
    try {
      const snap = await getDoc(doc(db, "publicIds", String(id)));
      if (!snap.exists()) return id;
    } catch {}
  }
  throw new Error("PUBLIC_ID_GENERATION_FAILED");
}

async function assignPublicId(uidValue, role) {
  const newId = await generateUniquePublicId();
  await runTransaction(db, async (tx) => {
    const publicIdRef = doc(db, "publicIds", String(newId));
    const existing = await tx.get(publicIdRef);
    if (existing.exists()) throw new Error("PUBLIC_ID_COLLISION");
    tx.set(publicIdRef, { uid: uidValue, role, createdAt: serverTimestamp() });
  });
  return newId;
}

function fmtDate(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function fmtDateShort(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

function normalizeUsername(u) { return String(u || "").trim().toLowerCase(); }
function validUsername(u) { return /^[a-zA-Z0-9_]{3,24}$/.test(u); }
function validPhone(p) { return /^01[0-9]{9}$/.test(String(p || "").trim()); }

function toLocalInput(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

function isEssay(q) { return q.type === "essay" || q.type === "mcq_just" || q.type === "tf_just"; }

function colorFromString(str) {
  const palette = [
    "#3f68f5", "#2a9d8f", "#e76f51", "#9d4edd", "#f4a261",
    "#457b9d", "#e63946", "#2a6f97", "#bc6c25", "#6a4c93",
    "#06a77d", "#c9184a", "#1d7874", "#7209b7", "#d4a373"
  ];
  let hash = 0;
  for (let i = 0; i < String(str).length; i++) {
    hash = String(str).charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return palette[Math.abs(hash) % palette.length];
}

function getInitials(name) {
  const clean = String(name || "").trim();
  if (!clean) return "?";
  const first = clean.split(/\s+/)[0];
  return first.charAt(0).toUpperCase();
}

/* ============================================================
   GLOBAL LOADING
   ============================================================ */
function showGlobalLoading(text = "جارٍ التحميل...") {
  let overlay = document.getElementById("globalLoading");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "globalLoading";
    overlay.className = "global-loading";
    overlay.innerHTML = `
      <div class="global-loading-inner">
        <img class="brand-logo brand-logo-lg" src="https://i.ibb.co/39cB8Cbv/file-00000000dac881f48b765e030a2b4313.png" alt="" draggable="false">
        <div class="global-loading-spinner"></div>
        <p class="global-loading-text"></p>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  overlay.querySelector(".global-loading-text").textContent = text;
  overlay.style.display = "grid";
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
}

function hideGlobalLoading() {
  const overlay = document.getElementById("globalLoading");
  if (!overlay) return;
  overlay.classList.remove("is-visible");
  setTimeout(() => {
    if (overlay.parentNode) overlay.style.display = "none";
  }, 200);
}

/* ============================================================
   THREE.JS BACKGROUND
   ============================================================ */
const THREE_KEY = "qeyasquiz.three";
let currentThree = localStorage.getItem(THREE_KEY) || "on";
let threeAnimationId = null;

function setThree(state) {
  currentThree = state;
  localStorage.setItem(THREE_KEY, state);
  document.body.dataset.three = state;
}

function initThreeBackground() {
  if (typeof THREE === "undefined") return;
  if (currentThree === "off") return;
  const canvas = document.getElementById("bgCanvas");
  if (!canvas) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 8;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const isDark = document.documentElement.dataset.theme === "dark";
  const brandColor = 0x3f68f5;
  const accentColor = 0x93b1ff;

  const particleCount = window.innerWidth < 768 ? 180 : 400;
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
    velocities[i * 3] = (Math.random() - 0.5) * 0.008;
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.008;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.008;
  }

  const particleGeom = new THREE.BufferGeometry();
  particleGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const particleMat = new THREE.PointsMaterial({
    color: isDark ? accentColor : brandColor,
    size: 0.08, transparent: true,
    opacity: isDark ? 0.55 : 0.4,
    sizeAttenuation: true, depthWrite: false,
    blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending
  });

  const particles = new THREE.Points(particleGeom, particleMat);
  scene.add(particles);

  const maxConnections = 60;
  const lineGeom = new THREE.BufferGeometry();
  const linePositions = new Float32Array(maxConnections * 6);
  lineGeom.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));

  const lineMat = new THREE.LineBasicMaterial({
    color: isDark ? accentColor : brandColor,
    transparent: true, opacity: isDark ? 0.12 : 0.08, depthWrite: false
  });

  const lines = new THREE.LineSegments(lineGeom, lineMat);
  scene.add(lines);

  const knotGeom = new THREE.TorusKnotGeometry(1.6, 0.4, 80, 12, 2, 3);
  const knotMat = new THREE.MeshBasicMaterial({
    color: isDark ? accentColor : brandColor,
    wireframe: true, transparent: true, opacity: isDark ? 0.14 : 0.08
  });
  const knot = new THREE.Mesh(knotGeom, knotMat);
  knot.position.set(0, 0, -2);
  scene.add(knot);

  let mouseX = 0, mouseY = 0;
  window.addEventListener("mousemove", (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  let paused = false;
  const clock = new THREE.Clock();

  function animate() {
    if (paused) return;
    threeAnimationId = requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    const posAttr = particleGeom.attributes.position;

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] += velocities[i * 3];
      positions[i * 3 + 1] += velocities[i * 3 + 1];
      positions[i * 3 + 2] += velocities[i * 3 + 2];
      if (positions[i * 3] > 15 || positions[i * 3] < -15) velocities[i * 3] *= -1;
      if (positions[i * 3 + 1] > 10 || positions[i * 3 + 1] < -10) velocities[i * 3 + 1] *= -1;
      if (positions[i * 3 + 2] > 8 || positions[i * 3 + 2] < -8) velocities[i * 3 + 2] *= -1;
    }
    posAttr.needsUpdate = true;

    let lineIdx = 0;
    for (let i = 0; i < particleCount && lineIdx < maxConnections; i++) {
      for (let j = i + 1; j < particleCount && lineIdx < maxConnections; j++) {
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 4) {
          linePositions[lineIdx * 6] = positions[i * 3];
          linePositions[lineIdx * 6 + 1] = positions[i * 3 + 1];
          linePositions[lineIdx * 6 + 2] = positions[i * 3 + 2];
          linePositions[lineIdx * 6 + 3] = positions[j * 3];
          linePositions[lineIdx * 6 + 4] = positions[j * 3 + 1];
          linePositions[lineIdx * 6 + 5] = positions[j * 3 + 2];
          lineIdx++;
        }
      }
    }
    for (let k = lineIdx; k < maxConnections; k++) {
      for (let m = 0; m < 6; m++) linePositions[k * 6 + m] = 0;
    }
    lineGeom.attributes.position.needsUpdate = true;

    knot.rotation.x = time * 0.15;
    knot.rotation.y = time * 0.2;

    particles.rotation.y += (mouseX * 0.15 - particles.rotation.y) * 0.02;
    particles.rotation.x += (mouseY * 0.1 - particles.rotation.x) * 0.02;

    renderer.render(scene, camera);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      paused = true;
      if (threeAnimationId) cancelAnimationFrame(threeAnimationId);
    } else {
      paused = false;
      clock.getDelta();
      animate();
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

/* ============================================================
   ANTI-COPY
   ============================================================ */
function initAntiCopy() {
  document.addEventListener("contextmenu", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault(); return false;
  });

  document.addEventListener("selectstart", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault(); return false;
  });

  document.addEventListener("copy", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    if (e.clipboardData) e.clipboardData.setData("text/plain", "");
    return false;
  }, true);

  document.addEventListener("cut", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault(); return false;
  }, true);

  document.addEventListener("dragstart", (e) => {
    if (e.target.tagName === "IMG" || e.target.tagName === "SVG" || e.target.closest("svg")) {
      e.preventDefault(); return false;
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = (e.key || "").toLowerCase();
    const t = e.target;
    const isInput = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

    if (isInput && ctrl && ["c", "x", "v", "a"].includes(key)) return;
    if (ctrl && ["c", "x", "a"].includes(key)) { e.preventDefault(); e.stopPropagation(); return false; }
    if (ctrl && ["s", "p", "u"].includes(key)) { e.preventDefault(); return false; }
    if (key === "f12") { e.preventDefault(); return false; }
    if (ctrl && e.shiftKey && ["i", "j", "c", "k"].includes(key)) { e.preventDefault(); return false; }
  }, true);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          if (node.tagName === "IMG") node.setAttribute("draggable", "false");
          node.querySelectorAll?.("img").forEach((img) => img.setAttribute("draggable", "false"));
        }
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/* ============================================================
   TOAST
   ============================================================ */
function toast(message, type = "info", timeout = 4000) {
  const stack = $("[data-toast-stack]");
  if (!stack) return;
  const iconMap = { success: "check-circle", error: "alert", warning: "alert", info: "info" };
  const node = el("div", { class: `toast toast-${type}`, role: "status" });
  const icon = svgIcon(iconMap[type] || "info", 20);
  icon.classList.add("toast-icon");
  node.appendChild(icon);
  node.appendChild(el("div", { class: "toast-body", text: message }));
  const closeBtn = el("button", { class: "toast-close", type: "button", "aria-label": "إغلاق" });
  closeBtn.appendChild(svgIcon("x", 14));
  node.appendChild(closeBtn);
  const close = () => {
    node.classList.add("is-out");
    setTimeout(() => node.remove(), 220);
  };
  closeBtn.addEventListener("click", close);
  stack.appendChild(node);
  if (timeout) setTimeout(close, timeout);
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal({ title, body, actions = [], className = "", onClose }) {
  const host = $("[data-modal-host]") || document.body;
  const overlay = el("div", { class: "modal-overlay" });
  const box = el("div", { class: `modal ${className}`, role: "dialog", "aria-modal": "true" });
  const close = () => { overlay.remove(); if (onClose) onClose(); };
  if (title) box.appendChild(el("h2", { class: "modal-title", text: title }));
  if (body) {
    if (typeof body === "string") box.appendChild(el("p", { class: "modal-body mt-3", text: body }));
    else box.appendChild(body);
  }
  if (actions.length) {
    const foot = el("div", { class: "modal-foot" });
    actions.forEach((a) => {
      const b = el("button", {
        type: "button",
        class: `btn ${a.class || "btn-ghost"}`,
        text: a.label,
        onclick: async () => {
          if (a.onClick) { const r = await a.onClick(); if (r === false) return; }
          if (a.keepOpen !== true) close();
        }
      });
      foot.appendChild(b);
    });
    box.appendChild(foot);
  }
  overlay.appendChild(box);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });
  host.appendChild(overlay);
  return { close, box };
}

/* ============================================================
   CREDIT POPUP
   ============================================================ */
function showCreditPopup(amount, title = "تمت إضافة رصيد") {
  const modal = $("[data-credit-popup]");
  if (!modal) return;

  const titleEl = $("[data-credit-popup-title]");
  const amountEl = $("[data-credit-popup-amount]");
  const textEl = $("[data-credit-popup-text]");
  const closeBtn = $("[data-credit-popup-close]");

  if (titleEl) titleEl.textContent = title;
  if (amountEl) amountEl.textContent = (amount >= 0 ? "+" : "") + amount;
  if (textEl) textEl.textContent = amount >= 0
    ? "تمت إضافة الكريدت لحسابك بنجاح"
    : "تم خصم الكريدت من حسابك";

  modal.hidden = false;

  const close = () => { modal.hidden = true; };
  if (closeBtn) closeBtn.onclick = close;
  modal.onclick = (e) => { if (e.target === modal) close(); };
}

/* ============================================================
   FIREBASE HELPERS
   ============================================================ */
let currentUser = null;
let currentProfile = null;        // Teacher profile
let currentStudentProfile = null; // Student profile
let currentCredits = null;
let currentRole = null;           // "teacher" | "student"
let creditsUnsub = null;

const PROFILE_CACHE_KEY = "qeyasquiz.profile.cache";
const STUDENT_CACHE_KEY = "qeyasquiz.student.profile";
const ROLE_CACHE_KEY = "qeyasquiz.role";

function cacheProfile(profile, role) {
  if (!profile) return;
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ ...profile, _role: role, _cachedAt: Date.now() }));
    localStorage.setItem(ROLE_CACHE_KEY, role);
  } catch {}
}

function getCachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw);
    if (profile._cachedAt && Date.now() - profile._cachedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(PROFILE_CACHE_KEY); return null;
    }
    return profile;
  } catch { return null; }
}

function clearProfileCache() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
    localStorage.removeItem(STUDENT_CACHE_KEY);
    localStorage.removeItem(ROLE_CACHE_KEY);
  } catch {}
}

async function signOutUser() {
  try { await fbSignOut(auth); } catch {}
  currentUser = null;
  currentProfile = null;
  currentStudentProfile = null;
  currentCredits = null;
  currentRole = null;
  if (creditsUnsub) { try { creditsUnsub(); } catch {} creditsUnsub = null; }
  clearProfileCache();
  try {
    sessionStorage.removeItem("qeyasquiz.lastAttempt");
    localStorage.removeItem("qeyasquiz.lastAttempt");
  } catch {}
  navigate("/login");
}

/* ============================================================
   TEACHER PROFILE
   ============================================================ */
async function loadTeacherProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch { return null; }
}

async function createTeacherProfile(uid, data) {
  const publicId = await assignPublicId(uid, "teacher");
  const profile = {
    uid,
    role: "teacher",
    phone: data.phone,
    email: data.email,
    username: data.username,
    normalizedUsername: normalizeUsername(data.username),
    fullName: data.fullName,
    governorate: data.governorate,
    photoURL: data.photoURL || "",
    publicId,
    subjects: [],
    subscription: { plan: "free", expiresAt: null },
    stats: { totalStudents: 0, totalExams: 0 },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await runTransaction(db, async (tx) => {
    const unameRef = doc(db, "usernames", profile.normalizedUsername);
    const unameSnap = await tx.get(unameRef);
    if (unameSnap.exists()) throw new Error("USERNAME_TAKEN");

    tx.set(unameRef, { uid, createdAt: serverTimestamp() });
    tx.set(doc(db, "users", uid), profile);
  });

  return { uid, ...profile, createdAt: new Date(), updatedAt: new Date() };
}

async function checkUsernameAvailability(username) {
  const snap = await getDoc(doc(db, "usernames", normalizeUsername(username)));
  return !snap.exists();
}

/* ============================================================
   STUDENT PROFILE
   ============================================================ */
async function loadStudentProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "students", uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch { return null; }
}

async function createStudentProfile(uid, data) {
  const publicId = await assignPublicId(uid, "student");
  const profile = {
    uid,
    role: "student",
    fullName: data.fullName,
    phone: data.phone,
    parentPhone: data.parentPhone,
    motherPhone: data.motherPhone,
    governorate: data.governorate,
    email: data.email,
    publicId,
    avatarColor: colorFromString(uid),
    stats: { totalTeachers: 0, totalExams: 0 },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(db, "students", uid), profile);
  return { uid, ...profile, createdAt: new Date(), updatedAt: new Date() };
}

/* ============================================================
   CREDITS
   ============================================================ */
function defaultCredits(uid) {
  return {
    uid, balance: 0, totalAdded: 0, totalSpent: 0,
    monthlyGranted: 0, monthlySpent: 0,
    lastTopUpAt: null, lastSpendAt: null
  };
}

async function loadCredits(uid) {
  try {
    const snap = await getDoc(doc(db, "userCredits", uid));
    return snap.exists() ? { uid, ...snap.data() } : defaultCredits(uid);
  } catch { return defaultCredits(uid); }
}

async function ensureSignupBonus(uid) {
  const creditRef = doc(db, "userCredits", uid);
  const snap = await getDoc(creditRef);
  if (snap.exists() && snap.data().signupBonusGranted) return false;

  const bonus = CREDIT_PACKS.free.credits;
  let granted = false;

  await runTransaction(db, async (tx) => {
    const current = await tx.get(creditRef);
    if (current.exists() && current.data().signupBonusGranted) return;

    const currentBalance = current.exists() ? (current.data().balance || 0) : 0;
    granted = true;

    tx.set(creditRef, {
      uid,
      balance: currentBalance + bonus,
      totalAdded: bonus,
      totalSpent: 0,
      monthlyGranted: bonus,
      monthlySpent: 0,
      signupBonusGranted: true,
      lastTopUpAt: serverTimestamp(),
      createdAt: current.exists() ? (current.data().createdAt || serverTimestamp()) : serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    const txRef = doc(collection(db, "creditTransactions"));
    tx.set(txRef, {
      uid, type: "signup_bonus", amount: bonus,
      source: "signup", note: "رصيد ترحيبي",
      balanceAfter: currentBalance + bonus,
      createdAt: serverTimestamp()
    });
  });

  return granted;
}

function startCreditsListener(uid) {
  if (creditsUnsub) { try { creditsUnsub(); } catch {} creditsUnsub = null; }
  creditsUnsub = onSnapshot(doc(db, "userCredits", uid), (snap) => {
    const prev = currentCredits?.balance ?? 0;
    currentCredits = snap.exists() ? { uid, ...snap.data() } : defaultCredits(uid);
    const next = currentCredits.balance ?? 0;
    if (next > prev && prev >= 0) {
      const diff = next - prev;
      if (diff > 0) showCreditPopup(diff);
    }
    updateCreditsUI();
  }, (err) => console.warn("[credits listener]", err));
}

function stopCreditsListener() {
  if (creditsUnsub) { try { creditsUnsub(); } catch {} creditsUnsub = null; }
}

function updateCreditsUI() {
  const balance = currentCredits?.balance ?? 0;
  const balanceStr = String(balance);

  $$("[data-credit-balance]").forEach((e) => { e.textContent = balanceStr; });
  $$("[data-side-credit-value]").forEach((e) => { e.textContent = balanceStr; });

  const plan = currentProfile?.subscription?.plan || "free";
  const expiry = currentProfile?.subscription?.expiresAt;

  $$("[data-side-credit-plan]").forEach((e) => { e.textContent = planLabel(plan); });

  $$("[data-side-credit-expiry]").forEach((e) => {
    if (plan === "free" || !expiry) {
      e.textContent = plan === "free" ? "باقة مجانية" : "";
      return;
    }
    e.textContent = `ينتهي: ${fmtDateShort(expiry)}`;
  });

  const sideCard = $("[data-side-credit]");
  if (sideCard) {
    sideCard.classList.toggle("is-low", balance > 0 && balance < 20);
    sideCard.classList.toggle("is-expired", balance <= 0);
  }

  if (currentRoute === "/app/credits") renderCreditsPage();
}

function computeAICost(essayCount, studentCount) {
  const total = essayCount * studentCount;
  if (total <= 0) return 0;
  return Math.max(1, Math.ceil(total / 10));
}

async function loadTransactions(uid, limitN = 50) {
  try {
    const snap = await getDocs(query(
      collection(db, "creditTransactions"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(limitN)
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    try {
      const snap = await getDocs(query(collection(db, "creditTransactions"), where("uid", "==", uid)));
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      arr.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      return arr.slice(0, limitN);
    } catch { return []; }
  }
}

/* ============================================================
   TEACHER STUDENTS RELATIONS
   ============================================================ */
async function sendStudentRequest(studentUid, teacherUid) {
  // Check cooldown
  const existingSnap = await getDocs(query(
    collection(db, "studentRequests"),
    where("studentUid", "==", studentUid),
    where("teacherUid", "==", teacherUid),
    orderBy("createdAt", "desc"),
    limit(1)
  ));

  if (!existingSnap.empty) {
    const last = existingSnap.docs[0].data();
    if (last.status === "pending") throw new Error("REQUEST_PENDING");
    if (last.status === "approved") throw new Error("ALREADY_APPROVED");
    if (last.status === "rejected" && last.respondedAt) {
      const dt = last.respondedAt.toDate ? last.respondedAt.toDate() : new Date(last.respondedAt);
      const days = (Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24);
      if (days < SYSTEM_LIMITS.STUDENT_REQUEST_COOLDOWN_DAYS) {
        const remain = Math.ceil(SYSTEM_LIMITS.STUDENT_REQUEST_COOLDOWN_DAYS - days);
        const err = new Error("COOLDOWN");
        err.daysRemaining = remain;
        throw err;
      }
    }
  }

  // Check max teachers
  const myTeachersSnap = await getDocs(collection(db, "studentTeachers", studentUid, "teachers"));
  if (myTeachersSnap.size >= SYSTEM_LIMITS.MAX_TEACHERS_PER_STUDENT) {
    throw new Error("MAX_TEACHERS");
  }

  const student = currentStudentProfile;
  const teacherSnap = await getDoc(doc(db, "users", teacherUid));
  if (!teacherSnap.exists()) throw new Error("TEACHER_NOT_FOUND");
  const teacher = teacherSnap.data();

  const reqRef = await addDoc(collection(db, "studentRequests"), {
    studentUid,
    studentName: student.fullName,
    studentPublicId: student.publicId,
    studentPhone: student.phone,
    studentGovernorate: student.governorate,
    teacherUid,
    teacherName: teacher.fullName,
    teacherUsername: teacher.username,
    status: "pending",
    createdAt: serverTimestamp(),
    respondedAt: null,
    seenAt: null
  });

  return reqRef.id;
}

async function approveStudentRequest(requestId) {
  const reqRef = doc(db, "studentRequests", requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error("REQUEST_NOT_FOUND");
  const req = reqSnap.data();
  if (req.status !== "pending") throw new Error("REQUEST_ALREADY_HANDLED");

  const batch = writeBatch(db);

  batch.update(reqRef, {
    status: "approved",
    respondedAt: serverTimestamp(),
    seenAt: serverTimestamp()
  });

  const teacherStudentsRef = doc(db, "teacherStudents", req.teacherUid, "students", req.studentUid);
  batch.set(teacherStudentsRef, {
    studentUid: req.studentUid,
    studentName: req.studentName,
    studentPublicId: req.studentPublicId,
    studentPhone: req.studentPhone,
    studentGovernorate: req.studentGovernorate,
    joinedAt: serverTimestamp()
  });

  const studentTeachersRef = doc(db, "studentTeachers", req.studentUid, "teachers", req.teacherUid);
  batch.set(studentTeachersRef, {
    teacherUid: req.teacherUid,
    teacherName: req.teacherName,
    teacherUsername: req.teacherUsername,
    joinedAt: serverTimestamp()
  });

  await batch.commit();
}

async function rejectStudentRequest(requestId) {
  const reqRef = doc(db, "studentRequests", requestId);
  await updateDoc(reqRef, {
    status: "rejected",
    respondedAt: serverTimestamp(),
    seenAt: serverTimestamp()
  });
}

async function removeStudentFromTeacher(teacherUid, studentUid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "teacherStudents", teacherUid, "students", studentUid));
  batch.delete(doc(db, "studentTeachers", studentUid, "teachers", teacherUid));
  await batch.commit();
}

async function listMyStudents(teacherUid) {
  try {
    const snap = await getDocs(collection(db, "teacherStudents", teacherUid, "students"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function listMyTeachers(studentUid) {
  try {
    const snap = await getDocs(collection(db, "studentTeachers", studentUid, "teachers"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function listTeacherRequests(teacherUid, status) {
  try {
    const conditions = [where("teacherUid", "==", teacherUid)];
    if (status) conditions.push(where("status", "==", status));
    const snap = await getDocs(query(collection(db, "studentRequests"), ...conditions));
    const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    arr.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return arr;
  } catch { return []; }
}

/* ============================================================
   EXAMS
   ============================================================ */
async function listExams(teacherUid, limitN = 100) {
  try {
    const snap = await getDocs(query(
      collection(db, "exams"),
      where("ownerId", "==", teacherUid),
      orderBy("updatedAt", "desc"),
      limit(limitN)
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    try {
      const snap = await getDocs(query(collection(db, "exams"), where("ownerId", "==", teacherUid)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch { return []; }
  }
}

async function getExam(id) {
  try {
    const snap = await getDoc(doc(db, "exams", id));
    return snap.exists() ? { id, ...snap.data() } : null;
  } catch { return null; }
}

async function getExamAnswers(examId) {
  try {
    const snap = await getDoc(doc(db, "examAnswers", examId));
    return snap.exists() ? snap.data().answers || {} : {};
  } catch { return {}; }
}

async function listAttempts(examId) {
  try {
    const snap = await getDocs(query(collection(db, "attempts"), where("examId", "==", examId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function getStudentAttempt(examId, studentUid) {
  try {
    const snap = await getDocs(query(
      collection(db, "attempts"),
      where("examId", "==", examId),
      where("studentUid", "==", studentUid),
      limit(1)
    ));
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch { return null; }
}

async function findExamByRoomCode(roomCode) {
  const clean = normalizeRoomCode(roomCode);
  if (clean.length !== SYSTEM_LIMITS.ROOM_CODE_LENGTH) return null;
  try {
    const snap = await getDoc(doc(db, "examRoomCodes", clean));
    if (!snap.exists()) return null;
    const data = snap.data();
    return { examId: data.examId, teacherUid: data.teacherUid, active: data.active, expiresAt: data.expiresAt };
  } catch { return null; }
}

async function listUpcomingExamsForStudent(teachers) {
  if (!teachers.length) return [];
  const results = [];
  for (const t of teachers) {
    try {
      const snap = await getDocs(query(
        collection(db, "exams"),
        where("ownerId", "==", t.teacherUid),
        where("status", "in", ["scheduled", "active"])
      ));
      snap.docs.forEach((d) => {
        results.push({
          id: d.id, ...d.data(),
          teacherName: t.teacherName,
          teacherUsername: t.teacherUsername
        });
      });
    } catch {}
  }
  return results;
}

async function listStudentHistory(studentUid) {
  try {
    const snap = await getDocs(query(
      collection(db, "attempts"),
      where("studentUid", "==", studentUid),
      orderBy("createdAt", "desc"),
      limit(100)
    ));
    const attempts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const enriched = [];
    for (const att of attempts) {
      const exam = await getExam(att.examId);
      enriched.push({ ...att, exam });
    }
    return enriched;
  } catch {
    try {
      const snap = await getDocs(query(collection(db, "attempts"), where("studentUid", "==", studentUid)));
      const attempts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      attempts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      const enriched = [];
      for (const att of attempts.slice(0, 100)) {
        const exam = await getExam(att.examId);
        enriched.push({ ...att, exam });
      }
      return enriched;
    } catch { return []; }
  }
}

/* ============================================================
   SEARCH TEACHERS
   ============================================================ */
async function searchTeachers(queryStr) {
  const q = String(queryStr || "").trim();
  if (!q) return [];

  try {
    // Search by username
    const normQ = normalizeUsername(q);
    if (validUsername(normQ)) {
      const unameSnap = await getDoc(doc(db, "usernames", normQ));
      if (unameSnap.exists()) {
        const teacherSnap = await getDoc(doc(db, "users", unameSnap.data().uid));
        if (teacherSnap.exists()) return [{ uid: unameSnap.data().uid, ...teacherSnap.data() }];
      }
    }

    // Search by publicId
    if (/^\d+$/.test(q)) {
      const pubSnap = await getDoc(doc(db, "publicIds", q));
      if (pubSnap.exists() && pubSnap.data().role === "teacher") {
        const teacherSnap = await getDoc(doc(db, "users", pubSnap.data().uid));
        if (teacherSnap.exists()) return [{ uid: pubSnap.data().uid, ...teacherSnap.data() }];
      }
    }

    // Search by name (exact + partial via all teachers)
    const allSnap = await getDocs(query(collection(db, "users"), limit(500)));
    const qLower = q.toLowerCase();
    const results = [];
    allSnap.docs.forEach((d) => {
      const data = d.data();
      const name = (data.fullName || "").toLowerCase();
      const uname = (data.username || "").toLowerCase();
      if (name.includes(qLower) || uname.includes(qLower)) {
        results.push({ uid: d.id, ...data });
      }
    });
    return results.slice(0, 30);
  } catch (err) {
    console.error("[searchTeachers]", err);
    return [];
  }
}

/* ============================================================
   SHARE EXAM / ROOM CODE
   ============================================================ */
function shareRoomCode(exam) {
  const code = exam.roomCode || "";
  const formatted = formatRoomCode(code);
  const body = el("div", { class: "stack" });

  const codeBox = el("div", {
    class: "card",
    style: "text-align:center;padding:var(--sp-6);background:var(--bg-subtle)"
  });
  codeBox.appendChild(el("div", {
    class: "text-sm text-muted",
    style: "margin-bottom:8px",
    text: "كود الغرفة"
  }));
  const codeEl = el("div", {
    class: "mono",
    style: "font-size:32px;font-weight:700;letter-spacing:6px;color:var(--brand-500);margin-bottom:16px",
    text: formatted
  });
  codeBox.appendChild(codeEl);

  const copyBtn = el("button", {
    class: "btn btn-outline btn-sm", type: "button"
  });
  copyBtn.appendChild(svgIcon("copy", 14));
  copyBtn.appendChild(document.createTextNode(" نسخ الكود"));
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(code);
    toast("تم نسخ الكود", "success");
  });
  codeBox.appendChild(copyBtn);
  body.appendChild(codeBox);

  body.appendChild(el("p", { class: "text-sm text-muted text-center", text: "شارك هذا الكود مع طلابك للانضمام للامتحان." }));

  openModal({
    title: "كود الغرفة",
    body,
    actions: [{ label: "إغلاق", class: "btn-primary" }]
  });
}

/* ============================================================
   UPLOAD (Cloudinary unsigned)
   ============================================================ */
async function uploadToCloudinary(file, folder, maxBytes = 2 * 1024 * 1024) {
  if (!file) throw new Error("NO_FILE");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("INVALID_TYPE");
  if (file.size > maxBytes) throw new Error("TOO_LARGE");
  if (!UPLOAD.cloudName) throw new Error("CONFIG_MISSING");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD.preset);
  if (folder) formData.append("folder", folder);

  const endpoint = `https://api.cloudinary.com/v1_1/${UPLOAD.cloudName}/image/upload`;

  let res;
  try { res = await fetch(endpoint, { method: "POST", body: formData }); }
  catch { throw new Error("NETWORK_ERROR"); }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[upload] rejected:", { status: res.status, body });
    throw new Error("UPLOAD_FAILED");
  }
  if (!body.secure_url) throw new Error("UPLOAD_INCOMPLETE");
  return body.secure_url;
}

function uploadErrorMessage(err, maxLabel = "") {
  const msg = err?.message || "";
  const suffix = maxLabel ? ` (${maxLabel})` : "";
  if (msg === "NO_FILE") return "لم يتم اختيار ملف";
  if (msg === "INVALID_TYPE") return "صيغة الصورة غير مدعومة - JPG أو PNG أو WebP فقط";
  if (msg === "TOO_LARGE") return `حجم الصورة أكبر من الحد المسموح${suffix}`;
  if (msg === "CONFIG_MISSING") return "الإعدادات غير مكتملة";
  if (msg === "NETWORK_ERROR") return "تعذّر الاتصال بالخادم";
  if (msg === "UPLOAD_INCOMPLETE") return "الرفع لم يكتمل";
  if (msg === "UPLOAD_FAILED") return "فشل رفع الصورة";
  return "تعذّر رفع الصورة";
}

/* ============================================================
   ROUTER
   ============================================================ */
const ROUTES = {
  "/": { page: "login" },
  "/login": { page: "login" },

  // Teacher
  "/app/dashboard": { page: "app", view: "dashboard", role: "teacher" },
  "/app/exams": { page: "app", view: "exams", role: "teacher" },
  "/app/students": { page: "app", view: "students", role: "teacher" },
  "/app/builder": { page: "app", view: "builder", role: "teacher" },
  "/app/exam": { page: "app", view: "exam-details", role: "teacher" },
  "/app/grading": { page: "app", view: "grading", role: "teacher" },
  "/app/bank": { page: "app", view: "bank", role: "teacher" },
  "/app/ai-qeyas": { page: "app", view: "ai-qeyas", role: "teacher" },
  "/app/profile": { page: "app", view: "profile", role: "teacher" },
  "/app/settings": { page: "app", view: "settings", role: "teacher" },
  "/app/credits": { page: "app", view: "credits", role: "teacher" },
  "/app/subscription": { page: "app", view: "subscription", role: "teacher" },
  "/app/checkout": { page: "app", view: "checkout", role: "teacher" },

  // Student
  "/student/dashboard": { page: "student-app", view: "student-dashboard", role: "student" },
  "/student/teachers": { page: "student-app", view: "student-teachers", role: "student" },
  "/student/masters": { page: "student-app", view: "student-masters", role: "student" },
  "/student/history": { page: "student-app", view: "student-history", role: "student" },
  "/student/join": { page: "student-app", view: "student-join", role: "student" },
  "/student/profile": { page: "student-app", view: "student-profile", role: "student" },

  // Exam + Result
  "/exam": { page: "exam" },
  "/result": { page: "result" }
};

let currentRoute = null;
let currentParams = null;
const routeHandlers = {};

function onRoute(name, handler) { routeHandlers[name] = handler; }

function navigate(path) {
  if (location.hash === "#" + path) handleRoute();
  else location.hash = "#" + path;
}

function handleRoute() {
  const raw = (location.hash.replace(/^#/, "")) || "/";
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs || "");
  currentParams = params;

  // Cleanup exam runtime
  if (examRuntime && path !== "/exam") {
    if (examRuntime.timerInterval) clearInterval(examRuntime.timerInterval);
    if (examRuntime.autosaveInterval) clearInterval(examRuntime.autosaveInterval);
    if (examRuntime.heartbeatInterval) clearInterval(examRuntime.heartbeatInterval);
    if (examRuntime.watcherUnsub) { try { examRuntime.watcherUnsub(); } catch {} }
    if (examRuntime._anticheatCleanup) { try { examRuntime._anticheatCleanup(); } catch {} }
    if (examRuntime._leaveCleanup) { try { examRuntime._leaveCleanup(); } catch {} }
    examRuntime = null;
  }

  const route = ROUTES[path] || ROUTES["/"];
  const targetPage = route.page;

  $$("[data-page]").forEach((p) => { p.hidden = p.dataset.page !== targetPage; });

  if (route.view) {
    const pageEl = $(`[data-page="${targetPage}"]`);
    if (pageEl) {
      pageEl.querySelectorAll("[data-view]").forEach((v) => { v.hidden = v.dataset.view !== route.view; });
      pageEl.querySelectorAll(".side-link").forEach((l) => l.classList.toggle("is-active", l.dataset.route === route.view));
    }

    const titleMap = {
      dashboard: "الرئيسية",
      exams: "امتحاناتي",
      students: "طلابي",
      builder: "منشئ الامتحان",
      "exam-details": "تفاصيل الامتحان",
      grading: "التصحيح",
      bank: "بنك الأسئلة",
      "ai-qeyas": "AI Qeyas",
      profile: "الملف الشخصي",
      settings: "الإعدادات",
      credits: "الرصيد والباقات",
      subscription: "الباقات",
      checkout: "الدفع",
      "student-dashboard": "الرئيسية",
      "student-teachers": "المعلمين",
      "student-masters": "امتحانات المستر",
      "student-history": "امتحاناتي السابقة",
      "student-join": "انضم لغرفة",
      "student-profile": "الملف الشخصي"
    };
    const titleEl = $(`[data-page="${targetPage}"] [data-page-title]`);
    if (titleEl) titleEl.textContent = titleMap[route.view] || "";

    const backBtn = $(`[data-page="${targetPage}"] [data-back]`);
    if (backBtn) {
      backBtn.hidden = route.view === "dashboard" || route.view === "student-dashboard";
    }
  }

  currentRoute = path;

  // Auth guard
  const publicRoutes = ["/login", "/"];
  if (!publicRoutes.includes(path)) {
    if (!currentUser) {
      sessionStorage.setItem("qeyasquiz.redirectAfterLogin", path + (qs ? "?" + qs : ""));
      navigate("/login");
      return;
    }
    // Role check
    if (route.role && currentRole && route.role !== currentRole) {
      navigate(currentRole === "teacher" ? "/app/dashboard" : "/student/dashboard");
      return;
    }
  }

  const handler = routeHandlers[path];
  if (handler) {
    Promise.resolve(handler(params)).catch((err) => {
      console.error("[route]", err);
      toast("حدث خطأ في تحميل الصفحة.", "error");
    });
  }

  window.scrollTo(0, 0);
}

/* ============================================================
   THEME
   ============================================================ */
const THEME_KEY = "qeyasquiz.theme";
let currentTheme = localStorage.getItem(THEME_KEY) || "light";

function setTheme(theme) {
  currentTheme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

function toggleTheme() { setTheme(currentTheme === "dark" ? "light" : "dark"); }

/* ============================================================
   AUTH STATE
   ============================================================ */
let authResolved = false;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    currentProfile = null;
    currentStudentProfile = null;
    currentCredits = null;
    currentRole = null;
    stopCreditsListener();
    clearProfileCache();
    authResolved = true;
    hideGlobalLoading();

    const isPublic = ["/", "/login", "/exam", "/result"].includes(currentRoute);
    if (!isPublic) {
      navigate("/login");
      return;
    }
    if (currentRoute && routeHandlers[currentRoute]) {
      Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
    }
    return;
  }

  const cached = getCachedProfile();
  const cachedRole = localStorage.getItem(ROLE_CACHE_KEY);

  if (cached && cached.uid === user.uid && cachedRole) {
    currentRole = cachedRole;
    if (cachedRole === "teacher") {
      currentProfile = cached;
    } else {
      currentStudentProfile = cached;
    }
    authResolved = true;
    hideGlobalLoading();
    updateUserUI();
    startCreditsListener(user.uid);
    resolveAuthRoute();

    // Refresh in background
    refreshProfileInBackground(user.uid, cachedRole);
    return;
  }

  showGlobalLoading("جارٍ تحميل حسابك...");

  try {
    const [teacherProfile, studentProfile] = await Promise.all([
      loadTeacherProfile(user.uid).catch(() => null),
      loadStudentProfile(user.uid).catch(() => null)
    ]);

    if (teacherProfile) {
      currentRole = "teacher";
      currentProfile = teacherProfile;
      cacheProfile(teacherProfile, "teacher");
      startCreditsListener(user.uid);
      try { await ensureSignupBonus(user.uid); } catch {}
    } else if (studentProfile) {
      currentRole = "student";
      currentStudentProfile = studentProfile;
      cacheProfile(studentProfile, "student");
    } else {
      // New user, no profile — redirect to login (shouldn't happen normally)
      currentRole = null;
    }
  } catch (err) {
    console.warn("[auth] load profile failed", err);
  }

  authResolved = true;
  hideGlobalLoading();
  updateUserUI();
  resolveAuthRoute();
});

async function refreshProfileInBackground(uid, role) {
  try {
    if (role === "teacher") {
      const fresh = await loadTeacherProfile(uid);
      if (fresh) {
        currentProfile = fresh;
        cacheProfile(fresh, "teacher");
        updateUserUI();
        try { await ensureSignupBonus(uid); } catch {}
        if (currentRoute?.startsWith("/app/") && routeHandlers[currentRoute]) {
          Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
        }
      }
    } else {
      const fresh = await loadStudentProfile(uid);
      if (fresh) {
        currentStudentProfile = fresh;
        cacheProfile(fresh, "student");
        updateUserUI();
      }
    }
  } catch {}
}

function resolveAuthRoute() {
  const hasTeacher = currentRole === "teacher" && currentProfile;
  const hasStudent = currentRole === "student" && currentStudentProfile;

  if (currentRoute === "/login" || currentRoute === "/") {
    if (hasTeacher) navigate("/app/dashboard");
    else if (hasStudent) navigate("/student/dashboard");
    return;
  }

  // If user has no profile but logged in — redirect to login (setup flow handled by forms)
  if (!hasTeacher && !hasStudent) {
    if (!["/login", "/", "/exam", "/result"].includes(currentRoute)) {
      navigate("/login");
    }
    return;
  }

  if (currentRoute && routeHandlers[currentRoute]) {
    Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
  }
}

function updateUserUI() {
  if (currentRole === "teacher" && currentProfile) {
    const name = currentProfile.fullName || "";
    const handle = "@" + (currentProfile.username || "");
    const photo = currentProfile.photoURL || "";
    const publicId = currentProfile.publicId ? String(currentProfile.publicId) : "-";

    $$("[data-user-name]").forEach((e) => { e.textContent = name; });
    $$("[data-user-handle]").forEach((e) => { e.textContent = handle; });
    $$("[data-user-id]").forEach((e) => { e.textContent = `ID: ${publicId}`; });
    $$("[data-user-avatar]").forEach((e) => { if (photo) e.src = photo; });
    $$("[data-profile-avatar]").forEach((e) => { if (photo) e.src = photo; });
    $$("[data-profile-name]").forEach((e) => { e.textContent = name; });
    $$("[data-profile-handle]").forEach((e) => { e.textContent = handle; });
    $$("[data-profile-id]").forEach((e) => { e.textContent = publicId; });
    $$("[data-profile-governorate]").forEach((e) => { e.textContent = currentProfile.governorate || "-"; });
    $$("[data-profile-phone]").forEach((e) => { e.textContent = currentProfile.phone || "-"; });
  }

  if (currentRole === "student" && currentStudentProfile) {
    const name = currentStudentProfile.fullName || "";
    const publicId = currentStudentProfile.publicId ? String(currentStudentProfile.publicId) : "-";
    const initial = getInitials(name);
    const color = currentStudentProfile.avatarColor || colorFromString(currentStudentProfile.uid);

    $$("[data-student-name]").forEach((e) => { e.textContent = name; });
    $$("[data-student-id]").forEach((e) => { e.textContent = `ID: ${publicId}`; });

    $$("[data-student-avatar-letter]").forEach((e) => {
      e.textContent = initial;
      e.style.background = color;
    });

    $$("[data-profile-letter]").forEach((e) => {
      e.textContent = initial;
      e.style.background = color;
    });

    $$("[data-profile-name]").forEach((e) => { e.textContent = name; });
    $$("[data-profile-id]").forEach((e) => { e.textContent = publicId; });
    $$("[data-profile-governorate]").forEach((e) => { e.textContent = currentStudentProfile.governorate || "-"; });
    $$("[data-profile-phone]").forEach((e) => { e.textContent = currentStudentProfile.phone || "-"; });
    $$("[data-profile-parent-phone]").forEach((e) => { e.textContent = currentStudentProfile.parentPhone || "-"; });
    $$("[data-profile-mother-phone]").forEach((e) => { e.textContent = currentStudentProfile.motherPhone || "-"; });
    $$("[data-profile-email]").forEach((e) => { e.textContent = currentStudentProfile.email || "-"; });
  }
}

/* ============================================================
   LOGIN PAGE
   ============================================================ */
function initLogin() {
  // Populate governorates in both forms
  populateGovernorates();

  // Show signin by default
  showAuthView("signin");

  // Bind tabs
  $$("[data-auth-mode]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.authMode;
      if (mode === "signup") showAuthView("role-select");
      else showAuthView("signin");
    });
  });

  // Role selection
  $$("[data-role]").forEach((card) => {
    card.addEventListener("click", () => {
      const role = card.dataset.role;
      if (role === "teacher") showAuthView("signup-teacher");
      else if (role === "student") showAuthView("signup-student");
    });
  });

  // Back buttons
  $$("[data-back-to-role]").forEach((btn) => {
    btn.addEventListener("click", () => showAuthView("role-select"));
  });
  $$("[data-back-to-signin]").forEach((btn) => {
    btn.addEventListener("click", () => showAuthView("signin"));
  });

  // Sign in form
  const signinForm = $("[data-signin-form]");
  if (signinForm && !signinForm.dataset.bound) {
    signinForm.dataset.bound = "1";
    signinForm.addEventListener("submit", handleSignIn);
  }

  // Teacher form
  const teacherForm = $("[data-teacher-form]");
  if (teacherForm && !teacherForm.dataset.bound) {
    teacherForm.dataset.bound = "1";
    teacherForm.addEventListener("submit", handleTeacherSignup);
  }

  // Student form
  const studentForm = $("[data-student-form]");
  if (studentForm && !studentForm.dataset.bound) {
    studentForm.dataset.bound = "1";
    studentForm.addEventListener("submit", handleStudentSignup);
  }

  // Username check
  const usernameInput = $("[data-teacher-username]");
  if (usernameInput && !usernameInput.dataset.bound) {
    usernameInput.dataset.bound = "1";
    const status = $("[data-teacher-username-status]");
    const checkUname = debounce(async () => {
      const val = usernameInput.value.trim();
      if (!status) return;
      status.textContent = "";
      status.className = "input-status";
      if (!val) return;
      if (!validUsername(val)) {
        status.textContent = "غير صالح";
        status.classList.add("is-taken");
        return;
      }
      status.textContent = "...";
      status.classList.add("is-checking");
      try {
        const ok = await checkUsernameAvailability(val);
        status.classList.remove("is-checking");
        if (ok) { status.textContent = "متاح"; status.classList.add("is-available"); }
        else { status.textContent = "مأخوذ"; status.classList.add("is-taken"); }
      } catch { status.textContent = ""; }
    }, 400);
    usernameInput.addEventListener("input", checkUname);
  }

  // Forgot password
  const forgotBtn = $("[data-forgot-password]");
  if (forgotBtn && !forgotBtn.dataset.bound) {
    forgotBtn.dataset.bound = "1";
    forgotBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const email = $("[data-signin-email]")?.value.trim();
      if (!email) {
        toast("أدخل البريد الإلكتروني أولا", "warning");
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        toast("تم إرسال رابط إعادة التعيين", "success");
      } catch (err) {
        toast("تعذّر الإرسال - تحقق من البريد", "error");
      }
    });
  }
}

function populateGovernorates() {
  const govSelectors = [$("[data-teacher-governorate]"), $("[data-student-governorate]")];
  govSelectors.forEach((sel) => {
    if (!sel || sel.dataset.populated) return;
    sel.dataset.populated = "1";
    GOVERNORATES.forEach((g) => {
      sel.appendChild(el("option", { value: g, text: g }));
    });
  });
}

function showAuthView(viewName) {
  $$("[data-auth-view]").forEach((v) => {
    v.hidden = v.dataset.authView !== viewName;
  });
  $$("[data-auth-mode]").forEach((tab) => {
    const mode = tab.dataset.authMode;
    const isActive = (viewName === "signin" && mode === "signin") ||
                     (viewName !== "signin" && mode === "signup");
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function showAuthError(role, msg) {
  const map = {
    signin: "[data-auth-error]",
    teacher: "[data-auth-error-teacher]",
    student: "[data-auth-error-student]"
  };
  const errorEl = $(map[role] || map.signin);
  if (!errorEl) return;
  const textEl = errorEl.querySelector("span[data-auth-error-text], span[data-auth-error-text-teacher], span[data-auth-error-text-student]");
  errorEl.hidden = false;
  if (textEl) textEl.textContent = msg;
}

function hideAuthError(role) {
  const map = {
    signin: "[data-auth-error]",
    teacher: "[data-auth-error-teacher]",
    student: "[data-auth-error-student]"
  };
  const errorEl = $(map[role] || map.signin);
  if (errorEl) errorEl.hidden = true;
}

function authErrorMessage(code) {
  return {
    "auth/email-already-in-use": "البريد الإلكتروني مستخدم بالفعل",
    "auth/invalid-email": "البريد الإلكتروني غير صالح",
    "auth/weak-password": "كلمة المرور ضعيفة - 6 أحرف على الأقل",
    "auth/user-not-found": "مفيش حساب بالبريد ده",
    "auth/wrong-password": "كلمة المرور غلط",
    "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة",
    "auth/too-many-requests": "حاولت كتير - استنى شوية",
    "auth/network-request-failed": "تعذّر الاتصال - تحقق من الإنترنت"
  }[code] || "حدث خطأ - حاول مرة أخرى";
}

async function handleSignIn(e) {
  e.preventDefault();
  hideAuthError("signin");
  const email = $("[data-signin-email]").value.trim();
  const password = $("[data-signin-password]").value;
  const btn = $("[data-signin-submit]");

  if (!email || !password) {
    showAuthError("signin", "أدخل البريد وكلمة المرور");
    return;
  }

  btn.classList.add("is-loading");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged handles redirect
  } catch (err) {
    btn.classList.remove("is-loading");
    showAuthError("signin", authErrorMessage(err.code));
  }
}

async function handleTeacherSignup(e) {
  e.preventDefault();
  hideAuthError("teacher");

  const phone = $("[data-teacher-phone]").value.trim();
  const email = $("[data-teacher-email]").value.trim();
  const username = $("[data-teacher-username]").value.trim();
  const fullName = $("[data-teacher-fullname]").value.trim();
  const governorate = $("[data-teacher-governorate]").value;
  const password = $("[data-teacher-password]").value;
  const passwordConfirm = $("[data-teacher-password-confirm]").value;
  const btn = $("[data-teacher-submit]");

  if (!validPhone(phone)) { showAuthError("teacher", "رقم الهاتف غير صحيح"); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError("teacher", "البريد الإلكتروني غير صحيح"); return; }
  if (!validUsername(username)) { showAuthError("teacher", "اسم المستخدم 3-24 حرفا"); return; }
  if (fullName.length < 3) { showAuthError("teacher", "أدخل الاسم الكامل"); return; }
  if (!governorate) { showAuthError("teacher", "اختر المحافظة"); return; }
  if (password.length < 6) { showAuthError("teacher", "كلمة المرور 6 أحرف على الأقل"); return; }
  if (password !== passwordConfirm) { showAuthError("teacher", "كلمتا المرور غير متطابقتين"); return; }

  btn.classList.add("is-loading");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });

    const profile = await createTeacherProfile(cred.user.uid, {
      phone, email, username, fullName, governorate
    });

    currentProfile = profile;
    currentRole = "teacher";
    cacheProfile(profile, "teacher");
    startCreditsListener(cred.user.uid);
    try { await ensureSignupBonus(cred.user.uid); } catch {}

    toast("تم إنشاء الحساب بنجاح", "success");
    navigate("/app/dashboard");
  } catch (err) {
    btn.classList.remove("is-loading");
    if (err.message === "USERNAME_TAKEN") {
      showAuthError("teacher", "اسم المستخدم مأخوذ");
      return;
    }
    showAuthError("teacher", authErrorMessage(err.code) || err.message || "تعذّر إنشاء الحساب");
  }
}

async function handleStudentSignup(e) {
  e.preventDefault();
  hideAuthError("student");

  const fullName = $("[data-student-fullname]").value.trim();
  const phone = $("[data-student-phone]").value.trim();
  const parentPhone = $("[data-student-parent-phone]").value.trim();
  const motherPhone = $("[data-student-mother-phone]").value.trim();
  const governorate = $("[data-student-governorate]").value;
  const email = $("[data-student-email]").value.trim();
  const password = $("[data-student-password]").value;
  const passwordConfirm = $("[data-student-password-confirm]").value;
  const btn = $("[data-student-submit]");

  const nameWords = fullName.split(/\s+/).filter(Boolean);
  if (nameWords.length < 4) { showAuthError("student", "اكتب اسمك رباعيا"); return; }
  if (!validPhone(phone)) { showAuthError("student", "رقم هاتفك غير صحيح"); return; }
  if (!validPhone(parentPhone)) { showAuthError("student", "رقم الوالد غير صحيح"); return; }
  if (!validPhone(motherPhone)) { showAuthError("student", "رقم الوالدة غير صحيح"); return; }
  if (!governorate) { showAuthError("student", "اختر المحافظة"); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAuthError("student", "البريد الإلكتروني غير صحيح"); return; }
  if (password.length < 6) { showAuthError("student", "كلمة المرور 6 أحرف على الأقل"); return; }
  if (password !== passwordConfirm) { showAuthError("student", "كلمتا المرور غير متطابقتين"); return; }

  btn.classList.add("is-loading");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });

    const profile = await createStudentProfile(cred.user.uid, {
      fullName, phone, parentPhone, motherPhone, governorate, email
    });

    currentStudentProfile = profile;
    currentRole = "student";
    cacheProfile(profile, "student");

    toast("تم إنشاء الحساب بنجاح", "success");
    navigate("/student/dashboard");
  } catch (err) {
    btn.classList.remove("btn-loading", "is-loading");
    showAuthError("student", authErrorMessage(err.code) || err.message || "تعذّر إنشاء الحساب");
  }
}

/* ============================================================
   TEACHER DASHBOARD
   ============================================================ */
async function renderDashboard() {
  if (!currentProfile) return;

  const welcomeTitle = $("[data-welcome-title]");
  if (welcomeTitle) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";
    welcomeTitle.textContent = `${greeting}، ${(currentProfile.fullName || "").split(" ")[0] || ""}`;
  }

  const [exams, students, pendingRequests] = await Promise.all([
    listExams(currentProfile.uid),
    listMyStudents(currentProfile.uid),
    listTeacherRequests(currentProfile.uid, "pending")
  ]);

  let waitingGrading = 0;
  for (const exam of exams.slice(0, 15)) {
    const atts = await listAttempts(exam.id);
    waitingGrading += atts.filter((a) => a.status === "submitted" && !a.gradedAt).length;
  }

  const stats = {
    totalExams: exams.length,
    activeExams: exams.filter((e) => computeStatus(e) === "active").length,
    totalStudents: students.length,
    waitingGrading
  };

  $$("[data-stat]").forEach((e) => {
    if (stats[e.dataset.stat] != null) e.textContent = String(stats[e.dataset.stat]);
  });

  const recentHost = $("[data-recent-exams]");
  if (recentHost) {
    recentHost.innerHTML = "";
    if (!exams.length) {
      recentHost.appendChild(el("div", { class: "empty" }, [
        el("h3", { text: "لا توجد امتحانات بعد" }),
        el("p", { text: "أنشئ أول امتحان للبدء." }),
        el("button", { class: "btn btn-primary", type: "button", text: "إنشاء امتحان", onclick: () => navigate("/app/builder") })
      ]));
    } else {
      exams.slice(0, 6).forEach((exam) => recentHost.appendChild(buildExamCard(exam)));
    }
  }

  const requestsHost = $("[data-recent-requests]");
  if (requestsHost) {
    requestsHost.innerHTML = "";
    if (!pendingRequests.length) {
      requestsHost.appendChild(el("div", { class: "empty" }, [
        el("p", { class: "text-muted", text: "لا يوجد طلبات جديدة." })
      ]));
    } else {
      pendingRequests.slice(0, 6).forEach((req) => requestsHost.appendChild(buildRequestRow(req, true)));
    }
  }
}

function buildExamCard(exam) {
  const status = computeStatus(exam);
  const card = el("article", { class: "card-brutal tint-1 exam-card" });
  card.appendChild(el("div", { class: "exam-card-head" }, [
    el("div", {}, [
      el("div", { class: "exam-card-title", text: exam.title || "بدون اسم" }),
      el("div", { class: "exam-card-sub", text: `${subjectLabel(exam.subject)} - ${gradeLabel(exam.grade)}` })
    ]),
    el("span", { class: `badge badge-${status}`, text: statusLabel(status) })
  ]));
  const meta = el("div", { class: "exam-card-meta" });
  meta.appendChild(el("span", {}, [svgIcon("file-text", 14), document.createTextNode(`${exam.totalQuestions || 0} سؤال`)]));
  meta.appendChild(el("span", {}, [svgIcon("timer", 14), document.createTextNode(`${exam.duration || 0} دقيقة`)]));
  card.appendChild(meta);
  card.appendChild(el("div", { class: "exam-card-foot" }, [
    el("button", { class: "btn btn-primary btn-sm", type: "button", text: "فتح" })
  ]));
  card.addEventListener("click", () => navigate(`/app/exam?id=${exam.id}`));
  return card;
}

function buildRequestRow(req, compact = false) {
  const row = el("div", { class: "student-row" });
  const initial = getInitials(req.studentName);
  const color = colorFromString(req.studentUid);

  const avatar = el("div", { class: "student-avatar-letter", text: initial });
  avatar.style.background = color;
  row.appendChild(avatar);

  const info = el("div", { class: "student-info" });
  info.appendChild(el("div", { class: "student-name", text: req.studentName }));
  const meta = el("div", { class: "student-meta" });
  meta.appendChild(el("span", {}, [svgIcon("at-sign", 12), document.createTextNode(` ${req.studentPublicId || "-"}`)]));
  meta.appendChild(el("span", {}, [svgIcon("map-pin", 12), document.createTextNode(` ${req.studentGovernorate || "-"}`)]));
  info.appendChild(meta);
  row.appendChild(info);

  if (!compact) {
    const actions = el("div", { class: "student-actions" });
    if (req.status === "pending") {
      const approveBtn = el("button", { class: "btn btn-success btn-sm", type: "button" });
      approveBtn.appendChild(svgIcon("check", 14));
      approveBtn.appendChild(document.createTextNode(" قبول"));
      approveBtn.addEventListener("click", async () => {
        approveBtn.classList.add("is-loading");
        try {
          await approveStudentRequest(req.id);
          toast("تم قبول الطالب", "success");
          renderStudentsPage();
        } catch (err) {
          console.error(err);
          toast("تعذّر القبول", "error");
          approveBtn.classList.remove("is-loading");
        }
      });
      actions.appendChild(approveBtn);

      const rejectBtn = el("button", { class: "btn btn-outline btn-sm", type: "button" });
      rejectBtn.appendChild(svgIcon("x", 14));
      rejectBtn.appendChild(document.createTextNode(" رفض"));
      rejectBtn.addEventListener("click", async () => {
        rejectBtn.classList.add("is-loading");
        try {
          await rejectStudentRequest(req.id);
          toast("تم رفض الطلب", "info");
          renderStudentsPage();
        } catch (err) {
          console.error(err);
          toast("تعذّر الرفض", "error");
          rejectBtn.classList.remove("is-loading");
        }
      });
      actions.appendChild(rejectBtn);
    } else if (req.status === "approved") {
      const removeBtn = el("button", { class: "btn btn-outline btn-sm", type: "button" });
      removeBtn.appendChild(svgIcon("user-x", 14));
      removeBtn.appendChild(document.createTextNode(" إزالة"));
      removeBtn.addEventListener("click", async () => {
        await confirmRemoveStudent(req.studentUid, req.studentName);
      });
      actions.appendChild(removeBtn);
    }
    row.appendChild(actions);
  } else {
    const badge = el("span", { class: `badge badge-${req.status}`, text: statusLabel(req.status) });
    row.appendChild(badge);
  }

  return row;
}

async function confirmRemoveStudent(studentUid, studentName) {
  const passwordInput = el("input", { type: "password", class: "input", placeholder: "كلمة المرور" });
  const body = el("div", { class: "stack-sm" }, [
    el("p", { class: "text-secondary" }, [
      document.createTextNode(`هل تريد إزالة الطالب "${studentName}" من قائمتك؟`)
    ]),
    el("div", { class: "field" }, [
      el("label", { class: "field-label", text: "أدخل كلمة المرور للتأكيد" }),
      passwordInput
    ])
  ]);

  openModal({
    title: "تأكيد الإزالة",
    body,
    actions: [
      { label: "إلغاء", class: "btn-ghost" },
      {
        label: "إزالة",
        class: "btn-danger",
        onClick: async () => {
          const password = passwordInput.value;
          if (!password) { toast("أدخل كلمة المرور", "warning"); return false; }

          try {
            const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
            await reauthenticateWithCredential(auth.currentUser, cred);
          } catch {
            toast("كلمة المرور غير صحيحة", "error");
            return false;
          }

          try {
            await removeStudentFromTeacher(currentProfile.uid, studentUid);
            toast("تم إزالة الطالب", "success");
            renderStudentsPage();
          } catch (err) {
            console.error(err);
            toast("تعذّرت الإزالة", "error");
          }
          return true;
        }
      }
    ]
  });
}

/* ============================================================
   MY EXAMS
   ============================================================ */
let examsState = { all: [], filtered: [], status: "", search: "" };

async function renderMyExams() {
  const list = $("[data-exams-list]");
  if (!list) return;

  list.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    list.appendChild(el("div", { class: "sk-card" }, [
      el("div", { class: "skeleton sk-line sk-lg" }),
      el("div", { class: "skeleton sk-line sk-sm" }),
      el("div", { class: "skeleton sk-line" })
    ]));
  }

  examsState.all = await listExams(currentProfile.uid);
  applyExamFilters();

  const search = $("[data-exam-search]");
  if (search && !search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("input", debounce(() => {
      examsState.search = search.value.trim();
      applyExamFilters();
    }, 250));
  }

  const statusSel = $("[data-exam-filter-status]");
  if (statusSel && !statusSel.dataset.bound) {
    statusSel.dataset.bound = "1";
    statusSel.addEventListener("change", () => {
      examsState.status = statusSel.value;
      applyExamFilters();
    });
  }
}

function applyExamFilters() {
  const list = $("[data-exams-list]");
  const empty = $("[data-exams-empty]");
  if (!list) return;

  let arr = examsState.all.slice();
  if (examsState.status) arr = arr.filter((e) => computeStatus(e) === examsState.status);
  if (examsState.search) {
    const q = examsState.search.toLowerCase();
    arr = arr.filter((e) =>
      (e.title || "").toLowerCase().includes(q) ||
      (subjectLabel(e.subject) || "").toLowerCase().includes(q)
    );
  }
  arr.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  examsState.filtered = arr;

  list.innerHTML = "";
  if (!arr.length) { empty.hidden = false; return; }
  empty.hidden = true;
  arr.forEach((exam) => list.appendChild(buildExamCard(exam)));
}

/* ============================================================
   MY STUDENTS PAGE
   ============================================================ */
let studentsState = { tab: "approved", search: "", approved: [], pending: [], rejected: [] };

async function renderStudentsPage() {
  const list = $("[data-students-list]");
  if (!list) return;

  list.innerHTML = "";
  list.appendChild(el("div", { class: "sk-card" }, [el("div", { class: "skeleton sk-line sk-lg" })]));

  // Bind tabs once
  $$("[data-students-tab]").forEach((tab) => {
    if (tab.dataset.bound) return;
    tab.dataset.bound = "1";
    tab.addEventListener("click", () => {
      studentsState.tab = tab.dataset.studentsTab;
      $$("[data-students-tab]").forEach((t) => t.classList.toggle("is-active", t === tab));
      renderStudentsList();
    });
  });

  // Bind search
  const search = $("[data-students-search]");
  if (search && !search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("input", debounce(() => {
      studentsState.search = search.value.trim().toLowerCase();
      renderStudentsList();
    }, 200));
  }

  const [approved, pending, rejected] = await Promise.all([
    listMyStudents(currentProfile.uid),
    listTeacherRequests(currentProfile.uid, "pending"),
    listTeacherRequests(currentProfile.uid, "rejected")
  ]);

  studentsState.approved = approved;
  studentsState.pending = pending;
  studentsState.rejected = rejected;

  // Update counts
  const approvedCountEl = $("[data-approved-count]");
  const pendingCountEl = $("[data-pending-count]");
  if (approvedCountEl) approvedCountEl.textContent = String(approved.length);
  if (pendingCountEl) {
    pendingCountEl.textContent = String(pending.length);
    pendingCountEl.hidden = pending.length === 0;
  }

  // Sidebar badge
  const sideBadge = $("[data-students-badge]");
  if (sideBadge) {
    sideBadge.textContent = String(pending.length);
    sideBadge.hidden = pending.length === 0;
  }

  renderStudentsList();
}

function renderStudentsList() {
  const list = $("[data-students-list]");
  const empty = $("[data-students-empty]");
  const emptyTitle = $("[data-students-empty-title]");
  const emptyText = $("[data-students-empty-text]");
  if (!list) return;

  let source = [];
  let emptyT = "لا يوجد طلاب";
  let emptyP = "لم يقم أي طالب بإرسال طلب انضمام بعد.";

  if (studentsState.tab === "approved") {
    source = studentsState.approved;
    emptyT = "لا يوجد طلاب";
    emptyP = "لم يتم قبول أي طالب بعد.";
  } else if (studentsState.tab === "pending") {
    source = studentsState.pending;
    emptyT = "لا يوجد طلبات جديدة";
    emptyP = "كل الطلبات تمت معالجتها.";
  } else {
    source = studentsState.rejected;
    emptyT = "لا يوجد طلاب مرفوضون";
    emptyP = "لم يتم رفض أي طالب.";
  }

  // Filter by search
  if (studentsState.search) {
    source = source.filter((s) => {
      const name = (s.studentName || "").toLowerCase();
      const pid = String(s.studentPublicId || "");
      return name.includes(studentsState.search) || pid.includes(studentsState.search);
    });
  }

  list.innerHTML = "";

  if (!source.length) {
    if (empty) empty.hidden = false;
    if (emptyTitle) emptyTitle.textContent = emptyT;
    if (emptyText) emptyText.textContent = emptyP;
    return;
  }

  if (empty) empty.hidden = true;

  source.forEach((item) => {
    if (studentsState.tab === "approved") {
      list.appendChild(buildStudentRow(item));
    } else {
      list.appendChild(buildRequestRow(item, false));
    }
  });
}

function buildStudentRow(student) {
  const row = el("div", { class: "student-row" });
  const initial = getInitials(student.studentName);
  const color = colorFromString(student.studentUid);

  const avatar = el("div", { class: "student-avatar-letter", text: initial });
  avatar.style.background = color;
  row.appendChild(avatar);

  const info = el("div", { class: "student-info" });
  info.appendChild(el("div", { class: "student-name", text: student.studentName }));
  const meta = el("div", { class: "student-meta" });
  meta.appendChild(el("span", {}, [svgIcon("at-sign", 12), document.createTextNode(` ${student.studentPublicId || "-"}`)]));
  meta.appendChild(el("span", {}, [svgIcon("phone", 12), document.createTextNode(` ${student.studentPhone || "-"}`)]));
  meta.appendChild(el("span", {}, [svgIcon("map-pin", 12), document.createTextNode(` ${student.studentGovernorate || "-"}`)]));
  info.appendChild(meta);
  row.appendChild(info);

  const actions = el("div", { class: "student-actions" });
  const removeBtn = el("button", { class: "btn btn-outline btn-sm", type: "button" });
  removeBtn.appendChild(svgIcon("user-x", 14));
  removeBtn.appendChild(document.createTextNode(" إزالة"));
  removeBtn.addEventListener("click", () => confirmRemoveStudent(student.studentUid, student.studentName));
  actions.appendChild(removeBtn);
  row.appendChild(actions);

  return row;
}

/* ============================================================
   EXAM STATUS
   ============================================================ */
function computeStatus(exam) {
  if (!exam) return "draft";
  if (!exam.publishedAt) return "draft";
  if (exam.manualStatus === "paused") return "paused";

  const now = Date.now();
  const start = exam.startAt?.toMillis ? exam.startAt.toMillis() : null;
  const end = exam.endAt?.toMillis ? exam.endAt.toMillis() : null;

  if (end && now > end) return "completed";
  if (start && now < start) return "scheduled";
  return "active";
}

function isExamFullyGraded(exam, attempts) {
  const submitted = attempts.filter((a) => a.status === "submitted" || a.status === "graded");
  if (!submitted.length) return false;
  return submitted.every((a) => a.gradedAt != null);
}

function shouldShowLeaderboard(exam, attempts) {
  const status = computeStatus(exam);
  if (status !== "completed") return false;
  if (!exam.resultPublishedAt) return false;
  return isExamFullyGraded(exam, attempts);
}

function getAllExamQuestions(exam) {
  if (exam.forms && exam.forms.length) return exam.forms.flatMap((f) => f.questions || []);
  return exam.questions || [];
}

/* ============================================================
   STUDENT DASHBOARD
   ============================================================ */
async function renderStudentDashboard() {
  if (!currentStudentProfile) return;

  const welcomeTitle = $("[data-student-welcome]");
  if (welcomeTitle) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";
    welcomeTitle.textContent = `${greeting}، ${(currentStudentProfile.fullName || "").split(" ")[0] || ""}`;
  }

  const teachers = await listMyTeachers(currentStudentProfile.uid);
  const upcoming = await listUpcomingExamsForStudent(teachers);
  const history = await listStudentHistory(currentStudentProfile.uid);
  const requestsSnap = await getDocs(query(
    collection(db, "studentRequests"),
    where("studentUid", "==", currentStudentProfile.uid),
    where("status", "==", "pending")
  ));

  const stats = {
    teachers: teachers.length,
    availableExams: upcoming.filter((e) => computeStatus(e) === "active").length,
    completedExams: history.filter((h) => h.status === "graded").length,
    pendingRequests: requestsSnap.size
  };

  $$("[data-student-stat]").forEach((e) => {
    if (stats[e.dataset.studentStat] != null) e.textContent = String(stats[e.dataset.studentStat]);
  });

  const upcomingHost = $("[data-student-upcoming]");
  if (upcomingHost) {
    upcomingHost.innerHTML = "";
    const active = upcoming.filter((e) => computeStatus(e) === "active");
    if (!active.length) {
      upcomingHost.appendChild(el("div", { class: "empty" }, [
        el("p", { class: "text-muted", text: "لا يوجد امتحانات متاحة حاليا." })
      ]));
    } else {
      active.slice(0, 6).forEach((exam) => upcomingHost.appendChild(buildStudentExamCard(exam)));
    }
  }
}

function buildStudentExamCard(exam) {
  const status = computeStatus(exam);
  const card = el("article", { class: "card-brutal tint-1 exam-card" });
  card.appendChild(el("div", { class: "exam-card-head" }, [
    el("div", {}, [
      el("div", { class: "exam-card-title", text: exam.title || "بدون اسم" }),
      el("div", { class: "exam-card-sub", text: `${exam.teacherName || "-"} - ${subjectLabel(exam.subject)}` })
    ]),
    el("span", { class: `badge badge-${status}`, text: statusLabel(status) })
  ]));
  const meta = el("div", { class: "exam-card-meta" });
  meta.appendChild(el("span", {}, [svgIcon("file-text", 14), document.createTextNode(`${exam.totalQuestions || 0} سؤال`)]));
  meta.appendChild(el("span", {}, [svgIcon("timer", 14), document.createTextNode(`${exam.duration || 0} دقيقة`)]));
  meta.appendChild(el("span", {}, [svgIcon("user", 14), document.createTextNode(gradeLabel(exam.grade))]));
  card.appendChild(meta);
  card.appendChild(el("div", { class: "exam-card-foot" }, [
    el("button", { class: "btn btn-primary btn-sm", type: "button", text: "فتح الامتحان" })
  ]));
  card.addEventListener("click", () => navigate(`/exam?id=${exam.id}`));
  return card;
}

/* ============================================================
   STUDENT: TEACHERS SEARCH
   ============================================================ */
async function renderStudentTeachers() {
  const results = $("[data-teachers-results]");
  const empty = $("[data-teachers-empty]");
  if (!results) return;

  // Bind search
  const search = $("[data-teacher-search]");
  if (search && !search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("input", debounce(async () => {
      const q = search.value.trim();
      if (!q) {
        results.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
      }
      results.innerHTML = "";
      const found = await searchTeachers(q);
      if (!found.length) {
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      for (const t of found) {
        results.appendChild(await buildTeacherCard(t));
      }
    }, 400));
  }
}

async function buildTeacherCard(teacher) {
  const card = el("div", { class: "teacher-card" });
  const avatar = el("img", {
    class: "teacher-card-avatar",
    src: teacher.photoURL || "https://i.ibb.co/39cB8Cbv/file-00000000dac881f48b765e030a2b4313.png",
    alt: "",
    draggable: "false"
  });
  card.appendChild(avatar);

  const info = el("div", { class: "teacher-card-info" });
  info.appendChild(el("div", { class: "teacher-card-name", text: teacher.fullName || "-" }));
  info.appendChild(el("div", { class: "teacher-card-username", text: "@" + (teacher.username || "-") }));
  const meta = el("div", { class: "teacher-card-meta" });
  meta.appendChild(el("span", {}, [svgIcon("at-sign", 12), document.createTextNode(` ${teacher.publicId || "-"}`)]));
  meta.appendChild(el("span", {}, [svgIcon("map-pin", 12), document.createTextNode(` ${teacher.governorate || "-"}`)]));
  info.appendChild(meta);
  card.appendChild(info);

  // Action button
  const actionWrap = el("div", { class: "teacher-card-action" });

  // Check if already related
  const isStudent = await getDoc(doc(db, "studentTeachers", currentStudentProfile.uid, "teachers", teacher.uid));
  if (isStudent.exists()) {
    const badge = el("span", { class: "badge badge-approved", text: "منضم" });
    actionWrap.appendChild(badge);
  } else {
    // Check pending request
    const reqSnap = await getDocs(query(
      collection(db, "studentRequests"),
      where("studentUid", "==", currentStudentProfile.uid),
      where("teacherUid", "==", teacher.uid),
      orderBy("createdAt", "desc"),
      limit(1)
    ));

    let canSend = true;
    if (!reqSnap.empty) {
      const last = reqSnap.docs[0].data();
      if (last.status === "pending") {
        actionWrap.appendChild(el("span", { class: "badge badge-pending", text: "قيد المراجعة" }));
        canSend = false;
      } else if (last.status === "rejected" && last.respondedAt) {
        const dt = last.respondedAt.toDate ? last.respondedAt.toDate() : new Date(last.respondedAt);
        const days = (Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24);
        if (days < SYSTEM_LIMITS.STUDENT_REQUEST_COOLDOWN_DAYS) {
          const remain = Math.ceil(SYSTEM_LIMITS.STUDENT_REQUEST_COOLDOWN_DAYS - days);
          const badge = el("span", { class: "badge badge-rejected", text: `مرفوض (${remain} يوم)` });
          actionWrap.appendChild(badge);
          canSend = false;
        }
      }
    }

    if (canSend) {
      const sendBtn = el("button", { class: "btn btn-primary btn-sm", type: "button" });
      sendBtn.appendChild(svgIcon("send", 14));
      sendBtn.appendChild(document.createTextNode(" إرسال طلب"));
      sendBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        sendBtn.classList.add("is-loading");
        try {
          await sendStudentRequest(currentStudentProfile.uid, teacher.uid);
          toast("تم إرسال الطلب", "success");
          renderStudentTeachers();
        } catch (err) {
          if (err.message === "MAX_TEACHERS") {
            toast("وصلت للحد الأقصى (100 معلم)", "error");
          } else if (err.message === "COOLDOWN") {
            toast(`انتظر ${err.daysRemaining} يوم قبل المحاولة`, "warning");
          } else if (err.message === "REQUEST_PENDING") {
            toast("الطلب قيد المراجعة", "info");
          } else {
            toast("تعذّر إرسال الطلب", "error");
          }
          sendBtn.classList.remove("is-loading");
        }
      });
      actionWrap.appendChild(sendBtn);
    }
  }

  card.appendChild(actionWrap);
  return card;
}

/* ============================================================
   STUDENT: MASTER EXAMS
   ============================================================ */
async function renderStudentMasters() {
  const list = $("[data-master-exams-list]");
  const empty = $("[data-master-exams-empty]");
  if (!list) return;

  list.innerHTML = "";
  list.appendChild(el("div", { class: "sk-card" }, [el("div", { class: "skeleton sk-line sk-lg" })]));

  $$("[data-master-tab]").forEach((tab) => {
    if (tab.dataset.bound) return;
    tab.dataset.bound = "1";
    tab.addEventListener("click", () => {
      $$("[data-master-tab]").forEach((t) => t.classList.toggle("is-active", t === tab));
      renderStudentMasters();
    });
  });

  const activeTab = $(".master-tab.is-active")?.dataset.masterTab || "available";

  const teachers = await listMyTeachers(currentStudentProfile.uid);
  const exams = await listUpcomingExamsForStudent(teachers);

  let filtered = exams;
  if (activeTab === "available") filtered = exams.filter((e) => computeStatus(e) === "active");
  else filtered = exams.filter((e) => computeStatus(e) === "scheduled");

  list.innerHTML = "";
  if (!filtered.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  filtered.forEach((exam) => list.appendChild(buildStudentExamCard(exam)));
}

/* ============================================================
   STUDENT: HISTORY
   ============================================================ */
async function renderStudentHistory() {
  const list = $("[data-history-list]");
  const empty = $("[data-history-empty]");
  if (!list) return;

  list.innerHTML = "";
  list.appendChild(el("div", { class: "sk-card" }, [el("div", { class: "skeleton sk-line sk-lg" })]));

  const history = await listStudentHistory(currentStudentProfile.uid);

  const search = $("[data-history-search]");
  if (search && !search.dataset.bound) {
    search.dataset.bound = "1";
    search.addEventListener("input", debounce(() => {
      renderStudentHistoryList(history, search.value.trim().toLowerCase());
    }, 200));
  }

  renderStudentHistoryList(history, "");
}

function renderStudentHistoryList(history, query) {
  const list = $("[data-history-list]");
  const empty = $("[data-history-empty]");
  if (!list) return;

  let filtered = history;
  if (query) {
    filtered = history.filter((h) => {
      const title = (h.exam?.title || "").toLowerCase();
      return title.includes(query);
    });
  }

  list.innerHTML = "";
  if (!filtered.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  filtered.forEach((item) => {
    const exam = item.exam;
    if (!exam) return;

    const card = el("div", { class: "history-card" });
    const info = el("div", { class: "history-card-info" });
    info.appendChild(el("div", { class: "history-card-title", text: exam.title || "بدون اسم" }));
    const meta = el("div", { class: "history-card-meta" });
    meta.appendChild(el("span", {}, [svgIcon("user", 12), document.createTextNode(` ${exam.teacherName || "-"}`)]));
    meta.appendChild(el("span", {}, [svgIcon("clock", 12), document.createTextNode(` ${fmtDateShort(item.submittedAt || item.createdAt)}`)]));
    info.appendChild(meta);
    card.appendChild(info);

    const scoreWrap = el("div", { class: "history-card-score" });
    if (item.status === "graded" && item.score != null) {
      scoreWrap.appendChild(el("div", { class: "history-score-value", text: String(item.score) }));
      const total = exam.totalScore || 0;
      scoreWrap.appendChild(el("div", { class: "history-score-label", text: `/ ${total}` }));
    } else {
      scoreWrap.appendChild(el("div", { class: "history-score-label", text: statusLabel(item.status) }));
    }
    card.appendChild(scoreWrap);

    card.addEventListener("click", () => {
      sessionStorage.setItem("qeyasquiz.lastAttempt", item.id);
      localStorage.setItem("qeyasquiz.lastAttempt", item.id);
      navigate("/result");
    });

    list.appendChild(card);
  });
}

/* ============================================================
   STUDENT: JOIN ROOM
   ============================================================ */
const ROOM_HISTORY_KEY = "qeyasquiz.roomHistory";

async function renderStudentJoin() {
  const form = $("[data-room-form]");
  const input = $("[data-room-input]");
  const errorBox = $("[data-room-error]");
  const errorText = $("[data-room-error-text]");

  // Load history
  const history = JSON.parse(localStorage.getItem(ROOM_HISTORY_KEY) || "[]");
  const historyWrap = $("[data-room-history]");
  const historyList = $("[data-room-history-list]");
  if (historyWrap && historyList && history.length) {
    historyWrap.hidden = false;
    historyList.innerHTML = "";
    history.forEach((code) => {
      const chip = el("button", { type: "button", class: "chip", text: formatRoomCode(code) });
      chip.addEventListener("click", () => {
        input.value = formatRoomCode(code);
        input.focus();
      });
      historyList.appendChild(chip);
    });
  }

  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";

  // Auto-format input
  input.addEventListener("input", () => {
    const clean = normalizeRoomCode(input.value);
    if (clean.length > SYSTEM_LIMITS.ROOM_CODE_LENGTH) {
      input.value = formatRoomCode(clean.slice(0, SYSTEM_LIMITS.ROOM_CODE_LENGTH));
    } else {
      const before = input.value;
      const formatted = formatRoomCode(clean);
      if (before !== formatted && input.value === before) {
        // Only reformat if user isn't in the middle of typing a dash
        input.value = formatted;
      }
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errorBox) errorBox.hidden = true;

    const raw = normalizeRoomCode(input.value);
    if (raw.length !== SYSTEM_LIMITS.ROOM_CODE_LENGTH) {
      if (errorBox) errorBox.hidden = false;
      if (errorText) errorText.textContent = "الكود لازم 12 حرف أو رقم";
      return;
    }

    const submitBtn = $("[data-room-submit]");
    submitBtn.classList.add("is-loading");

    try {
      const room = await findExamByRoomCode(raw);
      if (!room) {
        if (errorBox) errorBox.hidden = false;
        if (errorText) errorText.textContent = "الكود غير صحيح";
        submitBtn.classList.remove("is-loading");
        return;
      }

      if (!room.active) {
        if (errorBox) errorBox.hidden = false;
        if (errorText) errorText.textContent = "الامتحان غير نشط حاليا";
        submitBtn.classList.remove("is-loading");
        return;
      }

      if (room.expiresAt) {
        const exp = room.expiresAt.toDate ? room.expiresAt.toDate() : new Date(room.expiresAt);
        if (exp.getTime() < Date.now()) {
          if (errorBox) errorBox.hidden = false;
          if (errorText) errorText.textContent = "انتهت صلاحية الكود";
          submitBtn.classList.remove("is-loading");
          return;
        }
      }

      // Save to history
      const existing = JSON.parse(localStorage.getItem(ROOM_HISTORY_KEY) || "[]");
      const updated = [raw, ...existing.filter((c) => c !== raw)].slice(0, 5);
      localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(updated));

      navigate(`/exam?id=${room.examId}`);
    } catch (err) {
      console.error(err);
      if (errorBox) errorBox.hidden = false;
      if (errorText) errorText.textContent = "تعذّر البحث - حاول مرة أخرى";
      submitBtn.classList.remove("is-loading");
    }
  });
}

/* ============================================================
   TEACHER: EXAM BUILDER
   ============================================================ */
const BUILDER_STEPS = ["info", "questions", "forms", "settings"];

let builderState = {
  examId: null,
  currentStep: "info",
  currentFormIndex: 0,
  data: {
    title: "", subject: "", grade: "", duration: 60,
    startAt: null, endAt: null,
    displayMode: "scroll",
    shuffleQuestions: false,
    forms: [{ id: "A", name: "النموذج أ", questions: [] }]
  }
};

async function renderBuilder(params) {
  const examId = params?.get("id");
  if (examId) {
    const exam = await getExam(examId);
    if (exam && exam.ownerId === currentProfile.uid) {
      builderState.examId = examId;
      const answersMap = await getExamAnswers(examId);

      const mergedForms = (exam.forms && exam.forms.length
        ? exam.forms
        : [{ id: "A", name: "النموذج أ", questions: exam.questions || [] }]
      ).map((form) => ({
        ...form,
        questions: (form.questions || []).map((q) => {
          const ans = answersMap[q.id] || {};
          return {
            ...q,
            header: q.header || "",
            explanation: q.explanation || "",
            correctIndex: ans.correctIndex ?? 0,
            correctBool: ans.correctBool ?? null,
            correctText: ans.correctText || "",
            modelAnswer: ans.modelAnswer || "",
            justificationModelAnswer: ans.justificationModelAnswer || "",
            _saved: !!answersMap[q.id]
          };
        })
      }));

      builderState.data = { ...builderState.data, ...exam, forms: mergedForms };
      builderState.currentFormIndex = 0;
    }
  } else {
    builderState.examId = null;
    builderState.currentFormIndex = 0;
    builderState.data = {
      title: "", subject: "", grade: "", duration: 60,
      startAt: null, endAt: null,
      displayMode: "scroll",
      shuffleQuestions: false,
      forms: [{ id: "A", name: "النموذج أ", questions: [] }]
    };
  }
  renderBuilderUI();
  initBuilderEvents();
}

function renderBuilderUI() {
  const d = builderState.data;
  const setVal = (sel, v) => { const e = $(sel); if (e) e.value = v ?? ""; };
  setVal("#examTitle", d.title);
  setVal("#examGrade", d.grade);
  setVal("#examDuration", d.duration || 60);
  setVal("#examStart", toLocalInput(d.startAt));
  setVal("#examEnd", toLocalInput(d.endAt));

  const subjSel = $("#examSubject");
  if (subjSel) {
    subjSel.innerHTML = `<option value="">اختر المادة</option>`;
    SUBJECTS.forEach((s) => {
      subjSel.appendChild(el("option", { value: s.id, text: s.ar }));
    });
    subjSel.value = d.subject || "";
  }

  $$('[data-field="displayMode"]').forEach((radio) => {
    radio.checked = radio.value === (d.displayMode || "scroll");
    const card = radio.closest(".mode-card");
    if (card) card.classList.toggle("is-selected", radio.checked);
  });

  const setChk = (sel, v) => { const e = $(sel); if (e) e.checked = !!v; };
  setChk('[data-field="shuffleQuestions"]', d.shuffleQuestions);

  renderBuilderQuestions();
  renderBuilderForms();
  updateBuilderTotalScore();
  updateBuilderTitle();
  switchBuilderStep(builderState.currentStep);
}

function updateBuilderTitle() {
  const title = $("[data-builder-title]");
  if (title) title.textContent = builderState.data.title || "امتحان جديد";
  const statusEl = $("[data-builder-status]");
  if (statusEl) {
    const st = builderState.data.status || "draft";
    statusEl.textContent = statusLabel(st);
    statusEl.className = `badge badge-${st}`;
  }
}

function switchBuilderStep(step) {
  builderState.currentStep = step;
  const idx = BUILDER_STEPS.indexOf(step);

  $$(".builder-step").forEach((b) => {
    const bi = BUILDER_STEPS.indexOf(b.dataset.step);
    b.classList.toggle("is-active", b.dataset.step === step);
    b.classList.toggle("is-done", bi < idx);
  });

  $$(".builder-panel").forEach((p) => { p.hidden = p.dataset.panel !== step; });

  const backBtn = $("[data-builder-back]");
  const nextBtn = $("[data-builder-next]");
  const publishBtn = $("[data-builder-publish]");
  const indicator = $("[data-builder-step-indicator]");

  if (backBtn) backBtn.disabled = idx === 0;
  if (nextBtn) nextBtn.hidden = idx === BUILDER_STEPS.length - 1;
  if (publishBtn) publishBtn.hidden = idx !== BUILDER_STEPS.length - 1;
  if (indicator) indicator.innerHTML = `خطوة ${idx + 1} / ${BUILDER_STEPS.length}`;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateBuilderTotalScore() {
  const total = getAllBuilderQuestions().reduce((s, q) => s + (Number(q.score) || 0), 0);
  const e = $("[data-total-score]");
  if (e) e.textContent = String(total);
}

function getAllBuilderQuestions() {
  return builderState.data.forms.flatMap((f) => f.questions || []);
}

function renderBuilderQuestions() {
  const host = $("[data-questions-list]");
  if (!host) return;
  host.innerHTML = "";

  const form = builderState.data.forms[builderState.currentFormIndex];
  const questions = form?.questions || [];

  if (!questions.length) {
    host.appendChild(el("div", { class: "empty", style: "padding:var(--sp-8)" }, [
      el("p", { class: "text-muted", text: "لا توجد أسئلة بعد." })
    ]));
    return;
  }
  questions.forEach((q, idx) => host.appendChild(buildQuestionCard(q, idx)));
}

function qTypeLabel(type) {
  return {
    mcq: "اختيار من متعدد", mcq_just: "اختيار + تبرير",
    tf: "صح / خطأ", tf_just: "صح / خطأ + تبرير",
    complete: "أكمل", essay: "مقالي"
  }[type] || type;
}

function buildQuestionCard(q, idx) {
  const card = el("div", { class: "question-card" });
  card.dataset.qid = q.id;

  const statusBar = el("div", { class: "q-status-bar" });
  card.appendChild(statusBar);

  function updateCardStatus() {
    if (q._saved === true) card.dataset.status = "saved";
    else if (q._error) card.dataset.status = "error";
    else card.dataset.status = "unsaved";
  }

  const head = el("div", { class: "question-card-head" });
  const numWrap = el("div", { class: "question-card-num" });
  numWrap.appendChild(el("span", { text: String(idx + 1) }));
  numWrap.appendChild(el("span", { class: "question-type-badge", text: qTypeLabel(q.type) }));
  head.appendChild(numWrap);

  const actions = el("div", { class: "question-card-actions" });
  const dup = el("button", { class: "icon-btn", type: "button", title: "نسخ" });
  dup.appendChild(svgIcon("duplicate", 16));
  dup.addEventListener("click", () => duplicateQuestion(idx));
  actions.appendChild(dup);
  const del = el("button", { class: "icon-btn", type: "button", title: "حذف" });
  del.appendChild(svgIcon("trash", 16));
  del.addEventListener("click", () => deleteQuestion(idx));
  actions.appendChild(del);
  head.appendChild(actions);
  card.appendChild(head);

  const saveRow = el("div", { class: "q-save-row" });
  const saveBtn = el("button", { type: "button", class: "btn btn-sm" });

  function updateSaveBtn() {
    saveBtn.innerHTML = "";
    if (q._saved === true) {
      saveBtn.className = "btn btn-success btn-sm";
      saveBtn.appendChild(svgIcon("check", 14));
      saveBtn.appendChild(document.createTextNode(" تم حفظ السؤال والإجابة"));
    } else {
      saveBtn.className = "btn btn-primary btn-sm";
      saveBtn.appendChild(svgIcon("save", 14));
      saveBtn.appendChild(document.createTextNode(" حفظ السؤال والإجابة"));
    }
  }

  function markQuestionUnsaved() {
    if (q._saved !== false) {
      q._saved = false; q._error = false;
      updateSaveBtn(); updateCardStatus();
    }
  }

  saveBtn.addEventListener("click", async () => {
    saveBtn.classList.add("is-loading");
    try {
      const err = validateSingleQuestion(q);
      if (err) {
        q._error = true; updateCardStatus();
        toast(err, "warning");
        saveBtn.classList.remove("is-loading");
        return;
      }
      q._error = false;
      await saveSingleQuestion(q);
      q._saved = true;
      updateSaveBtn(); updateCardStatus();
      toast("تم حفظ السؤال والإجابة", "success");
    } catch (err) {
      console.error("[saveQuestion]", err);
      q._error = true; updateCardStatus();
      toast(`فشل حفظ السؤال ${idx + 1}`, "error", 6000);
    } finally { saveBtn.classList.remove("is-loading"); }
  });

  updateSaveBtn();
  saveRow.appendChild(saveBtn);
  card.appendChild(saveRow);

  const body = el("div", { class: "question-body" });

  const headerField = el("div", { class: "field" });
  const headerLabel = el("label", { class: "field-label" });
  headerLabel.appendChild(document.createTextNode("رأس السؤال "));
  headerLabel.appendChild(el("span", { class: "text-danger", text: "*" }));
  headerField.appendChild(headerLabel);
  const headerInput = el("input", {
    type: "text", class: "input", maxlength: "200",
    placeholder: "مثال: بم تفسر، أعرب كلمة، اذكر السبب..."
  });
  headerInput.value = q.header || "";
  headerInput.addEventListener("input", () => { q.header = headerInput.value; markQuestionUnsaved(); markDirty(); });
  headerField.appendChild(headerInput);
  body.appendChild(headerField);

  const textField = el("div", { class: "field" });
  textField.appendChild(el("label", { class: "field-label", text: "نص السؤال" }));
  const ta = el("textarea", { class: "textarea" });
  ta.placeholder = "اكتب نص السؤال...";
  ta.value = q.text || "";
  ta.addEventListener("input", () => { q.text = ta.value; markQuestionUnsaved(); markDirty(); });
  textField.appendChild(ta);
  body.appendChild(textField);

  const imgField = el("div", { class: "field" });
  const imgRow = el("div", { class: "row" });
  const fileInput = el("input", { type: "file", accept: "image/*", hidden: "hidden" });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      toast("جارٍ الرفع...", "info", 2000);
      const url = await uploadQuestionImage(builderState.examId, f);
      q.imageUrl = url;
      markQuestionUnsaved(); renderBuilderQuestions(); markDirty();
    } catch (err) { toast(uploadErrorMessage(err, "5 ميجابايت"), "error", 7000); }
  });
  const uploadBtn = el("button", { class: "btn btn-outline btn-sm", type: "button" });
  uploadBtn.appendChild(svgIcon("image", 14));
  uploadBtn.appendChild(document.createTextNode(" صورة"));
  uploadBtn.addEventListener("click", () => fileInput.click());
  imgRow.appendChild(uploadBtn);
  if (q.imageUrl) {
    const preview = el("img", { src: q.imageUrl, style: "max-width:120px;border-radius:8px;border:1px solid var(--border-subtle)" });
    imgRow.appendChild(preview);
    const rm = el("button", { class: "icon-btn", type: "button" });
    rm.appendChild(svgIcon("x", 14));
    rm.addEventListener("click", () => {
      q.imageUrl = null; markQuestionUnsaved(); renderBuilderQuestions(); markDirty();
    });
    imgRow.appendChild(rm);
  }
  imgRow.appendChild(fileInput);
  imgField.appendChild(imgRow);
  body.appendChild(imgField);

  if (q.type === "mcq" || q.type === "mcq_just") {
    const opts = el("div", { class: "question-options" });
    (q.options || []).forEach((opt, i) => {
      const row = el("div", { class: "option-row" });
      const radio = el("input", { type: "radio", name: "correct_" + q.id });
      radio.checked = q.correctIndex === i;
      radio.addEventListener("change", () => { q.correctIndex = i; markQuestionUnsaved(); markDirty(); });
      row.appendChild(radio);
      row.appendChild(el("span", { class: "option-label", text: String.fromCharCode(65 + i) }));
      const inp = el("input", { type: "text", class: "input", value: opt || "" });
      inp.placeholder = "خيار " + String.fromCharCode(65 + i);
      inp.addEventListener("input", () => { q.options[i] = inp.value; markQuestionUnsaved(); markDirty(); });
      row.appendChild(inp);

      const delBtn = el("button", { class: "icon-btn", type: "button" });
      delBtn.appendChild(svgIcon("x", 14));
      delBtn.addEventListener("click", () => {
        q.options.splice(i, 1);
        if (q.correctIndex === i) q.correctIndex = 0;
        else if (q.correctIndex > i) q.correctIndex--;
        markQuestionUnsaved(); renderBuilderQuestions(); markDirty();
      });
      row.appendChild(delBtn);
      opts.appendChild(row);
    });

    if ((q.options?.length || 0) < 8) {
      const addBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button" });
      addBtn.appendChild(svgIcon("plus", 14));
      addBtn.appendChild(document.createTextNode(" إضافة خيار"));
      addBtn.addEventListener("click", () => {
        q.options = q.options || [];
        q.options.push("");
        markQuestionUnsaved(); renderBuilderQuestions(); markDirty();
      });
      opts.appendChild(addBtn);
    }
    body.appendChild(opts);

    if (q.type === "mcq_just") {
      const jField = el("div", { class: "field mt-3" });
      jField.appendChild(el("label", { class: "field-label", text: "الإجابة النموذجية للتبرير" }));
      const jTa = el("textarea", { class: "textarea" });
      jTa.value = q.justificationModelAnswer || "";
      jTa.addEventListener("input", () => { q.justificationModelAnswer = jTa.value; markQuestionUnsaved(); markDirty(); });
      jField.appendChild(jTa);
      body.appendChild(jField);
    }
  }

  if (q.type === "tf" || q.type === "tf_just") {
    const wrap = el("div", { class: "question-options" });
    [{ v: true, l: "صح" }, { v: false, l: "خطأ" }].forEach(({ v, l }) => {
      const row = el("div", { class: "option-row" });
      const radio = el("input", { type: "radio", name: "tf_" + q.id });
      radio.checked = q.correctBool === v;
      radio.addEventListener("change", () => { q.correctBool = v; markQuestionUnsaved(); markDirty(); });
      row.appendChild(radio);
      row.appendChild(el("span", { text: l }));
      wrap.appendChild(row);
    });
    body.appendChild(wrap);

    if (q.type === "tf_just") {
      const jField = el("div", { class: "field mt-3" });
      jField.appendChild(el("label", { class: "field-label", text: "الإجابة النموذجية للتبرير" }));
      const jTa = el("textarea", { class: "textarea" });
      jTa.value = q.justificationModelAnswer || "";
      jTa.addEventListener("input", () => { q.justificationModelAnswer = jTa.value; markQuestionUnsaved(); markDirty(); });
      jField.appendChild(jTa);
      body.appendChild(jField);
    }
  }

  if (q.type === "complete") {
    const f = el("div", { class: "field" });
    f.appendChild(el("label", { class: "field-label", text: "الإجابة الصحيحة" }));
    const inp = el("input", { type: "text", class: "input", value: q.correctText || "" });
    inp.addEventListener("input", () => { q.correctText = inp.value; markQuestionUnsaved(); markDirty(); });
    f.appendChild(inp);
    body.appendChild(f);
  }

  if (q.type === "essay") {
    const f = el("div", { class: "field" });
    f.appendChild(el("label", { class: "field-label", text: "الإجابة النموذجية" }));
    const txt = el("textarea", { class: "textarea" });
    txt.value = q.modelAnswer || "";
    txt.addEventListener("input", () => { q.modelAnswer = txt.value; markQuestionUnsaved(); markDirty(); });
    f.appendChild(txt);
    body.appendChild(f);
  }

  const explanationField = el("div", { class: "field" });
  explanationField.appendChild(el("label", { class: "field-label", text: "الشرح (اختياري)" }));
  const expTa = el("textarea", { class: "textarea" });
  expTa.value = q.explanation || "";
  expTa.addEventListener("input", () => { q.explanation = expTa.value; markQuestionUnsaved(); markDirty(); });
  explanationField.appendChild(expTa);
  body.appendChild(explanationField);

  const scoreF = el("div", { class: "field" });
  scoreF.appendChild(el("label", { class: "field-label", text: "الدرجة" }));
  const scoreInp = el("input", {
    type: "number", class: "input",
    min: "0.5", step: "0.5", value: q.score || 1,
    style: "max-width:120px"
  });
  scoreInp.addEventListener("input", () => {
    q.score = Number(scoreInp.value) || 0;
    markQuestionUnsaved();
    updateBuilderTotalScore();
    markDirty();
  });
  scoreF.appendChild(scoreInp);
  body.appendChild(scoreF);

  card.appendChild(body);
  updateCardStatus();
  return card;
}

function validateSingleQuestion(q) {
  if (!q.header || !q.header.trim()) return "أدخل رأس السؤال";
  if (!q.text || !q.text.trim()) return "أدخل نص السؤال";

  if (q.type === "mcq" || q.type === "mcq_just") {
    const opts = q.options || [];
    const filled = opts.filter((o) => o && o.trim());
    if (filled.length < 2) return "أدخل خيارين على الأقل";
    if (q.correctIndex == null || q.correctIndex >= opts.length) return "اختر الإجابة الصحيحة";
    if (!opts[q.correctIndex] || !opts[q.correctIndex].trim()) return "الإجابة الصحيحة فارغة";
  }

  if (q.type === "tf" || q.type === "tf_just") {
    if (q.correctBool == null) return "اختر الإجابة الصحيحة";
  }

  if (q.type === "complete") {
    if (!q.correctText || !q.correctText.trim()) return "أدخل الإجابة الصحيحة";
  }

  if (q.type === "essay") {
    if (!q.modelAnswer || !q.modelAnswer.trim()) return "أدخل الإجابة النموذجية";
  }

  if (!q.score || Number(q.score) <= 0) return "أدخل درجة صحيحة";

  return null;
}

function buildCleanFormQuestion(q) {
  const out = {
    id: q.id, type: q.type,
    header: q.header || "",
    text: q.text,
    score: Number(q.score) || 0
  };
  if (q.explanation) out.explanation = q.explanation;
  if (q.imageUrl) out.imageUrl = q.imageUrl;
  if (q.type === "mcq" || q.type === "mcq_just") out.options = q.options || [];
  return out;
}

function buildAnswerKey(allQuestions) {
  const answerKey = {};
  allQuestions.forEach((q) => {
    const a = {};
    if (q.type === "mcq" || q.type === "mcq_just") a.correctIndex = q.correctIndex;
    else if (q.type === "tf" || q.type === "tf_just") a.correctBool = q.correctBool;
    else if (q.type === "complete") a.correctText = q.correctText || "";
    else if (q.type === "essay") a.modelAnswer = q.modelAnswer || "";
    if (q.type === "mcq_just" || q.type === "tf_just") {
      a.justificationModelAnswer = q.justificationModelAnswer || "";
    }
    answerKey[q.id] = a;
  });
  return answerKey;
}

async function saveSingleQuestion(q) {
  if (!currentProfile) throw new Error("Not logged in");

  if (!builderState.examId) {
    await autosaveBuilderNow();
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!builderState.examId) throw new Error("Could not create exam");

  const answerKey = buildAnswerKey([q]);
  const answersRef = doc(db, "examAnswers", builderState.examId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(answersRef);
    const existing = snap.exists() ? (snap.data().answers || {}) : {};
    const merged = { ...existing, ...answerKey };
    tx.set(answersRef, {
      ownerId: currentProfile.uid, examId: builderState.examId,
      answers: merged, updatedAt: serverTimestamp()
    });
  });

  const cleanForms = builderState.data.forms.map((form) => ({
    id: form.id, name: form.name,
    questions: (form.questions || []).map(buildCleanFormQuestion)
  }));

  const allQuestions = cleanForms.flatMap((f) => f.questions);
  const totalScore = allQuestions.reduce((s, qq) => s + (Number(qq.score) || 0), 0);

  await updateDoc(doc(db, "exams", builderState.examId), {
    forms: cleanForms,
    questions: cleanForms[0]?.questions || [],
    totalQuestions: allQuestions.length,
    totalScore,
    updatedAt: serverTimestamp()
  });
}

async function autosaveBuilderNow() {
  if (!currentProfile) return;
  const d = builderState.data;
  if (!d.title.trim()) return;

  const cleanForms = d.forms.map((form) => ({
    id: form.id, name: form.name,
    questions: (form.questions || []).map(buildCleanFormQuestion)
  }));

  const answerKey = {};
  d.forms.forEach((form) => {
    (form.questions || []).forEach((q) => {
      if (!q._saved) return;
      const a = {};
      if (q.type === "mcq" || q.type === "mcq_just") a.correctIndex = q.correctIndex;
      else if (q.type === "tf" || q.type === "tf_just") a.correctBool = q.correctBool;
      else if (q.type === "complete") a.correctText = q.correctText || "";
      else if (q.type === "essay") a.modelAnswer = q.modelAnswer || "";
      if (q.type === "mcq_just" || q.type === "tf_just") {
        a.justificationModelAnswer = q.justificationModelAnswer || "";
      }
      answerKey[q.id] = a;
    });
  });

  const allQuestions = cleanForms.flatMap((f) => f.questions);
  const totalScore = allQuestions.reduce((s, q) => s + (Number(q.score) || 0), 0);

  const examPayload = {
    ownerId: currentProfile.uid,
    title: d.title, subject: d.subject, grade: d.grade,
    duration: Number(d.duration) || 60,
    startAt: d.startAt instanceof Timestamp ? d.startAt : (d.startAt ? Timestamp.fromDate(new Date(d.startAt)) : null),
    endAt: d.endAt instanceof Timestamp ? d.endAt : (d.endAt ? Timestamp.fromDate(new Date(d.endAt)) : null),
    displayMode: d.displayMode || "scroll",
    shuffleQuestions: !!d.shuffleQuestions,
    forms: cleanForms,
    questions: cleanForms[0]?.questions || [],
    totalQuestions: allQuestions.length,
    totalScore,
    teacherName: currentProfile.fullName || "",
    teacherPhoto: currentProfile.photoURL || "",
    status: d.status || "draft",
    updatedAt: serverTimestamp()
  };

  if (builderState.examId) {
    await updateDoc(doc(db, "exams", builderState.examId), examPayload);
    const answersRef = doc(db, "examAnswers", builderState.examId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(answersRef);
      const existing = snap.exists() ? (snap.data().answers || {}) : {};
      const merged = { ...existing, ...answerKey };
      tx.set(answersRef, {
        ownerId: currentProfile.uid, examId: builderState.examId,
        answers: merged, updatedAt: serverTimestamp()
      });
    });
  } else {
    examPayload.createdAt = serverTimestamp();
    const ref = await addDoc(collection(db, "exams"), examPayload);
    builderState.examId = ref.id;
    await setDoc(doc(db, "examAnswers", ref.id), {
      ownerId: currentProfile.uid, examId: ref.id,
      answers: answerKey, updatedAt: serverTimestamp()
    });
    history.replaceState(null, "", `#/app/builder?id=${ref.id}`);
  }
}

function addQuestion(type) {
  const q = {
    id: uid(10), type,
    header: "", text: "", explanation: "",
    options: (type === "mcq" || type === "mcq_just") ? ["", "", "", ""] : [],
    correctIndex: 0, correctBool: null, correctText: "",
    modelAnswer: "", justificationModelAnswer: "",
    imageUrl: null, score: 1, _saved: false
  };
  const form = builderState.data.forms[builderState.currentFormIndex];
  form.questions.push(q);
  renderBuilderQuestions();
  updateBuilderTotalScore();
  markDirty();
}

function duplicateQuestion(idx) {
  const form = builderState.data.forms[builderState.currentFormIndex];
  const orig = form.questions[idx];
  if (!orig) return;
  const copy = JSON.parse(JSON.stringify(orig));
  copy.id = uid(10);
  copy._saved = false;
  form.questions.splice(idx + 1, 0, copy);
  renderBuilderQuestions();
  updateBuilderTotalScore();
  markDirty();
}

function deleteQuestion(idx) {
  const form = builderState.data.forms[builderState.currentFormIndex];
  form.questions.splice(idx, 1);
  renderBuilderQuestions();
  updateBuilderTotalScore();
  markDirty();
}

function showQuestionTypeModal() {
  const types = [
    { type: "mcq", title: "اختيار من متعدد", hint: "إجابة واحدة صحيحة" },
    { type: "mcq_just", title: "اختيار + تبرير", hint: "اختيار مع كتابة تبرير" },
    { type: "tf", title: "صح / خطأ", hint: "عبارة صح أو خطأ" },
    { type: "tf_just", title: "صح / خطأ + تبرير", hint: "صح أو خطأ مع تبرير" },
    { type: "complete", title: "أكمل", hint: "إكمال الفراغ" },
    { type: "essay", title: "مقالي", hint: "إجابة طويلة" }
  ];

  const body = el("div", { class: "stack-sm" });
  types.forEach((tt) => {
    const btn = el("button", { type: "button", class: "card", style: "text-align:right;cursor:pointer;padding:var(--sp-4)" });
    btn.appendChild(el("div", { class: "fw-semibold", text: tt.title }));
    btn.appendChild(el("div", { class: "text-sm text-muted mt-1", text: tt.hint }));
    btn.addEventListener("click", () => {
      addQuestion(tt.type);
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    });
    body.appendChild(btn);
  });

  openModal({ title: "اختر نوع السؤال", body, actions: [{ label: "إلغاء", class: "btn-ghost" }] });
}

function renderBuilderForms() {
  const tabs = $("[data-forms-tabs]");
  const listHost = $("[data-form-questions-list]");
  const nameEl = $("[data-form-current-name]");
  const countEl = $("[data-form-question-count]");
  if (!tabs) return;

  tabs.innerHTML = "";
  builderState.data.forms.forEach((form, i) => {
    const tab = el("button", { type: "button", class: `forms-tab ${i === builderState.currentFormIndex ? "is-active" : ""}` });
    tab.appendChild(document.createTextNode(form.name));
    if (builderState.data.forms.length > 1) {
      const rm = el("span", { class: "forms-tab-remove" });
      rm.appendChild(svgIcon("x", 12));
      rm.addEventListener("click", (e) => { e.stopPropagation(); removeForm(i); });
      tab.appendChild(rm);
    }
    tab.addEventListener("click", () => {
      builderState.currentFormIndex = i;
      renderBuilderForms(); renderBuilderQuestions();
    });
    tabs.appendChild(tab);
  });

  const form = builderState.data.forms[builderState.currentFormIndex];
  if (nameEl) nameEl.textContent = form?.name || "";
  if (countEl) countEl.textContent = String(form?.questions?.length || 0);

  if (listHost) {
    listHost.innerHTML = "";
    (form?.questions || []).forEach((q, idx) => listHost.appendChild(buildQuestionCard(q, idx)));
  }
}

function addForm() {
  const usedLetters = builderState.data.forms.map((f) => f.id);
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const nextLetter = letters.find((l) => !usedLetters.includes(l)) || ("X" + uid(3));
  const newForm = { id: nextLetter, name: `النموذج ${nextLetter}`, questions: [] };
  builderState.data.forms.push(newForm);
  builderState.currentFormIndex = builderState.data.forms.length - 1;
  renderBuilderForms(); renderBuilderQuestions(); markDirty();
}

function removeForm(idx) {
  if (builderState.data.forms.length <= 1) return;
  builderState.data.forms.splice(idx, 1);
  if (builderState.currentFormIndex >= builderState.data.forms.length) {
    builderState.currentFormIndex = builderState.data.forms.length - 1;
  }
  renderBuilderForms(); renderBuilderQuestions(); markDirty();
}

function markDirty() {
  const state = $("[data-builder-save-state]");
  if (state) state.textContent = "جارٍ الحفظ...";
  autosaveBuilder();
}

const autosaveBuilder = debounce(async () => {
  if (!currentProfile) return;
  const d = builderState.data;
  if (!d.title.trim()) return;

  const cleanForms = d.forms.map((form) => ({
    id: form.id, name: form.name,
    questions: (form.questions || []).map(buildCleanFormQuestion)
  }));

  const allQuestions = cleanForms.flatMap((f) => f.questions);
  const totalScore = allQuestions.reduce((s, q) => s + (Number(q.score) || 0), 0);

  const examPayload = {
    ownerId: currentProfile.uid,
    title: d.title, subject: d.subject, grade: d.grade,
    duration: Number(d.duration) || 60,
    startAt: d.startAt instanceof Timestamp ? d.startAt : (d.startAt ? Timestamp.fromDate(new Date(d.startAt)) : null),
    endAt: d.endAt instanceof Timestamp ? d.endAt : (d.endAt ? Timestamp.fromDate(new Date(d.endAt)) : null),
    displayMode: d.displayMode || "scroll",
    shuffleQuestions: !!d.shuffleQuestions,
    forms: cleanForms,
    questions: cleanForms[0]?.questions || [],
    totalQuestions: allQuestions.length,
    totalScore,
    teacherName: currentProfile.fullName || "",
    teacherPhoto: currentProfile.photoURL || "",
    status: d.status || "draft",
    updatedAt: serverTimestamp()
  };

  try {
    if (builderState.examId) {
      await updateDoc(doc(db, "exams", builderState.examId), examPayload);
    } else {
      examPayload.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, "exams"), examPayload);
      builderState.examId = ref.id;
      history.replaceState(null, "", `#/app/builder?id=${ref.id}`);
    }
    const state = $("[data-builder-save-state]");
    if (state) state.textContent = "تم الحفظ";
  } catch (err) {
    console.error("[autosave]", err);
    const state = $("[data-builder-save-state]");
    if (state) state.textContent = "فشل الحفظ";
  }
}, 1200);

async function saveAllQuestions() {
  if (!currentProfile) return;

  if (!builderState.examId) {
    await autosaveBuilderNow();
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!builderState.examId) { toast("تعذّر إنشاء الامتحان", "error"); return; }

  const allQ = getAllBuilderQuestions();
  const errors = [];
  allQ.forEach((q, idx) => {
    const err = validateSingleQuestion(q);
    if (err) errors.push(`س${idx + 1}: ${err}`);
  });

  if (errors.length) {
    openModal({
      title: `${errors.length} مشكلة`,
      body: el("ul", { style: "padding-inline-start:20px;line-height:2;max-height:300px;overflow-y:auto" },
        errors.slice(0, 15).map((e) => el("li", { text: e, style: "font-size:var(--fs-sm)" }))
      ),
      actions: [{ label: "حسنا", class: "btn-primary" }]
    });
    return;
  }

  const answerKey = buildAnswerKey(allQ);
  const answersRef = doc(db, "examAnswers", builderState.examId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(answersRef);
    const existing = snap.exists() ? (snap.data().answers || {}) : {};
    const merged = { ...existing, ...answerKey };
    tx.set(answersRef, {
      ownerId: currentProfile.uid, examId: builderState.examId,
      answers: merged, updatedAt: serverTimestamp()
    });
  });

  allQ.forEach((q) => { q._saved = true; q._error = false; });
  renderBuilderQuestions();
  toast(`تم حفظ ${allQ.length} سؤال`, "success");
}

async function publishExam() {
  const d = builderState.data;
  const errors = [];
  if (!d.title.trim()) errors.push("اسم الامتحان مطلوب");
  if (!d.subject) errors.push("المادة مطلوبة");
  if (!d.grade) errors.push("الصف مطلوب");
  const totalQ = getAllBuilderQuestions().length;
  if (!totalQ) errors.push("أضف سؤالا واحدا على الأقل");

  const unsaved = getAllBuilderQuestions().filter((q) => !q._saved);
  if (unsaved.length) errors.push(`فيه ${unsaved.length} سؤال غير محفوظ. اضغط "حفظ الكل" أولا.`);

  if (errors.length) {
    openModal({
      title: `${errors.length} ${errors.length === 1 ? "مشكلة" : "مشاكل"}`,
      body: el("ul", { style: "padding-inline-start:20px;line-height:2" }, errors.map((e) => el("li", { text: e }))),
      actions: [{ label: "حسنا", class: "btn-primary" }]
    });
    return;
  }

  const roomCode = generateRoomCode();
  const formatted = formatRoomCode(roomCode);

  const summary = el("div", { class: "stack-sm" });
  [
    ["الاسم", d.title],
    ["الأسئلة", String(totalQ)],
    ["النماذج", String(d.forms.length)],
    ["المدة", `${d.duration} دقيقة`],
    ["كود الغرفة", formatted]
  ].forEach(([k, v]) => {
    summary.appendChild(el("div", { class: "row-between" }, [el("span", { text: k }), el("strong", { text: v })]));
  });

  openModal({
    title: "نشر الامتحان؟",
    body: summary,
    actions: [
      { label: "إلغاء", class: "btn-ghost" },
      { label: "نشر", class: "btn-primary", onClick: async () => {
        try {
          await saveAllQuestions();
          await new Promise((r) => setTimeout(r, 600));

          const answersSnap = await getDoc(doc(db, "examAnswers", builderState.examId));
          if (!answersSnap.exists()) throw new Error("answers not saved");

          const expiresAt = d.endAt instanceof Timestamp ? d.endAt : (d.endAt ? Timestamp.fromDate(new Date(d.endAt)) : null);

          const batch = writeBatch(db);
          batch.update(doc(db, "exams", builderState.examId), {
            status: "scheduled",
            publishedAt: serverTimestamp(),
            roomCode,
            roomCodeActive: true,
            roomCodeExpiresAt: expiresAt
          });
          batch.set(doc(db, "examRoomCodes", roomCode), {
            examId: builderState.examId,
            teacherUid: currentProfile.uid,
            active: true,
            expiresAt,
            createdAt: serverTimestamp()
          });
          await batch.commit();

          toast("تم نشر الامتحان", "success");
          navigate(`/app/exam?id=${builderState.examId}`);
        } catch (err) {
          console.error(err);
          toast(`فشل النشر: ${err.message || "خطأ"}`, "error", 6000);
        }
      }}
    ]
  });
}

function initBuilderEvents() {
  const container = $('[data-page="app"]');
  if (!container || container.dataset.builderBound) return;
  container.dataset.builderBound = "1";

  container.addEventListener("click", (e) => {
    const stepBtn = e.target.closest(".builder-step");
    if (stepBtn) { switchBuilderStep(stepBtn.dataset.step); return; }

    if (e.target.closest("[data-builder-back]")) {
      const idx = BUILDER_STEPS.indexOf(builderState.currentStep);
      if (idx > 0) switchBuilderStep(BUILDER_STEPS[idx - 1]);
      return;
    }

    if (e.target.closest("[data-builder-next]")) {
      const idx = BUILDER_STEPS.indexOf(builderState.currentStep);
      if (idx < BUILDER_STEPS.length - 1) {
        if (builderState.currentStep === "info") {
          const d = builderState.data;
          if (!d.title.trim()) { toast("أدخل اسم الامتحان", "warning"); return; }
          if (!d.subject) { toast("اختر المادة", "warning"); return; }
          if (!d.grade) { toast("اختر الصف", "warning"); return; }
        }
        if (builderState.currentStep === "questions" && !getAllBuilderQuestions().length) {
          toast("أضف سؤالا واحدا على الأقل", "warning"); return;
        }
        switchBuilderStep(BUILDER_STEPS[idx + 1]);
      }
      return;
    }

    if (e.target.closest("[data-builder-save]")) { autosaveBuilder(); toast("تم الحفظ", "success"); return; }

    if (e.target.closest("[data-builder-save-all]")) {
      const btn = e.target.closest("[data-builder-save-all]");
      btn.classList.add("is-loading");
      saveAllQuestions().finally(() => btn.classList.remove("is-loading"));
      return;
    }

    if (e.target.closest("[data-builder-publish]")) { publishExam(); return; }
    if (e.target.closest("[data-builder-cancel]")) { navigate("/app/exams"); return; }

    if (e.target.closest("[data-builder-preview]")) {
      if (!builderState.examId) { toast("احفظ أولا", "warning"); return; }
      window.open(location.pathname + `#/exam?id=${builderState.examId}&preview=1`, "_blank");
      return;
    }

    if (e.target.closest("[data-add-question]") || e.target.closest("[data-add-form-question]")) {
      showQuestionTypeModal(); return;
    }

    if (e.target.closest("[data-add-form]")) { addForm(); return; }
  });

  container.addEventListener("input", (e) => {
    const f = e.target.dataset?.field;
    if (!f) return;
    const d = builderState.data;
    if (f === "title") { d.title = e.target.value; updateBuilderTitle(); }
    else if (f === "subject") d.subject = e.target.value;
    else if (f === "grade") d.grade = e.target.value;
    else if (f === "duration") d.duration = Number(e.target.value) || 60;
    else if (f === "startAt") d.startAt = fromLocalInput(e.target.value);
    else if (f === "endAt") d.endAt = fromLocalInput(e.target.value);
    markDirty();
  });

  container.addEventListener("change", (e) => {
    const f = e.target.dataset?.field;
    if (!f) return;
    const d = builderState.data;
    if (f === "displayMode") {
      d.displayMode = e.target.value;
      $$(".mode-card").forEach((c) => {
        c.classList.toggle("is-selected", c.querySelector("input").checked);
      });
    } else if (e.target.type === "checkbox") {
      d[f] = e.target.checked;
    }
    markDirty();
  });
}

/* ============================================================
   EXAM DETAILS
   ============================================================ */
async function renderExamDetails(params) {
  const examId = params?.get("id") || currentParams?.get("id");
  const host = $("[data-exam-details]");
  if (!host) return;
  if (!examId) { navigate("/app/exams"); return; }
  host.innerHTML = "";
  host.appendChild(el("div", { class: "sk-card" }, [el("div", { class: "skeleton sk-line sk-lg" })]));

  const exam = await getExam(examId);
  if (!exam || exam.ownerId !== currentProfile.uid) {
    host.innerHTML = "";
    host.appendChild(el("div", { class: "empty" }, [el("p", { text: "غير موجود" })]));
    return;
  }

  const attempts = await listAttempts(examId);
  const status = computeStatus(exam);

  host.innerHTML = "";

  const head = el("div", { class: "exam-details-head" });
  const left = el("div", {});
  left.appendChild(el("h2", { class: "exam-details-title", text: exam.title || "بدون اسم" }));
  left.appendChild(el("div", {
    class: "exam-details-meta",
    text: `${subjectLabel(exam.subject)} - ${gradeLabel(exam.grade)} - ${exam.totalQuestions || 0} سؤال - ${exam.duration || 0} دقيقة`
  }));
  head.appendChild(left);

  const actions = el("div", { class: "row" });
  actions.appendChild(el("span", { class: `badge badge-${status}`, text: statusLabel(status) }));

  const shareBtn = el("button", { class: "btn btn-primary btn-sm", type: "button" });
  shareBtn.appendChild(svgIcon("door-open", 14));
  shareBtn.appendChild(document.createTextNode(" كود الغرفة"));
  shareBtn.addEventListener("click", () => shareRoomCode(exam));
  actions.appendChild(shareBtn);

  const editBtn = el("button", { class: "btn btn-outline btn-sm", type: "button", text: "تعديل" });
  editBtn.addEventListener("click", () => navigate(`/app/builder?id=${examId}`));
  actions.appendChild(editBtn);

  head.appendChild(actions);
  host.appendChild(head);

  if (attempts.length) {
    const report = await buildQuickReport(exam, attempts);
    host.appendChild(report);
  }

  const tabs = el("div", { class: "exam-tabs" });
  ["students", "questions", "grading"].forEach((name) => {
    const label = name === "grading" ? "التصحيح" : name === "students" ? "الطلاب" : "الأسئلة";
    tabs.appendChild(el("button", { class: "exam-tab", type: "button", "data-tab": name, text: label }));
  });
  host.appendChild(tabs);

  const content = el("div", {});
  host.appendChild(content);

  const showTab = (name) => {
    $$(".exam-tab", tabs).forEach((b) => b.classList.toggle("is-active", b.dataset.tab === name));
    content.innerHTML = "";
    if (name === "students") renderStudentsTab(content, exam, attempts);
    else if (name === "questions") renderQuestionsTab(content, exam);
    else if (name === "grading") renderGradingList(content, exam, attempts);
  };

  tabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".exam-tab");
    if (tab) showTab(tab.dataset.tab);
  });

  showTab("students");
}

async function buildQuickReport(exam, attempts) {
  const totalPossible = exam.totalScore || 0;
  const graded = attempts.filter((a) => a.gradedAt && a.score != null);
  const submitted = attempts.filter((a) => a.status === "submitted" || a.status === "graded");
  const inProgress = attempts.filter((a) => a.status === "in_progress");

  const report = el("div", { class: "quick-report" });

  const participantsItem = el("div", { class: "quick-report-item is-info" });
  participantsItem.appendChild(el("span", { class: "quick-report-label", text: "المشاركون" }));
  participantsItem.appendChild(el("span", { class: "quick-report-value", text: String(attempts.length) }));
  participantsItem.appendChild(el("span", {
    class: "quick-report-sub",
    text: `${submitted.length} سلّموا - ${inProgress.length} داخل الامتحان`
  }));
  report.appendChild(participantsItem);

  if (graded.length) {
    const avg = Math.round(graded.reduce((s, a) => s + (Number(a.score) || 0), 0) / graded.length);
    const avgPct = totalPossible ? Math.round((avg / totalPossible) * 100) : 0;
    const avgItem = el("div", { class: "quick-report-item is-success" });
    avgItem.appendChild(el("span", { class: "quick-report-label", text: "متوسط الدرجات" }));
    avgItem.appendChild(el("span", { class: "quick-report-value", text: `${avg} / ${totalPossible}` }));
    avgItem.appendChild(el("span", { class: "quick-report-sub", text: `${avgPct}%` }));
    report.appendChild(avgItem);

    const highest = graded.reduce((best, a) => (Number(a.score) || 0) > (Number(best.score) || 0) ? a : best, graded[0]);
    const highItem = el("div", { class: "quick-report-item" });
    highItem.appendChild(el("span", { class: "quick-report-label", text: "أعلى درجة" }));
    highItem.appendChild(el("span", { class: "quick-report-value", text: String(highest.score || 0) }));
    highItem.appendChild(el("span", { class: "quick-report-sub", text: highest.studentName || "-" }));
    report.appendChild(highItem);
  }

  return report;
}

function renderStudentsTab(host, exam, attempts) {
  if (!attempts.length) {
    host.appendChild(el("div", { class: "empty" }, [
      el("h3", { text: "لا يوجد طلاب بعد" }),
      el("p", { text: "شارك كود الغرفة مع طلابك للبدء." })
    ]));
    return;
  }

  const toolbar = el("div", { class: "row-between", style: "margin-bottom:var(--sp-3);gap:var(--sp-3);flex-wrap:wrap" });

  const pendingCount = attempts.filter((a) => a.status === "submitted").length;

  const actionsWrap = el("div", { class: "row", style: "gap:var(--sp-2)" });

  const gradeAllBtn = el("button", {
    type: "button",
    class: "btn btn-outline btn-sm",
    disabled: pendingCount === 0
  });
  gradeAllBtn.appendChild(svgIcon("check", 14));
  gradeAllBtn.appendChild(document.createTextNode(" تصحيح الكل"));
  gradeAllBtn.addEventListener("click", async () => {
    if (pendingCount === 0) return;
    gradeAllBtn.classList.add("is-loading");
    try {
      const result = await autoGradeAttempts(exam.id, exam);
      if (result.noAnswerKey) {
        toast("لا يوجد إجابات نموذجية محفوظة", "error", 6000);
        return;
      }
      if (result.alreadyDone) {
        toast("كل الأوراق مصححة بالفعل", "info");
        return;
      }
      if (result.graded > 0) toast(`تم تصحيح ${result.graded} ورقة`, "success");
      renderExamDetails(currentParams);
    } catch (err) {
      console.error(err);
      toast("فشل التصحيح", "error");
    } finally {
      gradeAllBtn.classList.remove("is-loading");
    }
  });
  actionsWrap.appendChild(gradeAllBtn);

  toolbar.appendChild(el("div", { class: "text-sm text-muted", text: pendingCount > 0 ? `فيه ${pendingCount} ورقة بانتظار التصحيح` : "" }));
  toolbar.appendChild(actionsWrap);
  host.appendChild(toolbar);

  const wrap = el("div", { class: "card", style: "overflow-x:auto" });
  const table = el("table", { class: "students-table" });
  table.innerHTML = `<thead><tr>
    <th>الطالب</th><th>الحالة</th><th>البدء</th><th>التسليم</th><th>الدرجة</th><th>الأحداث</th><th>التفاصيل</th>
  </tr></thead>`;
  const tbody = el("tbody");
  const totalPossible = exam.totalScore || 0;

  attempts.forEach((a) => {
    const tr = el("tr", { style: "cursor:pointer" });
    tr.appendChild(el("td", { text: a.studentName || "-" }));
    tr.appendChild(el("td", {}, [
      el("span", { class: `badge badge-${a.status || "draft"}`, text: statusLabel(a.status || "draft") })
    ]));
    tr.appendChild(el("td", { text: fmtDate(a.startedAt) }));
    tr.appendChild(el("td", { text: a.submittedAt ? fmtDate(a.submittedAt) : "-" }));
    tr.appendChild(el("td", { text: a.score != null ? `${a.score} / ${totalPossible}` : "-" }));

    const eventsCount = (a.anticheatEvents || []).length;
    const eventsTd = el("td");
    if (eventsCount === 0) eventsTd.appendChild(el("span", { class: "badge badge-graded", text: "نظيف" }));
    else eventsTd.appendChild(el("span", { class: "badge badge-in_progress", text: `${eventsCount} حدث` }));
    tr.appendChild(eventsTd);

    const detailsTd = el("td");
    const detailsBtn = el("button", { type: "button", class: "btn btn-ghost btn-xs" });
    detailsBtn.appendChild(svgIcon("eye", 14));
    detailsBtn.appendChild(document.createTextNode(" تفاصيل"));
    detailsBtn.addEventListener("click", (e) => { e.stopPropagation(); openAttemptDetails(a, exam); });
    detailsTd.appendChild(detailsBtn);
    tr.appendChild(detailsTd);

    tr.addEventListener("click", () => navigate(`/app/grading?exam=${exam.id}&attempt=${a.id}`));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  host.appendChild(wrap);
}

function renderQuestionsTab(host, exam) {
  const forms = exam.forms && exam.forms.length
    ? exam.forms
    : [{ id: "A", name: "النموذج أ", questions: exam.questions || [] }];
  const wrap = el("div", { class: "stack" });
  forms.forEach((form) => {
    const block = el("div", { class: "card" });
    block.appendChild(el("h3", {
      class: "builder-panel-title",
      text: `${form.name} - ${(form.questions || []).length} سؤال`
    }));
    (form.questions || []).forEach((q, i) => {
      const row = el("div", { class: "grading-card mt-3" });
      row.appendChild(el("div", { class: "row-between mb-2" }, [
        el("span", { class: "fw-semibold", text: `س${i + 1} - ${qTypeLabel(q.type)}` }),
        el("span", { class: "badge badge-draft", text: `${q.score} نقطة` })
      ]));
      if (q.header) row.appendChild(el("div", { class: "text-sm text-muted mb-2", text: q.header }));
      row.appendChild(el("p", { text: q.text || "-" }));
      block.appendChild(row);
    });
    wrap.appendChild(block);
  });
  host.appendChild(wrap);
}

function renderGradingList(host, exam, attempts) {
  const pending = attempts.filter((a) => a.status === "submitted" && !a.gradedAt);
  if (!pending.length) {
    host.appendChild(el("div", { class: "empty" }, [el("p", { text: "لا يوجد ما ينتظر التصحيح." })]));
    return;
  }
  const wrap = el("div", { class: "stack" });
  pending.forEach((a) => {
    const row = el("div", { class: "card row-between" });
    const info = el("div", {});
    info.appendChild(el("div", { class: "fw-semibold", text: a.studentName }));
    info.appendChild(el("div", { class: "text-sm text-muted", text: fmtDate(a.submittedAt) }));
    row.appendChild(info);
    const btn = el("button", { class: "btn btn-primary btn-sm", type: "button", text: "تصحيح" });
    btn.addEventListener("click", () => navigate(`/app/grading?exam=${exam.id}&attempt=${a.id}`));
    row.appendChild(btn);
    wrap.appendChild(row);
  });
  host.appendChild(wrap);
}

/* ============================================================
   AUTO-GRADE
   ============================================================ */
async function autoGradeAttempts(examId, exam) {
  const answersMap = await getExamAnswers(examId);
  if (!Object.keys(answersMap).length) {
    return { graded: 0, pendingManual: 0, total: 0, noAnswerKey: true };
  }

  const attempts = await listAttempts(examId);
  const ungraded = attempts.filter((a) => !a.gradedAt && a.status === "submitted");
  if (!ungraded.length) {
    return { graded: 0, pendingManual: 0, total: attempts.length, alreadyDone: true };
  }

  const allQuestions = getAllExamQuestions(exam);
  const totalPossible = allQuestions.reduce((s, q) => s + (Number(q.score) || 0), 0);

  let gradedCount = 0;

  for (const attempt of ungraded) {
    const answers = attempt.answers || {};
    let autoScore = 0;
    const perQ = {};
    let hasManual = false;

    allQuestions.forEach((q) => {
      const a = answers[q.id] || {};
      const key = answersMap[q.id] || {};
      let sc = 0;

      const hasKey = key && (
        (q.type === "mcq" || q.type === "mcq_just") ? key.correctIndex != null :
        (q.type === "tf" || q.type === "tf_just") ? key.correctBool != null :
        (q.type === "complete") ? !!key.correctText :
        (q.type === "essay") ? !!key.modelAnswer :
        false
      );

      if (!hasKey) {
        hasManual = true;
        perQ[q.id] = null;
        return;
      }

      if (q.type === "mcq") {
        if (a.selectedIndex != null && a.selectedIndex === key.correctIndex) sc = Number(q.score) || 0;
      } else if (q.type === "tf") {
        if (a.boolValue != null && a.boolValue === key.correctBool) sc = Number(q.score) || 0;
      } else if (q.type === "complete") {
        const norm = (v) => String(v || "").trim().toLowerCase();
        if (norm(a.textValue) === norm(key.correctText)) sc = Number(q.score) || 0;
      } else {
        hasManual = true;
        perQ[q.id] = null;
        return;
      }

      perQ[q.id] = sc;
      autoScore += sc;
    });

    try {
      const updateData = {
        autoScore,
        perQuestionScores: perQ,
        totalPossible,
        autoGradedAt: serverTimestamp()
      };

      if (!hasManual) {
        updateData.score = autoScore;
        updateData.percentage = totalPossible ? Math.round((autoScore / totalPossible) * 100) : 0;
        updateData.gradedAt = serverTimestamp();
        updateData.gradedBy = currentProfile.uid;
        updateData.status = "graded";
        gradedCount++;
      }

      await updateDoc(doc(db, "attempts", attempt.id), updateData);
    } catch (err) { console.warn("auto-grade failed", attempt.id, err); }
  }

  return { graded: gradedCount, total: ungraded.length };
}

/* ============================================================
   EXAM RUNTIME + LEAVE GUARD
   ============================================================ */
const EXAM_STATE_KEY = (id) => `qeyasquiz.attempt.${id}`;
let examRuntime = null;

async function renderExam(params) {
  const examId = params?.get("id");
  const preview = params?.get("preview") === "1";

  const loading = $("[data-exam-loading]");
  const shell = $("[data-exam-shell]");
  const errorBox = $("[data-exam-error]");

  loading.hidden = false; shell.hidden = true; errorBox.hidden = true;

  if (!currentUser) {
    navigate("/login");
    return;
  }

  if (!examId) {
    loading.hidden = true; errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "بيانات ناقصة";
    $("[data-exam-error-message]").textContent = "لم يتم تحديد رقم الامتحان.";
    return;
  }

  let exam;
  try { exam = await getExam(examId); } catch (err) { console.error(err); }

  if (!exam) {
    loading.hidden = true; errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "غير موجود";
    $("[data-exam-error-message]").textContent = "هذا الامتحان غير متاح.";
    return;
  }

  if (preview && currentUser && currentProfile?.uid === exam.ownerId) {
    loading.hidden = true; shell.hidden = false;
    startExamRuntime(exam, { preview: true });
    return;
  }

  if (!exam.publishedAt) {
    loading.hidden = true; errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "الامتحان غير منشور";
    $("[data-exam-error-message]").textContent = "هذا الامتحان لم يُنشر بعد.";
    return;
  }

  const status = computeStatus(exam);

  if (status === "paused") {
    loading.hidden = true; errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "الامتحان متوقف مؤقتا";
    $("[data-exam-error-message]").textContent = "قام المعلم بإيقاف الامتحان.";
    return;
  }

  if (status === "scheduled") {
    loading.hidden = true; errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "الامتحان لم يبدأ";
    $("[data-exam-error-message]").textContent = `يفتح في ${fmtDate(exam.startAt)}`;
    return;
  }

  if (status === "completed") {
    loading.hidden = true; errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "الامتحان مغلق";
    $("[data-exam-error-message]").textContent = "انتهى هذا الامتحان.";
    return;
  }

  // Check existing attempt
  const existing = await getStudentAttempt(examId, currentUser.uid);
  if (existing) {
    if (existing.status === "submitted" || existing.status === "graded") {
      sessionStorage.setItem("qeyasquiz.lastAttempt", existing.id);
      localStorage.setItem("qeyasquiz.lastAttempt", existing.id);
      navigate("/result");
      return;
    }
    loading.hidden = true; shell.hidden = false;
    startExamRuntime(exam, { attempt: existing });
    return;
  }

  // Create new attempt
  const studentProfile = currentStudentProfile;
  if (!studentProfile) {
    loading.hidden = true; errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "غير مسجل";
    $("[data-exam-error-message]").textContent = "سجّل دخولك كطالب للمشاركة في الامتحان.";
    return;
  }

  loading.hidden = true; shell.hidden = false;
  const attempt = await createAttempt(exam, studentProfile.fullName, currentUser.uid);
  startExamRuntime(exam, { attempt });
}

async function createAttempt(exam, studentName, studentUid) {
  const forms = exam.forms && exam.forms.length
    ? exam.forms
    : [{ id: "A", name: "النموذج أ", questions: exam.questions || [] }];
  const chosenForm = forms[Math.floor(Math.random() * forms.length)];
  const formQuestions = chosenForm.questions || [];

  let order = formQuestions.map((q) => q.id);
  if (exam.shuffleQuestions) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  const nowMs = Date.now();
  const durationMs = (Number(exam.duration) || 60) * 60 * 1000;
  const endLimit = exam.endAt?.toMillis ? exam.endAt.toMillis() : Infinity;
  const deadlineMs = Math.min(nowMs + durationMs, endLimit);

  const resultCode = generateResultCode();

  const payload = {
    examId: exam.id,
    formId: chosenForm.id,
    studentUid, studentName,
    questionOrder: order,
    answers: {}, manualScores: {}, feedback: {},
    status: "in_progress",
    startedAt: serverTimestamp(),
    startedAtMs: nowMs, deadlineMs, resultCode,
    anticheatEvents: [],
    chancesLeft: LEAVE_CONFIG.TOTAL_CHANCES,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, "attempts"), payload);
  localStorage.setItem(EXAM_STATE_KEY(exam.id), JSON.stringify({ attemptId: ref.id, examId: exam.id }));
  localStorage.setItem("qeyasquiz.lastAttempt", ref.id);
  return { id: ref.id, ...payload, startedAtMs: nowMs, deadlineMs, resultCode };
}

function startExamRuntime(exam, opts) {
  const { attempt, preview = false } = opts;
  const safeAttempt = attempt || {
    id: null, studentName: "معاينة", formId: null,
    answers: {}, questionOrder: null, chancesLeft: LEAVE_CONFIG.TOTAL_CHANCES,
    deadlineMs: Date.now() + (exam.duration || 60) * 60000
  };

  const forms = exam.forms && exam.forms.length
    ? exam.forms
    : [{ id: "A", name: "النموذج أ", questions: exam.questions || [] }];
  const form = preview ? forms[0] : (forms.find((f) => f.id === safeAttempt.formId) || forms[0]);
  const questions = form.questions || [];

  const byId = {};
  questions.forEach((q) => (byId[q.id] = q));

  const orderedIds = preview
    ? questions.map((q) => q.id)
    : (safeAttempt.questionOrder || questions.map((q) => q.id));

  const displayMode = exam.displayMode || "scroll";

  const state = {
    exam, attempt: safeAttempt, preview, questions, byId, orderedIds, displayMode,
    index: 0,
    answers: preview ? {} : (safeAttempt.answers || {}),
    deadlineMs: preview ? Date.now() + (exam.duration || 60) * 60000 : safeAttempt.deadlineMs,
    timerInterval: null, autosaveInterval: null, heartbeatInterval: null,
    watcherUnsub: null,
    dirty: false, submitted: false, pendingExam: null,
    chancesLeft: safeAttempt.chancesLeft ?? LEAVE_CONFIG.TOTAL_CHANCES,
    isAway: false, awayTimer: null, awayCountdownInterval: null,
    anticheatEvents: safeAttempt.anticheatEvents || []
  };
  examRuntime = state;

  $("[data-watermark-teacher]").textContent = preview
    ? "معاينة - QeyasQuiz"
    : `${safeAttempt.studentName || ""} - QeyasQuiz`;
  $("[data-exam-title]").textContent = exam.title || "امتحان";
  $("[data-exam-meta]").textContent = `${subjectLabel(exam.subject)} - ${gradeLabel(exam.grade)}`;

  $("[data-questions-scroll]").hidden = true;
  $("[data-questions-single]").hidden = true;

  if (displayMode === "single") {
    $("[data-questions-single]").hidden = false;
    renderSingleMode();
  } else {
    $("[data-questions-scroll]").hidden = false;
    renderScrollMode();
  }

  startTimer();
  updateChancesUI();

  if (!preview) {
    startHeartbeat();
    startAutosave();
    startLeaveGuard();
    addExamNoise();
    const wmInterval = addExamWatermark(safeAttempt.studentName, safeAttempt.id);
    if (wmInterval) {
      const prevCleanup = state._leaveCleanup;
      state._leaveCleanup = () => {
        if (prevCleanup) prevCleanup();
        clearInterval(wmInterval);
        document.getElementById("dynamicWatermark")?.remove();
        document.getElementById("noiseOverlay")?.remove();
      };
    }
  }

  $("[data-exam-fullscreen]").onclick = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => toast("تعذّر الدخول لملء الشاشة", "error"));
    } else document.exitFullscreen?.();
  };

  $("[data-submit-exam]").onclick = () => confirmSubmit();

  const prevBtn = $("[data-prev]");
  const nextBtn = $("[data-next]");
  if (prevBtn) prevBtn.onclick = () => { if (state.index > 0) showSingleQuestion(state.index - 1); };
  if (nextBtn) nextBtn.onclick = () => { if (state.index < state.orderedIds.length - 1) showSingleQuestion(state.index + 1); };

  const beforeUnloadHandler = (e) => {
    if (!state.submitted && !state.preview) {
      e.preventDefault(); e.returnValue = ""; return "";
    }
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);
  state._beforeUnloadHandler = beforeUnloadHandler;
}

function updateChancesUI() {
  const s = examRuntime;
  if (!s) return;
  const chancesEl = $("[data-exam-chances]");
  const dotsEls = $$("[data-chances-dots] .exam-chances-dot");
  dotsEls.forEach((dot, i) => {
    dot.classList.toggle("is-used", i >= s.chancesLeft);
  });
  if (chancesEl) {
    chancesEl.classList.remove("is-warning", "is-critical");
    if (s.chancesLeft === 1) chancesEl.classList.add("is-critical");
    else if (s.chancesLeft === 2) chancesEl.classList.add("is-warning");
  }
}

function startLeaveGuard() {
  const s = examRuntime;
  if (!s || s.preview) return;

  const countdownEl = $("[data-away-countdown]");

  function logLeaveEvent(type, meta = {}) {
    try {
      s.anticheatEvents = s.anticheatEvents || [];
      s.anticheatEvents.push({ type, at: Date.now(), chancesLeft: s.chancesLeft, ...meta });
      if (s.anticheatEvents.length > 200) s.anticheatEvents.shift();
      if (s.attempt?.id) {
        updateDoc(doc(db, "attempts", s.attempt.id), {
          anticheatEvents: s.anticheatEvents,
          chancesLeft: s.chancesLeft
        }).catch(() => {});
      }
    } catch {}
  }

  function showWarning() {
    const modal = $("[data-leave-warning-modal]");
    if (!modal) return;

    const title = $("[data-leave-title]");
    const text = $("[data-leave-text]");
    const chancesContainer = $("[data-leave-chances]");

    const lost = LEAVE_CONFIG.TOTAL_CHANCES - s.chancesLeft;

    if (title) {
      title.textContent = lost === 1 ? "خرجت من الامتحان!" : lost === 2 ? "تحذير أخير!" : "تم استهلاك كل الفرص";
    }

    if (text) {
      if (s.chancesLeft > 0) {
        text.textContent = `لقد خرجت من التطبيق لأكثر من ${LEAVE_CONFIG.GRACE_SECONDS} ثواني. تبقى لك ${s.chancesLeft} ${s.chancesLeft === 1 ? "فرصة" : "فرص"}.`;
      } else {
        text.textContent = "تم استهلاك جميع الفرص. جارٍ تسليم الامتحان تلقائيا...";
      }
    }

    if (chancesContainer) {
      chancesContainer.innerHTML = "";
      for (let i = 1; i <= LEAVE_CONFIG.TOTAL_CHANCES; i++) {
        const isLost = i <= lost;
        const div = document.createElement("div");
        div.className = "leave-chance" + (isLost ? " is-lost" : "");
        div.textContent = isLost ? "" : String(i);
        chancesContainer.appendChild(div);
      }
    }

    modal.hidden = false;

    if (s.chancesLeft === 0) {
      const btn = $("[data-leave-continue]");
      if (btn) btn.disabled = true;
      setTimeout(() => {
        modal.hidden = true;
        toast("تم تسليم الامتحان لتجاوز حد الخروج", "error", 6000);
        performSubmit("auto", "leave_chances_exhausted");
      }, 2500);
    }
  }

  function hideWarning() {
    const modal = $("[data-leave-warning-modal]");
    if (modal) modal.hidden = true;
  }

  function onAway() {
    if (s.submitted || s.preview) return;
    if (s.isAway) return;
    s.isAway = true;

    document.body.classList.add("exam-away");
    logLeaveEvent("leave_start");

    let remaining = LEAVE_CONFIG.GRACE_SECONDS;
    if (countdownEl) countdownEl.textContent = String(remaining);

    s.awayCountdownInterval = setInterval(() => {
      remaining--;
      if (countdownEl) countdownEl.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(s.awayCountdownInterval);
        s.awayCountdownInterval = null;
      }
    }, 1000);

    s.awayTimer = setTimeout(async () => {
      s.chancesLeft = Math.max(0, s.chancesLeft - 1);
      logLeaveEvent("leave_penalty", { chancesLeft: s.chancesLeft });
      updateChancesUI();
      showWarning();
      if (s.chancesLeft === 0 && s.attempt?.id) {
        try {
          await updateDoc(doc(db, "attempts", s.attempt.id), {
            chancesLeft: 0
          });
        } catch {}
      }
    }, LEAVE_CONFIG.GRACE_SECONDS * 1000);
  }

  function onBack() {
    if (s.submitted || s.preview) return;
    if (!s.isAway) return;
    s.isAway = false;

    document.body.classList.remove("exam-away");

    if (s.awayCountdownInterval) {
      clearInterval(s.awayCountdownInterval);
      s.awayCountdownInterval = null;
    }

    if (s.awayTimer) {
      clearTimeout(s.awayTimer);
      s.awayTimer = null;
      logLeaveEvent("leave_safe_return");
    }
  }

  const onVisibility = () => {
    if (document.hidden) onAway();
    else onBack();
  };
  const onBlur = () => onAway();
  const onFocus = () => onBack();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", onBlur);
  window.addEventListener("focus", onFocus);

  const continueBtn = $("[data-leave-continue]");
  if (continueBtn) {
    continueBtn.onclick = () => {
      hideWarning();
      logLeaveEvent("leave_acknowledged", { chancesLeft: s.chancesLeft });
    };
  }

  s._leaveCleanup = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("blur", onBlur);
    window.removeEventListener("focus", onFocus);
    if (s.awayTimer) clearTimeout(s.awayTimer);
    if (s.awayCountdownInterval) clearInterval(s.awayCountdownInterval);
    document.body.classList.remove("exam-away");
    const modal = $("[data-leave-warning-modal]");
    if (modal) modal.hidden = true;
  };
}

function addExamNoise() {
  if (document.getElementById("noiseOverlay")) return;
  const noise = document.createElement("div");
  noise.id = "noiseOverlay";
  document.body.appendChild(noise);
}

function addExamWatermark(studentName, studentUid) {
  const existing = document.getElementById("dynamicWatermark");
  if (existing) existing.remove();

  const wm = document.createElement("div");
  wm.id = "dynamicWatermark";

  const text = `${studentName || "طالب"} - ${String(studentUid || "").slice(0, 8)} - QeyasQuiz`;

  for (let i = 0; i < 6; i++) {
    const span = document.createElement("span");
    span.textContent = text;
    span.style.top = `${Math.random() * 100}%`;
    span.style.left = `${Math.random() * 100}%`;
    wm.appendChild(span);
  }

  document.body.appendChild(wm);

  const interval = setInterval(() => {
    wm.querySelectorAll("span").forEach((span) => {
      span.style.top = `${Math.random() * 100}%`;
      span.style.left = `${Math.random() * 100}%`;
    });
  }, 5000);

  return interval;
}

function renderScrollMode() {
  const s = examRuntime;
  const host = $("[data-questions-host-scroll]");
  if (!host) return;
  host.innerHTML = "";
  s.orderedIds.forEach((qid, i) => {
    const q = s.byId[qid];
    if (!q) return;
    const block = buildQuestionBlock(q, i, qid);
    block.id = `qblock_${qid}`;
    host.appendChild(block);
  });
  updateProgress();
}

function renderSingleMode() {
  renderSingleNavList();
  showSingleQuestion(0);
}

function renderSingleNavList() {
  const s = examRuntime;
  const list = $("[data-single-nav-list]");
  if (!list) return;
  list.innerHTML = "";
  s.orderedIds.forEach((qid, i) => {
    const answered = isAnswered(s.answers[qid], s.byId[qid]);
    const btn = el("button", {
      type: "button",
      class: `exam-nav-item ${answered ? "is-answered" : ""} ${i === s.index ? "is-current" : ""}`,
      text: String(i + 1),
      onclick: () => showSingleQuestion(i)
    });
    list.appendChild(btn);
  });
  const cur = $("[data-single-current]");
  const tot = $("[data-single-total]");
  if (cur) cur.textContent = String(s.index + 1);
  if (tot) tot.textContent = String(s.orderedIds.length);
}

function showSingleQuestion(idx) {
  const s = examRuntime;
  s.index = Math.max(0, Math.min(idx, s.orderedIds.length - 1));
  const qid = s.orderedIds[s.index];
  const q = s.byId[qid];
  if (!q) return;

  const host = $("[data-single-question-host]");
  host.innerHTML = "";

  const wrap = el("div", { class: "exam-question" });
  wrap.appendChild(buildQuestionHeader(q, s.index));
  if (q.header) wrap.appendChild(el("div", { class: "q-header-text", text: q.header }));
  wrap.appendChild(el("div", { class: "q-text", text: q.text || "" }));
  if (q.imageUrl) wrap.appendChild(el("img", { class: "q-image", src: q.imageUrl, alt: "", draggable: "false" }));

  const answers = { ...(s.answers[qid] || {}) };
  wrap.appendChild(buildQuestionInputs(q, answers, qid, () => { updateProgress(); renderSingleNavList(); }));
  host.appendChild(wrap);

  const prevBtn = $("[data-prev]");
  const nextBtn = $("[data-next]");
  if (prevBtn) prevBtn.disabled = s.index === 0;
  if (nextBtn) nextBtn.disabled = s.index === s.orderedIds.length - 1;

  renderSingleNavList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function buildQuestionBlock(q, i, qid) {
  const s = examRuntime;
  const wrap = el("div", { class: "exam-question" });
  wrap.appendChild(buildQuestionHeader(q, i));
  if (q.header) wrap.appendChild(el("div", { class: "q-header-text", text: q.header }));
  wrap.appendChild(el("div", { class: "q-text", text: q.text || "" }));
  if (q.imageUrl) wrap.appendChild(el("img", { class: "q-image", src: q.imageUrl, alt: "", draggable: "false" }));

  const answers = { ...(s.answers[qid] || {}) };
  wrap.appendChild(buildQuestionInputs(q, answers, qid, () => updateProgress()));
  return wrap;
}

function buildQuestionHeader(q, index) {
  const s = examRuntime;
  const header = el("div", { class: "q-header" });
  const num = el("div", { class: "q-number" });
  num.appendChild(el("span", { class: "q-number-badge", text: String(index + 1) }));
  num.appendChild(el("span", { text: `/ ${s.orderedIds.length}` }));
  header.appendChild(num);
  header.appendChild(el("span", { class: "q-score", text: `${q.score || 1} نقطة` }));
  return header;
}

function buildQuestionInputs(q, answers, qid, onChange) {
  const frag = document.createDocumentFragment();

  if (q.type === "mcq" || q.type === "mcq_just") {
    const optsWrap = el("div", { class: "q-options" });
    (q.options || []).forEach((opt, i) => {
      const isSel = answers.selectedIndex === i;
      const optEl = el("label", { class: `q-option ${isSel ? "is-selected" : ""}` });
      const inp = el("input", { type: "radio", name: "opt_" + q.id });
      inp.checked = isSel;
      inp.addEventListener("change", () => {
        answers.selectedIndex = i;
        optsWrap.querySelectorAll(".q-option").forEach((o) => o.classList.remove("is-selected"));
        optEl.classList.add("is-selected");
        saveAnswer(qid, answers); onChange();
      });
      optEl.appendChild(inp);
      optEl.appendChild(el("span", { class: "q-option-mark", text: String.fromCharCode(65 + i) }));
      optEl.appendChild(el("span", { class: "q-option-text", text: opt }));
      optsWrap.appendChild(optEl);
    });
    frag.appendChild(optsWrap);
    if (q.type === "mcq_just") frag.appendChild(buildJustification(q, answers, qid, onChange));
  } else if (q.type === "tf" || q.type === "tf_just") {
    const wrap = el("div", { class: "q-truefalse" });
    [{ v: true, l: "صح" }, { v: false, l: "خطأ" }].forEach(({ v, l }) => {
      const isSel = answers.boolValue === v;
      const optEl = el("label", { class: `q-option ${isSel ? "is-selected" : ""}` });
      const inp = el("input", { type: "radio", name: "tf_" + q.id });
      inp.checked = isSel;
      inp.addEventListener("change", () => {
        answers.boolValue = v;
        wrap.querySelectorAll(".q-option").forEach((o) => o.classList.remove("is-selected"));
        optEl.classList.add("is-selected");
        saveAnswer(qid, answers); onChange();
      });
      optEl.appendChild(inp);
      optEl.appendChild(el("span", { class: "q-option-text", text: l }));
      wrap.appendChild(optEl);
    });
    frag.appendChild(wrap);
    if (q.type === "tf_just") frag.appendChild(buildJustification(q, answers, qid, onChange));
  } else if (q.type === "complete") {
    const input = el("input", { class: "q-complete-input", type: "text" });
    input.placeholder = "اكتب إجابتك...";
    input.value = answers.textValue || "";
    input.addEventListener("input", debounce(() => {
      answers.textValue = input.value;
      saveAnswer(qid, answers); onChange();
    }, 400));
    frag.appendChild(input);
  } else if (q.type === "essay") {
    const ta = el("textarea", { class: "q-essay-textarea" });
    ta.placeholder = "اكتب إجابتك...";
    ta.value = answers.essayText || "";
    ta.addEventListener("input", debounce(() => {
      answers.essayText = ta.value;
      saveAnswer(qid, answers); onChange();
    }, 500));
    frag.appendChild(ta);
  }

  return frag;
}

function buildJustification(q, answers, qid, onChange) {
  const box = el("div", { class: "q-justification" });
  const label = el("div", { class: "q-justification-label" });
  label.appendChild(svgIcon("check-square", 14));
  label.appendChild(document.createTextNode("التبرير"));
  box.appendChild(label);
  const ta = el("textarea", { class: "q-justification-textarea" });
  ta.placeholder = "اكتب تبريرك...";
  ta.value = answers.justification || "";
  ta.addEventListener("input", debounce(() => {
    answers.justification = ta.value;
    saveAnswer(qid, answers); onChange();
  }, 500));
  box.appendChild(ta);
  return box;
}

function saveAnswer(qid, answers) {
  const s = examRuntime;
  if (!s || s.preview) return;
  try { s.answers[qid] = JSON.parse(JSON.stringify(answers)); }
  catch { s.answers[qid] = { ...answers }; }
  s.dirty = true;
}

function isAnswered(a, q) {
  if (!a || !q) return false;
  if (q.type === "mcq" || q.type === "mcq_just") return a.selectedIndex != null;
  if (q.type === "tf" || q.type === "tf_just") return a.boolValue != null;
  if (q.type === "complete") return !!String(a.textValue || "").trim();
  if (q.type === "essay") return !!String(a.essayText || "").trim();
  return false;
}

function updateProgress() {
  const s = examRuntime;
  if (!s) return;
  const answered = s.orderedIds.filter((qid) => isAnswered(s.answers[qid], s.byId[qid])).length;
  const pct = s.orderedIds.length ? Math.round((answered / s.orderedIds.length) * 100) : 0;
  const bar = $("[data-progress-bar]");
  const text = $("[data-progress-text]");
  if (bar) bar.style.width = pct + "%";
  if (text) text.textContent = pct + "%";
}

function startTimer() {
  const s = examRuntime;
  const elVal = $("[data-timer-value]");
  const elBox = $("[data-timer]");
  if (!elVal || !elBox) return;

  function tick() {
    const remaining = s.deadlineMs - Date.now();
    if (remaining <= 0) {
      elVal.textContent = "00:00:00";
      elBox.classList.add("is-critical");
      clearInterval(s.timerInterval);
      if (!s.preview) autoSubmit("time_up");
      return;
    }
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    elVal.textContent = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
    elBox.classList.remove("is-warning", "is-critical");
    if (remaining < 60000) elBox.classList.add("is-critical");
    else if (remaining < 5 * 60000) elBox.classList.add("is-warning");
  }
  tick();
  s.timerInterval = setInterval(tick, 1000);
}

function startAutosave() {
  const s = examRuntime;
  s.autosaveInterval = setInterval(async () => {
    if (!s.dirty || s.submitted) return;
    if (!navigator.onLine) return;
    try {
      const cleanAnswers = JSON.parse(JSON.stringify(s.answers || {}));
      await updateDoc(doc(db, "attempts", s.attempt.id), {
        answers: cleanAnswers, updatedAt: serverTimestamp()
      });
      s.dirty = false;
    } catch (err) { console.warn("autosave", err); }
  }, 5000);
}

function startHeartbeat() {
  const s = examRuntime;
  s.heartbeatInterval = setInterval(async () => {
    if (s.submitted || !navigator.onLine) return;
    try {
      await updateDoc(doc(db, "attempts", s.attempt.id), { lastActiveAt: serverTimestamp() });
    } catch {}
  }, 15000);
}

function confirmSubmit() {
  const s = examRuntime;
  if (!s) return;
  const total = s.orderedIds.length;
  const answered = s.orderedIds.filter((qid) => isAnswered(s.answers[qid], s.byId[qid])).length;
  const unanswered = total - answered;

  if (unanswered > 0) {
    const firstUnansweredIdx = s.orderedIds.findIndex((qid) => !isAnswered(s.answers[qid], s.byId[qid]));
    openModal({
      title: `أسئلة بدون إجابة - ${unanswered}`,
      body: `عندك ${unanswered} سؤال بدون إجابة.`,
      actions: [
        { label: "إلغاء", class: "btn-ghost" },
        { label: "سلّم على أي حال", class: "btn-outline", onClick: () => actuallySubmit() },
        {
          label: "روح للسؤال", class: "btn-primary",
          onClick: () => {
            if (s.displayMode === "single") showSingleQuestion(firstUnansweredIdx);
            else {
              const qid = s.orderedIds[firstUnansweredIdx];
              const target = document.getElementById(`qblock_${qid}`);
              if (target) {
                target.scrollIntoView({ behavior: "smooth", block: "center" });
                target.classList.add("is-highlighted");
                setTimeout(() => target.classList.remove("is-highlighted"), 3000);
              }
            }
          }
        }
      ]
    });
    return;
  }

  openModal({
    title: "تسليم الامتحان؟",
    body: "هل أنت متأكد؟ لا يمكنك التعديل بعد التسليم.",
    actions: [
      { label: "إلغاء", class: "btn-ghost" },
      { label: "تسليم", class: "btn-primary", onClick: () => actuallySubmit() }
    ]
  });
}

async function actuallySubmit() { await performSubmit("manual"); }

async function autoSubmit(reason) {
  const s = examRuntime;
  if (!s || s.submitted) return;
  toast("انتهى الوقت. تم تسليم الامتحان تلقائيا.", "warning");
  await performSubmit("auto", reason);
}

async function performSubmit(kind = "manual", reason = null) {
  const s = examRuntime;
  if (!s || s.submitted) return;
  s.submitted = true;

  clearInterval(s.timerInterval);
  clearInterval(s.autosaveInterval);
  clearInterval(s.heartbeatInterval);
  if (s.watcherUnsub) { try { s.watcherUnsub(); } catch {} s.watcherUnsub = null; }
  if (s._anticheatCleanup) { try { s._anticheatCleanup(); } catch {} }
  if (s._leaveCleanup) { try { s._leaveCleanup(); } catch {} }
  if (s._beforeUnloadHandler) { try { window.removeEventListener("beforeunload", s._beforeUnloadHandler); } catch {} }

  document.body.classList.remove("exam-away");
  document.body.classList.remove("screenshot-active");
  try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch {}

  try {
    const cleanAnswers = JSON.parse(JSON.stringify(s.answers || {}));
    await updateDoc(doc(db, "attempts", s.attempt.id), {
      answers: cleanAnswers,
      status: "submitted",
      submitKind: kind,
      submitReason: reason,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    sessionStorage.setItem("qeyasquiz.lastAttempt", s.attempt.id);
    localStorage.setItem("qeyasquiz.lastAttempt", s.attempt.id);
    localStorage.removeItem(EXAM_STATE_KEY(s.exam.id));

    navigate("/result");
  } catch (err) {
    console.error(err);
    s.submitted = false;
    toast("فشل التسليم. حاول مرة أخرى.", "error");
  }
}

/* ============================================================
   GRADING (single attempt)
   ============================================================ */
async function renderGrading(params) {
  const examId = params?.get("exam");
  const attemptId = params?.get("attempt");
  const host = $("[data-grading-host]");
  if (!host) return;
  host.innerHTML = "";

  if (!examId || !attemptId) {
    host.appendChild(el("div", { class: "empty" }, [el("p", { text: "بيانات ناقصة." })]));
    return;
  }

  const exam = await getExam(examId);
  const aSnap = await getDoc(doc(db, "attempts", attemptId));
  if (!exam || !aSnap.exists()) {
    host.appendChild(el("div", { class: "empty" }, [el("p", { text: "غير موجود" })]));
    return;
  }

  const answersMap = await getExamAnswers(examId);
  const attempt = { id: attemptId, ...aSnap.data() };
  const allQuestions = getAllExamQuestions(exam);
  const answers = attempt.answers || {};
  const manualScores = { ...(attempt.manualScores || {}) };
  const feedback = { ...(attempt.feedback || {}) };
  const perQ = attempt.perQuestionScores || {};
  const totalPossible = allQuestions.reduce((s, q) => s + (Number(q.score) || 0), 0);

  const head = el("div", { class: "card grading-student-head" });
  const info = el("div", {});
  info.appendChild(el("h2", { text: attempt.studentName || "طالب" }));
  info.appendChild(el("p", { class: "text-muted text-sm", text: fmtDate(attempt.submittedAt) }));
  head.appendChild(info);

  const headActions = el("div", { class: "row" });
  headActions.appendChild(el("span", { class: `badge badge-${attempt.status || "draft"}`, text: statusLabel(attempt.status || "draft") }));
  const backBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: "السابق" });
  backBtn.addEventListener("click", () => navigate(`/app/exam?id=${examId}`));
  headActions.appendChild(backBtn);
  head.appendChild(headActions);
  host.appendChild(head);

  const list = el("div", { class: "grading-answers" });
  host.appendChild(list);

  allQuestions.forEach((q, i) => {
    const a = answers[q.id] || {};
    const isManual = isEssay(q);
    const key = answersMap[q.id] || {};

    const card = el("div", { class: "grading-card" });
    if (q.header) card.appendChild(el("div", { class: "q-header-text", text: q.header }));
    card.appendChild(el("div", { class: "grading-question", text: `س${i + 1} - ${q.text}` }));

    const ansBlock = el("div", { class: "grading-answer-block" });
    ansBlock.appendChild(el("div", { class: "answer-label" }, [
      svgIcon("user", 14), document.createTextNode("إجابة الطالب")
    ]));

    const isUnanswered = !isAnswered(a, q);

    if (isUnanswered) {
      const emptyBlock = el("div", { class: "essay-answer-block", style: "color:var(--danger-500);font-style:italic;text-align:center;font-weight:var(--fw-semibold)" });
      emptyBlock.textContent = "الطالب لم يجب على السؤال";
      ansBlock.appendChild(emptyBlock);
    } else if (q.type === "essay") {
      const essayBlock = el("div", { class: "essay-answer-block" });
      essayBlock.textContent = a.essayText || "-";
      ansBlock.appendChild(essayBlock);
    } else {
      let ansText = "";
      if (q.type === "mcq" || q.type === "mcq_just") {
        ansText = (a.selectedIndex != null && q.options?.[a.selectedIndex]) ? q.options[a.selectedIndex] : "-";
      } else if (q.type === "tf" || q.type === "tf_just") {
        ansText = a.boolValue === true ? "صح" : a.boolValue === false ? "خطأ" : "-";
      } else if (q.type === "complete") {
        ansText = a.textValue || "-";
      }
      ansBlock.appendChild(el("div", { text: ansText, style: "white-space:pre-wrap" }));

      if (q.type === "mcq_just" || q.type === "tf_just") {
        ansBlock.appendChild(el("div", { class: "answer-label mt-3" }, [
          svgIcon("edit", 14), document.createTextNode("التبرير")
        ]));
        if (a.justification && a.justification.trim()) {
          const jBlock = el("div", { class: "essay-answer-block" });
          jBlock.textContent = a.justification;
          ansBlock.appendChild(jBlock);
        } else {
          const emptyJ = el("div", { class: "essay-answer-block", style: "color:var(--text-muted);font-style:italic" });
          emptyJ.textContent = "لم يكتب الطالب تبريرا";
          ansBlock.appendChild(emptyJ);
        }
      }
    }
    card.appendChild(ansBlock);

    if (q.type !== "essay") {
      const corBlock = el("div", { class: "grading-answer-block" });
      corBlock.appendChild(el("div", { class: "answer-label" }, [
        svgIcon("check", 14), document.createTextNode("الإجابة الصحيحة")
      ]));
      let correctText = "-";
      if (q.type === "mcq" || q.type === "mcq_just") correctText = q.options?.[key.correctIndex] || "-";
      else if (q.type === "tf" || q.type === "tf_just") correctText = key.correctBool ? "صح" : "خطأ";
      else if (q.type === "complete") correctText = key.correctText || "-";
      corBlock.appendChild(el("div", { class: "grading-correct-answer", text: correctText }));
      card.appendChild(corBlock);
    }

    if (q.type === "essay" && key.modelAnswer) {
      card.appendChild(el("div", { class: "answer-label" }, [
        svgIcon("book", 14), document.createTextNode("الإجابة النموذجية")
      ]));
      const modelBlock = el("div", { class: "model-answer-block" });
      modelBlock.textContent = key.modelAnswer;
      card.appendChild(modelBlock);
    }

    const scoreRow = el("div", { class: "grading-score-row" });

    if (!isManual) {
      const autoInfo = el("div", { class: "text-sm", style: "margin-bottom:8px;color:var(--text-muted);width:100%" });
      autoInfo.appendChild(el("span", { text: "التصحيح التلقائي: " }));
      autoInfo.appendChild(el("strong", {
        text: `${perQ[q.id] || 0} / ${q.score || 1}`,
        style: "color:var(--text-primary)"
      }));
      card.appendChild(autoInfo);
    }

    scoreRow.appendChild(el("span", { class: "text-sm fw-semibold", text: "الدرجة:" }));
    const num = el("input", {
      type: "number", class: "input",
      min: "0", max: String(q.score || 1), step: "0.5",
      style: "max-width:100px"
    });

    const existingManual = manualScores[q.id];
    if (existingManual != null) num.value = existingManual;
    else if (isManual) num.value = 0;
    else num.value = Number(perQ[q.id] || 0);

    num.addEventListener("input", () => { manualScores[q.id] = Number(num.value) || 0; });
    scoreRow.appendChild(num);
    scoreRow.appendChild(el("span", { class: "text-sm text-muted", text: `/ ${q.score || 1}` }));

    card.appendChild(scoreRow);

    const fbField = el("div", { class: "field mt-3" });
    fbField.appendChild(el("label", { class: "field-label", text: "ملاحظة" }));
    const fbInput = el("input", { type: "text", class: "input", value: feedback[q.id] || "" });
    fbInput.addEventListener("input", () => { feedback[q.id] = fbInput.value; });
    fbField.appendChild(fbInput);
    card.appendChild(fbField);

    list.appendChild(card);
  });

  const fbCard = el("div", { class: "card" });
  fbCard.appendChild(el("label", { class: "field-label mb-2", text: "ملاحظات عامة" }));
  const fbTa = el("textarea", { class: "textarea" });
  fbTa.value = attempt.examFeedback || "";
  fbCard.appendChild(fbTa);
  host.appendChild(fbCard);

  function computeFinalScore() {
    let total = 0;
    allQuestions.forEach((q) => {
      if (manualScores[q.id] != null) total += Number(manualScores[q.id]) || 0;
      else total += Number(perQ[q.id] || 0);
    });
    return total;
  }

  async function saveGrading() {
    const finalScore = computeFinalScore();
    await updateDoc(doc(db, "attempts", attemptId), {
      manualScores, feedback,
      examFeedback: fbTa.value,
      score: finalScore,
      percentage: totalPossible ? Math.round((finalScore / totalPossible) * 100) : 0,
      gradedAt: serverTimestamp(),
      gradedBy: currentProfile.uid,
      status: "graded"
    });
  }

  const actions = el("div", { class: "card row-between" });
  const totalInfo = el("div", {});
  totalInfo.appendChild(el("div", { class: "text-sm text-muted", text: "الدرجة الكلية" }));
  totalInfo.appendChild(el("div", { class: "fw-bold text-lg", text: String(totalPossible) }));
  actions.appendChild(totalInfo);

  const actRow = el("div", { class: "row" });
  const saveBtn = el("button", { class: "btn btn-outline", type: "button", text: "حفظ التصحيح" });
  saveBtn.addEventListener("click", async () => {
    try {
      await saveGrading();
      toast("تم حفظ التصحيح", "success");
    } catch (err) {
      console.error(err);
      toast("فشل حفظ التصحيح", "error");
    }
  });
  actRow.appendChild(saveBtn);

  const publishBtn = el("button", { class: "btn btn-primary", type: "button", text: "نشر هذه النتيجة" });
  publishBtn.addEventListener("click", async () => {
    try {
      await saveGrading();
      await updateDoc(doc(db, "exams", examId), { resultPublishedAt: serverTimestamp() });
      toast("تم نشر النتيجة", "success");
      navigate(`/app/exam?id=${examId}`);
    } catch (err) {
      console.error(err);
      toast("فشل النشر", "error");
    }
  });
  actRow.appendChild(publishBtn);
  actions.appendChild(actRow);
  host.appendChild(actions);
}

/* ============================================================
   RESULT
   ============================================================ */
async function renderResult() {
  const loading = $("[data-result-loading]");
  const main = $("[data-result-main]");

  loading.hidden = false; main.hidden = true;

  const user = auth.currentUser;
  if (!user) {
    loading.hidden = true; main.hidden = false;
    $("[data-result-exam-title]").textContent = "سجّل دخول لعرض النتيجة";
    return;
  }

  let attemptId = sessionStorage.getItem("qeyasquiz.lastAttempt") || localStorage.getItem("qeyasquiz.lastAttempt");
  let attempt = null;
  let exam = null;

  try {
    if (attemptId) {
      const snap = await getDoc(doc(db, "attempts", attemptId));
      if (snap.exists() && snap.data().studentUid === user.uid) {
        attempt = { id: attemptId, ...snap.data() };
      }
    }

    if (!attempt) {
      const q = query(
        collection(db, "attempts"),
        where("studentUid", "==", user.uid),
        orderBy("submittedAt", "desc"),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) attempt = { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    if (!attempt) throw new Error("no attempt");
    exam = await getExam(attempt.examId);
    if (!exam) throw new Error("no exam");
  } catch {
    loading.hidden = true; main.hidden = false;
    $("[data-result-exam-title]").textContent = "لا يوجد امتحان";
    $("[data-score-block]").hidden = true;
    $("[data-waiting-block]").hidden = true;
    return;
  }

  loading.hidden = true; main.hidden = false;
  await renderResultContent(attempt, exam);
}

async function renderResultContent(attempt, exam) {
  const isGraded = attempt.status === "graded" && attempt.gradedAt && attempt.score != null;

  $("[data-result-status]").textContent = statusLabel(attempt.status || "submitted");
  $("[data-result-exam-title]").textContent = exam.title || "امتحان";
  $("[data-result-meta]").textContent = `${subjectLabel(exam.subject)} - ${gradeLabel(exam.grade)} - ${attempt.studentName || ""}`;

  const scoreBlock = $("[data-score-block]");
  const waitingBlock = $("[data-waiting-block]");
  const feedbackBlock = $("[data-feedback-block]");
  const reviewHead = $("[data-review-head]");
  const reviewHost = $("[data-result-review]");
  const totalPossible = attempt.totalPossible || exam.totalScore || 0;

  if (isGraded) {
    scoreBlock.hidden = false;
    waitingBlock.hidden = true;
    $("[data-score-value]").textContent = String(attempt.score);
    $("[data-score-total]").textContent = `/ ${totalPossible}`;
    $("[data-score-percentage]").textContent = `${attempt.percentage || 0}%`;
    if (attempt.examFeedback) {
      feedbackBlock.hidden = false;
      $("[data-feedback-text]").textContent = attempt.examFeedback;
    }
  } else {
    scoreBlock.hidden = true;
    waitingBlock.hidden = false;
    return;
  }

  const answersMap = await getExamAnswers(attempt.examId);
  const allQuestions = getAllExamQuestions(exam);
  const perQ = attempt.perQuestionScores || {};

  reviewHead.hidden = false;
  reviewHost.innerHTML = "";

  allQuestions.forEach((q, i) => {
    const a = attempt.answers?.[q.id] || {};
    const key = answersMap[q.id] || {};
    const autoSc = Number(perQ[q.id] || 0);
    const manSc = Number((attempt.manualScores || {})[q.id] || 0);
    const got = (attempt.manualScores && attempt.manualScores[q.id] != null) ? manSc : autoSc;
    const max = Number(q.score) || 1;

    let cls = "is-partial";
    if (got >= max) cls = "is-correct";
    else if (got === 0) cls = "is-wrong";

    const card = el("div", { class: `review-card ${cls}` });
    const head = el("div", { class: "review-head" });
    const num = el("div", { class: "review-num" });
    num.appendChild(el("span", { class: "q-number-badge", text: String(i + 1) }));
    num.appendChild(el("span", { text: qTypeLabel(q.type) }));
    head.appendChild(num);
    head.appendChild(el("span", { class: `review-score ${cls}`, text: `${got} / ${max}` }));
    card.appendChild(head);

    if (q.header) card.appendChild(el("div", { class: "q-header-text", text: q.header }));
    card.appendChild(el("div", { class: "review-question", text: q.text || "" }));

    const wrap = el("div", { class: "review-answers" });
    const isUnanswered = !isAnswered(a, q);

    let studentText = "-";
    let studentCls = "is-wrong";

    if (isUnanswered) {
      studentText = "لم تجب على هذا السؤال";
      studentCls = "is-unanswered";
    } else {
      if (q.type === "mcq" || q.type === "mcq_just") {
        if (a.selectedIndex != null && q.options?.[a.selectedIndex]) studentText = q.options[a.selectedIndex];
        else if (a.selectedIndex != null) studentText = `الخيار ${String.fromCharCode(65 + a.selectedIndex)}`;
      } else if (q.type === "tf" || q.type === "tf_just") {
        if (a.boolValue === true) studentText = "صح";
        else if (a.boolValue === false) studentText = "خطأ";
      } else if (q.type === "complete") {
        studentText = (a.textValue && a.textValue.trim()) ? a.textValue : "-";
      } else if (q.type === "essay") {
        studentText = (a.essayText && a.essayText.trim()) ? a.essayText : "-";
      }
    }

    wrap.appendChild(el("div", { class: `review-answer ${studentCls}` }, [
      el("strong", { text: "إجابتك" }),
      el("div", { text: studentText, style: "white-space:pre-wrap" })
    ]));

    if (q.type !== "essay") {
      let correctText = "-";
      if (q.type === "mcq" || q.type === "mcq_just") correctText = q.options?.[key.correctIndex] || "-";
      else if (q.type === "tf" || q.type === "tf_just") correctText = key.correctBool ? "صح" : "خطأ";
      else if (q.type === "complete") correctText = key.correctText || "-";
      wrap.appendChild(el("div", { class: "review-answer is-correct" }, [
        el("strong", { text: "الإجابة الصحيحة" }),
        el("div", { text: correctText, style: "white-space:pre-wrap" })
      ]));
    }

    if (a.justification) {
      wrap.appendChild(el("div", { class: "review-answer" }, [
        el("strong", { text: "تبريرك" }),
        el("div", { text: a.justification, style: "white-space:pre-wrap" })
      ]));
    }

    if (q.explanation) {
      wrap.appendChild(el("div", { class: "review-explanation" }, [
        el("strong", { text: "الشرح" }),
        el("div", { text: q.explanation, style: "white-space:pre-wrap" })
      ]));
    }

    card.appendChild(wrap);
    reviewHost.appendChild(card);
  });
}

/* ============================================================
   PROFILE PAGES
   ============================================================ */
function renderTeacherProfile() {
  if (!currentProfile) return;
  updateUserUI();
}

/* ============================================================
   SETTINGS
   ============================================================ */
function renderSettings() {
  $$("[data-setting-theme]").forEach((r) => {
    r.checked = r.value === currentTheme;
    if (!r.dataset.bound) {
      r.dataset.bound = "1";
      r.addEventListener("change", () => { if (r.checked) setTheme(r.value); });
    }
  });

  $$("[data-setting-three]").forEach((r) => {
    r.checked = r.value === currentThree;
    if (!r.dataset.bound) {
      r.dataset.bound = "1";
      r.addEventListener("change", () => {
        if (!r.checked) return;
        setThree(r.value);
        if (r.value === "on") setTimeout(() => location.reload(), 150);
      });
    }
  });
}

/* ============================================================
   CREDITS PAGE
   ============================================================ */
async function renderCreditsPage() {
  const host = $("[data-credits-page]");
  if (!host) return;

  const balance = currentCredits?.balance ?? 0;
  const totalAdded = currentCredits?.totalAdded ?? 0;
  const totalSpent = currentCredits?.totalSpent ?? 0;
  const plan = currentProfile?.subscription?.plan || "free";
  const expiry = currentProfile?.subscription?.expiresAt;
  const isLow = balance > 0 && balance < 20;

  host.innerHTML = "";

  const hero = el("div", { class: "credits-hero" });
  hero.appendChild(el("div", { class: "credits-hero-label", text: "رصيدك الحالي" }));
  const heroVal = el("div", { class: "credits-hero-value" });
  heroVal.appendChild(document.createTextNode(String(balance)));
  hero.appendChild(heroVal);
  const heroPlan = el("div", { class: "credits-hero-plan" });
  heroPlan.appendChild(svgIcon("star", 14));
  heroPlan.appendChild(document.createTextNode(`باقة: ${planLabel(plan)}`));
  if (plan !== "free" && expiry) heroPlan.appendChild(document.createTextNode(` - ينتهي: ${fmtDateShort(expiry)}`));
  hero.appendChild(heroPlan);
  host.appendChild(hero);

  if (isLow) {
    const warn = el("div", {
      style: "padding:12px 16px;background:var(--warning-50);color:var(--warning-600);border:1px solid var(--warning-500);border-radius:var(--r-md);font-size:var(--fs-sm);font-weight:var(--fw-semibold)"
    });
    warn.textContent = "رصيدك منخفض - يُنصح بشراء باقة قبل الامتحانات القادمة.";
    host.appendChild(warn);
  }

  const statsGrid = el("div", { class: "credits-stats" });
  [
    ["إجمالي المشحون", totalAdded],
    ["إجمالي المستهلك", totalSpent]
  ].forEach(([label, value]) => {
    const s = el("div", { class: "credits-stat" });
    s.appendChild(el("div", { class: "credits-stat-value", text: String(value) }));
    s.appendChild(el("div", { class: "credits-stat-label", text: label }));
    statsGrid.appendChild(s);
  });
  host.appendChild(statsGrid);

  const cta = el("div", { class: "credits-cta" });
  const buyBtn = el("button", { type: "button", class: "btn btn-gold btn-lg" });
  buyBtn.appendChild(svgIcon("credit-card", 18));
  buyBtn.appendChild(document.createTextNode(" اشتر باقة"));
  buyBtn.addEventListener("click", () => navigate("/app/subscription"));
  cta.appendChild(buyBtn);
  host.appendChild(cta);

  host.appendChild(el("h3", { class: "builder-panel-title mt-6", text: "سجل المعاملات" }));
  const txHost = el("div", { class: "transactions-list" });
  txHost.appendChild(el("div", { class: "sk-card" }, [
    el("div", { class: "skeleton sk-line sk-sm" }),
    el("div", { class: "skeleton sk-line sk-sm" })
  ]));
  host.appendChild(txHost);

  try {
    const txns = await loadTransactions(currentProfile.uid, 50);
    txHost.innerHTML = "";
    if (!txns.length) {
      txHost.appendChild(el("div", { class: "empty", style: "padding:var(--sp-6)" }, [
        el("p", { class: "text-muted", text: "لا يوجد معاملات بعد." })
      ]));
      return;
    }
    txns.forEach((tx) => {
      const row = el("div", { class: "transaction-row" });
      const isAdd = tx.amount > 0;
      const icon = el("div", { class: `transaction-icon ${isAdd ? "is-add" : "is-spend"}` });
      icon.appendChild(svgIcon(isAdd ? "plus" : "minus", 18));
      row.appendChild(icon);

      const info = el("div", { class: "transaction-info" });
      const label = tx.note || (isAdd ? "إضافة رصيد" : sourceLabel(tx.source));
      info.appendChild(el("div", { class: "transaction-label", text: label }));
      info.appendChild(el("div", { class: "transaction-time", text: fmtDate(tx.createdAt) }));
      row.appendChild(info);

      row.appendChild(el("div", {
        class: `transaction-amount ${isAdd ? "is-add" : "is-spend"}`,
        text: `${isAdd ? "+" : ""}${tx.amount}`
      }));
      txHost.appendChild(row);
    });
  } catch {
    txHost.innerHTML = "";
  }
}

function sourceLabel(src) {
  return {
    signup: "رصيد ترحيبي",
    manual_admin: "إضافة من الدعم",
    subscription: "اشتراك باقة",
    ai_grade_batch: "تصحيح AI"
  }[src] || "استخدام AI";
}

/* ============================================================
   SUBSCRIPTION PAGE
   ============================================================ */
function renderSubscriptionPage() {
  const host = $("[data-subscription-page]");
  if (!host) return;

  const currentPlan = currentProfile?.subscription?.plan || "free";
  const expiry = currentProfile?.subscription?.expiresAt;

  host.innerHTML = "";

  const header = el("div", { style: "text-align:center;padding:var(--sp-6) 0" });
  header.appendChild(el("h1", { style: "font-size:var(--fs-3xl);margin-bottom:var(--sp-2)", text: "اختر باقتك" }));
  header.appendChild(el("p", { class: "text-secondary", text: "الاشتراك شهري، يتم التجديد يدويا بالتواصل مع الدعم." }));
  if (currentPlan !== "free" && expiry) {
    const sub = el("p", { class: "text-muted text-sm mt-3" });
    sub.textContent = `باقتك الحالية: ${planLabel(currentPlan)} - تنتهي ${fmtDateShort(expiry)}`;
    header.appendChild(sub);
  }
  host.appendChild(header);

  const grid = el("div", { class: "pricing-grid" });
  const packs = Object.values(CREDIT_PACKS).sort((a, b) => a.order - b.order);

  packs.forEach((p) => {
    const isCurrent = p.id === currentPlan;
    const card = el("article", { class: `pricing-card ${p.badge ? "is-featured" : ""} ${isCurrent ? "is-current" : ""}` });
    if (p.badge) card.appendChild(el("div", { class: "pricing-badge", text: p.badge }));
    if (isCurrent) card.appendChild(el("div", { class: "pricing-current-badge", text: "الحالية" }));

    const head = el("div", { class: "pricing-head" });
    head.appendChild(el("h3", { class: "pricing-name", text: p.name }));
    head.appendChild(el("p", { class: "pricing-desc", text: p.description }));
    card.appendChild(head);

    const price = el("div", { class: "pricing-price" });
    price.appendChild(el("span", { class: "pricing-amount", text: String(p.priceEGP) }));
    price.appendChild(el("span", { class: "pricing-currency", text: "جنيه" }));
    price.appendChild(el("span", { class: "pricing-period", text: "/ شهريا" }));
    card.appendChild(price);

    const feats = el("ul", { class: "pricing-features" });
    const listItems = [
      `${p.credits} كريدت AI Qeyas`,
      "امتحانات غير محدودة",
      "تصحيح تلقائي للموضوعي",
      "نماذج متعددة",
      "مراقبة ضد الغش"
    ];
    if (p.id !== "free") listItems.push("تحليلات متقدمة");
    listItems.forEach((f) => {
      const li = el("li");
      li.appendChild(svgIcon("check", 16));
      li.appendChild(el("span", { text: f }));
      feats.appendChild(li);
    });
    card.appendChild(feats);

    if (isCurrent && p.id !== "free") {
      const renewBtn = el("button", {
        type: "button", class: "btn btn-outline btn-block", text: "تجديد الباقة",
        onclick: () => navigate(`/app/checkout?plan=${p.id}`)
      });
      card.appendChild(renewBtn);
    } else if (p.id === "free") {
      card.appendChild(el("button", {
        type: "button", class: "btn btn-outline btn-block",
        text: isCurrent ? "باقتك الحالية" : "الباقة المجانية",
        disabled: "disabled"
      }));
    } else {
      card.appendChild(el("button", {
        type: "button", class: "btn btn-gold btn-block", text: "اشترك الآن",
        onclick: () => navigate(`/app/checkout?plan=${p.id}`)
      }));
    }

    grid.appendChild(card);
  });

  host.appendChild(grid);
}

/* ============================================================
   CHECKOUT PAGE
   ============================================================ */
function renderCheckoutPage() {
  const host = $("[data-checkout-page]");
  if (!host) return;

  const planId = currentParams?.get("plan");
  const pack = CREDIT_PACKS[planId];
  if (!pack || pack.id === "free") { navigate("/app/subscription"); return; }

  host.innerHTML = "";

  const summary = el("div", { class: "checkout-summary" });
  summary.appendChild(el("div", {
    style: "font-size:var(--fs-lg);font-weight:var(--fw-bold);margin-bottom:var(--sp-3)",
    text: "ملخص الطلب"
  }));
  [
    ["الباقة", pack.name],
    ["الرصيد", `${pack.credits} كريدت`],
    ["المدة", "شهر واحد"]
  ].forEach(([k, v]) => {
    summary.appendChild(el("div", { class: "checkout-summary-row" }, [
      el("span", { text: k }), el("strong", { text: v })
    ]));
  });
  summary.appendChild(el("div", { class: "checkout-summary-divider" }));
  const totalRow = el("div", { class: "checkout-summary-total" });
  totalRow.appendChild(el("span", { text: "الإجمالي" }));
  totalRow.appendChild(el("span", { text: `${pack.priceEGP} جنيه` }));
  summary.appendChild(totalRow);
  host.appendChild(summary);

  const form = el("div", { class: "checkout-form" });

  const nameField = el("div", { class: "field" });
  nameField.appendChild(el("label", { class: "field-label", text: "الاسم" }));
  const nameInput = el("input", { type: "text", class: "input", readonly: "readonly" });
  nameInput.value = currentProfile?.fullName || "";
  nameField.appendChild(nameInput);
  form.appendChild(nameField);

  const idField = el("div", { class: "field" });
  idField.appendChild(el("label", { class: "field-label", text: "الـ ID" }));
  const idInput = el("input", { type: "text", class: "input", readonly: "readonly" });
  idInput.value = currentProfile?.publicId ? String(currentProfile.publicId) : "-";
  idField.appendChild(idInput);
  form.appendChild(idField);

  const phoneField = el("div", { class: "field" });
  const phoneLabel = el("label", { class: "field-label" });
  phoneLabel.appendChild(document.createTextNode("رقم الموبايل "));
  phoneLabel.appendChild(el("span", { class: "text-danger", text: "*" }));
  phoneField.appendChild(phoneLabel);
  const phoneInput = el("input", {
    type: "tel", class: "input", placeholder: "01xxxxxxxxx",
    inputmode: "numeric", maxlength: "11"
  });
  phoneField.appendChild(phoneInput);
  form.appendChild(phoneField);

  host.appendChild(form);

  const note = el("div", { class: "checkout-whatsapp-note" });
  note.appendChild(svgIcon("info", 18));
  note.appendChild(el("div", {}, [
    el("strong", { text: "الخطوة الجاية: " }),
    document.createTextNode(`هيتم تحويلك على واتساب لرقم الدعم ${SUPPORT_PHONE} مع تفاصيل طلبك.`)
  ]));
  host.appendChild(note);

  const actions = el("div", { class: "row", style: "gap:var(--sp-3);flex-wrap:wrap" });
  const backBtn = el("button", {
    type: "button", class: "btn btn-ghost btn-lg", text: "رجوع",
    onclick: () => navigate("/app/subscription")
  });
  actions.appendChild(backBtn);

  const confirmBtn = el("button", { type: "button", class: "btn btn-gold btn-lg flex-1", style: "min-width:200px" });
  confirmBtn.appendChild(svgIcon("whatsapp", 18));
  confirmBtn.appendChild(document.createTextNode(" تأكيد واشترك"));
  actions.appendChild(confirmBtn);

  confirmBtn.addEventListener("click", async () => {
    const phone = (phoneInput.value || "").trim();
    if (!validPhone(phone)) {
      toast("أدخل رقم موبايل مصري صحيح", "warning");
      return;
    }

    confirmBtn.classList.add("is-loading");
    try {
      const subRef = await addDoc(collection(db, "subscriptions"), {
        uid: currentProfile.uid,
        publicId: currentProfile.publicId || null,
        name: currentProfile.fullName || "",
        phone,
        plan: pack.id,
        planName: pack.name,
        priceEGP: pack.priceEGP,
        creditsGranted: pack.credits,
        status: "pending",
        createdAt: serverTimestamp()
      });

      const message = [
        `السلام عليكم،`,
        ``,
        `عايز أشترك في باقة ${pack.name} على QeyasQuiz.`,
        ``,
        `الاسم: ${currentProfile.fullName || "-"}`,
        `الـ ID: ${currentProfile.publicId || "-"}`,
        `رقم الموبايل: ${phone}`,
        `الباقة: ${pack.name} (${pack.credits} كريدت)`,
        `السعر: ${pack.priceEGP} جنيه`,
        `رقم الطلب: ${subRef.id}`
      ].join("\n");

      const waUrl = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, "_blank");

      setTimeout(() => {
        confirmBtn.classList.remove("is-loading");
        openModal({
          title: "تم إرسال طلبك",
          body: el("div", { class: "stack-sm" }, [
            el("p", { class: "text-secondary" }, [document.createTextNode("لو واتساب مفتحش، كلمنا على الرقم: ")]),
            el("div", { class: "card", style: "text-align:center;padding:var(--sp-4)" }, [
              el("div", { class: "mono fw-bold", style: "font-size:var(--fs-xl);color:var(--brand-500)", text: SUPPORT_PHONE })
            ])
          ]),
          actions: [{ label: "حسنا", class: "btn-primary", onClick: () => navigate("/app/credits") }]
        });
      }, 500);
    } catch (err) {
      console.error("[checkout]", err);
      confirmBtn.classList.remove("is-loading");
      toast("فشل إنشاء الطلب", "error");
    }
  });

  host.appendChild(actions);
}

/* ============================================================
   DELETE ACCOUNT
   ============================================================ */
async function deleteAccountFlow() {
  if (!currentUser || !currentProfile) return;

  const step1 = await new Promise((resolve) => {
    openModal({
      title: "حذف الحساب",
      body: el("div", { class: "stack-sm" }, [
        el("p", { class: "text-secondary", text: "هل أنت متأكد من رغبتك في حذف حسابك؟" }),
        el("div", { class: "card", style: "padding:var(--sp-4);background:var(--danger-50);border-color:var(--danger-500)" }, [
          el("p", { class: "text-sm fw-semibold text-danger", text: "سيتم حذف ما يلي نهائيا:" }),
          el("ul", { style: "margin-top:8px;padding-inline-start:20px;line-height:2;font-size:var(--fs-sm)" }, [
            el("li", { text: "جميع امتحاناتك" }),
            el("li", { text: "جميع محاولات الطلاب" }),
            el("li", { text: "جميع الإجابات والنتائج" }),
            el("li", { text: "رصيد الكريدت وسجل المعاملات" }),
            el("li", { text: "ملفك الشخصي" })
          ])
        ])
      ]),
      actions: [
        { label: "إلغاء", class: "btn-ghost", onClick: () => resolve(false) },
        { label: "متابعة", class: "btn-danger", onClick: () => resolve(true) }
      ],
      onClose: () => resolve(false)
    });
  });
  if (!step1) return;

  const password = await new Promise((resolve) => {
    const input = el("input", { type: "password", class: "input", placeholder: "كلمة المرور" });
    openModal({
      title: "تأكيد نهائي",
      body: el("div", { class: "stack-sm" }, [
        el("p", { class: "text-secondary fw-semibold", text: "أدخل كلمة المرور للتأكيد. هذه العملية لا يمكن التراجع عنها." }),
        el("div", { class: "field" }, [input])
      ]),
      actions: [
        { label: "إلغاء", class: "btn-ghost", onClick: () => resolve(null) },
        { label: "حذف نهائي", class: "btn-danger", onClick: () => resolve(input.value) }
      ],
      onClose: () => resolve(null)
    });
  });
  if (!password) return;

  showGlobalLoading("جارٍ حذف الحساب...");

  try {
    const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
    await reauthenticateWithCredential(auth.currentUser, cred);

    const uidV = currentUser.uid;
    const normalized = currentProfile.normalizedUsername;
    const publicId = currentProfile.publicId;

    const examsSnap = await getDocs(query(collection(db, "exams"), where("ownerId", "==", uidV)));
    const examIds = examsSnap.docs.map((d) => d.id);

    for (const examId of examIds) {
      try {
        const attemptsSnap = await getDocs(query(collection(db, "attempts"), where("examId", "==", examId)));
        for (const aDoc of attemptsSnap.docs) {
          try { await deleteDoc(doc(db, "attempts", aDoc.id)); } catch {}
        }
      } catch {}
      try { await deleteDoc(doc(db, "examAnswers", examId)); } catch {}
      try { await deleteDoc(doc(db, "exams", examId)); } catch {}
    }

    try {
      const txSnap = await getDocs(query(collection(db, "creditTransactions"), where("uid", "==", uidV)));
      for (const tDoc of txSnap.docs) { try { await deleteDoc(doc(db, "creditTransactions", tDoc.id)); } catch {} }
    } catch {}

    try { await deleteDoc(doc(db, "userCredits", uidV)); } catch {}
    if (publicId) { try { await deleteDoc(doc(db, "publicIds", String(publicId))); } catch {} }
    if (normalized) { try { await deleteDoc(doc(db, "usernames", normalized)); } catch {} }
    try { await deleteDoc(doc(db, "users", uidV)); } catch {}

    clearProfileCache();
    stopCreditsListener();

    try { await deleteUser(currentUser); }
    catch { try { await fbSignOut(auth); } catch {} }

    currentUser = null; currentProfile = null; currentCredits = null; currentRole = null;
    hideGlobalLoading();

    openModal({
      title: "تم حذف الحساب",
      body: "تم حذف حسابك وجميع بياناتك بنجاح.",
      actions: [{ label: "الرئيسية", class: "btn-primary", onClick: () => navigate("/login") }]
    });
  } catch (err) {
    console.error("[deleteAccount]", err);
    hideGlobalLoading();
    toast("فشل حذف الحساب - تحقق من كلمة المرور", "error");
  }
}

/* ============================================================
   ATTEMPT DETAILS
   ============================================================ */
function openAttemptDetails(attempt, exam) {
  const events = (attempt.anticheatEvents || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));

  const body = el("div", { class: "stack" });
  const info = el("div", { class: "card", style: "background:var(--bg-subtle)" });
  const totalPossible = exam.totalScore || 0;
  [
    ["الطالب", attempt.studentName || "-"],
    ["الحالة", statusLabel(attempt.status || "draft")],
    ["البدء", fmtDate(attempt.startedAt)],
    ["التسليم", attempt.submittedAt ? fmtDate(attempt.submittedAt) : "-"],
    ["الدرجة", attempt.score != null ? `${attempt.score} / ${totalPossible}` : "-"],
    ["الفرص المتبقية", String(attempt.chancesLeft ?? 3)]
  ].forEach(([k, v]) => {
    info.appendChild(el("div", { class: "row-between", style: "padding:6px 0" }, [
      el("span", { class: "text-sm text-muted", text: k }),
      el("span", { class: "text-sm fw-semibold", text: v })
    ]));
  });
  body.appendChild(info);

  const timelineHeader = el("div", { class: "builder-panel-title", style: "margin-top:var(--sp-4)" });
  timelineHeader.appendChild(document.createTextNode(`الأحداث (${events.length})`));
  body.appendChild(timelineHeader);

  if (!events.length) {
    body.appendChild(el("div", { class: "empty", style: "padding:var(--sp-6)" }, [
      el("p", { class: "text-muted", text: "لا توجد أحداث مسجلة." })
    ]));
  } else {
    const timeline = el("div", { class: "attempt-timeline" });
    events.slice(-50).forEach((evt) => {
      const row = el("div", { class: "attempt-timeline-row" });
      row.appendChild(el("div", { class: "text-sm fw-semibold", text: eventLabel(evt.type) }));
      const time = new Date(evt.at || 0).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      row.appendChild(el("span", { class: "attempt-timeline-time", text: time }));
      timeline.appendChild(row);
    });
    body.appendChild(timeline);
  }

  openModal({
    title: `تفاصيل جلسة - ${attempt.studentName || "طالب"}`,
    body,
    className: "attempt-details-modal",
    actions: [
      { label: "إغلاق", class: "btn-ghost" },
      { label: "تصحيح الورقة", class: "btn-primary", onClick: () => navigate(`/app/grading?exam=${exam.id}&attempt=${attempt.id}`) }
    ]
  });
}

function eventLabel(type) {
  return {
    leave_start: "خرج من التطبيق",
    leave_penalty: "تم خصم فرصة",
    leave_safe_return: "رجع للامتحان قبل انتهاء الوقت",
    leave_acknowledged: "اعترف بالتحذير",
    leave_chances_exhausted: "استنفد الفرص",
    tab_hidden: "خرج من الصفحة",
    tab_visible: "رجع للصفحة",
    window_blur: "خرج من النافذة",
    window_focus: "رجع للنافذة",
    copy_attempt: "محاولة نسخ",
    cut_attempt: "محاولة قص",
    paste_blocked: "محاولة لصق",
    context_menu: "فتح القائمة اليمنى",
    printscreen_blocked: "محاولة PrintScreen",
    devtools_open: "DevTools",
    offline: "انقطع الاتصال",
    online: "عاد الاتصال"
  }[type] || type;
}

/* ============================================================
   ROUTES
   ============================================================ */
onRoute("/", () => { /* handled by auth */ });
onRoute("/login", () => initLogin());
onRoute("/app/dashboard", async () => { await renderDashboard(); });
onRoute("/app/exams", async () => { await renderMyExams(); });
onRoute("/app/students", async () => { await renderStudentsPage(); });
onRoute("/app/builder", async (p) => { await renderBuilder(p); });
onRoute("/app/exam", async (p) => { await renderExamDetails(p); });
onRoute("/app/grading", async (p) => { await renderGrading(p); });
onRoute("/app/bank", () => {});
onRoute("/app/ai-qeyas", () => {});
onRoute("/app/profile", () => { renderTeacherProfile(); });
onRoute("/app/settings", () => { renderSettings(); });
onRoute("/app/credits", async () => { await renderCreditsPage(); });
onRoute("/app/subscription", () => { renderSubscriptionPage(); });
onRoute("/app/checkout", () => { renderCheckoutPage(); });
onRoute("/student/dashboard", async () => { await renderStudentDashboard(); });
onRoute("/student/teachers", async () => { await renderStudentTeachers(); });
onRoute("/student/masters", async () => { await renderStudentMasters(); });
onRoute("/student/history", async () => { await renderStudentHistory(); });
onRoute("/student/join", async () => { await renderStudentJoin(); });
onRoute("/student/profile", () => { updateUserUI(); });
onRoute("/exam", async (p) => { await renderExam(p); });
onRoute("/result", async () => { await renderResult(); });

/* ============================================================
   GLOBAL EVENTS
   ============================================================ */
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-theme-toggle]")) { toggleTheme(); return; }
  if (e.target.closest("[data-signout]")) { signOutUser(); return; }
  if (e.target.closest("[data-create-exam]")) { navigate("/app/builder"); return; }
  if (e.target.closest("[data-delete-account]")) { deleteAccountFlow(); return; }
  if (e.target.closest("[data-back]")) { history.back(); return; }
  if (e.target.closest("[data-side-credit]")) { navigate("/app/credits"); return; }
  if (e.target.closest("[data-credit-badge]")) { navigate("/app/credits"); return; }

  const copyIdBtn = e.target.closest("[data-copy-id]");
  if (copyIdBtn) {
    const pid = currentProfile?.publicId || currentStudentProfile?.publicId;
    if (pid) { navigator.clipboard.writeText(String(pid)); toast("تم نسخ الـ ID", "success"); }
    return;
  }

  const refreshBtn = e.target.closest("[data-refresh-page]");
  if (refreshBtn) {
    if (refreshBtn.disabled) return;
    refreshBtn.disabled = true;
    refreshBtn.classList.add("is-loading");
    setTimeout(() => location.reload(), 300);
    return;
  }

  if (e.target.closest("[data-sidebar-toggle]")) {
    const sidebar = $("[data-sidebar]");
    const scrim = $("[data-sidebar-scrim]");
    if (sidebar) sidebar.classList.add("is-open");
    if (scrim) scrim.classList.add("is-open");
    return;
  }

  if (e.target.closest("[data-sidebar-scrim]")) {
    const sidebar = $("[data-sidebar]");
    const scrim = $("[data-sidebar-scrim]");
    if (sidebar) sidebar.classList.remove("is-open");
    if (scrim) scrim.classList.remove("is-open");
    return;
  }
});

window.addEventListener("hashchange", handleRoute);

window.addEventListener("online", () => {
  const b = $("[data-offline-banner]");
  if (b) b.hidden = true;
});
window.addEventListener("offline", () => {
  const b = $("[data-offline-banner]");
  if (b) b.hidden = false;
});

/* ============================================================
   INIT
   ============================================================ */
(function init() {
  document.documentElement.lang = "ar";
  document.documentElement.dir = "rtl";
  authResolved = false;

  setTheme(currentTheme);
  setThree(currentThree);
  initThreeBackground();
  initAntiCopy();

  if (!navigator.onLine) {
    const b = $("[data-offline-banner]");
    if (b) b.hidden = false;
  }

  handleRoute();
})();
