import { getProfile, getCorrections, addCorrection, getTasks, saveTasks } from "../storage.js";
import {
  uuid, normalizePriority, normalizeCategory, normalizeSourceType,
  resolveDeadline, calculatePriority
} from "../taskUtils.js";
import { analyzeTaskWithAI } from "../aiClient.js";
import { onProfileChange } from "./onboarding.js";
import { getActiveScreen } from "../nav.js";

const MAX_INPUT_CHARS = 4000;

const els = {
  contextStatus: document.getElementById("contextStatus"),
  sourceTextInput: document.getElementById("sourceTextInput"),
  sourceChips: document.getElementById("captureSourceChips"),
  createTaskBtn: document.getElementById("createTaskBtn"),
  addManualTaskBtn: document.getElementById("addManualTaskBtn"),
  loadExampleBtn: document.getElementById("loadExampleBtn"),
  loadingState: document.getElementById("loadingState"),
  errorState: document.getElementById("errorState"),
  infoState: document.getElementById("infoState"),

  captureStep: document.getElementById("captureStep"),
  previewStep: document.getElementById("previewStep"),
  aiSourceBadge: document.getElementById("aiSourceBadge"),
  previewForm: document.getElementById("previewForm"),
  previewTitle: document.getElementById("previewTitle"),
  previewTitleWarning: document.getElementById("previewTitleWarning"),
  previewCategory: document.getElementById("previewCategory"),
  previewCategoryHint: document.getElementById("previewCategoryHint"),
  previewDeadlineText: document.getElementById("previewDeadlineText"),
  previewDueDate: document.getElementById("previewDueDate"),
  previewPriority: document.getElementById("previewPriority"),
  previewOwner: document.getElementById("previewOwner"),
  previewPeople: document.getElementById("previewPeople"),
  previewProject: document.getElementById("previewProject"),
  previewLocation: document.getElementById("previewLocation"),
  previewSourceType: document.getElementById("previewSourceType"),
  previewDuration: document.getElementById("previewDuration"),
  previewNotes: document.getElementById("previewNotes"),
  previewMissingInfo: document.getElementById("previewMissingInfo"),
  previewSuggestedAction: document.getElementById("previewSuggestedAction"),
  previewPriorityReason: document.getElementById("previewPriorityReason"),
  cancelPreviewBtn: document.getElementById("cancelPreviewBtn")
};

let currentPreviewTask = null;
let onTaskSaved = null;
let selectedSourceHint = null;
let isSubmitting = false;

// ── Loading / error helpers ───────────────────────────────────────────

function setLoading(on) {
  isSubmitting = on;
  els.createTaskBtn.disabled = on;
  els.loadingState.classList.toggle("hidden", !on);
  if (on) { clearError(); clearInfo(); }
}

function showError(msg, withRetry = false) {
  if (withRetry) {
    const retryText = els.sourceTextInput.value.trim();
    els.errorState.innerHTML =
      `<span>${escHtml(msg)}</span>` +
      (retryText
        ? ` <button class="ghost-btn small-btn-inline" type="button" id="retryAiBtn">Try again</button>`
        : "");
    document.getElementById("retryAiBtn")?.addEventListener("click", () => runAiExtraction(retryText));
  } else {
    els.errorState.textContent = msg;
  }
  els.errorState.classList.remove("hidden");
}

function clearError() { els.errorState.innerHTML = ""; els.errorState.classList.add("hidden"); }
function showInfo(msg) { els.infoState.textContent = msg; els.infoState.classList.remove("hidden"); }
function clearInfo() { els.infoState.textContent = ""; els.infoState.classList.add("hidden"); }
function escHtml(v) {
  return String(v || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

// ── Step visibility ───────────────────────────────────────────────────

function showCaptureStep() {
  els.captureStep.classList.remove("hidden");
  els.previewStep.classList.add("hidden");
}
function showPreviewStep() {
  els.captureStep.classList.add("hidden");
  els.previewStep.classList.remove("hidden");
}

// ── Source chip selection ─────────────────────────────────────────────

function setSelectedSource(source) {
  selectedSourceHint = source;
  els.sourceChips?.querySelectorAll("button.source-chip").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.source === source);
  });
}
function clearSourceSelection() {
  selectedSourceHint = null;
  els.sourceChips?.querySelectorAll("button.source-chip").forEach(btn => btn.classList.remove("selected"));
}

// ── Context status pill ───────────────────────────────────────────────

export function updateContextStatus() {
  const profile = getProfile();
  els.contextStatus.classList.remove("good", "warning");
  if (!profile) {
    els.contextStatus.textContent = "No context yet";
    els.contextStatus.classList.add("warning");
    return;
  }
  const signals = [
    profile.workContext?.role, profile.workContext?.industry, profile.workContext?.commonProjects,
    profile.studyContext?.field, profile.studyContext?.institution,
    ...(profile.lifeAreas || []), ...(profile.commonTaskTypes || [])
  ].filter(Boolean);
  els.contextStatus.textContent = `${signals.length} context signals`;
  els.contextStatus.classList.add("good");
}

// ── Title validation (deterministic, no extra AI call) ────────────────

function validateTitle(title, sourceText) {
  if (!title) return null;
  const words = title.trim().split(/\s+/);
  if (words.length > 15) return "review_long";

  // Flag if title is nearly identical to a long conversational source
  if (sourceText && sourceText.length > 120) {
    const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
    const nt = norm(title);
    const ns = norm(sourceText);
    if (ns.length && nt.length / ns.length > 0.75) return "review_copied";
  }
  return null;
}

// ── Map AI result → internal task object ─────────────────────────────

function mapAiResult(aiResult, sourceType, originalText) {
  const deadlineText = aiResult.deadlineText || null;
  const resolvedDate = resolveDeadline(deadlineText);
  const priority = calculatePriority(resolvedDate, aiResult.urgencySignals);

  const rawCategory = aiResult.category || "";           // "" means AI was unsure
  const category = rawCategory ? (normalizeCategory(rawCategory) || "Other") : null;
  const titleWarning = validateTitle(aiResult.title, originalText);

  return {
    // Core task fields
    title: aiResult.title || "",
    category,
    categoryConfidence: rawCategory ? (aiResult.categoryConfidence || 0) : 0,
    deadlineText,
    dueDate: resolvedDate || "",
    priority,
    owner: aiResult.owner || "Unassigned",
    people: aiResult.people || [],
    project: aiResult.project || null,
    location: aiResult.location || null,
    sourceType: normalizeSourceType(sourceType || "Other"),
    urgencySignals: aiResult.urgencySignals || [],
    notes: aiResult.notes || "",
    missingInfo: aiResult.missingInformation || [],
    suggestedAction: "",
    priorityReason: "",
    originalText,
    isActionable: aiResult.isActionable !== false,
    titleWarning,
    // Metadata for correction tracking
    aiSuggestedCategory: rawCategory || null,
    aiSuggestedOwner: aiResult.owner || "",
    aiGenerated: true
  };
}

// ── Fill preview form ─────────────────────────────────────────────────

function fillPreview(task, badgeLabel, badgeClass) {
  currentPreviewTask = task;

  els.previewTitle.value = task.title || "";

  // Title warning
  if (els.previewTitleWarning) {
    const warn = task.titleWarning;
    els.previewTitleWarning.textContent =
      warn === "review_copied" ? "The title looks similar to the original text — consider shortening it."
      : warn === "review_long" ? "The title is quite long — consider making it more concise."
      : "";
    els.previewTitleWarning.classList.toggle("hidden", !warn);
  }

  // Category — null means AI was unsure
  const cat = task.category;
  if (els.previewCategory) {
    els.previewCategory.value = cat || "";
  }
  if (els.previewCategoryHint) {
    const showHint = !cat;
    els.previewCategoryHint.textContent = showHint ? "Select a category" : "";
    els.previewCategoryHint.classList.toggle("hidden", !showHint);
  }

  els.previewDeadlineText.value = task.deadlineText || "";
  els.previewDueDate.value = task.dueDate || "";
  els.previewPriority.value = normalizePriority(task.priority);
  els.previewOwner.value = task.owner || "";

  if (els.previewPeople) {
    els.previewPeople.value = Array.isArray(task.people) ? task.people.join(", ") : (task.people || "");
  }
  if (els.previewProject) els.previewProject.value = task.project || "";
  if (els.previewLocation) els.previewLocation.value = task.location || "";

  const srcNorm = normalizeSourceType(task.sourceType);
  const srcOption = Array.from(els.previewSourceType.options).find(o => o.value === srcNorm);
  els.previewSourceType.value = srcOption ? srcNorm : "Other";

  els.previewDuration.value = task.durationMinutes || "";
  els.previewNotes.value = task.notes || "";
  els.previewMissingInfo.value = Array.isArray(task.missingInfo)
    ? task.missingInfo.join("\n")
    : String(task.missingInfo || "");
  els.previewSuggestedAction.value = task.suggestedAction || "";
  els.previewPriorityReason.value = task.priorityReason || "";

  els.aiSourceBadge.textContent = `✦ ${badgeLabel || "AI result"}`;
  els.aiSourceBadge.className = `extraction-count`;

  showPreviewStep();
}

function readPreviewTask() {
  const missingInfo = els.previewMissingInfo.value.split("\n").map(s => s.trim()).filter(Boolean);
  const people = els.previewPeople
    ? els.previewPeople.value.split(",").map(s => s.trim()).filter(Boolean)
    : (currentPreviewTask?.people || []);

  return {
    id: currentPreviewTask?.id || uuid(),
    title: els.previewTitle.value.trim(),
    category: els.previewCategory.value || null,
    deadlineText: els.previewDeadlineText.value.trim(),
    dueDate: els.previewDueDate.value,
    priority: els.previewPriority.value,
    owner: els.previewOwner.value.trim() || "Unassigned",
    people,
    project: els.previewProject?.value.trim() || currentPreviewTask?.project || null,
    location: els.previewLocation?.value.trim() || currentPreviewTask?.location || null,
    sourceType: els.previewSourceType.value,
    durationMinutes: Number(els.previewDuration.value || 0),
    notes: els.previewNotes.value.trim(),
    missingInfo,
    suggestedAction: els.previewSuggestedAction.value.trim(),
    priorityReason: els.previewPriorityReason.value.trim(),
    originalText: currentPreviewTask?.originalText || "",
    urgencySignals: currentPreviewTask?.urgencySignals || [],
    categoryConfidence: currentPreviewTask?.categoryConfidence,
    aiSuggestedCategory: currentPreviewTask?.aiSuggestedCategory,
    aiSuggestedOwner: currentPreviewTask?.aiSuggestedOwner,
    status: currentPreviewTask?.status || "Open",
    aiGenerated: currentPreviewTask?.aiGenerated ?? false,
    createdAt: currentPreviewTask?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ── Correction tracking ───────────────────────────────────────────────

function recordCorrectionIfNeeded(finalTask) {
  const orig = currentPreviewTask;
  if (!orig?.aiGenerated) return;

  const catChanged = orig.aiSuggestedCategory &&
    (normalizeCategory(orig.aiSuggestedCategory) || "Other") !== (finalTask.category || "Other");
  const ownerChanged = orig.aiSuggestedOwner !== undefined &&
    (orig.aiSuggestedOwner || "Unassigned") !== finalTask.owner;

  if (catChanged || ownerChanged) {
    addCorrection({
      aiCategory: orig.aiSuggestedCategory || "",
      finalCategory: finalTask.category || "",
      aiOwner: orig.aiSuggestedOwner || "",
      finalOwner: finalTask.owner
    });
  }
}

// ── AI extraction ─────────────────────────────────────────────────────

async function runAiExtraction(text) {
  if (isSubmitting) return;
  clearError(); clearInfo();

  if (!text) { showError("Paste a message, email, invitation, or reminder first."); return; }
  if (text.length > MAX_INPUT_CHARS) {
    showError("This text is too long. Please paste only the part that contains the task."); return;
  }

  setLoading(true);
  try {
    const data = await analyzeTaskWithAI({
      sourceText: text,
      sourceType: selectedSourceHint,
      profile: getProfile()
    });

    const aiResult = data.result;

    if (!aiResult.isActionable) {
      showInfo("The pasted text doesn't appear to contain an actionable task. Try a different message, or add the task manually.");
      return;
    }

    const task = mapAiResult(aiResult, selectedSourceHint, text);
    fillPreview(task, "AI result", "ai");
  } catch (err) {
    showError(
      err.message || "TaskWise could not organize this task right now. Please try again or add it manually.",
      true
    );
  } finally {
    setLoading(false);
  }
}

// ── Save ──────────────────────────────────────────────────────────────

function handleSaveTask(event) {
  event.preventDefault();
  const task = readPreviewTask();
  if (!task.title) { showError("Task name is required."); return; }

  recordCorrectionIfNeeded(task);

  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) tasks[idx] = task; else tasks.push(task);
  saveTasks(tasks);

  currentPreviewTask = null;
  els.sourceTextInput.value = "";
  clearError(); clearInfo(); clearSourceSelection();
  showCaptureStep();
  if (onTaskSaved) onTaskSaved();
}

// ── Public API ────────────────────────────────────────────────────────

export function startCapture(text) {
  clearError(); clearInfo(); showCaptureStep();
  els.sourceTextInput.value = text;
  if (text.trim()) runAiExtraction(text.trim());
}

export function openManualCapture() {
  clearError(); clearInfo();
  currentPreviewTask = {
    title: "", category: null, deadlineText: "", dueDate: "",
    priority: "Medium", owner: "Me", sourceType: "Manual",
    people: [], project: null, location: null,
    durationMinutes: 0, notes: "", missingInfo: [], suggestedAction: "",
    priorityReason: "", originalText: "", aiGenerated: false
  };
  fillPreview(currentPreviewTask, "Manual entry", "");
}

export function openTaskForEdit(task) {
  clearError(); clearInfo();
  currentPreviewTask = { ...task, missingInfo: task.missingInfo || [], people: task.people || [] };
  els.sourceTextInput.value = task.originalText || "";
  fillPreview(currentPreviewTask, task.aiGenerated ? "AI result" : "Manual entry", task.aiGenerated ? "ai" : "");
}

export function resetCaptureScreen() {
  currentPreviewTask = null; isSubmitting = false;
  els.sourceTextInput.value = "";
  clearError(); clearInfo(); clearSourceSelection();
  showCaptureStep();
}

// ── Init ──────────────────────────────────────────────────────────────

export function initCaptureScreen(options = {}) {
  onTaskSaved = options.onTaskSaved || null;

  // ── Character counter ─────────────────────────────────────────────
  const charCounter = document.getElementById("charCounter");
  function updateCharCounter() {
    if (!charCounter) return;
    const len = els.sourceTextInput.value.length;
    charCounter.textContent = `${len} / ${MAX_INPUT_CHARS}`;
    charCounter.className = "char-counter" +
      (len >= MAX_INPUT_CHARS ? " at-limit" : len >= MAX_INPUT_CHARS * 0.85 ? " near-limit" : "");
  }
  els.sourceTextInput.addEventListener("input", updateCharCounter);
  updateCharCounter();

  // ── "Add to calendar" on preview step ────────────────────────────
  document.getElementById("addToCalendarPreviewBtn")?.addEventListener("click", () => {
    const task = readPreviewTask();
    if (task.dueDate) {
      import("../ics.js").then(({ downloadIcsFile }) => downloadIcsFile(task));
    }
  });

  els.sourceChips?.addEventListener("click", e => {
    const chip = e.target.closest("button.source-chip");
    if (!chip) return;
    const src = chip.dataset.source;
    if (selectedSourceHint === src) clearSourceSelection(); else setSelectedSource(src);
  });

  els.createTaskBtn.addEventListener("click", () => {
    if (!isSubmitting) runAiExtraction(els.sourceTextInput.value.trim());
  });

  els.addManualTaskBtn.addEventListener("click", openManualCapture);

  els.loadExampleBtn.addEventListener("click", () => {
    els.sourceTextInput.value = "Hi Omer, please update the presentation and send it to Maya by Thursday evening. Daniel will review the business slide before submission.";
    updateCharCounter();
  });

  els.previewForm.addEventListener("submit", handleSaveTask);

  els.cancelPreviewBtn.addEventListener("click", () => {
    currentPreviewTask = null;
    showCaptureStep();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && getActiveScreen() === "capture" && !els.previewStep.classList.contains("hidden")) {
      currentPreviewTask = null;
      showCaptureStep();
    }
  });

  onProfileChange(updateContextStatus);
  updateContextStatus();
  showCaptureStep();
}
