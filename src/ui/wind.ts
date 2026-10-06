/** Wind strength with its direction for the HUD gauge: "←7", "3→", or "0" when calm. */
export function windText(wind: number): string {
  const n = Math.abs(Math.trunc(wind));
  if (n === 0) return '0';
  return wind < 0 ? `←${n}` : `${n}→`;
}
