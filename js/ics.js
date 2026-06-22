function formatIcsDateTime(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function sanitizeFileName(value) {
  return String(value || "task")
    .replace(/[<>:"/\\|?*]/g, "")
    .slice(0, 50);
}

export function downloadIcsFile(task) {
  const date = task.dueDate || new Date().toISOString().slice(0, 10);
  const start = `${date.replaceAll("-", "")}T090000`;
  const end = `${date.replaceAll("-", "")}T100000`;
  const uid = `${task.id}@taskwise-ai`;

  const descriptionParts = [
    task.notes || "",
    task.suggestedAction ? `Next action: ${task.suggestedAction}` : "",
    task.missingInfo && task.missingInfo.length ? `Missing info: ${task.missingInfo.join(", ")}` : "",
    task.originalText ? `Original text: ${task.originalText}` : ""
  ].filter(Boolean);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TaskWise AI//MVP//EN",
    "BEGIN:VEVENT",
    `UID:${escapeIcs(uid)}`,
    `DTSTAMP:${formatIcsDateTime(new Date())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcs(task.title)}`,
    `DESCRIPTION:${escapeIcs(descriptionParts.join("\\n"))}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${sanitizeFileName(task.title || "task")}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
