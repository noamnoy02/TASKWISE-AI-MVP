import { getProfile, getCorrections, addCorrection, getTasks, saveTasks } from "../storage.js";
import {
  uuid, normalizePriority, normalizeCategory, normalizeSourceType,
  calculatePriority
} from "../taskUtils.js";
import { analyzeTaskWithAI } from "../aiClient.js";
import { onProfileChange } from "./onboarding.js";
import { getActiveScreen, showScreen } from "../nav.js";

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
  previewCategoryPrompt: document.getElementById("previewCategoryPrompt"),
  previewDueDate: document.getElementById("previewDueDate"),
  previewPriority: document.getElementById("previewPriority"),
  previewSourceType: document.getElementById("previewSourceType"),
  previewDuration: document.getElementById("previewDuration"),
  previewNotes: document.getElementById("previewNotes"),
  previewMissingInfo: document.getElementById("previewMissingInfo"),
  pastDateWarning: document.getElementById("pastDateWarning"),
  cancelPreviewBtn: document.getElementById("cancelPreviewBtn")
};

let currentPreviewTask = null;
let onTaskSaved = null;
let selectedSourceHint = null;
let isSubmitting = false;
let _manualReturnScreen = null;

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
  window.scrollTo(0, 0);
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
  if (!els.contextStatus) return;
  const profile = getProfile();
  els.contextStatus.classList.remove("good", "warning");
  if (!profile) {
    els.contextStatus.textContent = "No context yet";
    els.contextStatus.classList.add("warning");
    return;
  }
  const signals = [
    profile.workContext?.role, profile.workContext?.industry,
    profile.studyContext?.fieldOfStudy,  profile.studyContext?.institution,
    ...(profile.lifeAreas || []), ...(profile.commonTaskTypes || [])
  ].filter(Boolean);
  els.contextStatus.textContent = `${signals.length} context signals`;
  els.contextStatus.classList.add("good");
}

// ── Title validation ──────────────────────────────────────────────────

function validateTitle(title, sourceText) {
  if (!title) return null;
  const words = title.trim().split(/\s+/);
  if (words.length > 15) return "review_long";
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
  const rawCategory = aiResult.category || "";
  const category = rawCategory ? (normalizeCategory(rawCategory) || "Other") : null;
  const titleWarning = validateTitle(aiResult.title, originalText);

  // Use AI-provided dueDate directly (AI calculated it from currentDate)
  const dueDate = aiResult.dueDate || "";

  // Use AI-provided priority, fall back to calculatePriority if missing
  const priority = normalizePriority(aiResult.priority) ||
    calculatePriority(dueDate || null, []);

  // Source: prefer AI detection, fall back to user chip selection
  const aiSource = aiResult.source && aiResult.source !== "Unknown"
    ? aiResult.source
    : (sourceType || "Unknown");

  return {
    title: aiResult.title || "",
    category,
    categoryConfidence: rawCategory ? (aiResult.categoryConfidence || 0) : 0,
    dueDate,
    dueTime: aiResult.dueTime || "",
    priority,
    sourceType: normalizeSourceType(aiSource),
    estimatedDurationMinutes: aiResult.estimatedDurationMinutes || null,
    notes: aiResult.notes || "",
    missingInfo: aiResult.missingInformation || [],
    dueDatePast: aiResult.dueDatePast || false,
    originalText,
    isActionable: aiResult.isActionable !== false,
    titleWarning,
    aiSuggestedCategory: rawCategory || null,
    aiGenerated: true
  };
}

// ── Missing info display ──────────────────────────────────────────────

function renderMissingInfo(task) {
  if (!els.previewMissingInfo) return;

  // Missing info is only meaningful after AI extraction
  if (!task.aiGenerated) {
    els.previewMissingInfo.innerHTML = "";
    return;
  }

  // Compute missing fields from actual task state
  const missing = [...(task.missingInfo || [])];

  // Add fields we can verify locally if AI missed them
  if (!task.dueDate && !missing.includes("Due date")) missing.push("Due date");
  if (!task.category && !missing.includes("Category")) missing.push("Category");

  if (!missing.length) {
    els.previewMissingInfo.innerHTML =
      `<span class="missing-ok">✓ All key details were extracted. Review and save when ready.</span>`;
  } else {
    els.previewMissingInfo.innerHTML =
      `<span class="missing-label">Missing:</span> ` +
      missing.map(m => `<span class="missing-chip">${escHtml(m)}</span>`).join(" ");
  }
}

// ── Fill preview form ─────────────────────────────────────────────────

function fillPreview(task, badgeLabel) {
  currentPreviewTask = task;

  els.previewTitle.value = task.title || "";

  if (els.previewTitleWarning) {
    const warn = task.titleWarning;
    els.previewTitleWarning.textContent =
      warn === "review_copied" ? "The title looks similar to the original text — consider shortening it."
      : warn === "review_long" ? "The title is quite long — consider making it more concise."
      : "";
    els.previewTitleWarning.classList.toggle("hidden", !warn);
  }

  if (els.previewCategory) els.previewCategory.value = task.category || "";

  // Category chips — always visible, pre-select whichever category is set
  if (els.previewCategoryPrompt) {
    els.previewCategoryPrompt.classList.remove("hidden");
    els.previewCategoryPrompt.querySelectorAll("button[data-cat]").forEach(b => {
      b.classList.toggle("selected", b.dataset.cat === (task.category || ""));
    });
  }

  els.previewDueDate.value = task.dueDate || "";
  els.previewPriority.value = normalizePriority(task.priority);

  // Past date warning
  if (els.pastDateWarning) {
    const isPast = task.dueDatePast ||
      (task.dueDate && task.dueDate < new Date().toISOString().split("T")[0]);
    els.pastDateWarning.classList.toggle("hidden", !isPast);
  }

  if (els.previewSourceType) {
    const src = normalizeSourceType(task.sourceType);
    const opt = Array.from(els.previewSourceType.options).find(o => o.value === src);
    els.previewSourceType.value = opt ? src : "Unknown";
  }

  els.previewDuration.value = task.estimatedDurationMinutes || "";
  els.previewNotes.value = task.notes || "";

  renderMissingInfo(task);

  els.aiSourceBadge.textContent = `✦ ${badgeLabel || "AI result"}`;
  els.aiSourceBadge.className = "extraction-count";

  showPreviewStep();
}

function readPreviewTask() {
  return {
    id: currentPreviewTask?.id || uuid(),
    title: els.previewTitle.value.trim(),
    category: els.previewCategory?.value || null,
    dueDate: els.previewDueDate.value,
    dueTime: currentPreviewTask?.dueTime || "",
    priority: els.previewPriority.value,
    sourceType: els.previewSourceType?.value || "Unknown",
    estimatedDurationMinutes: Number(els.previewDuration.value || 0) || null,
    notes: els.previewNotes.value.trim(),
    missingInfo: currentPreviewTask?.missingInfo || [],
    originalText: currentPreviewTask?.originalText || "",
    // preserve legacy fields for home screen display
    deadlineText: currentPreviewTask?.deadlineText || "",
    owner: currentPreviewTask?.owner || "Me",
    people: currentPreviewTask?.people || [],
    categoryConfidence: currentPreviewTask?.categoryConfidence,
    aiSuggestedCategory: currentPreviewTask?.aiSuggestedCategory,
    aiGenerated: currentPreviewTask?.aiGenerated ?? false,
    status: currentPreviewTask?.status || "Open",
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

  if (catChanged) {
    addCorrection({
      aiCategory: orig.aiSuggestedCategory || "",
      finalCategory: finalTask.category || ""
    });
  }
}

// ── AI extraction ─────────────────────────────────────────────────────

async function runAiExtraction(text) {
  if (isSubmitting) return;
  clearError(); clearInfo();

  if (!text) { showError("Add a message, email, invitation, or reminder first."); return; }
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
      showInfo("The text doesn't appear to contain an actionable task. Try a different message, or add the task manually.");
      return;
    }

    const task = mapAiResult(aiResult, selectedSourceHint, text);
    fillPreview(task, "AI result");
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
  _manualReturnScreen = null;
  els.sourceTextInput.value = "";
  clearError(); clearInfo(); clearSourceSelection();
  showCaptureStep();
  if (onTaskSaved) onTaskSaved();
}

// ── Public API ────────────────────────────────────────────────────────

export function startCapture(text, sourceHint) {
  clearError(); clearInfo(); showCaptureStep();
  els.sourceTextInput.value = text;
  if (sourceHint) setSelectedSource(sourceHint);
  if (text.trim()) runAiExtraction(text.trim());
}

export function openManualCapture(returnScreen = null) {
  _manualReturnScreen = returnScreen;
  clearError(); clearInfo();
  currentPreviewTask = {
    title: "", category: null, categoryConfidence: 0,
    dueDate: "", dueTime: "", priority: "Medium",
    sourceType: "Unknown", estimatedDurationMinutes: null,
    notes: "", missingInfo: [], originalText: "",
    deadlineText: "", owner: "Me", people: [],
    aiGenerated: false
  };
  fillPreview(currentPreviewTask, "Manual entry");
}

export function openTaskForEdit(task) {
  clearError(); clearInfo();
  _manualReturnScreen = null;
  currentPreviewTask = {
    ...task,
    missingInfo: task.missingInfo || [],
    people: task.people || [],
    estimatedDurationMinutes: task.estimatedDurationMinutes || task.durationMinutes || null,
    dueDatePast: task.dueDate ? task.dueDate < new Date().toISOString().split("T")[0] : false
  };
  els.sourceTextInput.value = task.originalText || "";
  fillPreview(currentPreviewTask, task.aiGenerated ? "AI result" : "Manual entry");
}

export function resetCaptureScreen() {
  currentPreviewTask = null; isSubmitting = false;
  _manualReturnScreen = null;
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

  // ── Due date change → re-check past date warning ──────────────────
  els.previewDueDate?.addEventListener("change", () => {
    if (!els.pastDateWarning) return;
    const val = els.previewDueDate.value;
    const isPast = val && val < new Date().toISOString().split("T")[0];
    els.pastDateWarning.classList.toggle("hidden", !isPast);
  });

  // ── Category chips ────────────────────────────────────────────────
  document.getElementById("previewCategoryPrompt")
    ?.addEventListener("click", e => {
      const btn = e.target.closest("button[data-cat]");
      if (!btn) return;
      const cat = btn.dataset.cat;
      if (els.previewCategory) els.previewCategory.value = cat;
      document.getElementById("previewCategoryPrompt")
        .querySelectorAll("button[data-cat]")
        .forEach(b => b.classList.toggle("selected", b.dataset.cat === cat));
      if (currentPreviewTask) currentPreviewTask.category = cat;
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

  els.addManualTaskBtn.addEventListener("click", () => openManualCapture(getActiveScreen()));

  els.loadExampleBtn.addEventListener("click", () => {
    els.sourceTextInput.value = "Maya asked me to send the final presentation to Daniel by Thursday. He needs to review the budget slide before we submit it to the client.";
    updateCharCounter();
  });

  els.previewForm.addEventListener("submit", handleSaveTask);

  els.cancelPreviewBtn.addEventListener("click", () => {
    currentPreviewTask = null;
    const ret = _manualReturnScreen;
    _manualReturnScreen = null;
    // Navigate back: if came from a different screen (e.g. home), go there
    if (ret && ret !== "capture") {
      showScreen(ret);
    } else {
      showCaptureStep();
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && getActiveScreen() === "capture" && !els.previewStep.classList.contains("hidden")) {
      const ret = _manualReturnScreen;
      currentPreviewTask = null;
      _manualReturnScreen = null;
      if (ret && ret !== "capture") showScreen(ret); else showCaptureStep();
    }
  });

  onProfileChange(updateContextStatus);
  updateContextStatus();
  showCaptureStep();
}
