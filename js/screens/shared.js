import { getTasks, saveTasks } from "../storage.js";
import { sortByScore, daysUntil, escapeHtml } from "../taskUtils.js";
import { downloadIcsFile } from "../ics.js";

const els = {
  tabBtns: document.querySelectorAll("[data-shared-tab]"),
  tasksTab: document.getElementById("sharedTasksTab"),
  ownersTab: document.getElementById("sharedOwnersTab"),
  tasksList: document.getElementById("sharedTasksList"),
  ownerBoard: document.getElementById("sharedOwnerBoard")
};

const STATUSES = ["Open", "In Progress", "Accepted", "Pending", "Completed", "Done", "Overdue", "Unassigned"];

let callbacks = {};
let activeTab = "tasks";

// ── Tab switching ─────────────────────────────────────────────────────

function setTab(tab) {
  activeTab = tab;
  els.tabBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.sharedTab === tab));
  els.tasksTab.classList.toggle("is-active", tab === "tasks");
  els.ownersTab.classList.toggle("is-active", tab === "owners");
}

// ── Tasks tab ─────────────────────────────────────────────────────────

function renderSharedTasks(tasks) {
  if (!tasks.length) {
    els.tasksList.className = "tasks-list empty-state";
    els.tasksList.textContent = "No tasks yet. Create tasks using Smart Capture.";
    return;
  }

  const sorted = sortByScore(tasks);

  els.tasksList.className = "tasks-list";
  els.tasksList.innerHTML = sorted.map(task => {
    const overdueClass = daysUntil(task.dueDate) < 0 && task.status !== "Done" ? "urgent" : "";
    const missing = Array.isArray(task.missingInfo) && task.missingInfo.length
      ? `<p><strong>Missing:</strong> ${escapeHtml(task.missingInfo.join(", "))}</p>`
      : "";

    const ownerOptions = ["Me", "Unassigned", task.owner]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .concat(["Other"])
      .map(v => `<option value="${escapeHtml(v)}" ${v === task.owner ? "selected" : ""}>${escapeHtml(v)}</option>`)
      .join("");

    const statusOptions = STATUSES
      .map(s => `<option value="${escapeHtml(s)}" ${s === task.status ? "selected" : ""}>${escapeHtml(s)}</option>`)
      .join("");

    return `
      <article class="task-card" data-task-id="${escapeHtml(task.id)}">
        <div class="task-card-header">
          <div>
            <h3>${escapeHtml(task.title)}</h3>
            <div class="task-meta">
              <span class="meta-chip">${escapeHtml(task.category)}</span>
              <span class="meta-chip ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span>
              <span class="meta-chip ${overdueClass}">${escapeHtml(task.deadlineText || task.dueDate || "No deadline")}</span>
            </div>
          </div>
        </div>
        ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ""}
        ${missing}
        <div class="task-actions" style="align-items:center">
          <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;font-weight:800;color:var(--muted)">
            Owner:
            <select class="inline-select" data-field="owner">
              ${ownerOptions}
            </select>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:0.78rem;font-weight:800;color:var(--muted)">
            Status:
            <select class="inline-select" data-field="status">
              ${statusOptions}
            </select>
          </label>
        </div>
        <div class="task-actions">
          <button class="small-btn" type="button" data-action="calendar">Add to Calendar</button>
          <button class="small-btn" type="button" data-action="edit">Edit</button>
          <button class="small-btn danger" type="button" data-action="delete">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

// ── Owners tab ────────────────────────────────────────────────────────

function renderOwnerBoard(tasks) {
  if (!tasks.length) {
    els.ownerBoard.className = "ownership-board empty-state";
    els.ownerBoard.textContent = "No ownership data yet.";
    return;
  }

  const owners = {};
  tasks.forEach(task => {
    const owner = task.owner || "Unassigned";
    if (!owners[owner]) {
      owners[owner] = { total: 0, open: 0, done: 0, overdue: 0, stuck: 0 };
    }
    owners[owner].total++;
    if (task.status === "Done" || task.status === "Completed") {
      owners[owner].done++;
    } else {
      owners[owner].open++;
      if (daysUntil(task.dueDate) < 0) owners[owner].overdue++;
      if (Array.isArray(task.missingInfo) && task.missingInfo.length) owners[owner].stuck++;
    }
  });

  els.ownerBoard.className = "ownership-board";
  els.ownerBoard.innerHTML = Object.entries(owners)
    .sort(([a], [b]) => a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b))
    .map(([owner, s]) => `
      <article class="owner-card">
        <h3>${escapeHtml(owner)}</h3>
        <div class="owner-stats">
          <div class="owner-stat"><strong>${s.open}</strong><span>Open</span></div>
          <div class="owner-stat"><strong>${s.done}</strong><span>Done</span></div>
          <div class="owner-stat"><strong>${s.overdue}</strong><span>Overdue</span></div>
          <div class="owner-stat"><strong>${s.stuck}</strong><span>Needs info</span></div>
        </div>
      </article>
    `).join("");
}

// ── Public render ─────────────────────────────────────────────────────

export function renderSharedScreen(tasks) {
  renderSharedTasks(tasks);
  renderOwnerBoard(tasks);
}

// ── Event handlers ────────────────────────────────────────────────────

function handleTaskListClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const card = btn.closest("[data-task-id]");
  if (!card) return;

  const taskId = card.dataset.taskId;
  const action = btn.dataset.action;
  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  if (action === "delete") {
    saveTasks(tasks.filter(t => t.id !== taskId));
    if (callbacks.onTasksChanged) callbacks.onTasksChanged();
    return;
  }

  if (action === "edit") {
    if (callbacks.onEditTask) callbacks.onEditTask(task);
    return;
  }

  if (action === "calendar") {
    downloadIcsFile(task);
  }
}

function handleSelectChange(event) {
  const select = event.target.closest("select[data-field]");
  if (!select) return;

  const card = select.closest("[data-task-id]");
  if (!card) return;

  const taskId = card.dataset.taskId;
  const field = select.dataset.field;
  const value = select.value;

  const tasks = getTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  task[field] = value;
  task.updatedAt = new Date().toISOString();
  saveTasks(tasks);

  if (callbacks.onTasksChanged) callbacks.onTasksChanged();
}

// ── Init ──────────────────────────────────────────────────────────────

export function initSharedScreen(options = {}) {
  callbacks = options;

  els.tabBtns.forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.sharedTab));
  });

  els.tasksList.addEventListener("click", handleTaskListClick);
  els.tasksList.addEventListener("change", handleSelectChange);

  setTab("tasks");
}
