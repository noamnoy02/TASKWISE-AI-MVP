import { getUser, saveUser, getProfile } from "../storage.js";
import { uuid } from "../taskUtils.js";

const els = {
  heading: document.getElementById("userentryHeading"),
  desc: document.getElementById("userentryDesc"),
  form: document.getElementById("userentryForm"),
  input: document.getElementById("userentryInput"),
  error: document.getElementById("userentryError"),
  backBtn: document.getElementById("backToWelcomeBtn")
};

let onContinue = null;
let onBack = null;

function getMode() {
  return sessionStorage.getItem("taskwise_entry_mode") || "new";
}

function showError(msg) {
  els.error.textContent = msg;
  els.error.classList.remove("hidden");
}

function clearError() {
  els.error.textContent = "";
  els.error.classList.add("hidden");
}

function handleSubmit(event) {
  event.preventDefault();
  clearError();

  const raw = els.input.value.trim();
  if (!raw) {
    showError("Please enter an email or username.");
    return;
  }

  const isEmail = raw.includes("@");
  const displayName = isEmail ? raw.split("@")[0] : raw;

  const mode = getMode();
  const existingUser = getUser();
  const existingProfile = getProfile();

  // Returning-user path: check if a saved profile exists
  if (mode === "returning") {
    if (existingUser && existingProfile && existingProfile.onboardingCompleted) {
      // Already have a profile — proceed to home
      if (onContinue) onContinue(existingUser, false);
      return;
    }
    // No saved profile found
    if (!existingUser && !existingProfile) {
      showError("No profile found. Please get started to create one.");
      return;
    }
  }

  // New user or returning user without a complete profile
  const user = {
    id: existingUser?.id || uuid(),
    identifier: raw,
    displayName,
    isEmail,
    createdAt: existingUser?.createdAt || new Date().toISOString()
  };

  saveUser(user);

  const isNew = !existingProfile || !existingProfile.onboardingCompleted;
  if (onContinue) onContinue(user, isNew);
}

export function initUserEntryScreen(options = {}) {
  onContinue = options.onContinue || null;
  onBack = options.onBack || null;

  // Pre-fill if a user already exists
  const existing = getUser();
  if (existing) {
    els.input.value = existing.identifier || "";
  }

  els.form.addEventListener("submit", handleSubmit);
  els.backBtn.addEventListener("click", () => {
    clearError();
    if (onBack) onBack();
  });
}
