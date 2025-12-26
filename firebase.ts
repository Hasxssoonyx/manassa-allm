
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, setPersistence, indexedDBLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAZJqiBkw2wlaGlftaWTAHpyQLT5zk4gNI",
  authDomain: "manasa-allm.firebaseapp.com",
  projectId: "manasa-allm",
  storageBucket: "manasa-allm.firebasestorage.app",
  messagingSenderId: "607109578538",
  appId: "1:607109578538:web:8ab8fb3816765a8d8ea853",
  measurementId: "G-BQV883ED13"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// تفعيل حفظ الجلسة لتبقى نشطة حتى بدون إنترنت
setPersistence(auth, indexedDBLocalPersistence).catch(err => console.log("Persistence error", err));

export const db = getFirestore(app);

// تفعيل العمل بدون إنترنت للبيانات
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.log("Persistence failed: multiple tabs open");
    } else if (err.code == 'unimplemented') {
        console.log("Persistence is not supported by this browser");
    }
});

export default app;
