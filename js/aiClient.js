export async function analyzeTaskWithAI({ copiedText, sourceHint, userProfile, corrections }) {
  const payload = {
    copiedText,
    sourceHint: sourceHint || null,
    userProfile: buildCompactProfile(userProfile, corrections),
    currentDateTime: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
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
    throw new Error(data?.error || "TaskWise could not organize this task right now. Please try again or add it manually.");
  }

  return data; // { task: ApiTask }
}

// ── Build compact profile for AI (only non-empty fields) ─────────────

function buildCompactProfile(profile, corrections) {
  if (!profile) return null;

  const compact = {};

  if (profile.displayName) compact.displayName = profile.displayName;
  if (Array.isArray(profile.lifeAreas) && profile.lifeAreas.length) {
    compact.lifeAreas = profile.lifeAreas;
  }
  if (profile.currentSituation) compact.currentSituation = profile.currentSituation;

  const wc = profile.workContext;
  if (wc && (wc.role || wc.industry || wc.commonProjects || wc.knownPeople)) {
    compact.workContext = {};
    if (wc.role) compact.workContext.role = wc.role;
    if (wc.industry) compact.workContext.industry = wc.industry;
    if (wc.commonProjects) compact.workContext.commonProjects = wc.commonProjects;
    if (wc.knownPeople) compact.workContext.knownPeople = wc.knownPeople;
  }

  const sc = profile.studyContext;
  if (sc && (sc.studyType || sc.field || sc.institution || sc.commonProjects)) {
    compact.studyContext = {};
    if (sc.studyType) compact.studyContext.studyType = sc.studyType;
    if (sc.field) compact.studyContext.field = sc.field;
    if (sc.institution) compact.studyContext.institution = sc.institution;
    if (sc.commonProjects) compact.studyContext.commonProjects = sc.commonProjects;
  }

  const fc = profile.familyContext;
  if (fc && Array.isArray(fc.responsibilities) && fc.responsibilities.length) {
    compact.familyContext = { responsibilities: fc.responsibilities };
  }

  if (Array.isArray(profile.commonTaskTypes) && profile.commonTaskTypes.length) {
    compact.commonTaskTypes = profile.commonTaskTypes;
  }

  if (Array.isArray(corrections) && corrections.length) {
    compact.recentClassificationCorrections = corrections.slice(-5).map(c => ({
      aiCategory: c.aiCategory,
      finalCategory: c.finalCategory,
      aiPriority: c.aiPriority,
      finalPriority: c.finalPriority,
      aiOwner: c.aiOwner,
      finalOwner: c.finalOwner
    }));
  }

  return compact;
}
