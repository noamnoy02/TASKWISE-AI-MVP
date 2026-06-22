export const STORAGE_KEYS = {
  user: "taskwise_user",
  profile: "taskwise_profile",
  tasks: "taskwise_tasks",
  corrections: "taskwise_corrections"
};

export function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

// ── User (email / username entry) ──────────────────────────────

export function getUser() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEYS.user), null);
}

export function saveUser(user) {
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(STORAGE_KEYS.user);
}

// ── Profile (onboarding data) ───────────────────────────────────
// New schema:
// {
//   id, username, email, displayName,
//   lifeAreas[], currentSituation,
//   workContext: { industry, role, commonProjects, knownPeople },
//   studyContext: { studyType, field, institution, commonProjects },
//   familyContext: { responsibilities[] },
//   commonTaskTypes[],
//   onboardingCompleted: true,
//   updatedAt
// }

export function getProfile() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEYS.profile), null);
}

export function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
}

export function clearProfile() {
  localStorage.removeItem(STORAGE_KEYS.profile);
}

export function isOnboardingCompleted() {
  const profile = getProfile();
  return Boolean(profile && profile.onboardingCompleted);
}

// ── Tasks ───────────────────────────────────────────────────────

export function getTasks() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEYS.tasks), []);
}

export function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
}

export function clearTasks() {
  localStorage.removeItem(STORAGE_KEYS.tasks);
}

export function getRecentTaskContext() {
  return getTasks()
    .slice(-5)
    .map(task => ({
      title: task.title,
      category: task.category,
      owner: task.owner,
      priority: task.priority
    }));
}

// ── AI classification corrections (lightweight learning) ────────

export function getCorrections() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEYS.corrections), []);
}

export function addCorrection(correction) {
  const all = getCorrections();
  all.push({ ...correction, createdAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEYS.corrections, JSON.stringify(all.slice(-10)));
}

export function clearCorrections() {
  localStorage.removeItem(STORAGE_KEYS.corrections);
}

// ── Full reset ──────────────────────────────────────────────────

export function resetAll() {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
}
