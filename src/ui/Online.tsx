import { ONLINE_MAP_STYLES, ONLINE_TURN_SECONDS } from '../core/online';
import type { GameActions } from '../game/app';
import { onlineCreateNeedsFull } from '../game/entitlement';
import type { UiState } from '../game/state';
import {
  canClaimTimeout,
  isMyTurn,
  opponentName,
  rematchOffered,
  replyLeft,
  type OnlineMatch,
} from '../net/types';
import { t, type TranslationKey } from '../i18n';
import { Page, Section } from './Page';
import { FullVersionBadge, fvLock } from './Paywall';

interface Props {
  s: UiState;
  actions: GameActions;
}

const TEAM_SIZES = [2, 3, 4] as const;

/** Online lobby (M9): new invite, join by code, and the player's matches. */
export function OnlineScreen({ s, actions }: Props) {
  const o = s.online;
  const invite = o.invite ? o.matches.find((m) => m.id === o.invite) : undefined;
  const now = Date.now();
  // A rematch the opponent offered, or a win to claim, waits on the player like a turn does.
  const waitsOnMe = (m: OnlineMatch): boolean =>
    (m.status === 'active' && isMyTurn(m)) || rematchOffered(m) || canClaimTimeout(m, now);
  const mine = o.matches.filter(waitsOnMe);
  const theirs = o.matches.filter((m) => m.status === 'active' && !waitsOnMe(m));
  const open = o.matches.filter((m) => m.status === 'open');
  const finished = o.matches
    .filter((m) => m.status === 'finished' && !rematchOffered(m))
    .slice(0, 5);
  return (
    <Page
      title={t('online.title')}
      testId="online"
      onBack={() => actions.openSheet(null)}
      aside={
        o.available && (
          <button
            type="button"
            class="icon-btn"
            aria-label={t('online.refresh')}
            data-testid="online-refresh"
            disabled={o.loading}
            onClick={() => void actions.onlineRefresh()}
          >
            ↻
          </button>
        )
      }
    >
      {!o.available ? (
        <p class="online-note" data-testid="online-unavailable">
          {t('online.unavailable')}
        </p>
      ) : (
        <>
          {o.error && (
            <p class="online-error" role="alert" data-testid="online-error">
              {t(`online.error.${o.error}` as TranslationKey)}
            </p>
          )}
          {invite && invite.status === 'open' && <InviteCard m={invite} actions={actions} />}
          <MatchList title={t('online.yourTurn')} list={mine} s={s} actions={actions} />
          <JoinSection s={s} actions={actions} />
          <MatchList title={t('online.theirTurn')} list={theirs} s={s} actions={actions} />
          <MatchList title={t('online.open')} list={open} s={s} actions={actions} />
          <NewMatchSection s={s} actions={actions} />
          <MatchList title={t('online.finished')} list={finished} s={s} actions={actions} />
          {o.matches.length === 0 && !o.loading && (
            <p class="online-note" data-testid="online-empty">
              {t('online.empty')}
            </p>
          )}
        </>
      )}
    </Page>
  );
}

function InviteCard({ m, actions }: { m: OnlineMatch; actions: GameActions }) {
  return (
    <section class="card invite-card" data-testid="invite-card">
      <div class="card-head">
        <h2>{t('online.inviteTitle')}</h2>
        <button
          type="button"
          class="icon-btn"
          aria-label={t('menu.back')}
          onClick={() => actions.onlineDismissInvite()}
        >
          ×
        </button>
      </div>
      <p class="invite-code" data-testid="invite-code" aria-label={t('online.code')}>
        {m.code}
      </p>
      <p class="invite-text">{t('online.inviteText')}</p>
      <div class="invite-actions">
        <button
          type="button"
          class="btn btn-primary"
          data-testid="invite-share"
          onClick={() => void actions.onlineShare(m.id)}
        >
          {t('online.share')}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="invite-cancel"
          onClick={() => void actions.onlineCancel(m.id)}
        >
          {t('online.cancel')}
        </button>
      </div>
    </section>
  );
}

function JoinSection({ s, actions }: Props) {
  const o = s.online;
  return (
    <Section title={t('online.join')} testId="online-join">
      <form
        class="row join-row"
        onSubmit={(e) => {
          e.preventDefault();
          void actions.onlineJoin();
        }}
      >
        <input
          class="text-input code-input"
          data-testid="join-code"
          aria-label={t('online.code')}
          placeholder={t('online.code')}
          value={o.joinCode}
          maxLength={8}
          autoCapitalize="characters"
          autoComplete="off"
          spellcheck={false}
          onInput={(e) => actions.onlineSetCode((e.currentTarget as HTMLInputElement).value)}
        />
        <button
          type="submit"
          class="btn btn-primary"
          data-testid="join-submit"
          disabled={o.busy || o.joinCode.trim().length < 6}
        >
          {t('online.joinBtn')}
        </button>
      </form>
    </Section>
  );
}

function NewMatchSection({ s, actions }: Props) {
  const o = s.online;
  const locked = fvLock(s, onlineCreateNeedsFull());
  return (
    <Section title={t('online.new')} testId="online-new">
      <div class="row row-stack">
        <span class="chip-label">{t('menu.teamSize')}</span>
        <div class="chips" role="radiogroup" aria-label={t('menu.teamSize')}>
          {TEAM_SIZES.map((n) => (
            <button
              type="button"
              key={n}
              role="radio"
              aria-checked={n === o.teamSize}
              class={`chip${n === o.teamSize ? ' is-on' : ''}`}
              data-testid={`online-size-${n}`}
              onClick={() => actions.onlineOptions({ teamSize: n })}
            >
              {n}
            </button>
          ))}
        </div>
        <span class="chip-label">{t('menu.mapStyle')}</span>
        <div class="chips chips-grid" role="radiogroup" aria-label={t('menu.mapStyle')}>
          {ONLINE_MAP_STYLES.map((m) => (
            <button
              type="button"
              key={m}
              role="radio"
              aria-checked={m === o.style}
              class={`chip${m === o.style ? ' is-on' : ''}`}
              data-testid={`online-map-${m}`}
              onClick={() => actions.onlineOptions({ style: m })}
            >
              {t(`map.${m}` as TranslationKey)}
            </button>
          ))}
        </div>
        <span class="chip-label">{t('online.turnTime')}</span>
        <div class="chips" role="radiogroup" aria-label={t('online.turnTime')}>
          {ONLINE_TURN_SECONDS.map((n) => (
            <button
              type="button"
              key={n}
              role="radio"
              aria-checked={n === o.turnSeconds}
              class={`chip${n === o.turnSeconds ? ' is-on' : ''}`}
              data-testid={`online-time-${n}`}
              onClick={() => actions.onlineOptions({ turnSeconds: n })}
            >
              {t('online.seconds', { n })}
            </button>
          ))}
        </div>
        <button
          type="button"
          class={`btn btn-primary${locked}`}
          data-testid="online-create"
          disabled={o.busy}
          onClick={() => void actions.onlineCreate()}
        >
          {t('online.create')}
          {locked && <FullVersionBadge />}
        </button>
        <p class="online-note">{t('online.replyRule')}</p>
      </div>
    </Section>
  );
}

function MatchList({
  title,
  list,
  s,
  actions,
}: {
  title: string;
  list: OnlineMatch[];
  s: UiState;
  actions: GameActions;
}) {
  if (list.length === 0) return null;
  return (
    <Section title={title}>
      {list.map((m) => (
        <MatchRow key={m.id} m={m} s={s} actions={actions} />
      ))}
    </Section>
  );
}

/** "2d 5h" / "3h 20m" until the reply deadline. */
export function formatLeft(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  return d > 0 ? t('online.leftDays', { d, h }) : t('online.leftHours', { h, m: min % 60 });
}

function statusText(m: OnlineMatch, now: number): string {
  const name = opponentName(m) ?? '?';
  if (m.status === 'open') return m.code;
  if (m.status === 'active') {
    const turn = t('online.turnN', { n: m.turnCount + 1 });
    if (canClaimTimeout(m, now)) return t('online.timeUpThem', { name });
    const left = formatLeft(replyLeft(m, now));
    return `${turn} · ${isMyTurn(m) ? t('online.leftYou', { left }) : t('online.leftThem', { left })}`;
  }
  if (m.timedOut !== null)
    return m.timedOut === m.myTeam ? t('online.timedOutYou') : t('online.timedOutThem', { name });
  if (m.resigned !== null)
    return m.resigned === m.myTeam ? t('online.resignedYou') : t('online.resignedThem', { name });
  if (m.winner === m.myTeam) return t('online.won');
  if (m.winner === -1 || m.winner === null) return t('online.draw');
  return t('online.lost');
}

function MatchRow({ m, s, actions }: { m: OnlineMatch; s: UiState; actions: GameActions }) {
  const name = opponentName(m);
  const mine = isMyTurn(m);
  const confirming = s.online.confirmResign === m.id;
  const now = Date.now();
  const claim = canClaimTimeout(m, now);
  return (
    <div class="row online-row" data-testid={`online-match-${m.id}`} data-status={m.status}>
      <button
        type="button"
        class="online-row-main"
        data-testid="online-open"
        disabled={s.online.busy}
        onClick={() => void actions.onlineOpen(m.id)}
      >
        <strong>{name ? t('online.vs', { name }) : t('online.code')}</strong>
        <small>{statusText(m, now)}</small>
      </button>
      {claim && (
        <button
          type="button"
          class="btn btn-primary online-claim"
          data-testid="online-claim"
          disabled={s.online.busy}
          onClick={() => void actions.onlineClaimTimeout(m.id)}
        >
          {t('online.claim')}
        </button>
      )}
      {m.status === 'active' && !claim && (
        <button
          type="button"
          class={`btn btn-ghost online-resign${confirming ? ' is-confirm' : ''}`}
          data-testid="online-resign"
          onClick={() => void actions.onlineResign(m.id)}
        >
          {confirming ? t('online.resignConfirm') : t('online.resign')}
        </button>
      )}
      {m.status === 'finished' && <RematchButton m={m} s={s} actions={actions} />}
      {m.status === 'active' && !claim && (
        <span class={`online-pill${mine ? ' is-mine' : ''}`}>{mine ? t('online.play') : '…'}</span>
      )}
    </div>
  );
}

/** Rematch of a finished match: offer one, take up the opponent's offer, or show it is sent. */
function RematchButton({ m, s, actions }: { m: OnlineMatch; s: UiState; actions: GameActions }) {
  if (m.rematch !== null && !rematchOffered(m))
    return (
      <small class="online-rematch-sent" data-testid="online-rematch-sent">
        {t('online.rematchSent')}
      </small>
    );
  const offered = rematchOffered(m);
  return (
    <button
      type="button"
      class={`btn ${offered ? 'btn-primary' : 'btn-ghost'} online-rematch`}
      data-testid="online-rematch"
      data-offered={offered ? '1' : '0'}
      disabled={s.online.busy}
      onClick={() => void actions.onlineRematch(m.id)}
    >
      {offered ? t('online.rematchAccept') : t('over.rematch')}
    </button>
  );
}

/** Online: the opponent has not moved yet. */
export function WaitingOverlay({ s, actions }: Props) {
  return (
    <div class="overlay" data-testid="online-waiting">
      <div class="panel">
        <h2>{t('online.waiting', { name: s.online.opponent })}</h2>
        <p class="dim">{t('online.waitingSub')}</p>
        <WaitingDeadline s={s} actions={actions} />
        {s.online.sending > 0 && <p class="dim">{t('online.sending')}</p>}
        <button
          type="button"
          class="btn btn-primary"
          data-testid="online-to-list"
          onClick={() => actions.onlineLeave()}
        >
          {t('online.toList')}
        </button>
      </div>
    </div>
  );
}

/** The opponent's reply time on the waiting card, and the claim button once it ran out. */
function WaitingDeadline({ s, actions }: Props) {
  const m = s.online.matches.find((x) => x.id === s.online.matchId);
  if (!m || m.status !== 'active' || isMyTurn(m)) return null;
  const now = Date.now();
  if (!canClaimTimeout(m, now))
    return (
      <p class="dim" data-testid="online-deadline">
        {t('online.leftThem', { left: formatLeft(replyLeft(m, now)) })}
      </p>
    );
  return (
    <>
      <p>{t('online.timeUpThem', { name: s.online.opponent })}</p>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="online-claim"
        disabled={s.online.busy}
        onClick={() => void actions.onlineClaimTimeout(m.id)}
      >
        {t('online.claim')}
      </button>
    </>
  );
}

/** Online: a received turn did not reproduce on this device. */
export function DesyncOverlay({ s, actions }: Props) {
  return (
    <div class="overlay" data-testid="online-desync">
      <div class="panel">
        <h2>{t('online.desync', { code: s.online.desync ?? '?' })}</h2>
        <button type="button" class="btn btn-primary" onClick={() => actions.onlineLeave()}>
          {t('online.toList')}
        </button>
      </div>
    </div>
  );
}

/** Online: the opponent's move is playing back; it can be skipped. */
export function ReplayBar({ s, actions }: Props) {
  if (s.mode !== 'online' || !s.online.replaying || s.overlay !== null) return null;
  return (
    <div class="replay-bar" data-testid="online-replay">
      <span>{t('online.replaying', { name: s.online.opponent })}</span>
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="online-skip"
        onClick={() => actions.onlineSkipReplay()}
      >
        {t('online.skipReplay')}
      </button>
    </div>
  );
}
