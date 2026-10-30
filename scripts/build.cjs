const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, ".."),
  out = path.join(root, "public");
if (path.dirname(out) !== root || path.basename(out) !== "public")
  throw new Error("Invalid generated output directory");
// This is the generated, git-ignored output directory, never a source directory.
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = [
  "index.html",
  "dashboard.html",
  "signin.html",
  "signup.html",
  "budgetcategories.html",
  "incomestreams.html",
  "visualreports.html",
  "smartalerts.html",
  "settings.html",
  "shield.css",
  "theme.js",
  "favicon.svg",
];
for (const file of files)
  fs.copyFileSync(path.join(root, file), path.join(out, file));
fs.mkdirSync(path.join(out, "js"), { recursive: true });
for (const file of fs
  .readdirSync(path.join(root, "js"))
  .filter((f) => f.endsWith(".mjs")))
  fs.copyFileSync(path.join(root, "js", file), path.join(out, "js", file));
if (fs.existsSync(path.join(root, "config.js"))) {
  const config = vm.runInNewContext(
    fs.readFileSync(path.join(root, "config.js"), "utf8") + "\nAPP_CONFIG;",
    {},
    { timeout: 1000 },
  );
  // Only public Firebase settings enter the deployable directory. AI secrets never do.
  const safe = {
    firebase: config.firebase,
    functionsRegion: config.functionsRegion || "asia-south1",
    appCheckSiteKey: config.appCheckSiteKey || "",
  };
  fs.writeFileSync(
    path.join(out, "js/firebase-settings.mjs"),
    "export const publicConfig = " + JSON.stringify(safe, null, 2) + ";\n",
  );
  console.log(
    "Built static app in public/. Only public Firebase configuration was included.",
  );
}
