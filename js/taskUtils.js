export const CATEGORIES = ["Work", "Studies", "Family", "Personal", "Home", "Finance", "Health", "Other"];
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const SOURCE_TYPES = ["Message", "Email", "Calendar Invite", "Reminder", "Conversation", "Other"];

// crypto.randomUUID() is unavailable on non-secure contexts and older browsers.
// Fall back to a simple RFC4122-ish generator so task creation never throws.
export function uuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function normalizePriority(priority) {
  if (!priority) return "Medium";
  const match = PRIORITIES.find(item => item.toLowerCase() === String(priority).toLowerCase());
  return match || "Medium";
}

export function normalizeCategory(category) {
  if (!category) return "Other";
  const match = CATEGORIES.find(item => item.toLowerCase() === String(category).toLowerCase());
  return match || "Other";
}

export function normalizeSourceType(sourceType) {
  if (!sourceType) return "Other";
  const match = SOURCE_TYPES.find(item => item.toLowerCase() === String(sourceType).toLowerCase());
  return match || "Other";
}

export function priorityScore(priority) {
  const scores = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
  return scores[priority] || 2;
}

export function daysUntil(dateString) {
  if (!dateString) return 999;

  const today = new Date();
  const date = new Date(`${dateString}T23:59:59`);

  if (Number.isNaN(date.getTime())) return 999;

  const diff = date.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function deadlineScore(task) {
  const days = daysUntil(task.dueDate);

  if (days < 0) return 5;
  if (days === 0) return 4;
  if (days === 1) return 3;
  if (days <= 3) return 2;
  if (days <= 7) return 1;
  return 0;
}

export function missingInfoPenalty(task) {
  return Array.isArray(task.missingInfo) && task.missingInfo.length > 0 ? -0.5 : 0;
}

export function taskScore(task) {
  return priorityScore(task.priority) * 2 + deadlineScore(task) + missingInfoPenalty(task);
}

export function sortByScore(tasks) {
  return [...tasks].sort((a, b) => taskScore(b) - taskScore(a));
}

export function getNextBestTask(tasks) {
  const openTasks = tasks.filter(task => task.status !== "Done");

  if (openTasks.length === 0) {
    return null;
  }

  return sortByScore(openTasks)[0];
}

export function buildLocalPriorityReason(task) {
  const reasons = [];

  if (task.priority === "Urgent" || task.priority === "High") {
    reasons.push(`priority is ${task.priority}`);
  }

  const days = daysUntil(task.dueDate);

  if (days < 0) {
    reasons.push("the task is overdue");
  } else if (days === 0) {
    reasons.push("the task is due today");
  } else if (days <= 2) {
    reasons.push("the deadline is close");
  }

  if (task.owner === "Unassigned") {
    reasons.push("ownership is still unclear");
  }

  if (reasons.length === 0) {
    reasons.push("it has the best balance of priority and timing");
  }

  return `Recommended because ${reasons.join(", ")}.`;
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
