import type { Fighter } from "./fighterGenerator.js";

export interface BattleEvent {
  attacker: string;
  defender: string;
  action: string;
  damage: number;
  isCrit: boolean;
  abilityUsed?: string;
  narration: string;
  fighter1Hp: number;
  fighter2Hp: number;
  wouldBeDamage?: number;
  lethalDodge?: boolean;
  appliedDamage?: number;
  reflectDamage?: number;
}

export interface BattleStepContext {
  trackDamage?: boolean;
  onLethalDodge?: (ctx: {
    attacker: Fighter;
    defender: Fighter;
    wouldBeDamage: number;
  }) => { reflect: number; note?: string } | void;
  /**
   * true = ressurection
   */
  onWouldDie?: (ctx: { victim: Fighter; killer: Fighter }) => boolean;
}

export interface BattleHooks {
  afterStep?: (ctx: {
    turn: number;
    event: BattleEvent;
    fighter1: Fighter;
    fighter2: Fighter;
    fighters: Fighter[];
    justActed: number;
    defaultNext: number;
    isBonusTurn: boolean;
    battleLog: string[];
    damageDealt: Record<string, number>;
    emperorDamageDealt: Record<string, number>;
  }) => void | Promise<{ extraTurnIndex?: number } | void>;
  stepContext?: BattleStepContext;
}

export interface RunBattleOptions {
  turnCap: number | null;
  realmName: string;
  turnDelayMs?: number;
  hooks?: BattleHooks;
  onTurn?: (info: {
    turn: number;
    event: BattleEvent;
    fighter1: Fighter;
    fighter2: Fighter;
    battleLog: string[];
  }) => void | Promise<void>;
}

export interface BattleResult {
  winner: Fighter;
  loser: Fighter;
  turns: number;
  hitTurnCap: boolean;
  battleLog: string[];
  damageDealt: Record<string, number>;
}

export const battleNarrations = {
  normalAttack: [
    "{attacker} strikes {defender} with fury",
    "{attacker} unleashes a devastating blow upon {defender}",
    "{attacker} channels their inner alter ego against {defender}",
    "{attacker} delivers a blow to {defender}",
    "{attacker} attacks {defender} with determination",
    "{attacker} brings down their wrath on {defender}",
    "{attacker} manifests their true power against {defender}",
    "{attacker} launches a fierce assault on {defender}",
    "{attacker} quickly strikes {defender}",
  ],
  criticalHit: [
    "{attacker} lands a **CRITICAL** strike that shakes the {realm}!",
    "{attacker} unleashes a soul-crushing **CRITICAL** blow!",
    "{attacker} empowers their alter ego for a **DEVASTATING** hit!",
    "{attacker} delivers a space-bending **CRITICAL** attack!",
    "{attacker} strikes with the fury of a thousand alters - **CRITICAL**!",
  ],
  dodge: [
    "{defender} elegantly evades {attacker}'s assault",
    "{defender} phases through {attacker}'s attack like a phantom",
    "{defender} reads {attacker}'s movements and dodges perfectly",
    "{defender} vanishes from sight, avoiding {attacker}'s strike",
    "{defender} sidesteps {attacker}'s attack",
    "{defender} anticipates {attacker}'s move and slips away",
  ],
  block: [
    "{defender} raises their guard and blocks {attacker}'s attack",
    "{defender} deflects {attacker}'s strike with great skill",
    "{defender} fully resists {attacker}'s assault with a perfect block",
    "{defender} absorbs the impact with unwavering resolve",
    "{defender} withstands {attacker}'s attack like a man",
  ],
  death: [
    "{fighter} collapses to the ground, defeated",
    "{fighter} falls with honor, their alter ego proud",
    "{fighter} succumbs to their wounds",
    "{fighter} takes their final breath, at peace",
    "{fighter} is vanquished, their spirit ascending",
    "{fighter} has been defeated, their legacy lives on",
    "{fighter} has fallen in battle",
    "{fighter} has met their pitiful end",
    "{fighter}'s fate is sealed, their alter ego fades",
    "{fighter}'s journey ends here, their alter ego rests",
    "The comfort of death embraces {fighter}",
  ],
  victory: [
    "{winner} stands victorious over the battlefield!",
    "{winner} raises their arms in triumphant glory!",
    "{winner} has proven their supremacy in combat!",
    "{winner} emerges as the ultimate warrior!",
    "{winner} claims the title of champion!",
    "{winner} has prevailed!",
    "The {realm} shall remember {winner}'s victory!",
  ],
};

export function createHpBar(currentHp: number, maxHp: number): string {
  const percentage = Math.max(0, currentHp / maxHp);
  const barLength = 10;
  const filledBars = Math.floor(percentage * barLength);
  const emptyBars = barLength - filledBars;

  let color = "🟩";
  if (percentage < 0.3) color = "🟥";
  else if (percentage < 0.6) color = "🟨";

  return color.repeat(filledBars) + ":black_large_square:".repeat(emptyBars);
}

export async function simulateBattleStep(
  fighter1: Fighter,
  fighter2: Fighter,
  fighters: Fighter[],
  currentFighter: number,
  realmName: string,
  damageTracker?: Record<string, number>,
  stepCtx?: BattleStepContext,
): Promise<{ event: BattleEvent; newCurrentFighter: number }> {
  const attacker = fighters[currentFighter];
  const defender = fighters[1 - currentFighter];
  const trackDamage = stepCtx?.trackDamage !== false;

  const silenced =
    !!attacker.abilitiesDisabled ||
    (attacker.abilitySilenceTurns !== undefined &&
      attacker.abilitySilenceTurns > 0);
  const canAbility = !silenced && attacker.abilities.length > 0;
  const useAbility = Math.random() < 0.25 && canAbility;
  let damage = 0;
  let action = "attack";
  let abilityUsed: string | undefined;
  let narration = "";

  if (useAbility) {
    abilityUsed =
      attacker.abilities[Math.floor(Math.random() * attacker.abilities.length)];

    switch (abilityUsed) {
      case "Alter Ego Burst":
        damage = Math.floor(attacker.attack * 1.5);
        narration = `💥 **${attacker.name}** channels their alter ego for a devastating burst attack!`;
        break;
      case "Ego Shield":
        attacker.defense += 10;
        narration = `🛡️ **${attacker.name}** raises an ego shield, increasing their defense! (+10 DEF)`;
        break;
      case "Shadow Clone":
        attacker.attack += 1;
        damage = Math.floor(attacker.attack * 1.2);
        narration = `👥 **${attacker.name}** creates shadow clones, striking from multiple angles while empowering themself with the shadows! (+1 ATK)`;
        break;
      case "Healing Light":
        const heal = Math.floor(attacker.maxHp * 0.3);
        attacker.hp = Math.min(attacker.hp + heal, attacker.maxHp);
        narration = `✨ **${attacker.name}** bathes in the gracious healing light, restoring ${heal} HP!`;
        break;
      case "Berserker Rage":
        attacker.attack += 6;
        attacker.defense = Math.max(1, attacker.defense - 2);
        narration = `😡 **${attacker.name}** enters a berserker rage! (+6 ATK, -2 DEF)`;
        break;
      case "Time Slow":
        attacker.speed += 6;
        narration = `⏰ **${attacker.name}** manipulates time, increasing their speed! (+6 SPD)`;
        break;
      case "Soul Strike":
        attacker.speed += 1;
        defender.speed = Math.max(1, defender.speed - 1);
        damage = Math.floor(attacker.attack * 1.3);
        narration = `👻 **${attacker.name}** strikes directly at **${defender.name}**'s soul, stealing their energy while breaking through defenses! (+1 SPD, -1 SPD to enemy)`;
        break;
      case "Phoenix Rising":
        if (attacker.hp < attacker.maxHp * 0.3) {
          const heal = Math.floor(attacker.maxHp * 0.15);
          attacker.hp = Math.min(attacker.hp + heal, attacker.maxHp);
          narration = `🔥 **${attacker.name}** rises like a phoenix, healing for ${heal} HP!`;
        } else {
          damage = Math.floor(attacker.attack * 1.2);
          attacker.defense += 1;
          narration = `🔥 **${attacker.name}** strikes with phoenix fire, their flames hardening their resolve! (+1 DEF)`;
        }
        break;
      case "Relic of Exo":
        damage = Math.floor(attacker.attack * 1.4);
        narration = `🏺 **${attacker.name}** unleashes the power of the Relic of Exo, partially bypassing defenses!`;
        break;
      case "Ego's Blessing":
        attacker.attack += 2;
        attacker.defense += 2;
        attacker.speed += 2;
        narration = `🌟 **${attacker.name}** receives Ego's divine blessing! (+2 to all stats)`;
        break;
      case "Cleansing":
        const cleanseHeal = Math.floor(attacker.maxHp * 0.15);
        attacker.hp = Math.min(attacker.hp + cleanseHeal, attacker.maxHp);
        attacker.speed += 1;
        narration = `🌿 **${attacker.name}** cleanses their body and soul, healing ${cleanseHeal} HP, and gaining swift energy! (+1 SPD)`;
        break;
      case "Raise the Dead":
        if (attacker.hp < attacker.maxHp * 0.25) {
          const reviveHeal = Math.floor(attacker.maxHp * 0.5);
          attacker.hp = Math.min(attacker.hp + reviveHeal, attacker.maxHp);
          narration = `⚰️ **${attacker.name}** calls upon the dead, cheating death with ${reviveHeal} HP!`;
        } else {
          damage = Math.floor(attacker.attack * 1.1);
          narration = `⚰️ **${attacker.name}** summons the spirits of the fallen to strike!`;
        }
        break;
      case "Warrior's Call":
        attacker.attack += 4;
        narration = `🗡️ **${attacker.name}** lets out a warrior's cry, increasing their battle fury! (+4 ATK)`;
        break;
      case "Drop the Beat":
        defender.speed = Math.max(1, defender.speed - 1);
        defender.attack = Math.max(1, defender.attack - 1);
        defender.defense = Math.max(1, defender.defense - 1);
        narration = `🎵 **${attacker.name}** drops the beat, disrupting **${defender.name}**'s rhythm! (-1 to all stats to enemy)`;
        break;
      case "Call to Arms":
        damage = Math.floor(attacker.attack * 1.3);
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + 10);
        narration = `📯 **${attacker.name}** sounds the call to arms, a platoon of soldiers unleashes a flurry of bullets, while receiving medicine for 10 life force!`;
        break;
      case "Airstrike":
        const airstrikes = Math.floor(Math.random() * 5) + 1;
        damage = Math.floor(attacker.attack * (1.8 / 5)) * airstrikes;
        narration = `✈️ **${attacker.name}** calls in an airstrike from above, ${airstrikes} bomber${airstrikes > 1 ? "s" : ""} raining destruction!`;
        break;
      case "Divine Intervention":
        if (attacker.hp >= Math.floor(attacker.maxHp / 2)) {
          const divineHeal = Math.floor(attacker.maxHp * 0.1);
          attacker.hp = Math.min(attacker.hp + divineHeal, attacker.maxHp);
          attacker.defense += 6;
          narration = `⭐ **${attacker.name}** prayed and received the labyrinth's divine intervention, healing ${divineHeal} HP and fortifying their body! (+6 DEF)`;
        } else {
          const divineHeal = Math.floor(attacker.maxHp * 0.25);
          attacker.hp = Math.min(attacker.hp + divineHeal, attacker.maxHp);
          attacker.defense += 3;
          narration = `⭐ **${attacker.name}** prayed and received the labyrinth's divine intervention, healing ${divineHeal} HP and gaining resilience! (+3 DEF)`;
        }
        break;
      case "Great Will":
        const missingHp = attacker.maxHp - attacker.hp;
        damage = Math.floor(attacker.attack + missingHp * 0.35);
        narration = `👑 **${attacker.name}** channels their great will, converting their wounds into raw power!`;
        break;
      case "Toxic Fumes":
        attacker.defense += 3;
        attacker.speed += 3;
        narration = `☣️ **${attacker.name}** injects themself with Toxic Gunner's fumes, enhancing their reflexes and durability! (+5 DEF, +5 SPD)`;
        break;
      case "Freikugel":
        const freikugelCost = Math.floor(attacker.maxHp * 0.1);
        if (attacker.hp > freikugelCost) {
          damage = 35;
          attacker.hp -= freikugelCost;
          narration = `🔫 **${attacker.name}** fires the accursed Freikugel, sacrificing ${freikugelCost} HP for demonic devastation! **(35 dmg)**`;
        } else {
          damage = Math.floor(attacker.attack * 1.1);
          narration = `🔫 **${attacker.name}** attempts to fire the Freikugel but lacks the life force, settling for a weaker shot!`;
        }
        break;
      case "Bloodlust":
        damage = Math.floor(attacker.attack * 0.8);
        const drainAmount = Math.floor(damage * 0.5);
        attacker.hp = Math.min(attacker.hp + drainAmount, attacker.maxHp);
        narration = `🧛 **${attacker.name}** sucks **${defender.name}**'s blood, draining ${drainAmount} HP for themself!`;
        break;
      case "Blade of the Old World":
        const firstHit = Math.floor(defender.hp * 0.22);
        damage = firstHit;
        let extraHit = false;
        if (Math.random() < 0.25) {
          const secondHit = Math.floor((defender.hp - firstHit) * 0.22);
          damage += secondHit;
          extraHit = true;
        }
        narration = `🗡️ **${attacker.name}** wields the Blade of the Old World, slicing through reality!${
          extraHit ? " A second slash follows!" : ""
        }`;
        break;
      case "Spectral Exonorator":
        const oldHp = attacker.hp;
        const tempHp = attacker.hp;
        attacker.hp = defender.hp;
        defender.hp = tempHp;

        const tempMaxHp = attacker.maxHp;
        attacker.maxHp = defender.maxHp;
        defender.maxHp = tempMaxHp;

        const tempAtk = attacker.attack;
        attacker.attack = defender.attack;
        defender.attack = tempAtk;

        const tempDef = attacker.defense;
        attacker.defense = defender.defense;
        defender.defense = tempDef;

        const tempSpd = attacker.speed;
        attacker.speed = defender.speed;
        defender.speed = tempSpd;

        let bonusMsg = "";
        if (attacker.hp < oldHp) {
          attacker.attack += 2;
          bonusMsg = "(+2 ATK)";
        } else if (attacker.hp > oldHp) {
          attacker.defense += 2;
          bonusMsg = "(+2 DEF)";
        }

        attacker.abilities = attacker.abilities.filter(
          (a) => a !== "Spectral Exonorator",
        );

        narration = `👻 **${attacker.name}** uses Spectral Exonorator, swapping bodies and souls with **${defender.name}**! This ability is no longer available for **${attacker.name}**. ${bonusMsg}`;
        break;
      case "Axis Cleave":
        damage = Math.ceil(attacker.attack * 0.5);
        const axisHeal = Math.ceil(attacker.attack * 0.5);
        attacker.hp = Math.min(attacker.hp + axisHeal, attacker.maxHp);
        narration = `✖️ **${attacker.name}** performs an Axis Cleave, dealing damage and converting energy to heal ${axisHeal} HP!`;
        break;
      case "Kim Ji Hoon Combo":
        damage = Math.floor(attacker.attack * 1.25);
        attacker.defense += 2;
        attacker.speed += 1;
        narration = `👊 **${attacker.name}** executes the KJH Combo! (+2 DEF, +1 SPD)`;
        break;
    }

    if (damage > 0) {
      const unblockableMoves = [
        "Airstrike",
        "Great Will",
        "Blade of the Old World",
        "Axis Cleave",
        "Freikugel",
      ];

      const canBlockAbility = !unblockableMoves.includes(abilityUsed!);
      if (canBlockAbility && Math.random() < 0.1) {
        damage = Math.max(1, damage - defender.defense);
        action = "block";
        narration += ` ...but 🛡️ **${defender.name}** blocked the ability!`;
      }
    }
  } else {
    const baseDamage = attacker.attack;
    const critRoll = Math.random();
    const isCrit = critRoll < attacker.critChance;
    damage = isCrit ? Math.floor(baseDamage * 1.8) : baseDamage;

    const speedDifference = Math.max(0, defender.speed - attacker.speed);
    const baseDodgeChance = 0.15;
    const speedDodgeBonus = speedDifference * 0.01;
    const totalDodgeChance = baseDodgeChance + speedDodgeBonus;

    const defenseRoll = Math.random();
    const canBlock =
      abilityUsed !== "Airstrike" && abilityUsed !== "Great Will";

    if (defenseRoll < totalDodgeChance) {
      const wouldBe = Math.max(1, damage - Math.floor(defender.defense / 2));
      const lethalDodge = wouldBe >= defender.hp;
      damage = 0;
      action = "dodge";
      const dodgeMessage =
        speedDifference > 0
          ? `💨 **${defender.name}** ${battleNarrations.dodge[
              Math.floor(Math.random() * battleNarrations.dodge.length)
            ]
              .replace("{defender}", "")
              .replace(
                "{attacker}",
                `**${attacker.name}**`,
              )} *(+${speedDifference}% dodge from speed)*`
          : `💨 **${defender.name}** ${battleNarrations.dodge[
              Math.floor(Math.random() * battleNarrations.dodge.length)
            ]
              .replace("{defender}", "")
              .replace("{attacker}", `**${attacker.name}**`)}`;
      narration = dodgeMessage;

      let reflectDamage = 0;
      if (lethalDodge && stepCtx?.onLethalDodge) {
        const r = stepCtx.onLethalDodge({
          attacker,
          defender,
          wouldBeDamage: wouldBe,
        });
        if (r && r.reflect > 0) {
          const before = attacker.hp;
          attacker.hp = Math.max(0, attacker.hp - r.reflect);
          reflectDamage = before - attacker.hp;
          if (r.note) narration += ` ${r.note}`;
          else
            narration += ` 🃏 **The Fool:** reflects ${reflectDamage} to ${attacker.name}!`;
          if (attacker.hp <= 0 && stepCtx.onWouldDie) {
            const revived = stepCtx.onWouldDie({
              victim: attacker,
              killer: defender,
            });
            if (revived && attacker.hp > 0) {
              narration += ` 💀 **Death:** ${attacker.name} rises at ${attacker.hp} HP!`;
            }
          }
        }
      }

      const eventDodge: BattleEvent = {
        attacker: attacker.name,
        defender: defender.name,
        action,
        damage: 0,
        isCrit: false,
        abilityUsed,
        narration,
        fighter1Hp: fighter1.hp,
        fighter2Hp: fighter2.hp,
        wouldBeDamage: wouldBe,
        lethalDodge,
        appliedDamage: 0,
        reflectDamage,
      };
      return {
        event: eventDodge,
        newCurrentFighter: 1 - currentFighter,
      };
    } else if (defenseRoll < totalDodgeChance + 0.15 && canBlock) {
      damage = Math.max(1, damage - defender.defense);
      action = "block";
      narration = `🛡️ **${defender.name}** ${battleNarrations.block[
        Math.floor(Math.random() * battleNarrations.block.length)
      ]
        .replace("{defender}", "")
        .replace("{attacker}", `**${attacker.name}**`)}`;
    } else {
      damage = Math.max(1, damage - Math.floor(defender.defense / 2));

      if (isCrit) {
        narration = `💥 ${battleNarrations.criticalHit[
          Math.floor(Math.random() * battleNarrations.criticalHit.length)
        ]
          .replace("{attacker}", `**${attacker.name}**`)
          .replace("{realm}", realmName)}`;
      } else {
        narration = `⚔️ ${battleNarrations.normalAttack[
          Math.floor(Math.random() * battleNarrations.normalAttack.length)
        ]
          .replace("{attacker}", `**${attacker.name}**`)
          .replace("{defender}", `**${defender.name}**`)}`;
      }
    }
  }

  if (damage > 0) {
    if (useAbility && action !== "block") {
      if (abilityUsed === "Relic of Exo") {
        const effectiveDefense = Math.floor(defender.defense * 0.3); // 70% bypass
        damage = Math.max(1, damage - effectiveDefense);
      } else if (abilityUsed === "Soul Strike") {
        const effectiveDefense = Math.floor(defender.defense * 0.4); // 60% bypass
        damage = Math.max(1, damage - effectiveDefense);
      } else if (abilityUsed === "Blade of the Old World") {
      } else {
        damage = Math.max(1, damage - Math.floor(defender.defense * 0.5));
      }
    }

    const hpBefore = defender.hp;
    defender.hp = Math.max(0, defender.hp - damage);
    const applied = hpBefore - defender.hp;
    if (applied > 0 && damageTracker && trackDamage) {
      damageTracker[attacker.user.id] =
        (damageTracker[attacker.user.id] ?? 0) + applied;
    }
    if (!narration.includes("HP") && !narration.includes("dmg")) {
      narration += ` **(${damage} dmg)**`;
    }

    if (defender.hp <= 0 && stepCtx?.onWouldDie) {
      const revived = stepCtx.onWouldDie({
        victim: defender,
        killer: attacker,
      });
      if (revived && defender.hp > 0) {
        narration += ` 💀 **Death:** ${defender.name} rises at ${defender.hp} HP!`;
      }
    }
  }

  const event: BattleEvent = {
    attacker: attacker.name,
    defender: defender.name,
    action,
    damage,
    isCrit: false,
    abilityUsed,
    narration,
    fighter1Hp: fighter1.hp,
    fighter2Hp: fighter2.hp,
    appliedDamage: damage > 0 ? Math.max(0, damage) : 0,
  };

  return {
    event,
    newCurrentFighter: 1 - currentFighter,
  };
}

export async function runBattle(
  fighter1: Fighter,
  fighter2: Fighter,
  options: RunBattleOptions,
): Promise<BattleResult> {
  const turnCap = options.turnCap;
  const hardMax = turnCap ?? 5000;
  const realmName = options.realmName;
  const delay = options.turnDelayMs ?? 0;

  const fighters = [fighter1, fighter2].sort((a, b) => b.speed - a.speed);
  let currentFighter = 0;
  let turn = 0;
  const battleLog: string[] = [];
  const damageDealt: Record<string, number> = {
    [fighter1.user.id]: 0,
    [fighter2.user.id]: 0,
  };
  // Emperor tallies exclude bonus-turn damage (Job.md)
  const emperorDamageDealt: Record<string, number> = {
    [fighter1.user.id]: 0,
    [fighter2.user.id]: 0,
  };

  let forcedNext: number | null = null;
  let afterBonusNext: number | null = null;
  let isBonusTurn = false;

  while (fighter1.hp > 0 && fighter2.hp > 0 && turn < hardMax) {
    if (forcedNext !== null) {
      currentFighter = forcedNext;
      forcedNext = null;
      isBonusTurn = true;
    } else {
      isBonusTurn = false;
    }

    const stepCtx: BattleStepContext = {
      ...(options.hooks?.stepContext ?? {}),
      trackDamage: true,
    };
    const dmgBefore = {
      [fighter1.user.id]: damageDealt[fighter1.user.id] ?? 0,
      [fighter2.user.id]: damageDealt[fighter2.user.id] ?? 0,
    };

    const stepResult = await simulateBattleStep(
      fighter1,
      fighter2,
      fighters,
      currentFighter,
      realmName,
      damageDealt,
      stepCtx,
    );
    const event = stepResult.event;
    battleLog.push(event.narration);

    if (!isBonusTurn) {
      for (const id of [fighter1.user.id, fighter2.user.id]) {
        const delta = (damageDealt[id] ?? 0) - (dmgBefore[id] ?? 0);
        if (delta > 0) {
          emperorDamageDealt[id] = (emperorDamageDealt[id] ?? 0) + delta;
        }
      }
    }

    const justActed = currentFighter;
    const defaultNext = stepResult.newCurrentFighter;
    turn++;

    let extraTurnIndex: number | undefined;
    if (options.hooks?.afterStep) {
      const plan = await options.hooks.afterStep({
        turn,
        event,
        fighter1,
        fighter2,
        fighters,
        justActed,
        defaultNext,
        isBonusTurn,
        battleLog,
        damageDealt,
        emperorDamageDealt,
      });
      if (plan && plan.extraTurnIndex !== undefined) {
        extraTurnIndex = plan.extraTurnIndex;
      }
    }

    if (options.onTurn) {
      await options.onTurn({ turn, event, fighter1, fighter2, battleLog });
    }

    if (fighter1.hp <= 0 || fighter2.hp <= 0) break;
    if (turnCap !== null && turn >= turnCap) break;

    if (isBonusTurn) {
      currentFighter = afterBonusNext !== null ? afterBonusNext : defaultNext;
      afterBonusNext = null;
    } else if (extraTurnIndex !== undefined) {
      forcedNext = extraTurnIndex;
      afterBonusNext = defaultNext;
    } else {
      currentFighter = defaultNext;
    }

    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }

  const hitTurnCap =
    fighter1.hp > 0 && fighter2.hp > 0 && turnCap !== null && turn >= turnCap;
  const hitHardMax = fighter1.hp > 0 && fighter2.hp > 0;

  let winner: Fighter;
  let loser: Fighter;
  if (fighter1.hp <= 0 || fighter2.hp <= 0) {
    loser = fighter1.hp <= 0 ? fighter1 : fighter2;
    winner = fighter1.hp > 0 ? fighter1 : fighter2;
  } else {
    if (fighter1.hp !== fighter2.hp) {
      winner = fighter1.hp > fighter2.hp ? fighter1 : fighter2;
      loser = winner === fighter1 ? fighter2 : fighter1;
    } else {
      winner = fighters[0];
      loser = fighters[1];
    }
    loser.hp = 0;
  }

  const deathNarration = battleNarrations.death[
    Math.floor(Math.random() * battleNarrations.death.length)
  ].replace("{fighter}", `**${loser.name}**`);
  battleLog.push(`💀 ${deathNarration}`);

  const victoryNarration = battleNarrations.victory[
    Math.floor(Math.random() * battleNarrations.victory.length)
  ]
    .replace("{winner}", `**${winner.name}**`)
    .replace("{realm}", realmName);
  battleLog.push(`🏆 ${victoryNarration}`);

  return {
    winner,
    loser,
    turns: turn,
    hitTurnCap: hitTurnCap || hitHardMax,
    battleLog,
    damageDealt,
  };
}
