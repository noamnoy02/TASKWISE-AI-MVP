const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_INPUT_CHARS = 4000;
const MAX_OUTPUT_TOKENS = 600;

// ── Server-side system prompt (never sent to browser) ─────────────────

const SYSTEM_PROMPT = `You are the task-understanding engine for TaskWise.

TaskWise helps users reduce mental overload by converting unstructured messages, emails, invitations, reminders, and notes into clear, structured, and actionable tasks.

You will receive:

1. Text copied by the user.
2. The source of the text, when known.
3. A concise onboarding profile describing the user's work, studies, family or household responsibilities, recurring projects, known clients, known people, and common task types.
4. The current date, time, and timezone.
5. A small number of previous user classification corrections, when available.

Your job is to analyze the copied text and return exactly one structured task.

The model performs semantic extraction and suggestions only.

The model does not rank the task against the user's other tasks and does not decide the final execution order.

Final prioritization, overdue calculation, dashboard ordering, and recommended next action are calculated deterministically by the TaskWise application after the user approves the task.

TASK TITLE:

- Create a short, clear, action-oriented title.
- Start with an action verb when appropriate.
- Remove unnecessary conversational wording.
- Preserve important names, project names, clients, and subjects.
- Do not create more than one task.

CATEGORY:

Classify the task into exactly one category:

- Work
- Studies
- Family
- Home
- Personal
- Health
- Finance
- Other

Use both the copied text and relevant onboarding context.

Do not classify based only on isolated keywords.

Examples:

- A known client or work project may support Work classification.
- A known university course or academic project may support Studies classification.
- Household logistics may belong to Home.
- Responsibilities involving children, a partner, or relatives may belong to Family.
- Medical appointments or health-related actions may belong to Health.
- Bills, payments, banking, and financial obligations may belong to Finance.

Use onboarding information only as supporting context.

Do not invent relationships, projects, or facts that were not supplied.

DEADLINE:

- Extract an explicit deadline when present.
- Resolve relative dates using the supplied current date and timezone.
- Return an ISO date in YYYY-MM-DD format.
- If the text says "Thursday," calculate the appropriate upcoming Thursday based on the current date.
- If no deadline is stated or safely inferable, return an empty string "".
- Never invent a deadline.

OWNER:

- Extract the owner only when ownership is explicit or reasonably clear.
- If the message is clearly a request directed at the current user, owner may be "Me".
- A person mentioned as a client, recipient, child, lecturer, or stakeholder is not automatically the owner.
- If another person is explicitly assigned to perform the task, use that person's name.
- If ownership is unclear, return an empty string "".
- Add "Owner" to missingInformation when ownership would be useful.
- Never invent an owner.

PRIORITY:

Suggest one semantic priority: Low, Medium, High, or Urgent.

Base the suggestion only on information available in the copied text, explicit urgency, deadline proximity, consequences of delay, and whether the deadline is already passed based on the supplied date.

Priority definitions:

Urgent: Immediate attention is required, the task is overdue with meaningful consequences, the message explicitly states urgency, or the deadline is extremely close.

High: The task is important and should be handled soon because of its deadline or consequences.

Medium: The task matters but can be scheduled normally.

Low: The task is flexible, optional, or has no near deadline or significant consequences.

Return a short, user-facing priorityReason.

ESTIMATED DURATION:

- Extract duration only when it is explicitly stated.
- Do not invent a duration.
- Return 0 when unknown.
- Add "Estimated duration" to missingInformation when duration would help with scheduling.

SOURCE:

- Use the supplied sourceHint when available.
- If no sourceHint is provided, return "Other".
- Do not guess the source based on writing style.

NOTES:

- Keep notes concise.
- Include useful context that does not belong in the task title.
- Do not duplicate the full original text.

MISSING INFORMATION:

List only useful missing information that may be needed to complete, assign, or schedule the task.

Possible values include: Owner, Deadline, Estimated duration, Source, Project, Location.

Do not mark every optional field as missing.

CONFIDENCE:

Return a number between 0 and 1 reflecting how strongly the copied text and supplied profile support the proposed structured fields.

GENERAL RULES:

- Never invent facts.
- Return exactly one task.
- Do not perform the task.
- Do not save anything.
- Do not calculate the final task order.
- Do not compare the task with other tasks.
- Return only data matching the required structured schema.
- The result is an editable suggestion.
- The user must approve or correct it before saving.`;

// ── Handler ───────────────────────────────────────────────────────────

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed. Use POST." });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  const copiedText = String(body.copiedText || "").trim();
  const sourceHint = body.sourceHint ? String(body.sourceHint).trim() : null;
  const userProfile = body.userProfile || null;
  const currentDateTime = String(body.currentDateTime || new Date().toISOString());
  const timezone = String(body.timezone || "UTC");

  if (!copiedText) {
    return jsonResponse(400, { error: "Paste a message, email, invitation, or reminder first." });
  }

  if (copiedText.length > MAX_INPUT_CHARS) {
    return jsonResponse(400, {
      error: "This text is too long. Please paste only the part that contains the task."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse(503, {
      error: "AI task creation is temporarily unavailable. You can still add the task manually."
    });
  }

  const userMessage = buildUserMessage({ copiedText, sourceHint, userProfile, currentDateTime, timezone });

  let openaiResponse;
  try {
    openaiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: SYSTEM_PROMPT,
        input: userMessage,
        text: {
          format: {
            type: "json_schema",
            name: "structured_task",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                category: {
                  type: "string",
                  enum: ["Work", "Studies", "Family", "Home", "Personal", "Health", "Finance", "Other"]
                },
                deadline: { type: "string" },
                priority: {
                  type: "string",
                  enum: ["Low", "Medium", "High", "Urgent"]
                },
                priorityReason: { type: "string" },
                owner: { type: "string" },
                estimatedDurationMinutes: { type: "number" },
                source: {
                  type: "string",
                  enum: ["WhatsApp", "Gmail", "Outlook", "Calendar", "Notes", "Manual", "Other"]
                },
                notes: { type: "string" },
                missingInformation: { type: "array", items: { type: "string" } },
                confidence: { type: "number" }
              },
              required: [
                "title", "category", "deadline", "priority", "priorityReason",
                "owner", "estimatedDurationMinutes", "source", "notes",
                "missingInformation", "confidence"
              ]
            }
          }
        },
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS
      })
    });
  } catch (networkError) {
    return jsonResponse(503, {
      error: "TaskWise could not organize this task right now. Please try again or add it manually."
    });
  }

  let data;
  try {
    data = await openaiResponse.json();
  } catch {
    return jsonResponse(503, {
      error: "TaskWise could not organize this task right now. Please try again or add it manually."
    });
  }

  if (!openaiResponse.ok) {
    const status = openaiResponse.status;
    console.error("OpenAI error", status, JSON.stringify(data?.error || data));
    if (status === 429) {
      return jsonResponse(503, {
        error: "AI task creation is temporarily unavailable. You can still add the task manually."
      });
    }
    return jsonResponse(503, {
      error: "TaskWise could not organize this task right now. Please try again or add it manually."
    });
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    return jsonResponse(503, {
      error: "TaskWise could not organize this task right now. Please try again or add it manually."
    });
  }

  let parsedTask;
  try {
    parsedTask = JSON.parse(outputText);
  } catch {
    return jsonResponse(503, {
      error: "TaskWise could not organize this task right now. Please try again or add it manually."
    });
  }

  return jsonResponse(200, {
    task: sanitizeTask(parsedTask, sourceHint)
  });
};

// ── User message builder ──────────────────────────────────────────────

function buildUserMessage({ copiedText, sourceHint, userProfile, currentDateTime, timezone }) {
  const profileText = formatProfileContext(userProfile);
  return `Current date and time: ${currentDateTime}
Timezone: ${timezone}
Source of the text: ${sourceHint || "Not specified"}

User profile context:
${profileText}

Text to analyze:
${copiedText}`;
}

// ── Profile context formatter ─────────────────────────────────────────

function formatProfileContext(profile) {
  if (!profile) return "No profile available.";

  const lines = [];

  if (profile.displayName) lines.push(`User: ${profile.displayName}`);
  if (Array.isArray(profile.lifeAreas) && profile.lifeAreas.length) {
    lines.push(`Life areas: ${profile.lifeAreas.join(", ")}`);
  }
  if (profile.currentSituation) lines.push(`Current situation: ${profile.currentSituation}`);

  const wc = profile.workContext;
  if (wc) {
    if (wc.role) lines.push(`Work role: ${wc.role}`);
    if (wc.industry) lines.push(`Industry: ${wc.industry}`);
    if (wc.commonProjects) lines.push(`Work projects/clients: ${wc.commonProjects}`);
    if (wc.knownPeople) lines.push(`Known work contacts: ${wc.knownPeople}`);
  }

  const sc = profile.studyContext;
  if (sc) {
    if (sc.studyType) lines.push(`Study type: ${sc.studyType}`);
    if (sc.field) lines.push(`Field of study: ${sc.field}`);
    if (sc.institution) lines.push(`Institution: ${sc.institution}`);
    if (sc.commonProjects) lines.push(`Study projects/courses: ${sc.commonProjects}`);
  }

  const fc = profile.familyContext;
  if (fc && Array.isArray(fc.responsibilities) && fc.responsibilities.length) {
    lines.push(`Family/home responsibilities: ${fc.responsibilities.join(", ")}`);
  }

  if (Array.isArray(profile.commonTaskTypes) && profile.commonTaskTypes.length) {
    lines.push(`Common task types: ${profile.commonTaskTypes.join(", ")}`);
  }

  const corrections = profile.recentClassificationCorrections;
  if (Array.isArray(corrections) && corrections.length) {
    lines.push("\nRecent classification corrections (user preferences):");
    for (const c of corrections) {
      const parts = [];
      if (c.aiCategory && c.finalCategory && c.aiCategory !== c.finalCategory) {
        parts.push(`category: ${c.aiCategory} → ${c.finalCategory}`);
      }
      if (c.aiPriority && c.finalPriority && c.aiPriority !== c.finalPriority) {
        parts.push(`priority: ${c.aiPriority} → ${c.finalPriority}`);
      }
      if (c.aiOwner !== undefined && c.finalOwner !== undefined && c.aiOwner !== c.finalOwner) {
        parts.push(`owner: ${c.aiOwner || "none"} → ${c.finalOwner || "none"}`);
      }
      if (parts.length) lines.push(`  - ${parts.join(", ")}`);
    }
  }

  return lines.length ? lines.join("\n") : "Minimal profile — onboarding may not have been completed.";
}

// ── Response parsing ──────────────────────────────────────────────────

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;

  if (!Array.isArray(data.output)) return "";

  const parts = [];
  for (const item of data.output) {
    if (!Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("").trim();
}

// ── Sanitize / validate task from OpenAI ─────────────────────────────

function sanitizeTask(task, sourceHint) {
  const CATEGORIES = ["Work", "Studies", "Family", "Home", "Personal", "Health", "Finance", "Other"];
  const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
  const SOURCES = ["WhatsApp", "Gmail", "Outlook", "Calendar", "Notes", "Manual", "Other"];

  const deadline = safeString(task.deadline, "");
  const isIso = /^\d{4}-\d{2}-\d{2}$/.test(deadline);

  return {
    title: safeString(task.title, "New task"),
    category: safeEnum(task.category, CATEGORIES, "Other"),
    deadline: isIso ? deadline : "",
    priority: safeEnum(task.priority, PRIORITIES, "Medium"),
    priorityReason: safeString(task.priorityReason, ""),
    owner: safeString(task.owner, ""),
    estimatedDurationMinutes: safeDuration(task.estimatedDurationMinutes),
    source: safeEnum(task.source, SOURCES, sourceHint && SOURCES.includes(sourceHint) ? sourceHint : "Other"),
    notes: safeString(task.notes, ""),
    missingInformation: Array.isArray(task.missingInformation)
      ? task.missingInformation.map(String).filter(Boolean)
      : [],
    confidence: typeof task.confidence === "number" ? clamp(task.confidence, 0, 1) : 0.7
  };
}

// ── Utilities ─────────────────────────────────────────────────────────

function safeString(value, fallback) {
  const text = String(value == null ? "" : value).trim();
  return text || fallback;
}

function safeEnum(value, allowed, fallback) {
  const text = String(value == null ? "" : value).trim();
  return allowed.includes(text) ? text : fallback;
}

function safeDuration(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), 480);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(body)
  };
}
