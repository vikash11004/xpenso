// Public browser settings only. Copy to config.js and enter your Firebase app details.
// Keep GROQ_API_KEY in Firebase Secret Manager (or functions/.secret.local for emulators).
const APP_CONFIG = {
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
  },
  functionsRegion: "asia-south1",
  appCheckSiteKey: "", // Register this app with Firebase App Check / reCAPTCHA v3 before using parsing.
  emulators: false, // Only honored on localhost / 127.0.0.1.
};
