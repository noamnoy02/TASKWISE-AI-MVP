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
// Sends structured data only — no free-form text blocks.
// Handles both old (pre-refactor) and new schema fields.

function buildRelevantContext(profile) {
  if (!profile) return {};

  const ctx = {};

  if (profile.lifeAreas?.length) ctx.lifeAreas = profile.lifeAreas;

  // Work context
  const wc = profile.workContext;
  if (wc && profile.lifeAreas?.includes("Work")) {
    const workCtx = {};
    const industry = effectiveVal(wc.industry, wc.industryCustom);
    const role = effectiveVal(wc.role, wc.roleCustom);
    const workplace = effectiveVal(wc.workplace, wc.workplaceCustom);

    if (industry) workCtx.industry = industry;
    if (role) workCtx.role = role;
    if (workplace) workCtx.workplace = workplace;

    // New schema: projectsOrPeople array; old schema: commonProjects/knownPeople strings
    const projects = wc.projectsOrPeople?.length
      ? wc.projectsOrPeople
      : splitList([wc.commonProjects, wc.knownPeople].filter(Boolean).join(", "));
    if (projects.length) workCtx.projectsOrPeople = projects.slice(0, 10);

    if (Object.keys(workCtx).length) ctx.work = workCtx;
  }

  // Study context
  const sc = profile.studyContext;
  if (sc && profile.lifeAreas?.includes("Studies")) {
    const studyCtx = {};
    const institution = effectiveVal(sc.institution, sc.institutionCustom);
    // New schema: degreeLevel; old schema: studyType
    const degree = effectiveVal(sc.degreeLevel, sc.degreeLevelCustom) || sc.studyType || null;
    // New schema: fieldOfStudy; old schema: field
    const field = effectiveVal(sc.fieldOfStudy || sc.field, sc.fieldOfStudyCustom);

    if (institution) studyCtx.institution = institution;
    if (degree) studyCtx.degreeLevel = degree;
    if (field) studyCtx.fieldOfStudy = field;

    // New schema: coursesOrPeople array; old schema: commonProjects string
    const courses = sc.coursesOrPeople?.length
      ? sc.coursesOrPeople
      : splitList(sc.commonProjects || "");
    if (courses.length) studyCtx.coursesOrPeople = courses.slice(0, 5);

    if (Object.keys(studyCtx).length) ctx.studies = studyCtx;
  }

  // Family context
  const fc = profile.familyContext;
  if (fc && profile.lifeAreas?.includes("Family")) {
    const famCtx = {};
    const resp = [
      ...(fc.responsibilities || []),
      ...(fc.responsibilitiesCustom || [])
    ].filter(Boolean);
    if (resp.length) famCtx.responsibilities = resp.slice(0, 6);

    const people = fc.people?.length ? fc.people : splitList(fc.members || "");
    if (people.length) famCtx.people = people.slice(0, 5);

    if (Object.keys(famCtx).length) ctx.family = famCtx;
  }

  // Home context
  if (profile.homeContext && profile.lifeAreas?.includes("Home")) {
    const hc = profile.homeContext;
    const resp = [...(hc.responsibilities || []), ...(hc.responsibilitiesCustom || [])].filter(Boolean);
    if (resp.length) ctx.home = { responsibilities: resp.slice(0, 5) };
  }

  // Personal context
  if (profile.personalContext && profile.lifeAreas?.includes("Personal")) {
    const pc = profile.personalContext;
    const resp = [...(pc.responsibilities || []), ...(pc.responsibilitiesCustom || [])].filter(Boolean);
    if (resp.length) ctx.personal = { responsibilities: resp.slice(0, 5) };
  }

  // Health context
  if (profile.healthContext && profile.lifeAreas?.includes("Health")) {
    const hc = profile.healthContext;
    const resp = [...(hc.responsibilities || []), ...(hc.responsibilitiesCustom || [])].filter(Boolean);
    if (resp.length) ctx.health = { responsibilities: resp.slice(0, 5) };
  }

  // Finance context
  if (profile.financeContext && profile.lifeAreas?.includes("Finances")) {
    const fin = profile.financeContext;
    const resp = [...(fin.responsibilities || []), ...(fin.responsibilitiesCustom || [])].filter(Boolean);
    if (resp.length) ctx.finances = { responsibilities: resp.slice(0, 5) };
  }

  return ctx;
}

// When a value is "Other", use the custom value instead.
function effectiveVal(primary, custom) {
  if (!primary || primary === "Other") return custom || null;
  return primary;
}

function splitList(str) {
  return String(str || "")
    .split(/[,;،\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}
