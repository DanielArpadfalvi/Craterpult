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

const ICONS: Record<string, string> = {
  bazooka: 'M3 14h13l3-3h2v6h-2l-3-3M6 14v3',
  grenade: 'M12 8a6 6 0 1 0 .01 0M12 8V5h3',
  shotgun: 'M2 11h16v3H8l-2 4H3l1-4H2zM18 12h4',
  cluster: 'M9 9a4 4 0 1 0 .01 0M17 6h.01M19 11h.01M16 16h.01M9 4V2',
  mortar: 'M5 19l4-9h6l4 9zM10 10l2-6 2 6',
  napalm: 'M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-2-1-4 0-6z',
  homing: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 .01 0',
  airstrike: 'M4 6h16M8 6l-2 4M12 6v5M16 6l2 4M6 14v4M12 15v5M18 14v4',
  dynamite: 'M9 9h6v12H9zM12 9V6l3-3',
  mine: 'M5 17h14v-3a7 7 0 0 0-14 0zM12 7V4',
  crawler: 'M4 15a8 5 0 1 0 16 0 8 5 0 1 0-16 0M17 13h.01M7 20l-1 2M17 20l1 2',
  punch: 'M5 10h9a3 3 0 0 1 0 6H8a3 3 0 0 1-3-3zM14 10V7M11 10V7M8 10V8',
  drill: 'M3 12h8l3-4 7 4-7 4-3-4',
  girder: 'M2 10h20v4H2zM6 10l4 4M10 10l4 4M14 10l4 4',
  teleport: 'M12 4a8 8 0 1 0 .01 0M12 8a4 4 0 1 0 .01 0',
  quake: 'M2 14l4-4 3 6 4-10 3 8 2-3h4',
};

export function WeaponIcon({ id }: { id: string }) {
  return (
    <svg class="wicon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[id] ?? ICONS.bazooka} />
    </svg>
  );
}
