const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-4.1-mini";

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, {
      error: "Method not allowed. Use POST."
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, {
      error: "Invalid JSON body."
    });
  }

  const sourceText = String(body.sourceText || "").trim();
  const userProfile = body.userProfile || null;
  const recentTasks = Array.isArray(body.recentTasks) ? body.recentTasks : [];

  if (!sourceText) {
    return jsonResponse(400, {
      error: "sourceText is required."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse(200, {
      usedFallback: true,
      task: buildFallbackTask(sourceText, "Missing OPENAI_API_KEY.")
    });
  }

  const prompt = buildPrompt({
    sourceText,
    userProfile,
    recentTasks
  });

  try {
    const openaiResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
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
                  enum: ["Work", "Studies", "Family", "Personal", "Home", "Finance", "Health", "Other"]
                },
                deadlineText: { type: "string" },
                dueDate: { type: "string" },
                priority: {
                  type: "string",
                  enum: ["Low", "Medium", "High", "Urgent"]
                },
                owner: { type: "string" },
                sourceType: {
                  type: "string",
                  enum: ["Message", "Email", "Calendar Invite", "Reminder", "Conversation", "Other"]
                },
                durationMinutes: { type: "number" },
                notes: { type: "string" },
                missingInfo: {
                  type: "array",
                  items: { type: "string" }
                },
                suggestedAction: { type: "string" },
                priorityReason: { type: "string" },
                confidence: { type: "number" }
              },
              required: [
                "title",
                "category",
                "deadlineText",
                "dueDate",
                "priority",
                "owner",
                "sourceType",
                "durationMinutes",
                "notes",
                "missingInfo",
                "suggestedAction",
                "priorityReason",
                "confidence"
              ]
            }
          }
        }
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      const message = data && data.error && data.error.message
        ? data.error.message
        : "OpenAI API request failed.";

      return jsonResponse(200, {
        usedFallback: true,
        task: buildFallbackTask(sourceText, message)
      });
    }

    const outputText = extractOutputText(data);

    if (!outputText) {
      return jsonResponse(200, {
        usedFallback: true,
        task: buildFallbackTask(sourceText, "OpenAI returned an empty response.")
      });
    }

    let parsedTask;

    try {
      parsedTask = JSON.parse(outputText);
    } catch (error) {
      return jsonResponse(200, {
        usedFallback: true,
        task: buildFallbackTask(sourceText, "OpenAI returned non-JSON output.")
      });
    }

    return jsonResponse(200, {
      usedFallback: false,
      model: MODEL,
      task: sanitizeTask(parsedTask, sourceText)
    });
  } catch (error) {
    return jsonResponse(200, {
      usedFallback: true,
      task: buildFallbackTask(sourceText, error.message || "Unknown server error.")
    });
  }
};

function buildPrompt({ sourceText, userProfile, recentTasks }) {
  return `
You are TaskWise AI, an assistant that converts messy real-life text into a structured task.

Your goal:
Analyze the user's pasted text and return one clear task object.

Use the user's profile as context if available.
Use recent tasks only as lightweight context for recurring people, projects and categories.
Do not invent facts. If important information is missing, list it in missingInfo.
If a due date is explicit and can be converted to ISO format YYYY-MM-DD, fill dueDate.
If the date is relative or ambiguous, keep dueDate as an empty string and explain in deadlineText.
Assume today's date is ${new Date().toISOString().slice(0, 10)}.
Return only valid JSON matching the schema.

Priority rules:
- Urgent: immediate, today, overdue, blocking someone, client waiting, critical.
- High: close deadline, important external dependency, manager/client/lecturer expectation.
- Medium: should be done soon but not critical.
- Low: no clear urgency.

Category rules:
- Use Work if it relates to job, client, report, project, survey, meeting, manager, colleague.
- Use Studies if it relates to university, lecturer, assignment, seminar, exam.
- Use Family/Home if it relates to household or family coordination.
- Use Personal for private life admin.
- Use Other only if no category fits.

Owner rules:
- If the text says who needs to do it, use that person.
- If unclear, use "Unassigned".
- If the user is clearly being asked to do it, use "Me".

Duration:
Estimate a simple duration in minutes: 15, 30, 45, 60, 90 or 120.

User profile:
${formatUserProfile(userProfile)}

Recent task context:
${JSON.stringify(recentTasks || [], null, 2)}

Pasted source text:
${sourceText}
`.trim();
}

function formatUserProfile(profile) {
  if (!profile) {
    return "No user profile was provided. The user may have skipped onboarding.";
  }

  return JSON.stringify({
    work: profile.work || "",
    studies: profile.studies || "",
    lifeAreas: Array.isArray(profile.lifeAreas) ? profile.lifeAreas : [],
    people: Array.isArray(profile.people) ? profile.people : [],
    projects: Array.isArray(profile.projects) ? profile.projects : []
  }, null, 2);
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  if (!Array.isArray(data.output)) {
    return "";
  }

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

function sanitizeTask(task, sourceText) {
  return {
    title: safeString(task.title, "New task"),
    category: safeEnum(task.category, ["Work", "Studies", "Family", "Personal", "Home", "Finance", "Health", "Other"], "Other"),
    deadlineText: safeString(task.deadlineText, ""),
    dueDate: isIsoDate(task.dueDate) ? task.dueDate : "",
    priority: safeEnum(task.priority, ["Low", "Medium", "High", "Urgent"], "Medium"),
    owner: safeString(task.owner, "Unassigned"),
    sourceType: safeEnum(task.sourceType, ["Message", "Email", "Calendar Invite", "Reminder", "Conversation", "Other"], "Other"),
    durationMinutes: safeDuration(task.durationMinutes),
    notes: safeString(task.notes, ""),
    missingInfo: Array.isArray(task.missingInfo) ? task.missingInfo.map(item => String(item)).filter(Boolean) : [],
    suggestedAction: safeString(task.suggestedAction, "Review and complete the task."),
    priorityReason: safeString(task.priorityReason, "Priority was estimated based on the provided text."),
    confidence: typeof task.confidence === "number" ? clamp(task.confidence, 0, 1) : 0.7,
    originalText: sourceText
  };
}

function buildFallbackTask(sourceText, reason) {
  const lower = sourceText.toLowerCase();

  let category = "Other";

  if (includesAny(lower, ["דוח", "לקוח", "סקר", "מייל", "עבודה", "project", "client", "report", "meeting"])) {
    category = "Work";
  } else if (includesAny(lower, ["מרצה", "לימודים", "סמינריון", "assignment", "study", "exam"])) {
    category = "Studies";
  } else if (includesAny(lower, ["בית", "משפחה", "אמא", "אבא", "family", "home"])) {
    category = "Family";
  }

  let priority = "Medium";

  if (includesAny(lower, ["דחוף", "בהול", "urgent", "asap", "היום"])) {
    priority = "Urgent";
  } else if (includesAny(lower, ["חשוב", "מחר", "עד חמישי", "high"])) {
    priority = "High";
  }

  let sourceType = "Message";

  if (includesAny(lower, ["subject:", "regards", "forwarded", "email", "מייל"])) {
    sourceType = "Email";
  } else if (includesAny(lower, ["meeting", "invite", "זימון", "פגישה"])) {
    sourceType = "Calendar Invite";
  }

  return {
    title: sourceText.replace(/\s+/g, " ").trim().slice(0, 80) || "New task",
    category,
    deadlineText: detectDeadlineText(lower),
    dueDate: "",
    priority,
    owner: detectOwner(sourceText),
    sourceType,
    durationMinutes: 30,
    notes: `Local fallback was used. Reason: ${reason}`,
    missingInfo: ["Exact deadline may need confirmation"],
    suggestedAction: "Review the task details and complete the missing information.",
    priorityReason: "Fallback priority is based on simple keywords and deadline hints.",
    confidence: 0.45,
    originalText: sourceText
  };
}

function includesAny(text, terms) {
  return terms.some(term => text.includes(term.toLowerCase()));
}

function detectDeadlineText(text) {
  if (includesAny(text, ["היום", "today"])) return "Today";
  if (includesAny(text, ["מחר", "tomorrow"])) return "Tomorrow";
  if (includesAny(text, ["חמישי", "thursday"])) return "Thursday";
  if (includesAny(text, ["שישי", "friday"])) return "Friday";
  if (includesAny(text, ["שבוע הבא", "next week"])) return "Next week";
  return "";
}

function detectOwner(text) {
  const match = text.match(/(?:ל|אל|to)\s?([א-תA-Za-z]{2,})/);

  if (match && match[1]) {
    return match[1];
  }

  return "Unassigned";
}

function safeString(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function safeEnum(value, allowed, fallback) {
  const text = String(value || "").trim();
  return allowed.includes(text) ? text : fallback;
}

function safeDuration(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return 30;
  }

  return Math.min(Math.max(number, 5), 240);
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
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