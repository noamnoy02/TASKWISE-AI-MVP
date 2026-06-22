import { getTasks, saveTasks } from "../storage.js";
import { sortByScore, daysUntil, escapeHtml } from "../taskUtils.js";
import { downloadIcsFile } from "../ics.js";

const els = {
  tasksList: document.getElementById("tasksList"),
  clearTasksBtn: document.getElementById("clearTasksBtn"),
  ownershipBoard: document.getElementById("ownershipBoard"),
  tabButtons: document.querySelectorAll("#tasksScreen [data-tab]"),
  tabPanels: {
    board: document.getElementById("tasksBoardTab"),
    ownership: document.getElementById("ownershipTab")
  }
};

let onEditTask = null;
let onTasksChanged = null;

function setActiveTab(tab) {
  els.tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  els.tabPanels.board.classList.toggle("is-active", tab === "board");
  els.tabPanels.ownership.classList.toggle("is-active", tab === "ownership");
}

function renderTaskBoard(tasks) {
  if (tasks.length === 0) {
    els.tasksList.className = "tasks-list empty-state";
    els.tasksList.textContent = "No tasks saved yet.";
    return;
  }

  els.tasksList.className = "tasks-list";
  const sortedTasks = sortByScore(tasks);

  els.tasksList.innerHTML = sortedTasks.map(task => {
    const missing = Array.isArray(task.missingInfo) && task.missingInfo.length
      ? `<p><strong>Missing:</strong> ${escapeHtml(task.missingInfo.join(", "))}</p>`
      : "";

    const overdueClass = daysUntil(task.dueDate) < 0 && task.status !== "Done" ? "urgent" : "";

    return `
      <article class="task-card" data-task-id="${escapeHtml(task.id)}">
        <div class="task-card-header">
          <div>
            <h3>${escapeHtml(task.title)}</h3>
            <div class="task-meta">
              <span class="meta-chip">${escapeHtml(task.category)}</span>
              <span class="meta-chip ${task.priority.toLowerCase()}">${escapeHtml(task.priority)}</span>
              <span class="meta-chip ${overdueClass}">${escapeHtml(task.deadlineText || task.dueDate || "No deadline")}</span>
              <span class="meta-chip">${escapeHtml(task.owner || "Unassigned")}</span>
              <span class="meta-chip">${escapeHtml(task.status || "Open")}</span>
            </div>
          </div>
        </div>

        ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ""}
        ${missing}
        ${task.suggestedAction ? `<p><strong>Next:</strong> ${escapeHtml(task.suggestedAction)}</p>` : ""}

        <details>
          <summary>Source text</summary>
          <div class="source-preview">${escapeHtml(task.originalText || "")}</div>
        </details>

        <div class="task-actions">
          <button class="small-btn" type="button" data-action="toggle">${task.status === "Done" ? "Mark Open" : "Mark Done"}</button>
          <button class="small-btn" type="button" data-action="calendar">Add to Calendar</button>
          <button class="small-btn" type="button" data-action="edit">Edit</button>
          <button class="small-btn danger" type="button" data-action="delete">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderOwnershipBoard(tasks) {
  if (tasks.length === 0) {
    els.ownershipBoard.className = "ownership-board empty-state";
    els.ownershipBoard.textContent = "No ownership data yet.";
    return;
  }

  const owners = {};

  tasks.forEach(task => {
    const owner = task.owner || "Unassigned";

    if (!owners[owner]) {
      owners[owner] = { total: 0, open: 0, done: 0, overdue: 0, stuck: 0 };
    }

    owners[owner].total += 1;

    if (task.status === "Done") {
      owners[owner].done += 1;
    } else {
      owners[owner].open += 1;
    }

    if (task.status !== "Done" && daysUntil(task.dueDate) < 0) {
      owners[owner].overdue += 1;
    }

    if (Array.isArray(task.missingInfo) && task.missingInfo.length > 0 && task.status !== "Done") {
      owners[owner].stuck += 1;
    }
  });

  els.ownershipBoard.className = "ownership-board";
  els.ownershipBoard.innerHTML = Object.entries(owners).map(([owner, stats]) => `
    <article class="owner-card">
      <h3>${escapeHtml(owner)}</h3>
      <div class="owner-stats">
        <div class="owner-stat"><strong>${stats.open}</strong><span>Open</span></div>
        <div class="owner-stat"><strong>${stats.done}</strong><span>Done</span></div>
        <div class="owner-stat"><strong>${stats.overdue}</strong><span>Overdue</span></div>
        <div class="owner-stat"><strong>${stats.stuck}</strong><span>Stuck / missing info</span></div>
      </div>
    </article>
  `).join("");
}

export function renderTasksScreen(tasks) {
  renderTaskBoard(tasks);
  renderOwnershipBoard(tasks);
}

function handleTaskListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const card = event.target.closest("[data-task-id]");
  if (!card) return;

  const taskId = card.dataset.taskId;
  const action = button.dataset.action;
  const tasks = getTasks();
  const task = tasks.find(item => item.id === taskId);

  if (!task) return;

  if (action === "toggle") {
    task.status = task.status === "Done" ? "Open" : "Done";
    task.updatedAt = new Date().toISOString();
    saveTasks(tasks);
    if (onTasksChanged) onTasksChanged();
    return;
  }

  if (action === "delete") {
    saveTasks(tasks.filter(item => item.id !== taskId));
    if (onTasksChanged) onTasksChanged();
    return;
  }

  if (action === "edit") {
    if (onEditTask) onEditTask(task);
    return;
  }

  if (action === "calendar") {
    downloadIcsFile(task);
  }
}

export function initTasksScreen(options = {}) {
  onEditTask = options.onEditTask || null;
  onTasksChanged = options.onTasksChanged || null;

  els.tabButtons.forEach(btn => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
  });

  els.clearTasksBtn.addEventListener("click", () => {
    saveTasks([]);
    if (onTasksChanged) onTasksChanged();
  });

  els.tasksList.addEventListener("click", handleTaskListClick);

  setActiveTab("board");
}
