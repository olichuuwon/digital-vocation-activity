// Singapore time helpers (§3.6, §11.2). Singapore is UTC+8 all year (no DST since 1982),
// so plain arithmetic is exact and doesn't depend on the device's time zone or ICU data.
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Parses a Postgres/PostgREST timestamp (e.g. `2026-10-07T12:34:56.123456+00:00`). */
export function parseTimestamp(iso: string): number {
  // Some engines reject more than 3 fractional digits (Postgres sends 6) or a bare `+08`.
  const norm = iso
    .trim()
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/(T[\d:.]+[+-]\d{2})$/, '$1:00');
  const ms = Date.parse(norm);
  return Number.isFinite(ms) ? ms : NaN;
}

/** Clock time a run finished, `HH:MM` in SGT. `--:--` if the input can't be read. */
export function formatSgtTime(iso: string): string {
  const ms = parseTimestamp(iso);
  if (Number.isNaN(ms)) return '--:--';
  const d = new Date(ms + SGT_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** The SGT calendar date (`YYYY-MM-DD`) for an instant; matches the server's board_date. */
export function sgtDate(at: Date | number = Date.now()): string {
  const d = new Date((typeof at === 'number' ? at : at.getTime()) + SGT_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-07` → `7 Oct 2026` (used on the all-time board, where rows span days). */
export function formatBoardDate(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}
