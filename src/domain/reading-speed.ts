/**
 * Reading speed for "time left" (docs/customization.md, 3.3), from this
 * session's page turns. Milestone 7 keeps speed across sessions; until then a
 * fresh session shows no estimate until the reader has turned a few pages.
 *
 * A sample is one forward turn by one page in Pages mode. Turns faster than a
 * skim or slower than a break are left out, and the median of the recent ones
 * is the speed, so one long pause doesn't swing it.
 */
export type Turn = { at: number; section: number | null; page: number | null; fraction: number | null };

export type Speed = { secondsPerPage: number | null; secondsPerBook: number | null };

const MIN_MS = 4_000;
const MAX_MS = 10 * 60_000;
const KEEP = 25;
export const MIN_SAMPLES = 3;

export type SpeedState = { last: Turn | null; perPage: number[]; perBook: number[] };

export const EMPTY_SPEED: SpeedState = { last: null, perPage: [], perBook: [] };

/** Take one relocate into the samples. Anything that isn't a one-page step forward only moves the mark. */
export function recordTurn(state: SpeedState, turn: Turn): SpeedState {
  const last = state.last;
  if (!last) return { ...state, last: turn };
  const ms = turn.at - last.at;
  const onePage = turn.page !== null && last.page !== null && turn.section === last.section && turn.page === last.page + 1;
  if (!onePage || ms < MIN_MS || ms > MAX_MS) return { ...state, last: turn };
  const seconds = ms / 1000;
  const perPage = [...state.perPage, seconds].slice(-KEEP);
  const step = turn.fraction !== null && last.fraction !== null ? turn.fraction - last.fraction : 0;
  const perBook = step > 0 && step < 0.05 ? [...state.perBook, seconds / step].slice(-KEEP) : state.perBook;
  return { last: turn, perPage, perBook };
}

function median(values: number[]): number | null {
  if (values.length < MIN_SAMPLES) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function speedOf(state: SpeedState): Speed {
  return { secondsPerPage: median(state.perPage), secondsPerBook: median(state.perBook) };
}

/** Seconds left in the chapter and the book, or null while there are too few samples or no page count. */
export function timeLeft(
  speed: Speed,
  at: { page: number | null; pages: number | null; fraction: number | null },
): { chapter: number | null; book: number | null } {
  const chapter =
    speed.secondsPerPage !== null && at.page !== null && at.pages !== null && at.pages > 0
      ? Math.max(0, at.pages - at.page) * speed.secondsPerPage
      : null;
  const book = speed.secondsPerBook !== null && at.fraction !== null ? Math.max(0, 1 - at.fraction) * speed.secondsPerBook : null;
  return { chapter, book };
}

/** "45 s" is never shown: under a minute reads as "<1 min"; an hour or more as "2 h 5 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
