/**
 * SM-2 spaced-repetition algorithm.
 *
 * Reference: https://en.wikipedia.org/wiki/SuperMemo#Description_of_SM-2_algorithm
 *
 * Inputs:
 *   quality     0-5, the user's self-rated recall quality
 *   repetitions number of consecutive successful reviews
 *   easeFactor  difficulty multiplier (>= 1.3)
 *   interval    days until next review
 *
 * On a "fail" (quality < 3) we reset the streak and re-show the card tomorrow.
 * On a "pass" (quality >= 3) we grow the interval geometrically by the ease factor.
 */

export interface SM2State {
  repetitions: number;
  easeFactor: number;
  interval: number;
}

export interface SM2Result extends SM2State {
  /** Days from "now" until the card should next be shown. */
  intervalDays: number;
  /** Concrete due date computed from `now + intervalDays`. */
  nextReview: Date;
}

const MIN_EASE = 1.3;

export function reviewCard(prev: SM2State, quality: number, now: Date = new Date()): SM2Result {
  const q = clampQuality(quality);

  let { repetitions, easeFactor, interval } = prev;

  if (q < 3) {
    // Failed recall — restart the schedule but keep ease factor pressure.
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
  }

  // Standard SM-2 ease-factor update.
  easeFactor = Math.max(MIN_EASE, easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

  return {
    repetitions,
    easeFactor,
    interval,
    intervalDays: interval,
    nextReview,
  };
}

function clampQuality(q: number): number {
  if (Number.isNaN(q)) return 0;
  if (q < 0) return 0;
  if (q > 5) return 5;
  return Math.round(q);
}
