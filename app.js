/* ============================================================
   QeyasQuiz — Application Logic (Arabic)
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
        <p style="color:#666">تعذّر تحميل الإعدادات. يرجى تحديث الصفحة، وإذا استمر الخطأ تواصل مع الدعم.</p>
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
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut,
  onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy, limit, getDocs,
  serverTimestamp, runTransaction, Timestamp, onSnapshot
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
  avatarFolder: "qeyasquiz/avatars",
  questionFolder: "qeyasquiz/questions"
};

/* ============================================================
   SUBJECTS + GRADES
   ============================================================ */
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

function subjectLabel(id) {
  if (!id) return "—";
  if (String(id).startsWith("custom:")) return String(id).slice(7);
  const s = SUBJECTS.find((x) => x.id === id);
  return s ? s.ar : id;
}

function gradeLabel(id) {
  return GRADE_LABELS[id] || id || "—";
}

function statusLabel(s) {
  return {
    draft: "مسودة",
    scheduled: "مجدول",
    active: "نشط",
    completed: "مكتمل",
    paused: "متوقف",
    submitted: "تم التسليم",
    graded: "تم التصحيح",
    in_progress: "قيد الحل"
  }[s] || s;
}

/* ============================================================
   UTILS
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

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function normalizeUsername(u) { return String(u || "").trim().toLowerCase(); }
function validUsername(u) { return /^[a-zA-Z0-9_]{3,24}$/.test(u); }

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

/* ============================================================
   GLOBAL LOADING
   ============================================================ */
function showGlobalLoading(text = "جارٍ التحميل…") {
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
  const sizes = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
    velocities[i * 3] = (Math.random() - 0.5) * 0.008;
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.008;
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.008;
    sizes[i] = 0.04 + Math.random() * 0.08;
  }

  const particleGeom = new THREE.BufferGeometry();
  particleGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  const particleMat = new THREE.PointsMaterial({
    color: isDark ? accentColor : brandColor,
    size: 0.08,
    transparent: true,
    opacity: isDark ? 0.55 : 0.4,
    sizeAttenuation: true,
    depthWrite: false,
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
    transparent: true,
    opacity: isDark ? 0.12 : 0.08,
    depthWrite: false
  });

  const lines = new THREE.LineSegments(lineGeom, lineMat);
  scene.add(lines);

  const knotGeom = new THREE.TorusKnotGeometry(1.6, 0.4, 80, 12, 2, 3);
  const knotMat = new THREE.MeshBasicMaterial({
    color: isDark ? accentColor : brandColor,
    wireframe: true,
    transparent: true,
    opacity: isDark ? 0.14 : 0.08
  });
  const knot = new THREE.Mesh(knotGeom, knotMat);
  knot.position.set(0, 0, -2);
  scene.add(knot);

  const icoGeom = new THREE.IcosahedronGeometry(0.7, 1);
  const icoMat = new THREE.MeshBasicMaterial({
    color: isDark ? 0x6a8dff : 0x2a4cd6,
    wireframe: true,
    transparent: true,
    opacity: isDark ? 0.2 : 0.12
  });
  const ico = new THREE.Mesh(icoGeom, icoMat);
  ico.position.set(-5, 3, -3);
  scene.add(ico);

  const ico2 = new THREE.Mesh(icoGeom, icoMat.clone());
  ico2.position.set(5, -3, -4);
  ico2.scale.setScalar(1.4);
  scene.add(ico2);

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
    ico.rotation.x = time * 0.25;
    ico.rotation.y = time * 0.3;
    ico2.rotation.x = -time * 0.2;
    ico2.rotation.y = -time * 0.25;

    particles.rotation.y += (mouseX * 0.15 - particles.rotation.y) * 0.02;
    particles.rotation.x += (mouseY * 0.1 - particles.rotation.x) * 0.02;
    knot.rotation.z = mouseX * 0.3;
    ico.position.x = -5 + mouseX * 0.5;
    ico.position.y = 3 + mouseY * 0.4;
    ico2.position.x = 5 - mouseX * 0.4;
    ico2.position.y = -3 - mouseY * 0.3;

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

  const themeObserver = new MutationObserver(() => {
    const dark = document.documentElement.dataset.theme === "dark";
    particleMat.color.setHex(dark ? accentColor : brandColor);
    particleMat.opacity = dark ? 0.55 : 0.4;
    lineMat.color.setHex(dark ? accentColor : brandColor);
    lineMat.opacity = dark ? 0.12 : 0.08;
    knotMat.color.setHex(dark ? accentColor : brandColor);
    knotMat.opacity = dark ? 0.14 : 0.08;
    icoMat.color.setHex(dark ? 0x6a8dff : 0x2a4cd6);
    icoMat.opacity = dark ? 0.2 : 0.12;
    ico2.material.color.setHex(dark ? 0x6a8dff : 0x2a4cd6);
    ico2.material.opacity = dark ? 0.2 : 0.12;
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"]
  });

  animate();
}

/* ============================================================
   ANTI-COPY GLOBAL
   ============================================================ */
function initAntiCopy() {
  document.addEventListener("contextmenu", (e) => {
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    e.preventDefault();
    return false;
  });

  document.addEventListener("selectstart", (e) => {
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    e.preventDefault();
    return false;
  });

  document.addEventListener("copy", (e) => {
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    e.preventDefault();
    if (e.clipboardData) e.clipboardData.setData("text/plain", "");
    return false;
  }, true);

  document.addEventListener("cut", (e) => {
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    e.preventDefault();
    return false;
  }, true);

  document.addEventListener("dragstart", (e) => {
    if (e.target.tagName === "IMG" || e.target.tagName === "SVG" || e.target.closest("svg")) {
      e.preventDefault();
      return false;
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = (e.key || "").toLowerCase();
    const target = e.target;
    const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

    if (isInput && ctrl && ["c", "x", "v", "a"].includes(key)) return;
    if (ctrl && ["c", "x", "a"].includes(key)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    if (ctrl && ["s", "p", "u"].includes(key)) {
      e.preventDefault();
      return false;
    }
    if (key === "f12") {
      e.preventDefault();
      return false;
    }
    if (ctrl && e.shiftKey && ["i", "j", "c", "k"].includes(key)) {
      e.preventDefault();
      return false;
    }
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
          if (a.onClick) {
            const r = await a.onClick();
            if (r === false) return;
          }
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
   FIREBASE HELPERS
   ============================================================ */
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

let currentUser = null;
let currentProfile = null;
let currentStudentProfile = null;

const PROFILE_CACHE_KEY = "qeyasquiz.profile.cache";
const STUDENT_CACHE_KEY = "qeyasquiz.student.profile";

function cacheProfile(profile) {
  if (!profile) return;
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ ...profile, _cachedAt: Date.now() }));
  } catch {}
}

function getCachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw);
    if (profile._cachedAt && Date.now() - profile._cachedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return null;
    }
    return profile;
  } catch { return null; }
}

function clearProfileCache() {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
}

function cacheStudentProfile(profile) {
  if (!profile) return;
  try {
    localStorage.setItem(STUDENT_CACHE_KEY, JSON.stringify({ ...profile, _cachedAt: Date.now() }));
  } catch {}
}

function getCachedStudentProfile() {
  try {
    const raw = localStorage.getItem(STUDENT_CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data._cachedAt && Date.now() - data._cachedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(STUDENT_CACHE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function clearStudentCache() {
  try { localStorage.removeItem(STUDENT_CACHE_KEY); } catch {}
}

async function signInWithGoogle() {
  try {
    return (await signInWithPopup(auth, googleProvider)).user;
  } catch (err) {
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
      throw new Error("تم إلغاء تسجيل الدخول.");
    }
    throw new Error("تعذّر تسجيل الدخول. حاول مرة أخرى.");
  }
}

async function signOutUser() {
  try { await fbSignOut(auth); } catch {}
  currentUser = null;
  currentProfile = null;
  currentStudentProfile = null;
  clearProfileCache();
  clearStudentCache();
  try {
    sessionStorage.removeItem("qeyasquiz.lastAttempt");
    localStorage.removeItem("qeyasquiz.lastAttempt");
    localStorage.removeItem("qeyasquiz.studentName");
  } catch {}
  navigate("/login");
}

async function loadProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch { return null; }
}

async function loadStudentProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "students", uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch { return null; }
}

async function saveStudentProfile(uid, fullName) {
  const studentRef = doc(db, "students", uid);
  const user = auth.currentUser;
  const payload = {
    uid,
    fullName: fullName.trim(),
    email: user?.email || "",
    photoURL: user?.photoURL || "",
    role: "student",
    updatedAt: serverTimestamp()
  };

  const snap = await getDoc(studentRef);
  if (snap.exists()) {
    await updateDoc(studentRef, payload);
  } else {
    payload.createdAt = serverTimestamp();
    await setDoc(studentRef, payload);
  }

  const profile = { uid, fullName: fullName.trim(), email: user?.email || "", role: "student" };
  cacheStudentProfile(profile);
  return profile;
}

async function checkUsernameAvailability(username) {
  const snap = await getDoc(doc(db, "usernames", normalizeUsername(username)));
  return !snap.exists();
}

async function claimUsername(uid, username, profileData) {
  const normalized = normalizeUsername(username);
  const userRef = doc(db, "users", uid);
  const unameRef = doc(db, "usernames", normalized);
  await runTransaction(db, async (tx) => {
    const unameSnap = await tx.get(unameRef);
    if (unameSnap.exists() && unameSnap.data().uid !== uid) throw new Error("USERNAME_TAKEN");
    tx.set(unameRef, { uid, createdAt: serverTimestamp() });
    tx.set(userRef, {
      uid,
      username,
      normalizedUsername: normalized,
      fullName: profileData.fullName,
      photoURL: profileData.photoURL || "",
      subjects: profileData.subjects || [],
      mainSubject: profileData.subjects?.[0] || "",
      role: "teacher",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
}

async function listExams(uid, limitN = 100) {
  try {
    const snap = await getDocs(query(
      collection(db, "exams"),
      where("ownerId", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(limitN)
    ));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    try {
      const snap = await getDocs(query(collection(db, "exams"), where("ownerId", "==", uid)));
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
  } catch (err) {
    console.error("[getStudentAttempt]", err);
    return null;
  }
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

/* ============================================================
   SIGNED UPLOAD
   ============================================================ */
async function getUploadSignature(folder) {
  const res = await fetch("/api/cloudinary-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder })
  });
  if (!res.ok) throw new Error("SIGN_FAILED");
  const data = await res.json().catch(() => ({}));
  if (!data.signature || !data.apiKey || !data.timestamp) throw new Error("SIGN_INVALID");
  return data;
}

async function uploadToCloudinary(file, folder, maxBytes = 2 * 1024 * 1024) {
  if (!file) throw new Error("NO_FILE");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("INVALID_TYPE");
  if (file.size > maxBytes) throw new Error("TOO_LARGE");
  if (!UPLOAD.cloudName) throw new Error("CONFIG_MISSING");

  let sign;
  try {
    sign = await getUploadSignature(folder);
  } catch (err) {
    console.error("[upload] signature step failed:", err);
    throw new Error("SIGN_FAILED");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", sign.apiKey);
  formData.append("timestamp", sign.timestamp);
  formData.append("signature", sign.signature);
  formData.append("folder", sign.folder);

  const endpoint = `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`;

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      body: formData,
      mode: "cors"
    });
  } catch (err) {
    console.error("[upload] network error:", err);
    throw new Error("NETWORK_ERROR");
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("[upload] rejected:", { status: res.status, response: body });
    throw new Error("UPLOAD_FAILED");
  }

  if (!body.secure_url) throw new Error("UPLOAD_INCOMPLETE");

  return body.secure_url;
}

function uploadErrorMessage(err, maxLabel = "") {
  const msg = err?.message || "";
  const suffix = maxLabel ? ` (${maxLabel})` : "";
  if (msg === "NO_FILE") return "لم يتم اختيار ملف";
  if (msg === "INVALID_TYPE") return "صيغة الصورة غير مدعومة — JPG أو PNG أو WebP فقط";
  if (msg === "TOO_LARGE") return `حجم الصورة أكبر من الحد المسموح${suffix}`;
  if (msg === "CONFIG_MISSING") return "الإعدادات غير مكتملة — تواصل مع الدعم";
  if (msg === "SIGN_FAILED" || msg === "SIGN_INVALID") return "تعذّر تجهيز الرفع — حاول مرة أخرى";
  if (msg === "NETWORK_ERROR") return "تعذّر الاتصال بالخادم — تحقق من الإنترنت أو عطّل مانع الإعلانات";
  if (msg === "UPLOAD_INCOMPLETE") return "الرفع لم يكتمل — حاول مرة أخرى";
  if (msg === "UPLOAD_FAILED") return "فشل رفع الصورة — حاول مرة أخرى";
  return "تعذّر رفع الصورة — حاول مرة أخرى";
}

async function uploadAvatar(uid, file) {
  return uploadToCloudinary(file, `${UPLOAD.avatarFolder}/${uid}`, 2 * 1024 * 1024);
}

async function uploadQuestionImage(examId, file) {
  return uploadToCloudinary(file, `${UPLOAD.questionFolder}/${examId || "draft"}`, 5 * 1024 * 1024);
}

/* ============================================================
   ROUTER
   ============================================================ */
const ROUTES = {
  "/": { page: "landing" },
  "/login": { page: "login" },
  "/setup": { page: "setup" },
  "/app/dashboard": { page: "app", view: "dashboard" },
  "/app/exams": { page: "app", view: "exams" },
  "/app/builder": { page: "app", view: "builder" },
  "/app/exam": { page: "app", view: "exam-details" },
  "/app/grading": { page: "app", view: "grading" },
  "/app/bank": { page: "app", view: "bank" },
  "/app/profile": { page: "app", view: "profile" },
  "/app/settings": { page: "app", view: "settings" },
  "/app/support": { page: "app", view: "support" },
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
  const rawNext = (location.hash.replace(/^#/, "")) || "/";
  const [nextPath] = rawNext.split("?");
  if (examRuntime && examRuntime.watcherUnsub && nextPath !== "/exam") {
    try { examRuntime.watcherUnsub(); } catch {}
    examRuntime.watcherUnsub = null;
  }

  const raw = (location.hash.replace(/^#/, "")) || "/";
  const [path, qs] = raw.split("?");
  const params = new URLSearchParams(qs || "");
  currentParams = params;
  const route = ROUTES[path] || ROUTES["/"];
  const targetPage = route.page;

  $$("[data-page]").forEach((p) => { p.hidden = p.dataset.page !== targetPage; });

  if (route.view) {
    $$("[data-view]").forEach((v) => { v.hidden = v.dataset.view !== route.view; });
    $$(".side-link").forEach((l) => l.classList.toggle("is-active", l.dataset.route === route.view));

    const titleMap = {
      dashboard: "الرئيسية",
      exams: "امتحاناتي",
      builder: "منشئ الامتحان",
      "exam-details": "تفاصيل الامتحان",
      grading: "التصحيح",
      bank: "بنك الأسئلة",
      profile: "الملف الشخصي",
      settings: "الإعدادات",
      support: "ادعمنا"
    };
    const titleEl = $("[data-page-title]");
    if (titleEl) titleEl.textContent = titleMap[route.view] || "";

    const backBtn = $("[data-back]");
    if (backBtn) backBtn.hidden = route.view === "dashboard";
  }

  currentRoute = path;
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

function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

/* ============================================================
   AUTH STATE
   ============================================================ */
let authResolved = false;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (!user) {
    currentProfile = null;
    currentStudentProfile = null;
    clearProfileCache();
    clearStudentCache();
    authResolved = true;
    hideGlobalLoading();

    const isStudentOrPublic = ["/", "/login", "/exam", "/result"].includes(currentRoute);
    if (!isStudentOrPublic) {
      navigate("/login");
    } else if (currentRoute && routeHandlers[currentRoute]) {
      Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
    }
    return;
  }

  const cachedTeacher = getCachedProfile();
  const cachedStudent = getCachedStudentProfile();
  const hasTeacherCache = cachedTeacher && cachedTeacher.uid === user.uid && cachedTeacher.role === "teacher";

  if (hasTeacherCache) {
    currentProfile = cachedTeacher;
    currentStudentProfile = cachedStudent && cachedStudent.uid === user.uid ? cachedStudent : null;
    authResolved = true;
    hideGlobalLoading();
    updateUserUI(currentProfile, user);
    resolveAuthRoute();

    loadProfile(user.uid).then((fresh) => {
      if (fresh) {
        currentProfile = fresh;
        cacheProfile(fresh);
        updateUserUI(fresh, user);
        if (currentRoute && currentRoute.startsWith("/app/") && routeHandlers[currentRoute]) {
          Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
        }
      }
    }).catch(() => {});

    loadStudentProfile(user.uid).then((fresh) => {
      if (fresh) {
        currentStudentProfile = fresh;
        cacheStudentProfile(fresh);
      }
    }).catch(() => {});
    return;
  }

  const goingToApp = currentRoute && currentRoute.startsWith("/app/");
  if (goingToApp) showGlobalLoading("جارٍ تحميل حسابك…");

  try {
    const [teacherProfile, studentProfile] = await Promise.all([
      loadProfile(user.uid).catch(() => null),
      loadStudentProfile(user.uid).catch(() => null)
    ]);

    currentProfile = teacherProfile;
    currentStudentProfile = studentProfile;

    if (teacherProfile) cacheProfile(teacherProfile);
    if (studentProfile) cacheStudentProfile(studentProfile);
  } catch (err) {
    console.warn("[auth] load profiles failed", err);
    currentProfile = null;
    currentStudentProfile = null;
  }

  authResolved = true;
  hideGlobalLoading();
  updateUserUI(currentProfile, user);
  resolveAuthRoute();
});

function resolveAuthRoute() {
  const hasTeacherProfile = currentProfile && currentProfile.username;
  const isStudentOrPublic = ["/exam", "/result", "/"].includes(currentRoute);

  if (!currentUser) {
    if (isStudentOrPublic || currentRoute === "/login") {
      if (currentRoute && routeHandlers[currentRoute]) {
        Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
      }
      return;
    }
    navigate("/login");
    return;
  }

  if (!hasTeacherProfile) {
    if (isStudentOrPublic) {
      if (currentRoute && routeHandlers[currentRoute]) {
        Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
      }
      return;
    }

    if (currentRoute === "/setup") {
      if (routeHandlers[currentRoute]) {
        Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
      }
      return;
    }

    navigate("/setup");
    return;
  }

  if (currentRoute === "/login" || currentRoute === "/setup") {
    navigate("/app/dashboard");
    return;
  }

  if (currentRoute && routeHandlers[currentRoute]) {
    Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
  }
}

function updateUserUI(profile, user) {
  const name = profile?.fullName || user?.displayName || "";
  const handle = "@" + (profile?.username || "");
  const photo = profile?.photoURL || user?.photoURL || "";
  $$("[data-user-name]").forEach((e) => (e.textContent = name));
  $$("[data-user-handle]").forEach((e) => (e.textContent = handle));
  $$("[data-user-avatar]").forEach((e) => { if (photo) e.src = photo; });
}

/* ============================================================
   LANDING
   ============================================================ */
function initLanding() {
  document.querySelectorAll("[data-year]").forEach((e) => (e.textContent = new Date().getFullYear()));
}

/* ============================================================
   LOGIN
   ============================================================ */
function initLogin() {
  const btn = $("[data-google-signin]");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";

  const status = $("[data-auth-status]");
  const errBox = $("[data-auth-error]");
  const errText = $("[data-auth-error-text]");
  const tabs = $$(".auth-tab");
  const titleEl = $("[data-auth-title]");
  const subtitleEl = $("[data-auth-subtitle]");
  const googleText = $("[data-auth-google-text]");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.authTab;
      tabs.forEach((x) => {
        x.classList.toggle("is-active", x === tab);
        x.setAttribute("aria-selected", x === tab ? "true" : "false");
      });
      if (mode === "signin") {
        titleEl.textContent = "مرحبًا بعودتك";
        subtitleEl.textContent = "سجّل الدخول للمتابعة.";
        googleText.textContent = "الدخول بحساب Google";
      } else {
        titleEl.textContent = "أنشئ حسابك";
        subtitleEl.textContent = "ابدأ خلال ثوانٍ.";
        googleText.textContent = "التسجيل بحساب Google";
      }
    });
  });

  btn.addEventListener("click", async () => {
    errBox.hidden = true;
    status.hidden = false;
    btn.classList.add("is-loading");
    try {
      await signInWithGoogle();
    } catch (err) {
      status.hidden = true;
      btn.classList.remove("is-loading");
      errBox.hidden = false;
      errText.textContent = err.message;
    }
  });
}

/* ============================================================
   SETUP (Teacher)
   ============================================================ */
let setupState = { photoFile: null, selectedSubjects: [] };

function initSetup() {
  const form = $("[data-setup-form]");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";

  setupState = { photoFile: null, selectedSubjects: [] };

  const usernameInput = $("[data-username-input]");
  const usernameStatus = $("[data-username-status]");
  const usernameError = $("[data-username-error]");
  const fullNameInput = $("[data-fullname-input]");
  const avatarPreview = $("[data-avatar-preview]");
  const avatarInput = $("[data-avatar-input]");
  const avatarPick = $("[data-avatar-pick]");
  const avatarReset = $("[data-avatar-reset]");
  const subjectGrid = $("[data-subject-grid]");
  const customInput = $("[data-custom-subject]");
  const addCustomBtn = $("[data-add-custom-subject]");
  const customChips = $("[data-custom-chips]");
  const subjectsError = $("[data-subjects-error]");

  if (currentUser) {
    if (currentUser.displayName) fullNameInput.value = currentUser.displayName;
    if (currentUser.photoURL) avatarPreview.src = currentUser.photoURL;
    const base = (currentUser.email || "").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    if (base.length >= 3) usernameInput.value = base;
  }

  function renderSubjectGrid() {
    subjectGrid.innerHTML = "";
    SUBJECTS.forEach((s) => {
      const selected = setupState.selectedSubjects.includes(s.id);
      const chip = el("button", {
        type: "button",
        class: `subject-chip ${selected ? "is-selected" : ""}`,
        text: s.ar,
        onclick: () => {
          const idx = setupState.selectedSubjects.indexOf(s.id);
          if (idx >= 0) setupState.selectedSubjects.splice(idx, 1);
          else setupState.selectedSubjects.push(s.id);
          renderSubjectGrid();
        }
      });
      subjectGrid.appendChild(chip);
    });
  }
  renderSubjectGrid();

  const customSubjects = [];
  function renderCustomChips() {
    customChips.innerHTML = "";
    customSubjects.forEach((name, i) => {
      const chip = el("span", { class: "chip" });
      chip.appendChild(document.createTextNode(name));
      const rm = el("button", { type: "button", class: "chip-remove", "aria-label": "حذف" });
      rm.appendChild(svgIcon("x", 10));
      rm.addEventListener("click", () => {
        customSubjects.splice(i, 1);
        renderCustomChips();
      });
      chip.appendChild(rm);
      customChips.appendChild(chip);
    });
  }

  addCustomBtn.addEventListener("click", () => {
    const v = customInput.value.trim();
    if (!v || v.length < 2 || customSubjects.includes(v)) return;
    customSubjects.push(v);
    customInput.value = "";
    renderCustomChips();
  });

  const checkUname = debounce(async () => {
    const val = usernameInput.value.trim();
    usernameError.hidden = true;
    usernameStatus.textContent = "";
    usernameStatus.className = "input-status";
    if (!val) return;
    if (!validUsername(val)) {
      usernameError.hidden = false;
      usernameError.textContent = "3–24 حرفًا. حروف وأرقام وشرطة سفلية فقط.";
      return;
    }
    usernameStatus.textContent = "…";
    usernameStatus.classList.add("is-checking");
    try {
      const ok = await checkUsernameAvailability(val);
      usernameStatus.classList.remove("is-checking");
      if (ok) {
        usernameStatus.textContent = "متاح";
        usernameStatus.classList.add("is-available");
      } else {
        usernameStatus.textContent = "مأخوذ";
        usernameStatus.classList.add("is-taken");
      }
    } catch { usernameStatus.textContent = ""; }
  }, 400);

  usernameInput.addEventListener("input", checkUname);

  avatarPick.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", () => {
    const f = avatarInput.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast("الحد الأقصى 2 ميجابايت", "warning"); return; }
    setupState.photoFile = f;
    avatarPreview.src = URL.createObjectURL(f);
  });
  avatarReset.addEventListener("click", () => {
    setupState.photoFile = null;
    avatarPreview.src = currentUser?.photoURL || "";
    avatarInput.value = "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let ok = true;

    const uname = usernameInput.value.trim();
    if (!validUsername(uname)) {
      usernameError.hidden = false;
      usernameError.textContent = "3–24 حرفًا. حروف وأرقام وشرطة سفلية فقط.";
      ok = false;
    }

    const fullName = fullNameInput.value.trim();
    if (fullName.length < 3) {
      toast("أدخل اسمك الكامل", "warning");
      ok = false;
    }

    if (setupState.selectedSubjects.length === 0 && customSubjects.length === 0) {
      subjectsError.hidden = false;
      subjectsError.textContent = "اختر مادة واحدة على الأقل";
      ok = false;
    } else subjectsError.hidden = true;

    if (!ok) return;

    const submitBtn = $("[data-submit]");
    submitBtn.classList.add("is-loading");
    try {
      let photoURL = currentUser?.photoURL || "";
      if (setupState.photoFile) {
        try {
          photoURL = await uploadAvatar(currentUser.uid, setupState.photoFile);
        } catch (err) {
          console.warn(err);
          toast(uploadErrorMessage(err, "2 ميجابايت") + " — سيتم استخدام صورة Google", "warning", 6000);
        }
      }

      const allSubjects = [
        ...setupState.selectedSubjects,
        ...customSubjects.map((name) => "custom:" + name)
      ];

      await claimUsername(currentUser.uid, uname, { fullName, photoURL, subjects: allSubjects });

      currentProfile = await loadProfile(currentUser.uid);
      if (currentProfile) cacheProfile(currentProfile);
      updateUserUI(currentProfile, currentUser);
      toast("تم حفظ الملف", "success");
      navigate("/app/dashboard");
    } catch (err) {
      submitBtn.classList.remove("is-loading");
      if (err.message === "USERNAME_TAKEN") {
        usernameError.hidden = false;
        usernameError.textContent = "اسم المستخدم مأخوذ";
        usernameStatus.textContent = "مأخوذ";
        usernameStatus.className = "input-status is-taken";
      } else {
        console.error(err);
        toast("تعذّر حفظ البيانات.", "error");
      }
    }
  });
}

/* ============================================================
   DASHBOARD
   ============================================================ */
async function renderDashboard() {
  if (!currentProfile) return;

  const welcomeTitle = $("[data-welcome-title]");
  if (welcomeTitle) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";
    welcomeTitle.textContent = `${greeting}، ${(currentProfile.fullName || "").split(" ")[0] || ""}`;
  }

  const exams = await listExams(currentProfile.uid);
  const stats = {
    totalExams: exams.length,
    activeExams: exams.filter((e) => computeStatus(e) === "active").length,
    submittedStudents: 0,
    waitingGrading: 0
  };

  for (const exam of exams.slice(0, 15)) {
    const atts = await listAttempts(exam.id);
    stats.submittedStudents += atts.filter((a) => a.status === "submitted" || a.status === "graded").length;
    stats.waitingGrading += atts.filter((a) => a.status === "submitted" && !a.gradedAt).length;
  }

  $$("[data-stat]").forEach((e) => { e.textContent = String(stats[e.dataset.stat] ?? 0); });

  const recentHost = $("[data-recent-exams]");
  if (recentHost) {
    recentHost.innerHTML = "";
    if (!exams.length) {
      recentHost.appendChild(el("div", { class: "empty" }, [
        el("h3", { text: "لا توجد امتحانات بعد" }),
        el("p", { text: "أنشئ أول امتحان للبدء." }),
        el("button", {
          class: "btn btn-primary", type: "button", text: "إنشاء امتحان",
          onclick: () => navigate("/app/builder")
        })
      ]));
    } else {
      exams.slice(0, 6).forEach((exam) => recentHost.appendChild(buildExamCard(exam)));
    }
  }
}

function buildExamCard(exam) {
  const status = computeStatus(exam);
  const card = el("article", { class: "card-brutal tint-1 exam-card" });
  card.appendChild(el("div", { class: "exam-card-head" }, [
    el("div", {}, [
      el("div", { class: "exam-card-title", text: exam.title || "بدون اسم" }),
      el("div", { class: "exam-card-sub", text: `${subjectLabel(exam.subject)} · ${gradeLabel(exam.grade)}` })
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
  if (!arr.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  arr.forEach((exam) => list.appendChild(buildExamCard(exam)));
}

/* ============================================================
   EXAM BUILDER
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
    shuffleQuestions: false, requireAccessCode: false, accessCode: "",
    requireFullscreen: true,
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
      shuffleQuestions: false, requireAccessCode: false, accessCode: "",
      requireFullscreen: true,
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
  setVal("#examAccessCode", d.accessCode);
  setVal("#examStart", toLocalInput(d.startAt));
  setVal("#examEnd", toLocalInput(d.endAt));

  const subjSel = $("#examSubject");
  if (subjSel) {
    subjSel.innerHTML = `<option value="">اختر المادة</option>`;
    (currentProfile?.subjects || []).forEach((sid) => {
      const label = sid.startsWith("custom:") ? sid.slice(7) : subjectLabel(sid);
      subjSel.appendChild(el("option", { value: sid, text: label }));
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
  setChk('[data-field="requireAccessCode"]', d.requireAccessCode);
  setChk('[data-field="requireFullscreen"]', d.requireFullscreen);

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
    mcq: "اختيار من متعدد",
    mcq_just: "اختيار + تبرير",
    tf: "صح / خطأ",
    tf_just: "صح / خطأ + تبرير",
    complete: "أكمل",
    essay: "مقالي"
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
      q._saved = false;
      q._error = false;
      updateSaveBtn();
      updateCardStatus();
    }
  }

  saveBtn.addEventListener("click", async () => {
    saveBtn.classList.add("is-loading");
    try {
      const err = validateSingleQuestion(q);
      if (err) {
        q._error = true;
        updateCardStatus();
        toast(err, "warning");
        saveBtn.classList.remove("is-loading");
        return;
      }
      q._error = false;
      await saveSingleQuestion(q);
      q._saved = true;
      updateSaveBtn();
      updateCardStatus();
      toast("تم حفظ السؤال والإجابة", "success");
    } catch (err) {
      console.error("[saveQuestion]", err);
      q._error = true;
      updateCardStatus();
      const reason = err?.message === "Could not create exam"
        ? "تعذّر إنشاء مسودة الامتحان — جرب تحفظ الكل أولاً"
        : err?.message || "خطأ في الشبكة";
      toast(`فشل حفظ السؤال ${idx + 1}: ${reason}`, "error", 6000);
    } finally {
      saveBtn.classList.remove("is-loading");
    }
  });

  updateSaveBtn();
  saveRow.appendChild(saveBtn);
  card.appendChild(saveRow);

  const body = el("div", { class: "question-body" });

  const ta = el("textarea", { class: "textarea" });
  ta.placeholder = "نص السؤال…";
  ta.value = q.text || "";
  ta.addEventListener("input", () => {
    q.text = ta.value;
    markQuestionUnsaved();
    markDirty();
  });
  body.appendChild(ta);

  const imgField = el("div", { class: "field" });
  const imgRow = el("div", { class: "row" });
  const fileInput = el("input", { type: "file", accept: "image/*", hidden: "hidden" });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      toast("جارٍ الرفع…", "info", 2000);
      const url = await uploadQuestionImage(builderState.examId, f);
      q.imageUrl = url;
      markQuestionUnsaved();
      renderBuilderQuestions();
      markDirty();
    } catch (err) {
      console.error(err);
      toast(uploadErrorMessage(err, "5 ميجابايت"), "error", 7000);
    }
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
      q.imageUrl = null;
      markQuestionUnsaved();
      renderBuilderQuestions();
      markDirty();
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
      radio.addEventListener("change", () => {
        q.correctIndex = i;
        markQuestionUnsaved();
        markDirty();
      });
      row.appendChild(radio);
      row.appendChild(el("span", { class: "option-label", text: String.fromCharCode(65 + i) }));
      const inp = el("input", { type: "text", class: "input", value: opt || "" });
      inp.placeholder = "خيار " + String.fromCharCode(65 + i);
      inp.addEventListener("input", () => {
        q.options[i] = inp.value;
        markQuestionUnsaved();
        markDirty();
      });
      row.appendChild(inp);

      const delBtn = el("button", { class: "icon-btn", type: "button" });
      delBtn.appendChild(svgIcon("x", 14));
      delBtn.addEventListener("click", () => {
        q.options.splice(i, 1);
        if (q.correctIndex === i) q.correctIndex = 0;
        else if (q.correctIndex > i) q.correctIndex--;
        markQuestionUnsaved();
        renderBuilderQuestions();
        markDirty();
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
        markQuestionUnsaved();
        renderBuilderQuestions();
        markDirty();
      });
      opts.appendChild(addBtn);
    }
    body.appendChild(opts);

    if (q.type === "mcq_just") {
      const jField = el("div", { class: "field mt-3" });
      jField.appendChild(el("label", { class: "field-label", text: "الإجابة النموذجية للتبرير" }));
      const jTa = el("textarea", { class: "textarea" });
      jTa.placeholder = "اكتب التبرير المثالي المتوقع من الطالب…";
      jTa.value = q.justificationModelAnswer || "";
      jTa.addEventListener("input", () => {
        q.justificationModelAnswer = jTa.value;
        markQuestionUnsaved();
        markDirty();
      });
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
      radio.addEventListener("change", () => {
        q.correctBool = v;
        markQuestionUnsaved();
        markDirty();
      });
      row.appendChild(radio);
      row.appendChild(el("span", { text: l }));
      wrap.appendChild(row);
    });
    body.appendChild(wrap);

    if (q.type === "tf_just") {
      const jField = el("div", { class: "field mt-3" });
      jField.appendChild(el("label", { class: "field-label", text: "الإجابة النموذجية للتبرير" }));
      const jTa = el("textarea", { class: "textarea" });
      jTa.placeholder = "اكتب التبرير المثالي المتوقع من الطالب…";
      jTa.value = q.justificationModelAnswer || "";
      jTa.addEventListener("input", () => {
        q.justificationModelAnswer = jTa.value;
        markQuestionUnsaved();
        markDirty();
      });
      jField.appendChild(jTa);
      body.appendChild(jField);
    }
  }

  if (q.type === "complete") {
    const f = el("div", { class: "field" });
    f.appendChild(el("label", { class: "field-label", text: "الإجابة الصحيحة" }));
    const inp = el("input", { type: "text", class: "input", value: q.correctText || "" });
    inp.addEventListener("input", () => {
      q.correctText = inp.value;
      markQuestionUnsaved();
      markDirty();
    });
    f.appendChild(inp);
    body.appendChild(f);
  }

  if (q.type === "essay") {
    const f = el("div", { class: "field" });
    f.appendChild(el("label", { class: "field-label", text: "الإجابة النموذجية" }));
    const txt = el("textarea", { class: "textarea" });
    txt.value = q.modelAnswer || "";
    txt.addEventListener("input", () => {
      q.modelAnswer = txt.value;
      markQuestionUnsaved();
      markDirty();
    });
    f.appendChild(txt);
    body.appendChild(f);
  }

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

/* ============================================================
   VALIDATION + SAVE
   ============================================================ */
function validateSingleQuestion(q) {
  if (!q.text || !q.text.trim()) return "أدخل نص السؤال";

  if (q.type === "mcq" || q.type === "mcq_just") {
    const opts = q.options || [];
    const filled = opts.filter((o) => o && o.trim());
    if (filled.length < 2) return "أدخل خيارين على الأقل";
    if (q.correctIndex == null || q.correctIndex >= opts.length) return "اختر الإجابة الصحيحة";
    if (!opts[q.correctIndex] || !opts[q.correctIndex].trim()) return "الإجابة الصحيحة فاضية";
  }

  if (q.type === "tf" || q.type === "tf_just") {
    if (q.correctBool == null) return "اختر الإجابة الصحيحة (صح / خطأ)";
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

async function saveSingleQuestion(q) {
  if (!currentProfile) throw new Error("Not logged in");

  if (!builderState.examId) {
    await autosaveBuilderNow();
    await new Promise((r) => setTimeout(r, 400));
  }
  if (!builderState.examId) throw new Error("Could not create exam");

  const answer = {};
  if (q.type === "mcq" || q.type === "mcq_just") answer.correctIndex = q.correctIndex;
  else if (q.type === "tf" || q.type === "tf_just") answer.correctBool = q.correctBool;
  else if (q.type === "complete") answer.correctText = q.correctText || "";
  else if (q.type === "essay") answer.modelAnswer = q.modelAnswer || "";

  if (q.type === "mcq_just" || q.type === "tf_just") {
    answer.justificationModelAnswer = q.justificationModelAnswer || "";
  }

  const answersRef = doc(db, "examAnswers", builderState.examId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(answersRef);
    const existing = snap.exists() ? (snap.data().answers || {}) : {};
    existing[q.id] = answer;
    tx.set(answersRef, {
      ownerId: currentProfile.uid,
      examId: builderState.examId,
      answers: existing,
      updatedAt: serverTimestamp()
    });
  });

  const examRef = doc(db, "exams", builderState.examId);
  const cleanForms = builderState.data.forms.map((form) => ({
    id: form.id,
    name: form.name,
    questions: (form.questions || []).map((question) => {
      const out = {
        id: question.id,
        type: question.type,
        text: question.text,
        score: Number(question.score) || 0
      };
      if (question.imageUrl) out.imageUrl = question.imageUrl;
      if (question.type === "mcq" || question.type === "mcq_just") {
        out.options = question.options || [];
      }
      return out;
    })
  }));

  const allQuestions = cleanForms.flatMap((f) => f.questions);
  const totalScore = allQuestions.reduce((s, qq) => s + (Number(qq.score) || 0), 0);

  await updateDoc(examRef, {
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
    id: form.id,
    name: form.name,
    questions: (form.questions || []).map((q) => {
      const out = {
        id: q.id,
        type: q.type,
        text: q.text,
        score: Number(q.score) || 0
      };
      if (q.imageUrl) out.imageUrl = q.imageUrl;
      if (q.type === "mcq" || q.type === "mcq_just") out.options = q.options || [];
      return out;
    })
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
    title: d.title,
    subject: d.subject,
    grade: d.grade,
    duration: Number(d.duration) || 60,
    startAt: d.startAt instanceof Timestamp ? d.startAt : (d.startAt ? Timestamp.fromDate(new Date(d.startAt)) : null),
    endAt: d.endAt instanceof Timestamp ? d.endAt : (d.endAt ? Timestamp.fromDate(new Date(d.endAt)) : null),
    displayMode: d.displayMode || "scroll",
    shuffleQuestions: !!d.shuffleQuestions,
    requireAccessCode: !!d.requireAccessCode,
    accessCode: d.requireAccessCode ? (d.accessCode || "") : "",
    requireFullscreen: d.requireFullscreen !== false,
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
        ownerId: currentProfile.uid,
        examId: builderState.examId,
        answers: merged,
        updatedAt: serverTimestamp()
      });
    });
  } else {
    examPayload.createdAt = serverTimestamp();
    const ref = await addDoc(collection(db, "exams"), examPayload);
    builderState.examId = ref.id;
    await setDoc(doc(db, "examAnswers", ref.id), {
      ownerId: currentProfile.uid,
      examId: ref.id,
      answers: answerKey,
      updatedAt: serverTimestamp()
    });
    history.replaceState(null, "", `#/app/builder?id=${ref.id}`);
  }
}

function addQuestion(type) {
  const q = {
    id: uid(10),
    type,
    text: "",
    options: (type === "mcq" || type === "mcq_just") ? ["", "", "", ""] : [],
    correctIndex: 0,
    correctBool: null,
    correctText: "",
    modelAnswer: "",
    justificationModelAnswer: "",
    imageUrl: null,
    score: 1,
    _saved: false
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
    { type: "mcq_just", title: "اختيار + تبرير", hint: "اختيار مع كتابة تبرير (تصحيح يدوي)" },
    { type: "tf", title: "صح / خطأ", hint: "عبارة صح أو خطأ" },
    { type: "tf_just", title: "صح / خطأ + تبرير", hint: "صح أو خطأ مع تبرير (تصحيح يدوي)" },
    { type: "complete", title: "أكمل", hint: "إكمال الفراغ" },
    { type: "essay", title: "مقالي", hint: "إجابة طويلة (تصحيح يدوي)" }
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

  openModal({
    title: "اختر نوع السؤال",
    body,
    actions: [{ label: "إلغاء", class: "btn-ghost" }]
  });
}

function renderBuilderForms() {
  const tabs = $("[data-forms-tabs]");
  const listHost = $("[data-form-questions-list]");
  const nameEl = $("[data-form-current-name]");
  const countEl = $("[data-form-question-count]");
  if (!tabs) return;

  tabs.innerHTML = "";
  builderState.data.forms.forEach((form, i) => {
    const tab = el("button", {
      type: "button",
      class: `forms-tab ${i === builderState.currentFormIndex ? "is-active" : ""}`
    });
    tab.appendChild(document.createTextNode(form.name));
    if (builderState.data.forms.length > 1) {
      const rm = el("span", { class: "forms-tab-remove" });
      rm.appendChild(svgIcon("x", 12));
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        removeForm(i);
      });
      tab.appendChild(rm);
    }
    tab.addEventListener("click", () => {
      builderState.currentFormIndex = i;
      renderBuilderForms();
      renderBuilderQuestions();
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
  renderBuilderForms();
  renderBuilderQuestions();
  markDirty();
}

function removeForm(idx) {
  if (builderState.data.forms.length <= 1) return;
  builderState.data.forms.splice(idx, 1);
  if (builderState.currentFormIndex >= builderState.data.forms.length) {
    builderState.currentFormIndex = builderState.data.forms.length - 1;
  }
  renderBuilderForms();
  renderBuilderQuestions();
  markDirty();
}

function markDirty() {
  const state = $("[data-builder-save-state]");
  if (state) state.textContent = "جارٍ الحفظ…";
  autosaveBuilder();
}

const autosaveBuilder = debounce(async () => {
  if (!currentProfile) return;
  const d = builderState.data;
  if (!d.title.trim()) return;

  const cleanForms = d.forms.map((form) => ({
    id: form.id,
    name: form.name,
    questions: (form.questions || []).map((q) => {
      const out = {
        id: q.id,
        type: q.type,
        text: q.text,
        score: Number(q.score) || 0
      };
      if (q.imageUrl) out.imageUrl = q.imageUrl;
      if (q.type === "mcq" || q.type === "mcq_just") out.options = q.options || [];
      return out;
    })
  }));

  const allQuestions = cleanForms.flatMap((f) => f.questions);
  const totalScore = allQuestions.reduce((s, q) => s + (Number(q.score) || 0), 0);

  const examPayload = {
    ownerId: currentProfile.uid,
    title: d.title,
    subject: d.subject,
    grade: d.grade,
    duration: Number(d.duration) || 60,
    startAt: d.startAt instanceof Timestamp ? d.startAt : (d.startAt ? Timestamp.fromDate(new Date(d.startAt)) : null),
    endAt: d.endAt instanceof Timestamp ? d.endAt : (d.endAt ? Timestamp.fromDate(new Date(d.endAt)) : null),
    displayMode: d.displayMode || "scroll",
    shuffleQuestions: !!d.shuffleQuestions,
    requireAccessCode: !!d.requireAccessCode,
    accessCode: d.requireAccessCode ? (d.accessCode || "") : "",
    requireFullscreen: d.requireFullscreen !== false,
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
  if (!builderState.examId) {
    toast("تعذّر إنشاء الامتحان", "error");
    return;
  }

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
      actions: [{ label: "حسنًا", class: "btn-primary" }]
    });
    return;
  }

  const answerKey = {};
  allQ.forEach((q) => {
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

  const answersRef = doc(db, "examAnswers", builderState.examId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(answersRef);
    const existing = snap.exists() ? (snap.data().answers || {}) : {};
    const merged = { ...existing, ...answerKey };
    tx.set(answersRef, {
      ownerId: currentProfile.uid,
      examId: builderState.examId,
      answers: merged,
      updatedAt: serverTimestamp()
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
  if (!totalQ) errors.push("أضف سؤالاً واحدًا على الأقل");

  const unsaved = getAllBuilderQuestions().filter((q) => !q._saved);
  if (unsaved.length) {
    errors.push(`فيه ${unsaved.length} سؤال مش محفوظ. اضغط "حفظ الكل" الأول.`);
  }

  if (errors.length) {
    openModal({
      title: `${errors.length} ${errors.length === 1 ? "مشكلة" : "مشاكل"}`,
      body: el("ul", { style: "padding-inline-start:20px;line-height:2" }, errors.map((e) => el("li", { text: e }))),
      actions: [{ label: "حسنًا", class: "btn-primary" }]
    });
    return;
  }

  const summary = el("div", { class: "stack-sm" });
  [
    ["الاسم", d.title],
    ["الأسئلة", String(totalQ)],
    ["النماذج", String(d.forms.length)],
    ["المدة", `${d.duration} دقيقة`]
  ].forEach(([k, v]) => {
    summary.appendChild(el("div", { class: "row-between" }, [
      el("span", { text: k }),
      el("strong", { text: v })
    ]));
  });

  openModal({
    title: "نشر الامتحان؟",
    body: summary,
    actions: [
      { label: "إلغاء", class: "btn-ghost" },
      { label: "نشر", class: "btn-primary", onClick: async () => {
        try {
          await saveAllQuestions();
          await new Promise((r) => setTimeout(r, 400));

          const answersSnap = await getDoc(doc(db, "examAnswers", builderState.examId));
          if (!answersSnap.exists()) throw new Error("answers not saved");
          const savedAnswers = answersSnap.data().answers || {};
          const requiredIds = getAllBuilderQuestions().map((q) => q.id);
          const missing = requiredIds.filter((id) => !savedAnswers[id]);
          if (missing.length) {
            toast(`فيه ${missing.length} سؤال مش محفوظ.`, "warning");
            return false;
          }

          await updateDoc(doc(db, "exams", builderState.examId), {
            status: "scheduled",
            publishedAt: serverTimestamp()
          });
          toast("تم نشر الامتحان", "success");
          navigate(`/app/exam?id=${builderState.examId}`);
        } catch (err) {
          console.error(err);
          const reason = err?.code === "permission-denied"
            ? "ليس لديك صلاحية — أعد تسجيل الدخول"
            : err?.message || "خطأ في الشبكة";
          toast(`فشل النشر: ${reason}`, "error", 6000);
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
          toast("أضف سؤالاً واحدًا على الأقل", "warning");
          return;
        }
        switchBuilderStep(BUILDER_STEPS[idx + 1]);
      }
      return;
    }

    if (e.target.closest("[data-builder-save]")) {
      autosaveBuilder();
      toast("تم الحفظ", "success");
      return;
    }

    if (e.target.closest("[data-builder-save-all]")) {
      const btn = e.target.closest("[data-builder-save-all]");
      btn.classList.add("is-loading");
      saveAllQuestions().finally(() => btn.classList.remove("is-loading"));
      return;
    }

    if (e.target.closest("[data-builder-publish]")) { publishExam(); return; }
    if (e.target.closest("[data-builder-cancel]")) { navigate("/app/exams"); return; }

    if (e.target.closest("[data-builder-preview]")) {
      if (!builderState.examId) { toast("احفظ أولاً", "warning"); return; }
      window.open(location.pathname + `#/exam?id=${builderState.examId}&preview=1`, "_blank");
      return;
    }

    if (e.target.closest("[data-add-question]") || e.target.closest("[data-add-form-question]")) {
      showQuestionTypeModal();
      return;
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
    else if (f === "accessCode") d.accessCode = e.target.value;
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
   EXAM DETAILS + QUICK REPORT
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
    text: `${subjectLabel(exam.subject)} · ${gradeLabel(exam.grade)} · ${exam.totalQuestions || 0} سؤال · ${exam.duration || 0} دقيقة`
  }));
  head.appendChild(left);

  const actions = el("div", { class: "row" });
  actions.appendChild(el("span", { class: `badge badge-${status}`, text: statusLabel(status) }));

  if (exam.publishedAt) {
    const toggleWrap = el("label", { class: "exam-status-toggle" });
    const toggleInput = el("input", { type: "checkbox" });
    toggleInput.checked = exam.manualStatus !== "paused";
    toggleInput.addEventListener("change", async () => {
      const newStatus = toggleInput.checked ? "active" : "paused";
      try {
        await updateDoc(doc(db, "exams", exam.id), {
          manualStatus: newStatus === "active" ? null : "paused",
          updatedAt: serverTimestamp()
        });
        toast(newStatus === "active" ? "تم تفعيل الامتحان" : "تم إيقاف الامتحان", "success");
        renderExamDetails(currentParams);
      } catch (err) {
        console.error(err);
        toast("تعذّر التحديث", "error");
        toggleInput.checked = !toggleInput.checked;
      }
    });

    const track = el("span", { class: "exam-status-toggle-track" }, [
      el("span", { class: "exam-status-toggle-thumb" })
    ]);
    toggleWrap.appendChild(toggleInput);
    toggleWrap.appendChild(track);
    toggleWrap.appendChild(el("span", {
      text: exam.manualStatus === "paused" ? "متوقف" : "نشط"
    }));
    actions.appendChild(toggleWrap);
  }

  const editBtn = el("button", { class: "btn btn-outline btn-sm", type: "button", text: "تعديل" });
  editBtn.addEventListener("click", () => navigate(`/app/builder?id=${examId}`));
  actions.appendChild(editBtn);

  const shareBtn = el("button", { class: "btn btn-outline btn-sm", type: "button", text: "مشاركة" });
  shareBtn.addEventListener("click", () => shareExam(exam));
  actions.appendChild(shareBtn);

  head.appendChild(actions);
  host.appendChild(head);

  if (attempts.length) {
    const report = await buildQuickReport(exam, attempts);
    host.appendChild(report);
  }

  if (shouldShowLeaderboard(exam, attempts)) {
    host.appendChild(buildLeaderboard(exam, attempts));
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
    text: `${submitted.length} سلّموا · ${inProgress.length} داخل الامتحان`
  }));
  report.appendChild(participantsItem);

  if (graded.length) {
    const avg = Math.round(graded.reduce((s, a) => s + (Number(a.score) || 0), 0) / graded.length);
    const avgPct = totalPossible ? Math.round((avg / totalPossible) * 100) : 0;
    const avgItem = el("div", { class: "quick-report-item is-success" });
    avgItem.appendChild(el("span", { class: "quick-report-label", text: "متوسط الدرجات" }));
    avgItem.appendChild(el("span", {
      class: "quick-report-value",
      text: `${avg} / ${totalPossible}`
    }));
    avgItem.appendChild(el("span", {
      class: "quick-report-sub",
      text: `${avgPct}%`
    }));
    report.appendChild(avgItem);

    const highest = graded.reduce((best, a) =>
      (Number(a.score) || 0) > (Number(best.score) || 0) ? a : best
    , graded[0]);
    const highItem = el("div", { class: "quick-report-item" });
    highItem.appendChild(el("span", { class: "quick-report-label", text: "أعلى درجة" }));
    highItem.appendChild(el("span", {
      class: "quick-report-value",
      text: String(highest.score || 0)
    }));
    highItem.appendChild(el("span", {
      class: "quick-report-sub",
      text: highest.studentName || "—"
    }));
    report.appendChild(highItem);

    const lowest = graded.reduce((worst, a) =>
      (Number(a.score) || 0) < (Number(worst.score) || 0) ? a : worst
    , graded[0]);
    const lowItem = el("div", { class: "quick-report-item is-danger" });
    lowItem.appendChild(el("span", { class: "quick-report-label", text: "أقل درجة" }));
    lowItem.appendChild(el("span", {
      class: "quick-report-value",
      text: String(lowest.score || 0)
    }));
    lowItem.appendChild(el("span", {
      class: "quick-report-sub",
      text: lowest.studentName || "—"
    }));
    report.appendChild(lowItem);

    const allQuestions = getAllExamQuestions(exam);
    if (allQuestions.length && graded.length > 0) {
      const answersMap = await getExamAnswers(exam.id);
      const stats = allQuestions.map((q) => {
        let correctCount = 0;
        let attemptedCount = 0;
        const key = answersMap[q.id] || {};

        graded.forEach((a) => {
          const ans = (a.answers || {})[q.id] || {};
          if (q.type === "mcq" || q.type === "mcq_just") {
            if (ans.selectedIndex != null) {
              attemptedCount++;
              if (ans.selectedIndex === key.correctIndex) correctCount++;
            }
          } else if (q.type === "tf" || q.type === "tf_just") {
            if (ans.boolValue != null) {
              attemptedCount++;
              if (ans.boolValue === key.correctBool) correctCount++;
            }
          } else if (q.type === "complete") {
            const norm = (v) => String(v || "").trim().toLowerCase();
            if (ans.textValue && ans.textValue.trim()) {
              attemptedCount++;
              if (norm(ans.textValue) === norm(key.correctText)) correctCount++;
            }
          }
        });

        const successRate = attemptedCount ? (correctCount / attemptedCount) : 1;
        return { q, correctCount, attemptedCount, successRate };
      });

      const hardest = stats
        .filter((s) => s.attemptedCount > 0)
        .sort((a, b) => a.successRate - b.successRate)
        .slice(0, 3);

      if (hardest.length && hardest[0].successRate < 0.5) {
        const hardItem = el("div", { class: "quick-report-item is-warning" });
        hardItem.appendChild(el("span", { class: "quick-report-label", text: "أصعب سؤال" }));
        hardItem.appendChild(el("span", {
          class: "quick-report-value is-small",
          text: `س${allQuestions.indexOf(hardest[0].q) + 1}`
        }));
        const pct = Math.round(hardest[0].successRate * 100);
        hardItem.appendChild(el("span", {
          class: "quick-report-sub",
          text: `${pct}% إجابة صحيحة`
        }));
        report.appendChild(hardItem);
      }
    }
  }

  return report;
}

function renderStudentsTab(host, exam, attempts) {
  if (!attempts.length) {
    host.appendChild(el("div", { class: "empty" }, [
      el("h3", { text: "لا يوجد طلاب بعد" }),
      el("p", { text: "شارك رابط الامتحان للبدء." })
    ]));
    return;
  }

  const toolbar = el("div", { class: "row-between", style: "margin-bottom:var(--sp-3);gap:var(--sp-3);flex-wrap:wrap" });
  const pendingCount = attempts.filter((a) => a.status === "submitted" && !a.gradedAt).length;

  const infoEl = el("div", { class: "text-sm text-muted" });
  infoEl.textContent = pendingCount
    ? `فيه ${pendingCount} ورقة بانتظار التصحيح`
    : "كل الأوراق مصححة";
  toolbar.appendChild(infoEl);

  const gradeAllBtn = el("button", {
    type: "button",
    class: "btn btn-primary btn-sm",
    disabled: pendingCount === 0
  });
  gradeAllBtn.appendChild(svgIcon("check", 14));
  gradeAllBtn.appendChild(document.createTextNode(" تصحيح الكل"));
  gradeAllBtn.addEventListener("click", async () => {
    if (pendingCount === 0) return;
    gradeAllBtn.classList.add("is-loading");
    try {
      const graded = await autoGradeAttempts(exam.id, exam);
      if (graded > 0) {
        toast(`تم تصحيح ${graded} ورقة`, "success");
        renderExamDetails(currentParams);
      } else {
        toast("لا يوجد ما يستوجب التصحيح", "info");
      }
    } catch (err) {
      console.error(err);
      toast("فشل التصحيح", "error");
    } finally {
      gradeAllBtn.classList.remove("is-loading");
    }
  });
  toolbar.appendChild(gradeAllBtn);

  host.appendChild(toolbar);

  const wrap = el("div", { class: "card", style: "overflow-x:auto" });
  const table = el("table", { class: "students-table" });
  table.innerHTML = `<thead><tr>
    <th>الطالب</th>
    <th>الحالة</th>
    <th>البدء</th>
    <th>التسليم</th>
    <th>الدرجة</th>
    <th>الأحداث</th>
    <th>التفاصيل</th>
  </tr></thead>`;
  const tbody = el("tbody");
  const totalPossible = exam.totalScore || 0;

  attempts.forEach((a) => {
    const tr = el("tr", { style: "cursor:pointer" });
    tr.appendChild(el("td", { text: a.studentName || "—" }));
    tr.appendChild(el("td", {}, [
      el("span", { class: `badge badge-${a.status || "draft"}`, text: statusLabel(a.status || "draft") })
    ]));
    tr.appendChild(el("td", { text: fmtDate(a.startedAt) }));
    tr.appendChild(el("td", { text: a.submittedAt ? fmtDate(a.submittedAt) : "—" }));
    tr.appendChild(el("td", { text: a.score != null ? `${a.score} / ${totalPossible}` : "—" }));

    const eventsCount = (a.anticheatEvents || []).length;
    const warningsCount = (a.anticheatEvents || []).filter(
      (e) => e.type === "tab_hidden" || e.type === "window_blur" || e.type === "fullscreen_exit"
    ).length;
    const eventsTd = el("td");
    if (eventsCount === 0) {
      eventsTd.appendChild(el("span", { class: "badge badge-graded", text: "نظيف" }));
    } else {
      const badgeClass = warningsCount >= 3 ? "badge-paused"
        : warningsCount > 0 ? "badge-in_progress"
        : "badge-draft";
      eventsTd.appendChild(el("span", {
        class: `badge ${badgeClass}`,
        text: `${eventsCount} حدث`
      }));
    }
    tr.appendChild(eventsTd);

    const detailsTd = el("td");
    const detailsBtn = el("button", {
      type: "button",
      class: "btn btn-ghost btn-xs",
      title: "عرض تفاصيل الجلسة"
    });
    detailsBtn.appendChild(svgIcon("eye", 14));
    detailsBtn.appendChild(document.createTextNode(" تفاصيل"));
    detailsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openAttemptDetails(a, exam);
    });
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
      text: `${form.name} — ${(form.questions || []).length} سؤال`
    }));
    (form.questions || []).forEach((q, i) => {
      const row = el("div", { class: "grading-card mt-3" });
      row.appendChild(el("div", { class: "row-between mb-2" }, [
        el("span", { class: "fw-semibold", text: `س${i + 1} · ${qTypeLabel(q.type)}` }),
        el("span", { class: "badge badge-draft", text: `${q.score} نقطة` })
      ]));
      row.appendChild(el("p", { text: q.text || "—" }));
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
   ATTEMPT DETAILS — Timeline + Anti-cheat
   ============================================================ */
const EVENT_LABELS = {
  tab_hidden:       { label: "خرج من الصفحة",          color: "warning" },
  tab_visible:      { label: "رجع للصفحة",             color: "success" },
  window_blur:      { label: "خرج من النافذة",         color: "warning" },
  window_focus:     { label: "رجع للنافذة",            color: "success" },
  copy_attempt:     { label: "محاولة نسخ",             color: "danger"  },
  cut_attempt:      { label: "محاولة قص",              color: "danger"  },
  paste_blocked:    { label: "محاولة لصق (مرفوضة)",     color: "danger"  },
  context_menu:     { label: "فتح القائمة اليمنى",      color: "warning" },
  fullscreen_exit:  { label: "خرج من ملء الشاشة",      color: "danger"  },
  devtools_attempt: { label: "محاولة فتح DevTools",     color: "danger"  },
  devtools_open:    { label: "DevTools مفتوحة",        color: "danger"  },
  shortcut_c:       { label: "اختصار نسخ (Ctrl+C)",    color: "warning" },
  shortcut_x:       { label: "اختصار قص (Ctrl+X)",     color: "warning" },
  shortcut_a:       { label: "اختصار تحديد الكل",       color: "warning" },
  shortcut_s:       { label: "اختصار حفظ الصفحة",       color: "warning" },
  shortcut_p:       { label: "اختصار طباعة",           color: "warning" },
  shortcut_u:       { label: "اختصار عرض المصدر",       color: "warning" },
  offline:          { label: "انقطع الاتصال",          color: "warning" },
  online:           { label: "عاد الاتصال",           color: "success" },
};

function openAttemptDetails(attempt, exam) {
  const events = (attempt.anticheatEvents || []).slice().sort((a, b) => (a.at || 0) - (b.at || 0));

  const count = (type) => events.filter((e) => e.type === type).length;
  const stats = {
    tabSwitches: count("tab_hidden"),
    windowBlurs: count("window_blur"),
    copyAttempts: count("copy_attempt") + count("cut_attempt"),
    pasteAttempts: count("paste_blocked"),
    contextMenu: count("context_menu"),
    fsExits: count("fullscreen_exit"),
    devtools: count("devtools_attempt") + count("devtools_open"),
    shortcuts: events.filter((e) => (e.type || "").startsWith("shortcut_")).length,
    offline: count("offline"),
  };

  const totalSuspicious =
    stats.tabSwitches + stats.windowBlurs + stats.copyAttempts +
    stats.pasteAttempts + stats.fsExits + stats.devtools + stats.shortcuts;

  const body = el("div", { class: "stack" });

  const info = el("div", { class: "card", style: "background:var(--bg-subtle)" });
  const totalPossible = exam.totalScore || 0;
  [
    ["الطالب", attempt.studentName || "—"],
    ["الحالة", statusLabel(attempt.status || "draft")],
    ["البدء", fmtDate(attempt.startedAt)],
    ["التسليم", attempt.submittedAt ? fmtDate(attempt.submittedAt) : "—"],
    ["الدرجة", attempt.score != null ? `${attempt.score} / ${totalPossible}` : "—"],
  ].forEach(([k, v]) => {
    info.appendChild(el("div", { class: "row-between", style: "padding:6px 0" }, [
      el("span", { class: "text-sm text-muted", text: k }),
      el("span", { class: "text-sm fw-semibold", text: v }),
    ]));
  });
  body.appendChild(info);

  let verdictText = "لم يتم رصد أي نشاط مريب.";
  let verdictClass = "is-success";
  if (totalSuspicious >= 10) {
    verdictText = "نشاط مريب كثيف — يُنصح بمراجعة الإجابات يدويًا.";
    verdictClass = "is-danger";
  } else if (totalSuspicious >= 4) {
    verdictText = "نشاط مريب ملحوظ — راجع التفاصيل.";
    verdictClass = "is-warning";
  } else if (totalSuspicious > 0) {
    verdictText = "نشاط بسيط تم رصده.";
    verdictClass = "is-info";
  }

  const verdict = el("div", {
    class: `quick-report-item ${verdictClass}`,
    style: "padding:var(--sp-4);border-radius:var(--r-md)"
  });
  verdict.appendChild(el("div", { class: "fw-semibold", text: verdictText }));
  body.appendChild(verdict);

  const statsGrid = el("div", { class: "quick-report" });
  const statItems = [
    ["تبديل تاب", stats.tabSwitches, "is-warning"],
    ["خروج من النافذة", stats.windowBlurs, "is-warning"],
    ["نسخ / قص", stats.copyAttempts, "is-danger"],
    ["لصق مرفوض", stats.pasteAttempts, "is-danger"],
    ["خروج من ملء الشاشة", stats.fsExits, "is-danger"],
    ["DevTools", stats.devtools, "is-danger"],
    ["اختصارات", stats.shortcuts, "is-warning"],
    ["انقطاع نت", stats.offline, "is-info"],
  ];
  statItems.forEach(([label, value, cls]) => {
    const item = el("div", { class: `quick-report-item ${value > 0 ? cls : ""}` });
    item.appendChild(el("span", { class: "quick-report-label", text: label }));
    item.appendChild(el("span", { class: "quick-report-value", text: String(value) }));
    statsGrid.appendChild(item);
  });
  body.appendChild(statsGrid);

  const timelineHeader = el("div", {
    class: "builder-panel-title",
    style: "display:flex;align-items:center;gap:8px;margin-top:var(--sp-4)"
  });
  timelineHeader.appendChild(svgIcon("clock", 18));
  timelineHeader.appendChild(document.createTextNode(`الخط الزمني (${events.length} حدث)`));
  body.appendChild(timelineHeader);

  if (!events.length) {
    body.appendChild(el("div", { class: "empty", style: "padding:var(--sp-6)" }, [
      el("p", { class: "text-muted", text: "لا توجد أحداث مسجلة لهذه المحاولة." })
    ]));
  } else {
    const timeline = el("div", { class: "attempt-timeline" });

    events.forEach((evt) => {
      const meta = EVENT_LABELS[evt.type] || { label: evt.type, color: "info" };
      const row = el("div", { class: `attempt-timeline-row is-${meta.color}` });

      const left = el("div", { style: "display:flex;align-items:center;gap:10px;min-width:0" });
      const text = el("div", { style: "min-width:0" });
      text.appendChild(el("div", { class: "text-sm fw-semibold", text: meta.label }));
      if (evt.count != null) {
        text.appendChild(el("div", { class: "text-xs text-muted", text: `المرة ${evt.count}` }));
      }
      left.appendChild(text);
      row.appendChild(left);

      const time = new Date(evt.at || 0).toLocaleTimeString("ar-EG", {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      row.appendChild(el("span", { class: "attempt-timeline-time", text: time }));

      timeline.appendChild(row);
    });

    body.appendChild(timeline);
  }

  openModal({
    title: `تفاصيل جلسة — ${attempt.studentName || "طالب"}`,
    body,
    className: "attempt-details-modal",
    actions: [
      { label: "إغلاق", class: "btn-ghost" },
      {
        label: "تصحيح الورقة",
        class: "btn-primary",
        onClick: () => navigate(`/app/grading?exam=${exam.id}&attempt=${attempt.id}`)
      }
    ]
  });
}

/* ============================================================
   AUTO-GRADE
   ============================================================ */
async function autoGradeAttempts(examId, exam) {
  const answersMap = await getExamAnswers(examId);
  if (!Object.keys(answersMap).length) return 0;

  const attempts = await listAttempts(examId);
  const ungraded = attempts.filter((a) => !a.gradedAt && a.status === "submitted");
  if (!ungraded.length) return 0;

  const allQuestions = getAllExamQuestions(exam);
  const totalPossible = allQuestions.reduce((s, q) => s + (Number(q.score) || 0), 0);

  let count = 0;
  for (const attempt of ungraded) {
    const answers = attempt.answers || {};
    let autoScore = 0;
    const perQ = {};

    allQuestions.forEach((q) => {
      const a = answers[q.id] || {};
      const key = answersMap[q.id] || {};
      let sc = 0;

      if (q.type === "mcq") {
        if (a.selectedIndex != null && a.selectedIndex === key.correctIndex) sc = Number(q.score) || 0;
      } else if (q.type === "tf") {
        if (a.boolValue != null && a.boolValue === key.correctBool) sc = Number(q.score) || 0;
      } else if (q.type === "complete") {
        const norm = (v) => String(v || "").trim().toLowerCase();
        if (norm(a.textValue) === norm(key.correctText)) sc = Number(q.score) || 0;
      }
      perQ[q.id] = sc;
      autoScore += sc;
    });

    const hasManual = allQuestions.some((q) => ["essay", "mcq_just", "tf_just"].includes(q.type));
    const percentage = totalPossible ? Math.round((autoScore / totalPossible) * 100) : 0;

    try {
      const updateData = {
        autoScore,
        perQuestionScores: perQ,
        totalPossible
      };
      if (!hasManual) {
        updateData.score = autoScore;
        updateData.percentage = percentage;
        updateData.gradedAt = serverTimestamp();
        updateData.gradedBy = currentProfile.uid;
        updateData.status = "graded";
      }
      await updateDoc(doc(db, "attempts", attempt.id), updateData);
      count++;
    } catch (err) {
      console.warn("auto-grade failed", attempt.id, err);
    }
  }
  return count;
}

function getAllExamQuestions(exam) {
  if (exam.forms && exam.forms.length) {
    return exam.forms.flatMap((f) => f.questions || []);
  }
  return exam.questions || [];
}

/* ============================================================
   LEADERBOARD
   ============================================================ */
function buildLeaderboardRanking(attempts) {
  const valid = attempts.filter((a) => (a.status === "submitted" || a.status === "graded") && a.gradedAt);

  const sorted = valid.slice().sort((a, b) => {
    const sa = Number(a.score || 0);
    const sb = Number(b.score || 0);
    if (sb !== sa) return sb - sa;
    const ta = a.submittedAt?.toMillis?.() || 0;
    const tb = b.submittedAt?.toMillis?.() || 0;
    return ta - tb;
  });

  let rank = 0;
  let lastScore = null;

  sorted.forEach((a, i) => {
    const score = Number(a.score || 0);
    if (score !== lastScore) {
      rank = i + 1;
      lastScore = score;
      a._rank = rank;
      a._isDuplicate = false;
    } else {
      a._rank = rank;
      a._isDuplicate = true;
    }
  });

  return sorted;
}

function buildLeaderboard(exam, attempts) {
  const ranked = buildLeaderboardRanking(attempts);
  const totalPossible = exam.totalScore || 0;

  const wrapper = el("div", { class: "card", style: "margin-bottom:var(--sp-5)" });

  const header = el("h3", {
    class: "builder-panel-title",
    style: "margin-bottom:var(--sp-4);display:flex;align-items:center;gap:8px"
  });
  header.appendChild(svgIcon("award", 22));
  header.appendChild(document.createTextNode("لوحة المراكز"));
  wrapper.appendChild(header);

  if (!ranked.length) {
    wrapper.appendChild(el("div", { class: "empty", style: "padding:var(--sp-6)" }, [
      el("p", { class: "text-muted", text: "لا يوجد طلاب مصححون بعد." })
    ]));
    return wrapper;
  }

  const podium = el("div", { class: "leaderboard-podium" });
  const medals = ["1", "2", "3"];
  [1, 0, 2].forEach((idx) => {
    const a = ranked[idx];
    if (!a) { podium.appendChild(el("div")); return; }
    const place = idx + 1;
    const item = el("div", { class: `podium-item is-${place}` });
    item.appendChild(el("div", { class: "podium-medal", text: medals[idx] }));
    item.appendChild(el("div", { class: "podium-avatar", text: (a.studentName || "؟").charAt(0) }));
    item.appendChild(el("div", { class: "podium-name", text: a.studentName || "—" }));
    item.appendChild(el("div", { class: "podium-score", text: `${a.score || 0} / ${totalPossible}` }));
    if (a._isDuplicate) item.appendChild(el("span", { class: "lb-dup-badge", text: "مكرر" }));
    podium.appendChild(item);
  });
  wrapper.appendChild(podium);

  if (ranked.length > 3) {
    const list = el("div", { class: "leaderboard-list" });
    ranked.slice(3).forEach((a) => {
      const row = el("div", { class: "leaderboard-row" });
      row.appendChild(el("div", { class: "lb-rank", text: String(a._rank) }));

      const nameWrap = el("div", { class: "lb-name" });
      nameWrap.appendChild(document.createTextNode(a.studentName || "—"));
      if (a._isDuplicate) nameWrap.appendChild(el("span", { class: "lb-dup-badge", text: "مكرر" }));
      row.appendChild(nameWrap);

      row.appendChild(el("div", { class: "lb-score", text: `${a.score || 0}` }));
      row.appendChild(el("div", { class: "lb-time", text: fmtDate(a.submittedAt) }));
      list.appendChild(row);
    });
    wrapper.appendChild(list);
  }

  return wrapper;
}

function renderLeaderboardPage(exam, attempts) {
  const page = $('[data-page="exam"]');
  if (!page) return;

  $("[data-exam-loading]").hidden = true;
  $("[data-exam-error]").hidden = true;

  const old = document.querySelector("[data-exam-leaderboard]");
  if (old) old.remove();

  const container = el("div", { class: "exam-layout", "data-exam-leaderboard": "1" });
  const inner = el("div", { class: "container", style: "max-width:800px;padding:0" });

  const header = el("div", { class: "card-brutal tint-1 offset-lg", style: "text-align:center;padding:var(--sp-8);margin-bottom:var(--sp-5)" });
  header.appendChild(el("h1", { style: "font-size:var(--fs-3xl);margin-bottom:8px", text: exam.title || "امتحان" }));
  header.appendChild(el("p", { class: "text-muted", text: "انتهى الامتحان واكتمل التصحيح — إليك النتائج النهائية" }));
  header.appendChild(el("p", {
    class: "text-secondary",
    style: "margin-top:12px;font-size:var(--fs-sm)",
    text: `عدد المشاركين: ${attempts.filter((a) => a.gradedAt).length}`
  }));
  inner.appendChild(header);

  const lb = buildLeaderboard(exam, attempts);
  inner.appendChild(lb);

  const cta = el("div", { style: "margin-top:var(--sp-5);text-align:center" });
  cta.appendChild(el("button", {
    type: "button",
    class: "btn btn-primary btn-lg",
    text: "تحديث",
    onclick: () => location.reload()
  }));
  inner.appendChild(cta);

  container.appendChild(inner);
  page.appendChild(container);
}

/* ============================================================
   SHARE EXAM (QR)
   ============================================================ */
function shareExam(exam) {
  const url = `${location.origin}${location.pathname}#/exam?id=${exam.id}`;

  const body = el("div", { class: "stack" });

  const linkField = el("div", { class: "field" });
  linkField.appendChild(el("label", { class: "field-label", text: "رابط الامتحان" }));
  const linkRow = el("div", { class: "row" });
  const linkInput = el("input", { class: "input flex-1", type: "text", readonly: "readonly", value: url });
  linkInput.addEventListener("click", () => linkInput.select());
  linkRow.appendChild(linkInput);

  const copyBtn = el("button", { class: "btn btn-outline btn-sm", type: "button", text: "نسخ" });
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(url);
    toast("تم النسخ", "success");
  });
  linkRow.appendChild(copyBtn);
  linkField.appendChild(linkRow);
  body.appendChild(linkField);

  const qrSection = el("div", { class: "qr-section" });
  qrSection.appendChild(el("div", { class: "field-label text-center", text: "امسح الكود" }));
  const qrWrap = el("div", { class: "qr-wrap", id: "qrContainer" });
  qrSection.appendChild(qrWrap);
  body.appendChild(qrSection);

  openModal({
    title: "شارك الامتحان",
    body,
    className: "share-exam-modal",
    actions: [
      { label: "تحميل QR", class: "btn-outline", keepOpen: true, onClick: () => downloadQR(exam.title || "امتحان") },
      { label: "إغلاق", class: "btn-primary" }
    ]
  });

  setTimeout(() => {
    const container = document.getElementById("qrContainer");
    if (!container || typeof QRCode === "undefined") return;
    container.innerHTML = "";
    new QRCode(container, {
      text: url,
      width: 220,
      height: 220,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }, 50);
}

function downloadQR(examTitle) {
  const container = document.getElementById("qrContainer");
  if (!container) return;
  const canvas = container.querySelector("canvas");
  const img = container.querySelector("img");
  let dataURL = null;
  if (canvas) dataURL = canvas.toDataURL("image/png");
  else if (img && img.src) dataURL = img.src;
  if (!dataURL) { toast("تعذّر إنشاء الصورة", "error"); return; }

  const safe = (examTitle || "exam").replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, "_");
  const link = document.createElement("a");
  link.download = `QR_${safe}.png`;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast("تم التحميل", "success");
}

/* ============================================================
   GRADING
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
    const isManual = ["essay", "mcq_just", "tf_just"].includes(q.type);
    const key = answersMap[q.id] || {};

    const card = el("div", { class: "grading-card" });
    card.appendChild(el("div", { class: "grading-question", text: `س${i + 1} · ${q.text}` }));

    const ansBlock = el("div", { class: "grading-answer-block" });
    ansBlock.appendChild(el("div", { class: "answer-label" }, [
      svgIcon("user", 14),
      document.createTextNode("إجابة الطالب")
    ]));

    const isUnanswered = !isAnswered(a, q);

    if (isUnanswered) {
      const emptyBlock = el("div", {
        class: "essay-answer-block",
        style: "color:var(--danger-500);font-style:italic;background:var(--danger-50);border-inline-start-color:var(--danger-500);text-align:center;font-weight:var(--fw-semibold)"
      });
      emptyBlock.textContent = "الطالب لم يجب على السؤال";
      ansBlock.appendChild(emptyBlock);
    } else if (q.type === "essay") {
      const essayBlock = el("div", { class: "essay-answer-block" });
      essayBlock.textContent = a.essayText || "—";
      ansBlock.appendChild(essayBlock);
    } else {
      let ansText = "";
      if (q.type === "mcq" || q.type === "mcq_just") {
        ansText = (a.selectedIndex != null && q.options?.[a.selectedIndex]) ? q.options[a.selectedIndex] : "—";
      } else if (q.type === "tf" || q.type === "tf_just") {
        ansText = a.boolValue === true ? "صح" : a.boolValue === false ? "خطأ" : "—";
      } else if (q.type === "complete") {
        ansText = a.textValue || "—";
      }
      ansBlock.appendChild(el("div", { text: ansText, style: "white-space:pre-wrap" }));

      if (q.type === "mcq_just" || q.type === "tf_just") {
        ansBlock.appendChild(el("div", { class: "answer-label mt-3" }, [
          svgIcon("edit", 14),
          document.createTextNode("التبرير")
        ]));
        if (a.justification && a.justification.trim()) {
          const jBlock = el("div", { class: "essay-answer-block" });
          jBlock.textContent = a.justification;
          ansBlock.appendChild(jBlock);
        } else {
          const emptyJ = el("div", {
            class: "essay-answer-block",
            style: "color:var(--text-muted);font-style:italic;background:var(--bg-subtle);border-inline-start-color:var(--border-strong)"
          });
          emptyJ.textContent = "لم يكتب الطالب تبريرًا";
          ansBlock.appendChild(emptyJ);
        }
      }
    }
    card.appendChild(ansBlock);

    if (q.type !== "essay") {
      const corBlock = el("div", { class: "grading-answer-block" });
      corBlock.appendChild(el("div", { class: "answer-label" }, [
        svgIcon("check", 14),
        document.createTextNode("الإجابة الصحيحة")
      ]));
      let correctText = "—";
      if (q.type === "mcq" || q.type === "mcq_just") correctText = q.options?.[key.correctIndex] || "—";
      else if (q.type === "tf" || q.type === "tf_just") correctText = key.correctBool ? "صح" : "خطأ";
      else if (q.type === "complete") correctText = key.correctText || "—";
      corBlock.appendChild(el("div", { class: "grading-correct-answer", text: correctText }));
      card.appendChild(corBlock);
    }

    if (q.type === "essay" && key.modelAnswer) {
      card.appendChild(el("div", { class: "answer-label" }, [
        svgIcon("book", 14),
        document.createTextNode("الإجابة النموذجية")
      ]));
      const modelBlock = el("div", { class: "model-answer-block" });
      modelBlock.textContent = key.modelAnswer;
      card.appendChild(modelBlock);
    }

    if ((q.type === "mcq_just" || q.type === "tf_just") && key.justificationModelAnswer) {
      card.appendChild(el("div", { class: "answer-label" }, [
        svgIcon("book", 14),
        document.createTextNode("التبرير النموذجي")
      ]));
      const jBlock = el("div", { class: "model-answer-block" });
      jBlock.textContent = key.justificationModelAnswer;
      card.appendChild(jBlock);
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
      type: "number",
      class: "input",
      min: "0",
      max: String(q.score || 1),
      step: "0.5",
      style: "max-width:100px"
    });

    const existingManual = manualScores[q.id];
    if (existingManual != null) {
      num.value = existingManual;
    } else if (isManual) {
      num.value = 0;
    } else {
      num.value = Number(perQ[q.id] || 0);
    }

    num.addEventListener("input", () => {
      manualScores[q.id] = Number(num.value) || 0;
    });

    scoreRow.appendChild(num);
    scoreRow.appendChild(el("span", { class: "text-sm text-muted", text: `/ ${q.score || 1}` }));

    if (!isManual) {
      const resetBtn = el("button", {
        class: "btn btn-ghost btn-xs",
        type: "button",
        text: "تلقائي",
        onclick: () => {
          delete manualScores[q.id];
          num.value = Number(perQ[q.id] || 0);
          toast("تم الرجوع للتصحيح التلقائي", "info", 2000);
        }
      });
      scoreRow.appendChild(resetBtn);
    }

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
      if (manualScores[q.id] != null) {
        total += Number(manualScores[q.id]) || 0;
      } else {
        total += Number(perQ[q.id] || 0);
      }
    });
    return total;
  }

  async function saveGrading() {
    const finalScore = computeFinalScore();
    await updateDoc(doc(db, "attempts", attemptId), {
      manualScores,
      feedback,
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
      const reason = err?.code === "permission-denied"
        ? "ليس لديك صلاحية التعديل"
        : err?.message || "خطأ في الشبكة";
      toast(`فشل حفظ التصحيح: ${reason}`, "error", 6000);
    }
  });
  actRow.appendChild(saveBtn);

  const publishBtn = el("button", { class: "btn btn-primary", type: "button", text: "نشر هذه النتيجة" });
  publishBtn.addEventListener("click", async () => {
    try {
      await saveGrading();
      const allAttempts = await listAttempts(examId);
      const ungraded = allAttempts.filter((a) => !a.gradedAt && a.status === "submitted");
      if (ungraded.length) {
        toast(`جارٍ تصحيح ${ungraded.length} ورقة…`, "info");
        await autoGradeAttempts(examId, exam);
      }
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
   PROFILE / SETTINGS / SUPPORT
   ============================================================ */
function renderProfile() {
  if (!currentProfile) return;
  $$("[data-profile-avatar]").forEach((e) => (e.src = currentProfile.photoURL || ""));
  $$("[data-profile-name]").forEach((e) => (e.textContent = currentProfile.fullName || ""));
  $$("[data-profile-handle]").forEach((e) => (e.textContent = "@" + (currentProfile.username || "")));
  $$("[data-profile-subject]").forEach((e) => (e.textContent = subjectLabel((currentProfile.subjects || [])[0] || "")));

  const chips = $("[data-profile-subjects-chips]");
  if (chips) {
    chips.innerHTML = "";
    (currentProfile.subjects || []).forEach((sid) => {
      const label = sid.startsWith("custom:") ? sid.slice(7) : subjectLabel(sid);
      chips.appendChild(el("span", { class: "chip", text: label }));
    });
  }
}

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

function renderSupport() {
  const copyBtn = $("[data-copy-number]");
  if (!copyBtn || copyBtn.dataset.bound) return;
  copyBtn.dataset.bound = "1";
  copyBtn.addEventListener("click", () => {
    const num = $("[data-support-number]")?.textContent?.trim() || "01016212814";
    navigator.clipboard.writeText(num);
    toast("تم النسخ", "success");
    const labelSpan = copyBtn.querySelector("span");
    if (labelSpan) {
      const original = labelSpan.textContent;
      labelSpan.textContent = "تم النسخ";
      setTimeout(() => { labelSpan.textContent = original; }, 2000);
    }
  });
}

/* ============================================================
   STUDENT EXAM
   ============================================================ */
const EXAM_STATE_KEY = (id) => `qeyasquiz.attempt.${id}`;
let examRuntime = null;

async function renderExam(params) {
  const examId = params?.get("id");
  const preview = params?.get("preview") === "1";

  const loading = $("[data-exam-loading]");
  const shell = $("[data-exam-shell]");
  const errorBox = $("[data-exam-error]");
  const entryModal = $("[data-entry-modal]");

  loading.hidden = false;
  shell.hidden = true;
  errorBox.hidden = true;
  entryModal.hidden = true;

  const oldLB = document.querySelector("[data-exam-leaderboard]");
  if (oldLB) oldLB.remove();

  if (!examId) {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "بيانات ناقصة";
    $("[data-exam-error-message]").textContent = "لم يتم تحديد رقم الامتحان.";
    return;
  }

  let exam;
  try { exam = await getExam(examId); } catch (err) { console.error(err); }

  if (!exam) {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "غير موجود";
    $("[data-exam-error-message]").textContent = "هذا الامتحان غير متاح.";
    return;
  }

  if (preview && currentUser && currentProfile?.uid === exam.ownerId) {
    loading.hidden = true;
    shell.hidden = false;
    startExamRuntime(exam, { preview: true });
    return;
  }

  if (!exam.publishedAt) {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "الامتحان غير منشور";
    $("[data-exam-error-message]").textContent = "هذا الامتحان لم يُنشر بعد.";
    return;
  }

  const attempts = await listAttempts(examId);
  const status = computeStatus(exam);

  if (shouldShowLeaderboard(exam, attempts)) {
    loading.hidden = true;
    renderLeaderboardPage(exam, attempts);
    return;
  }

  if (status === "paused") {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "الامتحان متوقف مؤقتًا";
    $("[data-exam-error-message]").textContent = "قام المعلم بإيقاف الامتحان. يرجى المحاولة لاحقًا.";
    return;
  }

  if (status === "scheduled") {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "الامتحان لم يبدأ";
    $("[data-exam-error-message]").textContent = `يفتح في ${fmtDate(exam.startAt)}`;
    return;
  }

  if (status === "completed") {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "الامتحان مغلق";
    $("[data-exam-error-message]").textContent = "انتهى هذا الامتحان. سيتم عرض النتائج والمراكز بعد اكتمال التصحيح.";
    return;
  }

  const currentU = auth.currentUser;
  if (currentU) {
    try {
      const existingAttempt = await getStudentAttempt(examId, currentU.uid);
      if (existingAttempt) {
        const s = existingAttempt.status;
        if (s === "submitted" || s === "graded") {
          loading.hidden = true;
          showEntryModal(exam, existingAttempt);
          return;
        }
        loading.hidden = true;
        $("[data-entry-modal]").hidden = true;
        shell.hidden = false;
        startExamRuntime(exam, { attempt: existingAttempt });
        return;
      }
    } catch (err) {
      console.warn("[renderExam] check existing:", err);
    }
  }

  loading.hidden = true;
  showEntryModal(exam);
}

/* ============================================================
   STUDENT ENTRY MODAL
   ============================================================ */
let entryState = { exam: null, mode: "signed-out", attempt: null };

async function showEntryModal(exam, existingAttempt = null) {
  const modal = $("[data-entry-modal]");
  if (!modal) return;

  entryState = { exam, mode: "signed-out", attempt: existingAttempt };

  const title = $("[data-entry-title]");
  const meta = $("[data-entry-meta]");
  const teacherBox = $("[data-entry-teacher]");
  const teacherAvatar = $("[data-entry-teacher-avatar]");
  const teacherName = $("[data-entry-teacher-name]");

  title.textContent = exam.title || "امتحان";

  if (exam.teacherName) {
    teacherBox.hidden = false;
    teacherAvatar.src = exam.teacherPhoto || "";
    teacherAvatar.style.display = exam.teacherPhoto ? "block" : "none";
    teacherName.textContent = exam.teacherName;
  } else {
    teacherBox.hidden = true;
  }

  meta.innerHTML = "";
  [
    ["المادة", subjectLabel(exam.subject)],
    ["الصف", gradeLabel(exam.grade)],
    ["المدة", `${exam.duration || 0} دقيقة`],
    ["الأسئلة", String(exam.totalQuestions || 0)]
  ].forEach(([k, v]) => {
    const item = el("div", { class: "entry-meta-item" });
    item.appendChild(el("span", { class: "entry-meta-label", text: k }));
    item.appendChild(el("span", { class: "entry-meta-value", text: v }));
    meta.appendChild(item);
  });

  modal.hidden = false;

  if (existingAttempt) {
    fillAlreadyTakenState(existingAttempt);
    setEntryState("already-taken");
    return;
  }

  await resolveEntryState();
}

async function resolveEntryState() {
  const exam = entryState.exam;
  const user = auth.currentUser;

  if (!user) {
    setEntryState("signed-out");
    return;
  }

  if (entryState.attempt) {
    fillAlreadyTakenState(entryState.attempt);
    setEntryState("already-taken");
    return;
  }

  const existingAttempt = await getStudentAttempt(exam.id, user.uid);
  if (existingAttempt) {
    entryState.attempt = existingAttempt;
    fillAlreadyTakenState(existingAttempt);
    setEntryState("already-taken");
    return;
  }

  const cachedStudent = getCachedStudentProfile();
  let studentProfile = null;

  if (cachedStudent && cachedStudent.uid === user.uid && cachedStudent.fullName) {
    studentProfile = cachedStudent;
    loadStudentProfile(user.uid).then((fresh) => {
      if (fresh && fresh.fullName) cacheStudentProfile(fresh);
    }).catch(() => {});
  } else {
    studentProfile = await loadStudentProfile(user.uid);
  }

  if (!studentProfile || !studentProfile.fullName) {
    fillNeedNameState(user);
    setEntryState("need-name");
    return;
  }

  fillReadyState(user, studentProfile);
  setEntryState("ready");
}

function setEntryState(mode) {
  entryState.mode = mode;
  const states = $$(".entry-state", $("[data-entry-modal]"));
  states.forEach((s) => { s.hidden = s.dataset.entryState !== mode; });

  const codeField = $("[data-entry-code-field]");
  if (codeField) {
    codeField.hidden = mode !== "ready" || !entryState.exam.requireAccessCode;
  }
}

function fillNeedNameState(user) {
  const avatar = $("[data-entry-user-avatar]");
  const email = $("[data-entry-user-email]");
  const input = $("[data-entry-name]");
  const err = $("[data-entry-name-error]");

  if (avatar) avatar.src = user.photoURL || "";
  if (email) email.textContent = user.email || "";
  if (input) {
    input.value = user.displayName || "";
    if (err) err.hidden = true;
    setTimeout(() => input.focus(), 150);
  }
}

function fillReadyState(user, profile) {
  const avatar = $("[data-entry-ready-avatar]");
  const name = $("[data-entry-ready-name]");
  const email = $("[data-entry-ready-email]");
  const codeInput = $("[data-entry-code]");
  const codeErr = $("[data-entry-code-error]");

  if (avatar) avatar.src = profile.photoURL || user.photoURL || "";
  if (name) name.textContent = profile.fullName;
  if (email) email.textContent = user.email || "";
  if (codeInput) codeInput.value = "";
  if (codeErr) codeErr.hidden = true;
}

function fillAlreadyTakenState(attempt) {
  const card = $(".entry-already-card");
  if (!card) return;

  const icon = card.querySelector(".entry-already-icon");
  const title = card.querySelector("h3");
  const text = card.querySelector("p");
  const info = $("[data-entry-attempt-info]");

  const totalPossible = entryState.exam.totalScore || 0;
  const isGraded = attempt.status === "graded" && attempt.gradedAt && attempt.score != null;

  if (isGraded) {
    icon.style.background = "var(--success-50)";
    icon.style.color = "var(--success-500)";
    icon.innerHTML = '<svg class="icon" width="48" height="48"><use href="#i-check-circle"></use></svg>';
    title.textContent = "تم تصحيح الامتحان";
    text.textContent = "يمكنك عرض النتيجة والورقة كاملة.";
  } else {
    icon.style.background = "var(--warning-50)";
    icon.style.color = "var(--warning-500)";
    icon.innerHTML = '<svg class="icon" width="48" height="48"><use href="#i-clock"></use></svg>';
    title.textContent = "جارٍ التصحيح";
    text.textContent = "الامتحان بانتظار تصحيح المعلم. تقدر ترجع لاحقًا لمشاهدة النتيجة.";
  }

  info.innerHTML = "";
  const rows = [
    ["الاسم", attempt.studentName || "—"],
    ["الحالة", isGraded ? "تم التصحيح" : "بانتظار التصحيح"],
    ["وقت التسليم", attempt.submittedAt ? fmtDate(attempt.submittedAt) : "—"]
  ];
  if (isGraded) {
    rows.push(["الدرجة", `${attempt.score} / ${totalPossible}`]);
    rows.push(["النسبة", `${attempt.percentage || 0}%`]);
  }

  rows.forEach(([k, v]) => {
    info.appendChild(el("div", { class: "row-between" }, [
      el("span", { text: k }),
      el("span", { text: v })
    ]));
  });

  const viewBtn = $("[data-entry-view-result]");
  if (viewBtn) {
    const labelSpan = viewBtn.querySelector("span");
    if (labelSpan) labelSpan.textContent = isGraded ? "عرض النتيجة والورقة" : "متابعة الحالة";
  }
}

/* ============================================================
   ENTRY EVENT HANDLERS
   ============================================================ */
function bindEntryHandlers() {
  const modal = $("[data-entry-modal]");
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = "1";

  const googleBtn = $("[data-entry-google]");
  if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
      googleBtn.classList.add("is-loading");
      try {
        await signInWithGoogle();
        await resolveEntryState();
      } catch (err) {
        toast(err.message || "تعذّر تسجيل الدخول", "error");
      } finally {
        googleBtn.classList.remove("is-loading");
      }
    });
  }

  const saveBtn = $("[data-entry-save-name]");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const input = $("[data-entry-name]");
      const err = $("[data-entry-name-error]");
      const val = (input.value || "").trim();
      const words = val.split(/\s+/).filter(Boolean);

      if (words.length < 4) {
        err.hidden = false;
        err.textContent = "اكتب اسمك الرباعي (4 كلمات على الأقل)";
        return;
      }
      if (val.length > 120) {
        err.hidden = false;
        err.textContent = "الاسم طويل جدًا";
        return;
      }

      err.hidden = true;
      saveBtn.classList.add("is-loading");

      try {
        const user = auth.currentUser;
        const profile = await saveStudentProfile(user.uid, val);
        currentStudentProfile = profile;
        await resolveEntryState();
      } catch (err2) {
        console.error(err2);
        toast("تعذّر حفظ الاسم. حاول مرة أخرى.", "error");
      } finally {
        saveBtn.classList.remove("is-loading");
      }
    });
  }

  const startBtn = $("[data-entry-start]");
  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      const exam = entryState.exam;
      const user = auth.currentUser;
      if (!user) return;

      if (exam.requireAccessCode) {
        const codeInput = $("[data-entry-code]");
        const codeErr = $("[data-entry-code-error]");
        if ((codeInput.value || "").trim() !== (exam.accessCode || "")) {
          codeErr.hidden = false;
          codeErr.textContent = "كود غير صحيح";
          return;
        }
        codeErr.hidden = true;
      }

      const existing = await getStudentAttempt(exam.id, user.uid);
      if (existing) {
        entryState.attempt = existing;
        fillAlreadyTakenState(existing);
        setEntryState("already-taken");
        return;
      }

      const studentProfile = currentStudentProfile || await loadStudentProfile(user.uid);
      if (!studentProfile || !studentProfile.fullName) {
        toast("حدث خطأ، حاول مرة أخرى", "error");
        return;
      }

      startBtn.classList.add("is-loading");
      try {
        const attempt = await createAttempt(exam, studentProfile.fullName, user.uid);
        modal.hidden = true;
        $("[data-exam-shell]").hidden = false;
        startExamRuntime(exam, { attempt });
      } catch (err) {
        console.error(err);
        toast("تعذّر بدء الامتحان", "error");
        startBtn.classList.remove("is-loading");
      }
    });
  }

  const viewBtn = $("[data-entry-view-result]");
  if (viewBtn) {
    viewBtn.addEventListener("click", () => {
      if (entryState.attempt) {
        sessionStorage.setItem("qeyasquiz.lastAttempt", entryState.attempt.id);
        localStorage.setItem("qeyasquiz.lastAttempt", entryState.attempt.id);
        $("[data-entry-modal]").hidden = true;
        navigate("/result");
      }
    });
  }
}

/* ============================================================
   CREATE ATTEMPT
   ============================================================ */
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
    studentUid,
    studentName,
    questionOrder: order,
    answers: {},
    manualScores: {},
    feedback: {},
    status: "in_progress",
    startedAt: serverTimestamp(),
    startedAtMs: nowMs,
    deadlineMs,
    resultCode,
    anticheatEvents: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, "attempts"), payload);
  localStorage.setItem(EXAM_STATE_KEY(exam.id), JSON.stringify({ attemptId: ref.id, examId: exam.id }));
  localStorage.setItem("qeyasquiz.lastAttempt", ref.id);
  return { id: ref.id, ...payload, startedAtMs: nowMs, deadlineMs, resultCode };
}

/* ============================================================
   EXAM RUNTIME
   ============================================================ */
function startExamRuntime(exam, opts) {
  const { attempt, preview = false } = opts;
  const safeAttempt = attempt || {
    id: null,
    studentName: "معاينة",
    formId: null,
    answers: {},
    questionOrder: null,
    deadlineMs: Date.now() + (exam.duration || 60) * 60000
  };

  const forms = exam.forms && exam.forms.length
    ? exam.forms
    : [{ id: "A", name: "النموذج أ", questions: exam.questions || [] }];
  const form = preview
    ? forms[0]
    : (forms.find((f) => f.id === safeAttempt.formId) || forms[0]);
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
    warningCount: 0,
    fsExitCount: 0,
    fsGuardActive: exam.requireFullscreen !== false
  };
  examRuntime = state;

  $("[data-watermark-teacher]").textContent = preview
    ? "معاينة · QeyasQuiz"
    : `${safeAttempt.studentName || ""} · QeyasQuiz`;
  $("[data-exam-title]").textContent = exam.title || "امتحان";
  $("[data-exam-meta]").textContent = `${subjectLabel(exam.subject)} · ${gradeLabel(exam.grade)}`;

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

  if (!preview) {
    startHeartbeat();
    startAutosave();
    startAnticheat();
    if (state.fsGuardActive) startFullscreenGuard();

    const initialMs = exam.updatedAt?.toMillis?.() || (exam.updatedAt?.seconds * 1000) || 0;
    state.watcherUnsub = startExamRealtimeWatcher(exam.id, initialMs);
  }

  $("[data-exam-fullscreen]").onclick = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {
        toast("تعذّر الدخول لملء الشاشة", "error");
      });
    } else {
      document.exitFullscreen?.();
    }
  };

  $("[data-submit-exam]").onclick = () => confirmSubmit();

  const prevBtn = $("[data-prev]");
  const nextBtn = $("[data-next]");
  if (prevBtn) prevBtn.onclick = () => { if (state.index > 0) showSingleQuestion(state.index - 1); };
  if (nextBtn) nextBtn.onclick = () => { if (state.index < state.orderedIds.length - 1) showSingleQuestion(state.index + 1); };

  const beforeUnloadHandler = (e) => {
    if (!state.submitted && !state.preview) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);
  state._beforeUnloadHandler = beforeUnloadHandler;
}

/* ---- Scroll Mode ---- */
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

/* ---- Single Mode ---- */
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
  wrap.appendChild(el("div", { class: "q-text", text: q.text || "" }));
  if (q.imageUrl) wrap.appendChild(el("img", { class: "q-image", src: q.imageUrl, alt: "", draggable: "false" }));

  const answers = { ...(s.answers[qid] || {}) };
  wrap.appendChild(buildQuestionInputs(q, answers, qid, () => {
    updateProgress();
    renderSingleNavList();
  }));

  host.appendChild(wrap);

  const prevBtn = $("[data-prev]");
  const nextBtn = $("[data-next]");
  if (prevBtn) prevBtn.disabled = s.index === 0;
  if (nextBtn) nextBtn.disabled = s.index === s.orderedIds.length - 1;

  renderSingleNavList();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---- Shared ---- */
function buildQuestionBlock(q, i, qid) {
  const s = examRuntime;
  const wrap = el("div", { class: "exam-question" });
  wrap.appendChild(buildQuestionHeader(q, i));
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
        saveAnswer(qid, answers);
        onChange();
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
        saveAnswer(qid, answers);
        onChange();
      });
      optEl.appendChild(inp);
      optEl.appendChild(el("span", { class: "q-option-text", text: l }));
      wrap.appendChild(optEl);
    });
    frag.appendChild(wrap);
    if (q.type === "tf_just") frag.appendChild(buildJustification(q, answers, qid, onChange));
  } else if (q.type === "complete") {
    const input = el("input", { class: "q-complete-input", type: "text" });
    input.placeholder = "اكتب إجابتك…";
    input.value = answers.textValue || "";
    input.addEventListener("input", debounce(() => {
      answers.textValue = input.value;
      saveAnswer(qid, answers);
      onChange();
    }, 400));
    frag.appendChild(input);
  } else if (q.type === "essay") {
    const ta = el("textarea", { class: "q-essay-textarea" });
    ta.placeholder = "اكتب إجابتك…";
    ta.value = answers.essayText || "";
    ta.addEventListener("input", debounce(() => {
      answers.essayText = ta.value;
      saveAnswer(qid, answers);
      onChange();
    }, 500));
    frag.appendChild(ta);
  }

  return frag;
}

function buildJustification(q, answers, qid, onChange) {
  const box = el("div", { class: "q-justification" });
  const label = el("div", { class: "q-justification-label" });
  label.appendChild(svgIcon("check-square", 14));
  label.appendChild(document.createTextNode("التبرير (تصحيح يدوي)"));
  box.appendChild(label);

  const ta = el("textarea", { class: "q-justification-textarea" });
  ta.placeholder = "اكتب تبريرك…";
  ta.value = answers.justification || "";
  ta.addEventListener("input", debounce(() => {
    answers.justification = ta.value;
    saveAnswer(qid, answers);
    onChange();
  }, 500));
  box.appendChild(ta);
  return box;
}

function saveAnswer(qid, answers) {
  const s = examRuntime;
  if (!s || s.preview) return;
  try {
    s.answers[qid] = JSON.parse(JSON.stringify(answers));
  } catch {
    s.answers[qid] = { ...answers };
  }
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

/* ---- Timer ---- */
function startTimer() {
  const s = examRuntime;
  const elVal = $("[data-timer-value]");
  const elBox = $("[data-timer]");

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

/* ---- Autosave ---- */
function startAutosave() {
  const s = examRuntime;
  s.autosaveInterval = setInterval(async () => {
    if (!s.dirty || s.submitted) return;
    if (!navigator.onLine) return;
    try {
      const cleanAnswers = JSON.parse(JSON.stringify(s.answers || {}));
      await updateDoc(doc(db, "attempts", s.attempt.id), {
        answers: cleanAnswers,
        updatedAt: serverTimestamp()
      });
      s.dirty = false;
    } catch (err) { console.warn("autosave", err); }
  }, 5000);
}

/* ---- Heartbeat ---- */
function startHeartbeat() {
  const s = examRuntime;
  s.heartbeatInterval = setInterval(async () => {
    if (s.submitted || !navigator.onLine) return;
    try {
      await updateDoc(doc(db, "attempts", s.attempt.id), {
        lastActiveAt: serverTimestamp()
      });
    } catch {}
  }, 15000);
}

/* ---- Anti-cheat (3 warnings) ---- */
function startAnticheat() {
  const s = examRuntime;
  if (!s) return;

  const events = s.attempt.anticheatEvents = s.attempt.anticheatEvents || [];

  let lastLog = {};
  function logEvent(type, meta = null) {
    if (s.submitted) return;
    const now = Date.now();
    if (lastLog[type] && now - lastLog[type] < 1000) return;
    lastLog[type] = now;
    const evt = { type, at: now, ...(meta || {}) };
    events.push(evt);
    if (events.length > 200) events.shift();
    updateDoc(doc(db, "attempts", s.attempt.id), { anticheatEvents: events }).catch(() => {});
  }

  function securityAlert(titleText, msgText) {
    const modal = $("[data-security-modal]");
    if (!modal) return;
    $("[data-security-title]").textContent = titleText;
    $("[data-security-message]").textContent = msgText;
    modal.hidden = false;
    $("[data-security-ok]").onclick = () => { modal.hidden = true; };
  }

  const onVisibility = () => {
    if (s.submitted || s.preview) return;

    if (document.hidden) {
      s.warningCount = (s.warningCount || 0) + 1;
      logEvent("tab_hidden", { warningNumber: s.warningCount });

      const remaining = 3 - s.warningCount;

      if (s.warningCount < 3) {
        securityAlert(
          `تحذير ${s.warningCount} من 3`,
          `لقد تركت صفحة الامتحان. تحذير ${s.warningCount} من 3. ${
            remaining === 1
              ? "تحذير أخير! لو خرجت مرة أخرى سيتم تسليم ورقتك فورًا."
              : `باقي ${remaining} تحذيرات قبل التسليم التلقائي.`
          }`
        );
      } else {
        securityAlert(
          "تجاوزت الحد",
          "لقد تجاوزت الحد المسموح من التحذيرات (3 مرات). سيتم تسليم ورقتك تلقائيًا الآن."
        );
        setTimeout(async () => {
          if (!s.submitted) {
            toast("تم تسليم الامتحان لتجاوز حد التحذيرات", "error");
            await performSubmit("auto", "too_many_warnings");
          }
        }, 2000);
      }
    } else {
      logEvent("tab_visible");
    }
  };

  const onCopy = (e) => {
    if (s.submitted || s.preview) return;
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    e.preventDefault();
    try { e.clipboardData.setData("text/plain", ""); } catch {}
    logEvent("copy_attempt");
  };

  const onCut = (e) => {
    if (s.submitted || s.preview) return;
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    e.preventDefault();
    logEvent("cut_attempt");
  };

  const onPaste = (e) => {
    if (s.submitted) return;

    const isOwnerPreview =
      s.preview &&
      currentProfile &&
      currentProfile.uid === s.exam.ownerId;
    if (isOwnerPreview) return;

    e.preventDefault();
    e.stopPropagation();
    try {
      if (e.clipboardData) e.clipboardData.setData("text/plain", "");
    } catch {}

    logEvent("paste_blocked");
    toast("اللصق غير مسموح داخل الامتحان", "warning", 2500);
    return false;
  };

  const onContextMenu = (e) => {
    if (s.submitted || s.preview) return;
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    e.preventDefault();
    logEvent("context_menu");
  };

  const onKeyDown = (e) => {
    if (s.submitted || s.preview) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = (e.key || "").toLowerCase();
    const target = e.target;
    const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");

    if (ctrl && ["c", "x", "a"].includes(key) && isInput) return;
    if (ctrl && ["c", "x", "a", "s", "p", "u"].includes(key)) {
      e.preventDefault();
      e.stopPropagation();
      logEvent("shortcut_" + key);
      return false;
    }
    if (key === "f12" || (ctrl && e.shiftKey && ["i", "j", "c"].includes(key))) {
      e.preventDefault();
      logEvent("devtools_attempt");
      return false;
    }
  };

  const onOffline = () => {
    logEvent("offline");
    const b = $("[data-offline-banner]"); if (b) b.hidden = false;
    const i = $("[data-connection-indicator]"); if (i) i.classList.add("is-offline");
  };

  const onOnline = () => {
    logEvent("online");
    const b = $("[data-offline-banner]"); if (b) b.hidden = true;
    const i = $("[data-connection-indicator]"); if (i) i.classList.remove("is-offline");
  };

  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("copy", onCopy, true);
  document.addEventListener("cut", onCut, true);
  document.addEventListener("paste", onPaste, true);
  document.addEventListener("contextmenu", onContextMenu, true);
  document.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);

  const devtoolsInterval = setInterval(() => {
    if (s.submitted) return;
    const wd = window.outerWidth - window.innerWidth;
    const hd = window.outerHeight - window.innerHeight;
    if (wd > 160 || hd > 160) logEvent("devtools_open");
  }, 5000);

  startMovingWatermark();

  [document.querySelector("[data-questions-host-scroll]"),
   document.querySelector("[data-single-question-host]")].forEach((x) => {
    if (x) {
      x.style.userSelect = "none";
      x.style.webkitUserSelect = "none";
    }
  });

  s._anticheatCleanup = () => {
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("copy", onCopy, true);
    document.removeEventListener("cut", onCut, true);
    document.removeEventListener("paste", onPaste, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    clearInterval(devtoolsInterval);
  };
}

function startMovingWatermark() {
  const wm = document.querySelector(".exam-watermark");
  if (!wm || wm.dataset.moving) return;
  wm.dataset.moving = "1";

  let lx = 0, ly = 0;
  const interval = setInterval(() => {
    let x, y, tries = 0;
    do {
      x = Math.random() * 100 - 50;
      y = Math.random() * 100 - 50;
      tries++;
    } while (Math.abs(x - lx) < 30 && Math.abs(y - ly) < 30 && tries < 10);
    lx = x; ly = y;
    wm.style.transform = `translate(${x}px, ${y}px)`;
  }, 3000);

  if (examRuntime) {
    const prevCleanup = examRuntime._anticheatCleanup;
    examRuntime._anticheatCleanup = () => {
      if (prevCleanup) prevCleanup();
      clearInterval(interval);
    };
  }
}

/* ---- Fullscreen Guard ---- */
function startFullscreenGuard() {
  const s = examRuntime;
  if (!s || s.preview) return;
  if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) return;

  const modal = $("[data-fullscreen-modal]");
  const enterBtn = $("[data-enter-fullscreen]");
  const warningEl = $("[data-fs-warning]");
  if (!modal || !enterBtn) return;

  function showFsModal() {
    modal.hidden = false;
    document.body.classList.add("fs-locked");
    if (warningEl) {
      if (s.fsExitCount === 0) warningEl.hidden = true;
      else if (s.fsExitCount < 3) {
        warningEl.hidden = false;
        warningEl.textContent = `تحذير: خرجت من ملء الشاشة ${s.fsExitCount} مرة.`;
      } else {
        warningEl.hidden = false;
        warningEl.textContent = `تحذير أخير: خرجت ${s.fsExitCount} مرات.`;
      }
    }
  }

  function hideFsModal() {
    modal.hidden = true;
    document.body.classList.remove("fs-locked");
  }

  enterBtn.onclick = async () => {
    try {
      const rootEl = document.documentElement;
      if (rootEl.requestFullscreen) await rootEl.requestFullscreen({ navigationUI: "hide" });
      else if (rootEl.webkitRequestFullscreen) await rootEl.webkitRequestFullscreen();
    } catch (err) {
      console.error("[fullscreen]", err);
      toast("تعذّر الدخول لملء الشاشة. جرّب متصفح تاني.", "error");
    }
  };

  function onFsChange() {
    if (s.submitted) return;
    const isFs = !!document.fullscreenElement || !!document.webkitFullscreenElement;

    if (isFs) {
      hideFsModal();
    } else {
      s.fsExitCount++;
      s.anticheatEvents = s.anticheatEvents || [];
      s.anticheatEvents.push({ type: "fullscreen_exit", at: Date.now(), count: s.fsExitCount });
      updateDoc(doc(db, "attempts", s.attempt.id), { anticheatEvents: s.anticheatEvents }).catch(() => {});

      if (s.fsExitCount > 3) {
        toast("تم تسليم الامتحان لتجاوز حد الخروج من ملء الشاشة", "error");
        performSubmit("auto", "fullscreen_exits");
        return;
      }

      showFsModal();
    }
  }

  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);

  s._fsCleanup = () => {
    document.removeEventListener("fullscreenchange", onFsChange);
    document.removeEventListener("webkitfullscreenchange", onFsChange);
  };

  setTimeout(() => {
    if (!document.fullscreenElement) showFsModal();
  }, 200);
}

/* ============================================================
   SUBMIT
   ============================================================ */
function confirmSubmit() {
  const s = examRuntime;
  if (!s) return;
  const total = s.orderedIds.length;
  const answered = s.orderedIds.filter((qid) => isAnswered(s.answers[qid], s.byId[qid])).length;
  const unanswered = total - answered;

  if (unanswered > 0) {
    const firstUnansweredIdx = s.orderedIds.findIndex((qid) => !isAnswered(s.answers[qid], s.byId[qid]));
    openModal({
      title: `أسئلة بدون إجابة — ${unanswered}`,
      body: `عندك ${unanswered} سؤال مش مجاوب عليه.`,
      actions: [
        { label: "إلغاء", class: "btn-ghost" },
        { label: "سلّم على أي حال", class: "btn-outline", onClick: () => actuallySubmit() },
        {
          label: "روح للسؤال",
          class: "btn-primary",
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
  toast("انتهى الوقت. تم تسليم الامتحان تلقائيًا.", "warning");
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
  if (s._fsCleanup) { try { s._fsCleanup(); } catch {} }
  if (s._anticheatCleanup) { try { s._anticheatCleanup(); } catch {} }
  if (s._beforeUnloadHandler) {
    try { window.removeEventListener("beforeunload", s._beforeUnloadHandler); } catch {}
  }

  document.body.classList.remove("fs-locked");
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
    const reasonText = !navigator.onLine
      ? "لا يوجد اتصال بالإنترنت — إجاباتك محفوظة محليًا"
      : err?.code === "permission-denied"
      ? "انتهت صلاحية الجلسة — أعد تحميل الصفحة"
      : err?.message || "خطأ غير معروف";
    toast(`فشل التسليم: ${reasonText}`, "error", 8000);
  }
}

/* ============================================================
   REALTIME WATCHER
   ============================================================ */
function startExamRealtimeWatcher(examId, initialUpdatedAtMs) {
  const unsub = onSnapshot(doc(db, "exams", examId), (snap) => {
    if (!snap.exists()) return;
    const newExam = { id: snap.id, ...snap.data() };
    const newMs = newExam.updatedAt?.toMillis?.() || (newExam.updatedAt?.seconds * 1000) || 0;
    const s = examRuntime;
    if (!s || s.submitted || s.preview) return;
    if (newMs > initialUpdatedAtMs) {
      const structural = JSON.stringify(newExam.forms || newExam.questions || []) !==
                        JSON.stringify(s.exam.forms || s.exam.questions || []);
      if (structural) {
        s.pendingExam = newExam;
        const modal = $("[data-update-modal]");
        if (modal && modal.hidden) {
          modal.hidden = false;
          $("[data-update-refresh]").onclick = () => { modal.hidden = true; applyExamUpdate(); };
        }
      } else {
        s.exam = { ...s.exam, ...newExam };
      }
    }
  }, (err) => console.warn("[realtime]", err));
  return unsub;
}

async function applyExamUpdate() {
  const s = examRuntime;
  if (!s || !s.pendingExam) return;
  const newExam = s.pendingExam;
  s.pendingExam = null;
  s.exam = newExam;

  const forms = newExam.forms && newExam.forms.length
    ? newExam.forms
    : [{ id: "A", name: "النموذج أ", questions: newExam.questions || [] }];
  const form = forms.find((f) => f.id === s.attempt.formId) || forms[0];
  const newQuestions = form.questions || [];
  const byId = {};
  newQuestions.forEach((q) => (byId[q.id] = q));

  const preserved = { ...s.answers };
  const existingIds = new Set(newQuestions.map((q) => q.id));
  const kept = (s.orderedIds || []).filter((id) => existingIds.has(id));
  const newIds = newQuestions.map((q) => q.id).filter((id) => !kept.includes(id));
  s.orderedIds = [...kept, ...newIds];

  const visible = {};
  s.orderedIds.forEach((qid) => { if (preserved[qid]) visible[qid] = preserved[qid]; });
  s.answers = visible;
  s.questions = newQuestions;
  s.byId = byId;
  if (s.index >= s.orderedIds.length) s.index = Math.max(0, s.orderedIds.length - 1);

  $("[data-exam-title]").textContent = newExam.title || "امتحان";
  $("[data-exam-meta]").textContent = `${subjectLabel(newExam.subject)} · ${gradeLabel(newExam.grade)}`;

  if (s.displayMode === "single") {
    renderSingleNavList();
    showSingleQuestion(s.index);
  } else {
    renderScrollMode();
  }
  updateProgress();

  try {
    await updateDoc(doc(db, "attempts", s.attempt.id), {
      answers: s.answers,
      questionOrder: s.orderedIds,
      updatedAt: serverTimestamp()
    });
  } catch {}
  s.dirty = false;
  toast("تم تحديث الامتحان", "info");
}

/* ============================================================
   RESULT
   ============================================================ */
async function renderResult() {
  const loading = $("[data-result-loading]");
  const main = $("[data-result-main]");

  loading.hidden = false;
  main.hidden = true;

  const user = auth.currentUser;
  if (!user) {
    loading.hidden = true;
    main.hidden = false;
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
  } catch (err) {
    loading.hidden = true;
    main.hidden = false;
    $("[data-result-exam-title]").textContent = "لا يوجد امتحان";
    $("[data-score-block]").hidden = true;
    $("[data-waiting-block]").hidden = true;
    return;
  }

  loading.hidden = true;
  main.hidden = false;

  await renderResultContent(attempt, exam);
}

async function renderResultContent(attempt, exam) {
  const isGraded = attempt.status === "graded" && attempt.gradedAt && attempt.score != null;

  $("[data-result-status]").textContent = statusLabel(attempt.status || "submitted");
  $("[data-result-exam-title]").textContent = exam.title || "امتحان";
  $("[data-result-meta]").textContent = `${subjectLabel(exam.subject)} · ${gradeLabel(exam.grade)} · ${attempt.studentName || ""}`;

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
    const got = (attempt.manualScores && attempt.manualScores[q.id] != null)
      ? manSc
      : autoSc;
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
    card.appendChild(el("div", { class: "review-question", text: q.text || "" }));

    const wrap = el("div", { class: "review-answers" });

    const isUnanswered = !isAnswered(a, q);

    let studentText = "—";
    let studentCls = "is-wrong";

    if (isUnanswered) {
      studentText = "لم تجب على هذا السؤال";
      studentCls = "is-unanswered";
    } else {
      if (q.type === "mcq" || q.type === "mcq_just") {
        if (a.selectedIndex != null && q.options?.[a.selectedIndex]) {
          studentText = q.options[a.selectedIndex];
        } else if (a.selectedIndex != null) {
          studentText = `الخيار ${String.fromCharCode(65 + a.selectedIndex)}`;
        }
      } else if (q.type === "tf" || q.type === "tf_just") {
        if (a.boolValue === true) studentText = "صح";
        else if (a.boolValue === false) studentText = "خطأ";
      } else if (q.type === "complete") {
        studentText = (a.textValue && a.textValue.trim()) ? a.textValue : "—";
      } else if (q.type === "essay") {
        studentText = (a.essayText && a.essayText.trim()) ? a.essayText : "—";
      }
    }

    wrap.appendChild(el("div", { class: `review-answer ${studentCls}` }, [
      el("strong", { text: "إجابتك" }),
      el("div", { text: studentText, style: "white-space:pre-wrap" })
    ]));

    if (q.type !== "essay") {
      let correctText = "—";
      if (q.type === "mcq" || q.type === "mcq_just") correctText = q.options?.[key.correctIndex] || "—";
      else if (q.type === "tf" || q.type === "tf_just") correctText = key.correctBool ? "صح" : "خطأ";
      else if (q.type === "complete") correctText = key.correctText || "—";
      wrap.appendChild(el("div", { class: "review-answer is-correct" }, [
        el("strong", { text: "الإجابة الصحيحة" }),
        el("div", { text: correctText, style: "white-space:pre-wrap" })
      ]));
    }

    if (q.type === "essay" && key.modelAnswer) {
      wrap.appendChild(el("div", { class: "review-answer is-correct" }, [
        el("strong", { text: "الإجابة النموذجية" }),
        el("div", { text: key.modelAnswer, style: "white-space:pre-wrap" })
      ]));
    }

    if (a.justification) {
      wrap.appendChild(el("div", { class: "review-answer" }, [
        el("strong", { text: "تبريرك" }),
        el("div", { text: a.justification, style: "white-space:pre-wrap" })
      ]));
    }

    if ((q.type === "mcq_just" || q.type === "tf_just") && key.justificationModelAnswer) {
      wrap.appendChild(el("div", { class: "review-answer is-correct" }, [
        el("strong", { text: "التبرير النموذجي" }),
        el("div", { text: key.justificationModelAnswer, style: "white-space:pre-wrap" })
      ]));
    }

    card.appendChild(wrap);
    reviewHost.appendChild(card);
  });
}

/* ============================================================
   DELETE ACCOUNT
   ============================================================ */
async function deleteAccountFlow() {
  if (!currentUser || !currentProfile) return;

  const step1 = await showDeleteStep1();
  if (!step1) return;

  showGlobalLoading("جارٍ التحقق من هويتك…");
  let reauthUser = null;
  try {
    reauthUser = await signInWithGoogle();
  } catch (err) {
    hideGlobalLoading();
    toast("تم إلغاء العملية", "warning");
    return;
  }
  hideGlobalLoading();

  if (!reauthUser || reauthUser.uid !== currentUser.uid) {
    toast("يجب تسجيل الدخول بنفس الحساب", "error");
    return;
  }

  const step2 = await showDeleteStep2();
  if (!step2) return;

  showGlobalLoading("جارٍ حذف الحساب…");

  try {
    const uid = currentUser.uid;
    const normalized = currentProfile.normalizedUsername;

    const examsSnap = await getDocs(query(collection(db, "exams"), where("ownerId", "==", uid)));
    const examIds = examsSnap.docs.map((d) => d.id);

    for (const examId of examIds) {
      try {
        const attemptsSnap = await getDocs(query(collection(db, "attempts"), where("examId", "==", examId)));
        for (const aDoc of attemptsSnap.docs) {
          try { await deleteDoc(doc(db, "attempts", aDoc.id)); } catch (e) { console.warn(e); }
        }
      } catch (e) { console.warn(e); }
    }

    for (const examId of examIds) {
      try { await deleteDoc(doc(db, "examAnswers", examId)); } catch (e) { console.warn(e); }
    }

    for (const examId of examIds) {
      try { await deleteDoc(doc(db, "exams", examId)); } catch (e) { console.warn(e); }
    }

    try {
      const logsSnap = await getDocs(query(collection(db, "activityLogs"), where("ownerId", "==", uid)));
      for (const lDoc of logsSnap.docs) {
        try { await deleteDoc(doc(db, "activityLogs", lDoc.id)); } catch (e) { console.warn(e); }
      }
    } catch (e) { console.warn(e); }

    if (normalized) {
      try { await deleteDoc(doc(db, "usernames", normalized)); } catch (e) { console.warn(e); }
    }

    try { await deleteDoc(doc(db, "users", uid)); } catch (e) { console.warn(e); }

    clearProfileCache();

    try {
      if (currentUser && currentUser.delete) await currentUser.delete();
      else await fbSignOut(auth);
    } catch (err) {
      console.warn("auth delete failed:", err);
      try { await fbSignOut(auth); } catch {}
    }

    currentUser = null;
    currentProfile = null;
    hideGlobalLoading();

    openModal({
      title: "تم حذف الحساب",
      body: "تم حذف حسابك وجميع بياناتك بنجاح.",
      actions: [{
        label: "الرئيسية",
        class: "btn-primary",
        onClick: () => { navigate("/"); }
      }]
    });
  } catch (err) {
    console.error("[deleteAccount]", err);
    hideGlobalLoading();
    toast("فشل حذف الحساب. حاول مرة أخرى.", "error");
  }
}

function showDeleteStep1() {
  return new Promise((resolve) => {
    openModal({
      title: "حذف الحساب",
      body: el("div", { class: "stack-sm" }, [
        el("p", { class: "text-secondary", text: "هل أنت متأكد من رغبتك في حذف حسابك؟" }),
        el("div", { class: "card", style: "padding:var(--sp-4);background:var(--danger-50);border-color:var(--danger-500)" }, [
          el("p", { class: "text-sm fw-semibold text-danger", text: "سيتم حذف ما يلي نهائيًا:" }),
          el("ul", { style: "margin-top:8px;padding-inline-start:20px;line-height:2;font-size:var(--fs-sm)" }, [
            el("li", { text: "جميع امتحاناتك" }),
            el("li", { text: "جميع محاولات الطلاب" }),
            el("li", { text: "جميع الإجابات والنتائج" }),
            el("li", { text: "ملفك الشخصي واسم المستخدم" })
          ])
        ]),
        el("p", { class: "text-sm text-muted mt-3", text: "سيُطلب منك تسجيل الدخول مرة أخرى لتأكيد هويتك." })
      ]),
      actions: [
        { label: "إلغاء", class: "btn-ghost", onClick: () => resolve(false) },
        { label: "متابعة", class: "btn-danger", onClick: () => resolve(true) }
      ],
      onClose: () => resolve(false)
    });
  });
}

function showDeleteStep2() {
  return new Promise((resolve) => {
    openModal({
      title: "تأكيد نهائي",
      body: el("div", { class: "stack-sm" }, [
        el("p", { class: "text-secondary fw-semibold", text: "هذه العملية لا يمكن التراجع عنها." })
      ]),
      actions: [
        { label: "إلغاء", class: "btn-ghost", onClick: () => resolve(false) },
        { label: "حذف نهائي", class: "btn-danger", onClick: () => resolve(true) }
      ],
      onClose: () => resolve(false)
    });
  });
}

/* ============================================================
   ROUTES
   ============================================================ */
onRoute("/", () => initLanding());
onRoute("/login", () => initLogin());
onRoute("/setup", () => initSetup());
onRoute("/app/dashboard", async () => { await renderDashboard(); });
onRoute("/app/exams", async () => { await renderMyExams(); });
onRoute("/app/builder", async (p) => { await renderBuilder(p); });
onRoute("/app/exam", async (p) => { await renderExamDetails(p); });
onRoute("/app/grading", async (p) => { await renderGrading(p); });
onRoute("/app/bank", () => {});
onRoute("/app/profile", () => { renderProfile(); });
onRoute("/app/settings", () => { renderSettings(); });
onRoute("/app/support", () => { renderSupport(); });
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

  const refreshBtn = e.target.closest("[data-refresh-page]");
  if (refreshBtn) {
    if (refreshBtn.disabled) return;

    refreshBtn.disabled = true;
    refreshBtn.classList.add("is-loading");

    const span = refreshBtn.querySelector("span");
    const originalText = span?.textContent || "تحديث";

    let countdown = 5;

    const tick = () => {
      if (span) span.textContent = `تحديث (${countdown})`;
      countdown--;

      if (countdown < 0) {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove("is-loading");
        if (span) span.textContent = originalText;
        return;
      }
      setTimeout(tick, 1000);
    };

    tick();

    setTimeout(() => {
      location.reload();
    }, 300);

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
  bindEntryHandlers();

  const hash = location.hash || "";
  const wasLoggedIn = localStorage.getItem(PROFILE_CACHE_KEY);
  const goingToApp = hash.includes("/app/") && !wasLoggedIn;

  if (goingToApp) {
    showGlobalLoading("جارٍ التحميل…");
  }

  handleRoute();
})();
