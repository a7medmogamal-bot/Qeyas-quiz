/* ============================================================
   QeyasQuiz — Application Logic
   ============================================================ */

/* ============================================================
   CONFIG BOOTSTRAP (Vercel Env → /api/config, fallback hardcoded)
   ============================================================ */
let APP_CONFIG = null;

async function loadConfig() {
  if (APP_CONFIG) return APP_CONFIG;
  try {
    const res = await fetch("/api/config");
    if (!res.ok) throw new Error("config fetch failed");
    APP_CONFIG = await res.json();
  } catch (err) {
    console.warn("[config] fallback to hardcoded");
    APP_CONFIG = {
      firebase: {
        apiKey: "AIzaSyAIPCI0ZaBabAQQAvT1CSh_Bt3HMPtx_VU",
        authDomain: "qeyasquiz.firebaseapp.com",
        projectId: "qeyasquiz",
        storageBucket: "qeyasquiz.firebasestorage.app",
        messagingSenderId: "918583547137",
        appId: "1:918583547137:web:78cef6533e33cd7e8ab700"
      },
      cloudinary: {
        cloudName: "di5z4lzwv",
        uploadPreset: "qeyasquiz_upload"
      }
    };
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

const CLOUDINARY = {
  cloudName: cfg.cloudinary.cloudName,
  uploadPreset: cfg.cloudinary.uploadPreset,
  avatarFolder: "qeyasquiz/avatars",
  questionFolder: "qeyasquiz/questions"
};

/* ============================================================
   SUBJECTS
   ============================================================ */
const SUBJECTS = [
  { id: "studies",     en: "Social Studies", ar: "دراسات" },
  { id: "arabic",      en: "Arabic",         ar: "عربي" },
  { id: "english",     en: "English",        ar: "انجليزي" },
  { id: "math",        en: "Mathematics",    ar: "رياضه" },
  { id: "philosophy",  en: "Philosophy",     ar: "فلسفه" },
  { id: "french",      en: "French",         ar: "فرنساوي" },
  { id: "german",      en: "German",         ar: "الماني" },
  { id: "history",     en: "History",        ar: "تاريخ" },
  { id: "geography",   en: "Geography",      ar: "جغرافيا" },
  { id: "programming", en: "Programming",    ar: "برمجه" },
  { id: "science",     en: "Science",        ar: "علوم" },
  { id: "chemistry",   en: "Chemistry",      ar: "كيميا" },
  { id: "physics",     en: "Physics",        ar: "فيزيا" },
  { id: "biology",     en: "Biology",        ar: "احياء" }
];

function subjectLabel(id) {
  if (!id) return "—";
  const s = SUBJECTS.find((x) => x.id === id);
  if (!s) return id;
  return currentLang === "ar" ? s.ar : s.en;
}

/* ============================================================
   I18N — Full translations
   ============================================================ */
const I18N = {
  en: {
    "nav.features": "Features", "nav.how": "How it works", "nav.security": "Security",
    "nav.signin": "Sign in", "nav.cta": "Get Started",
    "nav.dashboard": "Dashboard", "nav.exams": "My Exams", "nav.bank": "Question Bank",
    "nav.profile": "Profile", "nav.settings": "Settings", "nav.packages": "Packages",
    "hero.eyebrow": "EdTech Platform", "hero.title": "Create. Publish. Assess.",
    "hero.subtitle": "QeyasQuiz helps teachers create exams, deliver them securely, and grade with precision — all in one place.",
    "hero.cta": "Create Your First Exam", "hero.secondary": "Sign in with Google",
    "hero.point1": "Multiple exam forms", "hero.point2": "Automatic grading", "hero.point3": "Anti-cheat monitoring",
    "features.title": "Built for serious assessment",
    "features.subtitle": "Every tool a teacher needs, nothing they don't.",
    "features.f1.title": "Exam Builder", "features.f1.text": "Six question types, drag-and-drop ordering, and automatic total score calculation.",
    "features.f2.title": "Multiple Forms", "features.f2.text": "Create separate forms with different questions. Students get one at random.",
    "features.f3.title": "Server-Authoritative Timer", "features.f3.text": "Timing is calculated from trusted server timestamps. Device clock changes have no effect.",
    "features.f4.title": "Anti-Cheat Monitoring", "features.f4.text": "Tab switches, visibility changes and disconnects are logged for teacher review.",
    "features.f5.title": "Automatic Grading", "features.f5.text": "Objective questions grade instantly. Essays and justifications stay manual.",
    "features.f6.title": "Analytics", "features.f6.text": "Average score, hardest questions, completion time and per-topic breakdown.",
    "how.title": "How it works", "how.subtitle": "From idea to result in three steps.",
    "how.s1.title": "Create", "how.s1.text": "Build your exam with multiple forms, images, timing, and access rules.",
    "how.s2.title": "Publish", "how.s2.text": "Share a secure link or QR code. Students open it and start instantly.",
    "how.s3.title": "Assess", "how.s3.text": "Objective questions grade automatically. Review, add feedback, and publish results.",
    "sec.title": "Secure by design",
    "sec.subtitle": "The frontend is never trusted. Every critical action is validated on the backend.",
    "sec.s1.title": "Server Timestamps", "sec.s1.text": "Exam timing and deadlines are enforced from trusted server time.",
    "sec.s2.title": "Answer Key Protection", "sec.s2.text": "Correct answers are stored in a separate collection. Students can never read them.",
    "sec.s3.title": "One Attempt Only", "sec.s3.text": "Duplicate attempts are blocked at the database level, not in the browser.",
    "cta.title": "Start assessing smarter today", "cta.subtitle": "Free to start. No credit card. Sign in with Google and publish your first exam in minutes.",
    "cta.primary": "Create Your First Exam", "cta.secondary": "Sign in with Google",
    "footer.about": "About", "footer.privacy": "Privacy", "footer.terms": "Terms", "footer.contact": "Contact",
    "footer.tagline": "Smart Exams. Better Assessment.",
    "auth.signin": "Sign in", "auth.signup": "Sign up",
    "auth.signin.title": "Welcome back", "auth.signin.subtitle": "Sign in to continue.",
    "auth.signup.title": "Create your account", "auth.signup.subtitle": "Get started in seconds.",
    "auth.google.signin": "Sign in with Google", "auth.google.signup": "Sign up with Google",
    "login.connecting": "Connecting…",
    "login.terms": "By continuing you agree to our", "login.termsLink": "Terms",
    "login.and": "and", "login.privacyLink": "Privacy Policy",
    "setup.title": "Complete your profile", "setup.subtitle": "This information appears on your exams and helps students identify you.",
    "setup.photo.title": "Profile picture", "setup.photo.change": "Change picture",
    "setup.photo.reset": "Use Google photo", "setup.photo.hint": "JPG, PNG or WebP. Max 2 MB.",
    "setup.identity.title": "Identity",
    "setup.username.label": "Username", "setup.username.hint": "3–24 characters. Letters, numbers, and underscore only.",
    "setup.fullName.label": "Full name", "setup.fullName.hint": "Shown to students on exam pages.",
    "setup.subjects.title": "Your subjects", "setup.subjects.hint": "Select all the subjects you teach. These will be available when creating exams.",
    "setup.subjects.customLabel": "Add custom subject", "setup.subjects.addCustom": "Add",
    "setup.signout": "Sign out", "setup.cancel": "Cancel", "setup.submit": "Complete Setup",
    "dash.welcome.sub": "Here's what's happening with your exams.",
    "dash.recentExams": "Recent Exams", "dash.activity": "Recent Activity",
    "stat.totalExams": "Total Exams", "stat.activeExams": "Active Exams",
    "stat.submitted": "Submitted Students", "stat.waiting": "Waiting for Grading",
    "action.viewAll": "View all", "action.createExam": "Create Exam", "action.newExam": "New Exam",
    "action.prev": "Previous", "action.next": "Next", "action.cancel": "Cancel",
    "action.preview": "Preview", "action.publish": "Publish", "action.publishExam": "Publish Exam",
    "action.addQuestion": "Add Question", "action.addForm": "Add Form",
    "action.submit": "Submit", "action.submitExam": "Submit Exam",
    "action.back": "Back", "action.save": "Save",
    "action.goHome": "Go Home", "action.editProfile": "Edit", "action.deleteAccount": "Delete Account",
    "action.open": "Open", "action.edit": "Edit", "action.share": "Share", "action.grade": "Grade",
    "status.draft": "Draft", "status.scheduled": "Scheduled", "status.active": "Active",
    "status.completed": "Completed", "status.submitted": "Submitted", "status.graded": "Graded",
    "status.in_progress": "In Progress",
    "filter.allStatus": "All statuses",
    "empty.exams.title": "No exams yet", "empty.exams.text": "Create your first exam to get started.",
    "empty.bank.title": "No saved questions", "empty.bank.text": "Save questions from your exams to reuse them later.",
    "packages.title": "Packages", "packages.text": "Under development. Plans and pricing will be available soon.",
    "builder.newExam": "New Exam",
    "builder.step.info": "Info", "builder.step.questions": "Questions",
    "builder.step.forms": "Forms", "builder.step.settings": "Settings",
    "builder.step": "Step",
    "builder.info.title": "Exam information", "builder.info.name": "Exam name",
    "builder.info.subject": "Subject", "builder.info.selectSubject": "Select subject",
    "builder.info.grade": "Grade", "builder.info.selectGrade": "Select grade",
    "builder.questions.title": "Questions", "builder.questions.total": "Total:",
    "builder.forms.title": "Exam forms",
    "builder.forms.hint": "Each form has its own questions. Students receive one form at random.",
    "builder.settings.title": "Exam settings",
    "builder.settings.displayMode": "Display mode",
    "builder.settings.mode.scroll": "Scroll", "builder.settings.mode.scrollDesc": "All questions on one page",
    "builder.settings.mode.single": "One by One", "builder.settings.mode.singleDesc": "One question per screen",
    "builder.settings.startAt": "Opens at", "builder.settings.endAt": "Closes at",
    "builder.settings.startHint": "Students cannot start before this time.",
    "builder.settings.endHint": "Students cannot start after this time.",
    "builder.settings.duration": "Duration (minutes)",
    "builder.settings.accessCodeValue": "Access code (optional)",
    "builder.settings.shuffle": "Shuffle question order per student",
    "builder.settings.accessCode": "Require access code",
    "builder.settings.fullscreen": "Require fullscreen during exam",
    "question.text": "Question text…",
    "question.correct": "Correct answer", "question.model": "Model answer",
    "question.score": "Score", "question.option": "Option", "question.addOption": "Add option",
    "question.true": "True", "question.false": "False",
    "common.questions": "questions", "common.points": "pts", "common.saved": "Saved", "common.saving": "Saving…",
    "common.saveFailed": "Save failed", "common.teacher": "Teacher", "common.duration": "Duration",
    "common.subject": "Subject", "common.grade": "Grade", "common.totalPossible": "Total possible",
    "common.saveGrading": "Save grading", "common.publishResult": "Publish result",
    "common.student": "Student", "common.status": "Status", "common.score": "Score",
    "common.started": "Started", "common.submitted": "Submitted", "common.notFound": "Not found",
    "exam.loading": "Loading exam…", "exam.connected": "Connected",
    "exam.entry.studentName": "Your full name", "exam.entry.accessCode": "Access code",
    "exam.entry.start": "Start Exam", "exam.entry.foot": "Make sure your name is correct — it will be used for grading.",
    "entry.badge": "Exam", "entry.teacher": "Teacher", "entry.subtitle": "Please review the details and enter your name to begin.",
    "exam.resume.title": "Resume your exam?", "exam.resume.text": "You have an exam in progress. Your answers and remaining time have been preserved.",
    "exam.resume.continue": "Resume Exam",
    "exam.confirm.title": "Submit exam?", "exam.confirm.text": "Are you sure you want to submit your exam? You cannot make changes after submission.",
    "exam.confirm.unanswered": "Unanswered questions",
    "exam.confirm.submitAnyway": "Submit anyway", "exam.confirm.goToFirst": "Go to first",
    "exam.update.title": "Exam Updated", "exam.update.text": "The teacher has updated this exam. Refresh to load the latest version. Your answers will be preserved.",
    "exam.update.refresh": "Refresh Exam",
    "exam.offline": "Connection lost. Your answers are saved locally and will sync when you reconnect.",
    "exam.timeUp": "Time is up. Exam submitted automatically.",
    "exam.newQuestion": "New question added by teacher.",
    "result.loading": "Loading result…", "result.waiting": "Waiting for grading.",
    "result.feedback": "Teacher Feedback", "result.review": "Answer Review",
    "result.reviewSub": "See your answers alongside the correct answers.",
    "settings.appearance": "Appearance", "settings.light": "Light mode", "settings.dark": "Dark mode",
    "settings.language": "Language",
    "profile.subjects": "Subjects", "profile.danger": "Danger zone",
    "profile.dangerText": "Deleting your account removes all your exams, students, and results permanently.",
    "security.tabTitle": "Tab Switch Detected", "security.tabHidden": "You switched away from the exam. This event has been recorded.",
    "security.fsTitle": "Fullscreen Required", "security.fsExit": "You exited fullscreen. Please return to fullscreen to continue."
  },
  ar: {
    "nav.features": "المميزات", "nav.how": "كيف يعمل", "nav.security": "الأمان",
    "nav.signin": "تسجيل الدخول", "nav.cta": "ابدأ الآن",
    "nav.dashboard": "الرئيسية", "nav.exams": "امتحاناتي", "nav.bank": "بنك الأسئلة",
    "nav.profile": "الملف الشخصي", "nav.settings": "الإعدادات", "nav.packages": "الباقات",
    "hero.eyebrow": "منصة تعليمية", "hero.title": "أنشئ. انشر. قيّم.",
    "hero.subtitle": "QeyasQuiz تساعد المعلمين على إنشاء الامتحانات وتسليمها بأمان وتصحيحها بدقة.",
    "hero.cta": "أنشئ أول امتحان", "hero.secondary": "الدخول بحساب Google",
    "hero.point1": "نماذج امتحان متعددة", "hero.point2": "تصحيح تلقائي", "hero.point3": "مراقبة ضد الغش",
    "features.title": "مبنية للتقييم الجاد",
    "features.subtitle": "كل أداة يحتاجها المعلم، بدون زيادات.",
    "features.f1.title": "منشئ الامتحانات", "features.f1.text": "ستة أنواع أسئلة، ترتيب بالسحب، وحساب تلقائي للدرجة الكلية.",
    "features.f2.title": "نماذج متعددة", "features.f2.text": "أنشئ نماذج بأسئلة مختلفة. الطالب يحصل على نموذج عشوائي.",
    "features.f3.title": "مؤقت بوقت السيرفر", "features.f3.text": "الوقت محسوب من توقيت السيرفر الموثوق. تغيير ساعة الجهاز لا يؤثر.",
    "features.f4.title": "مراقبة ضد الغش", "features.f4.text": "تسجيل تبديل التاب وتغيير التركيز وانقطاع الاتصال لمراجعة المعلم.",
    "features.f5.title": "تصحيح تلقائي", "features.f5.text": "الأسئلة الموضوعية تُصحح فورًا. المقالية والتبرير يدويًا.",
    "features.f6.title": "تحليلات", "features.f6.text": "متوسط الدرجات، أصعب الأسئلة، وقت الإنجاز، وتحليل حسب الموضوع.",
    "how.title": "كيف يعمل", "how.subtitle": "من الفكرة إلى النتيجة في ثلاث خطوات.",
    "how.s1.title": "أنشئ", "how.s1.text": "ابنِ امتحانك بنماذج متعددة وصور وتوقيت وقواعد وصول.",
    "how.s2.title": "انشر", "how.s2.text": "شارك رابطًا آمنًا أو كود QR. الطلاب يفتحون ويبدأون فورًا.",
    "how.s3.title": "قيّم", "how.s3.text": "الأسئلة الموضوعية تُصحح تلقائيًا. راجع، أضف ملاحظات، وانشر النتائج.",
    "sec.title": "آمن بالتصميم", "sec.subtitle": "لا نثق أبدًا في الواجهة. كل إجراء حساس يُتحقق منه على السيرفر.",
    "sec.s1.title": "توقيت السيرفر", "sec.s1.text": "أوقات الامتحان والمواعيد النهائية مفروضة من وقت السيرفر الموثوق.",
    "sec.s2.title": "حماية الإجابات", "sec.s2.text": "الإجابات الصحيحة محفوظة في collection منفصلة. الطالب لا يمكنه قراءتها أبدًا.",
    "sec.s3.title": "محاولة واحدة فقط", "sec.s3.text": "تكرار المحاولات ممنوع على مستوى قاعدة البيانات، لا في المتصفح.",
    "cta.title": "ابدأ التقييم الذكي اليوم", "cta.subtitle": "ابدأ مجانًا. بدون بطاقة. سجل بحساب Google وانشر أول امتحان في دقائق.",
    "cta.primary": "أنشئ أول امتحان", "cta.secondary": "الدخول بحساب Google",
    "footer.about": "من نحن", "footer.privacy": "الخصوصية", "footer.terms": "الشروط", "footer.contact": "اتصل بنا",
    "footer.tagline": "امتحانات ذكية. تقييم أفضل.",
    "auth.signin": "تسجيل الدخول", "auth.signup": "حساب جديد",
    "auth.signin.title": "مرحبًا بعودتك", "auth.signin.subtitle": "سجّل الدخول للمتابعة.",
    "auth.signup.title": "أنشئ حسابك", "auth.signup.subtitle": "ابدأ خلال ثوانٍ.",
    "auth.google.signin": "الدخول بحساب Google", "auth.google.signup": "التسجيل بحساب Google",
    "login.connecting": "جارٍ الاتصال…",
    "login.terms": "بالمتابعة أنت توافق على", "login.termsLink": "الشروط",
    "login.and": "و", "login.privacyLink": "سياسة الخصوصية",
    "setup.title": "أكمل ملفك الشخصي", "setup.subtitle": "هذه المعلومات تظهر في امتحاناتك وتساعد الطلاب على التعرف عليك.",
    "setup.photo.title": "الصورة الشخصية", "setup.photo.change": "تغيير الصورة",
    "setup.photo.reset": "استخدام صورة Google", "setup.photo.hint": "JPG أو PNG أو WebP. الحد الأقصى 2 ميجابايت.",
    "setup.identity.title": "الهوية",
    "setup.username.label": "اسم المستخدم", "setup.username.hint": "3–24 حرفًا. حروف وأرقام وشرطة سفلية فقط.",
    "setup.fullName.label": "الاسم الكامل", "setup.fullName.hint": "يظهر للطلاب في صفحات الامتحان.",
    "setup.subjects.title": "موادك", "setup.subjects.hint": "اختر كل المواد التي تدرّسها. ستكون متاحة عند إنشاء الامتحانات.",
    "setup.subjects.customLabel": "إضافة مادة مخصصة", "setup.subjects.addCustom": "أضف",
    "setup.signout": "تسجيل الخروج", "setup.cancel": "إلغاء", "setup.submit": "إكمال الإعداد",
    "dash.welcome.sub": "هذا ما يحدث في امتحاناتك.",
    "dash.recentExams": "أحدث الامتحانات", "dash.activity": "النشاط الأخير",
    "stat.totalExams": "إجمالي الامتحانات", "stat.activeExams": "الامتحانات النشطة",
    "stat.submitted": "طلاب سلّموا", "stat.waiting": "بانتظار التصحيح",
    "action.viewAll": "عرض الكل", "action.createExam": "إنشاء امتحان", "action.newExam": "امتحان جديد",
    "action.prev": "السابق", "action.next": "التالي", "action.cancel": "إلغاء",
    "action.preview": "معاينة", "action.publish": "نشر", "action.publishExam": "نشر الامتحان",
    "action.addQuestion": "إضافة سؤال", "action.addForm": "إضافة نموذج",
    "action.submit": "تسليم", "action.submitExam": "تسليم الامتحان",
    "action.back": "السابق", "action.save": "حفظ",
    "action.goHome": "الرئيسية", "action.editProfile": "تعديل", "action.deleteAccount": "حذف الحساب",
    "action.open": "فتح", "action.edit": "تعديل", "action.share": "مشاركة", "action.grade": "تصحيح",
    "status.draft": "مسودة", "status.scheduled": "مجدول", "status.active": "نشط",
    "status.completed": "مكتمل", "status.submitted": "تم التسليم", "status.graded": "تم التصحيح",
    "status.in_progress": "قيد الحل",
    "filter.allStatus": "كل الحالات",
    "empty.exams.title": "لا توجد امتحانات بعد", "empty.exams.text": "أنشئ أول امتحان للبدء.",
    "empty.bank.title": "لا توجد أسئلة محفوظة", "empty.bank.text": "احفظ أسئلة من امتحاناتك لإعادة استخدامها لاحقًا.",
    "packages.title": "الباقات", "packages.text": "تحت التطوير. الخطط والأسعار ستكون متاحة قريبًا.",
    "builder.newExam": "امتحان جديد",
    "builder.step.info": "البيانات", "builder.step.questions": "الأسئلة",
    "builder.step.forms": "النماذج", "builder.step.settings": "الإعدادات",
    "builder.step": "خطوة",
    "builder.info.title": "بيانات الامتحان", "builder.info.name": "اسم الامتحان",
    "builder.info.subject": "المادة", "builder.info.selectSubject": "اختر المادة",
    "builder.info.grade": "الصف", "builder.info.selectGrade": "اختر الصف",
    "builder.questions.title": "الأسئلة", "builder.questions.total": "الدرجة الكلية:",
    "builder.forms.title": "نماذج الامتحان",
    "builder.forms.hint": "كل نموذج له أسئلته المنفصلة. الطالب يحصل على نموذج عشوائي.",
    "builder.settings.title": "إعدادات الامتحان",
    "builder.settings.displayMode": "طريقة العرض",
    "builder.settings.mode.scroll": "كل الأسئلة", "builder.settings.mode.scrollDesc": "ورقة امتحان كاملة",
    "builder.settings.mode.single": "سؤال سؤال", "builder.settings.mode.singleDesc": "سؤال واحد في الشاشة",
    "builder.settings.startAt": "يفتح في", "builder.settings.endAt": "يغلق في",
    "builder.settings.startHint": "لا يمكن للطلاب البدء قبل هذا الوقت.",
    "builder.settings.endHint": "لا يمكن للطلاب البدء بعد هذا الوقت.",
    "builder.settings.duration": "المدة (دقائق)",
    "builder.settings.accessCodeValue": "كود الدخول (اختياري)",
    "builder.settings.shuffle": "خلط ترتيب الأسئلة لكل طالب",
    "builder.settings.accessCode": "طلب كود دخول",
    "builder.settings.fullscreen": "طلب ملء الشاشة خلال الامتحان",
    "question.text": "نص السؤال…",
    "question.correct": "الإجابة الصحيحة", "question.model": "الإجابة النموذجية",
    "question.score": "الدرجة", "question.option": "خيار", "question.addOption": "إضافة خيار",
    "question.true": "صح", "question.false": "خطأ",
    "common.questions": "أسئلة", "common.points": "نقطة", "common.saved": "تم الحفظ", "common.saving": "جارٍ الحفظ…",
    "common.saveFailed": "فشل الحفظ", "common.teacher": "المعلم", "common.duration": "المدة",
    "common.subject": "المادة", "common.grade": "الصف", "common.totalPossible": "الدرجة الكلية",
    "common.saveGrading": "حفظ التصحيح", "common.publishResult": "نشر النتيجة",
    "common.student": "الطالب", "common.status": "الحالة", "common.score": "الدرجة",
    "common.started": "البدء", "common.submitted": "التسليم", "common.notFound": "غير موجود",
    "exam.loading": "جارٍ تحميل الامتحان…", "exam.connected": "متصل",
    "exam.entry.studentName": "اسمك الكامل", "exam.entry.accessCode": "كود الدخول",
    "exam.entry.start": "ابدأ الامتحان", "exam.entry.foot": "تأكد من صحة اسمك — سيُستخدم للتصحيح.",
    "entry.badge": "امتحان", "entry.teacher": "المعلم", "entry.subtitle": "راجع التفاصيل وأدخل اسمك للبدء.",
    "exam.resume.title": "استئناف الامتحان؟", "exam.resume.text": "لديك امتحان جارٍ. تم حفظ إجاباتك والوقت المتبقي.",
    "exam.resume.continue": "استئناف",
    "exam.confirm.title": "تسليم الامتحان؟", "exam.confirm.text": "هل أنت متأكد؟ لا يمكنك التعديل بعد التسليم.",
    "exam.confirm.unanswered": "أسئلة بدون إجابة",
    "exam.confirm.submitAnyway": "سلّم على أي حال", "exam.confirm.goToFirst": "روح للسؤال",
    "exam.update.title": "تم تحديث الامتحان", "exam.update.text": "قام المعلم بتحديث الامتحان. حدّث الصفحة لتحميل النسخة الأحدث. إجاباتك ستبقى.",
    "exam.update.refresh": "تحديث الامتحان",
    "exam.offline": "فقد الاتصال. إجاباتك محفوظة محليًا وستتم المزامنة عند عودة الاتصال.",
    "exam.timeUp": "انتهى الوقت. تم تسليم الامتحان تلقائيًا.",
    "exam.newQuestion": "سؤال جديد أضافه المعلم.",
    "result.loading": "جارٍ تحميل النتيجة…", "result.waiting": "بانتظار التصحيح.",
    "result.feedback": "ملاحظات المعلم", "result.review": "مراجعة الإجابات",
    "result.reviewSub": "شاهد إجاباتك بجانب الإجابات الصحيحة.",
    "settings.appearance": "المظهر", "settings.light": "الوضع الفاتح", "settings.dark": "الوضع الداكن",
    "settings.language": "اللغة",
    "profile.subjects": "المواد", "profile.danger": "منطقة الخطر",
    "profile.dangerText": "حذف الحساب يمسح كل امتحاناتك وطلابك ونتائجك نهائيًا.",
    "security.tabTitle": "تم كشف تبديل التاب", "security.tabHidden": "لقد تركت صفحة الامتحان. تم تسجيل هذا الحدث.",
    "security.fsTitle": "ملء الشاشة مطلوب", "security.fsExit": "لقد خرجت من ملء الشاشة. يرجى العودة للمتابعة."
  }
};

const LANG_KEY = "qeyasquiz.lang";
const THEME_KEY = "qeyasquiz.theme";
let currentLang = localStorage.getItem(LANG_KEY) || "en";
let currentTheme = localStorage.getItem(THEME_KEY) || "light";

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
}

function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  applyI18n();
  document.querySelectorAll(".lang-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.lang === lang);
  });
  // Re-render active view if needed
  if (currentRoute && routeHandlers[currentRoute]) {
    try { routeHandlers[currentRoute](currentParams || new URLSearchParams()); } catch {}
  }
}

function setTheme(theme) {
  currentTheme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
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

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(currentLang === "ar" ? "ar-EG" : "en-GB", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function fmtRelative(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return currentLang === "ar" ? "الآن" : "just now";
  if (min < 60) return currentLang === "ar" ? `قبل ${min} دقيقة` : `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return currentLang === "ar" ? `قبل ${h} ساعة` : `${h}h ago`;
  const days = Math.floor(h / 24);
  return currentLang === "ar" ? `قبل ${days} يوم` : `${days}d ago`;
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
  const closeBtn = el("button", { class: "toast-close", type: "button", "aria-label": "Close" });
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

async function signInWithGoogle() {
  try {
    return (await signInWithPopup(auth, googleProvider)).user;
  } catch (err) {
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
      throw new Error(currentLang === "ar" ? "تم إلغاء تسجيل الدخول." : "Sign in was cancelled.");
    }
    throw new Error(currentLang === "ar" ? "تعذّر تسجيل الدخول. حاول مرة أخرى." : "Could not sign in. Please try again.");
  }
}

async function signOutUser() {
  try { await fbSignOut(auth); } catch {}
  currentUser = null;
  currentProfile = null;
  navigate("/login");
}

async function loadProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch { return null; }
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
    console.warn("[listExams] fallback query", err);
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

function computeStatus(exam) {
  if (!exam) return "draft";
  if (exam.status === "draft") return "draft";
  const now = Date.now();
  const start = exam.startAt?.toMillis ? exam.startAt.toMillis() : null;
  const end = exam.endAt?.toMillis ? exam.endAt.toMillis() : null;
  if (end && now > end) return "completed";
  if (start && now < start) return "scheduled";
  if (start && end && now >= start && now <= end) return "active";
  if (exam.status === "scheduled") return "active";
  return exam.status || "draft";
}

/* ============================================================
   CLOUDINARY UPLOAD
   ============================================================ */
async function uploadToCloudinary(file, folder, maxBytes = 2 * 1024 * 1024) {
  if (!file) throw new Error("NO_FILE");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("INVALID_TYPE");
  if (file.size > maxBytes) throw new Error("TOO_LARGE");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY.uploadPreset);
  formData.append("folder", folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("[cloudinary]", body);
    throw new Error("UPLOAD_FAILED");
  }
  const data = await res.json();
  return data.secure_url;
}

async function uploadAvatar(uid, file) {
  return uploadToCloudinary(file, `${CLOUDINARY.avatarFolder}/${uid}`, 2 * 1024 * 1024);
}

async function uploadQuestionImage(examId, file) {
  return uploadToCloudinary(file, `${CLOUDINARY.questionFolder}/${examId || "draft"}`, 5 * 1024 * 1024);
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
  "/app/packages": { page: "app", view: "packages" },
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
  const route = ROUTES[path] || ROUTES["/"];
  const targetPage = route.page;

  $$("[data-page]").forEach((p) => { p.hidden = p.dataset.page !== targetPage; });

  if (route.view) {
    $$("[data-view]").forEach((v) => { v.hidden = v.dataset.view !== route.view; });
    $$(".side-link").forEach((l) => l.classList.toggle("is-active", l.dataset.route === route.view));

    const titleMap = {
      dashboard: "nav.dashboard", exams: "nav.exams", builder: "builder.newExam",
      "exam-details": "nav.exams", grading: "action.grade", bank: "nav.bank",
      profile: "nav.profile", settings: "nav.settings", packages: "nav.packages"
    };
    const titleEl = $("[data-page-title]");
    if (titleEl) titleEl.textContent = t(titleMap[route.view] || "");

    // Show back button except on dashboard
    const backBtn = $("[data-back]");
    if (backBtn) backBtn.hidden = route.view === "dashboard";
  }

  currentRoute = path;
  const handler = routeHandlers[path];
  if (handler) {
    Promise.resolve(handler(params)).catch((err) => {
      console.error("[route]", err);
      toast(currentLang === "ar" ? "حدث خطأ في تحميل الصفحة." : "Failed to load page.", "error");
    });
  }

  window.scrollTo(0, 0);
}

/* ============================================================
   AUTH STATE
   ============================================================ */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    currentProfile = null;
    if (!["/", "/login", "/exam", "/result"].includes(currentRoute)) {
      navigate("/login");
    }
    return;
  }

  currentProfile = await loadProfile(user.uid);
  const hasProfile = currentProfile && currentProfile.username;

  if (!hasProfile && currentRoute !== "/setup" && currentRoute !== "/" && currentRoute !== "/exam" && currentRoute !== "/result") {
    navigate("/setup");
    return;
  }
  if (hasProfile && (currentRoute === "/setup" || currentRoute === "/login")) {
    navigate("/app/dashboard");
    return;
  }

  $$("[data-user-name]").forEach((e) => (e.textContent = currentProfile?.fullName || user.displayName || ""));
  $$("[data-user-handle]").forEach((e) => (e.textContent = "@" + (currentProfile?.username || "")));
  $$("[data-user-avatar]").forEach((e) => (e.src = currentProfile?.photoURL || user.photoURL || ""));

  if (currentRoute && routeHandlers[currentRoute]) {
    Promise.resolve(routeHandlers[currentRoute](currentParams || new URLSearchParams())).catch(() => {});
  }
});

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

  let mode = "signin";

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      mode = tab.dataset.authTab;
      tabs.forEach((x) => {
        x.classList.toggle("is-active", x === tab);
        x.setAttribute("aria-selected", x === tab ? "true" : "false");
      });
      if (mode === "signin") {
        titleEl.textContent = t("auth.signin.title");
        subtitleEl.textContent = t("auth.signin.subtitle");
        googleText.textContent = t("auth.google.signin");
      } else {
        titleEl.textContent = t("auth.signup.title");
        subtitleEl.textContent = t("auth.signup.subtitle");
        googleText.textContent = t("auth.google.signup");
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
   SETUP
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

  // Prefill
  if (currentUser) {
    if (currentUser.displayName) fullNameInput.value = currentUser.displayName;
    if (currentUser.photoURL) avatarPreview.src = currentUser.photoURL;
    const base = (currentUser.email || "").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    if (base.length >= 3) usernameInput.value = base;
  }

  // Render subject grid
  function renderSubjectGrid() {
    subjectGrid.innerHTML = "";
    SUBJECTS.forEach((s) => {
      const selected = setupState.selectedSubjects.includes(s.id);
      const chip = el("button", {
        type: "button",
        class: `subject-chip ${selected ? "is-selected" : ""}`,
        text: currentLang === "ar" ? s.ar : s.en,
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

  // Custom subjects
  const customSubjects = [];
  function renderCustomChips() {
    customChips.innerHTML = "";
    customSubjects.forEach((name, i) => {
      const chip = el("span", { class: "chip" });
      chip.appendChild(document.createTextNode(name));
      const rm = el("button", { type: "button", class: "chip-remove", "aria-label": "Remove" });
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

  // Username check
  const checkUname = debounce(async () => {
    const val = usernameInput.value.trim();
    usernameError.hidden = true;
    usernameStatus.textContent = "";
    usernameStatus.className = "input-status";
    if (!val) return;
    if (!validUsername(val)) {
      usernameError.hidden = false;
      usernameError.textContent = t("setup.username.hint");
      return;
    }
    usernameStatus.textContent = "…";
    usernameStatus.classList.add("is-checking");
    try {
      const ok = await checkUsernameAvailability(val);
      usernameStatus.classList.remove("is-checking");
      if (ok) {
        usernameStatus.textContent = currentLang === "ar" ? "متاح" : "Available";
        usernameStatus.classList.add("is-available");
      } else {
        usernameStatus.textContent = currentLang === "ar" ? "مأخوذ" : "Taken";
        usernameStatus.classList.add("is-taken");
      }
    } catch { usernameStatus.textContent = ""; }
  }, 400);

  usernameInput.addEventListener("input", checkUname);

  // Avatar
  avatarPick.addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", () => {
    const f = avatarInput.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast("Max 2 MB", "warning"); return; }
    setupState.photoFile = f;
    avatarPreview.src = URL.createObjectURL(f);
  });
  avatarReset.addEventListener("click", () => {
    setupState.photoFile = null;
    avatarPreview.src = currentUser?.photoURL || "";
    avatarInput.value = "";
  });

  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let ok = true;

    const uname = usernameInput.value.trim();
    if (!validUsername(uname)) {
      usernameError.hidden = false;
      usernameError.textContent = t("setup.username.hint");
      ok = false;
    }

    const fullName = fullNameInput.value.trim();
    if (fullName.length < 3) {
      toast(currentLang === "ar" ? "أدخل اسمك الكامل" : "Enter your full name", "warning");
      ok = false;
    }

    if (setupState.selectedSubjects.length === 0 && customSubjects.length === 0) {
      subjectsError.hidden = false;
      subjectsError.textContent = currentLang === "ar" ? "اختر مادة واحدة على الأقل" : "Select at least one subject";
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
          console.warn("avatar upload failed:", err);
          toast(currentLang === "ar" ? "تعذّر رفع الصورة — سيتم استخدام صورة Google" : "Photo upload failed — using Google photo", "warning");
        }
      }

      const allSubjects = [
        ...setupState.selectedSubjects,
        ...customSubjects.map((name) => "custom:" + name)
      ];

      await claimUsername(currentUser.uid, uname, {
        fullName,
        photoURL,
        subjects: allSubjects
      });

      currentProfile = await loadProfile(currentUser.uid);
      toast(currentLang === "ar" ? "تم حفظ الملف" : "Profile saved", "success");
      navigate("/app/dashboard");
    } catch (err) {
      submitBtn.classList.remove("is-loading");
      if (err.message === "USERNAME_TAKEN") {
        usernameError.hidden = false;
        usernameError.textContent = currentLang === "ar" ? "اسم المستخدم مأخوذ" : "Username already taken.";
        usernameStatus.textContent = currentLang === "ar" ? "مأخوذ" : "Taken";
        usernameStatus.className = "input-status is-taken";
      } else {
        console.error(err);
        toast(currentLang === "ar" ? "تعذّر حفظ البيانات." : "Could not save profile.", "error");
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
    const greeting = hour < 12
      ? (currentLang === "ar" ? "صباح الخير" : "Good morning")
      : hour < 18
        ? (currentLang === "ar" ? "مساء الخير" : "Good afternoon")
        : (currentLang === "ar" ? "مساء الخير" : "Good evening");
    welcomeTitle.textContent = `${greeting}, ${(currentProfile.fullName || "").split(" ")[0] || ""}`;
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

  $$("[data-stat]").forEach((e) => {
    e.textContent = String(stats[e.dataset.stat] ?? 0);
  });

  const recentHost = $("[data-recent-exams]");
  if (recentHost) {
    recentHost.innerHTML = "";
    if (!exams.length) {
      recentHost.appendChild(el("div", { class: "empty" }, [
        el("h3", { text: t("empty.exams.title") }),
        el("p", { text: t("empty.exams.text") }),
        el("button", {
          class: "btn btn-primary", type: "button", text: t("action.createExam"),
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
      el("div", { class: "exam-card-title", text: exam.title || "Untitled" }),
      el("div", { class: "exam-card-sub", text: `${subjectLabel(exam.subject)} · ${exam.grade || "—"}` })
    ]),
    el("span", { class: `badge badge-${status}`, text: t("status." + status) })
  ]));
  const meta = el("div", { class: "exam-card-meta" });
  const qCount = (exam.questions?.length || 0);
  meta.appendChild(el("span", {}, [svgIcon("file-text", 14), document.createTextNode(`${qCount} Q`)]));
  meta.appendChild(el("span", {}, [svgIcon("timer", 14), document.createTextNode(`${exam.duration || 0} min`)]));
  card.appendChild(meta);
  card.appendChild(el("div", { class: "exam-card-foot" }, [
    el("button", { class: "btn btn-primary btn-sm", type: "button", text: t("action.open") })
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
  const empty = $("[data-exams-empty]");
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
    title: "",
    subject: "",
    grade: "",
    duration: 60,
    startAt: null,
    endAt: null,
    displayMode: "scroll",
    shuffleQuestions: false,
    requireAccessCode: false,
    accessCode: "",
    requireFullscreen: false,
    forms: [{ id: "A", name: "Form A", questions: [] }]
  }
};

async function renderBuilder(params) {
  const examId = params?.get("id");
  if (examId) {
    const exam = await getExam(examId);
    if (exam && exam.ownerId === currentProfile.uid) {
      builderState.examId = examId;

      // Load answers separately (only teacher has read access)
      const answersMap = await getExamAnswers(examId);

      // Merge questions with answers for editing
      const mergedForms = (exam.forms && exam.forms.length ? exam.forms : [{ id: "A", name: "Form A", questions: exam.questions || [] }]).map((form) => ({
        ...form,
        questions: (form.questions || []).map((q) => {
          const ans = answersMap[q.id] || {};
          return {
            ...q,
            correctIndex: ans.correctIndex ?? 0,
            correctBool: ans.correctBool ?? null,
            correctText: ans.correctText || "",
            modelAnswer: ans.modelAnswer || ""
          };
        })
      }));

      builderState.data = {
        ...builderState.data,
        ...exam,
        forms: mergedForms
      };
      builderState.currentFormIndex = 0;
    }
  } else {
    builderState.examId = null;
    builderState.currentFormIndex = 0;
    builderState.data = {
      title: "",
      subject: "",
      grade: "",
      duration: 60,
      startAt: null,
      endAt: null,
      displayMode: "scroll",
      shuffleQuestions: false,
      requireAccessCode: false,
      accessCode: "",
      requireFullscreen: false,
      forms: [{ id: "A", name: "Form A", questions: [] }]
    };
  }
  renderBuilderUI();
  initBuilderEvents();
}

function renderBuilderUI() {
  const d = builderState.data;

  // Info fields
  const setVal = (sel, v) => { const e = $(sel); if (e) e.value = v ?? ""; };
  setVal("#examTitle", d.title);
  setVal("#examGrade", d.grade);
  setVal("#examDuration", d.duration || 60);
  setVal("#examAccessCode", d.accessCode);
  setVal("#examStart", toLocalInput(d.startAt));
  setVal("#examEnd", toLocalInput(d.endAt));

  // Subject dropdown — only teacher's subjects
  const subjSel = $("#examSubject");
  if (subjSel) {
    subjSel.innerHTML = `<option value="">${t("builder.info.selectSubject")}</option>`;
    (currentProfile?.subjects || []).forEach((sid) => {
      const label = sid.startsWith("custom:") ? sid.slice(7) : subjectLabel(sid);
      const opt = el("option", { value: sid, text: label });
      subjSel.appendChild(opt);
    });
    subjSel.value = d.subject || "";
  }

  // Display mode
  $$('[data-field="displayMode"]').forEach((radio) => {
    radio.checked = radio.value === (d.displayMode || "scroll");
    const card = radio.closest(".mode-card");
    if (card) card.classList.toggle("is-selected", radio.checked);
  });

  // Checkboxes
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
  if (title) title.textContent = builderState.data.title || t("builder.newExam");
  const statusEl = $("[data-builder-status]");
  if (statusEl) {
    const st = builderState.data.status || "draft";
    statusEl.textContent = t("status." + st);
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

  $$(".builder-panel").forEach((p) => {
    p.hidden = p.dataset.panel !== step;
  });

  const backBtn = $("[data-builder-back]");
  const nextBtn = $("[data-builder-next]");
  const publishBtn = $("[data-builder-publish]");
  const indicator = $("[data-builder-step-indicator]");

  if (backBtn) backBtn.disabled = idx === 0;
  if (nextBtn) nextBtn.hidden = idx === BUILDER_STEPS.length - 1;
  if (publishBtn) publishBtn.hidden = idx !== BUILDER_STEPS.length - 1;
  if (indicator) {
    indicator.innerHTML = `${t("builder.step")} ${idx + 1} / ${BUILDER_STEPS.length}`;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateBuilderTotalScore() {
  const total = getAllBuilderQuestions().reduce((s, q) => s + (Number(q.score) || 0), 0);
  const el = $("[data-total-score]");
  if (el) el.textContent = String(total);
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
      el("p", { class: "text-muted", text: currentLang === "ar" ? "لا توجد أسئلة بعد." : "No questions yet." })
    ]));
    return;
  }

  questions.forEach((q, idx) => host.appendChild(buildQuestionCard(q, idx)));
}

function buildQuestionCard(q, idx) {
  const card = el("div", { class: "question-card" });

  // Header
  const head = el("div", { class: "question-card-head" });
  const numWrap = el("div", { class: "question-card-num" });
  numWrap.appendChild(el("span", { text: String(idx + 1) }));
  numWrap.appendChild(el("span", { class: "question-type-badge", text: qTypeLabel(q.type) }));
  head.appendChild(numWrap);

  const actions = el("div", { class: "question-card-actions" });
  const dup = el("button", { class: "icon-btn", type: "button", title: "Duplicate" });
  dup.appendChild(svgIcon("duplicate", 16));
  dup.addEventListener("click", () => duplicateQuestion(idx));
  actions.appendChild(dup);

  const del = el("button", { class: "icon-btn", type: "button", title: "Delete" });
  del.appendChild(svgIcon("trash", 16));
  del.addEventListener("click", () => deleteQuestion(idx));
  actions.appendChild(del);

  head.appendChild(actions);
  card.appendChild(head);

  // Body
  const body = el("div", { class: "question-body" });

  const ta = el("textarea", { class: "textarea" });
  ta.placeholder = t("question.text");
  ta.value = q.text || "";
  ta.addEventListener("input", () => { q.text = ta.value; markDirty(); });
  body.appendChild(ta);

  // Image upload
  const imgField = el("div", { class: "field" });
  const imgRow = el("div", { class: "row" });
  const fileInput = el("input", { type: "file", accept: "image/*", hidden: "hidden" });
  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      toast(currentLang === "ar" ? "جارٍ الرفع…" : "Uploading…", "info", 2000);
      const url = await uploadQuestionImage(builderState.examId, f);
      q.imageUrl = url;
      renderBuilderQuestions();
      markDirty();
    } catch (err) {
      console.error(err);
      toast(currentLang === "ar" ? "تعذّر رفع الصورة" : "Upload failed", "error");
    }
  });
  const uploadBtn = el("button", { class: "btn btn-outline btn-sm", type: "button" });
  uploadBtn.appendChild(svgIcon("image", 14));
  uploadBtn.appendChild(document.createTextNode(" " + (currentLang === "ar" ? "صورة" : "Image")));
  uploadBtn.addEventListener("click", () => fileInput.click());
  imgRow.appendChild(uploadBtn);
  if (q.imageUrl) {
    const preview = el("img", { src: q.imageUrl, style: "max-width:120px;border-radius:8px;border:1px solid var(--border-subtle)" });
    imgRow.appendChild(preview);
    const rm = el("button", { class: "icon-btn", type: "button" });
    rm.appendChild(svgIcon("x", 14));
    rm.addEventListener("click", () => { q.imageUrl = null; renderBuilderQuestions(); markDirty(); });
    imgRow.appendChild(rm);
  }
  imgRow.appendChild(fileInput);
  imgField.appendChild(imgRow);
  body.appendChild(imgField);

  // Type-specific fields
  if (q.type === "mcq" || q.type === "mcq_just") {
    const opts = el("div", { class: "question-options" });
    (q.options || []).forEach((opt, i) => {
      const row = el("div", { class: "option-row" });

      const radio = el("input", { type: "radio", name: "correct_" + q.id });
      radio.checked = q.correctIndex === i;
      radio.addEventListener("change", () => { q.correctIndex = i; markDirty(); });
      row.appendChild(radio);

      row.appendChild(el("span", { class: "option-label", text: String.fromCharCode(65 + i) }));

      const inp = el("input", { type: "text", class: "input", value: opt || "" });
      inp.placeholder = t("question.option") + " " + String.fromCharCode(65 + i);
      inp.addEventListener("input", () => { q.options[i] = inp.value; markDirty(); });
      row.appendChild(inp);

      const delBtn = el("button", { class: "icon-btn", type: "button" });
      delBtn.appendChild(svgIcon("x", 14));
      delBtn.addEventListener("click", () => {
        q.options.splice(i, 1);
        if (q.correctIndex === i) q.correctIndex = 0;
        else if (q.correctIndex > i) q.correctIndex--;
        renderBuilderQuestions();
        markDirty();
      });
      row.appendChild(delBtn);

      opts.appendChild(row);
    });

    if ((q.options?.length || 0) < 8) {
      const addBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button" });
      addBtn.appendChild(svgIcon("plus", 14));
      addBtn.appendChild(document.createTextNode(" " + t("question.addOption")));
      addBtn.addEventListener("click", () => {
        q.options = q.options || [];
        q.options.push("");
        renderBuilderQuestions();
        markDirty();
      });
      opts.appendChild(addBtn);
    }
    body.appendChild(opts);
  }

  if (q.type === "tf" || q.type === "tf_just") {
    const wrap = el("div", { class: "question-options" });
    [{ v: true, l: t("question.true") }, { v: false, l: t("question.false") }].forEach(({ v, l }) => {
      const row = el("div", { class: "option-row" });
      const radio = el("input", { type: "radio", name: "tf_" + q.id });
      radio.checked = q.correctBool === v;
      radio.addEventListener("change", () => { q.correctBool = v; markDirty(); });
      row.appendChild(radio);
      row.appendChild(el("span", { text: l }));
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
  }

  if (q.type === "complete") {
    const f = el("div", { class: "field" });
    f.appendChild(el("label", { class: "field-label", text: t("question.correct") }));
    const inp = el("input", { type: "text", class: "input", value: q.correctText || "" });
    inp.addEventListener("input", () => { q.correctText = inp.value; markDirty(); });
    f.appendChild(inp);
    body.appendChild(f);
  }

  if (q.type === "essay") {
    const f = el("div", { class: "field" });
    f.appendChild(el("label", { class: "field-label", text: t("question.model") }));
    const txt = el("textarea", { class: "textarea" });
    txt.value = q.modelAnswer || "";
    txt.addEventListener("input", () => { q.modelAnswer = txt.value; markDirty(); });
    f.appendChild(txt);
    body.appendChild(f);
  }

  // Score
  const scoreF = el("div", { class: "field" });
  scoreF.appendChild(el("label", { class: "field-label", text: t("question.score") }));
  const scoreInp = el("input", {
    type: "number", class: "input",
    min: "0.5", step: "0.5", value: q.score || 1,
    style: "max-width:120px"
  });
  scoreInp.addEventListener("input", () => {
    q.score = Number(scoreInp.value) || 0;
    updateBuilderTotalScore();
    markDirty();
  });
  scoreF.appendChild(scoreInp);
  body.appendChild(scoreF);

  card.appendChild(body);
  return card;
}

function qTypeLabel(type) {
  return {
    mcq: "MCQ",
    mcq_just: "MCQ + Justify",
    tf: "True/False",
    tf_just: "T/F + Justify",
    complete: "Complete",
    essay: "Essay"
  }[type] || type;
}

function addQuestion(type) {
  const q = {
    id: uid(10),
    type,
    text: "",
    options: (type === "mcq" || type === "mcq_just") ? ["", "", "", ""] : [],
    correctIndex: 0,
    correctBool: type === "tf" || type === "tf_just" ? null : null,
    correctText: "",
    modelAnswer: "",
    imageUrl: null,
    score: 1
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
    { type: "mcq", title: "Multiple Choice", hint: "One correct answer" },
    { type: "mcq_just", title: "MCQ + Justification", hint: "Choice + written justification" },
    { type: "tf", title: "True / False", hint: "Boolean statement" },
    { type: "tf_just", title: "True / False + Justification", hint: "Boolean + written justification" },
    { type: "complete", title: "Complete", hint: "Fill in the blank" },
    { type: "essay", title: "Essay", hint: "Long-form manual graded" }
  ];

  const body = el("div", { class: "stack-sm" });
  types.forEach((tt) => {
    const btn = el("button", { type: "button", class: "card", style: "text-align:left;cursor:pointer;padding:var(--sp-4)" });
    btn.appendChild(el("div", { class: "fw-semibold", text: tt.title }));
    btn.appendChild(el("div", { class: "text-sm text-muted mt-1", text: tt.hint }));
    btn.addEventListener("click", () => {
      addQuestion(tt.type);
      document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
    });
    body.appendChild(btn);
  });

  openModal({
    title: currentLang === "ar" ? "اختر نوع السؤال" : "Choose question type",
    body,
    actions: [{ label: t("action.cancel"), class: "btn-ghost" }]
  });
}

/* Forms */
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
  const nextLetter = letters.find((l) => !usedLetters.includes(l)) || "X" + uid(3);
  const newForm = { id: nextLetter, name: `Form ${nextLetter}`, questions: [] };
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

/* Dirty / Autosave */
function markDirty() {
  const state = $("[data-builder-save-state]");
  if (state) state.textContent = t("common.saving");
  autosaveBuilder();
}

const autosaveBuilder = debounce(async () => {
  if (!currentProfile) return;
  const d = builderState.data;
  if (!d.title.trim()) return;

  // Separate questions and answers
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
      const a = {};
      if (q.type === "mcq" || q.type === "mcq_just") a.correctIndex = q.correctIndex;
      else if (q.type === "tf" || q.type === "tf_just") a.correctBool = q.correctBool;
      else if (q.type === "complete") a.correctText = q.correctText || "";
      else if (q.type === "essay") a.modelAnswer = q.modelAnswer || "";
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
    startAt: d.startAt || null,
    endAt: d.endAt || null,
    displayMode: d.displayMode || "scroll",
    shuffleQuestions: !!d.shuffleQuestions,
    requireAccessCode: !!d.requireAccessCode,
    accessCode: d.requireAccessCode ? (d.accessCode || "") : "",
    requireFullscreen: !!d.requireFullscreen,
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
      await setDoc(doc(db, "examAnswers", builderState.examId), {
        ownerId: currentProfile.uid,
        examId: builderState.examId,
        answers: answerKey,
        updatedAt: serverTimestamp()
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
    const state = $("[data-builder-save-state]");
    if (state) state.textContent = t("common.saved");
  } catch (err) {
    console.error("[autosave]", err);
    const state = $("[data-builder-save-state]");
    if (state) state.textContent = t("common.saveFailed");
  }
}, 1200);

async function publishExam() {
  const d = builderState.data;
  const errors = [];
  if (!d.title.trim()) errors.push(currentLang === "ar" ? "اسم الامتحان مطلوب" : "Exam name is required");
  if (!d.subject) errors.push(currentLang === "ar" ? "المادة مطلوبة" : "Subject is required");
  if (!d.grade) errors.push(currentLang === "ar" ? "الصف مطلوب" : "Grade is required");
  const totalQ = getAllBuilderQuestions().length;
  if (!totalQ) errors.push(currentLang === "ar" ? "أضف سؤالاً واحدًا على الأقل" : "Add at least one question");

  if (errors.length) {
    openModal({
      title: `${errors.length} ${currentLang === "ar" ? "مشكلة" : errors.length > 1 ? "issues" : "issue"}`,
      body: el("ul", { style: "padding-inline-start:20px;line-height:1.9" }, errors.map((e) => el("li", { text: e }))),
      actions: [{ label: "OK", class: "btn-primary" }]
    });
    return;
  }

  const summary = el("div", { class: "stack-sm" });
  [
    [currentLang === "ar" ? "الاسم" : "Title", d.title],
    [currentLang === "ar" ? "الأسئلة" : "Questions", String(totalQ)],
    [currentLang === "ar" ? "النماذج" : "Forms", String(d.forms.length)],
    [currentLang === "ar" ? "المدة" : "Duration", `${d.duration} ${currentLang === "ar" ? "دقيقة" : "min"}`]
  ].forEach(([k, v]) => {
    summary.appendChild(el("div", { class: "row-between" }, [
      el("span", { text: k }),
      el("strong", { text: v })
    ]));
  });

  openModal({
    title: currentLang === "ar" ? "نشر الامتحان؟" : "Publish exam?",
    body: summary,
    actions: [
      { label: t("action.cancel"), class: "btn-ghost" },
      { label: t("action.publish"), class: "btn-primary", onClick: async () => {
        try {
          await autosaveBuilder();
          await new Promise((r) => setTimeout(r, 200));
          if (!builderState.examId) throw new Error("no exam");
          await updateDoc(doc(db, "exams", builderState.examId), {
            status: "scheduled",
            publishedAt: serverTimestamp()
          });
          toast(currentLang === "ar" ? "تم نشر الامتحان" : "Exam published", "success");
          navigate(`/app/exam?id=${builderState.examId}`);
        } catch (err) {
          console.error(err);
          toast(currentLang === "ar" ? "فشل النشر" : "Publish failed", "error");
        }
      }}
    ]
  });
}

/* Builder events */
function initBuilderEvents() {
  const container = $('[data-page="app"]');
  if (!container || container.dataset.builderBound) return;
  container.dataset.builderBound = "1";

  container.addEventListener("click", (e) => {
    // Step buttons
    const stepBtn = e.target.closest(".builder-step");
    if (stepBtn) { switchBuilderStep(stepBtn.dataset.step); return; }

    // Back button
    if (e.target.closest("[data-builder-back]")) {
      const idx = BUILDER_STEPS.indexOf(builderState.currentStep);
      if (idx > 0) switchBuilderStep(BUILDER_STEPS[idx - 1]);
      return;
    }

    // Next button
    if (e.target.closest("[data-builder-next]")) {
      const idx = BUILDER_STEPS.indexOf(builderState.currentStep);
      if (idx < BUILDER_STEPS.length - 1) {
        // Validate current step
        if (builderState.currentStep === "info") {
          const d = builderState.data;
          if (!d.title.trim()) { toast(currentLang === "ar" ? "أدخل اسم الامتحان" : "Please enter exam name", "warning"); return; }
          if (!d.subject) { toast(currentLang === "ar" ? "اختر المادة" : "Please select subject", "warning"); return; }
          if (!d.grade) { toast(currentLang === "ar" ? "اختر الصف" : "Please select grade", "warning"); return; }
        }
        if (builderState.currentStep === "questions" && !getAllBuilderQuestions().length) {
          toast(currentLang === "ar" ? "أضف سؤالاً واحدًا على الأقل" : "Add at least one question", "warning");
          return;
        }
        switchBuilderStep(BUILDER_STEPS[idx + 1]);
      }
      return;
    }

    // Save
    if (e.target.closest("[data-builder-save]")) {
      autosaveBuilder();
      toast(t("common.saved"), "success");
      return;
    }

    // Publish
    if (e.target.closest("[data-builder-publish]")) { publishExam(); return; }

    // Cancel
    if (e.target.closest("[data-builder-cancel]")) { navigate("/app/exams"); return; }

    // Preview
    if (e.target.closest("[data-builder-preview]")) {
      if (!builderState.examId) { toast(currentLang === "ar" ? "احفظ أولاً" : "Save first", "warning"); return; }
      window.open(location.pathname + `#/exam?id=${builderState.examId}&preview=1`, "_blank");
      return;
    }

    // Add question
    if (e.target.closest("[data-add-question]") || e.target.closest("[data-add-form-question]")) {
      showQuestionTypeModal();
      return;
    }

    // Add form
    if (e.target.closest("[data-add-form]")) { addForm(); return; }
  });

  // Field inputs
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

  // Checkboxes / radios
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
      if (f === "requireAccessCode") {
        // Just mark dirty
      }
    }
    markDirty();
  });
}

/* ============================================================
   EXAM DETAILS (Teacher)
   ============================================================ */
async function renderExamDetails(params) {
  const examId = params?.get("id");
  const host = $("[data-exam-details]");
  if (!host) return;
  if (!examId) { navigate("/app/exams"); return; }
  host.innerHTML = "";
  host.appendChild(el("div", { class: "sk-card" }, [el("div", { class: "skeleton sk-line sk-lg" })]));

  const exam = await getExam(examId);
  if (!exam || exam.ownerId !== currentProfile.uid) {
    host.innerHTML = "";
    host.appendChild(el("div", { class: "empty" }, [el("p", { text: t("common.notFound") })]));
    return;
  }

  const attempts = await listAttempts(examId);
  const status = computeStatus(exam);

  host.innerHTML = "";

  const head = el("div", { class: "exam-details-head" });
  const left = el("div", {});
  left.appendChild(el("h2", { class: "exam-details-title", text: exam.title || "Untitled" }));
  left.appendChild(el("div", {
    class: "exam-details-meta",
    text: `${subjectLabel(exam.subject)} · ${exam.grade || "—"} · ${exam.totalQuestions || 0} Q · ${exam.duration || 0} min`
  }));
  head.appendChild(left);

  const actions = el("div", { class: "row" });
  actions.appendChild(el("span", { class: `badge badge-${status}`, text: t("status." + status) }));

  const editBtn = el("button", { class: "btn btn-outline btn-sm", type: "button", text: t("action.edit") });
  editBtn.addEventListener("click", () => navigate(`/app/builder?id=${examId}`));
  actions.appendChild(editBtn);

  const shareBtn = el("button", { class: "btn btn-outline btn-sm", type: "button", text: t("action.share") });
  shareBtn.addEventListener("click", () => shareExam(exam));
  actions.appendChild(shareBtn);

  head.appendChild(actions);
  host.appendChild(head);

  // Tabs
  const tabs = el("div", { class: "exam-tabs" });
  ["students", "questions", "grading"].forEach((name, i) => {
    const label = name === "grading" ? t("action.grade") : name === "students" ? t("common.student") : t("builder.questions.title");
    const tab = el("button", { class: "exam-tab", type: "button", "data-tab": name, text: label });
    tabs.appendChild(tab);
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

function renderStudentsTab(host, exam, attempts) {
  if (!attempts.length) {
    host.appendChild(el("div", { class: "empty" }, [
      el("h3", { text: currentLang === "ar" ? "لا يوجد طلاب بعد" : "No submissions yet" }),
      el("p", { text: currentLang === "ar" ? "شارك رابط الامتحان للبدء." : "Share the exam link to get started." })
    ]));
    return;
  }
  const wrap = el("div", { class: "card" });
  const table = el("table", { class: "students-table" });
  table.innerHTML = `<thead><tr>
    <th>${t("common.student")}</th>
    <th>${t("common.status")}</th>
    <th>${t("common.started")}</th>
    <th>${t("common.submitted")}</th>
    <th>${t("common.score")}</th>
  </tr></thead>`;
  const tbody = el("tbody");
  const totalPossible = exam.totalScore || 0;

  attempts.forEach((a) => {
    const tr = el("tr", { style: "cursor:pointer" });
    tr.appendChild(el("td", { text: a.studentName || "—" }));
    tr.appendChild(el("td", {}, [el("span", { class: `badge badge-${a.status || "draft"}`, text: t("status." + (a.status || "draft")) })]));
    tr.appendChild(el("td", { text: fmtDate(a.startedAt) }));
    tr.appendChild(el("td", { text: a.submittedAt ? fmtDate(a.submittedAt) : "—" }));
    tr.appendChild(el("td", { text: a.score != null ? `${a.score} / ${totalPossible}` : "—" }));
    tr.addEventListener("click", () => navigate(`/app/grading?exam=${exam.id}&attempt=${a.id}`));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  host.appendChild(wrap);
}

function renderQuestionsTab(host, exam) {
  const forms = exam.forms && exam.forms.length ? exam.forms : [{ id: "A", name: "Form A", questions: exam.questions || [] }];
  const wrap = el("div", { class: "stack" });
  forms.forEach((form) => {
    const block = el("div", { class: "card" });
    block.appendChild(el("h3", { class: "builder-panel-title", text: `${form.name} — ${(form.questions || []).length} ${t("common.questions")}` }));
    (form.questions || []).forEach((q, i) => {
      const row = el("div", { class: "grading-card mt-3" });
      row.appendChild(el("div", { class: "row-between mb-2" }, [
        el("span", { class: "fw-semibold", text: `Q${i + 1} · ${qTypeLabel(q.type)}` }),
        el("span", { class: "badge badge-draft", text: `${q.score} ${t("common.points")}` })
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
    host.appendChild(el("div", { class: "empty" }, [
      el("p", { text: currentLang === "ar" ? "لا يوجد ما ينتظر التصحيح." : "Nothing waiting for grading." })
    ]));
    return;
  }
  const wrap = el("div", { class: "stack" });
  pending.forEach((a) => {
    const row = el("div", { class: "card row-between" });
    const info = el("div", {});
    info.appendChild(el("div", { class: "fw-semibold", text: a.studentName }));
    info.appendChild(el("div", { class: "text-sm text-muted", text: fmtDate(a.submittedAt) }));
    row.appendChild(info);

    const btn = el("button", { class: "btn btn-primary btn-sm", type: "button", text: t("action.grade") });
    btn.addEventListener("click", () => navigate(`/app/grading?exam=${exam.id}&attempt=${a.id}`));
    row.appendChild(btn);
    wrap.appendChild(row);
  });
  host.appendChild(wrap);
}

/* ============================================================
   AUTO-GRADE (in teacher's browser)
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

    const percentage = totalPossible ? Math.round((autoScore / totalPossible) * 100) : 0;

    try {
      await updateDoc(doc(db, "attempts", attempt.id), {
        autoScore,
        perQuestionScores: perQ,
        score: autoScore,
        percentage,
        totalPossible,
        gradedAt: serverTimestamp(),
        gradedBy: currentProfile.uid,
        status: "graded"
      });
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

function shareExam(exam) {
  const url = `${location.origin}${location.pathname}#/exam?id=${exam.id}`;
  const body = el("div", { class: "stack" });
  const f = el("div", { class: "field" });
  f.appendChild(el("label", { class: "field-label", text: currentLang === "ar" ? "رابط الامتحان" : "Exam link" }));
  const row = el("div", { class: "row" });
  const inp = el("input", { class: "input flex-1", type: "text", readonly: "readonly", value: url });
  row.appendChild(inp);
  const copyBtn = el("button", { class: "btn btn-outline btn-sm", type: "button", text: "Copy" });
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(url);
    toast("Copied", "success");
  });
  row.appendChild(copyBtn);
  f.appendChild(row);
  body.appendChild(f);

  openModal({
    title: currentLang === "ar" ? "شارك الامتحان" : "Share exam",
    body,
    actions: [{ label: currentLang === "ar" ? "إغلاق" : "Close", class: "btn-primary" }]
  });
}

/* ============================================================
   GRADING (Teacher)
   ============================================================ */
async function renderGrading(params) {
  const examId = params?.get("exam");
  const attemptId = params?.get("attempt");
  const host = $("[data-grading-host]");
  if (!host) return;
  host.innerHTML = "";

  if (!examId || !attemptId) {
    host.appendChild(el("div", { class: "empty" }, [el("p", { text: "Missing info." })]));
    return;
  }

  const exam = await getExam(examId);
  const aSnap = await getDoc(doc(db, "attempts", attemptId));
  if (!exam || !aSnap.exists()) {
    host.appendChild(el("div", { class: "empty" }, [el("p", { text: t("common.notFound") })]));
    return;
  }

  const answersMap = await getExamAnswers(examId);
  const attempt = { id: attemptId, ...aSnap.data() };
  const allQuestions = getAllExamQuestions(exam);
  const answers = attempt.answers || {};
  const manualScores = { ...(attempt.manualScores || {}) };
  const feedback = { ...(attempt.feedback || {}) };
  const totalPossible = allQuestions.reduce((s, q) => s + (Number(q.score) || 0), 0);

  const head = el("div", { class: "card grading-student-head" });
  const info = el("div", {});
  info.appendChild(el("h2", { text: attempt.studentName || "Student" }));
  info.appendChild(el("p", { class: "text-muted text-sm", text: fmtDate(attempt.submittedAt) }));
  head.appendChild(info);

  const headActions = el("div", { class: "row" });
  headActions.appendChild(el("span", { class: `badge badge-${attempt.status || "draft"}`, text: t("status." + (attempt.status || "draft")) }));
  const backBtn = el("button", { class: "btn btn-ghost btn-sm", type: "button", text: t("action.back") });
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
    card.appendChild(el("div", { class: "grading-question", text: `Q${i + 1} · ${q.text}` }));

    // Student answer
    const ansBlock = el("div", { class: "grading-answer-block" });
    ansBlock.appendChild(el("strong", { text: currentLang === "ar" ? "إجابة الطالب" : "Student answer" }));

    let ansText = "—";
    if (q.type === "mcq" || q.type === "mcq_just") ansText = q.options?.[a.selectedIndex] || "—";
    else if (q.type === "tf" || q.type === "tf_just") ansText = a.boolValue === true ? t("question.true") : a.boolValue === false ? t("question.false") : "—";
    else if (q.type === "complete") ansText = a.textValue || "—";
    else if (q.type === "essay") ansText = a.essayText || "—";
    ansBlock.appendChild(el("div", { text: ansText, style: "white-space:pre-wrap" }));

    if (a.justification) {
      ansBlock.appendChild(el("div", { class: "mt-2", style: "white-space:pre-wrap" }, [
        el("strong", { text: currentLang === "ar" ? "التبرير" : "Justification" }),
        el("div", { text: a.justification })
      ]));
    }
    card.appendChild(ansBlock);

    // Correct answer (from examAnswers)
    if (q.type !== "essay") {
      const corBlock = el("div", { class: "grading-answer-block" });
      corBlock.appendChild(el("strong", { text: currentLang === "ar" ? "الإجابة الصحيحة" : "Correct answer" }));
      let correctText = "—";
      if (q.type === "mcq" || q.type === "mcq_just") correctText = q.options?.[key.correctIndex] || "—";
      else if (q.type === "tf" || q.type === "tf_just") correctText = key.correctBool ? t("question.true") : t("question.false");
      else if (q.type === "complete") correctText = key.correctText || "—";
      corBlock.appendChild(el("div", { class: "grading-correct-answer", text: correctText }));
      card.appendChild(corBlock);
    }

    if (q.type === "essay" && key.modelAnswer) {
      const modelBlock = el("div", { class: "grading-answer-block" });
      modelBlock.appendChild(el("strong", { text: currentLang === "ar" ? "الإجابة النموذجية" : "Model answer" }));
      modelBlock.appendChild(el("div", { style: "white-space:pre-wrap", text: key.modelAnswer }));
      card.appendChild(modelBlock);
    }

    if (isManual) {
      const scoreRow = el("div", { class: "grading-score-row" });
      scoreRow.appendChild(el("span", { class: "text-sm fw-semibold", text: t("question.score") + ":" }));
      const num = el("input", { type: "number", class: "input", min: "0", max: String(q.score || 1), step: "0.5" });
      num.value = manualScores[q.id] ?? 0;
      num.addEventListener("input", () => { manualScores[q.id] = Number(num.value) || 0; });
      scoreRow.appendChild(num);
      scoreRow.appendChild(el("span", { class: "text-sm text-muted", text: `/ ${q.score || 1}` }));
      card.appendChild(scoreRow);

      const fbField = el("div", { class: "field mt-3" });
      fbField.appendChild(el("label", { class: "field-label", text: currentLang === "ar" ? "ملاحظة" : "Feedback" }));
      const fbInput = el("input", { type: "text", class: "input", value: feedback[q.id] || "" });
      fbInput.addEventListener("input", () => { feedback[q.id] = fbInput.value; });
      fbField.appendChild(fbInput);
      card.appendChild(fbField);
    } else {
      const autoInfo = el("div", { class: "text-sm mt-2" });
      autoInfo.appendChild(el("span", { class: "text-muted", text: "Auto: " }));
      autoInfo.appendChild(el("strong", { text: `${a.autoScore || 0} / ${q.score || 1}` }));
      card.appendChild(autoInfo);
    }

    list.appendChild(card);
  });

  // Overall feedback
  const fbCard = el("div", { class: "card" });
  fbCard.appendChild(el("label", { class: "field-label mb-2", text: currentLang === "ar" ? "ملاحظات عامة" : "Overall feedback" }));
  const fbTa = el("textarea", { class: "textarea" });
  fbTa.value = attempt.examFeedback || "";
  fbCard.appendChild(fbTa);
  host.appendChild(fbCard);

  function computeFinalScore() {
    let total = 0;
    allQuestions.forEach((q) => {
      const a = answers[q.id] || {};
      if (["essay", "mcq_just", "tf_just"].includes(q.type)) total += Number(manualScores[q.id] || 0);
      else total += Number(a.autoScore || 0);
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
  totalInfo.appendChild(el("div", { class: "text-sm text-muted", text: t("common.totalPossible") }));
  totalInfo.appendChild(el("div", { class: "fw-bold text-lg", text: String(totalPossible) }));
  actions.appendChild(totalInfo);

  const actRow = el("div", { class: "row" });
  const saveBtn = el("button", { class: "btn btn-outline", type: "button", text: t("common.saveGrading") });
  saveBtn.addEventListener("click", async () => {
    try { await saveGrading(); toast(t("common.saved"), "success"); }
    catch (err) { console.error(err); toast(t("common.saveFailed"), "error"); }
  });
  actRow.appendChild(saveBtn);

  const publishBtn = el("button", { class: "btn btn-primary", type: "button", text: t("common.publishResult") });
  publishBtn.addEventListener("click", async () => {
    try {
      await saveGrading();
      await updateDoc(doc(db, "exams", examId), { resultPublishedAt: serverTimestamp() });
      toast(currentLang === "ar" ? "تم نشر النتيجة" : "Result published", "success");
      navigate(`/app/exam?id=${examId}`);
    } catch (err) { console.error(err); toast("Publish failed", "error"); }
  });
  actRow.appendChild(publishBtn);
  actions.appendChild(actRow);
  host.appendChild(actions);
}

/* ============================================================
   PROFILE / SETTINGS / PACKAGES
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
  $$("[data-setting-lang]").forEach((r) => {
    r.checked = r.value === currentLang;
    if (!r.dataset.bound) {
      r.dataset.bound = "1";
      r.addEventListener("change", () => { if (r.checked) setLang(r.value); });
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

  if (!examId) {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = "Missing exam";
    $("[data-exam-error-message]").textContent = "No exam ID provided.";
    return;
  }

  let exam;
  try { exam = await getExam(examId); } catch (err) { console.error(err); }

  if (!exam) {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = t("common.notFound");
    $("[data-exam-error-message]").textContent = "This exam is unavailable.";
    return;
  }

  // Preview mode for teacher
  if (preview && currentUser && currentProfile?.uid === exam.ownerId) {
    loading.hidden = true;
    shell.hidden = false;
    startExamRuntime(exam, { preview: true });
    return;
  }

  const now = Date.now();
  const start = exam.startAt?.toMillis ? exam.startAt.toMillis() : null;
  const end = exam.endAt?.toMillis ? exam.endAt.toMillis() : null;
  if (start && now < start) {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = currentLang === "ar" ? "الامتحان لم يبدأ" : "Exam not started";
    $("[data-exam-error-message]").textContent = currentLang === "ar"
      ? `يفتح في ${fmtDate(exam.startAt)}`
      : `Opens at ${fmtDate(exam.startAt)}`;
    return;
  }
  if (end && now > end) {
    loading.hidden = true;
    errorBox.hidden = false;
    $("[data-exam-error-title]").textContent = currentLang === "ar" ? "الامتحان مغلق" : "Exam closed";
    $("[data-exam-error-message]").textContent = currentLang === "ar" ? "انتهى هذا الامتحان." : "This exam has ended.";
    return;
  }

  // Check existing attempt
  const existing = JSON.parse(localStorage.getItem(EXAM_STATE_KEY(examId)) || "null");
  if (existing && existing.attemptId) {
    try {
      const snap = await getDoc(doc(db, "attempts", existing.attemptId));
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === "submitted" || data.status === "graded") {
          sessionStorage.setItem("qeyasquiz.lastAttempt", existing.attemptId);
          loading.hidden = true;
          navigate("/result");
          return;
        }
        loading.hidden = true;
        showResumeModal(exam, existing);
        return;
      }
    } catch (err) { console.warn(err); }
    localStorage.removeItem(EXAM_STATE_KEY(examId));
  }

  loading.hidden = true;
  showEntryModal(exam);
}

function showEntryModal(exam) {
  const modal = $("[data-entry-modal]");
  const title = $("[data-entry-title]");
  const meta = $("[data-entry-meta]");
  const teacherBox = $("[data-entry-teacher]");
  const teacherAvatar = $("[data-entry-teacher-avatar]");
  const teacherName = $("[data-entry-teacher-name]");
  const nameInput = $("[data-entry-name]");
  const nameError = $("[data-entry-name-error]");
  const codeField = $("[data-entry-code-field]");
  const codeInput = $("[data-entry-code]");
  const codeError = $("[data-entry-code-error]");
  const form = $("[data-entry-form]");
  const submit = $("[data-entry-submit]");

  title.textContent = exam.title || "Exam";

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
    [t("common.subject"), subjectLabel(exam.subject)],
    [t("common.grade"), exam.grade || "—"],
    [t("common.duration"), `${exam.duration || 0} min`],
    [t("common.questions"), String(exam.totalQuestions || 0)]
  ].forEach(([k, v]) => {
    const item = el("div", { class: "entry-meta-item" });
    item.appendChild(el("span", { class: "entry-meta-label", text: k }));
    item.appendChild(el("span", { class: "entry-meta-value", text: v }));
    meta.appendChild(item);
  });

  codeField.hidden = !exam.requireAccessCode;

  // Restore saved name
  const savedName = localStorage.getItem("qeyasquiz.studentName") || "";
  nameInput.value = savedName;
  codeInput.value = "";
  nameError.hidden = true;
  codeError.hidden = true;

  modal.hidden = false;
  setTimeout(() => nameInput.focus(), 150);

  form.onsubmit = async (e) => {
    e.preventDefault();
    let ok = true;

    const name = nameInput.value.trim();
    if (name.length < 3) {
      nameError.hidden = false;
      nameError.textContent = currentLang === "ar" ? "أدخل اسمك الكامل (3 أحرف على الأقل)" : "Please enter your full name (min 3 characters).";
      ok = false;
    } else nameError.hidden = true;

    if (exam.requireAccessCode) {
      if (codeInput.value.trim() !== (exam.accessCode || "")) {
        codeError.hidden = false;
        codeError.textContent = currentLang === "ar" ? "كود غير صحيح" : "Invalid access code.";
        ok = false;
      } else codeError.hidden = true;
    }

    if (!ok) return;

    localStorage.setItem("qeyasquiz.studentName", name);
    submit.classList.add("is-loading");

    try {
      const attempt = await createAttempt(exam, name);
      modal.hidden = true;
      $("[data-exam-shell]").hidden = false;
      startExamRuntime(exam, { attempt });
    } catch (err) {
      console.error(err);
      submit.classList.remove("is-loading");
      toast(currentLang === "ar" ? "تعذّر بدء الامتحان" : "Could not start exam", "error");
    }
  };
}

async function createAttempt(exam, studentName) {
  const forms = exam.forms && exam.forms.length ? exam.forms : [{ id: "A", name: "Form A", questions: exam.questions || [] }];
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

  const payload = {
    examId: exam.id,
    formId: chosenForm.id,
    studentName,
    questionOrder: order,
    answers: {},
    manualScores: {},
    feedback: {},
    status: "in_progress",
    startedAt: serverTimestamp(),
    startedAtMs: nowMs,
    deadlineMs,
    anticheatEvents: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(collection(db, "attempts"), payload);
  localStorage.setItem(EXAM_STATE_KEY(exam.id), JSON.stringify({ attemptId: ref.id, examId: exam.id }));
  return { id: ref.id, ...payload, startedAtMs: nowMs, deadlineMs };
}

function showResumeModal(exam, existing) {
  const modal = $("[data-resume-modal]");
  modal.hidden = false;
  const btn = $("[data-resume-continue]");
  btn.onclick = async () => {
    modal.hidden = true;
    $("[data-exam-shell]").hidden = false;
    const snap = await getDoc(doc(db, "attempts", existing.attemptId));
    if (!snap.exists()) { navigate("/exam?id=" + exam.id); return; }
    startExamRuntime(exam, { attempt: { id: existing.attemptId, ...snap.data() } });
  };
}

/* ============================================================
   EXAM RUNTIME
   ============================================================ */
function startExamRuntime(exam, opts) {
  const { attempt, preview = false } = opts;

  const forms = exam.forms && exam.forms.length ? exam.forms : [{ id: "A", name: "Form A", questions: exam.questions || [] }];
  const form = forms.find((f) => f.id === attempt.formId) || forms[0];
  const questions = form.questions || [];

  const byId = {};
  questions.forEach((q) => (byId[q.id] = q));

  const orderedIds = preview
    ? questions.map((q) => q.id)
    : (attempt.questionOrder || questions.map((q) => q.id));

  const displayMode = exam.displayMode || "scroll";

  const state = {
    exam,
    attempt,
    preview,
    questions,
    byId,
    orderedIds,
    displayMode,
    index: 0,
    answers: preview ? {} : (attempt.answers || {}),
    deadlineMs: preview ? Date.now() + (exam.duration || 60) * 60000 : attempt.deadlineMs,
    timerInterval: null,
    autosaveInterval: null,
    heartbeatInterval: null,
    watcherUnsub: null,
    dirty: false,
    submitted: false,
    pendingExam: null
  };

  examRuntime = state;

  $("[data-watermark-teacher]").textContent = exam.teacherName || "";
  $("[data-exam-title]").textContent = exam.title || "Exam";
  $("[data-exam-meta]").textContent = `${subjectLabel(exam.subject)} · ${exam.grade || ""}`;

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
    const initialMs = exam.updatedAt?.toMillis?.() || (exam.updatedAt?.seconds * 1000) || 0;
    state.watcherUnsub = startExamRealtimeWatcher(exam.id, initialMs);
  }

  $("[data-exam-fullscreen]").onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  };

  $("[data-submit-exam]").onclick = () => confirmSubmit();

  const prevBtn = $("[data-prev]");
  const nextBtn = $("[data-next]");
  if (prevBtn) prevBtn.onclick = () => { if (state.index > 0) showSingleQuestion(state.index - 1); };
  if (nextBtn) nextBtn.onclick = () => { if (state.index < state.orderedIds.length - 1) showSingleQuestion(state.index + 1); };

  // Warn on unload
  window.addEventListener("beforeunload", (e) => {
    if (!state.submitted && !state.preview) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
  });
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
  if (q.imageUrl) wrap.appendChild(el("img", { class: "q-image", src: q.imageUrl, alt: "" }));

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
  if (q.imageUrl) wrap.appendChild(el("img", { class: "q-image", src: q.imageUrl, alt: "" }));

  const answers = { ...(s.answers[qid] || {}) };
  wrap.appendChild(buildQuestionInputs(q, answers, qid, () => {
    updateProgress();
  }));

  return wrap;
}

function buildQuestionHeader(q, index) {
  const s = examRuntime;
  const header = el("div", { class: "q-header" });
  const num = el("div", { class: "q-number" });
  num.appendChild(el("span", { class: "q-number-badge", text: String(index + 1) }));
  num.appendChild(el("span", { text: `/ ${s.orderedIds.length}` }));
  header.appendChild(num);
  header.appendChild(el("span", { class: "q-score", text: `${q.score || 1} ${t("common.points")}` }));
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
    [{ v: true, l: t("question.true") }, { v: false, l: t("question.false") }].forEach(({ v, l }) => {
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
    input.placeholder = currentLang === "ar" ? "اكتب إجابتك…" : "Type your answer…";
    input.value = answers.textValue || "";
    input.addEventListener("input", debounce(() => {
      answers.textValue = input.value;
      saveAnswer(qid, answers);
      onChange();
    }, 400));
    frag.appendChild(input);
  } else if (q.type === "essay") {
    const ta = el("textarea", { class: "q-essay-textarea" });
    ta.placeholder = currentLang === "ar" ? "اكتب إجابتك…" : "Write your answer…";
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
  label.appendChild(document.createTextNode(currentLang === "ar" ? "التبرير (تصحيح يدوي)" : "Justification (manual grading)"));
  box.appendChild(label);

  const ta = el("textarea", { class: "q-justification-textarea" });
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
  s.answers[qid] = answers;
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
      await updateDoc(doc(db, "attempts", s.attempt.id), {
        answers: s.answers,
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

/* ---- Anti-cheat ---- */
function startAnticheat() {
  const s = examRuntime;
  if (!s) return;

  const events = s.attempt.anticheatEvents = s.attempt.anticheatEvents || [];
  const banned = ["c", "v", "x", "a", "s", "u", "f", "j"];

  let lastLog = {};
  function logEvent(type) {
    if (s.submitted) return;
    const now = Date.now();
    if (lastLog[type] && now - lastLog[type] < 1000) return;
    lastLog[type] = now;
    events.push({ type, at: now });
    if (events.length > 200) events.shift();
    updateDoc(doc(db, "attempts", s.attempt.id), { anticheatEvents: events }).catch(() => {});
  }

  function securityAlert(titleKey, msgKey) {
    const modal = $("[data-security-modal]");
    if (!modal) return;
    $("[data-security-title]").textContent = t(titleKey);
    $("[data-security-message]").textContent = t(msgKey);
    modal.hidden = false;
    $("[data-security-ok]").onclick = () => { modal.hidden = true; };
  }

  document.addEventListener("copy", (e) => {
    if (!s.submitted && !s.preview) {
      e.preventDefault();
      try { e.clipboardData.setData("text/plain", ""); } catch {}
      logEvent("copy_attempt");
    }
  }, true);

  document.addEventListener("cut", (e) => {
    if (!s.submitted && !s.preview) {
      e.preventDefault();
      logEvent("cut_attempt");
    }
  }, true);

  document.addEventListener("paste", (e) => {
    if (!s.submitted && !s.preview) {
      const target = e.target;
      const allowed = target && (
        target.classList.contains("q-justification-textarea") ||
        target.classList.contains("q-essay-textarea") ||
        target.classList.contains("q-complete-input")
      );
      if (!allowed) {
        e.preventDefault();
        logEvent("paste_attempt");
      }
    }
  }, true);

  document.addEventListener("contextmenu", (e) => {
    if (!s.submitted && !s.preview) {
      e.preventDefault();
      logEvent("context_menu");
    }
  }, true);

  document.addEventListener("keydown", (e) => {
    if (s.submitted || s.preview) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && banned.includes(key)) {
      e.preventDefault();
      e.stopPropagation();
      logEvent("shortcut_" + key);
      return false;
    }
    if (ctrl && e.shiftKey && ["i", "j", "c"].includes(key)) {
      e.preventDefault();
      logEvent("devtools_shortcut");
      return false;
    }
    if (key === "f12") {
      e.preventDefault();
      logEvent("devtools_f12");
      return false;
    }
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      logEvent("tab_hidden");
      securityAlert("security.tabTitle", "security.tabHidden");
    } else {
      logEvent("tab_visible");
    }
  });

  window.addEventListener("blur", () => logEvent("window_blur"));
  window.addEventListener("focus", () => logEvent("window_focus"));

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && s.exam.requireFullscreen && !s.preview) {
      logEvent("fullscreen_exit");
      securityAlert("security.fsTitle", "security.fsExit");
    }
  });

  window.addEventListener("offline", () => {
    logEvent("offline");
    const b = $("[data-offline-banner]"); if (b) b.hidden = false;
    const i = $("[data-connection-indicator]"); if (i) i.classList.add("is-offline");
  });

  window.addEventListener("online", () => {
    logEvent("online");
    const b = $("[data-offline-banner]"); if (b) b.hidden = true;
    const i = $("[data-connection-indicator]"); if (i) i.classList.remove("is-offline");
  });

  // DevTools detection via viewport diff
  setInterval(() => {
    if (s.submitted) return;
    const wd = window.outerWidth - window.innerWidth;
    const hd = window.outerHeight - window.innerHeight;
    if (wd > 160 || hd > 160) logEvent("devtools_open");
  }, 5000);

  // Moving watermark
  startMovingWatermark();

  // Disable selection
  const h = $("[data-questions-host-scroll]");
  const h2 = $("[data-single-question-host]");
  [h, h2].forEach((x) => {
    if (x) {
      x.style.userSelect = "none";
      x.style.webkitUserSelect = "none";
    }
  });
}

function startMovingWatermark() {
  const wm = document.querySelector(".exam-watermark");
  if (!wm || wm.dataset.moving) return;
  wm.dataset.moving = "1";

  const s = examRuntime;
  if (!s) return;

  const t1 = wm.querySelector("[data-watermark-teacher]");
  const t2 = wm.querySelector("span:last-child");
  if (t1) t1.textContent = `${s.attempt.studentName || ""} · QeyasQuiz`;
  if (t2) t2.textContent = `QeyasQuiz · ${new Date().toLocaleDateString()}`;

  let lx = 0, ly = 0;
  setInterval(() => {
    let x, y;
    let tries = 0;
    do {
      x = Math.random() * 100 - 50;
      y = Math.random() * 100 - 50;
      tries++;
    } while (Math.abs(x - lx) < 30 && Math.abs(y - ly) < 30 && tries < 10);
    lx = x; ly = y;
    wm.style.transform = `translate(${x}px, ${y}px)`;
  }, 3000);
}

/* ---- Confirm Submit ---- */
function confirmSubmit() {
  const s = examRuntime;
  if (!s) return;

  const total = s.orderedIds.length;
  const answered = s.orderedIds.filter((qid) => isAnswered(s.answers[qid], s.byId[qid])).length;
  const unanswered = total - answered;

  if (unanswered > 0) {
    const firstUnansweredIdx = s.orderedIds.findIndex((qid) => !isAnswered(s.answers[qid], s.byId[qid]));

    openModal({
      title: `${t("exam.confirm.unanswered")} — ${unanswered}`,
      body: currentLang === "ar"
        ? `عندك ${unanswered} سؤال مش مجاوب عليه.`
        : `You have ${unanswered} unanswered question${unanswered > 1 ? "s" : ""}.`,
      actions: [
        { label: t("action.cancel"), class: "btn-ghost" },
        {
          label: t("exam.confirm.submitAnyway"),
          class: "btn-outline",
          onClick: () => actuallySubmit()
        },
        {
          label: t("exam.confirm.goToFirst"),
          class: "btn-primary",
          onClick: () => {
            if (s.displayMode === "single") {
              showSingleQuestion(firstUnansweredIdx);
            } else {
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
    title: t("exam.confirm.title"),
    body: t("exam.confirm.text"),
    actions: [
      { label: t("action.cancel"), class: "btn-ghost" },
      { label: t("action.submit"), class: "btn-primary", onClick: () => actuallySubmit() }
    ]
  });
}

async function actuallySubmit() {
  await performSubmit("manual");
}

async function autoSubmit(reason) {
  const s = examRuntime;
  if (!s || s.submitted) return;
  toast(t("exam.timeUp"), "warning");
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

  try {
    // Students DO NOT compute scores — teacher does.
    await updateDoc(doc(db, "attempts", s.attempt.id), {
      answers: s.answers,
      status: "submitted",
      submitKind: kind,
      submitReason: reason,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    sessionStorage.setItem("qeyasquiz.lastAttempt", s.attempt.id);
    localStorage.removeItem(EXAM_STATE_KEY(s.exam.id));
    navigate("/result");
  } catch (err) {
    console.error(err);
    s.submitted = false;
    toast(currentLang === "ar" ? "فشل التسليم. حاول مرة أخرى." : "Submission failed. Please retry.", "error");
  }
}

/* ============================================================
   REALTIME WATCHER
   ============================================================ */
function startExamRealtimeWatcher(examId, initialUpdatedAtMs) {
  const unsub = onSnapshot(doc(db, "exams", examId), (snap) => {
    if (!snap.exists()) return;
    const newExam = { id: snap.id, ...snap.data() };
    const newUpdatedMs = newExam.updatedAt?.toMillis?.() || (newExam.updatedAt?.seconds * 1000) || 0;
    const s = examRuntime;
    if (!s || s.submitted || s.preview) return;
    if (newUpdatedMs > initialUpdatedAtMs) {
      const structural = JSON.stringify(newExam.forms || newExam.questions || []) !==
                        JSON.stringify(s.exam.forms || s.exam.questions || []);
      if (structural) {
        s.pendingExam = newExam;
        const modal = $("[data-update-modal]");
        if (modal && modal.hidden) {
          modal.hidden = false;
          $("[data-update-refresh]").onclick = () => {
            modal.hidden = true;
            applyExamUpdate();
          };
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

  // Recompute current form questions
  const forms = newExam.forms && newExam.forms.length ? newExam.forms : [{ id: "A", name: "Form A", questions: newExam.questions || [] }];
  const form = forms.find((f) => f.id === s.attempt.formId) || forms[0];
  const newQuestions = form.questions || [];
  const byId = {};
  newQuestions.forEach((q) => (byId[q.id] = q));

  const preservedAnswers = { ...s.answers };
  const visible = {};
  const existingIds = new Set(newQuestions.map((q) => q.id));
  const kept = (s.orderedIds || []).filter((id) => existingIds.has(id));
  const newIds = newQuestions.map((q) => q.id).filter((id) => !kept.includes(id));
  s.orderedIds = [...kept, ...newIds];

  s.orderedIds.forEach((qid) => { if (preservedAnswers[qid]) visible[qid] = preservedAnswers[qid]; });
  s.answers = visible;
  s.questions = newQuestions;
  s.byId = byId;
  if (s.index >= s.orderedIds.length) s.index = Math.max(0, s.orderedIds.length - 1);

  $("[data-exam-title]").textContent = newExam.title || "Exam";
  $("[data-exam-meta]").textContent = `${subjectLabel(newExam.subject)} · ${newExam.grade || ""}`;

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
  toast(currentLang === "ar" ? "تم تحديث الامتحان" : "Exam updated", "info");
}

/* ============================================================
   RESULT
   ============================================================ */
async function renderResult() {
  const loading = $("[data-result-loading]");
  const main = $("[data-result-main]");
  const attemptId = sessionStorage.getItem("qeyasquiz.lastAttempt");

  if (!attemptId) {
    loading.hidden = true;
    main.hidden = false;
    $("[data-result-exam-title]").textContent = currentLang === "ar" ? "لا يوجد امتحان" : "No exam";
    return;
  }

  let attempt, exam;
  try {
    const aSnap = await getDoc(doc(db, "attempts", attemptId));
    if (!aSnap.exists()) throw new Error("no attempt");
    attempt = { id: attemptId, ...aSnap.data() };
    exam = await getExam(attempt.examId);
  } catch {
    loading.hidden = true;
    main.hidden = false;
    $("[data-result-exam-title]").textContent = t("common.notFound");
    return;
  }

  loading.hidden = true;
  main.hidden = false;

  const resultPublished = exam?.resultPublishedAt != null;
  $("[data-result-status]").textContent = t("status." + (attempt.status || "submitted"));
  $("[data-result-exam-title]").textContent = exam?.title || "Exam";
  $("[data-result-meta]").textContent = `${subjectLabel(exam?.subject)} · ${exam?.grade || ""} · ${attempt.studentName || ""}`;

  const scoreBlock = $("[data-score-block]");
  const waitingBlock = $("[data-waiting-block]");
  const feedbackBlock = $("[data-feedback-block]");
  const reviewHead = $("[data-review-head]");
  const reviewHost = $("[data-result-review]");

  const totalPossible = attempt.totalPossible || (exam?.totalScore || 0);

  if (resultPublished && attempt.score != null) {
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
  }

  if (resultPublished && exam) {
    const answersMap = await getExamAnswers(attempt.examId);
    const allQuestions = getAllExamQuestions(exam);

    reviewHead.hidden = false;
    reviewHost.innerHTML = "";

    allQuestions.forEach((q, i) => {
      const a = attempt.answers?.[q.id] || {};
      const key = answersMap[q.id] || {};
      const autoSc = Number(a.autoScore || 0);
      const manSc = Number((attempt.manualScores || {})[q.id] || 0);
      const got = ["essay", "mcq_just", "tf_just"].includes(q.type) ? manSc : autoSc;
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

      // Student answer
      let studentText = "—";
      if (q.type === "mcq" || q.type === "mcq_just") studentText = q.options?.[a.selectedIndex] || "—";
      else if (q.type === "tf" || q.type === "tf_just") studentText = a.boolValue === true ? t("question.true") : a.boolValue === false ? t("question.false") : "—";
      else if (q.type === "complete") studentText = a.textValue || "—";
      else if (q.type === "essay") studentText = a.essayText || "—";

      wrap.appendChild(el("div", { class: "review-answer is-wrong" }, [
        el("strong", { text: currentLang === "ar" ? "إجابتك" : "Your answer" }),
        el("div", { text: studentText, style: "white-space:pre-wrap" })
      ]));

      // Correct answer
      if (q.type !== "essay") {
        let correctText = "—";
        if (q.type === "mcq" || q.type === "mcq_just") correctText = q.options?.[key.correctIndex] || "—";
        else if (q.type === "tf" || q.type === "tf_just") correctText = key.correctBool ? t("question.true") : t("question.false");
        else if (q.type === "complete") correctText = key.correctText || "—";

        wrap.appendChild(el("div", { class: "review-answer is-correct" }, [
          el("strong", { text: currentLang === "ar" ? "الإجابة الصحيحة" : "Correct answer" }),
          el("div", { text: correctText, style: "white-space:pre-wrap" })
        ]));
      }

      if (q.type === "essay" && key.modelAnswer) {
        wrap.appendChild(el("div", { class: "review-answer is-correct" }, [
          el("strong", { text: currentLang === "ar" ? "الإجابة النموذجية" : "Model answer" }),
          el("div", { text: key.modelAnswer, style: "white-space:pre-wrap" })
        ]));
      }

      if (a.justification) {
        wrap.appendChild(el("div", { class: "review-answer" }, [
          el("strong", { text: currentLang === "ar" ? "تبريرك" : "Your justification" }),
          el("div", { text: a.justification, style: "white-space:pre-wrap" })
        ]));
      }

      card.appendChild(wrap);
      reviewHost.appendChild(card);
    });
  }
}

/* ============================================================
   ROUTE REGISTRATION
   ============================================================ */
onRoute("/", () => { initLanding(); });
onRoute("/login", () => { initLogin(); });
onRoute("/setup", () => { initSetup(); });
onRoute("/app/dashboard", async () => { await renderDashboard(); });
onRoute("/app/exams", async () => { await renderMyExams(); });
onRoute("/app/builder", async (p) => { await renderBuilder(p); });
onRoute("/app/exam", async (p) => { await renderExamDetails(p); });
onRoute("/app/grading", async (p) => { await renderGrading(p); });
onRoute("/app/bank", () => {});
onRoute("/app/profile", () => { renderProfile(); });
onRoute("/app/settings", () => { renderSettings(); });
onRoute("/app/packages", () => {});
onRoute("/exam", async (p) => { await renderExam(p); });
onRoute("/result", async () => { await renderResult(); });

/* ============================================================
   GLOBAL EVENTS
   ============================================================ */
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-theme-toggle]")) { toggleTheme(); return; }

  const langBtn = e.target.closest("[data-lang]");
  if (langBtn) { setLang(langBtn.dataset.lang); return; }

  if (e.target.closest("[data-signout]")) { signOutUser(); return; }

  if (e.target.closest("[data-create-exam]")) { navigate("/app/builder"); return; }

  if (e.target.closest("[data-back]")) {
    history.back();
    return;
  }

  const sidebarToggle = e.target.closest("[data-sidebar-toggle]");
  if (sidebarToggle) {
    const sidebar = $("[data-sidebar]");
    const scrim = $("[data-sidebar-scrim]");
    sidebar.classList.add("is-open");
    scrim.classList.add("is-open");
    return;
  }

  if (e.target.closest("[data-sidebar-scrim]")) {
    $("[data-sidebar]").classList.remove("is-open");
    $("[data-sidebar-scrim]").classList.remove("is-open");
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
  setTheme(currentTheme);
  setLang(currentLang);
  handleRoute();
})();
