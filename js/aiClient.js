export async function analyzeTaskWithAI({ sourceText, sourceType, profile }) {
  const payload = {
    sourceText,
    sourceType: sourceType || null,
    relevantContext: buildRelevantContext(profile)
  };

  let response;
  try {
    response = await fetch("/.netlify/functions/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection and try again.");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response. Please try again.");
  }

  if (!response.ok) {
    throw new Error(
      data?.error || "TaskWise could not organize this task right now. Please try again or add it manually."
    );
  }

  return data; // { result: AiResult }
}

// ── Build compact relevant context from onboarding profile ────────────
// Only sends structured arrays of names/labels — no free-form text blocks.

function buildRelevantContext(profile) {
  if (!profile) return {};

  const ctx = {};

  // Workplaces / industries
  const workplaces = [];
  if (profile.workContext?.industry) workplaces.push(profile.workContext.industry);
  if (workplaces.length) ctx.workplaces = workplaces;

  // Universities
  if (profile.studyContext?.institution) {
    ctx.universities = [profile.studyContext.institution];
  }

  // Courses / fields of study
  const courses = [];
  if (profile.studyContext?.field) courses.push(profile.studyContext.field);
  if (profile.studyContext?.commonProjects) {
    splitList(profile.studyContext.commonProjects).forEach(c => courses.push(c));
  }
  if (courses.length) ctx.courses = courses.slice(0, 5);

  // Known people (from work context)
  if (profile.workContext?.knownPeople) {
    const people = splitList(profile.workContext.knownPeople).slice(0, 10);
    if (people.length) ctx.knownPeople = people;
  }

  // Known projects / clients
  if (profile.workContext?.commonProjects) {
    const projects = splitList(profile.workContext.commonProjects).slice(0, 5);
    if (projects.length) ctx.knownProjects = projects;
  }

  // Family responsibilities
  if (profile.familyContext?.responsibilities?.length) {
    ctx.familyResponsibilities = profile.familyContext.responsibilities.slice(0, 5);
  }

  return ctx;
}

function splitList(str) {
  return String(str || "")
    .split(/[,;،\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}
