import { clearTasks } from "./storage.js";
import { initNav, showScreen } from "./nav.js";
import { renderAll } from "./render.js";

import { initOnboardingScreen, openOnboarding, shouldShowOnLoad, resetOnboarding } from "./screens/onboarding.js";
import { initOverviewScreen } from "./screens/overview.js";
import { initCaptureScreen, openTaskForEdit, resetCaptureScreen } from "./screens/capture.js";
import { initTasksScreen } from "./screens/tasks.js";
import { initCalendarScreen } from "./screens/calendar.js";

const els = {
  editContextBtn: document.getElementById("editContextBtn"),
  resetDemoBtn: document.getElementById("resetDemoBtn")
};

function handleTasksChanged() {
  renderAll();
}

function resetDemo() {
  clearTasks();
  resetOnboarding();
  resetCaptureScreen();
  renderAll();
  openOnboarding();
}

function initApp() {
  initNav();

  initOnboardingScreen();
  initOverviewScreen();
  initCaptureScreen({ onTaskSaved: handleTasksChanged });
  initTasksScreen({ onEditTask: openTaskForEdit, onTasksChanged: handleTasksChanged });
  initCalendarScreen();

  els.editContextBtn.addEventListener("click", () => openOnboarding());
  els.resetDemoBtn.addEventListener("click", resetDemo);

  renderAll();

  if (shouldShowOnLoad()) {
    openOnboarding();
  } else {
    showScreen("overview");
  }
}

initApp();
