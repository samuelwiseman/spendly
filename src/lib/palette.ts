/** Categorical (qualitative) palette for user categories on the dark surface.
 *  Order is assignment order; colours are stored per category so they are stable. */
export const PALETTE = [
  "#e8a093", // coral
  "#7fb3d5", // blue
  "#a3d9a5", // green
  "#e8c468", // amber
  "#c9a0dc", // violet
  "#f0a6ca", // pink
  "#7fd1c4", // teal
  "#d4956a", // ochre
] as const;

export function nextColor(usedCount: number): string {
  return PALETTE[usedCount % PALETTE.length];
}
