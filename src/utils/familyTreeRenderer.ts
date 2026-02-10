import { createCanvas, loadImage, CanvasRenderingContext2D } from "canvas";
import { User } from "discord.js";

interface TreeNode {
  user: User;
  level: number;
  x: number;
  y: number;
  children: TreeNode[];
  spouses?: User[];
  parents: TreeNode[];
  siblings: TreeNode[];
}

interface RelationshipConnection {
  from: { x: number; y: number };
  to: { x: number; y: number };
  type: "spouse" | "parent" | "child" | "sibling";
  targetUser: User;
}

interface UniqueNode {
  user: User;
  x: number;
  y: number;
  isRoot: boolean;
}

export class FamilyTreeRenderer {
  private static readonly NODE_WIDTH = 350;
  private static readonly NODE_HEIGHT = 120;
  private static readonly HORIZONTAL_SPACING = 120;
  private static readonly VERTICAL_SPACING = 180;
  private static readonly AVATAR_SIZE = 80;
  private static readonly MIN_CANVAS_WIDTH = 1920;
  private static readonly MIN_CANVAS_HEIGHT = 1080;
  private static readonly PADDING = 50;

  private static readonly RELATIONSHIP_COLORS = {
    spouse: {
      start: "#FF6B9D",
      end: "#C44569",
    },
    parent: {
      start: "#4FACFE",
      end: "#00F2FE",
    },
    child: {
      start: "#43E97B",
      end: "#38F9D7",
    },
    sibling: {
      start: "#A770EF",
      end: "#CF8BF3",
    },
  };

  private static readonly BACKGROUND_GRADIENT = {
    start: "#000000",
    middle: "#1A1A1A",
    end: "#2D2D2D",
  };

  public static async generateTree(
    rootUser: User,
    relationships: {
      spouses: User[];
      parents: User[];
      children: User[];
      siblings: User[];
    },
  ): Promise<Buffer> {
    const tree = this.buildTreeStructure(rootUser, relationships);

    // Calculate required canvas size based on tree content
    const bounds = this.calculateTreeBounds(tree);
    const { width, height } = this.calculateCanvasSize(bounds);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    this.drawModernBackground(ctx, width, height);
    await this.drawTree(ctx, tree, relationships);

    return canvas.toBuffer("image/png");
  }

  private static calculateTreeBounds(node: TreeNode): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    this.calculatePositions(node);

    let minX = node.x - this.NODE_WIDTH / 2;
    let maxX = node.x + this.NODE_WIDTH / 2;
    let minY = node.y;
    let maxY = node.y + this.NODE_HEIGHT;

    node.parents.forEach((parent) => {
      const parentLeft = parent.x - this.NODE_WIDTH / 2;
      const parentRight = parent.x + this.NODE_WIDTH / 2;
      minX = Math.min(minX, parentLeft);
      maxX = Math.max(maxX, parentRight);
      minY = Math.min(minY, parent.y);
    });

    node.siblings.forEach((sibling) => {
      const siblingLeft = sibling.x - this.NODE_WIDTH / 2;
      const siblingRight = sibling.x + this.NODE_WIDTH / 2;
      minX = Math.min(minX, siblingLeft);
      maxX = Math.max(maxX, siblingRight);
    });

    node.children.forEach((child) => {
      const childLeft = child.x - this.NODE_WIDTH / 2;
      const childRight = child.x + this.NODE_WIDTH / 2;
      minX = Math.min(minX, childLeft);
      maxX = Math.max(maxX, childRight);
      maxY = Math.max(maxY, child.y + this.NODE_HEIGHT);
    });

    if (node.spouses && node.spouses.length > 0) {
      const spouseCount = node.spouses.length;
      const spouseWidth =
        (this.NODE_WIDTH + this.HORIZONTAL_SPACING) * spouseCount;
      maxX = Math.max(
        maxX,
        node.x + this.NODE_WIDTH / 2 + this.HORIZONTAL_SPACING + spouseWidth,
      );
    }

    return { minX, maxX, minY, maxY };
  }

  private static calculateCanvasSize(bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }): { width: number; height: number } {
    const requiredWidth = bounds.maxX - bounds.minX + this.PADDING * 2;
    const requiredHeight = bounds.maxY - bounds.minY + this.PADDING * 2;

    let width = Math.max(this.MIN_CANVAS_WIDTH, requiredWidth);
    let height = Math.max(this.MIN_CANVAS_HEIGHT, requiredHeight);

    const targetRatio = 16 / 9;
    const currentRatio = width / height;

    if (currentRatio > targetRatio) {
      height = width / targetRatio;
    } else if (currentRatio < targetRatio) {
      width = height * targetRatio;
    }

    return {
      width: Math.ceil(width),
      height: Math.ceil(height),
    };
  }

  private static drawModernBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, this.BACKGROUND_GRADIENT.start);
    gradient.addColorStop(0.5, this.BACKGROUND_GRADIENT.middle);
    gradient.addColorStop(1, this.BACKGROUND_GRADIENT.end);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;

    const gridSize = 50;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    ctx.beginPath();
    ctx.arc(100, 100, 200, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(width - 150, height - 150, 250, 0, Math.PI * 2);
    ctx.fill();
  }

  private static buildTreeStructure(
    rootUser: User,
    relationships: {
      spouses: User[];
      parents: User[];
      children: User[];
      siblings: User[];
    },
  ): TreeNode {
    const rootNode: TreeNode = {
      user: rootUser,
      level: 0,
      x: 0,
      y: 0,
      children: [],
      parents: [],
      siblings: [],
      spouses: relationships.spouses || [],
    };

    rootNode.parents = relationships.parents.map((parent) => ({
      user: parent,
      level: -1,
      x: 0,
      y: 0,
      children: [rootNode],
      parents: [],
      siblings: [],
    }));

    rootNode.siblings = relationships.siblings.map((sibling) => ({
      user: sibling,
      level: 0,
      x: 0,
      y: 0,
      children: [],
      parents: [],
      siblings: [],
    }));

    rootNode.children = relationships.children.map((child) => ({
      user: child,
      level: 1,
      x: 0,
      y: 0,
      children: [],
      parents: [rootNode],
      siblings: [],
    }));

    return rootNode;
  }

  private static async drawTree(
    ctx: CanvasRenderingContext2D,
    tree: TreeNode,
    relationships: {
      spouses: User[];
      parents: User[];
      children: User[];
      siblings: User[];
    },
  ): Promise<void> {
    this.calculatePositions(tree);
    const uniqueNodes = this.collectUniqueNodes(tree);
    const connections = this.collectConnections(
      tree,
      uniqueNodes,
      relationships,
      [],
    );

    this.drawConnections(ctx, connections);
    await this.drawUniqueNodes(ctx, uniqueNodes);
  }

  private static collectUniqueNodes(node: TreeNode): Map<string, UniqueNode> {
    const uniqueNodes = new Map<string, UniqueNode>();

    uniqueNodes.set(node.user.id, {
      user: node.user,
      x: node.x - this.NODE_WIDTH / 2,
      y: node.y,
      isRoot: true,
    });

    node.parents.forEach((parent) => {
      if (!uniqueNodes.has(parent.user.id)) {
        uniqueNodes.set(parent.user.id, {
          user: parent.user,
          x: parent.x - this.NODE_WIDTH / 2,
          y: parent.y,
          isRoot: false,
        });
      }
    });

    node.siblings.forEach((sibling) => {
      if (!uniqueNodes.has(sibling.user.id)) {
        uniqueNodes.set(sibling.user.id, {
          user: sibling.user,
          x: sibling.x - this.NODE_WIDTH / 2,
          y: sibling.y,
          isRoot: false,
        });
      }
    });

    node.children.forEach((child) => {
      uniqueNodes.set(child.user.id, {
        user: child.user,
        x: child.x - this.NODE_WIDTH / 2,
        y: child.y,
        isRoot: false,
      });
    });

    const occupiedPositions = new Set<number>();
    uniqueNodes.forEach((nodeData) => {
      if (nodeData.y === node.y) {
        occupiedPositions.add(nodeData.x);
      }
    });

    let spouseIndex = 0;
    node.spouses?.forEach((spouse) => {
      if (!uniqueNodes.has(spouse.id)) {
        let spouseX: number;
        let attempts = 0;
        const maxAttempts = 20;

        do {
          spouseX =
            node.x +
            this.NODE_WIDTH / 2 +
            this.HORIZONTAL_SPACING +
            (this.NODE_WIDTH + this.HORIZONTAL_SPACING) *
              (spouseIndex + attempts);
          attempts++;
        } while (occupiedPositions.has(spouseX) && attempts < maxAttempts);

        uniqueNodes.set(spouse.id, {
          user: spouse,
          x: spouseX,
          y: node.y,
          isRoot: false,
        });

        occupiedPositions.add(spouseX);
        spouseIndex++;
      }
    });

    return uniqueNodes;
  }

  private static calculatePositions(node: TreeNode): void {
    const hasParents = node.parents.length > 0;
    const hasChildren = node.children.length > 0;

    let levels = 1;
    if (hasParents) levels++;
    if (hasChildren) levels++;

    const totalHeight = levels * (this.NODE_HEIGHT + this.VERTICAL_SPACING);

    const rootLevelNodes =
      1 + node.siblings.length + (node.spouses?.length || 0);
    const minWidth =
      rootLevelNodes * (this.NODE_WIDTH + this.HORIZONTAL_SPACING);

    const canvasWidth = Math.max(this.MIN_CANVAS_WIDTH, minWidth);
    const canvasHeight = Math.max(this.MIN_CANVAS_HEIGHT, totalHeight);

    const startY = (canvasHeight - totalHeight) / 2 + this.VERTICAL_SPACING;
    const centerX = canvasWidth / 2;

    let rootY = startY;
    if (hasParents) {
      rootY = startY + this.NODE_HEIGHT + this.VERTICAL_SPACING;
    }

    node.x = centerX;
    node.y = rootY;

    if (node.parents.length > 0) {
      const parentSpacing = this.NODE_WIDTH + this.HORIZONTAL_SPACING;
      const parentStartX =
        centerX - ((node.parents.length - 1) * parentSpacing) / 2;
      node.parents.forEach((parent, index) => {
        parent.x = parentStartX + index * parentSpacing;
        parent.y = startY;
      });
    }

    const siblingSpacing = this.NODE_WIDTH + this.HORIZONTAL_SPACING;
    const siblingsPerSide = Math.ceil(node.siblings.length / 2);
    node.siblings.forEach((sibling, index) => {
      if (index < siblingsPerSide) {
        sibling.x = centerX - (siblingsPerSide - index) * siblingSpacing;
      } else {
        sibling.x = centerX + (index - siblingsPerSide + 1) * siblingSpacing;
      }
      sibling.y = rootY;
    });

    if (node.children.length > 0) {
      const childSpacing = this.NODE_WIDTH + this.HORIZONTAL_SPACING;
      const childStartX =
        centerX - ((node.children.length - 1) * childSpacing) / 2;
      node.children.forEach((child, index) => {
        child.x = childStartX + index * childSpacing;
        child.y = rootY + this.NODE_HEIGHT + this.VERTICAL_SPACING;
      });
    }
  }

  private static collectConnections(
    node: TreeNode,
    uniqueNodes: Map<string, UniqueNode>,
    relationships: {
      spouses: User[];
      parents: User[];
      children: User[];
      siblings: User[];
    },
    debugInfo: string[],
  ): RelationshipConnection[] {
    const connections: RelationshipConnection[] = [];
    const rootNode = uniqueNodes.get(node.user.id)!;
    const rootCenterX = rootNode.x + this.NODE_WIDTH / 2;
    const rootCenterY = rootNode.y + this.NODE_HEIGHT / 2;
    const rootBottom = rootNode.y + this.NODE_HEIGHT;
    const rootRight = rootNode.x + this.NODE_WIDTH;

    relationships.parents.forEach((parent) => {
      const parentNode = uniqueNodes.get(parent.id);
      if (parentNode) {
        const parentCenterX = parentNode.x + this.NODE_WIDTH / 2;
        const parentBottom = parentNode.y + this.NODE_HEIGHT;
        connections.push({
          from: { x: rootCenterX, y: rootNode.y },
          to: { x: parentCenterX, y: parentBottom },
          type: "parent",
          targetUser: parent,
        });
      }
    });

    relationships.siblings.forEach((sibling) => {
      const siblingNode = uniqueNodes.get(sibling.id);
      if (siblingNode) {
        const siblingCenterX = siblingNode.x + this.NODE_WIDTH / 2;
        const siblingCenterY = siblingNode.y + this.NODE_HEIGHT / 2;
        connections.push({
          from: { x: rootCenterX, y: rootCenterY },
          to: { x: siblingCenterX, y: siblingCenterY },
          type: "sibling",
          targetUser: sibling,
        });
      }
    });

    relationships.children.forEach((child) => {
      const childNode = uniqueNodes.get(child.id);
      if (childNode) {
        const childCenterX = childNode.x + this.NODE_WIDTH / 2;
        const childTop = childNode.y;
        const childCenterY = childNode.y + this.NODE_HEIGHT / 2;

        if (Math.abs(childNode.y - rootNode.y) < 10) {
          connections.push({
            from: { x: rootRight, y: rootCenterY },
            to: { x: childNode.x, y: childCenterY },
            type: "child",
            targetUser: child,
          });
        } else {
          connections.push({
            from: { x: rootCenterX, y: rootBottom },
            to: { x: childCenterX, y: childTop },
            type: "child",
            targetUser: child,
          });
        }
      }
    });

    relationships.spouses.forEach((spouse) => {
      const spouseNode = uniqueNodes.get(spouse.id);
      if (spouseNode) {
        const spouseCenterY = spouseNode.y + this.NODE_HEIGHT / 2;
        connections.push({
          from: { x: rootRight, y: rootCenterY },
          to: { x: spouseNode.x, y: spouseCenterY },
          type: "spouse",
          targetUser: spouse,
        });
      }
    });

    return connections;
  }

  private static drawConnections(
    ctx: CanvasRenderingContext2D,
    connections: RelationshipConnection[],
  ): void {
    const connectionsByTarget = new Map<string, RelationshipConnection[]>();

    connections.forEach((conn) => {
      const targetId = conn.targetUser.id;
      const group = connectionsByTarget.get(targetId) || [];
      group.push(conn);
      connectionsByTarget.set(targetId, group);
    });

    connectionsByTarget.forEach((group) => {
      if (group.length === 1) {
        this.drawSingleConnection(ctx, group[0]);
      } else {
        this.drawMultipleConnections(ctx, group);
      }
    });
  }

  private static drawSingleConnection(
    ctx: CanvasRenderingContext2D,
    conn: RelationshipConnection,
  ): void {
    const colors = this.RELATIONSHIP_COLORS[conn.type];
    const gradient = ctx.createLinearGradient(
      conn.from.x,
      conn.from.y,
      conn.to.x,
      conn.to.y,
    );
    gradient.addColorStop(0, colors.start);
    gradient.addColorStop(1, colors.end);

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";

    if (conn.type === "sibling") {
      ctx.setLineDash([10, 8]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.shadowColor = colors.start;
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.moveTo(conn.from.x, conn.from.y);
    ctx.lineTo(conn.to.x, conn.to.y);
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  private static drawMultipleConnections(
    ctx: CanvasRenderingContext2D,
    connections: RelationshipConnection[],
  ): void {
    const offset = 10;

    connections.forEach((conn, index) => {
      const lineOffset = (index - (connections.length - 1) / 2) * offset;
      const colors = this.RELATIONSHIP_COLORS[conn.type];

      const dx = conn.to.x - conn.from.x;
      const dy = conn.to.y - conn.from.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const perpX = (-dy / length) * lineOffset;
      const perpY = (dx / length) * lineOffset;

      const fromX = conn.from.x + perpX;
      const fromY = conn.from.y + perpY;
      const toX = conn.to.x + perpX;
      const toY = conn.to.y + perpY;

      const gradient = ctx.createLinearGradient(fromX, fromY, toX, toY);
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(1, colors.end);

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 4;
      ctx.lineCap = "round";

      if (conn.type === "sibling") {
        ctx.setLineDash([10, 8]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.shadowColor = colors.start;
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      ctx.shadowBlur = 0;
    });
  }

  private static async drawUniqueNodes(
    ctx: CanvasRenderingContext2D,
    uniqueNodes: Map<string, UniqueNode>,
  ): Promise<void> {
    for (const [_userId, nodeData] of uniqueNodes) {
      await this.drawUserCard(
        ctx,
        nodeData.user,
        nodeData.x,
        nodeData.y,
        nodeData.isRoot,
      );
    }
  }

  private static async drawUserCard(
    ctx: CanvasRenderingContext2D,
    user: User,
    x: number,
    y: number,
    isRoot: boolean,
  ): Promise<void> {
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 25;
    ctx.shadowOffsetY = 10;

    if (isRoot) {
      const gradient = ctx.createLinearGradient(
        x,
        y,
        x + this.NODE_WIDTH,
        y + this.NODE_HEIGHT,
      );
      gradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
      gradient.addColorStop(1, "rgba(124, 124, 124, 0.25)");
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    }

    this.roundRect(ctx, x, y, this.NODE_WIDTH, this.NODE_HEIGHT, 20);
    ctx.fill();

    if (isRoot) {
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 2;
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    try {
      const avatarUrl = user.displayAvatarURL({ extension: "png", size: 128 });
      const avatar = await loadImage(avatarUrl);

      const avatarX = x + 15;
      const avatarY = y + (this.NODE_HEIGHT - this.AVATAR_SIZE) / 2;

      if (isRoot) {
        ctx.shadowColor = "#FFFFFF";
        ctx.shadowBlur = 20;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        avatarX + this.AVATAR_SIZE / 2,
        avatarY + this.AVATAR_SIZE / 2,
        this.AVATAR_SIZE / 2,
        0,
        Math.PI * 2,
      );
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(
        avatar,
        avatarX,
        avatarY,
        this.AVATAR_SIZE,
        this.AVATAR_SIZE,
      );
      ctx.restore();

      if (isRoot) {
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 2;
      }

      ctx.beginPath();
      ctx.arc(
        avatarX + this.AVATAR_SIZE / 2,
        avatarY + this.AVATAR_SIZE / 2,
        this.AVATAR_SIZE / 2,
        0,
        Math.PI * 2,
      );
      ctx.stroke();

      ctx.shadowBlur = 0;
    } catch (error) {
      console.error("Failed to load avatar:", error);
      ctx.fillStyle = "#888888";
      ctx.beginPath();
      ctx.arc(
        x + 15 + this.AVATAR_SIZE / 2,
        y + this.NODE_HEIGHT / 2,
        this.AVATAR_SIZE / 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 32px Verdana, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const textX = x + this.AVATAR_SIZE + 30;
    const maxTextWidth = this.NODE_WIDTH - this.AVATAR_SIZE - 50;
    let username = user.username;

    while (
      ctx.measureText(username).width > maxTextWidth &&
      username.length > 0
    ) {
      username = username.slice(0, -1);
    }
    if (username.length < user.username.length) {
      username = username + "...";
    }

    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 6;

    const hasDiscriminator = user.discriminator !== "0";
    const usernameY = hasDiscriminator
      ? y + this.NODE_HEIGHT / 2 - 12
      : y + this.NODE_HEIGHT / 2;

    ctx.fillText(username, textX, usernameY);
    ctx.shadowBlur = 0;

    if (hasDiscriminator) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = `20px Verdana, sans-serif`;
      ctx.fillText(
        `#${user.discriminator}`,
        textX,
        y + this.NODE_HEIGHT / 2 + 16,
      );
    }
  }

  private static roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
