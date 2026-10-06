export function LockIcon() {
  return (
    <svg class="lock" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </svg>
  );
}

/** Three star slots, `n` of them earned. */
export function Stars({ n, size = 'sm' }: { n: number; size?: 'sm' | 'lg' }) {
  return (
    <span class={`stars stars-${size}`} aria-label={`${n}/3 ★`}>
      {[1, 2, 3].map((i) => (
        <span key={i} class={`star${i <= n ? ' is-on' : ''}`} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}
