import "./public.mjs";
import { getFirebase } from "./firebase.mjs";

// Reopening the app's home URL resumes the account instead of showing sign-up.
// The dashboard refreshes the token before loading any private data.
try {
  const { auth } = await getFirebase();
  const stop = auth.onAuthStateChanged((user) => {
    stop();
    if (user) location.replace("dashboard.html");
  });
} catch {
  // The public landing page remains usable when offline or storage is blocked.
}
