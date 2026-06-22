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

function buildAiContextText(profile) {
  if (!profile) return "No profile data yet.";
  const lines = [];

  if (profile.workContext?.role) lines.push(`Role: ${profile.workContext.role}`);
  if (profile.workContext?.industry) lines.push(`Industry: ${profile.workContext.industry}`);
  if (profile.workContext?.knownPeople) lines.push(`Known people: ${profile.workContext.knownPeople}`);
  if (profile.workContext?.commonProjects) lines.push(`Projects: ${profile.workContext.commonProjects}`);
  if (profile.studyContext?.field) lines.push(`Studying: ${profile.studyContext.field}`);
  if (profile.studyContext?.institution) lines.push(`Institution: ${profile.studyContext.institution}`);
  if (profile.familyContext?.responsibilities?.length) {
    lines.push(`Family: ${profile.familyContext.responsibilities.join(", ")}`);
  }
  if (profile.lifeAreas?.length) lines.push(`Life areas: ${profile.lifeAreas.join(", ")}`);
  if (profile.currentSituation) lines.push(`Situation: ${profile.currentSituation}`);
  if (profile.commonTaskTypes?.length) {
    lines.push(`Common task types: ${profile.commonTaskTypes.join(", ")}`);
  }

  // Backward compat: old profile format
  if (profile.work) lines.push(`Work: ${profile.work}`);
  if (profile.studies) lines.push(`Studies: ${profile.studies}`);
  if (profile.people?.length) lines.push(`Known people: ${profile.people.join(", ")}`);
  if (profile.projects?.length) lines.push(`Projects: ${profile.projects.join(", ")}`);

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

  // Work
  const wc = profile?.workContext;
  if (wc && (wc.role || wc.industry || wc.commonProjects)) {
    els.workSection.classList.remove("hidden");
    const parts = [];
    if (wc.industry) parts.push(`<p><strong>Industry:</strong> ${escapeHtml(wc.industry)}</p>`);
    if (wc.role) parts.push(`<p><strong>Role:</strong> ${escapeHtml(wc.role)}</p>`);
    if (wc.knownPeople) parts.push(`<p><strong>People:</strong> ${escapeHtml(wc.knownPeople)}</p>`);
    if (wc.commonProjects) parts.push(`<p><strong>Projects:</strong> ${escapeHtml(wc.commonProjects)}</p>`);
    // Backward compat
    if (profile.work) parts.push(`<p><strong>Work:</strong> ${escapeHtml(profile.work)}</p>`);
    els.workDetail.innerHTML = parts.join("");
  } else if (profile?.work) {
    els.workSection.classList.remove("hidden");
    els.workDetail.innerHTML = `<p>${escapeHtml(profile.work)}</p>`;
  } else {
    els.workSection.classList.add("hidden");
  }

  // Studies
  const sc = profile?.studyContext;
  if (sc && (sc.field || sc.studyType || sc.institution)) {
    els.studySection.classList.remove("hidden");
    const parts = [];
    if (sc.studyType) parts.push(`<p><strong>Type:</strong> ${escapeHtml(sc.studyType)}</p>`);
    if (sc.field) parts.push(`<p><strong>Field:</strong> ${escapeHtml(sc.field)}</p>`);
    if (sc.institution) parts.push(`<p><strong>Institution:</strong> ${escapeHtml(sc.institution)}</p>`);
    if (sc.commonProjects) parts.push(`<p><strong>Projects:</strong> ${escapeHtml(sc.commonProjects)}</p>`);
    els.studyDetail.innerHTML = parts.join("");
  } else if (profile?.studies) {
    els.studySection.classList.remove("hidden");
    els.studyDetail.innerHTML = `<p>${escapeHtml(profile.studies)}</p>`;
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
