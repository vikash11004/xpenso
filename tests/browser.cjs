// npm install --no-save playwright; PLAYWRIGHT_MODULE and BROWSER_PATH can point to installed tools.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  out = process.env.SCREENSHOT_DIR || path.join(root, "test-results");
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_PATH
      ? { executablePath: process.env.BROWSER_PATH }
      : {}),
  });
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  // Serve actual local assets; never contact the user's account or database.
  await ctx.route("http://127.0.0.1:4173/**", (route) => {
    const name =
      new URL(route.request().url()).pathname.slice(1) || "index.html";
    return route.fulfill({
      path: path.join(root, name),
      contentType:
        name.endsWith(".mjs") || name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : name.endsWith(".svg")
              ? "image/svg+xml"
              : "text/html",
    });
  });
  await ctx.route("**/config.js", (route) =>
    route.fulfill({
      body: "const APP_CONFIG={};",
      contentType: "text/javascript",
    }),
  );
  await ctx.route("**/js/store.mjs", (route) =>
    route.fulfill({
      path: path.join(root, "tests/fixtures/demo-store.mjs"),
      contentType: "text/javascript",
    }),
  );
  await ctx.route("**/js/firebase-settings.mjs", (route) =>
    route.fulfill({
      body: "export const publicConfig={};",
      contentType: "text/javascript",
    }),
  );
  const page = await ctx.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const checkWidth = async () =>
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "page overflows",
    );
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("http://127.0.0.1:4173/dashboard.html?demo=1");
    await page.locator("#workspace").waitFor({ state: "visible" });
    await page.evaluate(() => document.fonts.ready);
    await checkWidth();
    if ([1440, 390].includes(width))
      await page.screenshot({
        path: path.join(out, `shield-${width}.png`),
        fullPage: true,
      });
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await checkWidth();
    if (width === 390)
      await page.screenshot({
        path: path.join(out, "shield-dark.png"),
        fullPage: true,
      });
    await page.getByRole("button", { name: "Switch to light theme" }).click();
  }
  for (const file of ["index", "signin", "signup"]) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("http://127.0.0.1:4173/" + file + ".html");
      await page.evaluate(() => document.fonts.ready);
      await checkWidth();
      if (width === 390)
        await page.screenshot({
          path: path.join(out, file + "-new.png"),
          fullPage: true,
        });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:4173/dashboard.html?demo=1&fresh=1");
  await page.locator("#setup-form").waitFor({ state: "visible" });
  await page.locator('#setup-chips [data-id="eating-out"]').click();
  await page.locator('[data-limit="coffee"]').fill("1000");
  await page.getByRole("button", { name: "Start tracking" }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".cap-card").count(), 1);
  const add = async (amount, merchant) => {
    await page.getByRole("button", { name: "Just an amount" }).click();
    await page.locator("#expense-amount").fill(amount);
    await page.locator("#expense-merchant").fill(merchant);
    await page.locator('#expense-chips [data-cap="coffee"]').click();
    await page
      .getByRole("button", { name: "Log spending", exact: true })
      .click();
    await page.locator("#sheet").waitFor({ state: "hidden" });
  };
  await add("800", "Coffee with friends");
  assert.equal(
    await page.locator(".cap-card").getAttribute("data-state"),
    "near",
  );
  await page
    .getByRole("button", { name: "Edit Coffee with friends expense" })
    .click();
  await page.locator("#expense-amount").fill("750");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  assert.equal(
    await page.locator(".cap-card").getAttribute("data-state"),
    "safe",
  );
  await page.locator("#toast-action").click();
  assert.equal(
    await page.locator(".cap-card").getAttribute("data-state"),
    "near",
  );
  await add("200", "An afternoon latte");
  assert.equal(
    await page.locator(".cap-card").getAttribute("data-state"),
    "over",
  );
  await page.getByRole("button", { name: "Add ₹500", exact: true }).click();
  assert.equal(
    await page.locator(".cap-card").getAttribute("data-state"),
    "safe",
  );
  await page.locator("#toast-action").click();
  assert.equal(
    await page.locator(".cap-card").getAttribute("data-state"),
    "over",
  );
  await page.getByRole("button", { name: "Hold the line" }).click();
  assert.equal(await page.locator("[data-flex]").count(), 0);
  await page.locator("#magic-input").fill("Spent 90 on coffee");
  await page
    .getByRole("button", { name: "Log this spending", exact: true })
    .click();
  await page.locator("#expense-form").waitFor({ state: "visible" });
  assert.equal(await page.locator("#expense-amount").inputValue(), "90");
  await page.getByRole("button", { name: "Log spending", exact: true }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  await add("15", "<img src=x onerror=alert(1)>");
  assert.equal(await page.locator("#spend-feed img").count(), 0);
  await page
    .getByRole("button", { name: "Edit <img src=x onerror=alert(1)> expense" })
    .click();
  await page.getByRole("button", { name: "Remove this expense" }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  await page.locator("#toast-action").click();
  // Demo image path exercises image validation/compression and honest manual fallback.
  await page.getByRole("button", { name: "Snap or upload a receipt" }).click();
  await page
    .locator("#receipt-file")
    .setInputFiles(path.join(out, "shield-390.png"));
  await page.locator("#expense-form").waitFor({ state: "visible" });
  assert.match(
    await page.locator("#sheet-body").textContent(),
    /signed-in account/,
  );
  await page.locator("#expense-amount").fill("120");
  await page.locator("#expense-merchant").fill("Receipt cafe");
  await page.getByRole("button", { name: "Log spending", exact: true }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Snap or upload a receipt" }).click();
  await page
    .locator("#receipt-file")
    .setInputFiles(path.join(out, "shield-390.png"));
  await page.waitForFunction(() =>
    document
      .querySelector("#receipt-error")
      ?.textContent.includes("already logged"),
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await page.locator("#workspace").waitFor({ state: "visible" });
  assert.equal(
    await page
      .locator("#spend-feed")
      .getByText("Receipt cafe", { exact: true })
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Just an amount" }).click();
  await page.setViewportSize({ width: 320, height: 480 });
  await checkWidth();
  assert.equal(
    await page
      .locator("#sheet")
      .evaluate((el) => el.scrollHeight > el.clientHeight),
    true,
  );
  await page.keyboard.press("Escape");
  await page.locator("#sheet").waitFor({ state: "hidden" });
  await page.locator("#manage-caps").click();
  await page.locator('#setup-chips [data-id="shopping"]').click();
  await page.getByRole("button", { name: "Save my caps" }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".cap-card").count(), 2);
  await page.locator("#manage-caps").click();
  await page.locator('#setup-chips [data-id="shopping"]').click();
  await page.getByRole("button", { name: "Save my caps" }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".cap-card").count(), 1);
  await page.locator("#manage-caps").click();
  await page.locator('#setup-chips [data-id="shopping"]').click();
  await page.locator('[data-limit="shopping"]').fill("1800");
  await page.getByRole("button", { name: "Save my caps" }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".cap-card").count(), 2);
  assert.match(
    await page
      .locator(".cap-card")
      .filter({ hasText: "Shopping" })
      .textContent(),
    /1,800/,
  );
  // Custom categories persist and participate in logging and pace calculations.
  await page.locator("#manage-caps").click();
  await page.getByText("Add a category", { exact: true }).click();
  await page.locator("#custom-category-name").fill("Groceries");
  await page.locator("#custom-category-limit").fill("2750.50");
  await page.locator("#custom-category-icon").selectOption("🛒");
  await page
    .getByRole("button", { name: "Add to my caps", exact: true })
    .click();
  const customId = await page
    .locator("#setup-chips")
    .getByRole("button", { name: "🛒 Groceries", exact: true })
    .getAttribute("data-id");
  await page.getByText("Add a category", { exact: true }).click();
  await page.locator("#custom-category-name").fill("groceries");
  await page.locator("#custom-category-limit").fill("1000");
  await page
    .getByRole("button", { name: "Add to my caps", exact: true })
    .click();
  assert.match(
    await page.locator("#custom-category-error").textContent(),
    /already exists/,
  );
  await checkWidth();
  await page.getByRole("button", { name: "Save my caps", exact: true }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  assert.equal(
    await page.locator(".cap-card").filter({ hasText: "Groceries" }).count(),
    1,
  );
  await page.getByRole("button", { name: "Just an amount" }).click();
  await page.locator("#expense-amount").fill("100");
  await page.locator("#expense-merchant").fill("Vegetable market");
  await page.locator(`[data-cap="${customId}"]`).click();
  await page.getByRole("button", { name: "Log spending", exact: true }).click();
  await page.locator("#sheet").waitFor({ state: "hidden" });
  await page.reload();
  await page.locator("#workspace").waitFor({ state: "visible" });
  assert.match(
    await page
      .locator(".cap-card")
      .filter({ hasText: "Groceries" })
      .textContent(),
    /2,650.50/,
  );
  await page.locator("#pace-cap").selectOption(customId);
  assert.match(
    await page.locator("#spending-chart").getAttribute("aria-label"),
    /Groceries/,
  );
  await page.locator("#manage-caps").click();
  assert.equal(
    await page.locator(`[data-limit="${customId}"]`).inputValue(),
    "2750.5",
  );
  await page.keyboard.press("Escape");
  // A legacy demo URL must still require a real sign-in in production code.
  await ctx.unroute("**/js/store.mjs");
  await page.route("**/js/firebase.mjs", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export async function validateSession(){};export async function ensureProfile(){};export async function getFirebase(){return {auth:{onAuthStateChanged(callback){queueMicrotask(()=>callback(null));return ()=>{};}}};}`,
    }),
  );
  await page.goto("http://127.0.0.1:4173/dashboard.html?demo=1");
  await page.waitForURL("**/signin.html");
  assert.equal(await page.locator("#auth-form").isVisible(), true);
  // Exercise auth UI against a fake provider, never a real account.
  await page.route("**/js/firebase.mjs", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
      let observer;
      const record = value => sessionStorage.setItem('auth-events', JSON.stringify([...JSON.parse(sessionStorage.getItem('auth-events') || '[]'), value]));
      const delay = () => new Promise(resolve => setTimeout(resolve, 25));
      const user = { uid: 'fixture', email: 'test@example.test', displayName: '', async updateProfile(value) { Object.assign(this,value); record('name'); } };
      globalThis.firebase = { auth: { GoogleAuthProvider: class {} } };
      export async function validateSession(){};export async function ensureProfile() { record('profile'); return {}; }
      export async function getFirebase() { return { db: {}, auth: {
        onAuthStateChanged(callback) { observer=callback; queueMicrotask(()=>callback(null)); return ()=>{}; },
        async createUserWithEmailAndPassword() { await delay(); record('create'); observer(user); return {user}; },
        async signInWithEmailAndPassword() { await delay(); record('signin'); observer(user); return {user}; },
        async signInWithPopup() { await delay(); record('google'); observer(user); return {user}; },
        async sendPasswordResetEmail(email) { await delay(); if(email==='fail@example.test')throw Object.assign(new Error('offline'),{code:'auth/network-request-failed'}); }
      } }; }
    `,
    }),
  );
  await page.route("**/dashboard.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Signed in</title><p>Signed in</p>",
    }),
  );
  await page.goto("http://127.0.0.1:4173/signin.html");
  await page.waitForFunction(
    () => !document.querySelector("#auth-submit").disabled,
  );
  await page.locator("#email").fill("test@example.test");
  await page.locator("#reset-password").click();
  await page.waitForFunction(
    () => !document.querySelector("#reset-password").disabled,
  );
  assert.match(await page.locator("#auth-status").textContent(), /reset link/);
  await page.locator("#email").fill("fail@example.test");
  await page.locator("#reset-password").click();
  await page.waitForFunction(
    () => !document.querySelector("#reset-password").disabled,
  );
  assert.match(await page.locator("#auth-error").textContent(), /connection/);
  await page.evaluate(() => sessionStorage.setItem("auth-events", "[]"));
  await page.locator("#email").fill("test@example.test");
  await page.locator("#password").fill("fixture-password");
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/dashboard.html");
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("auth-events")),
    ),
    ["signin", "profile"],
  );
  await page.goto("http://127.0.0.1:4173/signup.html");
  await page.waitForFunction(
    () => !document.querySelector("#auth-submit").disabled,
  );
  await page.evaluate(() => sessionStorage.setItem("auth-events", "[]"));
  await page.locator("#name").fill("Fixture User");
  await page.locator("#email").fill("test@example.test");
  await page.locator("#password").fill("fixture-password");
  await page.locator("#auth-submit").click();
  await page.waitForURL("**/dashboard.html");
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("auth-events")),
    ),
    ["create", "name", "profile"],
  );
  await page.goto("http://127.0.0.1:4173/signin.html");
  await page.waitForFunction(
    () => !document.querySelector("#auth-submit").disabled,
  );
  await page.evaluate(() => sessionStorage.setItem("auth-events", "[]"));
  await page.locator("#google-signin").click();
  await page.waitForURL("**/dashboard.html");
  assert.deepEqual(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("auth-events")),
    ),
    ["google", "profile"],
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 14 responsive layouts, dark mode, onboarding, manual logging, edit/undo/delete, cap flex/undo, category restoration, text review, XSS rendering, receipt fallback, deduplication, persistence, short-screen dialogs and mocked email/Google/signup/password-reset flows.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
