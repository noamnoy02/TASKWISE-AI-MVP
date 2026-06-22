import { getProfile, saveProfile, clearProfile, setOnboardingSkipped, isOnboardingSkipped } from "../storage.js";
import { showScreen, getReturnScreen, getActiveScreen } from "../nav.js";

const els = {
  screen: document.getElementById("onboardingScreen"),
  form: document.getElementById("onboardingForm"),
  skipBtn: document.getElementById("skipOnboardingBtn"),
  clearContextBtn: document.getElementById("clearContextBtn"),
  workInput: document.getElementById("workInput"),
  studiesInput: document.getElementById("studiesInput"),
  lifeAreasInput: document.getElementById("lifeAreasInput"),
  peopleInput: document.getElementById("peopleInput"),
  projectsInput: document.getElementById("projectsInput")
};

let onClosed = null;
const profileChangeListeners = [];

// Other screens (Capture's "context status" pill) subscribe here instead of
// polling localStorage, so they update right when onboarding saves/clears.
export function onProfileChange(listener) {
  profileChangeListeners.push(listener);
}

function notifyProfileChange() {
  profileChangeListeners.forEach(listener => listener());
}

function splitCommaList(value) {
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function populateFromProfile() {
  const profile = getProfile();

  els.workInput.value = profile?.work || "";
  els.studiesInput.value = profile?.studies || "";
  els.lifeAreasInput.value = Array.isArray(profile?.lifeAreas) ? profile.lifeAreas.join(", ") : "";
  els.peopleInput.value = Array.isArray(profile?.people) ? profile.people.join(", ") : "";
  els.projectsInput.value = Array.isArray(profile?.projects) ? profile.projects.join(", ") : "";
}

function clearFields() {
  els.workInput.value = "";
  els.studiesInput.value = "";
  els.lifeAreasInput.value = "";
  els.peopleInput.value = "";
  els.projectsInput.value = "";
}

function close() {
  showScreen(getReturnScreen());
  if (onClosed) onClosed();
}

export function shouldShowOnLoad() {
  return !getProfile() && !isOnboardingSkipped();
}

// Opens onboarding as its own screen. `callback` runs once the user saves or
// skips, so callers (e.g. the header gear icon) can react if they need to.
export function openOnboarding(callback) {
  onClosed = callback || null;
  populateFromProfile();
  showScreen("onboarding");
}

export function initOnboardingScreen() {
  els.form.addEventListener("submit", event => {
    event.preventDefault();

    const profile = {
      work: els.workInput.value.trim(),
      studies: els.studiesInput.value.trim(),
      lifeAreas: splitCommaList(els.lifeAreasInput.value),
      people: splitCommaList(els.peopleInput.value),
      projects: splitCommaList(els.projectsInput.value),
      updatedAt: new Date().toISOString()
    };

    saveProfile(profile);
    notifyProfileChange();
    close();
  });

  els.skipBtn.addEventListener("click", () => {
    setOnboardingSkipped();
    close();
  });

  els.clearContextBtn.addEventListener("click", () => {
    clearProfile();
    clearFields();
    notifyProfileChange();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && getActiveScreen() === "onboarding") {
      setOnboardingSkipped();
      close();
    }
  });
}

export function resetOnboarding() {
  clearProfile();
  clearFields();
  notifyProfileChange();
}
