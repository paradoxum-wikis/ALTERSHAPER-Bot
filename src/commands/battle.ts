import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  User,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from "discord.js";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import { generateFighter, Fighter } from "../utils/fighterGenerator.js";
import { BattleStatsManager } from "../utils/battleStatsManager.js";
import { BattleLockManager } from "../utils/battleLockManager.js";

export const data = new SlashCommandBuilder()
  .setName("battle")
  .setDescription("Witness an epic clash between two souls in divine combat!")
  .addUserOption((option) =>
    option
      .setName("fighter1")
      .setDescription("The first warrior to enter the arena")
      .setRequired(true),
  )
  .addUserOption((option) =>
    option
      .setName("fighter2")
      .setDescription("The second warrior to challenge fate")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("ranked")
      .setDescription(
        "Start a ranked battle (requires consent from both fighters)",
      )
      .addChoices(
        { name: "True", value: "yes" },
        { name: "False", value: "no" },
      )
      .setRequired(false),
  );

interface BattleEvent {
  attacker: string;
  defender: string;
  action: string;
  damage: number;
  isCrit: boolean;
  abilityUsed?: string;
  narration: string;
  fighter1Hp: number;
  fighter2Hp: number;
}

function getRealmName(backgroundFileName: string): string {
  switch (backgroundFileName) {
    case "deathbattle.png":
      return "heavens";
    case "deathbattle2.png":
      return "ruins";
    case "deathbattle3.png":
      return "games";
    default:
      return "heavens";
  }
}

const battleNarrations = {
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

function createHpBar(currentHp: number, maxHp: number): string {
  const percentage = Math.max(0, currentHp / maxHp);
  const barLength = 10;
  const filledBars = Math.floor(percentage * barLength);
  const emptyBars = barLength - filledBars;

  let color = "🟩";
  if (percentage < 0.3) color = "🟥";
  else if (percentage < 0.6) color = "🟨";

  return color.repeat(filledBars) + ":black_large_square:".repeat(emptyBars);
}

async function createBattleImage(
  fighter1: User,
  fighter2: User,
  fighter1Name: string,
  fighter2Name: string,
  winner?: User,
  isRanked: boolean = false,
  forceBackground?: string,
): Promise<{ buffer: Buffer; backgroundFileName: string }> {
  const canvas = createCanvas(1920, 1080);
  const ctx = canvas.getContext("2d");

  let backgroundFileName: string;
  if (forceBackground) {
    backgroundFileName = forceBackground;
  } else if (isRanked) {
    backgroundFileName = "deathbattle2.png";
  } else {
    backgroundFileName =
      Math.random() < 0.1 ? "deathbattle3.png" : "deathbattle.png";
  }

  const possiblePaths = [
    path.join(process.cwd(), "src", backgroundFileName),
    path.join(process.cwd(), "dist", backgroundFileName),
    path.join(process.cwd(), "altershaper-bot", "dist", backgroundFileName),
  ];

  let background: any = null;

  for (const imagePath of possiblePaths) {
    try {
      background = await loadImage(imagePath);
      break;
    } catch (error) {
      continue;
    }
  }

  try {
    if (background) {
      ctx.drawImage(background, 0, 0, 1920, 1080);
    } else {
      ctx.fillStyle = "#2F3136";
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 66px Verdana";
      ctx.textAlign = "center";
      ctx.fillText("DEATHBATTLE", 960, 540);
    }

    const avatar1 = await loadImage(
      fighter1.displayAvatarURL({ extension: "png", size: 512 }),
    );
    const avatar2 = await loadImage(
      fighter2.displayAvatarURL({ extension: "png", size: 512 }),
    );

    ctx.drawImage(avatar1, 225, 285, 512, 512);
    ctx.drawImage(avatar2, 1183, 285, 512, 512);

    if (winner) {
      const tempCanvas = createCanvas(512, 512);
      const tempCtx = tempCanvas.getContext("2d");

      let loserAvatar: any;
      let loserX: number;

      if (winner.id === fighter1.id) {
        loserAvatar = avatar2;
        loserX = 1183;
      } else {
        loserAvatar = avatar1;
        loserX = 225;
      }

      tempCtx.drawImage(loserAvatar, 0, 0, 512, 512);

      const imageData = tempCtx.getImageData(0, 0, 512, 512);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const gray = Math.round(
          0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
        );
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }

      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, loserX, 285, 512, 512);

      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.fillRect(loserX, 285, 512, 512);
    }

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 66px Verdana";
    ctx.textAlign = "center";

    // name fighter location
    ctx.fillText(fighter1Name, 475, 908);
    ctx.fillText(fighter2Name, 1440, 908);

    return { buffer: canvas.toBuffer(), backgroundFileName };
  } catch (error) {
    ctx.fillStyle = "#2F3136";
    ctx.fillRect(0, 0, 1920, 1080);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 66px Verdana";
    ctx.textAlign = "center";
    ctx.fillText("DEATHBATTLE", 960, 540);
    return { buffer: canvas.toBuffer(), backgroundFileName: "deathbattle.png" };
  }
}

async function simulateBattleStep(
  fighter1: Fighter,
  fighter2: Fighter,
  fighters: Fighter[],
  currentFighter: number,
  realmName: string,
): Promise<{ event: BattleEvent; newCurrentFighter: number }> {
  const attacker = fighters[currentFighter];
  const defender = fighters[1 - currentFighter];

  const useAbility = Math.random() < 0.25 && attacker.abilities.length > 0;
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
        if (attacker.hp > Math.floor(attacker.maxHp / 2)) {
          const divineHeal = Math.floor(attacker.maxHp * 0.1);
          attacker.hp = Math.min(attacker.hp + divineHeal, attacker.maxHp);
          attacker.defense += 6;
          narration = `⭐ **${attacker.name}** prayed and received the labyrinth's divine intervention, healing ${divineHeal} HP and fortifying their body (+6 DEF)!`;
        } else {
          const divineHeal = Math.floor(attacker.maxHp * 0.25);
          attacker.hp = Math.min(attacker.hp + divineHeal, attacker.maxHp);
          attacker.defense += 3;
          narration = `⭐ **${attacker.name}** prayed and received the labyrinth's divine intervention, healing ${divineHeal} HP and gaining resilience (+3 DEF)!`;
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
        const drainAmount = Math.floor(damage * 0.9);
        attacker.hp = Math.min(attacker.hp + drainAmount, attacker.maxHp);
        narration = `🧛 **${attacker.name}** sucks **${defender.name}**'s blood, draining ${drainAmount} HP for themself!`;
        break;
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
    if (useAbility) {
      if (abilityUsed === "Relic of Exo") {
        const effectiveDefense = Math.floor(defender.defense * 0.3); // 70% bypass
        damage = Math.max(1, damage - effectiveDefense);
      } else if (abilityUsed === "Soul Strike") {
        const effectiveDefense = Math.floor(defender.defense * 0.4); // 60% bypass
        damage = Math.max(1, damage - effectiveDefense);
      } else {
        damage = Math.max(1, damage - Math.floor(defender.defense * 0.5));
      }
    }

    defender.hp = Math.max(0, defender.hp - damage);
    if (!narration.includes("HP") && !narration.includes("dmg")) {
      narration += ` **(${damage} dmg)**`;
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
  };

  return {
    event,
    newCurrentFighter: 1 - currentFighter,
  };
}

async function handleConsentPhase(
  interaction: ChatInputCommandInteraction,
  fighter1User: User,
  fighter2User: User,
): Promise<boolean> {
  console.log(`[CONSENT] Starting consent phase for ranked battle`);
  console.log(`[CONSENT] Fighter 1: ${fighter1User.tag} (${fighter1User.id})`);
  console.log(`[CONSENT] Fighter 2: ${fighter2User.tag} (${fighter2User.id})`);

  const consentEmbed = new EmbedBuilder()
    .setColor("#FF6B35")
    .setTitle("⚔️ BATTLE CONSENT REQUIRED")
    .setDescription(
      `**${fighter1User} and ${fighter2User}**\n\n` +
        `A **RANKED** deathbattle has been proposed!\n\n` +
        `🏆 **This is a RANKED battle - results will affect your competitive rating!**\n\n` +
        `Both fighters must consent to engage in combat.\n` +
        `You have **15 seconds** to respond.`,
    )
    .setFooter({
      text: "Glory awaits in the arena of Alteruism!",
    });

  const acceptButton = new ButtonBuilder()
    .setCustomId("accept_battle")
    .setLabel("⚔️ Accept Battle")
    .setStyle(ButtonStyle.Success);

  const declineButton = new ButtonBuilder()
    .setCustomId("decline_battle")
    .setLabel("❌ Decline Battle")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    acceptButton,
    declineButton,
  );

  console.log(`[CONSENT] Sending consent embed with buttons`);
  await interaction.editReply({
    content: `${fighter1User} ${fighter2User}`,
    embeds: [consentEmbed],
    components: [row],
  });

  const acceptedUsers = new Set<string>();

  try {
    console.log(`[CONSENT] Creating message component collector`);
    const collector = interaction.channel!.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 15000,
    });

    return new Promise((resolve) => {
      collector.on("collect", async (buttonInteraction) => {
        const userId = buttonInteraction.user.id;
        console.log(
          `[CONSENT] Button interaction from user: ${buttonInteraction.user.tag} (${userId})`,
        );
        console.log(`[CONSENT] Button ID: ${buttonInteraction.customId}`);

        if (userId !== fighter1User.id && userId !== fighter2User.id) {
          console.log(
            `[CONSENT] Unauthorized user ${buttonInteraction.user.tag} tried to respond`,
          );
          await buttonInteraction.reply({
            content:
              "**Only the challenged fighters may respond to this battle!**",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        if (buttonInteraction.customId === "accept_battle") {
          acceptedUsers.add(userId);
          console.log(
            `[CONSENT] User ${buttonInteraction.user.tag} accepted the battle`,
          );
          console.log(`[CONSENT] Accepted users: ${Array.from(acceptedUsers)}`);
          await buttonInteraction.reply({
            content: `**You have accepted the battle challenge!**`,
            flags: MessageFlags.Ephemeral,
          });
        } else if (buttonInteraction.customId === "decline_battle") {
          console.log(
            `[CONSENT] User ${buttonInteraction.user.tag} declined the battle`,
          );
          await buttonInteraction.reply({
            content: `**You have declined the battle challenge!**`,
            flags: MessageFlags.Ephemeral,
          });

          console.log(`[CONSENT] Battle declined, stopping collector`);
          collector.stop("declined");
          resolve(false);
          return;
        }

        const bothAccepted =
          acceptedUsers.has(fighter1User.id) &&
          acceptedUsers.has(fighter2User.id);
        console.log(`[CONSENT] Both users accepted check: ${bothAccepted}`);
        console.log(
          `[CONSENT] Fighter1 accepted: ${acceptedUsers.has(fighter1User.id)}`,
        );
        console.log(
          `[CONSENT] Fighter2 accepted: ${acceptedUsers.has(fighter2User.id)}`,
        );

        if (bothAccepted) {
          console.log(`[CONSENT] Both users accepted, proceeding with battle`);
          collector.stop("accepted");
          resolve(true);
        }
      });

      collector.on("end", (collected, reason) => {
        console.log(`[CONSENT] Collector ended with reason: ${reason}`);
        console.log(`[CONSENT] Collected ${collected.size} interactions`);
        if (reason === "time") {
          console.log(`[CONSENT] Consent timed out`);
          resolve(false);
        }
      });
    });
  } catch (error) {
    console.error("[CONSENT] Error in consent phase:", error);
    return false;
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const fighter1User = interaction.options.getUser("fighter1")!;
  const fighter2User = interaction.options.getUser("fighter2")!;
  const rankedOption = interaction.options.getString("ranked") || "no";
  const isRanked = rankedOption === "yes";

  if (isRanked && interaction.guildId !== "1362084781134708907") {
    await interaction.reply({
      content:
        "**RANKED BATTLES CAN ONLY BE CONDUCTED IN THE SACRED ALTER EGO WIKI (.gg/aewiki)! This server does not have permission for competitive combat.**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  console.log(`[DEATHBATTLE] Starting deathbattle command`);
  console.log(
    `[DEATHBATTLE] Fighter 1: ${fighter1User.tag} (${fighter1User.id})`,
  );
  console.log(
    `[DEATHBATTLE] Fighter 2: ${fighter2User.tag} (${fighter2User.id})`,
  );
  console.log(`[DEATHBATTLE] Ranked option: ${rankedOption}`);
  console.log(`[DEATHBATTLE] Is ranked: ${isRanked}`);
  console.log(
    `[DEATHBATTLE] Command user: ${interaction.user.tag} (${interaction.user.id})`,
  );

  if (fighter1User.id === fighter2User.id) {
    console.log(`[DEATHBATTLE] Same user selected for both fighters`);
    await interaction.reply({
      content:
        "**A soul cannot battle against itself! Choose two different warriors!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    isRanked &&
    interaction.user.id !== fighter1User.id &&
    interaction.user.id !== fighter2User.id
  ) {
    console.log(`[DEATHBATTLE] Ranked battle initiated by non-participant`);
    await interaction.reply({
      content:
        "**For RANKED battles, you must be one of the fighters! You can only challenge others or accept challenges in ranked mode.**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (BattleLockManager.isLocked(interaction.guildId!, "battle")) {
    console.log(
      `[DEATHBATTLE] Battle already active in guild ${interaction.guildId}, rejecting new battle`,
    );
    await interaction.reply({
      content:
        "**THE ARENA IS OCCUPIED! Another grand battle is already taking place in the halls. Wait for the current clash to conclude before summoning new warriors to the arena!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (
    BattleLockManager.isUserBusy(fighter1User.id) ||
    BattleLockManager.isUserBusy(fighter2User.id)
  ) {
    console.log(
      `[DEATHBATTLE] One of the fighters is already in a battle elsewhere`,
    );
    await interaction.reply({
      content:
        "**ONE OF THE CHOSEN WARRIORS IS ALREADY ENGAGED IN COMBAT! Wait for their current battle to finish before challenging them again!**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lockAcquired = BattleLockManager.acquireLock(
    interaction.guildId!,
    "battle",
    [fighter1User.id, fighter2User.id],
  );

  if (!lockAcquired) {
    // This is a fallback, should never happen as it should be caught by the checks above
    await interaction.reply({
      content: "**Failed to acquire a battle lock. The arena might be busy.**",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  try {
    if (isRanked) {
      console.log(
        `[DEATHBATTLE] This is a ranked battle, starting consent phase`,
      );
      const consentGiven = await handleConsentPhase(
        interaction,
        fighter1User,
        fighter2User,
      );

      console.log(`[DEATHBATTLE] Consent phase result: ${consentGiven}`);

      if (!consentGiven) {
        console.log(`[DEATHBATTLE] Consent not given, cancelling battle`);
        const cancelEmbed = new EmbedBuilder()
          .setColor("#8B0000")
          .setTitle("⚔️ RANKED BATTLE CANCELLED")
          .setDescription(
            `The **RANKED** battle has been cancelled.\n\n` +
              `*The warriors have chosen not to engage in competitive combat at this time.*`,
          )
          .setFooter({ text: "🔓 Arena is now available for new battles." });

        await interaction.editReply({
          content: "",
          embeds: [cancelEmbed],
          components: [],
        });
        return;
      }
    } else {
      console.log(
        `[DEATHBATTLE] This is a casual battle, skipping consent phase`,
      );
    }

    console.log(`[DEATHBATTLE] Proceeding with battle setup`);

    let fighter1DisplayName: string;
    let fighter2DisplayName: string;

    if (interaction.inGuild()) {
      const member1 = await interaction.guild!.members.fetch(fighter1User.id);
      const member2 = await interaction.guild!.members.fetch(fighter2User.id);
      fighter1DisplayName = member1.displayName;
      fighter2DisplayName = member2.displayName;
    } else {
      fighter1DisplayName = fighter1User.username;
      fighter2DisplayName = fighter2User.username;
    }

    // Use 90% aura for ranked battles
    let fighter1: Fighter;
    let fighter2: Fighter;

    if (isRanked) {
      fighter1 = generateFighter(fighter1User, fighter1DisplayName, 90);
      fighter2 = generateFighter(fighter2User, fighter2DisplayName, 90);
    } else {
      fighter1 = generateFighter(fighter1User, fighter1DisplayName);
      fighter2 = generateFighter(fighter2User, fighter2DisplayName);
    }

    const imageResult = await createBattleImage(
      fighter1User,
      fighter2User,
      fighter1DisplayName,
      fighter2DisplayName,
      undefined,
      isRanked,
    );
    const attachment = new AttachmentBuilder(imageResult.buffer, {
      name: "deathbattle.png",
    });

    const realmName = getRealmName(imageResult.backgroundFileName);

    const fighters = [fighter1, fighter2].sort((a, b) => b.speed - a.speed);
    let currentFighter = 0;
    let turn = 0;
    let battleLog: string[] = [];

    const setupEmbed = new EmbedBuilder()
      .setColor(isRanked ? "#FF6B35" : "#2E2B5F")
      .setTitle(
        `⚔️ THE ${realmName.toUpperCase()} HAVE DECLARED A ${isRanked ? "RANKED " : ""}DEATHBATTLE!`,
      )
      .setDescription(
        `**Two warriors enter the sacred arena of combat!**\n\n` +
          `${isRanked ? "🏆 **RANKED BATTLE** - Results will affect competitive ratings!\n⚡ **All fighters have been adjusted to 90% aura!**\n\n" : ""}` +
          `**${fighter1.name}** vs **${fighter2.name}**\n\n` +
          `🏃 **${fighters[0].name}** moves first with superior speed!\n\n` +
          `**Fighter Stats:**\n` +
          `🔴 **${fighter1.name}**: ${fighter1.maxHp} HP | ${fighter1.attack} ATK | ${fighter1.defense} DEF | ${fighter1.speed} SPD${isRanked ? " (90% aura)" : ""}\n` +
          `🔵 **${fighter2.name}**: ${fighter2.maxHp} HP | ${fighter2.attack} ATK | ${fighter2.defense} DEF | ${fighter2.speed} SPD${isRanked ? " (90% aura)" : ""}\n\n` +
          `💨 **Speed Advantage:** Higher speed grants +1% dodge chance per point difference\n` +
          `⚔️ **Battle begins in 3 seconds...**`,
      )
      .setImage("attachment://deathbattle.png")
      .setFooter({
        text: `🔒 Arena locked - ${isRanked ? "RANKED " : ""}Battle in progress...`,
      });

    await interaction.editReply({
      content: "",
      embeds: [setupEmbed],
      files: [attachment],
      components: [],
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    while (fighter1.hp > 0 && fighter2.hp > 0 && turn < 55) {
      const stepResult = await simulateBattleStep(
        fighter1,
        fighter2,
        fighters,
        currentFighter,
        realmName,
      );
      const event = stepResult.event;
      battleLog.push(event.narration);
      currentFighter = stepResult.newCurrentFighter;
      turn++;

      const progressEmbed = new EmbedBuilder()
        .setColor(isRanked ? "#FF6B35" : "#35C2FF")
        .setTitle(`⚔️ ${isRanked ? "RANKED " : ""}BATTLE IN PROGRESS`)
        .setDescription(
          `**Turn ${turn}** - The battle rages on!\n\n` +
            `**Current HP:**\n` +
            `🔴 **${fighter1.name}**: ${fighter1.hp}/${fighter1.maxHp} HP\n` +
            `${createHpBar(fighter1.hp, fighter1.maxHp)}\n\n` +
            `🔵 **${fighter2.name}**: ${fighter2.hp}/${fighter2.maxHp} HP\n` +
            `${createHpBar(fighter2.hp, fighter2.maxHp)}\n\n` +
            `**The Battle:**\n` +
            battleLog.slice(-5).join("\n"),
        )
        .setImage("attachment://deathbattle.png")
        .setFooter({
          text: `🔒 Arena locked - ${isRanked ? "RANKED " : ""}Battle in progress...`,
        });

      await interaction.editReply({ embeds: [progressEmbed] });

      if (fighter1.hp <= 0 || fighter2.hp <= 0) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const loser = fighter1.hp <= 0 ? fighter1 : fighter2;
    const winner = fighter1.hp > 0 ? fighter1 : fighter2;

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

    await BattleStatsManager.recordBattle(
      winner.user.id,
      winner.user.tag,
      loser.user.id,
      loser.user.tag,
      turn,
      winner.hp,
      winner.maxHp,
      isRanked,
      interaction.guildId || undefined,
    );

    const finalImageResult = await createBattleImage(
      fighter1User,
      fighter2User,
      fighter1DisplayName,
      fighter2DisplayName,
      winner.user,
      isRanked,
      imageResult.backgroundFileName,
    );
    const finalAttachment = new AttachmentBuilder(finalImageResult.buffer, {
      name: "deathbattle-final.png",
    });

    const winnerStats = await BattleStatsManager.getUserStats(winner.user.id);
    const loserStats = await BattleStatsManager.getUserStats(loser.user.id);

    const finalEmbed = new EmbedBuilder()
      .setColor("#FFD700")
      .setTitle(`🏆 THE ${isRanked ? "RANKED " : ""}DEATHBATTLE HAS CONCLUDED`)
      .setDescription(
        `**${winner.name}** emerges victorious after ${turn} turns!\n\n` +
          (turn >= 55
            ? "**The heavens are satisfied. The battle has been forcefully stopped, the combatant with the lowest health has been executed!**\n\n"
            : "") +
          `**Final Results:**\n` +
          `🏆 **Victor:** ${winner.name} (${winner.hp}/${winner.maxHp} HP)\n` +
          `💀 **Defeated:** ${loser.name} (0/${loser.maxHp} HP)\n\n` +
          `**Battle Conclusion:**\n` +
          battleLog.slice(-3).join("\n") +
          "\n\n" +
          (isRanked
            ? `**Updated Ranked Battle Records:**\n` +
              `🏆 **${winner.name}:** ${winnerStats?.rankedWins || 1}W-${winnerStats?.rankedLosses || 0}L (${(winnerStats?.rankedWeightedScore || 0).toFixed(2)} WS)\n` +
              `💀 **${loser.name}:** ${loserStats?.rankedWins || 0}W-${loserStats?.rankedLosses || 1}L (${(loserStats?.rankedWeightedScore || 0).toFixed(2)} WS)\n\n`
            : "") +
          `*The arena falls silent as ${winner.name} stands triumphant...*`,
      )
      .setImage("attachment://deathbattle-final.png")
      .setFooter({
        text: `${isRanked ? "Ranked " : ""}Battle lasted ${turn} turns | 🔓 Arena is now available for new battles.`,
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [finalEmbed],
      files: [finalAttachment],
      components: [],
    });
  } catch (error) {
    console.error("Deathbattle error:", error);
    await interaction.editReply({
      content:
        "**THE DIVINE POWERS HAVE FAILED TO MANIFEST THE BATTLE! The arena remains empty.**",
      components: [],
    });
  } finally {
    BattleLockManager.releaseLock(interaction.guildId!, "battle");
    console.log(
      `[DEATHBATTLE] Released battle lock for guild ${interaction.guildId}`,
    );
  }
}
