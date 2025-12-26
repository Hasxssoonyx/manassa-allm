
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAZJqiBkw2wlaGlftaWTAHpyQLT5zk4gNI",
  authDomain: "manasa-allm.firebaseapp.com",
  projectId: "manasa-allm",
  storageBucket: "manasa-allm.firebasestorage.app",
  messagingSenderId: "607109578538",
  appId: "1:607109578538:web:8ab8fb3816765a8d8ea853",
  measurementId: "G-BQV883ED13"
};

// تهيئة التطبيق مرة واحدة فقط
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
// 1. أضف هذه الاستيرادات في الأعلى
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  // بياناتك السرية موجودة هنا لا تغيرها
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app); // تعريف قاعدة البيانات

// 2. أضف هذا الجزء لتفعيل خاصية "الأوفلاين"
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log("التخزين مفعّل في تبويب آخر");
    } else if (err.code == 'unimplemented') {
        console.log("المتصفح لا يدعم التخزين");
    }
});

export { auth, db };
