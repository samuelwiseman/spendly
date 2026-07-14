export const ENTRY_CAP = 5000;

export function exceedsCap(count: number): boolean {
  return count >= ENTRY_CAP;
}
