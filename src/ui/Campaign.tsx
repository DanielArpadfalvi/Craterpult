import {
  CHAPTER_UNLOCK_COUNT,
  CHAPTERS,
  chapterMissions,
  missionById,
  MISSIONS,
  type Mission,
  type SquadSpec,
} from '../core/campaign';
import type { GameActions } from '../game/app';
import {
  chapterCompleted,
  chapterStars,
  chapterUnlocked,
  missionStars,
  missionUnlocked,
  totalStars,
} from '../game/progress';
import type { UiState } from '../game/state';
import { t, type TranslationKey } from '../i18n';
import { LockIcon, Stars } from './icons';
import { chapterNeedsFull } from '../game/entitlement';
import { FullVersionBadge, fvLock } from './Paywall';
import { missionDesc, missionName, missionTags, starRuleText } from './missionText';

interface Props {
  s: UiState;
  actions: GameActions;
}

export function CampaignScreen({ s, actions }: Props) {
  const chapter = s.chapter;
  const open = chapterUnlocked(s.save, chapter);
  const intro = s.missionIntro ? missionById(s.missionIntro) : undefined;
  return (
    <div class="campaign" data-testid="campaign">
      <header class="screen-head">
        <button
          type="button"
          class="icon-btn"
          aria-label={t('menu.back')}
          data-testid="campaign-back"
          onClick={() => actions.toMenu()}
        >
          ‹
        </button>
        <h1>{t('campaign.title')}</h1>
        <span class="head-stars">
          ★ {totalStars(s.save)}/{MISSIONS.length * 3}
        </span>
      </header>
      <div class="tabs" role="tablist">
        {CHAPTERS.map((c) => {
          const unlocked = chapterUnlocked(s.save, c);
          const fv = fvLock(s, chapterNeedsFull(c));
          return (
            <button
              type="button"
              key={c}
              role="tab"
              aria-selected={c === chapter}
              class={`tab${c === chapter ? ' is-on' : ''}${unlocked && !fv ? '' : ' is-locked'}${fv}`}
              data-testid={`chapter-tab-${c}`}
              onClick={() => actions.selectChapter(c)}
            >
              <small>
                {fv ? <FullVersionBadge /> : unlocked ? null : <LockIcon />}
                {t('campaign.chapter', { n: c })}
              </small>
              <span>{t(`chapter.${c}` as TranslationKey)}</span>
            </button>
          );
        })}
      </div>
      {fvLock(s, chapterNeedsFull(chapter)) ? (
        <>
          <div class="fv-chapter" data-testid="chapter-fv-locked">
            <FullVersionBadge label />
            <p>{t('paywall.chapterLocked', { n: chapter })}</p>
            <button
              type="button"
              class="btn btn-primary"
              data-testid="chapter-unlock"
              onClick={() => actions.openPaywall('campaign')}
            >
              {t('paywall.buy')}
            </button>
          </div>
          <div class="mission-grid">
            {chapterMissions(chapter).map((m) => (
              <MissionTile key={m.id} m={m} s={s} actions={actions} />
            ))}
          </div>
        </>
      ) : open ? (
        <>
          <p class="chapter-progress" data-testid="chapter-progress">
            {t('campaign.progress', {
              done: chapterCompleted(s.save, chapter),
              stars: chapterStars(s.save, chapter),
            })}
          </p>
          <div class="mission-grid">
            {chapterMissions(chapter).map((m) => (
              <MissionTile key={m.id} m={m} s={s} actions={actions} />
            ))}
          </div>
        </>
      ) : (
        <div class="chapter-locked" data-testid="chapter-locked">
          <LockIcon />
          <p>{t('campaign.locked', { count: CHAPTER_UNLOCK_COUNT, prev: chapter - 1 })}</p>
        </div>
      )}
      {intro && <MissionIntro m={intro} s={s} actions={actions} />}
    </div>
  );
}

function MissionTile({ m, s, actions }: { m: Mission } & Props) {
  const fv = fvLock(s, chapterNeedsFull(m.chapter));
  const unlocked = missionUnlocked(s.save, m);
  const stars = missionStars(s.save, m.id);
  return (
    <button
      type="button"
      class={`mission${unlocked && !fv ? '' : ' is-locked'}${stars > 0 ? ' is-done' : ''}${fv}`}
      data-testid={`mission-${m.id}`}
      data-stars={stars}
      data-locked={fv ? 'full' : unlocked ? 'false' : 'true'}
      disabled={!unlocked && !fv}
      aria-label={
        unlocked || fv
          ? `${m.chapter}-${m.index} ${missionName(m.id)}`
          : t('campaign.missionLocked')
      }
      onClick={() => actions.openMission(m.id)}
    >
      <span class="mission-num">{fv ? <LockIcon /> : unlocked ? m.index : <LockIcon />}</span>
      <span class="mission-body">
        <span class="mission-name">
          {unlocked || fv ? missionName(m.id) : t('campaign.missionLocked')}
        </span>
        <Stars n={stars} />
      </span>
    </button>
  );
}

function squadLine(key: 'intro.yours' | 'intro.enemy', q: SquadSpec): string {
  return t(key, { count: q.units, hp: q.hp ?? 100 });
}

function MissionIntro({ m, actions }: { m: Mission } & Props) {
  const rules = [t('star.win'), ...m.stars.map(starRuleText)];
  return (
    <div class="overlay" data-testid="mission-intro" onClick={() => actions.openMission(null)}>
      <div class="panel intro" onClick={(e) => e.stopPropagation()}>
        <span class="eyebrow">
          {t('intro.mission', { chapter: m.chapter, index: m.index })} · {t(`difficulty.${m.bot}`)}
        </span>
        <h2 data-testid="intro-name">{missionName(m.id)}</h2>
        <p class="intro-desc">{missionDesc(m.id)}</p>
        <div class="tags">
          {missionTags(m).map((tag) => (
            <span class="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <div class="intro-block">
          <h3>{t('intro.objective')}</h3>
          <p>{m.enemies.length > 1 ? t('intro.goalFfa') : t('intro.goal')}</p>
          <p class="dim">{squadLine('intro.yours', m.player)}</p>
          {m.enemies.map((e, i) => (
            <p class="dim" key={i}>
              {squadLine('intro.enemy', e)}
            </p>
          ))}
          {m.player.only && (
            <p class="dim">
              {t('intro.arsenal', {
                list: m.player.only.map((w) => t(`weapon.${w}` as TranslationKey)).join(', '),
              })}
            </p>
          )}
        </div>
        <div class="intro-block">
          <h3>{t('intro.stars')}</h3>
          <ol class="star-rules" data-testid="star-rules">
            {rules.map((r, i) => (
              <li key={i}>
                <span class="star is-on" aria-hidden="true">
                  {'★'.repeat(i + 1)}
                </span>
                <span>{r}</span>
              </li>
            ))}
          </ol>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="start-mission"
          onClick={() => actions.startMission(m.id)}
        >
          {t('intro.start')}
        </button>
        <button
          type="button"
          class="btn btn-ghost"
          data-testid="intro-back"
          onClick={() => actions.openMission(null)}
        >
          {t('menu.back')}
        </button>
      </div>
    </div>
  );
}
