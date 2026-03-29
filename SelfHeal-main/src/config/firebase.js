import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAKCDot07BWv4bFdUwNvcTo3s-tUVP5DyY",
  authDomain: "selfheal-9cbac.firebaseapp.com",
  databaseURL: "https://selfheal-9cbac-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "selfheal-9cbac",
  storageBucket: "selfheal-9cbac.firebasestorage.app",
  messagingSenderId: "1028317108194",
  appId: "1:1028317108194:web:3f91ab9d12f04d08898bbb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export RTDB instance
export const db = getDatabase(app);

export default app;