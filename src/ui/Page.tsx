import type { ComponentChildren } from 'preact';
import { t } from '../i18n';

/** Full-page sub-screen with the shared header (back button + title). */
export function Page({
  title,
  testId,
  onBack,
  aside,
  children,
}: {
  title: string;
  testId: string;
  onBack: () => void;
  aside?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div class="page" data-testid={testId}>
      <header class="screen-head">
        <button
          type="button"
          class="icon-btn"
          aria-label={t('menu.back')}
          data-testid={`${testId}-back`}
          onClick={onBack}
        >
          ‹
        </button>
        <h1>{title}</h1>
        {aside}
      </header>
      <div class="page-body">{children}</div>
    </div>
  );
}

export function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: ComponentChildren;
  testId?: string;
}) {
  return (
    <section class="section" data-testid={testId}>
      <h2 class="section-title">{title}</h2>
      <div class="section-card">{children}</div>
    </section>
  );
}

/** A whole-row switch (44px+ tap target). */
export function ToggleRow({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      class="row row-toggle"
      data-testid={`toggle-${id}`}
      onClick={() => onChange(!value)}
    >
      <span class="row-text">
        <span class="row-label">{label}</span>
        {hint && <span class="row-hint">{hint}</span>}
      </span>
      <span class={`switch${value ? ' is-on' : ''}`} aria-hidden="true">
        <span class="switch-knob" />
      </span>
    </button>
  );
}

/** Labelled row of exclusive choices. */
export function ChoiceRow<T extends string | number>({
  label,
  hint,
  options,
  value,
  onChange,
  testId,
  hideLabel,
}: {
  label: string;
  hint?: string;
  /** The section title already names the row. */
  hideLabel?: boolean;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div class="row row-stack">
      {!hideLabel && (
        <span class="row-text">
          <span class="row-label">{label}</span>
          {hint && <span class="row-hint">{hint}</span>}
        </span>
      )}
      <div class="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            type="button"
            key={o.value}
            role="radio"
            aria-checked={o.value === value}
            class={`seg${o.value === value ? ' is-on' : ''}`}
            data-testid={`${testId}-${o.value}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
