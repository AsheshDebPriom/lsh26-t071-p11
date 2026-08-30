/**
 * The only place minutes-from-midnight become text. Nothing else in this
 * codebase formats a time, and nothing else parses one.
 */

/** 540 -> "09:00". Times are 24-hour so columns stay the same width. */
export function formatTime(min: number): string {
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/** 95 -> "1h 35m", 45 -> "45m", 0 -> "0m". */
export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

/** Readable clock span: "09:00–11:00". */
export function formatSpan(from: number, to: number): string {
  return `${formatTime(from)}–${formatTime(to)}`;
}

/** "09:30" -> 570. The only parser; case files arrive as HH:MM strings. */
export function parseHM(text: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) throw new Error(`Not a HH:MM time: ${text}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Seed-data helper so shift and window literals stay legible: hm(9, 30) === 570. */
export function hm(hours: number, minutes = 0): number {
  return hours * 60 + minutes;
}
