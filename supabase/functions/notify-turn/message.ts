// Who gets which push for a match change (pure: shared by the edge function and unit tests).

export type NotifyKind = 'turn' | 'rematch' | 'reminder';

export interface NotifyMatch {
  status: string;
  players: (string | null)[];
  names: (string | null)[];
  next_team: number;
  rematch: string | null;
  rematch_by: number | null;
}

export interface NotifyPlan {
  /** Player (auth user id) to notify. */
  to: string;
  /** Notification text in the app language the token was registered with (EN / HU). */
  text(lang: string): string;
}

/** The push to send for `kind`, or null when the match no longer calls for it. */
export function planNotify(kind: NotifyKind, m: NotifyMatch): NotifyPlan | null {
  if (kind === 'rematch') {
    if (m.status !== 'finished' || m.rematch === null || m.rematch_by === null) return null;
    const to = m.players[1 - m.rematch_by];
    const from = m.names[m.rematch_by] ?? '?';
    return to
      ? {
          to,
          text: (lang) => (lang === 'hu' ? `${from} visszavágót kér!` : `${from} wants a rematch!`),
        }
      : null;
  }
  if (m.status !== 'active' || m.next_team < 0) return null;
  const to = m.players[m.next_team];
  const from = m.names[1 - m.next_team] ?? '?';
  if (!to) return null;
  if (kind === 'reminder')
    return {
      to,
      text: (lang) =>
        lang === 'hu'
          ? `Még 12 órád van lépni ${from} ellen.`
          : `12 hours left to move against ${from}.`,
    };
  return {
    to,
    text: (lang) =>
      lang === 'hu' ? `${from} lépett – te jössz!` : `${from} made a move – your turn!`,
  };
}
