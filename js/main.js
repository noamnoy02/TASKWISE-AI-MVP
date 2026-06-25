import { getUser, getProfile, resetAll } from "./storage.js";
import { initNav, showScreen } from "./nav.js";
import { renderAll } from "./render.js";

import { initWelcomeScreen } from "./screens/welcome.js";
import { initUserEntryScreen } from "./screens/userentry.js";
import {
  initOnboardingScreen,
  openOnboardingForEdit
} from "./screens/onboarding.js";
import {
  initHomeScreen,
  updateGreeting
} from "./screens/home.js";
import {
  initCaptureScreen,
  openTaskForEdit,
  startCapture,
  openManualCapture
} from "./screens/capture.js";
import { getActiveScreen } from "./nav.js";
import { initTasksScreen } from "./screens/tasks.js";
import { initCalendarScreen } from "./screens/calendar.js";
import { initProfileScreen } from "./screens/profile.js";

// ── Callbacks shared across screens ─────────────────────────────

function handleTasksChanged() {
  renderAll();
}

function handleQuickCapture(text, source) {
  showScreen("capture");
  startCapture(text, source);
}

function handleManualCapture() {
  const origin = getActiveScreen();
  showScreen("capture");
  openManualCapture(origin);
}

function handleEditTask(task) {
  showScreen("capture");
  openTaskForEdit(task);
}

function handleSwitchProfile() {
  resetAll();
  showScreen("welcome");
}

function handleOnboardingComplete() {
  renderAll();
  updateGreeting();
  showScreen("home");
}

// ── Initial screen determination ────────────────────────────────

function showInitialScreen() {
  const user = getUser();

  if (!user) {
    showScreen("welcome");
    return;
  }

  const profile = getProfile();
  if (!profile || !profile.onboardingCompleted) {
    showScreen("onboarding");
    return;
  }

  updateGreeting();
  showScreen("home");
}

// ── Header menu ──────────────────────────────────────────────────

function initHeaderMenu() {
  const btn = document.getElementById("mainMenuBtn");
  const dropdown = document.getElementById("appMenuDropdown");
  if (!btn || !dropdown) return;

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.classList.contains("hidden");
    dropdown.classList.toggle("hidden", isOpen);
    btn.setAttribute("aria-expanded", String(!isOpen));
  });

  dropdown.addEventListener("click", (e) => {
    const item = e.target.closest("[data-menu]");
    if (!item) return;
    dropdown.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");

    const action = item.dataset.menu;
    if (action === "editProfile") {
      openOnboardingForEdit(handleOnboardingComplete);
    } else if (action === "switchProfile") {
      handleSwitchProfile();
    } else if (action === "clearTasks") {
      if (confirm("Clear all tasks? This cannot be undone.")) {
        import("./storage.js").then(({ saveTasks }) => {
          saveTasks([]);
          handleTasksChanged();
        });
      }
    }
  });

  document.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  });
}

// ── App bootstrap ────────────────────────────────────────────────

function initApp() {
  initNav();
  initHeaderMenu();

  initWelcomeScreen({
    onGetStarted: () => {
      document.getElementById("userentryHeading").textContent = "Let's get started";
      document.getElementById("userentryDesc").textContent = "Enter your email or username to continue.";
      showScreen("userentry");
    },
    onReturning: () => {
      document.getElementById("userentryHeading").textContent = "Welcome back";
      document.getElementById("userentryDesc").textContent = "Enter your email or username to load your profile.";
      showScreen("userentry");
    }
  });

  initUserEntryScreen({
    onContinue: (user, isNew) => {
      if (isNew) {
        showScreen("onboarding");
      } else {
        updateGreeting();
        showScreen("home");
      }
    },
    onBack: () => showScreen("welcome")
  });

  initOnboardingScreen({
    onComplete: handleOnboardingComplete
  });

  initHomeScreen({
    onQuickCapture: handleQuickCapture,
    onManualCapture: handleManualCapture,
    onEditTask: handleEditTask,
    onTasksChanged: handleTasksChanged
  });

  initCaptureScreen({
    onTaskSaved: handleTasksChanged
  });

  initTasksScreen({
    onEditTask: handleEditTask,
    onTasksChanged: handleTasksChanged
  });

  initCalendarScreen();

  initProfileScreen({
    onEditProfile: () => openOnboardingForEdit(handleOnboardingComplete),
    onSwitchProfile: handleSwitchProfile
  });

  renderAll();
  showInitialScreen();
}

initApp();
