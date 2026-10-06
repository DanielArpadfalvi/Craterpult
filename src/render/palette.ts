/** Neon palette shared by the canvas renderer and (as CSS variables) the DOM UI. */
export const PALETTE = {
  skyTop: 0x05040f,
  skyBottom: 0x1a0b3a,
  stars: 0xcfd8ff,
  mountainsFar: 0x1d1240,
  mountainsNear: 0x2a1458,
  soil: 0x2b1550,
  soilLine: 0x3a1d6b,
  soilEdge: 0xff4fd8,
  rock: 0x1c2346,
  rockLine: 0x2c3666,
  rockEdge: 0x7f9cff,
  metal: 0x3a4250,
  metalEdge: 0xd7e3ff,
  water: 0x0a2a6b,
  waterEdge: 0x3ef0ff,
  text: 0xf2f0ff,
  danger: 0xff3b5c,
  gold: 0xffd23f,
} as const;

/** Team colors (cyan, pink, lime, amber); teams also differ by hat shape for color blindness. */
export const TEAM_COLORS = [0x3ef0ff, 0xff4fd8, 0x9dff4f, 0xffa53d] as const;
export const TEAM_SHAPES = ['circle', 'diamond', 'triangle', 'square'] as const;

export function teamColor(team: number): number {
  return TEAM_COLORS[team % TEAM_COLORS.length] as number;
}

export function cssColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}
