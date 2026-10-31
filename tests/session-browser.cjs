// Real Firebase browser persistence; synthetic provider responses only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = path.resolve(__dirname, ".."),
  dir = path.join(root, "test-results");
fs.mkdirSync(dir, { recursive: true });
const profile = fs.mkdtempSync(path.join(dir, "session-profile-"));
function token() {
  const now = Math.floor(Date.now() / 1000);
  return [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({
        sub: "test-user",
        user_id: "test-user",
        aud: "fixture",
        iss: "https://securetoken.google.com/fixture",
        iat: now,
        exp: now + 3600,
        auth_time: now,
        firebase: { sign_in_provider: "password" },
      }),
    ).toString("base64url"),
    "signature",
  ].join(".");
}
let context;
async function open() {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ...(process.env.BROWSER_PATH
      ? { executablePath: process.env.BROWSER_PATH }
      : {}),
  });
  await context.route("https://identitytoolkit.googleapis.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        route.request().url().includes("accounts:lookup")
          ? {
              users: [
                {
                  localId: "test-user",
                  email: "test@example.test",
                  emailVerified: false,
                  providerUserInfo: [
                    {
                      providerId: "password",
                      email: "test@example.test",
                      rawId: "test@example.test",
                    },
                  ],
                  createdAt: String(Date.now()),
                  lastLoginAt: String(Date.now()),
                },
              ],
            }
          : {
              localId: "test-user",
              email: "test@example.test",
              idToken: token(),
              refreshToken: "synthetic-refresh-token",
              expiresIn: "3600",
              registered: true,
            },
      ),
    }),
  );
  await context.route("https://securetoken.googleapis.com/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        access_token: token(),
        id_token: token(),
        refresh_token: "synthetic-refresh-token",
        expires_in: "3600",
        token_type: "Bearer",
        user_id: "test-user",
        project_id: "fixture",
      }),
    }),
  );
  await context.route("http://localhost:4199/**", (route) => {
    const name = new URL(route.request().url()).pathname;
    if (name === "/js/firebase-settings.mjs")
      return route.fulfill({
        contentType: "text/javascript",
        body: 'export const publicConfig={firebase:{apiKey:"fixture-key",projectId:"fixture",authDomain:"fixture.firebaseapp.com"}};',
      });
    if (name.endsWith(".mjs"))
      return route.fulfill({
        path: path.join(root, name),
        contentType: "text/javascript",
      });
    return route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><title>Session test</title><script type="module">import {getFirebase,validateSession} from "./js/firebase.mjs";window.services=await getFirebase();window.validateSession=validateSession;window.ready=true;</script>',
    });
  });
  const page = await context.newPage();
  await page.goto("http://localhost:4199/");
  await page.waitForFunction(() => window.ready, {}, { timeout: 45000 });
  return page;
}
(async () => {
  let page = await open();
  await page.evaluate(() =>
    services.auth.signInWithEmailAndPassword(
      "test@example.test",
      "synthetic-password",
    ),
  );
  assert.equal(
    await page.evaluate(() => services.auth.currentUser.uid),
    "test-user",
  );
  await context.close();
  page = await open();
  const uid = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const off = services.auth.onAuthStateChanged((u) => {
          off();
          resolve(u?.uid || null);
        });
      }),
  );
  assert.equal(
    uid,
    "test-user",
    "Session must survive closing the entire browser process",
  );
  await page.evaluate(() =>
    validateSession(services.auth.currentUser, services.auth),
  );
  await page.evaluate(() => services.auth.signOut());
  await context.close();
  page = await open();
  const afterSignOut = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const off = services.auth.onAuthStateChanged((u) => {
          off();
          resolve(u?.uid || null);
        });
      }),
  );
  assert.equal(afterSignOut, null, "Sign-out must survive a browser restart");
  console.log(
    "PASS: Real Firebase LOCAL persistence survives browser restart; session refresh succeeds; explicit sign-out survives restart. Provider responses are synthetic.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await context?.close();
  });
