import { daysUntil, buildLocalPriorityReason, getNextBestTask, escapeHtml } from "../taskUtils.js";

const els = {
  nextActionBox: document.getElementById("nextActionBox")
};

export function initOverviewScreen() {
  // No interactive elements on this screen yet beyond the header (which is
  // global) and the Next Best Action card, which is rendered by renderNextAction.
}

export function renderNextAction(tasks) {
  const nextTask = getNextBestTask(tasks);

  if (!nextTask) {
    els.nextActionBox.className = "next-action-box empty-state";
    els.nextActionBox.textContent = tasks.length
      ? "All tasks are done. Nice."
      : "No saved tasks yet. Create your first smart task.";
    return;
  }

  const overdueText = daysUntil(nextTask.dueDate) < 0
    ? "Overdue"
    : nextTask.deadlineText || nextTask.dueDate || "No clear deadline";
  const action = nextTask.suggestedAction || `Start with: ${nextTask.title}`;
  const reason = nextTask.priorityReason || buildLocalPriorityReason(nextTask);

  els.nextActionBox.className = "next-action-box";
  els.nextActionBox.innerHTML = `
    <p class="next-action-title">${escapeHtml(action)}</p>
    <p class="next-action-meta">
      Task: <strong>${escapeHtml(nextTask.title)}</strong><br />
      Owner: ${escapeHtml(nextTask.owner || "Unassigned")} · Priority: ${escapeHtml(nextTask.priority)} · Deadline: ${escapeHtml(overdueText)}
    </p>
    <div class="priority-reason">${escapeHtml(reason)}</div>
  `;
}
