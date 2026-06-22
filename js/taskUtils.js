export const CATEGORIES = ["Work", "Studies", "Family", "Personal", "Home", "Finance", "Health", "Other"];
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const SOURCE_TYPES = [
  "WhatsApp", "Gmail", "Outlook", "Calendar", "Notes", "Manual",
  "Message", "Email", "Calendar Invite", "Reminder", "Conversation", "Other"
];

export function uuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const r = (Math.random() * 16) | 0;
    return (char === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function normalizePriority(priority) {
  if (!priority) return "Medium";
  const match = PRIORITIES.find(p => p.toLowerCase() === String(priority).toLowerCase());
  return match || "Medium";
}

export function normalizeCategory(category) {
  if (!category) return "Other";
  const match = CATEGORIES.find(c => c.toLowerCase() === String(category).toLowerCase());
  return match || "Other";
}

export function normalizeSourceType(sourceType) {
  if (!sourceType) return "Other";
  const match = SOURCE_TYPES.find(s => s.toLowerCase() === String(sourceType).toLowerCase());
  return match || "Other";
}

// Priority score: Urgent=50, High=30, Medium=15, Low=5
export function priorityScore(priority) {
  return { Urgent: 50, High: 30, Medium: 15, Low: 5 }[priority] || 15;
}

export function daysUntil(dateString) {
  if (!dateString) return 999;
  const today = new Date();
  const date = new Date(`${dateString}T23:59:59`);
  if (Number.isNaN(date.getTime())) return 999;
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Deadline score: overdue=100, today(<24h)=70, ≤3d=40, ≤7d=20
export function deadlineScore(task) {
  const days = daysUntil(task.dueDate);
  if (days < 0) return 100;
  if (days === 0) return 70;
  if (days <= 3) return 40;
  if (days <= 7) return 20;
  return 0;
}

export function missingInfoPenalty(task) {
  return Array.isArray(task.missingInfo) && task.missingInfo.length > 0 ? -10 : 0;
}

export function taskScore(task) {
  return priorityScore(task.priority) + deadlineScore(task) + missingInfoPenalty(task);
}

export function sortByScore(tasks) {
  return [...tasks].sort((a, b) => taskScore(b) - taskScore(a));
}

export function getNextBestTask(tasks) {
  const open = tasks.filter(t => t.status !== "Done");
  return open.length ? sortByScore(open)[0] : null;
}

export function buildLocalPriorityReason(task) {
  const reasons = [];
  if (task.priority === "Urgent" || task.priority === "High") {
    reasons.push(`priority is ${task.priority}`);
  }
  const days = daysUntil(task.dueDate);
  if (days < 0) reasons.push("the task is overdue");
  else if (days === 0) reasons.push("the task is due today");
  else if (days <= 2) reasons.push("the deadline is close");
  if (task.owner === "Unassigned") reasons.push("ownership is still unclear");
  if (!reasons.length) reasons.push("it has the best balance of priority and timing");
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
