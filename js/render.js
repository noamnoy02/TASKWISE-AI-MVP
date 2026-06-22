import { getTasks } from "./storage.js";
import { renderHomeScreen } from "./screens/home.js";
import { renderSharedScreen } from "./screens/shared.js";
import { renderProfileScreen } from "./screens/profile.js";
import { updateContextStatus } from "./screens/capture.js";

export function renderAll() {
  const tasks = getTasks();
  renderHomeScreen(tasks);
  renderSharedScreen(tasks);
  // Refresh profile if it's visible; update context pill in capture
  renderProfileScreen();
  updateContextStatus();
}
