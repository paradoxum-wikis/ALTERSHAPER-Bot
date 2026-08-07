import type { BattleHooks, BattleStepContext } from "../battleEngine.js";
import { ABILITY_POOL, type Fighter } from "../fighterGenerator.js";
import { arcanaFullName } from "./arcanaAssets.js";
import type { RefereeArcanaId } from "./types.js";

export type ActiveReferee = {
  arcana: RefereeArcanaId;
  level: 0 | 1 | 2 | 3;
};

const FOOL_PCT: Record<0 | 1 | 2 | 3, number> = {
  0: 0.25,
  1: 0.5,
  2: 0.75,
  3: 1,
};

const EMPEROR_INTERVAL: Record<0 | 1 | 2 | 3, number> = {
  0: 8,
  1: 6,
  2: 4,
  3: 2,
};

const DEATH_SPD: Record<0 | 1 | 2 | 3, number> = {
  0: 15,
  1: 20,
  2: 25,
  3: 35,
};

const TOWER_DMG: Record<0 | 1 | 2 | 3, number> = {
  0: 5,
  1: 10,
  2: 15,
  3: 30,
};

const TOWER_SILENCE: Record<0 | 1 | 2 | 3, number> = {
  0: 0,
  1: 0,
  2: 2,
  3: 4,
};

// wheel L3: normal mins, max x2 (not HP)
const STAT_ROLL = {
  attack: { min: 15, max: 50 },
  defense: { min: 5, max: 30 },
  speed: { min: 10, max: 40 },
} as const;

function empressInterval(level: 0 | 1 | 2 | 3): number {
  return level === 3 ? 2 : 4;
}

function wheelInterval(level: 0 | 1 | 2 | 3): number {
  return level >= 2 ? 1 : 2;
}

function applyEmpressBuff(f: Fighter, level: 0 | 1 | 2 | 3): string {
  switch (level) {
    case 0:
      f.attack += 2;
      return `+2 ATK`;
    case 1:
      f.attack += 2;
      f.speed += 2;
      return `+2 ATK +2 SPD`;
    case 2:
      f.attack += 4;
      f.speed += 2;
      return `+4 ATK +2 SPD`;
    case 3:
      f.attack += 6;
      f.defense += 4;
      f.speed += 2;
      return `+6 ATK +4 DEF +2 SPD`;
  }
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickTwoAbilities(): string[] {
  const pool = [...ABILITY_POOL];
  const out: string[] = [];
  for (let i = 0; i < 2; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function swapOneAbility(a: Fighter, b: Fighter): string {
  if (a.abilities.length === 0 && b.abilities.length === 0) {
    return "no abilities to swap";
  }
  const ai =
    a.abilities.length > 0
      ? Math.floor(Math.random() * a.abilities.length)
      : -1;
  const bi =
    b.abilities.length > 0
      ? Math.floor(Math.random() * b.abilities.length)
      : -1;
  if (ai < 0) {
    const ab = b.abilities.splice(bi, 1)[0];
    a.abilities.push(ab);
    return `${b.name} → ${a.name}: ${ab}`;
  }
  if (bi < 0) {
    const ab = a.abilities.splice(ai, 1)[0];
    b.abilities.push(ab);
    return `${a.name} → ${b.name}: ${ab}`;
  }
  const tmp = a.abilities[ai];
  a.abilities[ai] = b.abilities[bi];
  b.abilities[bi] = tmp;
  return `swapped ${tmp} ↔ ${a.abilities[ai]}`;
}

function swapAllAbilities(a: Fighter, b: Fighter): void {
  const t = a.abilities;
  a.abilities = b.abilities;
  b.abilities = t;
}

function swapOneStat(a: Fighter, b: Fighter): string {
  const keys = ["attack", "defense", "speed"] as const;
  const key = keys[Math.floor(Math.random() * keys.length)];
  const tmp = a[key];
  a[key] = b[key];
  b[key] = tmp;
  const label = key === "attack" ? "ATK" : key === "defense" ? "DEF" : "SPD";
  return `swapped ${label}`;
}

function randomizeFighterStatsAndAbilities(f: Fighter): void {
  if (!f.abilitiesDisabled) {
    f.abilities = pickTwoAbilities();
  }
  f.attack = randInt(STAT_ROLL.attack.min, STAT_ROLL.attack.max);
  f.defense = randInt(STAT_ROLL.defense.min, STAT_ROLL.defense.max);
  f.speed = randInt(STAT_ROLL.speed.min, STAT_ROLL.speed.max);
}

export function refereeArcanaLabels(active: ActiveReferee[]): string {
  if (!active.length) return "";
  return active.map((a) => arcanaFullName(a.arcana)).join(", ");
}

export function createRefereeArcanaHooks(
  active: ActiveReferee[],
): BattleHooks {
  const fool = active.find((a) => a.arcana === "fool");
  const empress = active.find((a) => a.arcana === "empress");
  const emperor = active.find((a) => a.arcana === "emperor");
  const death = active.find((a) => a.arcana === "death");
  const wheel = active.find((a) => a.arcana === "wheel");
  const tower = active.find((a) => a.arcana === "tower");

  let deathUsed = false;
  let emperorTick = 0;
  let empWindowStart: Record<string, number> = {};
  let empWindowInited = false;
  const towerHits: Record<string, number> = {};

  const stepContext: BattleStepContext = {};

  if (fool) {
    const pct = FOOL_PCT[fool.level];
    stepContext.onLethalDodge = ({ wouldBeDamage }) => {
      const reflect = Math.floor(wouldBeDamage * pct);
      if (reflect <= 0) return;
      return {
        reflect,
        note: `🃏 **The Fool:** reflects ${reflect} (${Math.round(pct * 100)}%)!`,
      };
    };
  }

  if (death) {
    const spd = DEATH_SPD[death.level];
    stepContext.onWouldDie = ({ victim }) => {
      if (deathUsed) return false;
      deathUsed = true;
      victim.hp = 1;
      victim.speed += spd;
      victim.abilities = [];
      victim.abilitiesDisabled = true;
      victim.abilitySilenceTurns = 0;
      return true;
    };
  }

  return {
    stepContext,
    afterStep: async ({
      turn,
      fighter1,
      fighter2,
      fighters,
      isBonusTurn,
      battleLog,
      emperorDamageDealt,
    }) => {
      // tick silence before applying new Tower silence so duration isn't short by 1
      if (!isBonusTurn) {
        for (const f of [fighter1, fighter2]) {
          if (f.abilitySilenceTurns && f.abilitySilenceTurns > 0) {
            f.abilitySilenceTurns -= 1;
          }
        }
      }

      if (wheel && !isBonusTurn && turn > 0) {
        const every = wheelInterval(wheel.level);
        if (turn % every === 0) {
          if (wheel.level === 3) {
            randomizeFighterStatsAndAbilities(fighter1);
            randomizeFighterStatsAndAbilities(fighter2);
            battleLog.push(
              `🎡 **Wheel of Fortune:** stats & abilities randomized (HP unchanged)`,
            );
          } else {
            const parts: string[] = [];
            if (wheel.level >= 2) {
              swapAllAbilities(fighter1, fighter2);
              parts.push("all abilities swapped");
            } else {
              parts.push(swapOneAbility(fighter1, fighter2));
            }
            if (wheel.level >= 1) {
              parts.push(swapOneStat(fighter1, fighter2));
            }
            battleLog.push(`🎡 **Wheel of Fortune:** ${parts.join("; ")}`);
          }
        }
      }

      if (tower && !isBonusTurn && turn > 0 && turn % 6 === 0) {
        const alive = [fighter1, fighter2].filter((f) => f.hp > 0);
        if (alive.length) {
          const target = alive[Math.floor(Math.random() * alive.length)];
          const dmg = TOWER_DMG[tower.level];
          const prevHits = towerHits[target.user.id] ?? 0;
          target.hp = Math.max(0, target.hp - dmg);
          towerHits[target.user.id] = prevHits + 1;

          let silenceNote = "";
          const silenceTurns = TOWER_SILENCE[tower.level];
          if (silenceTurns > 0 && prevHits >= 1 && !target.abilitiesDisabled) {
            target.abilitySilenceTurns = Math.max(
              target.abilitySilenceTurns ?? 0,
              silenceTurns,
            );
            silenceNote = ` - silenced ${silenceTurns}t`;
          }

          battleLog.push(
            `🗼 **The Tower:** strikes ${target.name} for ${dmg} true dmg${silenceNote}`,
          );

          if (target.hp <= 0 && stepContext.onWouldDie) {
            const killer = target === fighter1 ? fighter2 : fighter1;
            const revived = stepContext.onWouldDie({
              victim: target,
              killer,
            });
            if (revived && target.hp > 0) {
              battleLog.push(
                `💀 **Death:** ${target.name} rises at ${target.hp} HP!`,
              );
            }
          }
        }
      }

      if (empress && !isBonusTurn) {
        const interval = empressInterval(empress.level);
        if (turn > 0 && turn % interval === 0) {
          if (fighter1.hp > fighter2.hp && fighter1.hp > 0) {
            const buff = applyEmpressBuff(fighter1, empress.level);
            battleLog.push(`👑 **The Empress:** ${fighter1.name} ${buff}`);
          } else if (fighter2.hp > fighter1.hp && fighter2.hp > 0) {
            const buff = applyEmpressBuff(fighter2, empress.level);
            battleLog.push(`👑 **The Empress:** ${fighter2.name} ${buff}`);
          }
        }
      }

      if (emperor && !isBonusTurn) {
        if (!empWindowInited) {
          empWindowStart = {
            [fighter1.user.id]: 0,
            [fighter2.user.id]: 0,
          };
          empWindowInited = true;
        }
        emperorTick++;
        const interval = EMPEROR_INTERVAL[emperor.level];
        if (emperorTick > 0 && emperorTick % interval === 0) {
          const d1 =
            (emperorDamageDealt[fighter1.user.id] ?? 0) -
            (empWindowStart[fighter1.user.id] ?? 0);
          const d2 =
            (emperorDamageDealt[fighter2.user.id] ?? 0) -
            (empWindowStart[fighter2.user.id] ?? 0);

          empWindowStart[fighter1.user.id] =
            emperorDamageDealt[fighter1.user.id] ?? 0;
          empWindowStart[fighter2.user.id] =
            emperorDamageDealt[fighter2.user.id] ?? 0;

          if (d1 > d2 && fighter1.hp > 0) {
            const idx = fighters.indexOf(fighter1);
            battleLog.push(
              `⚔️ **The Emperor:** ${fighter1.name} earns an extra turn (${d1} dmg window)`,
            );
            return { extraTurnIndex: idx };
          }
          if (d2 > d1 && fighter2.hp > 0) {
            const idx = fighters.indexOf(fighter2);
            battleLog.push(
              `⚔️ **The Emperor:** ${fighter2.name} earns an extra turn (${d2} dmg window)`,
            );
            return { extraTurnIndex: idx };
          }
        }
      }

      return;
    },
  };
}

export function mergeBattleHooks(
  ...hooksList: (BattleHooks | undefined)[]
): BattleHooks {
  const list = hooksList.filter(Boolean) as BattleHooks[];
  const stepContext: BattleStepContext = {};

  for (const h of list) {
    if (!h.stepContext) continue;
    const prevDodge = stepContext.onLethalDodge;
    const prevDie = stepContext.onWouldDie;
    if (h.stepContext.onLethalDodge) {
      const fn = h.stepContext.onLethalDodge;
      stepContext.onLethalDodge = (ctx) => {
        const a = prevDodge?.(ctx);
        const b = fn(ctx);
        if (b && b.reflect) return b;
        return a;
      };
    }
    if (h.stepContext.onWouldDie) {
      const fn = h.stepContext.onWouldDie;
      stepContext.onWouldDie = (ctx) => {
        if (prevDie?.(ctx)) return true;
        return fn(ctx);
      };
    }
  }

  return {
    stepContext:
      stepContext.onLethalDodge || stepContext.onWouldDie
        ? stepContext
        : undefined,
    afterStep: async (ctx) => {
      let extra: number | undefined;
      for (const h of list) {
        if (!h.afterStep) continue;
        const r = await h.afterStep(ctx);
        if (r && r.extraTurnIndex !== undefined) extra = r.extraTurnIndex;
      }
      if (extra !== undefined) return { extraTurnIndex: extra };
    },
  };
}
