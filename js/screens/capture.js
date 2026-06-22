import { getProfile, getCorrections, addCorrection, getTasks, saveTasks } from "../storage.js";
import { uuid, normalizePriority, normalizeCategory, normalizeSourceType } from "../taskUtils.js";
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
  previewCategory: document.getElementById("previewCategory"),
  previewDeadlineText: document.getElementById("previewDeadlineText"),
  previewDueDate: document.getElementById("previewDueDate"),
  previewPriority: document.getElementById("previewPriority"),
  previewOwner: document.getElementById("previewOwner"),
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
  if (on) {
    clearError();
    clearInfo();
  }
}

function showError(msg, showRetry = false) {
  if (showRetry) {
    const retryText = els.sourceTextInput.value.trim();
    els.errorState.innerHTML = `
      <span>${escapeHtml(msg)}</span>
      <button class="ghost-btn small-btn-inline" type="button" id="retryAiBtn">Try again</button>
    `;
    const retryBtn = document.getElementById("retryAiBtn");
    if (retryBtn && retryText) {
      retryBtn.addEventListener("click", () => runAiExtraction(retryText));
    }
  } else {
    els.errorState.textContent = msg;
  }
  els.errorState.classList.remove("hidden");
}

function clearError() {
  els.errorState.innerHTML = "";
  els.errorState.classList.add("hidden");
}

function showInfo(msg) {
  els.infoState.textContent = msg;
  els.infoState.classList.remove("hidden");
}

function clearInfo() {
  els.infoState.textContent = "";
  els.infoState.classList.add("hidden");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  if (!els.sourceChips) return;
  els.sourceChips.querySelectorAll("button.source-chip").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.source === source);
  });
}

function clearSourceSelection() {
  selectedSourceHint = null;
  if (!els.sourceChips) return;
  els.sourceChips.querySelectorAll("button.source-chip").forEach(btn => {
    btn.classList.remove("selected");
  });
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
    profile.work,
    profile.studies,
    profile.workContext?.role,
    profile.workContext?.industry,
    profile.workContext?.commonProjects,
    profile.studyContext?.field,
    ...(profile.lifeAreas || []),
    ...(profile.people || []),
    ...(profile.projects || []),
    ...(profile.commonTaskTypes || [])
  ].filter(Boolean);

  els.contextStatus.textContent = `${signals.length} context signals`;
  els.contextStatus.classList.add("good");
}

// ── Map AI response (new schema) to app task model ────────────────────

function mapAiResultToTask(apiTask, sourceHint, originalText) {
  const deadline = apiTask.deadline || "";
  const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(deadline);

  let deadlineText = "";
  if (isIsoDate) {
    try {
      const d = new Date(`${deadline}T12:00:00`);
      deadlineText = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    } catch {
      deadlineText = deadline;
    }
  }

  const resolvedSource = apiTask.source && apiTask.source !== "Other"
    ? apiTask.source
    : (sourceHint || "Other");

  return {
    title: apiTask.title || "New task",
    category: normalizeCategory(apiTask.category),
    deadlineText,
    dueDate: isIsoDate ? deadline : "",
    priority: normalizePriority(apiTask.priority),
    priorityReason: apiTask.priorityReason || "",
    owner: apiTask.owner || "Unassigned",
    sourceType: normalizeSourceType(resolvedSource),
    durationMinutes: Number(apiTask.estimatedDurationMinutes) || 0,
    notes: apiTask.notes || "",
    missingInfo: Array.isArray(apiTask.missingInformation) ? apiTask.missingInformation : [],
    suggestedAction: "",
    confidence: apiTask.confidence,
    originalText,
    // Store AI suggestions for correction tracking
    aiSuggestedCategory: apiTask.category,
    aiSuggestedPriority: apiTask.priority,
    aiSuggestedOwner: apiTask.owner || ""
  };
}

// ── Fill / read preview form ──────────────────────────────────────────

function fillPreview(task, badgeLabel, badgeClass) {
  currentPreviewTask = task;

  els.previewTitle.value = task.title || "";
  els.previewCategory.value = normalizeCategory(task.category);
  els.previewDeadlineText.value = task.deadlineText || "";
  els.previewDueDate.value = task.dueDate || "";
  els.previewPriority.value = normalizePriority(task.priority);
  els.previewOwner.value = task.owner || "";

  const srcNorm = normalizeSourceType(task.sourceType);
  const srcEl = els.previewSourceType;
  const srcOption = Array.from(srcEl.options).find(o => o.value === srcNorm);
  srcEl.value = srcOption ? srcNorm : "Other";

  els.previewDuration.value = task.durationMinutes || "";
  els.previewNotes.value = task.notes || "";
  els.previewMissingInfo.value = Array.isArray(task.missingInfo)
    ? task.missingInfo.join("\n")
    : String(task.missingInfo || "");
  els.previewSuggestedAction.value = task.suggestedAction || "";
  els.previewPriorityReason.value = task.priorityReason || "";

  els.aiSourceBadge.textContent = badgeLabel || "AI result";
  els.aiSourceBadge.className = `status-pill ${badgeClass || "ai"}`;

  showPreviewStep();
}

function readPreviewTask() {
  const missingInfo = els.previewMissingInfo.value
    .split("\n").map(s => s.trim()).filter(Boolean);

  return {
    id: currentPreviewTask?.id || uuid(),
    title: els.previewTitle.value.trim(),
    category: els.previewCategory.value,
    deadlineText: els.previewDeadlineText.value.trim(),
    dueDate: els.previewDueDate.value,
    priority: els.previewPriority.value,
    owner: els.previewOwner.value.trim() || "Unassigned",
    sourceType: els.previewSourceType.value,
    durationMinutes: Number(els.previewDuration.value || 0),
    notes: els.previewNotes.value.trim(),
    missingInfo,
    suggestedAction: els.previewSuggestedAction.value.trim(),
    priorityReason: els.previewPriorityReason.value.trim(),
    originalText: currentPreviewTask?.originalText || "",
    confidence: currentPreviewTask?.confidence,
    aiSuggestedCategory: currentPreviewTask?.aiSuggestedCategory,
    aiSuggestedPriority: currentPreviewTask?.aiSuggestedPriority,
    aiSuggestedOwner: currentPreviewTask?.aiSuggestedOwner,
    status: currentPreviewTask?.status || "Open",
    aiGenerated: currentPreviewTask?.aiGenerated ?? true,
    createdAt: currentPreviewTask?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

// ── Correction tracking ───────────────────────────────────────────────

function recordCorrectionIfNeeded(finalTask) {
  const original = currentPreviewTask;
  if (!original || !original.aiGenerated) return;

  const categoryChanged = original.aiSuggestedCategory &&
    normalizeCategory(original.aiSuggestedCategory) !== finalTask.category;
  const priorityChanged = original.aiSuggestedPriority &&
    normalizePriority(original.aiSuggestedPriority) !== finalTask.priority;
  const ownerChanged = original.aiSuggestedOwner !== undefined &&
    (original.aiSuggestedOwner || "Unassigned") !== finalTask.owner;

  if (categoryChanged || priorityChanged || ownerChanged) {
    addCorrection({
      aiCategory: original.aiSuggestedCategory || "",
      finalCategory: finalTask.category,
      aiPriority: original.aiSuggestedPriority || "",
      finalPriority: finalTask.priority,
      aiOwner: original.aiSuggestedOwner || "",
      finalOwner: finalTask.owner
    });
  }
}

// ── AI extraction ─────────────────────────────────────────────────────

async function runAiExtraction(text) {
  if (isSubmitting) return;

  clearError();
  clearInfo();

  if (!text) {
    showError("Paste a message, email, invitation, or reminder first.");
    return;
  }

  if (text.length > MAX_INPUT_CHARS) {
    showError("This text is too long. Please paste only the part that contains the task.");
    return;
  }

  setLoading(true);

  try {
    const data = await analyzeTaskWithAI({
      copiedText: text,
      sourceHint: selectedSourceHint,
      userProfile: getProfile(),
      corrections: getCorrections()
    });

    const mappedTask = mapAiResultToTask(data.task, selectedSourceHint, text);
    mappedTask.aiGenerated = true;

    fillPreview(mappedTask, "AI result", "ai");
  } catch (err) {
    showError(err.message || "TaskWise could not organize this task right now. Please try again or add it manually.", true);
  } finally {
    setLoading(false);
  }
}

// ── Save handler ──────────────────────────────────────────────────────

function handleSaveTask(event) {
  event.preventDefault();

  const task = readPreviewTask();
  if (!task.title) {
    showError("Task name is required.");
    return;
  }

  recordCorrectionIfNeeded(task);

  const tasks = getTasks();
  const idx = tasks.findIndex(t => t.id === task.id);

  if (idx >= 0) {
    tasks[idx] = task;
  } else {
    tasks.push(task);
  }

  saveTasks(tasks);
  currentPreviewTask = null;
  els.sourceTextInput.value = "";
  clearError();
  clearInfo();
  clearSourceSelection();
  showCaptureStep();

  if (onTaskSaved) onTaskSaved();
}

// ── Public API ────────────────────────────────────────────────────────

export function startCapture(text) {
  clearError();
  clearInfo();
  showCaptureStep();
  els.sourceTextInput.value = text;
  if (text.trim()) runAiExtraction(text.trim());
}

export function openManualCapture() {
  clearError();
  clearInfo();
  currentPreviewTask = {
    title: "", category: "Other", deadlineText: "", dueDate: "",
    priority: "Medium", owner: "Me", sourceType: "Manual",
    durationMinutes: 0, notes: "", missingInfo: [], suggestedAction: "",
    priorityReason: "", originalText: "", aiGenerated: false
  };
  fillPreview(currentPreviewTask, "Manual entry", "");
}

export function openTaskForEdit(task) {
  clearError();
  clearInfo();
  currentPreviewTask = task;
  els.sourceTextInput.value = task.originalText || "";
  fillPreview(
    { ...task, missingInfo: task.missingInfo || [] },
    task.aiGenerated ? "AI result" : "Manual entry",
    task.aiGenerated ? "ai" : ""
  );
}

export function resetCaptureScreen() {
  currentPreviewTask = null;
  isSubmitting = false;
  els.sourceTextInput.value = "";
  clearError();
  clearInfo();
  clearSourceSelection();
  showCaptureStep();
}

// ── Init ──────────────────────────────────────────────────────────────

export function initCaptureScreen(options = {}) {
  onTaskSaved = options.onTaskSaved || null;

  // Source chip selection
  if (els.sourceChips) {
    els.sourceChips.addEventListener("click", e => {
      const chip = e.target.closest("button.source-chip");
      if (!chip) return;
      const source = chip.dataset.source;
      if (selectedSourceHint === source) {
        clearSourceSelection();
      } else {
        setSelectedSource(source);
      }
    });
  }

  els.createTaskBtn.addEventListener("click", () => {
    if (!isSubmitting) runAiExtraction(els.sourceTextInput.value.trim());
  });

  els.addManualTaskBtn.addEventListener("click", () => {
    openManualCapture();
  });

  els.loadExampleBtn.addEventListener("click", () => {
    els.sourceTextInput.value = "Send the final report to Harel for survey X by Thursday. It's urgent because the client is waiting, and if anything is missing check with Dani.";
  });

  els.previewForm.addEventListener("submit", handleSaveTask);

  els.cancelPreviewBtn.addEventListener("click", () => {
    currentPreviewTask = null;
    showCaptureStep();
  });

  document.addEventListener("keydown", event => {
    if (
      event.key === "Escape" &&
      getActiveScreen() === "capture" &&
      !els.previewStep.classList.contains("hidden")
    ) {
      currentPreviewTask = null;
      showCaptureStep();
    }
  });

  onProfileChange(updateContextStatus);
  updateContextStatus();
  showCaptureStep();
}
