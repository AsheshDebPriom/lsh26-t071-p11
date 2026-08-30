/**
 * The only place minutes-from-midnight become text. Nothing else in this
 * codebase formats a time, and nothing else parses one.
 */

/**
 * A digit-width space. Single-digit hours are padded with one so that 9:00 AM
 * still lines up under 12:00 PM down a dense column — the board is read by
 * scanning a column of times, and twelve-hour clocks lose that alignment
 * unless you put it back.
 */
const FIGURE_SPACE = ' ';

/**
 * 540 -> "9:00 AM". The clock people actually read, used everywhere on screen.
 *
 * Minutes past midnight, so a job finishing after midnight is marked rather
 * than silently wrapping to the small hours of a day that is not this one.
 *
 * NOT for machine formats. Case files and <input type="time"> both need
 * twenty-four hour HH:MM — use formatHM for those.
 */
export function formatTime(min: number): string {
  const total = Math.round(min);
  const dayOffset = Math.floor(total / 1440);
  const m = total - dayOffset * 1440;
  const h24 = Math.floor(m / 60);
  const mins = m % 60;

  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const pad = h12 < 10 ? FIGURE_SPACE : '';

  return (
    `${pad}${h12}:${String(mins).padStart(2, '0')} ${suffix}` +
    (dayOffset > 0 ? ` +${dayOffset}d` : '')
  );
}

/**
 * 540 -> "09:00". The twenty-four hour form the machines need.
 *
 * This is what goes into an exported case file and into the value of an
 * <input type="time">; both reject anything else. Keeping it separate from
 * formatTime is the whole reason the display can be twelve-hour at all.
 */
export function formatHM(min: number): string {
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
