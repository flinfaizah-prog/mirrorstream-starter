// Config web Firebase memang publik; keamanan ada di firestore.rules, bukan di sini.
// JANGAN taruh token ShrinkMe / secret apa pun di file ini.
export const firebaseConfig = {
  apiKey: "AIzaSyBS9ZlktTVBUYJjwul9nKS7tE2LQrdnndo",
  authDomain: "mirrorstream-starter.firebaseapp.com",
  projectId: "mirrorstream-starter",
  storageBucket: "mirrorstream-starter.firebasestorage.app",
  messagingSenderId: "18609731430",
  appId: "1:18609731430:web:19ae3ab7f37fcc5dcbfaa7"
};

export const PAGE_SIZE = 20;
// Isi dengan URL Worker setelah deploy, mis. https://mirrorstream-shortener.NAMA.workers.dev
export const SHORTENER_URL = "https://mirrorstream-shortener.fikrialfarizi038.workers.dev";
export const isConfigured = !firebaseConfig.apiKey.startsWith("ISI_");

// Email khusus admin yang diizinkan login (Google OAuth)
export const ALLOWED_ADMIN_EMAILS = [
  "fikrialfarizi039@gmail.com"
];
