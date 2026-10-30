// Dependency-free development server; only public app assets are served.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = __dirname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};
const publicFiles = new Set([
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
  "config.js",
]);
const server = http.createServer((req, res) => {
  // Firebase's authorized local OAuth origin is localhost, not the numeric IP.
  if (req.headers.host?.split(":")[0] === "127.0.0.1") {
    res.writeHead(307, { Location: `http://localhost:${port}${req.url}` }).end();
    return;
  }
  let name;
  try {
    name =
      decodeURIComponent(new URL(req.url, "http://localhost").pathname).replace(
        /^\//,
        "",
      ) || "index.html";
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (!(publicFiles.has(name) || /^js\/[a-z-]+\.mjs$/.test(name))) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (name === "config.js") {
    try {
      const cfg = vm.runInNewContext(
        fs.readFileSync(path.join(root, name), "utf8") + "\nAPP_CONFIG;",
        {},
        { timeout: 1000 },
      );
      const safe = {
        firebase: cfg.firebase,
        functionsRegion: cfg.functionsRegion || "asia-south1",
        appCheckSiteKey: cfg.appCheckSiteKey || "",
        emulators: cfg.emulators === true,
      };
      res
        .writeHead(200, { "Content-Type": types[".js"] })
        .end("const APP_CONFIG = " + JSON.stringify(safe) + ";");
    } catch {
      res.writeHead(404).end("Configuration not found");
    }
    return;
  }
  fs.readFile(path.join(root, name), (error, data) => {
    if (error) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": types[path.extname(name)] }).end(data);
  });
});
const port = Number(process.env.PORT) || 4173;
server.listen(port, "127.0.0.1", () =>
  console.log("Xpenso preview: http://localhost:" + port),
);
