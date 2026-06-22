import { daysUntil, escapeHtml } from "../taskUtils.js";
import { downloadIcsFile } from "../ics.js";
import { getTasks } from "../storage.js";

const els = {
  agenda: document.getElementById("calendarAgenda")
};

const GROUPS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" }
];

function groupKeyFor(task) {
  if (!task.dueDate) return "none";

  const days = daysUntil(task.dueDate);

  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

function renderTaskRow(task) {
  return `
    <li class="agenda-item" data-task-id="${escapeHtml(task.id)}">
      <div>
        <p class="agenda-title">${escapeHtml(task.title)}</p>
        <p class="agenda-meta">
          ${escapeHtml(task.dueDate || task.deadlineText || "No date set")} ·
          Owner: ${escapeHtml(task.owner || "Unassigned")} ·
          ${escapeHtml(task.priority)}
        </p>
      </div>
      <button class="small-btn" type="button" data-action="calendar">Add to Calendar</button>
    </li>
  `;
}

export function renderCalendarScreen(tasks) {
  const openTasks = tasks.filter(task => task.status !== "Done");

  if (openTasks.length === 0) {
    els.agenda.className = "calendar-agenda empty-state";
    els.agenda.textContent = "No open tasks to schedule yet.";
    return;
  }

  const grouped = { overdue: [], today: [], week: [], later: [], none: [] };
  openTasks.forEach(task => grouped[groupKeyFor(task)].push(task));

  els.agenda.className = "calendar-agenda";
  els.agenda.innerHTML = GROUPS
    .filter(group => grouped[group.key].length > 0)
    .map(group => `
      <section class="agenda-group">
        <h3 class="agenda-group-title">${escapeHtml(group.label)}</h3>
        <ul class="agenda-list">
          ${grouped[group.key].map(renderTaskRow).join("")}
        </ul>
      </section>
    `)
    .join("");
}

function handleAgendaClick(event) {
  const button = event.target.closest("button[data-action='calendar']");
  if (!button) return;

  const item = event.target.closest("[data-task-id]");
  if (!item) return;

  const taskId = item.dataset.taskId;
  const task = getTasks().find(t => t.id === taskId);
  if (task) downloadIcsFile(task);
}

export function initCalendarScreen() {
  els.agenda.addEventListener("click", handleAgendaClick);
}
