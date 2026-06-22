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
import { initSharedScreen } from "./screens/shared.js";
import { initProfileScreen } from "./screens/profile.js";

// ── Callbacks shared across screens ─────────────────────────────

function handleTasksChanged() {
  renderAll();
}

function handleQuickCapture(text) {
  showScreen("capture");
  startCapture(text);
}

function handleManualCapture() {
  showScreen("capture");
  openManualCapture();
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

// ── App bootstrap ────────────────────────────────────────────────

function initApp() {
  initNav();

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

  initSharedScreen({
    onEditTask: handleEditTask,
    onTasksChanged: handleTasksChanged
  });

  initProfileScreen({
    onEditProfile: () => openOnboardingForEdit(handleOnboardingComplete),
    onSwitchProfile: handleSwitchProfile
  });

  renderAll();
  showInitialScreen();
}

initApp();
