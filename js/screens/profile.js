import { getUser, getProfile } from "../storage.js";
import { escapeHtml } from "../taskUtils.js";

const els = {
  avatar: document.getElementById("profileAvatar"),
  displayName: document.getElementById("profileDisplayName"),
  identifier: document.getElementById("profileIdentifier"),
  lifeAreasSection: document.getElementById("profileLifeAreasSection"),
  lifeAreasChips: document.getElementById("profileLifeAreasChips"),
  workSection: document.getElementById("profileWorkSection"),
  workDetail: document.getElementById("profileWorkDetail"),
  studySection: document.getElementById("profileStudySection"),
  studyDetail: document.getElementById("profileStudyDetail"),
  familySection: document.getElementById("profileFamilySection"),
  familyChips: document.getElementById("profileFamilyChips"),
  taskTypesSection: document.getElementById("profileTaskTypesSection"),
  taskTypesChips: document.getElementById("profileTaskTypesChips"),
  aiContext: document.getElementById("profileAiContext"),
  editBtn: document.getElementById("editProfileBtn"),
  switchBtn: document.getElementById("switchProfileBtn")
};

let callbacks = {};

function chipTag(label) {
  return `<span class="chip-tag">${escapeHtml(label)}</span>`;
}

function renderChips(container, items) {
  container.innerHTML = items.length
    ? items.map(chipTag).join("")
    : `<span class="muted" style="font-size:0.84rem">None recorded</span>`;
}

function effectiveField(primary, custom) {
  return (!primary || primary === "Other") ? (custom || null) : primary;
}

function buildAiContextText(profile) {
  if (!profile) return "No profile data yet.";
  const lines = [];

  if (profile.lifeAreas?.length) lines.push(`Life areas: ${profile.lifeAreas.join(", ")}`);

  const wc = profile.workContext;
  if (wc) {
    const industry = effectiveField(wc.industry, wc.industryCustom);
    const role = effectiveField(wc.role, wc.roleCustom);
    const workplace = effectiveField(wc.workplace, wc.workplaceCustom);
    if (role) lines.push(`Role: ${role}`);
    if (industry) lines.push(`Industry: ${industry}`);
    if (workplace) lines.push(`Workplace: ${workplace}`);
    // New schema: projectsOrPeople array; old: knownPeople/commonProjects strings
    const projects = wc.projectsOrPeople?.length
      ? wc.projectsOrPeople.join(", ")
      : [wc.knownPeople, wc.commonProjects].filter(Boolean).join(", ");
    if (projects) lines.push(`Work projects/people: ${projects}`);
  }

  const sc = profile.studyContext;
  if (sc) {
    const institution = effectiveField(sc.institution, sc.institutionCustom);
    const degree = effectiveField(sc.degreeLevel, sc.degreeLevelCustom) || sc.studyType;
    // New schema: fieldOfStudy; old: field
    const field = effectiveField(sc.fieldOfStudy || sc.field, sc.fieldOfStudyCustom);
    if (institution) lines.push(`Institution: ${institution}`);
    if (degree) lines.push(`Degree: ${degree}`);
    if (field) lines.push(`Field: ${field}`);
    const courses = sc.coursesOrPeople?.length
      ? sc.coursesOrPeople.join(", ")
      : sc.commonProjects;
    if (courses) lines.push(`Courses/projects: ${courses}`);
  }

  if (profile.familyContext?.responsibilities?.length) {
    lines.push(`Family: ${profile.familyContext.responsibilities.join(", ")}`);
  }
  if (profile.homeContext?.responsibilities?.length) {
    lines.push(`Home: ${profile.homeContext.responsibilities.join(", ")}`);
  }
  if (profile.healthContext?.responsibilities?.length) {
    lines.push(`Health: ${profile.healthContext.responsibilities.join(", ")}`);
  }
  if (profile.financeContext?.responsibilities?.length) {
    lines.push(`Finances: ${profile.financeContext.responsibilities.join(", ")}`);
  }
  if (profile.commonTaskTypes?.length) {
    lines.push(`Common task types: ${profile.commonTaskTypes.join(", ")}`);
  }

  return lines.length ? lines.join("\n") : "Minimal profile — complete onboarding for richer AI context.";
}

export function renderProfileScreen() {
  const user = getUser();
  const profile = getProfile();

  if (!user && !profile) {
    els.displayName.textContent = "No profile yet";
    els.identifier.textContent = "Complete onboarding to build your profile";
    els.avatar.textContent = "?";
    els.aiContext.textContent = "No profile data yet.";
    return;
  }

  const displayName = profile?.displayName || user?.displayName || user?.identifier || "—";
  const identifier = user?.identifier || "—";

  els.displayName.textContent = displayName;
  els.identifier.textContent = identifier;
  els.avatar.textContent = (displayName[0] || "?").toUpperCase();

  // Life areas
  const lifeAreas = profile?.lifeAreas || [];
  if (lifeAreas.length) {
    els.lifeAreasSection.classList.remove("hidden");
    renderChips(els.lifeAreasChips, lifeAreas);
  } else {
    els.lifeAreasSection.classList.add("hidden");
  }

  // Work — handles both old and new schema
  const wc = profile?.workContext;
  if (wc) {
    const industry = effectiveField(wc.industry, wc.industryCustom);
    const role = effectiveField(wc.role, wc.roleCustom);
    const workplace = effectiveField(wc.workplace, wc.workplaceCustom);
    const projects = wc.projectsOrPeople?.length
      ? wc.projectsOrPeople.join(", ")
      : [wc.knownPeople, wc.commonProjects].filter(Boolean).join(", ");
    if (industry || role || workplace || projects) {
      els.workSection.classList.remove("hidden");
      const parts = [];
      if (industry) parts.push(`<p><strong>Industry:</strong> ${escapeHtml(industry)}</p>`);
      if (role) parts.push(`<p><strong>Role:</strong> ${escapeHtml(role)}</p>`);
      if (workplace) parts.push(`<p><strong>Workplace:</strong> ${escapeHtml(workplace)}</p>`);
      if (projects) parts.push(`<p><strong>Projects/people:</strong> ${escapeHtml(projects)}</p>`);
      els.workDetail.innerHTML = parts.join("");
    } else {
      els.workSection.classList.add("hidden");
    }
  } else {
    els.workSection.classList.add("hidden");
  }

  // Studies — handles both old and new schema
  const sc = profile?.studyContext;
  if (sc) {
    const instType = effectiveField(sc.institutionType, sc.institutionTypeCustom) || sc.studyType;
    const institution = effectiveField(sc.institution, sc.institutionCustom);
    const degree = effectiveField(sc.degreeLevel, sc.degreeLevelCustom);
    const field = effectiveField(sc.fieldOfStudy || sc.field, sc.fieldOfStudyCustom);
    const courses = sc.coursesOrPeople?.length ? sc.coursesOrPeople.join(", ") : sc.commonProjects;
    if (instType || institution || degree || field || courses) {
      els.studySection.classList.remove("hidden");
      const parts = [];
      if (instType) parts.push(`<p><strong>Type:</strong> ${escapeHtml(instType)}</p>`);
      if (institution) parts.push(`<p><strong>Institution:</strong> ${escapeHtml(institution)}</p>`);
      if (degree) parts.push(`<p><strong>Degree:</strong> ${escapeHtml(degree)}</p>`);
      if (field) parts.push(`<p><strong>Field:</strong> ${escapeHtml(field)}</p>`);
      if (courses) parts.push(`<p><strong>Courses/projects:</strong> ${escapeHtml(courses)}</p>`);
      els.studyDetail.innerHTML = parts.join("");
    } else {
      els.studySection.classList.add("hidden");
    }
  } else {
    els.studySection.classList.add("hidden");
  }

  // Family
  const fc = profile?.familyContext;
  const famItems = fc?.responsibilities || [];
  if (famItems.length) {
    els.familySection.classList.remove("hidden");
    renderChips(els.familyChips, famItems);
  } else {
    els.familySection.classList.add("hidden");
  }

  // Task types
  const tt = profile?.commonTaskTypes || [];
  if (tt.length) {
    els.taskTypesSection.classList.remove("hidden");
    renderChips(els.taskTypesChips, tt);
  } else {
    els.taskTypesSection.classList.add("hidden");
  }

  // AI context
  els.aiContext.textContent = buildAiContextText(profile);
}

export function initProfileScreen(options = {}) {
  callbacks = options;

  els.editBtn.addEventListener("click", () => {
    if (callbacks.onEditProfile) callbacks.onEditProfile();
  });

  els.switchBtn.addEventListener("click", () => {
    if (callbacks.onSwitchProfile) callbacks.onSwitchProfile();
  });

  // Refresh display each time the screen becomes active
  const observer = new MutationObserver(() => {
    const screen = document.getElementById("profileScreen");
    if (screen && screen.classList.contains("is-active")) {
      renderProfileScreen();
    }
  });

  const profileScreen = document.getElementById("profileScreen");
  if (profileScreen) {
    observer.observe(profileScreen, { attributes: true, attributeFilter: ["class"] });
  }
}
