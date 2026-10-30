import { publicConfig } from "./firebase-settings.mjs";
let instance;
function script(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () =>
      reject(
        new Error("Could not connect. Check your connection and try again."),
      );
    document.head.append(el);
  });
}
export async function getFirebase() {
  if (!instance)
    instance = (async () => {
      const config = publicConfig;
      if (
        !config?.firebase?.apiKey ||
        config.firebase.apiKey.startsWith("YOUR_")
      )
        throw new Error(
          "Firebase is not configured. Enter the public web app settings in js/firebase-settings.mjs and redeploy.",
        );
      const base = "https://www.gstatic.com/firebasejs/10.7.1/";
      await script(base + "firebase-app-compat.js");
      await Promise.all(
        ["auth", "firestore", "functions"].map((name) =>
          script(base + `firebase-${name}-compat.js`),
        ),
      );
      const app = firebase.apps[0] || firebase.initializeApp(config.firebase);
      const auth = app.auth(),
        db = app.firestore();
      const functions = app.functions(config.functionsRegion || "asia-south1");
      if (config.appCheckSiteKey) {
        await script(base + "firebase-app-check-compat.js");
        app.appCheck().activate(config.appCheckSiteKey, true);
      }
      // Memory cache is deliberate: signing out must not expose another user's ledger.
      if (
        config.emulators &&
        ["localhost", "127.0.0.1"].includes(location.hostname)
      ) {
        auth.useEmulator("http://127.0.0.1:9099");
        db.useEmulator("127.0.0.1", 8080);
        functions.useEmulator("127.0.0.1", 5001);
      }
      return { app, auth, db, functions, config };
    })().catch((error) => {
      instance = null;
      throw error;
    });
  return instance;
}
export async function ensureProfile(user, db) {
  const ref = db.collection("users").doc(user.uid);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists)
      tx.set(ref, {
        displayName: (user.displayName || "").slice(0, 60),
        email: user.email || "",
        currency: "INR",
        timezone: "Asia/Kolkata",
        createdAt: Date.now(),
        onboardingVersion: 0,
      });
  });
  return (await ref.get()).data();
}
