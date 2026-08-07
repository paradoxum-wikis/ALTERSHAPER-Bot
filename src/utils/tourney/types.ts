export const TOURNEY_OWNER_ID = "380694434980954114";

export const CONFERENCE = {
  exo: { id: "exo", name: "Exo", color: 0xab06fa },
  two_x: { id: "two_x", name: "Two X", color: 0xf6f004 },
} as const;

export type ConferenceId = keyof typeof CONFERENCE;
export type SubgroupId = 1 | 2 | 3 | 4;
export type RoundId = "r16" | "qf" | "semi" | "final";

export type TourneyPhase =
  | "setup_roster"
  | "setup_ref_picks"
  | "ready"
  | "betting"
  | "playing"
  | "complete"
  | "aborted";

export type RefereeArcanaId =
  | "fool"
  | "empress"
  | "emperor"
  | "wheel"
  | "death"
  | "tower";

export const REFEREE_ARCANAS: RefereeArcanaId[] = [
  "fool",
  "empress",
  "emperor",
  "wheel",
  "death",
  "tower",
];

export const ROUND_ARCANA: Record<
  RoundId,
  "star" | "justice" | "judgement" | "world"
> = {
  r16: "star",
  qf: "justice",
  semi: "judgement",
  final: "world",
};

export const ARCANA_LEVEL: Record<RoundId, 0 | 1 | 2 | 3> = {
  r16: 0,
  qf: 1,
  semi: 2,
  final: 3,
};

export const SUBGROUP_CONFERENCE: Record<SubgroupId, ConferenceId> = {
  1: "exo",
  2: "exo",
  3: "two_x",
  4: "two_x",
};

export interface TourneyPlayer {
  userId: string;
  tag: string;
  displayName: string;
}

export interface RefPick {
  userId: string;
  refIndex: number;
  subgroup: SubgroupId;
  arcana: RefereeArcanaId;
}

export interface FighterGameScore {
  damageDealt: number;
  hpRemaining: number;
  maxHp: number;
}

export interface GameResult {
  gameIndex: number;
  winnerId: string;
  loserId: string;
  turns: number;
  scores: Record<string, FighterGameScore>;
  playedAt: string;
}

export interface SeriesBet {
  userId: string;
  pickId: string;
}

export type SeriesStatus =
  | "pending"
  | "betting"
  | "ready"
  | "in_progress"
  | "complete";

export interface SeriesState {
  id: string;
  round: RoundId;
  subgroup?: SubgroupId;
  conference?: ConferenceId;
  slotA?: number;
  slotB?: number;
  feedsFrom?: [string, string];
  fighterAId: string | null;
  fighterBId: string | null;
  winsNeeded: number;
  wins: Record<string, number>;
  games: GameResult[];
  bets: SeriesBet[];
  betsClosedAt?: string;
  winnerId?: string;
  status: SeriesStatus;
  refIds: string[];
}

export interface TourneyAwards {
  tournamentChampion?: string;
  exoChampion?: string;
  twoXChampion?: string;
  manOfTheTournament?: string;
  gamblingAddict?: string;
  refOfTheTournament?: string;
}

export type TourneyLogKind =
  | "created"
  | "roster"
  | "ref_pick"
  | "seeded"
  | "bets_opened"
  | "bets_closed"
  | "game"
  | "series"
  | "awards"
  | "complete"
  | "aborted"
  | "note";

export interface TourneyLogEntry {
  at: string;
  kind: TourneyLogKind;
  detail?: unknown;
}

export interface TourneyState {
  id: string;
  guildId: string;
  createdAt: string;
  updatedAt: string;
  phase: TourneyPhase;
  combatants: TourneyPlayer[];
  referees: TourneyPlayer[];
  refPicks: RefPick[];
  slots: string[];
  series: SeriesState[];
  motScores: Record<string, number>;
  betPoints: Record<string, number>;
  refGamesOfficiated: Record<string, number>;
  currentSeriesId?: string;
  awards?: TourneyAwards;
  log: TourneyLogEntry[];
}

export interface TourneyLogFile {
  version: 1;
  active: Record<string, TourneyState>;
  history: TourneyState[];
}
