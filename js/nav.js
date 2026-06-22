// Tiny single-page router: exactly one [data-screen] section is visible
// at a time, switched by the bottom nav (or any code calling showScreen).

const screens = new Map();
const navButtons = new Map();
let activeScreen = null;
let returnTo = "overview";

function focusScreen(section) {
  const focusTarget = section.querySelector("[data-screen-focus]") || section.querySelector("h2");
  if (focusTarget) {
    if (!focusTarget.hasAttribute("tabindex")) {
      focusTarget.setAttribute("tabindex", "-1");
    }
    focusTarget.focus({ preventScroll: false });
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

  // Remember the last non-onboarding screen so onboarding (and Reset Demo)
  // can return the user to where they were instead of always landing on Overview.
  if (name !== "onboarding") {
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

  if (options.focus !== false) {
    focusScreen(section);
  }

  if (options.scroll !== false) {
    window.scrollTo(0, 0);
  }
}

export function getActiveScreen() {
  return activeScreen;
}

export function getReturnScreen() {
  return returnTo;
}
