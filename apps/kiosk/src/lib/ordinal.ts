// "1st", "2nd", "3rd", "4th"... — customers never see the word "Round"
// (2026-09-28 UX audit). Ordinal suffix, English-only for now.
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
