import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, indexedDBLocalPersistence } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// إعدادات Firebase الخاصة بك
export const firebaseConfig = {
  apiKey: "AIzaSyAZJqiBkw2wlaGlftaWTAHpyQLT5zk4gNI",
  authDomain: "manasa-allm.firebaseapp.com",
  projectId: "manasa-allm",
  storageBucket: "manasa-allm.firebasestorage.app",
  messagingSenderId: "607109578538",
  appId: "1:607109578538:web:8ab8fb3816765a8d8ea853",
  measurementId: "G-BQV883ED13"
};

// تهيئة التطبيق
const app = initializeApp(firebaseConfig);

// 1. إعداد Auth ليحفظ بيانات الدخول حتى عند إغلاق الإنترنت
export const auth = getAuth(app);
setPersistence(auth, indexedDBLocalPersistence).catch((err) => {
    console.error("خطأ في تفعيل حفظ جلسة الدخول:", err);
});

// 2. إعداد Firestore ليحفظ الجداول والبيانات أوفلاين
export const db = getFirestore(app);
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log("التخزين مفعّل في تبويب آخر");
    } else if (err.code == 'unimplemented') {
        console.log("المتصفح لا يدعم التخزين في هذا الجهاز");
    }
});

export default app;
