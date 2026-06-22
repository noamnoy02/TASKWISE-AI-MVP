import { getUser, getProfile, saveProfile } from "../storage.js";
import { uuid } from "../taskUtils.js";

// ── Pub/sub for profile changes (used by capture.js context status) ──
const profileChangeListeners = [];
export function onProfileChange(listener) {
  profileChangeListeners.push(listener);
}
function notifyProfileChange() {
  profileChangeListeners.forEach(fn => fn());
}

// ── DOM refs ──────────────────────────────────────────────────────────
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");

const steps = {
  1: document.getElementById("obStep1"),
  2: document.getElementById("obStep2"),
  3: document.getElementById("obStep3"),
  4: document.getElementById("obStep4"),
  5: document.getElementById("obStep5"),
  6: document.getElementById("obStep6"),
  7: document.getElementById("obStep7"),
  8: document.getElementById("obStep8")
};

// ── State ─────────────────────────────────────────────────────────────
let currentStep = 1;
let onComplete = null;

const data = {
  lifeAreas: [],
  currentSituation: null,
  workContext: { industry: null, role: null, commonProjects: null, knownPeople: null },
  studyContext: { studyType: null, field: null, institution: null, commonProjects: null },
  familyContext: { responsibilities: [] },
  commonTaskTypes: []
};

// ── Step sequence logic ───────────────────────────────────────────────

function getApplicableSteps() {
  const list = [1, 2, 3];
  if (data.lifeAreas.includes("Work")) list.push(4);
  if (data.lifeAreas.includes("Studies")) list.push(5);
  if (data.lifeAreas.includes("Family") || data.lifeAreas.includes("Home")) list.push(6);
  list.push(7, 8);
  return list;
}

function getNextStep(current) {
  const list = getApplicableSteps();
  const idx = list.indexOf(current);
  return idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
}

function getPrevStep(current) {
  const list = getApplicableSteps();
  const idx = list.indexOf(current);
  return idx > 0 ? list[idx - 1] : null;
}

// ── Progress bar ──────────────────────────────────────────────────────

function updateProgress(step) {
  const list = getApplicableSteps();
  const idx = list.indexOf(step);
  const total = list.length;
  const pct = Math.round(((idx + 1) / total) * 100);
  progressFill.style.width = `${pct}%`;
  progressText.textContent = `Step ${idx + 1} of ${total}`;
}

// ── Chip selection helpers ────────────────────────────────────────────

function getChipValues(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];
  const isMulti = container.dataset.multi === "true";
  if (isMulti) {
    return Array.from(container.querySelectorAll(".chip.selected")).map(b => b.dataset.value);
  }
  const sel = container.querySelector(".chip.selected");
  return sel ? [sel.dataset.value] : [];
}

function initChipGroup(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const isMulti = container.dataset.multi === "true";

  container.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      if (isMulti) {
        chip.classList.toggle("selected");
      } else {
        container.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
      }
    });
  });
}

// ── Step navigation ───────────────────────────────────────────────────

function goToStep(step) {
  // Hide all steps
  Object.values(steps).forEach(el => el.classList.add("hidden"));
  steps[step].classList.remove("hidden");
  currentStep = step;
  updateProgress(step);
  window.scrollTo(0, 0);
}

function advance() {
  // Collect data before moving forward
  if (currentStep === 2) {
    const selected = getChipValues("lifeAreasChips");
    const err = document.getElementById("lifeAreasError");
    if (!selected.length) {
      err.classList.remove("hidden");
      return;
    }
    err.classList.add("hidden");
    data.lifeAreas = selected;
  }

  if (currentStep === 3) {
    const [val] = getChipValues("situationChips");
    data.currentSituation = val || null;
  }

  if (currentStep === 4) {
    const [industry] = getChipValues("industryChips");
    data.workContext.industry = industry || null;
    data.workContext.role = document.getElementById("workRoleInput").value.trim() || null;
    const projects = document.getElementById("workProjectsInput").value.trim();
    // Split combined field into people and projects by comma
    const parts = projects.split(",").map(s => s.trim()).filter(Boolean);
    data.workContext.knownPeople = parts.filter(p => /^[A-Za-zא-ת]/.test(p)).join(", ") || null;
    data.workContext.commonProjects = projects || null;
  }

  if (currentStep === 5) {
    const [studyType] = getChipValues("studyTypeChips");
    data.studyContext.studyType = studyType || null;
    data.studyContext.field = document.getElementById("studyFieldInput").value.trim() || null;
    data.studyContext.institution = document.getElementById("studyInstitutionInput").value.trim() || null;
    data.studyContext.commonProjects = document.getElementById("studyProjectsInput").value.trim() || null;
  }

  if (currentStep === 6) {
    data.familyContext.responsibilities = getChipValues("familyChips");
  }

  if (currentStep === 7) {
    data.commonTaskTypes = getChipValues("taskTypesChips");
  }

  if (currentStep === 8) {
    finishOnboarding();
    return;
  }

  const next = getNextStep(currentStep);
  if (next !== null) goToStep(next);
}

function goBack() {
  const prev = getPrevStep(currentStep);
  if (prev !== null) goToStep(prev);
}

// ── Save profile ──────────────────────────────────────────────────────

function finishOnboarding() {
  const user = getUser();
  const existing = getProfile();

  const profile = {
    id: existing?.id || uuid(),
    username: user?.identifier || "",
    email: user?.isEmail ? user.identifier : "",
    displayName: user?.displayName || user?.identifier || "",
    lifeAreas: data.lifeAreas,
    currentSituation: data.currentSituation,
    workContext: { ...data.workContext },
    studyContext: { ...data.studyContext },
    familyContext: { responsibilities: [...data.familyContext.responsibilities] },
    commonTaskTypes: [...data.commonTaskTypes],
    onboardingCompleted: true,
    updatedAt: new Date().toISOString()
  };

  saveProfile(profile);
  notifyProfileChange();

  if (onComplete) onComplete();
}

// ── Pre-populate when editing an existing profile ─────────────────────

function populateFromProfile() {
  const p = getProfile();
  if (!p) return;

  // Life areas
  data.lifeAreas = p.lifeAreas || [];
  const laChips = document.getElementById("lifeAreasChips");
  if (laChips) {
    laChips.querySelectorAll(".chip").forEach(c => {
      if (data.lifeAreas.includes(c.dataset.value)) c.classList.add("selected");
    });
  }

  // Situation
  data.currentSituation = p.currentSituation || null;
  const sitChips = document.getElementById("situationChips");
  if (sitChips && data.currentSituation) {
    const match = sitChips.querySelector(`.chip[data-value="${CSS.escape(data.currentSituation)}"]`);
    if (match) match.classList.add("selected");
  }

  // Work
  if (p.workContext) {
    data.workContext = { ...p.workContext };
    const indChips = document.getElementById("industryChips");
    if (indChips && p.workContext.industry) {
      const match = indChips.querySelector(`.chip[data-value="${CSS.escape(p.workContext.industry)}"]`);
      if (match) match.classList.add("selected");
    }
    const roleEl = document.getElementById("workRoleInput");
    if (roleEl) roleEl.value = p.workContext.role || "";
    const projEl = document.getElementById("workProjectsInput");
    if (projEl) projEl.value = p.workContext.commonProjects || "";
  }

  // Study
  if (p.studyContext) {
    data.studyContext = { ...p.studyContext };
    const stChips = document.getElementById("studyTypeChips");
    if (stChips && p.studyContext.studyType) {
      const match = stChips.querySelector(`.chip[data-value="${CSS.escape(p.studyContext.studyType)}"]`);
      if (match) match.classList.add("selected");
    }
    const fieldEl = document.getElementById("studyFieldInput");
    if (fieldEl) fieldEl.value = p.studyContext.field || "";
    const instEl = document.getElementById("studyInstitutionInput");
    if (instEl) instEl.value = p.studyContext.institution || "";
    const spEl = document.getElementById("studyProjectsInput");
    if (spEl) spEl.value = p.studyContext.commonProjects || "";
  }

  // Family
  if (p.familyContext) {
    data.familyContext.responsibilities = p.familyContext.responsibilities || [];
    const famChips = document.getElementById("familyChips");
    if (famChips) {
      famChips.querySelectorAll(".chip").forEach(c => {
        if (data.familyContext.responsibilities.includes(c.dataset.value)) c.classList.add("selected");
      });
    }
  }

  // Task types
  data.commonTaskTypes = p.commonTaskTypes || [];
  const ttChips = document.getElementById("taskTypesChips");
  if (ttChips) {
    ttChips.querySelectorAll(".chip").forEach(c => {
      if (data.commonTaskTypes.includes(c.dataset.value)) c.classList.add("selected");
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────

export function openOnboardingForEdit(callback) {
  if (callback) onComplete = callback;
  populateFromProfile();
  // Import showScreen lazily to avoid circular dependency
  import("../nav.js").then(({ showScreen }) => showScreen("onboarding"));
}

export function initOnboardingScreen(options = {}) {
  onComplete = options.onComplete || null;

  // Init all chip groups
  ["lifeAreasChips", "situationChips", "industryChips",
    "studyTypeChips", "familyChips", "taskTypesChips"].forEach(initChipGroup);

  // Step-advance buttons
  document.getElementById("ob1Btn").addEventListener("click", advance);
  document.getElementById("ob2Btn").addEventListener("click", advance);
  document.getElementById("ob3Btn").addEventListener("click", advance);
  document.getElementById("ob4Btn").addEventListener("click", advance);
  document.getElementById("ob5Btn").addEventListener("click", advance);
  document.getElementById("ob6Btn").addEventListener("click", advance);
  document.getElementById("ob7Btn").addEventListener("click", advance);
  document.getElementById("ob8Btn").addEventListener("click", advance);

  // Skip buttons (step without saving step data)
  document.getElementById("ob4SkipBtn").addEventListener("click", () => {
    const next = getNextStep(currentStep);
    if (next !== null) goToStep(next);
  });
  document.getElementById("ob5SkipBtn").addEventListener("click", () => {
    const next = getNextStep(currentStep);
    if (next !== null) goToStep(next);
  });
  document.getElementById("ob6SkipBtn").addEventListener("click", () => {
    const next = getNextStep(currentStep);
    if (next !== null) goToStep(next);
  });
  document.getElementById("ob7SkipBtn").addEventListener("click", () => {
    const next = getNextStep(currentStep);
    if (next !== null) goToStep(next);
  });

  // Back buttons (all .ob-back elements)
  document.querySelectorAll(".ob-back").forEach(btn => {
    btn.addEventListener("click", goBack);
  });

  // Reset to step 1 state on first load
  goToStep(1);
}
