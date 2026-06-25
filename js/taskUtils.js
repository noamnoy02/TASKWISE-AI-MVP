export const CATEGORIES = ["Work", "Studies", "Family", "Personal", "Home", "Finance", "Health", "Errands", "Other"];
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const SOURCE_TYPES = [
  "WhatsApp", "Gmail", "Outlook", "Calendar", "Slack", "Teams", "Notion", "Other", "Unknown", "Manual"
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
  if (!category) return null;
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

// ── Deterministic deadline resolution ────────────────────────────────
// Resolves natural-language deadline phrases to ISO YYYY-MM-DD.
// Returns null when the phrase cannot be reliably resolved.

export function resolveDeadline(deadlineText) {
  if (!deadlineText || typeof deadlineText !== "string") return null;
  const text = deadlineText.trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const iso = d => d.toISOString().slice(0, 10);
  const shift = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

  // Today / היום
  if (/\btoday\b|\bהיום\b/.test(lower)) return iso(today);

  // Tomorrow / מחר
  if (/\btomorrow\b|\bמחר\b/.test(lower)) return iso(shift(today, 1));

  // Named weekdays — next occurrence
  const WEEKDAYS = [
    /\bsunday\b|\bיום ראשון\b|\bראשון\b/,   // 0
    /\bmonday\b|\bיום שני\b|\bשני\b/,        // 1
    /\btuesday\b|\bיום שלישי\b|\bשלישי\b/,  // 2
    /\bwednesday\b|\bיום רביעי\b|\bרביעי\b/, // 3
    /\bthursday\b|\bיום חמישי\b|\bחמישי\b/, // 4
    /\bfriday\b|\bיום שישי\b|\bשישי\b/,     // 5
    /\bsaturday\b|\bשבת\b/                   // 6
  ];
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (WEEKDAYS[i].test(lower)) {
      let diff = i - today.getDay();
      if (diff <= 0) diff += 7;
      return iso(shift(today, diff));
    }
  }

  // Next week / שבוע הבא
  if (/next week|שבוע הבא/.test(lower)) return iso(shift(today, 7));

  // End of the week / סוף השבוע → Friday
  if (/end of (the )?week|סוף (ה)?שבוע/.test(lower)) {
    let diff = 5 - today.getDay();
    if (diff <= 0) diff += 7;
    return iso(shift(today, diff));
  }

  // Bare ISO date YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  // DD/MM or DD.MM (without year)
  const dmMatch = text.match(/(\d{1,2})[/.](\d{1,2})(?!\d)/);
  if (dmMatch) {
    const d = new Date(today.getFullYear(), parseInt(dmMatch[2]) - 1, parseInt(dmMatch[1]));
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    if (!isNaN(d.getTime())) return iso(d);
  }

  // "14 July" / "July 14"
  const MONTHS = {
    january:0, february:1, march:2, april:3, may:4, june:5,
    july:6, august:7, september:8, october:9, november:10, december:11,
    jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
  };
  for (const [name, month] of Object.entries(MONTHS)) {
    if (lower.includes(name)) {
      const dayMatch = lower.match(/(\d{1,2})/);
      if (dayMatch) {
        const d = new Date(today.getFullYear(), month, parseInt(dayMatch[1]));
        if (d < today) d.setFullYear(d.getFullYear() + 1);
        if (!isNaN(d.getTime())) return iso(d);
      }
    }
  }

  return null;
}

// ── Deterministic priority calculation ────────────────────────────────
// AI supplies urgencySignals; code decides the final priority.
// Rules:
//   Urgent : overdue OR within 24 h OR explicit urgency signal
//   High   : 1–3 days away
//   Medium : 3–14 days away OR no date + no urgency
//   Low    : (not assigned automatically — requires explicit "low" signal)

export function calculatePriority(resolvedDueDate, urgencySignals) {
  const hasUrgency = Array.isArray(urgencySignals) && urgencySignals.length > 0;

  if (resolvedDueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(resolvedDueDate + "T00:00:00");
    const diffDays = Math.ceil((due - today) / 86400000);

    if (diffDays <= 0) return "Urgent";
    if (diffDays <= 1 || hasUrgency) return "Urgent";
    if (diffDays <= 3) return "High";
    if (diffDays <= 14) return "Medium";
    return "Medium";
  }

  return hasUrgency ? "Urgent" : "Medium";
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getCategoryMeta(category) {
  const meta = {
    Work:     { icon: "💼", color: "#1D4ED8", bg: "#EFF6FF", label: "Work" },
    Studies:  { icon: "🎓", color: "#5B21B6", bg: "#F5F3FF", label: "Studies" },
    Family:   { icon: "👨‍👩‍👧", color: "#86198F", bg: "#FDF2F8", label: "Family" },
    Home:     { icon: "🏠", color: "#C2410C", bg: "#FFF7ED", label: "Home" },
    Health:   { icon: "❤️",  color: "#15803D", bg: "#F0FDF4", label: "Health" },
    Finance:  { icon: "💰", color: "#0F766E", bg: "#F0FDFA", label: "Finance" },
    Personal: { icon: "👤", color: "#6D28D9", bg: "#F5F3FF", label: "Personal" },
    Errands:  { icon: "🛒", color: "#B45309", bg: "#FFFBEB", label: "Errands" },
    Other:    { icon: "📋", color: "#64748B", bg: "#F8FAFC", label: "Other" }
  };
  return meta[category] || { icon: "📋", color: "#64748B", bg: "#F8FAFC", label: category || "Other" };
}
