import { MISSIONS } from '../core/campaign';
import { dailyPlan, dailySeed } from '../core/daily';
import { MAP_STYLES, type MapStyle } from '../core/mapgen';
import type { GameActions } from '../game/app';
import { currentStreak, dailyDay } from '../game/daily';
import { totalStars } from '../game/progress';
import type { UiState } from '../game/state';
import { getLanguage, setLanguage, t, type TranslationKey } from '../i18n';

interface Props {
  s: UiState;
  actions: GameActions;
}

const DIFFICULTIES = [1, 2, 3, 4, 5] as const;
const TEAM_SIZES = [2, 3, 4] as const;
const STYLE_CHOICES: (MapStyle | 'random')[] = ['random', ...MAP_STYLES];

export function SoundButton({ muted, actions }: { muted: boolean; actions: GameActions }) {
  return (
    <button
      type="button"
      class="btn btn-ghost"
      data-testid="toggle-sound"
      onClick={() => actions.toggleSound()}
    >
      {muted ? t('settings.soundOff') : t('settings.soundOn')}
    </button>
  );
}

export function Menu({ s, actions }: Props) {
  return (
    <div class="menu" data-testid="menu">
      <h1 class="logo">
        CRATER<span>PULT</span>
      </h1>
      <p class="tagline">{t('app.tagline')}</p>
      <button
        type="button"
        class="btn btn-primary btn-campaign"
        data-testid="open-campaign"
        onClick={() => actions.openCampaign()}
      >
        <span>{t('menu.campaign')}</span>
        <small>
          {t('menu.campaignSub', { stars: totalStars(s.save), max: MISSIONS.length * 3 })}
        </small>
      </button>
      <DailyCard s={s} actions={actions} />
      <QuickCard s={s} actions={actions} />
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="start-hotseat"
        onClick={() => actions.startHotseat()}
      >
        <span>{t('menu.hotseat')}</span>
        <small>{t('menu.hotseatSub')}</small>
      </button>
      <div class="menu-row">
        <SoundButton muted={s.muted} actions={actions} />
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="toggle-language"
          onClick={() => setLanguage(getLanguage() === 'en' ? 'hu' : 'en')}
        >
          {t('menu.language')}
        </button>
      </div>
    </div>
  );
}

function DailyCard({ s, actions }: Props) {
  const plan = dailyPlan(dailySeed(s.today));
  const day = dailyDay(s.save, s.today);
  const streak = currentStreak(s.save, s.today);
  const mod = `daily.mod.${plan.modifier}` as TranslationKey;
  return (
    <section class="card daily-card" data-testid="daily-card" aria-label={t('daily.title')}>
      <div class="card-head">
        <h2>{t('daily.title')}</h2>
        <span class="card-date">{s.today}</span>
      </div>
      <p class="daily-mod" data-testid="daily-modifier">
        <strong>{t(mod)}</strong>
        <span>{t(`${mod}.desc` as TranslationKey)}</span>
      </p>
      <div class="daily-stats">
        {day.done && (
          <span data-testid="daily-today">{t('daily.today', { score: day.score })}</span>
        )}
        <span>{t('daily.best', { score: s.save.daily.best })}</span>
        <span data-testid="daily-streak">{t('daily.streak', { n: streak })}</span>
      </div>
      <button
        type="button"
        class={`btn ${day.official ? 'btn-ghost' : 'btn-primary btn-gold'}`}
        data-testid="start-daily"
        onClick={() => actions.startDaily()}
      >
        {day.official ? t('daily.practice') : t('daily.play')}
      </button>
    </section>
  );
}

function QuickCard({ s, actions }: Props) {
  return (
    <section class="card quick-card" aria-label={t('menu.quick')}>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="start-bot"
        onClick={() => actions.startBotMatch(s.difficulty)}
      >
        <span>{t('menu.vsBot')}</span>
        <small>
          {t(`difficulty.${s.difficulty}`)} · {s.teamSize}v{s.teamSize} ·{' '}
          {t(`map.${s.mapStyle}` as TranslationKey)}
        </small>
      </button>
      <div class="chips" role="radiogroup" aria-label={t('menu.difficulty')}>
        {DIFFICULTIES.map((d) => (
          <button
            type="button"
            key={d}
            role="radio"
            aria-checked={d === s.difficulty}
            aria-label={t(`difficulty.${d}`)}
            class={`chip chip-stars${d === s.difficulty ? ' is-on' : ''}`}
            data-testid={`difficulty-${d}`}
            onClick={() => actions.setDifficulty(d)}
          >
            {'★'.repeat(d)}
          </button>
        ))}
      </div>
      <div class="chip-label">{t('menu.teamSize')}</div>
      <div class="chips" role="radiogroup" aria-label={t('menu.teamSize')}>
        {TEAM_SIZES.map((n) => (
          <button
            type="button"
            key={n}
            role="radio"
            aria-checked={n === s.teamSize}
            class={`chip${n === s.teamSize ? ' is-on' : ''}`}
            data-testid={`team-size-${n}`}
            onClick={() => actions.setTeamSize(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div class="chip-label">{t('menu.mapStyle')}</div>
      <div class="chips chips-grid" role="radiogroup" aria-label={t('menu.mapStyle')}>
        {STYLE_CHOICES.map((m) => (
          <button
            type="button"
            key={m}
            role="radio"
            aria-checked={m === s.mapStyle}
            class={`chip${m === s.mapStyle ? ' is-on' : ''}`}
            data-testid={`map-style-${m}`}
            onClick={() => actions.setMapStyle(m)}
          >
            {t(`map.${m}` as TranslationKey)}
          </button>
        ))}
      </div>
    </section>
  );
}
