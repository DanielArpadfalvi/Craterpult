import type { ComponentChildren } from 'preact';
import { MISSIONS } from '../core/campaign';
import type { GameActions } from '../game/app';
import { currentStreak } from '../game/daily';
import { totalStars } from '../game/progress';
import type { UiState } from '../game/state';
import { accuracy, favouriteWeapon, STATS_MODES, totalPlayed } from '../game/stats';
import { t, type TranslationKey } from '../i18n';
import { WeaponIcon } from './icons';
import { Page, Section } from './Page';

interface Props {
  s: UiState;
  actions: GameActions;
}

function Tile({
  label,
  value,
  testId,
  wide,
}: {
  label: string;
  value: ComponentChildren;
  testId: string;
  wide?: boolean;
}) {
  return (
    <div class={`stat${wide ? ' stat-wide' : ''}`}>
      <span class="stat-value" data-testid={`stat-${testId}`}>
        {value}
      </span>
      <span class="stat-label">{label}</span>
    </div>
  );
}

export function StatsScreen({ s, actions }: Props) {
  const st = s.save.stats;
  const total = totalPlayed(st);
  const fav = favouriteWeapon(st);
  return (
    <Page title={t('stats.title')} testId="stats" onBack={() => actions.openSheet(null)}>
      <Section title={t('stats.sectionOverview')}>
        <div class="stat-grid">
          <Tile label={t('stats.played')} value={total.played} testId="played" />
          <Tile label={t('stats.won')} value={total.won} testId="won" />
        </div>
      </Section>
      <Section title={t('stats.sectionCombat')}>
        <div class="stat-grid">
          <Tile label={t('stats.kills')} value={st.kills} testId="kills" />
          <Tile label={t('stats.lost')} value={st.unitsLost} testId="lost" />
          <Tile label={t('stats.shots')} value={st.shots} testId="shots" />
          <Tile
            label={t('stats.accuracy')}
            value={t('stats.percent', { n: accuracy(st) })}
            testId="accuracy"
          />
          <Tile
            label={t('stats.bestShot')}
            value={t('stats.damage', { n: st.bestShot })}
            testId="best-shot"
          />
          <Tile
            label={t('stats.favourite')}
            value={
              fav ? (
                <span class="stat-weapon">
                  <WeaponIcon id={fav} />
                  {t(`weapon.${fav}` as TranslationKey)}
                </span>
              ) : (
                t('stats.none')
              )
            }
            testId="favourite"
          />
        </div>
      </Section>
      <Section title={t('stats.sectionProgress')}>
        <div class="stat-grid">
          <Tile
            label={t('stats.streak')}
            value={t('stats.streakValue', { best: st.bestWinStreak, now: st.winStreak })}
            testId="streak"
            wide
          />
          <Tile
            label={t('stats.stars')}
            value={`★ ${totalStars(s.save)}/${MISSIONS.length * 3}`}
            testId="stars"
          />
          <Tile label={t('stats.dailyBest')} value={s.save.daily.best} testId="daily-best" />
          <Tile
            label={t('stats.dailyStreak')}
            value={t('stats.streakValue', {
              best: s.save.daily.streak.best,
              now: currentStreak(s.save, s.today),
            })}
            testId="daily-streak"
            wide
          />
        </div>
      </Section>
      <Section title={t('stats.byMode')}>
        <table class="mode-table" data-testid="mode-table">
          <thead>
            <tr>
              <th scope="col">{t('stats.colMode')}</th>
              <th scope="col">{t('stats.colPlayed')}</th>
              <th scope="col">{t('stats.colWon')}</th>
            </tr>
          </thead>
          <tbody>
            {STATS_MODES.map((m) => (
              <tr key={m} data-testid={`mode-${m}`}>
                <th scope="row">{t(`mode.${m}` as TranslationKey)}</th>
                <td data-testid={`mode-${m}-played`}>{st.modes[m].played}</td>
                <td data-testid={`mode-${m}-won`}>{st.modes[m].won}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </Page>
  );
}
