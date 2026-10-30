function initTheme() {
  let saved = "light";
  try {
    saved = localStorage.getItem("xpenso-theme") || "light";
  } catch {}
  document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";
}
function toggleTheme() {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("xpenso-theme", next);
  } catch {}
  window.dispatchEvent(new Event("themechange"));
}
initTheme();
