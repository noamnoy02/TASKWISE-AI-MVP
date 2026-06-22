function containsAny(text, terms) {
  return terms.some(term => text.includes(term.toLowerCase()));
}

function detectDeadlineText(text) {
  const lower = text.toLowerCase();

  if (containsAny(lower, ["היום", "today"])) return "Today";
  if (containsAny(lower, ["מחר", "tomorrow"])) return "Tomorrow";
  if (containsAny(lower, ["חמישי", "thursday"])) return "Thursday";
  if (containsAny(lower, ["שישי", "friday"])) return "Friday";
  if (containsAny(lower, ["שבוע הבא", "next week"])) return "Next week";

  return "";
}

function detectOwner(text) {
  const match = text.match(/(?:ל|אל|to)\s?([א-תA-Za-z]{2,})/);
  if (match && match[1]) {
    return match[1];
  }

  return "Unassigned";
}

// Used client-side when the AI request itself fails to reach the server
// (network error, etc). The server has its own equivalent fallback for when
// the AI call succeeds in reaching the server but the API key is missing or
// the request to OpenAI fails - see netlify/functions/ai.js.
export function createFallbackTaskFromText(text) {
  const lower = text.toLowerCase();

  let category = "Other";

  if (containsAny(lower, ["דוח", "לקוח", "סקר", "מייל", "עבודה", "project", "client", "report"])) {
    category = "Work";
  } else if (containsAny(lower, ["מרצה", "לימודים", "סמינריון", "assignment", "study", "exam"])) {
    category = "Studies";
  } else if (containsAny(lower, ["בית", "משפחה", "אמא", "אבא", "family", "home"])) {
    category = "Family";
  }

  let priority = "Medium";

  if (containsAny(lower, ["דחוף", "בהול", "urgent", "asap", "היום"])) {
    priority = "Urgent";
  } else if (containsAny(lower, ["חשוב", "מחר", "עד חמישי", "high"])) {
    priority = "High";
  }

  let sourceType = "Message";

  if (containsAny(lower, ["subject:", "regards", "forwarded", "email", "מייל"])) {
    sourceType = "Email";
  } else if (containsAny(lower, ["meeting", "invite", "זימון", "פגישה"])) {
    sourceType = "Calendar Invite";
  }

  const title = text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);

  return {
    title: title || "New task",
    category,
    deadlineText: detectDeadlineText(text),
    dueDate: "",
    priority,
    owner: detectOwner(text),
    sourceType,
    durationMinutes: 30,
    notes: "Created using local fallback because AI was unavailable.",
    missingInfo: ["Exact due date may need clarification"],
    suggestedAction: "Review the task details and confirm the missing information.",
    priorityReason: "Fallback prioritization is based on simple keywords such as urgency and deadline words.",
    confidence: 0.45
  };
}
