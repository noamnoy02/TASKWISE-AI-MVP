import { getUser, getProfile, saveProfile } from "../storage.js";
import { uuid } from "../taskUtils.js";

// ── Pub/sub for profile changes ───────────────────────────────────────
const profileChangeListeners = [];
export function onProfileChange(listener) { profileChangeListeners.push(listener); }
function notifyProfileChange() { profileChangeListeners.forEach(fn => fn()); }

// ── Step identifiers ──────────────────────────────────────────────────
const STEP_IDS = {
  intro:   "ob-intro",
  role:    "ob-role",
  areas:   "ob-areas",
  context: "ob-context",
  tasks:   "ob-tasks",
  done:    "ob-done"
};
const STEP_ORDER = ["intro", "role", "areas", "context", "tasks", "done"];
// Progress counts content steps (role through done)
const PROGRESS_STEPS = ["role", "areas", "context", "tasks", "done"];
const AREA_TO_SECTION = {
  Work:     "ctx-work",
  Studies:  "ctx-studies",
  Family:   "ctx-family",
  Home:     "ctx-home",
  Personal: "ctx-personal",
  Health:   "ctx-health",
  Finances: "ctx-finances"
};

// ── State ─────────────────────────────────────────────────────────────
let currentStep = "intro";
let onComplete = null;

const data = {
  userRole: null,
  lifeAreas: [],
  workContext: emptyWorkCtx(),
  studyContext: emptyStudyCtx(),
  familyContext: emptyFamilyCtx(),
  homeContext: emptyRespCtx(),
  personalContext: emptyRespCtx(),
  healthContext: emptyRespCtx(),
  financeContext: emptyRespCtx(),
  commonTaskTypes: [],
  commonTaskTypesCustom: []
};

function emptyWorkCtx() {
  return { industry: null, industryCustom: null, role: null, roleCustom: null, workplace: null, workplaceCustom: null, projectsOrPeople: [] };
}
function emptyStudyCtx() {
  return { institutionType: null, institutionTypeCustom: null, institution: null, institutionCustom: null, degreeLevel: null, degreeLevelCustom: null, fieldOfStudy: null, fieldOfStudyCustom: null, coursesOrPeople: [] };
}
function emptyFamilyCtx() {
  return { responsibilities: [], responsibilitiesCustom: [], people: [] };
}
function emptyRespCtx() {
  return { responsibilities: [], responsibilitiesCustom: [] };
}

// ── DOM helpers ───────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function show(id) { el(id)?.classList.remove("hidden"); }
function hide(id) { el(id)?.classList.add("hidden"); }
function getVal(id) { return el(id)?.value?.trim() || ""; }
function setVal(id, v) { const e = el(id); if (e) e.value = v ?? ""; }
function setSelVal(id, v) { const e = el(id); if (e) e.value = v ?? ""; }

// ── Progress ──────────────────────────────────────────────────────────

function updateProgress(step) {
  const isIntro = step === "intro";
  const bar = el("obProgressBar");
  if (bar) bar.classList.toggle("hidden", isIntro);

  const idx = PROGRESS_STEPS.indexOf(step);
  if (idx < 0) return;
  const pct = Math.round(((idx + 1) / PROGRESS_STEPS.length) * 100);
  const fill = el("progressFill");
  const text = el("progressText");
  if (fill) fill.style.width = `${pct}%`;
  if (text) text.textContent = `Step ${idx + 1} of ${PROGRESS_STEPS.length}`;
}

// ── Navigation ────────────────────────────────────────────────────────

function goToStep(step) {
  Object.values(STEP_IDS).forEach(divId => el(divId)?.classList.add("hidden"));
  el(STEP_IDS[step])?.classList.remove("hidden");
  currentStep = step;
  updateProgress(step);
  window.scrollTo(0, 0);
}

function goBack() {
  const idx = STEP_ORDER.indexOf(currentStep);
  if (idx > 0) goToStep(STEP_ORDER[idx - 1]);
}

// ── Chip group initializer ────────────────────────────────────────────
// Handles both multi-select and single-select chip groups.
// If otherWrapId is provided, chips with data-triggers-other="true" toggle that wrap.

function initChipGroup(containerId, otherWrapId = null, otherInputId = null) {
  const container = el(containerId);
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

      if (chip.dataset.triggersOther === "true" && otherWrapId) {
        const isOn = chip.classList.contains("selected");
        el(otherWrapId)?.classList.toggle("hidden", !isOn);
        if (!isOn && otherInputId) setVal(otherInputId, "");
      }
    });
  });
}

// ── "Other" wiring for datalist inputs ───────────────────────────────
// When the input value is exactly "Other", shows the custom field below.

function wireOtherInput(inputId, wrapId, customId) {
  const input = el(inputId);
  const wrap = el(wrapId);
  if (!input || !wrap) return;

  function check() {
    const isOther = input.value.trim() === "Other";
    wrap.classList.toggle("hidden", !isOther);
    if (!isOther) setVal(customId, "");
  }
  input.addEventListener("input", check);
  input.addEventListener("change", check);
}

// ── "Other" wiring for <select> elements ─────────────────────────────

function wireOtherSelect(selectId, wrapId, customId) {
  const select = el(selectId);
  const wrap = el(wrapId);
  if (!select || !wrap) return;

  function check() {
    const isOther = select.value === "Other";
    wrap.classList.toggle("hidden", !isOther);
    if (!isOther) setVal(customId, "");
  }
  select.addEventListener("change", check);
}

// ── Chip value helpers ────────────────────────────────────────────────

function getChipValues(containerId) {
  const container = el(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll(".chip.selected")).map(b => b.dataset.value);
}

function restoreChipGroup(containerId, selectedValues) {
  const container = el(containerId);
  if (!container) return;
  container.querySelectorAll(".chip").forEach(c => {
    c.classList.toggle("selected", selectedValues.includes(c.dataset.value));
  });
}

// ── Accordion: open one section, close others ────────────────────────

function openAccordionSection(section) {
  if (!section) return;
  document.querySelectorAll("#ob-context .context-section").forEach(s => s.classList.remove("accordion-open"));
  section.classList.add("accordion-open");
}

// ── Context sections: show/hide based on life areas ───────────────────

function showContextSections() {
  Object.values(AREA_TO_SECTION).forEach(id => hide(id));
  let firstSection = null;
  data.lifeAreas.forEach(area => {
    const sectionId = AREA_TO_SECTION[area];
    if (sectionId) {
      show(sectionId);
      if (!firstSection) firstSection = el(sectionId);
    }
  });
  // Auto-open the first visible accordion section
  document.querySelectorAll("#ob-context .context-section").forEach(s => s.classList.remove("accordion-open"));
  if (firstSection) firstSection.classList.add("accordion-open");
}

// ── Accordion init (runs once at startup) ────────────────────────────

function initContextAccordions() {
  document.querySelectorAll("#ob-context .context-section").forEach(section => {
    const heading = section.querySelector(".section-heading");
    if (!heading) return;

    // Wrap everything after the heading in an accordion-body div
    const body = document.createElement("div");
    body.className = "accordion-body";
    Array.from(section.childNodes)
      .filter(n => n !== heading)
      .forEach(n => body.appendChild(n));
    section.appendChild(body);

    // Make heading act as accordion trigger
    heading.classList.add("accordion-trigger");
    const chevron = document.createElement("span");
    chevron.className = "accordion-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    heading.appendChild(chevron);

    heading.addEventListener("click", () => {
      const isOpen = section.classList.contains("accordion-open");
      openAccordionSection(isOpen ? null : section);
    });
  });
}

// ── Task type chips: filter by life areas ─────────────────────────────

function filterTaskTypeChips() {
  document.querySelectorAll("#taskTypesChips .task-chip").forEach(chip => {
    const areas = (chip.dataset.areas || "").split(",").map(s => s.trim());
    const isUniversal = areas.includes("*");
    const isRelevant = isUniversal || areas.some(a => data.lifeAreas.includes(a));
    chip.classList.toggle("hidden", !isRelevant);
    if (!isRelevant) chip.classList.remove("selected");
  });
}

// ── Data collection ───────────────────────────────────────────────────

function splitList(str) {
  return String(str || "").split(/[,;،\n]+/).map(s => s.trim()).filter(Boolean);
}

function effectiveInputVal(inputId, customId) {
  const val = getVal(inputId);
  return val === "Other" ? getVal(customId) || null : val || null;
}

function effectiveSelectVal(selectId, customId) {
  const val = getVal(selectId);
  return val === "Other" ? getVal(customId) || null : val || null;
}

function getOtherChipCustom(chipGroupId, otherInputId) {
  const container = el(chipGroupId);
  const otherChip = container?.querySelector('.chip[data-value="Other"]');
  if (otherChip?.classList.contains("selected")) {
    const raw = getVal(otherInputId).trim();
    return raw ? splitList(raw) : [];
  }
  return [];
}

function collectContextData() {
  if (data.lifeAreas.includes("Work")) {
    data.workContext = {
      industry: getVal("ctxWorkIndustry") || null,
      industryCustom: getVal("ctxWorkIndustry") === "Other" ? getVal("ctxWorkIndustryCustom") || null : null,
      role: getVal("ctxWorkRole") || null,
      roleCustom: getVal("ctxWorkRole") === "Other" ? getVal("ctxWorkRoleCustom") || null : null,
      workplace: getVal("ctxWorkplace") || null,
      workplaceCustom: getVal("ctxWorkplace") === "Other" ? getVal("ctxWorkplaceCustom") || null : null,
      projectsOrPeople: splitList(getVal("ctxWorkProjects"))
    };
  }

  if (data.lifeAreas.includes("Studies")) {
    const instType = getVal("ctxStudyInstType");
    const degree = getVal("ctxStudyDegree");
    data.studyContext = {
      institutionType: instType || null,
      institutionTypeCustom: instType === "Other" ? getVal("ctxStudyInstTypeCustom") || null : null,
      institution: getVal("ctxStudyInstitution") || null,
      institutionCustom: getVal("ctxStudyInstitution") === "Other" ? getVal("ctxStudyInstitutionCustom") || null : null,
      degreeLevel: degree || null,
      degreeLevelCustom: degree === "Other" ? getVal("ctxStudyDegreeCustom") || null : null,
      fieldOfStudy: getVal("ctxStudyField") || null,
      fieldOfStudyCustom: getVal("ctxStudyField") === "Other" ? getVal("ctxStudyFieldCustom") || null : null,
      coursesOrPeople: splitList(getVal("ctxStudyCourses"))
    };
  }

  if (data.lifeAreas.includes("Family")) {
    data.familyContext = {
      responsibilities: getChipValues("familyRespChips").filter(v => v !== "Other"),
      responsibilitiesCustom: getOtherChipCustom("familyRespChips", "familyRespOther"),
      people: splitList(getVal("ctxFamilyPeople"))
    };
  }

  if (data.lifeAreas.includes("Home")) {
    data.homeContext = {
      responsibilities: getChipValues("homeRespChips").filter(v => v !== "Other"),
      responsibilitiesCustom: getOtherChipCustom("homeRespChips", "homeRespOther")
    };
  }

  if (data.lifeAreas.includes("Personal")) {
    data.personalContext = {
      responsibilities: getChipValues("personalRespChips").filter(v => v !== "Other"),
      responsibilitiesCustom: getOtherChipCustom("personalRespChips", "personalRespOther")
    };
  }

  if (data.lifeAreas.includes("Health")) {
    data.healthContext = {
      responsibilities: getChipValues("healthRespChips").filter(v => v !== "Other"),
      responsibilitiesCustom: getOtherChipCustom("healthRespChips", "healthRespOther")
    };
  }

  if (data.lifeAreas.includes("Finances")) {
    data.financeContext = {
      responsibilities: getChipValues("financeRespChips").filter(v => v !== "Other"),
      responsibilitiesCustom: getOtherChipCustom("financeRespChips", "financeRespOther")
    };
  }
}

function collectTaskTypesData() {
  const selected = getChipValues("taskTypesChips").filter(v => v !== "other");
  const otherChip = document.querySelector('#taskTypesChips .chip[data-value="other"]');
  let custom = [];
  if (otherChip?.classList.contains("selected")) {
    custom = splitList(getVal("taskTypesOther"));
  }
  data.commonTaskTypes = selected;
  data.commonTaskTypesCustom = custom;
}

// ── Context step validation ───────────────────────────────────────────
// If user explicitly selected "Other" in any field, the custom field must be filled.

function validateContextOther() {
  const err = el("obContextError");

  const datalistPairs = [
    ["ctxWorkIndustry", "ctxWorkIndustryCustom"],
    ["ctxWorkRole", "ctxWorkRoleCustom"],
    ["ctxWorkplace", "ctxWorkplaceCustom"],
    ["ctxStudyInstitution", "ctxStudyInstitutionCustom"],
    ["ctxStudyField", "ctxStudyFieldCustom"]
  ];
  for (const [inputId, customId] of datalistPairs) {
    const input = el(inputId);
    if (input?.value.trim() === "Other") {
      const custom = el(customId);
      if (!custom?.value.trim()) {
        err?.classList.remove("hidden");
        openAccordionSection(custom?.closest(".context-section"));
        custom?.focus();
        return false;
      }
    }
  }

  const selectPairs = [
    ["ctxStudyInstType", "ctxStudyInstTypeCustom"],
    ["ctxStudyDegree", "ctxStudyDegreeCustom"]
  ];
  for (const [selId, customId] of selectPairs) {
    const sel = el(selId);
    if (sel?.value === "Other") {
      const custom = el(customId);
      if (!custom?.value.trim()) {
        err?.classList.remove("hidden");
        openAccordionSection(custom?.closest(".context-section"));
        custom?.focus();
        return false;
      }
    }
  }

  const chipOtherPairs = [
    ["familyRespChips", "familyRespOther"],
    ["homeRespChips", "homeRespOther"],
    ["personalRespChips", "personalRespOther"],
    ["healthRespChips", "healthRespOther"],
    ["financeRespChips", "financeRespOther"]
  ];
  for (const [groupId, inputId] of chipOtherPairs) {
    const container = el(groupId);
    const otherChip = container?.querySelector('.chip[data-value="Other"]');
    if (otherChip?.classList.contains("selected")) {
      const custom = el(inputId);
      if (!custom?.value.trim()) {
        err?.classList.remove("hidden");
        openAccordionSection(custom?.closest(".context-section"));
        custom?.focus();
        return false;
      }
    }
  }

  err?.classList.add("hidden");
  return true;
}

// ── Advance / back ────────────────────────────────────────────────────

function advance() {
  if (currentStep === "intro") {
    goToStep("role");
    return;
  }

  if (currentStep === "role") {
    const selected = el("roleCards")?.querySelector(".role-card.selected");
    if (!selected) {
      el("roleError")?.classList.remove("hidden");
      return;
    }
    el("roleError")?.classList.add("hidden");
    data.userRole = selected.dataset.value;
    goToStep("areas");
    return;
  }

  if (currentStep === "areas") {
    const selected = getChipValues("lifeAreasChips");
    const errEl = el("lifeAreasError");
    if (!selected.length) { errEl?.classList.remove("hidden"); return; }
    errEl?.classList.add("hidden");
    data.lifeAreas = selected;
    showContextSections();
    goToStep("context");
    return;
  }

  if (currentStep === "context") {
    if (!validateContextOther()) return;
    collectContextData();
    filterTaskTypeChips();
    goToStep("tasks");
    return;
  }

  if (currentStep === "tasks") {
    collectTaskTypesData();
    goToStep("done");
    return;
  }

  if (currentStep === "done") {
    finishOnboarding();
  }
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
    userRole: data.userRole || null,
    lifeAreas: [...data.lifeAreas],
    workContext: { ...data.workContext },
    studyContext: { ...data.studyContext },
    familyContext: { ...data.familyContext },
    homeContext: { ...data.homeContext },
    personalContext: { ...data.personalContext },
    healthContext: { ...data.healthContext },
    financeContext: { ...data.financeContext },
    commonTaskTypes: [...data.commonTaskTypes],
    commonTaskTypesCustom: [...data.commonTaskTypesCustom],
    onboardingCompleted: true,
    updatedAt: new Date().toISOString()
  };

  saveProfile(profile);
  notifyProfileChange();
  if (onComplete) onComplete();
}

// ── Migrate old profile to new schema ────────────────────────────────
// Reads old schema fields and maps them into the new data object.

function migrateOldProfile(p) {
  data.userRole = p.userRole || null;
  data.lifeAreas = p.lifeAreas || [];

  // Work
  const wc = p.workContext;
  if (wc) {
    // Old schema stored projectsOrPeople as separate strings
    const projects = Array.isArray(wc.projectsOrPeople) && wc.projectsOrPeople.length
      ? wc.projectsOrPeople
      : splitList([wc.commonProjects, wc.knownPeople].filter(Boolean).join(", "));
    data.workContext = {
      industry: wc.industry || null,
      industryCustom: wc.industryCustom || null,
      role: wc.role || null,
      roleCustom: wc.roleCustom || null,
      workplace: wc.workplace || null,
      workplaceCustom: wc.workplaceCustom || null,
      projectsOrPeople: projects
    };
  }

  // Studies — old schema: studyType → institutionType, field → fieldOfStudy
  const sc = p.studyContext;
  if (sc) {
    const instTypeMap = {
      "Undergraduate degree": "University",
      "Graduate degree": "University",
      "Professional course": "Professional Course",
      "Certification": "Certification Program",
      "School": "High School"
    };
    const courses = Array.isArray(sc.coursesOrPeople) && sc.coursesOrPeople.length
      ? sc.coursesOrPeople
      : splitList(sc.commonProjects || "");
    data.studyContext = {
      institutionType: sc.institutionType || instTypeMap[sc.studyType] || sc.studyType || null,
      institutionTypeCustom: sc.institutionTypeCustom || null,
      institution: sc.institution || null,
      institutionCustom: sc.institutionCustom || null,
      degreeLevel: sc.degreeLevel || null,
      degreeLevelCustom: sc.degreeLevelCustom || null,
      fieldOfStudy: sc.fieldOfStudy || sc.field || null,
      fieldOfStudyCustom: sc.fieldOfStudyCustom || null,
      coursesOrPeople: courses
    };
  }

  // Family/Home — old schema stored these under a single familyContext
  const fc = p.familyContext;
  if (fc) {
    data.familyContext = {
      responsibilities: fc.responsibilities || [],
      responsibilitiesCustom: fc.responsibilitiesCustom || [],
      people: fc.people || splitList(fc.members || "")
    };
  }

  data.homeContext = p.homeContext || emptyRespCtx();
  data.personalContext = p.personalContext || emptyRespCtx();
  data.healthContext = p.healthContext || emptyRespCtx();
  data.financeContext = p.financeContext || emptyRespCtx();

  data.commonTaskTypes = p.commonTaskTypes || [];
  data.commonTaskTypesCustom = p.commonTaskTypesCustom || [];
}

// ── Populate form from saved profile ─────────────────────────────────

function populateFromProfile() {
  const p = getProfile();
  if (!p) return;

  migrateOldProfile(p);

  // Role
  if (data.userRole) {
    document.querySelectorAll("#ob-role .role-card").forEach(card => {
      card.classList.toggle("selected", card.dataset.value === data.userRole);
    });
  }

  // Life areas
  restoreChipGroup("lifeAreasChips", data.lifeAreas);

  // Work
  setVal("ctxWorkIndustry", data.workContext.industry || "");
  if (data.workContext.industry === "Other") {
    show("ctxWorkIndustryCustomWrap");
    setVal("ctxWorkIndustryCustom", data.workContext.industryCustom || "");
  }
  setVal("ctxWorkRole", data.workContext.role || "");
  if (data.workContext.role === "Other") {
    show("ctxWorkRoleCustomWrap");
    setVal("ctxWorkRoleCustom", data.workContext.roleCustom || "");
  }
  setVal("ctxWorkplace", data.workContext.workplace || "");
  if (data.workContext.workplace === "Other") {
    show("ctxWorkplaceCustomWrap");
    setVal("ctxWorkplaceCustom", data.workContext.workplaceCustom || "");
  }
  setVal("ctxWorkProjects", (data.workContext.projectsOrPeople || []).join(", "));

  // Studies
  setSelVal("ctxStudyInstType", data.studyContext.institutionType || "");
  if (data.studyContext.institutionType === "Other") {
    show("ctxStudyInstTypeCustomWrap");
    setVal("ctxStudyInstTypeCustom", data.studyContext.institutionTypeCustom || "");
  }
  setVal("ctxStudyInstitution", data.studyContext.institution || "");
  if (data.studyContext.institution === "Other") {
    show("ctxStudyInstitutionCustomWrap");
    setVal("ctxStudyInstitutionCustom", data.studyContext.institutionCustom || "");
  }
  setSelVal("ctxStudyDegree", data.studyContext.degreeLevel || "");
  if (data.studyContext.degreeLevel === "Other") {
    show("ctxStudyDegreeCustomWrap");
    setVal("ctxStudyDegreeCustom", data.studyContext.degreeLevelCustom || "");
  }
  setVal("ctxStudyField", data.studyContext.fieldOfStudy || "");
  if (data.studyContext.fieldOfStudy === "Other") {
    show("ctxStudyFieldCustomWrap");
    setVal("ctxStudyFieldCustom", data.studyContext.fieldOfStudyCustom || "");
  }
  setVal("ctxStudyCourses", (data.studyContext.coursesOrPeople || []).join(", "));

  // Family
  restoreChipGroup("familyRespChips", [
    ...(data.familyContext.responsibilities || []),
    ...(data.familyContext.responsibilitiesCustom?.length ? ["Other"] : [])
  ]);
  if (data.familyContext.responsibilitiesCustom?.length) {
    show("familyRespOtherWrap");
    setVal("familyRespOther", data.familyContext.responsibilitiesCustom.join(", "));
  }
  setVal("ctxFamilyPeople", (data.familyContext.people || []).join(", "));

  // Home
  restoreChipGroup("homeRespChips", [
    ...(data.homeContext.responsibilities || []),
    ...(data.homeContext.responsibilitiesCustom?.length ? ["Other"] : [])
  ]);
  if (data.homeContext.responsibilitiesCustom?.length) {
    show("homeRespOtherWrap");
    setVal("homeRespOther", data.homeContext.responsibilitiesCustom.join(", "));
  }

  // Personal
  restoreChipGroup("personalRespChips", [
    ...(data.personalContext.responsibilities || []),
    ...(data.personalContext.responsibilitiesCustom?.length ? ["Other"] : [])
  ]);
  if (data.personalContext.responsibilitiesCustom?.length) {
    show("personalRespOtherWrap");
    setVal("personalRespOther", data.personalContext.responsibilitiesCustom.join(", "));
  }

  // Health
  restoreChipGroup("healthRespChips", [
    ...(data.healthContext.responsibilities || []),
    ...(data.healthContext.responsibilitiesCustom?.length ? ["Other"] : [])
  ]);
  if (data.healthContext.responsibilitiesCustom?.length) {
    show("healthRespOtherWrap");
    setVal("healthRespOther", data.healthContext.responsibilitiesCustom.join(", "));
  }

  // Finances
  restoreChipGroup("financeRespChips", [
    ...(data.financeContext.responsibilities || []),
    ...(data.financeContext.responsibilitiesCustom?.length ? ["Other"] : [])
  ]);
  if (data.financeContext.responsibilitiesCustom?.length) {
    show("financeRespOtherWrap");
    setVal("financeRespOther", data.financeContext.responsibilitiesCustom.join(", "));
  }

  // Task types
  const ttContainer = el("taskTypesChips");
  if (ttContainer) {
    ttContainer.querySelectorAll(".chip").forEach(c => {
      c.classList.toggle("selected", data.commonTaskTypes.includes(c.dataset.value));
    });
    if (data.commonTaskTypesCustom?.length) {
      const otherChip = ttContainer.querySelector('.chip[data-value="other"]');
      if (otherChip) otherChip.classList.add("selected");
      show("taskTypesOtherWrap");
      setVal("taskTypesOther", data.commonTaskTypesCustom.join(", "));
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────

export function openOnboardingForEdit(callback) {
  if (callback) onComplete = callback;
  populateFromProfile();
  import("../nav.js").then(({ showScreen }) => showScreen("onboarding"));
}

export function initOnboardingScreen(options = {}) {
  onComplete = options.onComplete || null;

  // Life areas chip group (no "Other" chip)
  initChipGroup("lifeAreasChips");

  // Responsibility chip groups — each has an "Other" chip
  initChipGroup("familyRespChips", "familyRespOtherWrap", "familyRespOther");
  initChipGroup("homeRespChips", "homeRespOtherWrap", "homeRespOther");
  initChipGroup("personalRespChips", "personalRespOtherWrap", "personalRespOther");
  initChipGroup("healthRespChips", "healthRespOtherWrap", "healthRespOther");
  initChipGroup("financeRespChips", "financeRespOtherWrap", "financeRespOther");

  // Task types chip group — has an "Other" chip
  initChipGroup("taskTypesChips", "taskTypesOtherWrap", "taskTypesOther");

  // Wire datalist "Other" detection
  wireOtherInput("ctxWorkIndustry", "ctxWorkIndustryCustomWrap", "ctxWorkIndustryCustom");
  wireOtherInput("ctxWorkRole", "ctxWorkRoleCustomWrap", "ctxWorkRoleCustom");
  wireOtherInput("ctxWorkplace", "ctxWorkplaceCustomWrap", "ctxWorkplaceCustom");
  wireOtherInput("ctxStudyInstitution", "ctxStudyInstitutionCustomWrap", "ctxStudyInstitutionCustom");
  wireOtherInput("ctxStudyField", "ctxStudyFieldCustomWrap", "ctxStudyFieldCustom");

  // Wire select "Other" detection
  wireOtherSelect("ctxStudyInstType", "ctxStudyInstTypeCustomWrap", "ctxStudyInstTypeCustom");
  wireOtherSelect("ctxStudyDegree", "ctxStudyDegreeCustomWrap", "ctxStudyDegreeCustom");

  // Accordion for context sections
  initContextAccordions();

  // Role card single-select
  document.querySelectorAll("#ob-role .role-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll("#ob-role .role-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      el("roleError")?.classList.add("hidden");
    });
  });

  // Navigation buttons
  el("obIntroBtn")?.addEventListener("click", advance);
  el("obRoleBtn")?.addEventListener("click", advance);
  el("obAreasBtn")?.addEventListener("click", advance);
  el("obContextBtn")?.addEventListener("click", advance);
  el("obContextSkipBtn")?.addEventListener("click", () => {
    filterTaskTypeChips();
    goToStep("tasks");
  });
  el("obTasksBtn")?.addEventListener("click", advance);
  el("obTasksSkipBtn")?.addEventListener("click", () => goToStep("done"));
  el("obDoneBtn")?.addEventListener("click", finishOnboarding);

  // Back buttons
  document.querySelectorAll(".ob-back").forEach(btn => {
    btn.addEventListener("click", goBack);
  });

  goToStep("intro");
}
