import { useState } from 'preact/hooks';
import type { GameActions } from '../game/app';
import {
  COLOR_COUNT,
  HAT_UNLOCKS,
  hatNeedsFull,
  hatUnlocked,
  sanitizeTeamName,
  TEAM_NAME_MAX,
  teamLooks,
  type Profile,
} from '../game/profile';
import { totalStars } from '../game/progress';
import type { UiState } from '../game/state';
import { t, type TranslationKey } from '../i18n';
import { HAT_STYLES, type HatStyle } from '../render/hats';
import { cssColor, TEAM_COLORS, TEAM_SHAPES } from '../render/palette';
import { Avatar } from './Avatar';
import { LockIcon } from './icons';
import { Page, Section } from './Page';
import { FullVersionBadge, fvLock } from './Paywall';

interface Props {
  s: UiState;
  actions: GameActions;
}

const HAT_CHOICES: Profile['hat'][] = ['auto', ...HAT_STYLES];

export function TeamScreen({ s, actions }: Props) {
  const p = s.save.profile;
  const stars = totalStars(s.save);
  // The field keeps what is typed (e.g. a trailing space); the save holds the sanitized name.
  const [draft, setDraft] = useState(p.name);
  const color = cssColor(TEAM_COLORS[p.color] as number);
  const look = teamLooks(1, p, stars, s.fullVersion)[0];
  const defaultName = t(`team.${p.color}` as TranslationKey);
  return (
    <Page title={t('team.title')} testId="team" onBack={() => actions.openSheet(null)}>
      <div class="team-preview" style={{ '--c': color }}>
        <Avatar hat={look?.hat ?? 'circle'} color={color} size={88} />
        <span class="team-preview-name" data-testid="team-preview-name">
          {p.name || defaultName}
        </span>
      </div>
      <Section title={t('team.name')}>
        <div class="row row-stack">
          <input
            class="text-input"
            type="text"
            data-testid="team-name"
            aria-label={t('team.name')}
            value={draft}
            placeholder={defaultName}
            maxLength={TEAM_NAME_MAX * 4}
            autoComplete="off"
            autoCorrect="off"
            spellcheck={false}
            enterKeyHint="done"
            onInput={(e) => {
              const el = e.currentTarget as HTMLInputElement;
              const clean = sanitizeTeamName(el.value);
              // Past the limit the field snaps to the clean name; below it, typing stays free.
              if (Array.from(el.value).length > TEAM_NAME_MAX) el.value = clean;
              setDraft(el.value);
              actions.updateProfile({ name: clean });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            }}
            onBlur={() => setDraft(p.name)}
          />
          <span class="row-hint">{t('team.nameHint', { n: TEAM_NAME_MAX })}</span>
        </div>
      </Section>
      <Section title={t('team.color')}>
        <div class="row row-stack">
          <div class="swatches" role="radiogroup" aria-label={t('team.color')}>
            {Array.from({ length: COLOR_COUNT }, (_, i) => (
              <button
                type="button"
                key={i}
                role="radio"
                aria-checked={i === p.color}
                aria-label={t(`color.${i}` as TranslationKey)}
                class={`swatch${i === p.color ? ' is-on' : ''}`}
                style={{ '--c': cssColor(TEAM_COLORS[i] as number) }}
                data-testid={`color-${i}`}
                onClick={() => actions.updateProfile({ color: i })}
              >
                <span class="swatch-dot" />
                <span class="swatch-name">{t(`color.${i}` as TranslationKey)}</span>
              </button>
            ))}
          </div>
          <span class="row-hint">{t('team.colorHint')}</span>
        </div>
      </Section>
      <Section title={t('team.hat')}>
        <div class="row row-stack">
          <div class="hat-grid" role="radiogroup" aria-label={t('team.hat')}>
            {HAT_CHOICES.map((h) => {
              const open = hatUnlocked(h, stars, s.fullVersion);
              // Full Version lock first: tapping it opens the sheet (the gate in monetization.ts).
              const fv = fvLock(s, hatNeedsFull(h));
              const shown: HatStyle =
                h === 'auto' ? ((TEAM_SHAPES[p.color] as HatStyle) ?? 'circle') : h;
              return (
                <button
                  type="button"
                  key={h}
                  role="radio"
                  aria-checked={h === p.hat}
                  disabled={!open && !fv}
                  class={`hat${h === p.hat ? ' is-on' : ''}${open ? '' : ' is-locked'}${fv}`}
                  data-testid={`hat-${h}`}
                  onClick={() => actions.updateProfile({ hat: h })}
                >
                  <Avatar hat={shown} color={open ? color : '#9a94c4'} size={40} />
                  <span class="hat-name">
                    {fv ? (
                      <>
                        <FullVersionBadge />
                        {t(`hat.${h}` as TranslationKey)}
                      </>
                    ) : open ? (
                      t(`hat.${h}` as TranslationKey)
                    ) : (
                      <>
                        <LockIcon />
                        {t('team.hatLocked', { n: HAT_UNLOCKS[h as HatStyle] ?? 0 })}
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <span class="row-hint">{t('team.hatHint')}</span>
        </div>
      </Section>
    </Page>
  );
}
