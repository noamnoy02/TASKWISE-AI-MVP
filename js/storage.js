export const STORAGE_KEYS = {
  profile: "taskwise_profile",
  onboardingSkipped: "taskwise_onboarding_skipped",
  tasks: "taskwise_tasks"
};

export function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

export function getProfile() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEYS.profile), null);
}

export function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  localStorage.removeItem(STORAGE_KEYS.onboardingSkipped);
}

export function clearProfile() {
  localStorage.removeItem(STORAGE_KEYS.profile);
  localStorage.removeItem(STORAGE_KEYS.onboardingSkipped);
}

export function isOnboardingSkipped() {
  return localStorage.getItem(STORAGE_KEYS.onboardingSkipped) === "true";
}

export function setOnboardingSkipped() {
  localStorage.setItem(STORAGE_KEYS.onboardingSkipped, "true");
}

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
