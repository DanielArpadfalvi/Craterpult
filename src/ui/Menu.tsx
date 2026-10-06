import { MISSIONS } from '../core/campaign';
import { dailyPlan, dailySeed } from '../core/daily';
import { MAP_STYLES, type MapStyle } from '../core/mapgen';
import type { GameActions } from '../game/app';
import { currentStreak, dailyDay } from '../game/daily';
import { totalStars } from '../game/progress';
import type { UiState } from '../game/state';
import { t, type TranslationKey } from '../i18n';
import { Page, Section } from './Page';

interface Props {
  s: UiState;
  actions: GameActions;
}

const DIFFICULTIES = [1, 2, 3, 4, 5] as const;
const TEAM_SIZES = [2, 3, 4] as const;
const STYLE_CHOICES: (MapStyle | 'random')[] = ['random', ...MAP_STYLES];

export function Menu({ s, actions }: Props) {
  return (
    <div class="menu" data-testid="menu">
      <h1 class="logo">
        CRATER<span>PULT</span>
      </h1>
      <p class="tagline">{t('app.tagline')}</p>
      <div class="menu-play">
        <button
          type="button"
          class="btn btn-primary btn-play"
          data-testid="start-bot"
          onClick={() => actions.startBotMatch(s.difficulty)}
        >
          <span>{t('menu.vsBot')}</span>
          <small data-testid="quick-summary">{quickSummary(s)}</small>
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-square"
          aria-label={t('menu.quickOptions')}
          data-testid="open-quick"
          onClick={() => actions.openSheet('quick')}
        >
          <MenuIcon name="sliders" />
        </button>
      </div>
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
      <button
        type="button"
        class="btn btn-ghost"
        data-testid="start-hotseat"
        onClick={() => actions.startHotseat()}
      >
        <span>{t('menu.hotseat')}</span>
        <small>{t('menu.hotseatSub')}</small>
      </button>
      <nav class="menu-tiles" aria-label={t('menu.settings')}>
        <MenuTile
          label={t('menu.team')}
          icon="team"
          testId="open-team"
          onClick={() => actions.openSheet('team')}
        />
        <MenuTile
          label={t('menu.stats')}
          icon="stats"
          testId="open-stats"
          onClick={() => actions.openSheet('stats')}
        />
        <MenuTile
          label={t('menu.settings')}
          icon="settings"
          testId="open-settings"
          onClick={() => actions.openSheet('settings')}
        />
      </nav>
    </div>
  );
}

function quickSummary(s: UiState): string {
  return `${t(`difficulty.${s.difficulty}`)} · ${s.teamSize}v${s.teamSize} · ${t(
    `map.${s.mapStyle}` as TranslationKey,
  )}`;
}

const MENU_ICONS = {
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  team: 'M12 4l2 3h-4zM7 20v-5a5 5 0 0 1 10 0v5zM10 13h.01M14 13h.01',
  stats: 'M5 20V11M10 20V5M15 20v-7M20 20V9M3 20h18',
  settings:
    'M12 9a3 3 0 1 0 .01 0M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
} as const;

export function MenuIcon({ name }: { name: keyof typeof MENU_ICONS }) {
  return (
    <svg class="wicon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={MENU_ICONS[name]} />
    </svg>
  );
}

function MenuTile({
  label,
  icon,
  testId,
  onClick,
}: {
  label: string;
  icon: keyof typeof MENU_ICONS;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button type="button" class="menu-tile" data-testid={testId} onClick={onClick}>
      <MenuIcon name={icon} />
      <span>{label}</span>
    </button>
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

export function QuickScreen({ s, actions }: Props) {
  return (
    <Page title={t('menu.vsBot')} testId="quick" onBack={() => actions.openSheet(null)}>
      <Section title={t('menu.difficulty')}>
        <div class="row row-stack">
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
          <span class="row-hint" data-testid="difficulty-name">
            {t(`difficulty.${s.difficulty}`)}
          </span>
        </div>
      </Section>
      <Section title={t('menu.teamSize')}>
        <div class="row row-stack">
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
        </div>
      </Section>
      <Section title={t('menu.mapStyle')}>
        <div class="row row-stack">
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
        </div>
      </Section>
      <button
        type="button"
        class="btn btn-primary btn-start"
        data-testid="quick-start"
        onClick={() => actions.startBotMatch(s.difficulty)}
      >
        <span>{t('menu.start')}</span>
        <small>{quickSummary(s)}</small>
      </button>
    </Page>
  );
}
