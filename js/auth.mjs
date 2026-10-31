import "./public.mjs";
import { getFirebase, ensureProfile, validateSession } from "./firebase.mjs";
const $ = (s) => document.querySelector(s),
  signup = document.body.dataset.auth === "signup";
let services,
  submitting = false;
const messages = {
  "auth/invalid-credential":
    "That email and password don’t match. Please try again.",
  "auth/user-not-found":
    "That email and password don’t match. Please try again.",
  "auth/wrong-password":
    "That email and password don’t match. Please try again.",
  "auth/email-already-in-use":
    "This email already has an account. Try logging in.",
  "auth/weak-password": "Choose a password with at least 6 characters.",
  "auth/too-many-requests":
    "A few too many attempts. Please try again shortly.",
  "auth/popup-blocked": "Allow the Google sign-in popup, then try again.",
  "auth/unauthorized-domain": `Google sign-in is not enabled for ${location.hostname}. For local development, open this app at localhost. For a deployed site, add its domain in Firebase Authentication settings.`,
  "auth/operation-not-allowed":
    "Google sign-in is disabled for this project. Enable Google in Firebase Authentication → Sign-in method.",
  "auth/account-exists-with-different-credential":
    "This email already uses another sign-in method. Sign in with that method first.",
  "auth/popup-closed-by-user":
    "Google sign-in closed before finishing. Try again and keep the sign-in window open.",
  "auth/cancelled-popup-request":
    "Another sign-in window was opened. Finish the most recent window or try again.",
  "auth/network-request-failed": "Check your connection and try again.",
};
function busy(value) {
  submitting = value;
  $("#auth-submit").disabled = value;
  $("#google-signin").disabled = value;
  $("#auth-status").textContent = value ? "Making a little space for you…" : "";
}
async function finish(user) {
  await validateSession(user, services.auth);
  try {
    await ensureProfile(user, services.db);
  } catch (cause) {
    throw Object.assign(
      new Error(
        "You’re signed in, but your spending profile couldn’t load. Check your connection and Firestore permissions, then reload.",
      ),
      { code: "profile/unavailable", cause },
    );
  }
  location.replace("dashboard.html");
}
function errorMessage(error, fallback) {
  return (
    messages[error.code] ||
    (error.code === "profile/unavailable"
      ? error.message
      : `${fallback}${error.code ? ` (${error.code})` : ""}`)
  );
}
$("#auth-form").onsubmit = async (e) => {
  e.preventDefault();
  if (submitting || !services) return;
  busy(true);
  $("#auth-error").textContent = "";
  try {
    const email = $("#email").value.trim(),
      password = $("#password").value;
    const { user } = signup
      ? await services.auth.createUserWithEmailAndPassword(email, password)
      : await services.auth.signInWithEmailAndPassword(email, password);
    if (signup)
      await user.updateProfile({ displayName: $("#name").value.trim() });
    await finish(user);
  } catch (error) {
    $("#auth-error").textContent = errorMessage(
      error,
      "Couldn’t open your account. Please try again.",
    );
    busy(false);
  }
};
$("#google-signin").onclick = async () => {
  if (submitting || !services) return;
  busy(true);
  $("#auth-error").textContent = "";
  try {
    const result = await services.auth.signInWithPopup(
      new firebase.auth.GoogleAuthProvider(),
    );
    await finish(result.user);
  } catch (error) {
    $("#auth-error").textContent = errorMessage(
      error,
      "Google sign-in didn’t finish. Please try again.",
    );
    busy(false);
  }
};
$("#reset-password")?.addEventListener("click", async (e) => {
  const button = e.currentTarget;
  const email = $("#email").value.trim();
  if (!email || !$("#email").checkValidity()) {
    $("#auth-error").textContent = "Enter your email above first.";
    $("#email").focus();
    return;
  }
  if (!services) return;
  button.disabled = true;
  try {
    await services.auth.sendPasswordResetEmail(email);
    $("#auth-status").textContent =
      "If an account exists, a reset link is on its way.";
  } catch (error) {
    $("#auth-error").textContent =
      messages[error.code] || "Couldn’t request a reset. Please try again.";
  } finally {
    button.disabled = false;
  }
});
try {
  services = await getFirebase();
  busy(false);
  services.auth.onAuthStateChanged((user) => {
    if (user && !submitting) {
      busy(true);
      finish(user).catch((error) => {
        $("#auth-error").textContent = errorMessage(
          error,
          "Your profile couldn’t be loaded. Please try again.",
        );
        busy(false);
      });
    }
  });
} catch (error) {
  $("#auth-status").textContent = "";
  $("#auth-error").textContent = error.message;
}
