import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCn5xq4lGMjkpp38pEZjGaLWq_Vxtxe4U0",
  authDomain: "mit1-969f5.firebaseapp.com",
  databaseURL: "https://mit1-969f5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mit1-969f5",
  storageBucket: "mit1-969f5.firebasestorage.app",
  messagingSenderId: "981612772907",
  appId: "1:981612772907:web:424b59c96c29f7bd85f46e",
  measurementId: "G-0FLK1VVYTV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const database = getDatabase(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, analytics, database, db, auth };
