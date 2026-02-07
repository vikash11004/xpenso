// ============================================================
// Xpenso Configuration — TEMPLATE
// ============================================================
// 1. Copy this file:        config.example.js  →  config.js
// 2. Fill in your own keys below.
// 3. NEVER commit config.js to Git — it is already in .gitignore.
// ============================================================

const APP_CONFIG = {
    // Firebase (https://console.firebase.google.com)
    firebase: {
        apiKey:            "YOUR_FIREBASE_API_KEY",
        authDomain:        "YOUR_PROJECT.firebaseapp.com",
        projectId:         "YOUR_PROJECT_ID",
        storageBucket:     "YOUR_PROJECT.firebasestorage.app",
        messagingSenderId: "YOUR_SENDER_ID",
        appId:             "YOUR_APP_ID",
        measurementId:     "YOUR_MEASUREMENT_ID"
    },

    // Groq AI (https://console.groq.com)
    groq: {
        apiKey:  "YOUR_GROQ_API_KEY",
        apiUrl:  "https://api.groq.com/openai/v1/chat/completions",
        model:   "llama-3.3-70b-versatile"
    }
};
