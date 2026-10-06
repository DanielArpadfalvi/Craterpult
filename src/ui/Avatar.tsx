import type { HatStyle } from '../render/hats';

/** SVG twin of the renderer's hats (`src/render/hats.ts`), in the same unit coordinates. */
function Hat({ hat, color }: { hat: HatStyle; color: string }) {
  switch (hat) {
    case 'circle':
      return <circle cx="0" cy="-13.5" r="2.2" fill={color} />;
    case 'diamond':
      return <polygon points="0,-16.5 2.5,-13.5 0,-10.8 -2.5,-13.5" fill={color} />;
    case 'triangle':
      return <polygon points="0,-16.5 2.8,-11.5 -2.8,-11.5" fill={color} />;
    case 'square':
      return <rect x="-2.2" y="-15.8" width="4.4" height="4.4" fill={color} />;
    case 'crown':
      return (
        <g>
          <polygon points="-4,-10.6 -4,-15.5 -2,-13 0,-16.5 2,-13 4,-15.5 4,-10.6" fill={color} />
          <circle cx="0" cy="-12.4" r="0.8" fill="#05040f" />
        </g>
      );
    case 'horns':
      return (
        <g fill={color}>
          <polygon points="-4.6,-10.6 -5.6,-16 -2.4,-11" />
          <polygon points="4.6,-10.6 5.6,-16 2.4,-11" />
        </g>
      );
    case 'halo':
      return (
        <ellipse
          cx="0"
          cy="-15.5"
          rx="4.6"
          ry="1.6"
          fill="none"
          stroke={color}
          stroke-width="1.3"
        />
      );
  }
}

/** A crater (the game's unit) with a team color and hat. */
export function Avatar({ hat, color, size = 48 }: { hat: HatStyle; color: string; size?: number }) {
  return (
    <svg class="avatar" width={size} height={size} viewBox="-9 -19 18 20" aria-hidden="true">
      <circle cx="0" cy="-6" r="9" fill={color} opacity="0.18" />
      <rect
        x="-5"
        y="-11"
        width="10"
        height="11"
        rx="5"
        fill="#120a24"
        stroke={color}
        stroke-width="1.6"
      />
      <circle cx="1" cy="-7" r="1.7" fill="#fff" />
      <circle cx="3.6" cy="-7" r="1.7" fill="#fff" />
      <circle cx="1.6" cy="-7" r="0.8" fill="#05040f" />
      <circle cx="4.2" cy="-7" r="0.8" fill="#05040f" />
      <Hat hat={hat} color={color} />
    </svg>
  );
}
