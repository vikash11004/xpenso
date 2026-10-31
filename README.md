# Xpenso

A focused home for everyday spending. Choose monthly caps, log an expense, and see how much room remains. The interface uses warm ivory, terracotta and sage, with a matching dark theme and layouts down to 320 px.

## Run locally

Use Node.js 22 (also the Firebase Functions runtime).

```powershell
# Only for a new checkout; keep an existing config.js.
Copy-Item config.example.js config.js
npm start
```

Open `http://localhost:4173/`. The dashboard requires a signed-in account. Demo storage exists only as a test fixture and is excluded from the site.

The development server redirects numeric loopback URLs to `localhost`, the local domain authorized in this Firebase project for Google OAuth.

For real accounts, populate the public Firebase fields in `js/firebase-settings.mjs` (or use a local `config.js` as a build-time override), enable email/password and Google authentication, and authorize your hosting domain in Firebase Authentication. Use `firestore.rules` for the database; do not use open test-mode rules. Real receipt parsing additionally needs the backend setup below. Text entry falls back to a suggestion that always requires review if the parser is unavailable.

## What changed

- One dashboard replaces the sidebar, income ledger, reports and alerts screens. Old page URLs redirect to the dashboard or its cap/account sheet.
- Onboarding uses category chips and monthly INR caps. No salary or balance fields.
- Cap bars show an amber state at 80% and a calm offer to add ₹500 or hold the line at 100%. Flex applies only to this month and supports Undo.
- Persistent text, camera/upload and amount-entry controls feed the same expense store. Recent spending supports editing, removing and Undo.
- One cumulative chart compares the selected category with its cap. Pace estimates need at least three entries and three observed days. Streaks use the original monthly caps and are explicitly based on logged spending.
- Receipt parsing handles JPG, PNG and WebP photos or UPI screenshots. Images are resized in the browser. Clear, grounded results save immediately with Undo; ambiguous results open a review sheet. Failed, pending and incoming payments cannot be auto-logged.
- Money uses integer paise; month boundaries use Asia/Kolkata. This release displays the current calendar month. Older records remain stored, including expenses entered with an older date.

## Architecture

The existing plain HTML/JavaScript frontend and Firebase Authentication/Firestore stack are retained. No frontend framework or chart library is required.

| Location                         | Responsibility                                                        |
| -------------------------------- | --------------------------------------------------------------------- |
| `dashboard.html`, `shield.css`   | Responsive dashboard, dialogs and shared visual language              |
| `js/dashboard.mjs`               | Dashboard rendering and interactions                                  |
| `js/domain.mjs`                  | Currency, validation, cap metrics, streaks and legacy conversion      |
| `js/store.mjs`                   | Authenticated Firestore writes, migration and subscriptions           |
| `js/capture.mjs`                 | Image preparation, parser calls and review fallback                   |
| `js/firebase.mjs`, `js/auth.mjs` | Firebase initialization, account creation, sign-in and password reset |
| `functions/index.cjs`            | Authenticated, App Check-protected OCR/LLM callable                   |
| `functions/parser-core.cjs`      | Strict extraction schema and source-evidence validation               |
| `firestore.rules`                | Owner isolation and document validation                               |
| `scripts/build.cjs`, `serve.cjs` | Public-asset allowlists and sanitized browser configuration           |

Firestore layout:

```text
users/{uid}
  caps/{capId}                  # Default monthly limits and active categories
  capMonths/{YYYY-MM_capId}     # Original and effective limits for one month
  expenses/{expenseId}          # Outflows, occurredOn, monthKey, integer amountMinor
  transactions/{legacyId}       # Preserved; read-only to the client
  budgetCategories/{legacyId}   # Preserved; read-only to the client
_parseUsage/{uid}               # Server-only parser rate counters
```

The first connected session imports legacy expenses and caps with deterministic IDs. It excludes income, prefers the purchase date over the entry timestamp, and preserves all original documents. Invalid legacy records are skipped and counted in a visible notice. A retry cannot duplicate an imported expense. Unknown legacy categories remain uncapped. Migration completion is recorded as `schemaVersion: 2`.

Receipt IDs use the SHA-256 of the original file. Transactional creation prevents repeat submissions of that same file, including across tabs. A differently cropped or recompressed image has a different hash; matching merchant/amount/date entries receive a review prompt. Images and extracted OCR text are not written to Firestore. The backend sends images to Cloud Vision and extracted text to Groq, so those providers process the submitted content.

## Enable the parser and deploy

The backend is implemented but has not been deployed or tested against the live Firebase project. These steps configure the cloud services it requires:

1. Use the existing Firebase project with billing enabled for Functions and Cloud Vision. Keep its current authentication providers and database.
2. Enable the **Cloud Vision API** in that project. The deployed function uses its Google service identity; no Google service-account key belongs in the browser.
3. Register the web app with Firebase App Check using reCAPTCHA v3. Add the public site key to `config.js` as `appCheckSiteKey`. The callable enforces App Check; an empty key will leave parsing unavailable. See [Firebase's provider setup](https://firebase.google.com/docs/app-check/web/recaptcha-provider).
4. Install the function dependencies and put the Groq credential in Firebase Secret Manager:

```powershell
npm ci --prefix functions
npx firebase-tools login
npx firebase-tools functions:secrets:set GROQ_API_KEY --project YOUR_PROJECT_ID
```

The default model is `openai/gpt-oss-20b`, using [Groq strict structured outputs](https://console.groq.com/docs/structured-outputs). `PARSER_MODEL` is a Functions parameter if a different supported model is needed. Parsing is limited to 10 requests/minute and 100/day per account, with at most five function instances. Manual entry remains available when parsing fails or reaches a limit.

5. Build and deploy the allowlisted frontend, rules and function together:

```powershell
npm test
npm run build
npx firebase-tools deploy --only "firestore:rules,functions,hosting" --project YOUR_PROJECT_ID
```

The build recreates the generated `public/` directory. Only public Firebase configuration is included. Host that directory, never the repository root. The local server also blocks access to backend files, credentials and repository metadata.

`functions/.secret.local` is a git-ignored emulator secret file, not a production deployment mechanism. The former browser Groq setting has been removed. If a former client-side credential was published, rotate it before using the server integration.

## Validation

```powershell
npm test
npm run build
```

Unit tests cover exact currency math, IST month boundaries, threshold states, monthly flex, streaks, migration, conservative parsing, source-grounded amounts/dates, rejected payment states and repeatable receipt writes.

For browser checks, install Playwright separately and run:

```powershell
npm install --no-save playwright
npx playwright install chromium
node tests/browser.cjs
```

Alternatively set `PLAYWRIGHT_MODULE` to an existing Playwright installation and `BROWSER_PATH` to an installed Chromium/Edge executable. `SCREENSHOT_DIR` controls screenshot output. The browser suite serves local source assets and stubs configuration so it never accesses real accounts. It checks 14 responsive page layouts, both themes, onboarding, create/edit/delete/Undo, cap flex, category restoration, parsing fallback, duplicate receipt handling, persistence, escaped merchant content, short-screen dialogs and mocked email/Google/signup/password-reset flows.

Local validation passed: 20 unit tests, the browser suite, the public build and loading the callable with installed server dependencies. The server dependency audit reports zero known vulnerabilities. Live authentication, Firestore rules enforcement and the Cloud Vision-to-Groq path still need a connected staging check. The Firestore emulator requires Java, which was not available in this workspace. For emulator use, set `emulators: true` in local `config.js` and run Firebase's auth, firestore and functions emulators; production builds deliberately omit this switch. App Check needs an appropriate registered debug token in development.

---

## 🤝 Contributing

1. **Fork** the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a **Pull Request**

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ for students who want to take control of their finances.
</p>

## Custom-domain Google sign-in

Add `xpenso.vikashthyadi.in` in Firebase Console → Authentication → Settings → Authorized domains for project `xpenso-740e9`. This domain was missing when checked. The deployed site also returned 404 for the ignored `config.js`; the frontend now imports tracked public settings from `js/firebase-settings.mjs`, so direct repository deployments include Firebase configuration. Redeploy the updated source or generated `public/` directory. No AI secrets are included.

## Saved sign-in sessions

Firebase Auth explicitly uses LOCAL persistence before sign-in and auth observers. Returning to the home URL resumes the dashboard; the dashboard waits for auth restoration and refreshes the Firebase token before reading private data. Disabled or invalid sessions sign out. Network failures retain the saved session for retry. Explicit sign-out clears Firebase authentication, and browser Back restoration reloads the dashboard to recheck access. Firestore continues using memory cache rather than a durable local ledger. Authentication requires HTTPS outside local development. Passwords are never stored by application code. Private browsing, clearing site data, changing browsers/domains, and revoked credentials can still require sign-in.

`node tests/session-browser.cjs` uses the real Firebase SDK with synthetic provider responses and an isolated browser profile to verify login survives a full browser restart and sign-out survives another restart. It accepts the same Playwright environment variables as the main browser suite. No real accounts are used.
