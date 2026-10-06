import type { JSX } from 'preact';
import type { GameActions } from '../game/app';
import type { PaywallReason } from '../game/entitlement';
import { LEGAL_URLS } from '../game/paywall';
import type { UiState } from '../game/state';
import { t, type TranslationKey } from '../i18n';
import './paywall.css';

interface Props {
  s: UiState;
  actions: GameActions;
}

type FeatureId = 'campaign' | 'bots' | 'teams' | 'maps' | 'daily' | 'hats';

const FEATURES: readonly { id: FeatureId; hue: string }[] = [
  { id: 'campaign', hue: '#ff4fd8' },
  { id: 'bots', hue: '#3ef0ff' },
  { id: 'teams', hue: '#8dff5a' },
  { id: 'maps', hue: '#a77bff' },
  { id: 'daily', hue: '#ffd23f' },
  { id: 'hats', hue: '#ff9a3d' },
];

/** Which feature row a locked item highlights. */
const FOCUS: Record<PaywallReason, FeatureId | null> = {
  menu: null,
  campaign: 'campaign',
  difficulty: 'bots',
  teamSize: 'teams',
  mapStyle: 'maps',
  daily: 'daily',
  hats: 'hats',
};

/** `' is-fv-locked'` when an item needs the Full Version the player does not own, else `''`. */
export function fvLock(s: UiState, needsFull: boolean): string {
  return needsFull && !s.fullVersion ? ' is-fv-locked' : '';
}

/** Small gold "Full Version" lock badge on locked chips, tabs, missions and the daily card. */
export function FullVersionBadge({ label = false }: { label?: boolean }) {
  return (
    <span
      class={`fv-badge${label ? ' has-label' : ''}`}
      title={t('paywall.locked')}
      role={label ? undefined : 'img'}
      aria-label={label ? undefined : t('paywall.locked')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
      </svg>
      {label && <span>{t('paywall.locked')}</span>}
    </span>
  );
}

/** Menu entry of the Full Version sheet (hidden once owned). */
export function FullVersionButton({ s, actions }: Props) {
  if (s.fullVersion) return null;
  return (
    <button
      type="button"
      class="fv-button"
      data-testid="open-full-version"
      onClick={() => actions.openPaywall(null)}
    >
      <Emblem size={36} />
      <span class="fv-button-text">
        <strong>{t('paywall.menuButton')}</strong>
        <span>{t('paywall.menuSub')}</span>
      </span>
      {s.paywall.price && (
        <span class="fv-button-price" data-testid="full-version-price">
          {s.paywall.price}
        </span>
      )}
    </button>
  );
}

/** The Full Version sheet: benefits, store price, buy / restore, legal links and every state. */
export function PaywallSheet({ s, actions }: Props) {
  const pw = s.paywall;
  const celebrating = pw.status === 'success';
  const owned = s.fullVersion && !celebrating;
  return (
    <div
      class={`overlay paywall${celebrating ? ' is-celebrating' : ''}`}
      data-testid="paywall"
      data-status={owned ? 'owned' : pw.status}
      role="dialog"
      aria-modal="true"
      aria-label={t('paywall.title')}
      onClick={(e) => {
        if (e.target === e.currentTarget && pw.status !== 'buying') actions.closePaywall();
      }}
    >
      <div class="paywall-card">
        <button
          type="button"
          class="icon-btn paywall-close"
          aria-label={t('paywall.close')}
          data-testid="paywall-close"
          onClick={() => actions.closePaywall()}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
            />
          </svg>
        </button>
        {celebrating || owned ? (
          <Unlocked s={s} actions={actions} owned={owned} />
        ) : (
          <Offer s={s} actions={actions} />
        )}
      </div>
    </div>
  );
}

function Offer({ s, actions }: Props) {
  const pw = s.paywall;
  const buying = pw.status === 'buying';
  const restoring = pw.restore === 'busy';
  const unavailable = pw.product === 'unavailable';
  const focus = pw.reason ? FOCUS[pw.reason] : null;
  const buyLabel = buying
    ? t('paywall.buying')
    : pw.status === 'failed'
      ? t('paywall.tryAgain')
      : pw.price
        ? t('paywall.buyFor', { price: pw.price })
        : t('paywall.buy');
  return (
    <div class="paywall-body">
      <header class="paywall-hero">
        <Emblem size={72} />
        <span class="paywall-kicker">{t('paywall.title')}</span>
        <h2 class="paywall-headline">{t('paywall.headline')}</h2>
        <p
          class={pw.reason && pw.reason !== 'menu' ? 'paywall-reason' : 'paywall-sub'}
          data-testid="paywall-reason"
        >
          {t(`paywall.reason.${pw.reason ?? 'menu'}` as TranslationKey)}
        </p>
      </header>

      <ul class="paywall-features" aria-label={t('paywall.featureList')}>
        {FEATURES.map((f, i) => (
          <li
            key={f.id}
            class={`paywall-feature${focus === f.id ? ' is-focus' : ''}`}
            style={{ '--hue': f.hue, animationDelay: `${80 + i * 40}ms` }}
          >
            <span class="paywall-feature-icon">
              <FeatureIcon id={f.id} />
            </span>
            <span class="paywall-feature-text">
              <strong>{t(`paywall.f.${f.id}` as TranslationKey)}</strong>
              <span>{t(`paywall.f.${f.id}.desc` as TranslationKey)}</span>
            </span>
          </li>
        ))}
      </ul>

      <p class="paywall-promise">{t('paywall.promise')}</p>

      <StatusNote s={s} />

      <div class="paywall-cta">
        <button
          type="button"
          class={`btn btn-primary paywall-buy${buying ? ' is-busy' : ''}`}
          data-testid="paywall-buy"
          disabled={buying || restoring}
          onClick={() => actions.buyFullVersion()}
        >
          {buying && <span class="paywall-spinner" aria-hidden="true" />}
          <span>{buyLabel}</span>
        </button>
        <span class="paywall-once" data-testid="paywall-price">
          {pw.price || unavailable ? t('paywall.oneTime') : t('paywall.priceLoading')}
        </span>
      </div>

      <div class="paywall-links">
        <button
          type="button"
          class="paywall-link"
          data-testid="paywall-restore"
          disabled={restoring || buying}
          onClick={() => actions.restorePurchases()}
        >
          {restoring ? t('paywall.restoring') : t('paywall.restore')}
        </button>
        <span class="paywall-dot" aria-hidden="true" />
        <button
          type="button"
          class="paywall-link"
          data-testid="paywall-not-now"
          onClick={() => actions.closePaywall()}
        >
          {t('paywall.notNow')}
        </button>
      </div>

      <footer class="paywall-fine">
        <p>{t('paywall.smallPrint')}</p>
        <p class="paywall-legal">
          <a
            href={LEGAL_URLS.terms}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="paywall-terms"
          >
            {t('paywall.terms')}
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={LEGAL_URLS.privacy}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="paywall-privacy"
          >
            {t('paywall.privacy')}
          </a>
        </p>
      </footer>
    </div>
  );
}

/** Pending / failed / cancelled purchase and restore results. */
function StatusNote({ s }: { s: UiState }) {
  const pw = s.paywall;
  let tone: 'info' | 'warn' | 'muted' | null = null;
  let title: string | null = null;
  let body = '';
  if (pw.status === 'pending') {
    tone = 'info';
    title = t('paywall.pendingTitle');
    body = t('paywall.pending');
  } else if (pw.status === 'failed') {
    tone = 'warn';
    body = pw.product === 'unavailable' ? t('paywall.unavailable') : t('paywall.failed');
  } else if (pw.status === 'cancelled') {
    tone = 'muted';
    body = t('paywall.cancelled');
  } else if (pw.restore === 'nothing') {
    tone = 'muted';
    body = t('paywall.restoreNothing');
  } else if (pw.restore === 'failed') {
    tone = 'warn';
    body = t('paywall.restoreFailed');
  } else if (pw.product === 'unavailable') {
    tone = 'muted';
    body = t('paywall.unavailable');
  }
  if (!tone) return null;
  return (
    <div
      class={`paywall-note note-${tone}`}
      role="status"
      data-testid="paywall-note"
      key={`${pw.status}-${pw.restore}`}
    >
      {title && <strong>{title}</strong>}
      <span>{body}</span>
    </div>
  );
}

function Unlocked({ s, actions, owned }: Props & { owned: boolean }) {
  const pw = s.paywall;
  const body = owned
    ? t('paywall.ownedBody')
    : pw.via === 'restore'
      ? t('paywall.restored')
      : t('paywall.success');
  return (
    <div class="paywall-body paywall-done" data-testid="paywall-success" key={pw.key}>
      {!owned && <Confetti />}
      <div class="paywall-burst">
        <Emblem size={104} />
      </div>
      <span class="paywall-kicker">{t('paywall.title')}</span>
      <h2 class="paywall-headline">
        {owned ? t('paywall.ownedTitle') : t('paywall.successTitle')}
      </h2>
      <p class="paywall-sub">{body}</p>
      <ul class="paywall-unlocked">
        {FEATURES.map((f, i) => (
          <li key={f.id} style={{ '--hue': f.hue, animationDelay: `${320 + i * 60}ms` }}>
            <FeatureIcon id={f.id} />
            <span>{t(`paywall.f.${f.id}` as TranslationKey)}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        class="btn btn-primary paywall-play"
        data-testid="paywall-done"
        onClick={() => actions.closePaywall()}
      >
        {t('paywall.letsPlay')}
      </button>
    </div>
  );
}

/** Neon shell with a lit fuse and rays: the Full Version emblem. */
function Emblem({ size }: { size: number }) {
  return (
    <span
      class="paywall-emblem"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120">
        <defs>
          <radialGradient id="fv-shell" cx="0.38" cy="0.35" r="0.75">
            <stop offset="0" stop-color="#ffe3fb" />
            <stop offset="0.35" stop-color="#ff4fd8" />
            <stop offset="1" stop-color="#5a1aa8" />
          </radialGradient>
          <radialGradient id="fv-glow">
            <stop offset="0" stop-color="#ffd23f" stop-opacity="0.5" />
            <stop offset="1" stop-color="#ffd23f" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="64" r="44" fill="url(#fv-glow)" />
        <g class="paywall-rays" stroke="#ffd23f" stroke-linecap="round" stroke-width="3">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * Math.PI) / 6;
            const r0 = i % 2 ? 47 : 44;
            const r1 = i % 2 ? 53 : 58;
            return (
              <line
                key={i}
                x1={60 + Math.cos(a) * r0}
                y1={64 + Math.sin(a) * r0}
                x2={60 + Math.cos(a) * r1}
                y2={64 + Math.sin(a) * r1}
                opacity={i % 2 ? 0.5 : 0.95}
              />
            );
          })}
        </g>
        <path
          d="M74 36c6-8 14-10 20-6"
          fill="none"
          stroke="#ffd9a0"
          stroke-width="3.5"
          stroke-linecap="round"
        />
        <rect
          x="64"
          y="34"
          width="14"
          height="10"
          rx="3"
          transform="rotate(40 71 39)"
          fill="#3ef0ff"
        />
        <circle cx="58" cy="68" r="30" fill="url(#fv-shell)" stroke="#fff" stroke-width="2.4" />
        <path
          d="M44 58a17 17 0 0 1 14-10"
          fill="none"
          stroke="#fff"
          stroke-width="4"
          stroke-linecap="round"
          opacity="0.7"
        />
        <g class="paywall-spark" transform="translate(95 29)">
          <path d="M0-9 2.4-2.4 9 0 2.4 2.4 0 9-2.4 2.4-9 0-2.4-2.4z" fill="#fff6c2" />
          <circle r="3" fill="#ffd23f" />
        </g>
      </svg>
    </span>
  );
}

function FeatureIcon({ id }: { id: FeatureId }) {
  const paths: Record<FeatureId, JSX.Element> = {
    // Flag on a hill.
    campaign: (
      <g>
        <path d="M3 20c4-4 14-4 18 0" />
        <path d="M9 17V4" />
        <path d="M9 4h9l-2.5 3L18 10H9" fill="currentColor" fill-opacity="0.25" />
      </g>
    ),
    // Bot head.
    bots: (
      <g>
        <rect x="5" y="8" width="14" height="11" rx="3" fill="currentColor" fill-opacity="0.2" />
        <path d="M12 8V5M10 13h.01M14 13h.01M9.5 16h5" />
        <circle cx="12" cy="4" r="1.2" />
      </g>
    ),
    // Four crew heads.
    teams: (
      <g>
        <circle cx="6" cy="9" r="2.4" />
        <circle cx="18" cy="9" r="2.4" />
        <circle cx="10" cy="14" r="2.4" fill="currentColor" fill-opacity="0.25" />
        <circle cx="14.5" cy="14" r="2.4" fill="currentColor" fill-opacity="0.25" />
        <path d="M3 20h18" />
      </g>
    ),
    // Island with a cave.
    maps: (
      <g>
        <path d="M2 18 8 8l4 5 3-4 7 9z" fill="currentColor" fill-opacity="0.2" />
        <path d="M10 18a2.5 2.5 0 0 1 5 0" />
      </g>
    ),
    // Calendar with a star.
    daily: (
      <g>
        <rect x="4" y="5" width="16" height="15" rx="2.5" />
        <path d="M4 10h16M8 3v4M16 3v4" />
        <path
          d="m12 12.2.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z"
          fill="currentColor"
        />
      </g>
    ),
    // Top hat.
    hats: (
      <g>
        <path
          d="M7 16V7.5A1.5 1.5 0 0 1 8.5 6h7A1.5 1.5 0 0 1 17 7.5V16"
          fill="currentColor"
          fill-opacity="0.2"
        />
        <path d="M3 17.5c3 1.5 15 1.5 18 0M7 13h10" />
      </g>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {paths[id]}
    </svg>
  );
}

const CONFETTI_COLORS = ['#3ef0ff', '#ff4fd8', '#ffd23f', '#8dff5a', '#a77bff', '#ffffff'];

/** CSS confetti burst (deterministic layout, hidden with reduced motion). */
function Confetti() {
  return (
    <div class="paywall-confetti" aria-hidden="true">
      {Array.from({ length: 42 }, (_, i) => {
        const h = (i * 2654435761) >>> 0;
        const w = 5 + ((h >>> 3) % 5);
        return (
          <span
            key={i}
            style={{
              left: `${(h % 1000) / 10}%`,
              width: `${w}px`,
              height: `${w * (i % 3 === 0 ? 1 : 2.2)}px`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              borderRadius: i % 3 === 0 ? '50%' : '2px',
              '--drift': `${((h >>> 10) % 160) - 80}px`,
              '--spin': `${360 + ((h >>> 6) % 540)}deg`,
              animationDelay: `${((h >>> 4) % 600) / 1000}s`,
              animationDuration: `${1.6 + ((h >>> 14) % 900) / 1000}s`,
            }}
          />
        );
      })}
    </div>
  );
}
