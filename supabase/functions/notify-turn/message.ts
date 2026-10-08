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

interface Texts {
  turn(from: string): string;
  reminder(from: string): string;
  rematch(from: string): string;
}

/** Push texts by the app language the token was registered with (unknown → English). */
const TEXTS: Record<string, Texts> = {
  en: {
    turn: (f) => `${f} made a move – your turn!`,
    reminder: (f) => `12 hours left to move against ${f}.`,
    rematch: (f) => `${f} wants a rematch!`,
  },
  hu: {
    turn: (f) => `${f} lépett – te jössz!`,
    reminder: (f) => `Még 12 órád van lépni ${f} ellen.`,
    rematch: (f) => `${f} visszavágót kér!`,
  },
  de: {
    turn: (f) => `${f} hat gezogen – du bist dran!`,
    reminder: (f) => `Noch 12 Stunden für deinen Zug gegen ${f}.`,
    rematch: (f) => `${f} will eine Revanche!`,
  },
};

const texts = (lang: string): Texts => TEXTS[lang] ?? (TEXTS.en as Texts);

/** The push to send for `kind`, or null when the match no longer calls for it. */
export function planNotify(kind: NotifyKind, m: NotifyMatch): NotifyPlan | null {
  if (kind === 'rematch') {
    if (m.status !== 'finished' || m.rematch === null || m.rematch_by === null) return null;
    const to = m.players[1 - m.rematch_by];
    const from = m.names[m.rematch_by] ?? '?';
    return to ? { to, text: (lang) => texts(lang).rematch(from) } : null;
  }
  if (m.status !== 'active' || m.next_team < 0) return null;
  const to = m.players[m.next_team];
  const from = m.names[1 - m.next_team] ?? '?';
  if (!to) return null;
  return { to, text: (lang) => texts(lang)[kind](from) };
}
