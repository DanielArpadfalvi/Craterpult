import type { OnlineParams, TurnOutcome, TurnRecord } from '../core/online';

export type OnlineStatus = 'open' | 'active' | 'finished';

/** A match as the signed-in player sees it (the backend's row, plus their seat). */
export interface OnlineMatch {
  id: string;
  /** Six-character invite code (shown while the match is open). */
  code: string;
  status: OnlineStatus;
  params: OnlineParams;
  /** Team names (index = team); null while that seat is free. */
  names: (string | null)[];
  /** Team the signed-in player controls. The creator waits as team 1; whoever joins moves first. */
  myTeam: number;
  /** Turns stored so far (= index of the next turn). */
  turnCount: number;
  /** Team to move, or -1 while open / once finished. */
  nextTeam: number;
  /** Winning team (-1 = draw) once finished, else null. */
  winner: number | null;
  /** Team that resigned, or null. */
  resigned: number | null;
  /** Last change, ms since the epoch (sorting only). */
  updatedAt: number;
  /** Id of the rematch offered after this (finished) match, or null. */
  rematch: string | null;
  /** Team (in this match) that offered the rematch, or null. */
  rematchBy: number | null;
}

export type OnlineErrorCode =
  | 'unavailable'
  | 'network'
  | 'auth'
  | 'notFound'
  | 'full'
  | 'ownMatch'
  | 'notYourTurn'
  | 'conflict'
  | 'protocol';

export class OnlineError extends Error {
  constructor(
    readonly code: OnlineErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'OnlineError';
  }
}

/**
 * The asynchronous match service (M9). The backend never simulates: it stores the parameters,
 * the turns and who moves next, checks that only the right player submits the right turn, and
 * pushes a notification to the opponent. Implementations: Supabase (`supabase.ts`) on device,
 * a localStorage mock (`mock.ts`) for web development and tests.
 */
export interface OnlineService {
  /** False when the build has no backend configured (the UI then explains it). */
  readonly available: boolean;
  /** Signs in (anonymously, once per install) and returns the player id. */
  signIn(): Promise<string>;
  /** Opens a match for a friend to join with the returned code. */
  createMatch(params: OnlineParams, name: string): Promise<OnlineMatch>;
  joinMatch(code: string, name: string): Promise<OnlineMatch>;
  /** The player's matches, newest change first. */
  listMatches(): Promise<OnlineMatch[]>;
  getMatch(id: string): Promise<OnlineMatch>;
  /** Turns from index `from` on, in order. */
  getTurns(id: string, from: number): Promise<TurnRecord[]>;
  submitTurn(id: string, turn: TurnRecord, outcome: TurnOutcome): Promise<OnlineMatch>;
  resign(id: string): Promise<OnlineMatch>;
  /**
   * Rematch of a finished match, with fresh `params` (same rules as `createMatch`, but only the
   * old opponent may join). The first player to ask opens it and waits; when the opponent asks
   * too they join it and move first. Returns the rematch.
   */
  rematch(id: string, params: OnlineParams, name: string): Promise<OnlineMatch>;
  /** Removes an open match nobody joined yet (creator only). */
  cancel(id: string): Promise<void>;
  /** Device token for "your turn" pushes (FCM / APNs) and the language of their text. */
  registerPushToken(token: string, platform: 'android' | 'ios', lang: string): Promise<void>;
}

export function isMyTurn(m: OnlineMatch): boolean {
  return m.status === 'active' && m.nextTeam === m.myTeam;
}

/** The opponent offered a rematch of this match that the player has not taken up yet. */
export function rematchOffered(m: OnlineMatch): boolean {
  return m.status === 'finished' && m.rematch !== null && m.rematchBy !== m.myTeam;
}

export function opponentName(m: OnlineMatch): string | null {
  return m.names[1 - m.myTeam] ?? null;
}
