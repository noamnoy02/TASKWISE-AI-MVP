import { getProfile, getRecentTaskContext, getTasks, saveTasks } from "../storage.js";
import { uuid, normalizePriority, normalizeCategory, normalizeSourceType } from "../taskUtils.js";
import { createFallbackTaskFromText } from "../fallbackTask.js";
import { analyzeTaskWithAI } from "../aiClient.js";
import { onProfileChange } from "./onboarding.js";
import { showScreen, getActiveScreen } from "../nav.js";

const els = {
  contextStatus: document.getElementById("contextStatus"),
  sourceTextInput: document.getElementById("sourceTextInput"),
  createTaskBtn: document.getElementById("createTaskBtn"),
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

function setLoading(isLoading) {
  els.createTaskBtn.disabled = isLoading;
  els.loadingState.classList.toggle("hidden", !isLoading);
}

function showError(message) {
  els.errorState.textContent = message;
  els.errorState.classList.remove("hidden");
}

function clearError() {
  els.errorState.textContent = "";
  els.errorState.classList.add("hidden");
}

function showInfo(message) {
  els.infoState.textContent = message;
  els.infoState.classList.remove("hidden");
}

function clearInfo() {
  els.infoState.textContent = "";
  els.infoState.classList.add("hidden");
}

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
    ...(profile.lifeAreas || []),
    ...(profile.people || []),
    ...(profile.projects || [])
  ].filter(Boolean);

  els.contextStatus.textContent = `${signals.length} context signals`;
  els.contextStatus.classList.add("good");
}

function showCaptureStep() {
  els.captureStep.classList.remove("hidden");
  els.previewStep.classList.add("hidden");
}

function showPreviewStep() {
  els.captureStep.classList.add("hidden");
  els.previewStep.classList.remove("hidden");
}

function fillPreview(task, usedFallback) {
  currentPreviewTask = {
    ...task,
    originalText: currentPreviewTask?.originalText ?? els.sourceTextInput.value.trim(),
    usedFallback: Boolean(usedFallback)
  };

  els.previewTitle.value = task.title || "";
  els.previewCategory.value = normalizeCategory(task.category);
  els.previewDeadlineText.value = task.deadlineText || "";
  els.previewDueDate.value = task.dueDate || "";
  els.previewPriority.value = normalizePriority(task.priority);
  els.previewOwner.value = task.owner || "Unassigned";
  els.previewSourceType.value = normalizeSourceType(task.sourceType);
  els.previewDuration.value = Number(task.durationMinutes || 30);
  els.previewNotes.value = task.notes || "";
  els.previewMissingInfo.value = Array.isArray(task.missingInfo)
    ? task.missingInfo.join("\n")
    : String(task.missingInfo || "");
  els.previewSuggestedAction.value = task.suggestedAction || "";
  els.previewPriorityReason.value = task.priorityReason || "";

  els.aiSourceBadge.textContent = usedFallback ? "Fallback result" : "AI result";
  els.aiSourceBadge.classList.toggle("warning", Boolean(usedFallback));
  els.aiSourceBadge.classList.toggle("ai", !usedFallback);

  showPreviewStep();
}

function readPreviewTask() {
  const missingInfo = els.previewMissingInfo.value
    .split("\n")
    .map(item => item.trim())
    .filter(Boolean);

  return {
    id: currentPreviewTask?.id || uuid(),
    title: els.previewTitle.value.trim(),
    category: els.previewCategory.value,
    deadlineText: els.previewDeadlineText.value.trim(),
    dueDate: els.previewDueDate.value,
    priority: els.previewPriority.value,
    owner: els.previewOwner.value.trim() || "Unassigned",
    sourceType: els.previewSourceType.value,
    durationMinutes: Number(els.previewDuration.value || 30),
    notes: els.previewNotes.value.trim(),
    missingInfo,
    suggestedAction: els.previewSuggestedAction.value.trim(),
    priorityReason: els.previewPriorityReason.value.trim(),
    originalText: currentPreviewTask ? currentPreviewTask.originalText : "",
    // Preserved so re-opening a fallback-created task for editing still shows
    // the "Fallback result" badge instead of looking like a fresh AI result.
    usedFallback: currentPreviewTask ? Boolean(currentPreviewTask.usedFallback) : false,
    status: currentPreviewTask?.status || "Open",
    createdAt: currentPreviewTask?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function handleCreateTask() {
  clearError();
  clearInfo();

  const text = els.sourceTextInput.value.trim();

  if (!text) {
    showError("Paste a message, email, invite or reminder first.");
    return;
  }

  setLoading(true);

  try {
    const data = await analyzeTaskWithAI({
      sourceText: text,
      userProfile: getProfile(),
      recentTasks: getRecentTaskContext()
    });

    if (data.usedFallback) {
      showInfo("AI is running in offline/demo mode (no API key configured yet), so a local best-guess was used instead.");
    }

    currentPreviewTask = null;
    fillPreview(data.task, data.usedFallback);
  } catch (error) {
    showInfo("Couldn't reach the AI right now, so a local best-guess was used instead.");
    currentPreviewTask = null;
    fillPreview(createFallbackTaskFromText(text), true);
  } finally {
    setLoading(false);
  }
}

function handleSaveTask(event) {
  event.preventDefault();

  const task = readPreviewTask();

  if (!task.title) {
    showError("Task name is required.");
    return;
  }

  const tasks = getTasks();
  const existingIndex = tasks.findIndex(item => item.id === task.id);

  if (existingIndex >= 0) {
    tasks[existingIndex] = task;
  } else {
    tasks.push(task);
  }

  saveTasks(tasks);

  currentPreviewTask = null;
  els.sourceTextInput.value = "";
  showCaptureStep();

  if (onTaskSaved) onTaskSaved();
}

function cancelPreview() {
  currentPreviewTask = null;
  showCaptureStep();
}

function loadExample() {
  els.sourceTextInput.value = "היי נעם, תעבירי להראל את הדוח הסופי לסקר X עד חמישי בערב. זה די דחוף כי הלקוח מחכה לזה, ואם חסר משהו תבדקי מול דני.";
}

// Entry point used by the Tasks screen's "Edit" action: opens Capture with
// the existing task loaded into the preview step instead of a blank form.
export function openTaskForEdit(task) {
  currentPreviewTask = task;
  els.sourceTextInput.value = task.originalText || "";
  showScreen("capture");
  fillPreview(task, Boolean(task.usedFallback));
}

export function resetCaptureScreen() {
  currentPreviewTask = null;
  els.sourceTextInput.value = "";
  clearError();
  clearInfo();
  showCaptureStep();
}

export function initCaptureScreen(options = {}) {
  onTaskSaved = options.onTaskSaved || null;

  els.createTaskBtn.addEventListener("click", handleCreateTask);
  els.loadExampleBtn.addEventListener("click", loadExample);
  els.previewForm.addEventListener("submit", handleSaveTask);
  els.cancelPreviewBtn.addEventListener("click", cancelPreview);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && getActiveScreen() === "capture" && !els.previewStep.classList.contains("hidden")) {
      cancelPreview();
    }
  });

  onProfileChange(updateContextStatus);
  updateContextStatus();
  showCaptureStep();
}
