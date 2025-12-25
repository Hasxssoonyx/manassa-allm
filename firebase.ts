
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
