const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_INPUT_CHARS = 4000;
const MAX_OUTPUT_TOKENS = 800;

// ── Server-side system prompt ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are the task-understanding engine of a smart task-management application called TaskWise.

Convert unstructured messages, emails, reminders, invitations, and notes into one structured task.
The current date and day of week will be provided in every request — use them to resolve relative dates.

Return valid JSON only. No Markdown, no explanations, no text outside the JSON object.

### Task title

Generate a clear, natural, action-oriented task title (3–10 words). Use the same language as the source.
Begin with an action verb. Preserve important names, course names, and identifiers.
Remove greetings, politeness, and filler (Hi, Please, Can you, תוכל, בבקשה, היי).

### Category

Choose based on the task content and the user's onboarding context.
Allowed: Work, Studies, Family, Personal, Home, Finance, Health, Other

If confidence is below 0.60 return category as "" and add "Category" to missingInformation.
Return categoryConfidence as a number 0–1.

### Due date

Current date is provided in the request. Use it to resolve ALL relative date phrases to ISO YYYY-MM-DD.
Relative phrase examples (with resolution logic):
- "today" / "היום" → currentDate
- "tomorrow" / "מחר" → currentDate + 1 day
- "in 2 days" / "בעוד יומיים" / "מחרתיים" → currentDate + 2 days
- "next week" / "שבוע הבא" → currentDate + 7 days
- "by Thursday" / "עד חמישי" → the next upcoming Thursday from currentDate
- "tonight" / "הערב" → currentDate (same day, evening)
- Named weekday (Sunday/Monday/ראשון/שני…) → the next occurrence of that weekday

Return dueDate as "" if no deadline is mentioned.
Return dueTime as "HH:mm" if a specific time is mentioned (e.g. "at 3pm" → "15:00"), otherwise "".
Do NOT return past dates unless the source clearly states a past date.

### Priority

Infer priority from deadline urgency, language, and task type:
- Urgent: due today or tomorrow, explicit urgent language (urgent, ASAP, immediately, דחוף, בהקדם), blocks a critical event or payment
- High: due in 2–3 days, important obligation (work deadline, exam, medical appointment)
- Medium: due within a week, regular responsibility
- Low: no deadline, non-critical

Always return a priority (never null or empty).

### Estimated duration

Estimate realistically based on the task type:
- Quick action (send email, make a call): 10–15 minutes
- Standard task (write report, prepare document): 60–120 minutes
- Large task (prepare presentation, complete assignment): 120–180 minutes
- Simple errand (pay bill, book appointment): 10–20 minutes

Return null only if the task is too vague to estimate.

### Source detection

Detect the message source from the text when clearly indicated:
- Email headers, "forwarded message", "from:" → Email
- "WhatsApp", conversational tone with "sent from phone" → WhatsApp
- Calendar invite language, "meeting", "join" → Calendar
- Class/lecture notes → Notes
- "Teams", "Slack" mention → Teams
- When unclear → Unknown

### Missing information

Only list fields that are truly missing and materially affect completing or scheduling the task:
- "Due date" — if no deadline was mentioned
- "Category" — if confidence was below 0.60
- "Estimated duration" — if task is vague enough that duration cannot be estimated

Do NOT list source as missing (it is always optional).
Do NOT list priority as missing (always infer one).
If all key fields were extracted, return an empty array [].

### Notes

Include concise supporting info: amounts, context, secondary actions, dependencies.
Do not repeat the title. Keep under 2 sentences.

### Required JSON shape

Return exactly this structure with no additional properties:

{
  "isActionable": true,
  "title": "",
  "category": "",
  "categoryConfidence": 0.0,
  "dueDate": "",
  "dueTime": "",
  "priority": "Medium",
  "estimatedDurationMinutes": null,
  "source": "Unknown",
  "notes": "",
  "missingInformation": []
}

Rules:
- Use "" for unknown optional string fields
- Use null for estimatedDurationMinutes when unable to estimate
- source defaults to Unknown
- priority always has a value (never "")
- dueDate must be YYYY-MM-DD or ""
- missingInformation contains only field names from the approved list above
- Return JSON only, never any other text`;

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

  const sourceText = String(body.sourceText || "").trim();
  const sourceType = body.sourceType ? String(body.sourceType).trim() : "";
  const relevantContext = body.relevantContext || {};
  const currentDate = body.currentDate ? String(body.currentDate).trim() : new Date().toISOString().split("T")[0];
  const currentDay = body.currentDay ? String(body.currentDay).trim() : new Date().toLocaleDateString("en-US", { weekday: "long" });

  if (!sourceText) {
    return jsonResponse(400, { error: "Add a message, email, invitation, or reminder first." });
  }

  if (sourceText.length > MAX_INPUT_CHARS) {
    return jsonResponse(400, {
      error: "This text is too long. Please paste only the part that contains the task."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse(503, {
      error: "AI task creation is temporarily unavailable. You can still add the task manually."
    });
  }

  const userMessage = buildUserMessage({ sourceText, sourceType, relevantContext, currentDate, currentDay });

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
            name: "task_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                isActionable: { type: "boolean" },
                title: { type: "string" },
                category: {
                  type: "string",
                  enum: ["Work", "Studies", "Family", "Personal", "Home", "Finance", "Health", "Other", ""]
                },
                categoryConfidence: { type: "number" },
                dueDate: { type: "string" },
                dueTime: { type: "string" },
                priority: {
                  type: "string",
                  enum: ["Low", "Medium", "High", "Urgent"]
                },
                estimatedDurationMinutes: {
                  anyOf: [{ type: "number" }, { type: "null" }]
                },
                source: {
                  type: "string",
                  enum: ["WhatsApp", "Email", "Calendar", "Notes", "Teams", "Other", "Unknown"]
                },
                notes: { type: "string" },
                missingInformation: { type: "array", items: { type: "string" } }
              },
              required: [
                "isActionable", "title", "category", "categoryConfidence",
                "dueDate", "dueTime", "priority", "estimatedDurationMinutes",
                "source", "notes", "missingInformation"
              ]
            }
          }
        },
        store: false,
        max_output_tokens: MAX_OUTPUT_TOKENS
      })
    });
  } catch {
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
    console.error("OpenAI error", openaiResponse.status, JSON.stringify(data?.error || data));
    if (openaiResponse.status === 429) {
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

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    return jsonResponse(503, {
      error: "TaskWise could not organize this task right now. Please try again or add it manually."
    });
  }

  return jsonResponse(200, { result: sanitizeResult(parsed, sourceType, currentDate) });
};

// ── User message ──────────────────────────────────────────────────────

function buildUserMessage({ sourceText, sourceType, relevantContext, currentDate, currentDay }) {
  const ctx = serializeContext(relevantContext);
  return `Current date: ${currentDate}
Current day: ${currentDay}

Relevant user context:
${ctx}

Source type hint (user-selected, may be empty):
${sourceType || "Not specified"}

<source_text>
${sourceText}
</source_text>

Convert the above into one structured task. Use the current date to resolve any relative date phrases.`;
}

function serializeContext(ctx) {
  if (!ctx || !Object.keys(ctx).length) return "No context available.";
  const lines = [];

  if (ctx.lifeAreas?.length) lines.push(`Life areas: ${ctx.lifeAreas.join(", ")}`);

  if (ctx.work) {
    const w = ctx.work;
    if (w.industry) lines.push(`Work industry: ${w.industry}`);
    if (w.role) lines.push(`Work role: ${w.role}`);
    if (w.workplace) lines.push(`Workplace: ${w.workplace}`);
    if (w.projectsOrPeople?.length) lines.push(`Work projects/people: ${w.projectsOrPeople.join(", ")}`);
  }
  if (ctx.studies) {
    const s = ctx.studies;
    if (s.institution) lines.push(`Institution: ${s.institution}`);
    if (s.degreeLevel) lines.push(`Degree level: ${s.degreeLevel}`);
    if (s.fieldOfStudy) lines.push(`Field of study: ${s.fieldOfStudy}`);
    if (s.coursesOrPeople?.length) lines.push(`Courses/people: ${s.coursesOrPeople.join(", ")}`);
  }
  if (ctx.family) {
    if (ctx.family.responsibilities?.length) lines.push(`Family responsibilities: ${ctx.family.responsibilities.join(", ")}`);
    if (ctx.family.people?.length) lines.push(`Family/household people: ${ctx.family.people.join(", ")}`);
  }
  if (ctx.home?.responsibilities?.length) lines.push(`Home responsibilities: ${ctx.home.responsibilities.join(", ")}`);
  if (ctx.personal?.responsibilities?.length) lines.push(`Personal responsibilities: ${ctx.personal.responsibilities.join(", ")}`);
  if (ctx.health?.responsibilities?.length) lines.push(`Health responsibilities: ${ctx.health.responsibilities.join(", ")}`);
  if (ctx.finances?.responsibilities?.length) lines.push(`Finance responsibilities: ${ctx.finances.responsibilities.join(", ")}`);

  return lines.length ? lines.join("\n") : "No relevant context available.";
}

// ── Response extraction ───────────────────────────────────────────────

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  if (!Array.isArray(data.output)) return "";
  const parts = [];
  for (const item of data.output) {
    if (!Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("").trim();
}

// ── Sanitize AI result ────────────────────────────────────────────────

const ALLOWED_CATEGORIES = ["Work", "Studies", "Family", "Personal", "Home", "Finance", "Health", "Other"];
const ALLOWED_SOURCES = ["WhatsApp", "Email", "Calendar", "Notes", "Teams", "Other", "Unknown"];
const ALLOWED_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const ALLOWED_MISSING = ["Due date", "Category", "Estimated duration"];

function sanitizeResult(r, _sourceType, currentDate) {
  const category = ALLOWED_CATEGORIES.includes(r.category) ? r.category : "";
  const categoryConfidence = typeof r.categoryConfidence === "number"
    ? Math.min(Math.max(r.categoryConfidence, 0), 1) : 0;

  // Validate and sanitize due date
  let dueDate = safeStr(r.dueDate);
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    dueDate = "";
  }

  // Warn if date is in the past (server-side flag for client to show warning)
  let dueDatePast = false;
  if (dueDate && currentDate) {
    dueDatePast = dueDate < currentDate;
  }

  const source = ALLOWED_SOURCES.includes(r.source) ? r.source : "Unknown";
  const priority = ALLOWED_PRIORITIES.includes(r.priority) ? r.priority : "Medium";
  const estimatedDurationMinutes = typeof r.estimatedDurationMinutes === "number" && r.estimatedDurationMinutes > 0
    ? Math.round(r.estimatedDurationMinutes)
    : null;

  // Sanitize missingInformation to approved field names only
  const missingInfo = safeArray(r.missingInformation).filter(m => ALLOWED_MISSING.includes(m));

  return {
    isActionable: r.isActionable !== false,
    title: safeStr(r.title),
    category,
    categoryConfidence: category ? categoryConfidence : 0,
    dueDate,
    dueTime: safeStr(r.dueTime),
    priority,
    estimatedDurationMinutes,
    source,
    notes: safeStr(r.notes),
    missingInformation: missingInfo,
    dueDatePast
  };
}

function safeStr(v) { return typeof v === "string" ? v.trim() : ""; }
function safeArray(v) { return Array.isArray(v) ? v.map(String).filter(Boolean) : []; }

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body)
  };
}
