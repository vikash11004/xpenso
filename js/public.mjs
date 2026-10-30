import { hydrateIcons, icon } from "./icons.mjs";
hydrateIcons();
function themeButtons() {
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const dark = document.documentElement.dataset.theme === "dark";
    button.innerHTML = icon(dark ? "sun" : "moon");
    button.setAttribute(
      "aria-label",
      `Switch to ${dark ? "light" : "dark"} theme`,
    );
  });
}
themeButtons();
window.addEventListener("themechange", themeButtons);
document
  .querySelectorAll("[data-theme-toggle]")
  .forEach((button) => button.addEventListener("click", () => toggleTheme()));
