import { getUser, getProfile, getTasks, saveTasks } from "../storage.js";
import { sortByScore, daysUntil, escapeHtml } from "../taskUtils.js";
import { downloadIcsFile } from "../ics.js";

// ── DOM refs ──────────────────────────────────────────────────────────
const els = {
  greeting: document.getElementById("homeGreeting"),
  quickCapture: document.getElementById("homeQuickCapture"),
  createTaskBtn: document.getElementById("homeCreateTaskBtn"),
  addManualBtn: document.getElementById("homeAddManualBtn"),
  statToday: document.getElementById("statToday"),
  statOverdue: document.getElementById("statOverdue"),
  statUpcoming: document.getElementById("statUpcoming"),
  statDone: document.getElementById("statDone"),
  filterBar: document.getElementById("homeFilterBar"),
  filterLabel: document.getElementById("homeFilterLabel"),
  clearFilter: document.getElementById("homeClearFilter"),
  priorityList: document.getElementById("homePriorityList"),
  schedule: document.getElementById("homeSchedule")
};

let activeFilter = null;
let callbacks = {};

// ── Greeting ──────────────────────────────────────────────────────────

export function updateGreeting() {
  const user = getUser();
  const profile = getProfile();
  const displayName = profile?.displayName || user?.displayName || user?.identifier || "";

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" :
    hour < 17 ? "Good afternoon" :
    "Good evening";

  els.greeting.textContent = displayName
    ? `${greeting}, ${displayName}`
    : greeting;
}

// ── Stats row ─────────────────────────────────────────────────────────

function calcStats(tasks) {
  let today = 0, overdue = 0, upcoming = 0, done = 0;
  tasks.forEach(t => {
    if (t.status === "Done") { done++; return; }
    const d = daysUntil(t.dueDate);
    if (d < 0) overdue++;
    else if (d === 0) today++;
    else if (d <= 7) upcoming++;
  });
  return { today, overdue, upcoming, done };
}

function renderStats(tasks) {
  const s = calcStats(tasks);
  els.statToday.textContent = s.today;
  els.statOverdue.textContent = s.overdue;
  els.statUpcoming.textContent = s.upcoming;
  els.statDone.textContent = s.done;
}

function setFilter(filter) {
  activeFilter = filter;
  const labels = {
    today: "Due today",
    overdue: "Overdue",
    upcoming: "Upcoming (next 7 days)",
    done: "Completed"
  };

  document.querySelectorAll("[data-home-filter]").forEach(btn => {
    btn.classList.toggle("active-filter", btn.dataset.homeFilter === filter);
  });

  if (filter) {
    els.filterLabel.textContent = labels[filter];
    els.filterBar.classList.remove("hidden");
  } else {
    els.filterBar.classList.add("hidden");
  }
}

// ── Task list (priority section) ──────────────────────────────────────

function filterTasks(tasks) {
  if (!activeFilter) return tasks.filter(t => t.status !== "Done");
  if (activeFilter === "done") return tasks.filter(t => t.status === "Done");
  return tasks.filter(t => {
    if (t.status === "Done") return false;
    const d = daysUntil(t.dueDate);
    if (activeFilter === "overdue") return d < 0;
    if (activeFilter === "today") return d === 0;
    if (activeFilter === "upcoming") return d >= 0 && d <= 7;
    return true;
  });
}

function renderTaskCard(task, isTop) {
  const missing = Array.isArray(task.missingInfo) && task.missingInfo.length
    ? `<p><strong>Missing:</strong> ${escapeHtml(task.missingInfo.join(", "))}</p>`
    : "";

  const overdueClass = daysUntil(task.dueDate) < 0 && task.status !== "Done" ? "urgent" : "";
  const topClass = isTop ? "top-priority" : "";
  const doneClass = task.status === "Done" ? "is-done" : "";
  const topBadge = isTop
    ? `<span class="recommended-badge">★ Recommended next action</span>`
    : "";

  const action = task.suggestedAction
    ? `<p><strong>Next:</strong> ${escapeHtml(task.suggestedAction)}</p>`
    : "";

  return `
    <article class="task-card ${topClass} ${doneClass}" data-task-id="${escapeHtml(task.id)}">
      ${topBadge}
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
      ${action}
      <div class="task-actions">
        <button class="small-btn" type="button" data-action="toggle">${task.status === "Done" ? "Mark Open" : "Mark Done"}</button>
        <button class="small-btn" type="button" data-action="calendar">Add to Calendar</button>
        <button class="small-btn" type="button" data-action="edit">Edit</button>
        <button class="small-btn danger" type="button" data-action="delete">Delete</button>
      </div>
    </article>
  `;
}

function renderPriorityList(tasks) {
  const filtered = filterTasks(tasks);

  if (!filtered.length) {
    els.priorityList.className = "tasks-list empty-state";
    const msg = activeFilter
      ? `No ${activeFilter === "done" ? "completed" : activeFilter} tasks.`
      : "No tasks yet. Use Smart Capture above to create your first task.";
    els.priorityList.textContent = msg;
    return;
  }

  const sorted = sortByScore(filtered);
  els.priorityList.className = "tasks-list";
  els.priorityList.innerHTML = sorted
    .map((t, i) => renderTaskCard(t, i === 0 && !activeFilter))
    .join("");
}

// ── Schedule section ──────────────────────────────────────────────────

const SCHEDULE_GROUPS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "none", label: "No date" }
];

function scheduleGroupKey(task) {
  if (!task.dueDate) return "none";
  const d = daysUntil(task.dueDate);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "week";
  return "later";
}

function renderSchedule(tasks) {
  const open = tasks.filter(t => t.status !== "Done" && (t.dueDate || t.deadlineText));

  if (!open.length) {
    els.schedule.className = "calendar-agenda empty-state";
    els.schedule.textContent = "No scheduled tasks yet.";
    return;
  }

  const grouped = { overdue: [], today: [], week: [], later: [], none: [] };
  open.forEach(t => grouped[scheduleGroupKey(t)].push(t));

  els.schedule.className = "calendar-agenda";
  els.schedule.innerHTML = SCHEDULE_GROUPS
    .filter(g => grouped[g.key].length > 0)
    .map(g => `
      <section class="agenda-group">
        <h3 class="agenda-group-title">${escapeHtml(g.label)}</h3>
        <ul class="agenda-list">
          ${grouped[g.key].map(t => `
            <li class="agenda-item" data-task-id="${escapeHtml(t.id)}">
              <div>
                <p class="agenda-title">${escapeHtml(t.title)}</p>
                <p class="agenda-meta">
                  ${escapeHtml(t.dueDate || t.deadlineText || "No date")} ·
                  ${escapeHtml(t.owner || "Unassigned")} ·
                  ${escapeHtml(t.priority)}
                  ${t.durationMinutes ? ` · ${t.durationMinutes} min` : ""}
                </p>
              </div>
              <button class="small-btn" type="button" data-action="calendar">Add to Calendar</button>
            </li>
          `).join("")}
        </ul>
      </section>
    `)
    .join("");
}

// ── Public render ─────────────────────────────────────────────────────

export function renderHomeScreen(tasks) {
  renderStats(tasks);
  renderPriorityList(tasks);
  renderSchedule(tasks);
}

// ── Event handling ────────────────────────────────────────────────────

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

  if (action === "toggle") {
    task.status = task.status === "Done" ? "Open" : "Done";
    task.updatedAt = new Date().toISOString();
    saveTasks(tasks);
    if (callbacks.onTasksChanged) callbacks.onTasksChanged();
    return;
  }

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

// ── Init ──────────────────────────────────────────────────────────────

export function initHomeScreen(options = {}) {
  callbacks = options;

  // Quick capture
  els.createTaskBtn.addEventListener("click", () => {
    const text = els.quickCapture.value.trim();
    if (!text) {
      els.quickCapture.focus();
      return;
    }
    els.quickCapture.value = "";
    if (callbacks.onQuickCapture) callbacks.onQuickCapture(text);
  });

  els.addManualBtn.addEventListener("click", () => {
    if (callbacks.onManualCapture) callbacks.onManualCapture();
  });

  // Allow Enter in quick-capture textarea to trigger (Shift+Enter = newline)
  els.quickCapture.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      els.createTaskBtn.click();
    }
  });

  // Stat filter buttons
  document.querySelectorAll("[data-home-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const f = btn.dataset.homeFilter;
      if (activeFilter === f) {
        activeFilter = null;
        setFilter(null);
      } else {
        setFilter(f);
      }
      const tasks = getTasks();
      renderPriorityList(tasks);
    });
  });

  els.clearFilter.addEventListener("click", () => {
    activeFilter = null;
    setFilter(null);
    const tasks = getTasks();
    renderPriorityList(tasks);
  });

  // Task actions (priority list + schedule)
  els.priorityList.addEventListener("click", handleTaskListClick);
  els.schedule.addEventListener("click", handleTaskListClick);
}
