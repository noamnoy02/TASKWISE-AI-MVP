// Tiny single-page router: exactly one [data-screen] section is visible at a
// time. Pre-nav screens (welcome, userentry, onboarding) hide the bottom nav
// via CSS rules keyed on body[data-active-screen].

const screens = new Map();
const navButtons = new Map();
let activeScreen = null;
let returnTo = "home";

function focusScreen(section) {
  const target = section.querySelector("[data-screen-focus]") || section.querySelector("h2");
  if (target) {
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: false });
  }
}

export function initNav() {
  document.querySelectorAll("[data-screen]").forEach(section => {
    screens.set(section.dataset.screen, section);
  });

  document.querySelectorAll("[data-nav-target]").forEach(button => {
    navButtons.set(button.dataset.navTarget, button);
    button.addEventListener("click", () => showScreen(button.dataset.navTarget));
  });
}

export function showScreen(name, options = {}) {
  const section = screens.get(name);
  if (!section) return;

  const PRE_NAV = new Set(["welcome", "userentry", "onboarding"]);

  if (!PRE_NAV.has(name)) {
    returnTo = name;
  }

  screens.forEach((el, key) => {
    el.classList.toggle("is-active", key === name);
  });

  navButtons.forEach((btn, key) => {
    btn.classList.toggle("active", key === name);
  });

  activeScreen = name;
  document.body.setAttribute("data-active-screen", name);

  if (options.focus !== false) focusScreen(section);
  if (options.scroll !== false) window.scrollTo(0, 0);
}

export function getActiveScreen() {
  return activeScreen;
}

export function getReturnScreen() {
  return returnTo;
}
