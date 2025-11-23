import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

export interface FamilyRelationship {
  userId: string;
  relationshipType: "spouse" | "parent" | "child" | "sibling";
  relatedUserId: string;
  establishedAt: string;
  guildId: string;
}

export interface FamilyData {
  relationships: FamilyRelationship[];
}

export class FamilyManager {
  private static readonly DATA_DIR = "data";
  private static readonly FAMILY_FILE = `${this.DATA_DIR}/family.json`;

  private static async ensureDataDir(): Promise<void> {
    if (!existsSync(this.DATA_DIR)) {
      await mkdir(this.DATA_DIR, { recursive: true });
    }
  }

  private static async loadData(): Promise<FamilyData> {
    await this.ensureDataDir();

    if (!existsSync(this.FAMILY_FILE)) {
      return { relationships: [] };
    }

    const data = await readFile(this.FAMILY_FILE, "utf-8");
    return JSON.parse(data);
  }

  private static async saveData(data: FamilyData): Promise<void> {
    await this.ensureDataDir();
    await writeFile(this.FAMILY_FILE, JSON.stringify(data, null, 2));
  }

  public static async getUserRelationships(
    userId: string,
  ): Promise<FamilyRelationship[]> {
    const data = await this.loadData();
    return data.relationships.filter(
      (rel) => rel.userId === userId || rel.relatedUserId === userId,
    );
  }

  public static async getRelationship(
    userId: string,
    relatedUserId: string,
    type: FamilyRelationship["relationshipType"],
  ): Promise<FamilyRelationship | null> {
    const data = await this.loadData();
    return (
      data.relationships.find(
        (rel) =>
          rel.userId === userId &&
          rel.relatedUserId === relatedUserId &&
          rel.relationshipType === type,
      ) || null
    );
  }

  public static async hasRelationship(
    userId: string,
    relatedUserId: string,
  ): Promise<boolean> {
    const data = await this.loadData();
    return data.relationships.some(
      (rel) =>
        (rel.userId === userId && rel.relatedUserId === relatedUserId) ||
        (rel.userId === relatedUserId && rel.relatedUserId === userId),
    );
  }

  public static async getSpouses(userId: string): Promise<string[]> {
    const data = await this.loadData();
    const spouses = new Set<string>();

    for (const rel of data.relationships) {
      if (rel.relationshipType === "spouse") {
        if (rel.userId === userId) {
          spouses.add(rel.relatedUserId);
        } else if (rel.relatedUserId === userId) {
          spouses.add(rel.userId);
        }
      }
    }

    return Array.from(spouses);
  }

  public static async getChildren(userId: string): Promise<string[]> {
    const data = await this.loadData();
    return data.relationships
      .filter(
        (rel) => rel.relationshipType === "parent" && rel.userId === userId,
      )
      .map((rel) => rel.relatedUserId);
  }

  public static async getParents(userId: string): Promise<string[]> {
    const data = await this.loadData();
    return data.relationships
      .filter(
        (rel) =>
          rel.relationshipType === "parent" && rel.relatedUserId === userId,
      )
      .map((rel) => rel.userId);
  }

  public static async getSiblings(userId: string): Promise<string[]> {
    const data = await this.loadData();
    const siblings = new Set<string>();

    for (const rel of data.relationships) {
      if (rel.relationshipType === "sibling") {
        if (rel.userId === userId) {
          siblings.add(rel.relatedUserId);
        } else if (rel.relatedUserId === userId) {
          siblings.add(rel.userId);
        }
      }
    }

    return Array.from(siblings);
  }

  public static async addRelationship(
    userId: string,
    relatedUserId: string,
    type: FamilyRelationship["relationshipType"],
    guildId: string,
  ): Promise<void> {
    const data = await this.loadData();

    data.relationships.push({
      userId,
      relatedUserId,
      relationshipType: type,
      establishedAt: new Date().toISOString(),
      guildId,
    });

    if (type === "spouse" || type === "sibling") {
      data.relationships.push({
        userId: relatedUserId,
        relatedUserId: userId,
        relationshipType: type,
        establishedAt: new Date().toISOString(),
        guildId,
      });
    }

    if (type === "parent") {
      data.relationships.push({
        userId: relatedUserId,
        relatedUserId: userId,
        relationshipType: "child",
        establishedAt: new Date().toISOString(),
        guildId,
      });
    }

    await this.saveData(data);
  }

  public static async removeRelationship(
    userId: string,
    relatedUserId: string,
    type: FamilyRelationship["relationshipType"],
  ): Promise<void> {
    const data = await this.loadData();

    data.relationships = data.relationships.filter(
      (rel) =>
        !(
          ((rel.userId === userId && rel.relatedUserId === relatedUserId) ||
            (rel.userId === relatedUserId && rel.relatedUserId === userId)) &&
          rel.relationshipType === type
        ),
    );

    if (type === "parent") {
      data.relationships = data.relationships.filter(
        (rel) =>
          !(
            ((rel.userId === userId && rel.relatedUserId === relatedUserId) ||
              (rel.userId === relatedUserId && rel.relatedUserId === userId)) &&
            rel.relationshipType === "child"
          ),
      );
    }

    await this.saveData(data);
  }

  public static async removeAllRelationships(userId: string): Promise<void> {
    const data = await this.loadData();
    data.relationships = data.relationships.filter(
      (rel) => rel.userId !== userId && rel.relatedUserId !== userId,
    );
    await this.saveData(data);
  }
}
