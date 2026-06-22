const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_INPUT_CHARS = 4000;
const MAX_OUTPUT_TOKENS = 700;

// ── Server-side system prompt ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are the task-understanding engine of a smart task-management application.

Convert unstructured messages, emails, reminders, invitations, and notes into one structured task.

Your goal is to understand what the user actually needs to do and turn it into a clear next action.

Return valid JSON only. Do not return Markdown, explanations, comments, or text outside the JSON object.

### Task title

Generate a new, clear, natural, polished, and action-oriented task title that would look good in a task-management app.

Do not copy the complete original message as the title unless the source is already a short action-oriented task.

The title should:

* Use the same language as the source
* Begin with an action verb whenever possible
* Usually contain 3-10 words
* Describe the actual next action
* Preserve important names, objects, project names, course names, and identifiers
* Remove greetings, politeness, and conversational filler
* Avoid vague titles such as "Handle this," "Reminder," "Meeting," or "Do task"

Remove phrases such as: Hi, Please, Can you, Could you, Don't forget, Just a reminder, Thanks, היי, בבקשה, תוכלי, תוכל, אל תשכחי, תזכורת

Examples:
"Hi, can you send Dana the updated presentation before tomorrow?" → "Send Dana the updated presentation"
"Reminder: electricity bill due on 14 July" → "Pay the electricity bill"
"צריך להעלות את העבודה למודל עד יום ראשון" → "להעלות את העבודה למודל"

### Main action

Identify the primary responsibility the user needs to perform. Ignore greetings, signatures, previous quoted messages, marketing content, legal disclaimers, and background conversation.

If several actions exist, create one task representing the main responsibility. Keep useful secondary actions in notes.

If no clear action exists: return isActionable: false, return an empty title, do not invent a task.

### Category

Choose a category according to the meaning of the task and relevant onboarding context.

Allowed categories: Work, Studies, Family, Personal, Home, Finance, Health, Errands

Use onboarding context when available:
* Known employer, workplace, colleague, client, or work project → Work
* Known university, degree, lecturer, course, assignment, Moodle, or academic project → Studies
* Known family member, child, partner, parent, kindergarten, or school responsibility → Family
* Bill, payment, tax, reimbursement, or banking task → Finance
* Appointment, doctor, prescription, or medical follow-up → Health
* Household cleaning, repair, grocery, or home maintenance task → Home
* Pickup, delivery, shopping, or location-based errand → Errands
* Personal administration that does not fit another category → Personal

If category confidence is below 0.60: return category as empty string "", add "Select a category" to missingInformation.

Return categoryConfidence as a number between 0 and 1.

Do not use Other. Do not return null for category — use empty string "" when unclear.

### Deadline

Extract the deadline exactly as expressed in the source. Return the original phrase in deadlineText.

Do not calculate the final calendar date — application code will resolve it. Do not invent a time. If no deadline exists, return empty string "".

### Urgency signals

Return explicit urgency or importance signals only when supported by the source: urgent, ASAP, immediately, today, final deadline, blocks a meeting, blocks a submission, payment consequence, customer waiting, דחוף, בהקדם, חייב היום.

Do not infer urgency from punctuation alone. Return as array of short strings.

### Owner

Return "Me" when the user is expected to perform the task, the person's name when another person is clearly responsible, or empty string "" when unclear. Never invent an owner.

### People and context

Extract relevant people, projects, courses, clients, organizations, and locations. Use onboarding context when it provides a reliable match. Do not invent people, relationships, or projects.

### Notes

Use notes for concise supporting information: amounts, meeting context, required document contents, secondary actions, dependencies, morning/evening when no exact time is given. Do not repeat the title.

### Missing information

Include only information that materially affects completing or scheduling the task: Select a category, Deadline is unclear, Owner is unclear, Missing location, Missing document name. Do not list every optional field.

### Required JSON

Return exactly this structure with no additional properties:

{
  "isActionable": true,
  "title": "",
  "category": "",
  "categoryConfidence": 0,
  "deadlineText": "",
  "owner": "",
  "people": [],
  "project": "",
  "location": "",
  "urgencySignals": [],
  "notes": "",
  "missingInformation": []
}

Rules: use empty string "" for unknown optional scalar values, use empty arrays when no array values exist, never return undefined or null, do not add additional properties, return JSON only.`;

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

  if (!sourceText) {
    return jsonResponse(400, { error: "Paste a message, email, invitation, or reminder first." });
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

  const userMessage = buildUserMessage({ sourceText, sourceType, relevantContext });

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
                  enum: ["Work", "Studies", "Family", "Personal", "Home", "Finance", "Health", "Errands", ""]
                },
                categoryConfidence: { type: "number" },
                deadlineText: { type: "string" },
                owner: { type: "string" },
                people: { type: "array", items: { type: "string" } },
                project: { type: "string" },
                location: { type: "string" },
                urgencySignals: { type: "array", items: { type: "string" } },
                notes: { type: "string" },
                missingInformation: { type: "array", items: { type: "string" } }
              },
              required: [
                "isActionable", "title", "category", "categoryConfidence",
                "deadlineText", "owner", "people", "project", "location",
                "urgencySignals", "notes", "missingInformation"
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

  return jsonResponse(200, { result: sanitizeResult(parsed, sourceType) });
};

// ── User message ──────────────────────────────────────────────────────

function buildUserMessage({ sourceText, sourceType, relevantContext }) {
  const ctx = serializeContext(relevantContext);
  return `Analyze the following source and convert it into one structured task.

Relevant user context:
${ctx}

Source type:
${sourceType || "Not specified"}

<source_text>
${sourceText}
</source_text>`;
}

function serializeContext(ctx) {
  if (!ctx || !Object.keys(ctx).length) return "No context available.";
  const lines = [];
  if (ctx.workplaces?.length) lines.push(`Workplaces/industries: ${ctx.workplaces.join(", ")}`);
  if (ctx.universities?.length) lines.push(`Universities: ${ctx.universities.join(", ")}`);
  if (ctx.courses?.length) lines.push(`Courses/fields: ${ctx.courses.join(", ")}`);
  if (ctx.knownPeople?.length) lines.push(`Known people: ${ctx.knownPeople.join(", ")}`);
  if (ctx.knownProjects?.length) lines.push(`Known projects/clients: ${ctx.knownProjects.join(", ")}`);
  if (ctx.familyResponsibilities?.length) lines.push(`Family responsibilities: ${ctx.familyResponsibilities.join(", ")}`);
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

const ALLOWED_CATEGORIES = ["Work", "Studies", "Family", "Personal", "Home", "Finance", "Health", "Errands"];

function sanitizeResult(r, sourceType) {
  const category = ALLOWED_CATEGORIES.includes(r.category) ? r.category : "";
  const categoryConfidence = typeof r.categoryConfidence === "number"
    ? Math.min(Math.max(r.categoryConfidence, 0), 1) : 0;

  return {
    isActionable: r.isActionable !== false,
    title: safeStr(r.title),
    category,
    categoryConfidence: category ? categoryConfidence : 0,
    deadlineText: safeStr(r.deadlineText),
    owner: safeStr(r.owner),
    people: safeArray(r.people),
    project: safeStr(r.project),
    location: safeStr(r.location),
    urgencySignals: safeArray(r.urgencySignals),
    notes: safeStr(r.notes),
    missingInformation: safeArray(r.missingInformation),
    sourceType: safeStr(sourceType)
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
