// Central render pass: reads tasks from storage exactly once and hands the
// same array to every screen that displays task data, instead of each
// screen re-reading localStorage independently on every change.
import { getTasks } from "./storage.js";
import { renderNextAction } from "./screens/overview.js";
import { renderTasksScreen } from "./screens/tasks.js";
import { renderCalendarScreen } from "./screens/calendar.js";

export function renderAll() {
  const tasks = getTasks();
  renderNextAction(tasks);
  renderTasksScreen(tasks);
  renderCalendarScreen(tasks);
}
