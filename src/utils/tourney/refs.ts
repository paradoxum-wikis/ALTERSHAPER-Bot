import { calculateAuraPercentage } from "../fighterGenerator.js";
import type { TourneyPlayer } from "./types.js";

function speedFromName(displayName: string): number {
  const percentage = calculateAuraPercentage(displayName);
  const auraMultiplier = Math.max(0, (percentage + 100) / 200);
  return Math.floor(10 + auraMultiplier * 10);
}

export function sortRefsForPick(refs: TourneyPlayer[]): TourneyPlayer[] {
  return [...refs].sort((a, b) => {
    const auraA = calculateAuraPercentage(a.displayName);
    const auraB = calculateAuraPercentage(b.displayName);
    if (auraB !== auraA) return auraB - auraA;

    const spdA = speedFromName(a.displayName);
    const spdB = speedFromName(b.displayName);
    if (spdB !== spdA) return spdB - spdA;
    return a.userId.localeCompare(b.userId);
  });
}
