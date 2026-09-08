/** Crown 0-III difficulty — Dead Cells-style unlocks. */
const KEY = "cinder-crown-max";
export const MAX_CROWN = 3;
export function getMaxUnlockedCrown(): number {
  try { const v = parseInt(localStorage.getItem(KEY) || "0", 10); return Number.isFinite(v) ? Math.max(0, Math.min(MAX_CROWN, v)) : 0; } catch { return 0; }
}
export function unlockNextCrown(clearedCrown: number): number {
  const cur = getMaxUnlockedCrown();
  const next = Math.min(MAX_CROWN, Math.max(cur, clearedCrown + 1));
  try { localStorage.setItem(KEY, String(next)); } catch {}
  return next;
}
export interface CrownScaling {
  hpMult: number; dmgMult: number; goldMult: number; rewardBonus: number; intentBoost: number;
}
export function crownScaling(crown: number): CrownScaling {
  const c = Math.max(0, Math.min(MAX_CROWN, crown));
  return { hpMult: 1 + c * 0.22, dmgMult: 1 + c * 0.16, goldMult: 1 + c * 0.12, rewardBonus: c, intentBoost: c >= 2 ? 1 : 0 };
}
export function crownLabel(n: number): string { return ["Crown 0","Crown I","Crown II","Crown III"][n] || ("Crown "+n); }
