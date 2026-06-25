import { getTasks } from "./storage.js";
import { renderHomeScreen } from "./screens/home.js";
import { renderTasksScreen } from "./screens/tasks.js";
import { renderCalendarScreen } from "./screens/calendar.js";
import { renderProfileScreen } from "./screens/profile.js";
import { updateContextStatus } from "./screens/capture.js";

export function renderAll() {
  const tasks = getTasks();
  renderHomeScreen(tasks);
  renderTasksScreen(tasks);
  renderCalendarScreen(tasks);
  renderProfileScreen();
  updateContextStatus();
}
