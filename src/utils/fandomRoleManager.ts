import { GuildMember, Guild } from "discord.js";
import {
  FANDOM_ROLE_MAP,
  FANDOM_ROLE_IDS,
  LINKED_ROLE_ID,
  TOP_CONTRIBUTORS_ROLE_ID,
  STAFF_ROLE_ID,
  EDIT_COUNT_ROLES,
  EDIT_COUNT_ROLE_IDS,
  WIKI_SYNC_ROLES,
} from "./roleConstants.js";

export interface RoleSyncResult {
  grantedRoleNames: string[];
  failedRoleNames: string[];
}

interface EditCountResult {
  rolesToGrant: string[];
}

interface FandomContribsResponse {
  continue?: {
    uccontinue: string;
    continue: string;
  };
  query?: {
    usercontribs?: Array<{
      userid: number;
      user: string;
      pageid: number;
      revid: number;
      parentid: number;
      ns: number;
      title: string;
      timestamp: string;
      comment: string;
      size: number;
    }>;
  };
  batchcomplete?: string;
}

export class FandomRoleManager {
  /**
   * Fetch user edit count and determine appropriate edit count roles
   */
  private static async getUserEditCount(
    fandomUsername: string,
  ): Promise<EditCountResult> {
    try {
      // First request: 499 limit
      const firstUrl = `https://alter-ego.fandom.com/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(fandomUsername)}&ucnamespace=0&uclimit=499&ucprop=ids&format=json`;
      const firstResponse = await fetch(firstUrl);

      if (!firstResponse.ok) {
        throw new Error(`API request failed: ${firstResponse.status}`);
      }

      const firstData = (await firstResponse.json()) as FandomContribsResponse;

      // If no continue, user has <499
      if (!firstData.continue) {
        // Make 249 limit request to check for 250
        const smallUrl = `https://alter-ego.fandom.com/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(fandomUsername)}&ucnamespace=0&uclimit=249&ucprop=ids&format=json`;
        const smallResponse = await fetch(smallUrl);

        if (!smallResponse.ok) {
          throw new Error(`API request failed: ${smallResponse.status}`);
        }

        const smallData =
          (await smallResponse.json()) as FandomContribsResponse;

        if (smallData.continue) {
          // Has continue with 249 limit >= 250
          return {
            rolesToGrant: [EDIT_COUNT_ROLES.EDITS_250],
          };
        } else {
          // No continue with 249 limit = <250
          return {
            rolesToGrant: [],
          };
        }
      }

      // Has continue from first request, user has >=499 edits
      // Make second 499 limit request
      const continueToken = firstData.continue.uccontinue;
      const secondUrl = `https://alter-ego.fandom.com/api.php?action=query&list=usercontribs&ucuser=${encodeURIComponent(fandomUsername)}&ucnamespace=0&uclimit=499&ucprop=ids&uccontinue=${encodeURIComponent(continueToken)}&format=json`;
      const secondResponse = await fetch(secondUrl);

      if (!secondResponse.ok) {
        throw new Error(`API request failed: ${secondResponse.status}`);
      }

      const secondData =
        (await secondResponse.json()) as FandomContribsResponse;

      if (secondData.continue) {
        // Second has continue = >=1000 edits
        return {
          rolesToGrant: [
            EDIT_COUNT_ROLES.EDITS_1000,
            EDIT_COUNT_ROLES.EDITS_250,
          ],
        };
      } else {
        // Second has no continue = 499-999 edits
        return {
          rolesToGrant: [EDIT_COUNT_ROLES.EDITS_250],
        };
      }
    } catch (error) {
      console.error(`Error fetching edit count for ${fandomUsername}:`, error);
      return {
        rolesToGrant: [],
      };
    }
  }

  /**
   * Manages Fandom roles for a guild member based on their Fandom groups
   * Grants appropriate roles and removes outdated ones
   */
  public static async manageFandomRoles(
    member: GuildMember,
    fandomGroups: string[],
    guild: Guild | null,
    fandomUsername?: string,
  ): Promise<RoleSyncResult> {
    const rolesToGrantIds: string[] = [];
    const grantedRoleNames: string[] = [];
    const failedRoleNames: string[] = [];
    let hasStaffRole = false;

    rolesToGrantIds.push(LINKED_ROLE_ID);

    // roles based on Fandom groups
    for (const group of fandomGroups) {
      const roleId = FANDOM_ROLE_MAP[group.toLowerCase()];
      if (roleId) {
        rolesToGrantIds.push(roleId);
        hasStaffRole = true;
      }
    }

    if (hasStaffRole) {
      rolesToGrantIds.push(STAFF_ROLE_ID);
    }

    if (fandomUsername) {
      const editCountResult = await this.getUserEditCount(fandomUsername);
      rolesToGrantIds.push(...editCountResult.rolesToGrant);
    }

    // Remove outdated roles
    const rolesToRemoveFromMember: string[] = [];
    member.roles.cache.forEach((role) => {
      if (
        (FANDOM_ROLE_IDS.includes(role.id) ||
          EDIT_COUNT_ROLE_IDS.includes(role.id) ||
          role.id === STAFF_ROLE_ID) &&
        !rolesToGrantIds.includes(role.id) &&
        !(
          role.id === STAFF_ROLE_ID &&
          member.roles.cache.has(WIKI_SYNC_ROLES.DICTATOR)
        )
      ) {
        rolesToRemoveFromMember.push(role.id);
      }
    });

    if (rolesToRemoveFromMember.length > 0) {
      try {
        await member.roles.remove(rolesToRemoveFromMember);
      } catch (error) {
        console.error("Error removing roles from member:", error);
      }
    }

    // Grant new roles
    for (const roleId of rolesToGrantIds) {
      if (member.roles.cache.has(roleId)) {
        const role = guild?.roles.cache.get(roleId);
        if (role) grantedRoleNames.push(role.name);
        continue;
      }

      try {
        await member.roles.add(roleId);
        const role = guild?.roles.cache.get(roleId);
        if (role) grantedRoleNames.push(role.name);
      } catch (error) {
        const role = guild?.roles.cache.get(roleId);
        if (role) failedRoleNames.push(role.name);
      }
    }

    return { grantedRoleNames, failedRoleNames };
  }

  /**
   * Create role mention strings for display in embeds
   */
  public static createRoleMentions(
    roleNames: string[],
    guild: Guild | null,
  ): string {
    return roleNames
      .map((name) => {
        const linkedRole = guild?.roles.cache.get(LINKED_ROLE_ID);
        if (linkedRole && linkedRole.name === name) {
          return `<@&${LINKED_ROLE_ID}>`;
        }

        const topRole = guild?.roles.cache.get(TOP_CONTRIBUTORS_ROLE_ID);
        if (topRole && topRole.name === name) {
          return `<@&${TOP_CONTRIBUTORS_ROLE_ID}>`;
        }

        const staffRole = guild?.roles.cache.get(STAFF_ROLE_ID);
        if (staffRole && staffRole.name === name) {
          return `<@&${STAFF_ROLE_ID}>`;
        }

        const editRole250 = guild?.roles.cache.get(EDIT_COUNT_ROLES.EDITS_250);
        if (editRole250 && editRole250.name === name) {
          return `<@&${EDIT_COUNT_ROLES.EDITS_250}>`;
        }

        const editRole1000 = guild?.roles.cache.get(
          EDIT_COUNT_ROLES.EDITS_1000,
        );
        if (editRole1000 && editRole1000.name === name) {
          return `<@&${EDIT_COUNT_ROLES.EDITS_1000}>`;
        }

        const roleEntry = Object.entries(FANDOM_ROLE_MAP).find(
          ([, id]) => guild?.roles.cache.get(id)?.name === name,
        );
        return roleEntry ? `<@&${roleEntry[1]}>` : `\`${name}\``;
      })
      .join(", ");
  }
}
