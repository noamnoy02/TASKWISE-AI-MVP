import { daysUntil, escapeHtml } from "../taskUtils.js";
import { downloadIcsFile, downloadAllIcsFile } from "../ics.js";
import { getTasks } from "../storage.js";

const els = {
  agenda: document.getElementById("calendarAgenda"),
  exportAllBtn: document.getElementById("exportAllCalBtn"),
  exportSelectedBtn: document.getElementById("exportSelectedCalBtn")
};

// Only tasks with a due date are relevant to the calendar view
const GROUPS = [
  { key: "overdue", label: "Overdue" },
  { key: "today",   label: "Today" },
  { key: "week",    label: "This week" },
  { key: "later",   label: "Later" }
];

function groupKeyFor(task) {
  const days = daysUntil(task.dueDate);
  if (days < 0)  return "overdue";
  if (days === 0) return "today";
  if (days <= 7)  return "week";
  return "later";
}

function renderTaskRow(task) {
  return `
    <li class="agenda-item" data-task-id="${escapeHtml(task.id)}">
      <label class="agenda-check-wrap" title="Select for export">
        <input type="checkbox" class="agenda-check" data-id="${escapeHtml(task.id)}">
      </label>
      <div class="agenda-info">
        <p class="agenda-title">${escapeHtml(task.title)}</p>
        <p class="agenda-meta">
          ${escapeHtml(task.dueDate)} · ${escapeHtml(task.category || "Other")} · ${escapeHtml(task.priority)}
        </p>
      </div>
      <button class="small-btn" type="button" data-action="calendar-single">Add to calendar</button>
    </li>
  `;
}

export function renderCalendarScreen(tasks) {
  // Only tasks that have a date are relevant here
  const scheduled = tasks.filter(t => t.status !== "Done" && t.dueDate);

  if (scheduled.length === 0) {
    els.agenda.className = "calendar-agenda empty-state";
    els.agenda.textContent = "No scheduled tasks yet. Add due dates when capturing tasks.";
    if (els.exportAllBtn) els.exportAllBtn.disabled = true;
    if (els.exportSelectedBtn) els.exportSelectedBtn.disabled = true;
    return;
  }

  if (els.exportAllBtn) els.exportAllBtn.disabled = false;

  const grouped = { overdue: [], today: [], week: [], later: [] };
  scheduled.forEach(task => grouped[groupKeyFor(task)].push(task));

  els.agenda.className = "calendar-agenda";
  els.agenda.innerHTML = GROUPS
    .filter(g => grouped[g.key].length > 0)
    .map(g => `
      <section class="agenda-group">
        <h3 class="agenda-group-title">${escapeHtml(g.label)}</h3>
        <ul class="agenda-list">
          ${grouped[g.key].map(renderTaskRow).join("")}
        </ul>
      </section>
    `)
    .join("");

  // Wire up checkboxes to enable/disable "Export selected"
  els.agenda.querySelectorAll(".agenda-check").forEach(cb => {
    cb.addEventListener("change", updateSelectedExportBtn);
  });
}

function updateSelectedExportBtn() {
  if (!els.exportSelectedBtn) return;
  const anyChecked = els.agenda.querySelectorAll(".agenda-check:checked").length > 0;
  els.exportSelectedBtn.disabled = !anyChecked;
}

function handleAgendaClick(event) {
  const btn = event.target.closest("button[data-action='calendar-single']");
  if (!btn) return;
  const item = btn.closest("[data-task-id]");
  if (!item) return;
  const task = getTasks().find(t => t.id === item.dataset.taskId);
  if (task) downloadIcsFile(task);
}

export function initCalendarScreen() {
  els.agenda.addEventListener("click", handleAgendaClick);

  els.exportAllBtn?.addEventListener("click", () => {
    const tasks = getTasks().filter(t => t.status !== "Done" && t.dueDate);
    downloadAllIcsFile(tasks);
  });

  els.exportSelectedBtn?.addEventListener("click", () => {
    const checkedIds = new Set(
      [...els.agenda.querySelectorAll(".agenda-check:checked")].map(cb => cb.dataset.id)
    );
    const tasks = getTasks().filter(t => checkedIds.has(t.id));
    downloadAllIcsFile(tasks);
  });
}
