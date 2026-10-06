import { dailyPlan, dailySeed } from '../core/daily';
import type { GameActions } from '../game/app';
import type { MatchResult, UiState } from '../game/state';
import { t, type TranslationKey } from '../i18n';
import { missionById } from '../core/campaign';
import { missionName, starRuleText } from './missionText';

interface Props {
  s: UiState;
  actions: GameActions;
}

export function ResultOverlay({ s, actions }: Props) {
  const r = s.result;
  if (!r) return null;
  return (
    <div class="overlay" data-testid="result">
      {r.kind === 'campaign' ? (
        <CampaignResult r={r} actions={actions} />
      ) : (
        <DailyResult r={r} s={s} actions={actions} />
      )}
    </div>
  );
}

function CampaignResult({
  r,
  actions,
}: {
  r: Extract<MatchResult, { kind: 'campaign' }>;
  actions: GameActions;
}) {
  return (
    <div class={`panel result ${r.won ? 'is-win' : 'is-lose'}`}>
      <span class="eyebrow">{missionName(r.missionId)}</span>
      <h2 class="win-title" data-testid="result-title">
        {r.won ? t('result.win') : t('result.lose')}
      </h2>
      <div class="result-stars" data-testid="result-stars" data-stars={r.stars}>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            class={`big-star${i <= r.stars ? ' is-on' : ''}`}
            style={{ animationDelay: `${0.25 + i * 0.35}s` }}
            aria-hidden="true"
          >
            ★
          </span>
        ))}
      </div>
      <ul class="rule-checks" data-testid="rule-checks">
        <li class={r.won ? 'is-met' : ''}>
          <span aria-hidden="true">{r.won ? '✓' : '✗'}</span>
          {t('star.win')}
        </li>
        {(missionById(r.missionId)?.stars ?? []).map((rule, i) => (
          <li key={i} class={r.rulesMet[i] ? 'is-met' : ''}>
            <span aria-hidden="true">{r.rulesMet[i] ? '✓' : '✗'}</span>
            {starRuleText(rule)}
          </li>
        ))}
      </ul>
      {r.won && r.stars > r.prevStars && r.prevStars > 0 && (
        <p class="result-note">{t('result.newBest')}</p>
      )}
      {r.unlockedChapter !== null && (
        <p class="result-note is-gold" data-testid="result-unlocked">
          {t('result.unlocked', { n: r.unlockedChapter })}
        </p>
      )}
      {r.won && r.missionId === 'c3-10' && <p class="result-note is-gold">{t('result.allDone')}</p>}
      {r.nextId && r.won && (
        <button
          type="button"
          class="btn btn-primary"
          data-testid="result-next"
          onClick={() => actions.nextMission()}
        >
          {t('result.next')}
        </button>
      )}
      <button
        type="button"
        class={`btn ${r.won ? 'btn-ghost' : 'btn-primary'}`}
        data-testid="result-retry"
        onClick={() => actions.rematch()}
      >
        {t('result.retry')}
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="result-missions"
        onClick={() => actions.toMissions()}
      >
        {t('result.missions')}
      </button>
    </div>
  );
}

function DailyResult({
  r,
  s,
  actions,
}: {
  r: Extract<MatchResult, { kind: 'daily' }>;
  s: UiState;
  actions: GameActions;
}) {
  const mod = dailyPlan(dailySeed(s.today)).modifier;
  return (
    <div class={`panel result ${r.won ? 'is-win' : 'is-lose'}`}>
      <span class="eyebrow">
        {t('daily.title')} · {t(`daily.mod.${mod}` as TranslationKey)}
      </span>
      <h2 class="win-title">{r.won ? t('daily.won') : t('daily.lost')}</h2>
      <div class="score">
        <small>{t('daily.score')}</small>
        <strong data-testid="daily-score">{r.score}</strong>
      </div>
      <p class="dim">
        {t('daily.breakdown', { win: r.winBonus, hp: r.hpLeft, turns: r.turnCost })}
      </p>
      <p class={`result-note${r.official ? ' is-gold' : ''}`} data-testid="daily-attempt">
        {r.official ? t('daily.official') : t('daily.practiceNote')}
      </p>
      <div class="daily-stats">
        <span data-testid="result-streak">{t('daily.streakLine', { n: r.streak })}</span>
        <span>{t('daily.best', { score: r.best })}</span>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="to-menu"
        onClick={() => actions.toMenu()}
      >
        {t('over.menu')}
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="daily-practice"
        onClick={() => actions.rematch()}
      >
        {t('daily.practice')}
      </button>
    </div>
  );
}
