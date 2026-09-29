/** Next/previous question index, wrapping at both ends. */
export function stepIndex(index: number, length: number, dir: 1 | -1): number {
  return (index + dir + length) % length;
}

/** Swipe left (negative dx) → next, right → previous; short drags are taps. */
export function swipeDir(dx: number, threshold = 42): 1 | -1 | 0 {
  if (Math.abs(dx) < threshold) return 0;
  return dx < 0 ? 1 : -1;
}
