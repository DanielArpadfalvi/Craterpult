import { useState } from 'preact/hooks';
import type { GameActions } from '../game/app';
import { TURN_TIMES, type Settings } from '../game/settings';
import type { UiState } from '../game/state';
import { getLanguage, t } from '../i18n';
import { ChoiceRow, Page, Section, ToggleRow } from './Page';

interface Props {
  s: UiState;
  actions: GameActions;
}

export function SettingsScreen({ s, actions }: Props) {
  const st = s.save.settings;
  const set = (patch: Partial<Settings>) => actions.updateSettings(patch);
  return (
    <Page title={t('settings.title')} testId="settings" onBack={() => actions.openSheet(null)}>
      <Section title={t('settings.language')}>
        <ChoiceRow
          label={t('settings.language')}
          hideLabel
          options={[
            { value: 'en', label: t('lang.en') },
            { value: 'hu', label: t('lang.hu') },
          ]}
          value={st.language === 'auto' ? getLanguage() : st.language}
          onChange={(language) => set({ language })}
          testId="lang"
        />
      </Section>
      <Section title={t('settings.sectionFeel')}>
        <ToggleRow
          id="sound"
          label={t('settings.sound')}
          hint={t('settings.soundHint')}
          value={st.sound}
          onChange={(sound) => set({ sound })}
        />
        <ToggleRow
          id="haptics"
          label={t('settings.haptics')}
          hint={t('settings.hapticsHint')}
          value={st.haptics}
          onChange={(haptics) => set({ haptics })}
        />
      </Section>
      <Section title={t('settings.sectionGameplay')}>
        <ChoiceRow
          label={t('settings.turnTime')}
          hint={t('settings.turnTimeHint')}
          options={TURN_TIMES.map((n) => ({ value: n, label: t('settings.seconds', { n }) }))}
          value={st.turnTime}
          onChange={(turnTime) => set({ turnTime })}
          testId="turn-time"
        />
        <ChoiceRow
          label={t('settings.aimPreview')}
          hint={t('settings.aimPreviewHint')}
          options={[
            { value: 'short', label: t('settings.aimShort') },
            { value: 'long', label: t('settings.aimLong') },
          ]}
          value={st.aimPreview}
          onChange={(aimPreview) => set({ aimPreview })}
          testId="aim-preview"
        />
      </Section>
      <Section title={t('settings.sectionAccess')}>
        <ToggleRow
          id="reduced-motion"
          label={t('settings.reducedMotion')}
          hint={t('settings.reducedMotionHint')}
          value={st.reducedMotion}
          onChange={(reducedMotion) => set({ reducedMotion })}
        />
        <ToggleRow
          id="large-text"
          label={t('settings.largeText')}
          hint={t('settings.largeTextHint')}
          value={st.largeText}
          onChange={(largeText) => set({ largeText })}
        />
      </Section>
      <Section title={t('settings.sectionData')}>
        <ResetRow actions={actions} />
      </Section>
    </Page>
  );
}

/** Two-step, in-page confirmation (no browser dialogs). */
function ResetRow({ actions }: { actions: GameActions }) {
  const [step, setStep] = useState<'idle' | 'confirm' | 'done'>('idle');
  return (
    <div class="row row-stack" data-testid="reset-row">
      {step === 'confirm' ? (
        <>
          <span class="row-text">
            <span class="row-label is-danger" role="alert">
              {t('settings.resetQuestion')}
            </span>
          </span>
          <div class="row-buttons">
            <button
              type="button"
              class="btn btn-ghost"
              data-testid="reset-cancel"
              onClick={() => setStep('idle')}
            >
              {t('settings.resetCancel')}
            </button>
            <button
              type="button"
              class="btn btn-danger"
              data-testid="reset-confirm"
              onClick={() => {
                actions.resetProgress();
                setStep('done');
              }}
            >
              {t('settings.resetConfirm')}
            </button>
          </div>
        </>
      ) : (
        <>
          <span class="row-text">
            <span class="row-hint">{t('settings.resetHint')}</span>
            {step === 'done' && (
              <span class="row-label is-gold" role="status" data-testid="reset-done">
                {t('settings.resetDone')}
              </span>
            )}
          </span>
          <button
            type="button"
            class="btn btn-ghost btn-danger-ghost"
            data-testid="reset-progress"
            onClick={() => setStep('confirm')}
          >
            {t('settings.reset')}
          </button>
        </>
      )}
    </div>
  );
}
