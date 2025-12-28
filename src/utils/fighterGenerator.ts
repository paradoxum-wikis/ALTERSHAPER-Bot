import { User } from "discord.js";

export interface Fighter {
  user: User;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  critChance: number;
  abilities: string[];
}

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const nameToLevel: { [key: string]: number } = {
  toru: 0,
  toru1: 1,
  toru2: 2,
  toru3: 3,
  toru4: 4,
  toru5: 5,
  toru6: 6,
  toru7: 7,
  toru8: 8,
  toru9: 9,
  toru10: 10,
  toru11: 11,
};

export function calculateAuraPercentage(displayName: string): number {
  if (displayName in nameToLevel) {
    const level = nameToLevel[displayName];
    return level === 0 ? -100 : level === 11 ? 100 : (level - 1) * 10 + 9;
  } else {
    const hash = hashString(displayName);
    return hash % 101;
  }
}

export function calculateAuraLevel(percentage: number): number {
  if (percentage <= 3) {
    return 0;
  } else if (percentage <= 9) {
    return 1;
  } else if (percentage === 100) {
    return 11;
  } else {
    const level = Math.ceil((percentage - 9) / 10) + 1;
    return level > 10 ? 10 : level;
  }
}

export function generateFighter(
  user: User,
  displayName: string,
  forceAuraPercentage?: number,
): Fighter {
  const percentage =
    forceAuraPercentage !== undefined
      ? forceAuraPercentage
      : calculateAuraPercentage(displayName);

  // Convert percentage to stats (higher aura = better stats)
  // Scale percentage from -100 to 100 range to 0-1 multiplier
  const auraMultiplier = Math.max(0, (percentage + 100) / 200);

  // Base stats + aura bonus
  const baseHp = Math.floor(80 + auraMultiplier * 40); // 80-120 HP
  const baseAttack = Math.floor(15 + auraMultiplier * 10); // 15-25 ATK
  const baseDefense = Math.floor(5 + auraMultiplier * 10); // 5-15 DEF
  const baseSpeed = Math.floor(10 + auraMultiplier * 10); // 10-20 SPD
  const critChance = 0.1 + auraMultiplier * 0.2; // 0.1-0.3 crit chance

  const abilities = [
    "Alter Ego Burst",
    "Ego Shield",
    "Shadow Clone",
    "Healing Light",
    "Berserker Rage",
    "Time Slow",
    "Soul Strike",
    "Phoenix Rising",
    "Relic of Exo",
    "Ego's Blessing",
    "Cleansing",
    "Raise the Dead",
    "Warrior's Call",
    "Drop the Beat",
    "Call to Arms",
    "Airstrike",
    "Divine Intervention",
    "Great Will",
    "Toxic Fumes",
    "Freikugel",
    "Bloodlust",
    "Blade of the Old World",
    "Spectral Exonorator",
    "Axis Cleave",
    "Kim Ji Hoon Combo",
  ];

  let seed = hashString(displayName) + 1000;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const selectedAbilities = [];
  const abilityPool = [...abilities];
  for (let i = 0; i < 2; i++) {
    const index = Math.floor(random() * abilityPool.length);
    selectedAbilities.push(abilityPool.splice(index, 1)[0]);
  }

  return {
    user,
    name: displayName,
    hp: baseHp,
    maxHp: baseHp,
    attack: baseAttack,
    defense: baseDefense,
    speed: baseSpeed,
    critChance,
    abilities: selectedAbilities,
  };
}
