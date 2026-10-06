/**
 * Store screenshot definitions: device targets (capture + output sizes), the scenes and their
 * captions (EN + HU), and the HTML of the branded marketing frame a raw game capture is placed on.
 * Used by `tests/e2e/store-screens.spec.ts` (run with `npm run store:screens`).
 *
 * The iOS app is iPhone-only (TARGETED_DEVICE_FAMILY = 1 in the Xcode project), so there is no
 * iPad target. Add one here (13": 1032×1376 @2x) if the app ever ships for iPad.
 */

export type StoreLang = 'en' | 'hu';

export interface StoreTarget {
  /** Playwright project name and output folder (`store/screenshots/<lang>/<id>/`). */
  id: string;
  /** The game is captured at this CSS viewport × device scale factor. */
  capture: { viewport: { width: number; height: number }; scale: number };
  /** The composed frame is rendered at this CSS viewport × scale (= the store's pixel size). */
  output: { viewport: { width: number; height: number }; scale: number };
  /** Device frame corner radius as a fraction of the screenshot width. */
  radius: number;
}

export const STORE_TARGETS: readonly StoreTarget[] = [
  {
    // App Store 6.9" iPhone (the one required iPhone size): 1320 × 2868.
    id: 'ios-6.9',
    capture: { viewport: { width: 440, height: 956 }, scale: 3 },
    output: { viewport: { width: 440, height: 956 }, scale: 3 },
    radius: 0.12,
  },
  {
    // Google Play phone: 1080 × 1920 (9:16; Play rejects a long side > 2× the short side, so the
    // 19.5:9 capture is framed on a 9:16 canvas).
    id: 'android',
    capture: { viewport: { width: 412, height: 915 }, scale: 2.625 },
    output: { viewport: { width: 360, height: 640 }, scale: 3 },
    radius: 0.12,
  },
];

export type SceneId = 'aim' | 'blast' | 'weapons' | 'campaign' | 'daily' | 'team';

export interface Caption {
  /** Headline; the part wrapped in `*…*` gets the accent color. */
  title: string;
  sub: string;
}

export interface SceneDef {
  id: SceneId;
  /** Order in the store (file prefix `NN-`). */
  order: number;
  /** Background accent pair (glows behind the device). */
  accent: [string, string];
  /** Color of the highlighted caption words. */
  highlight: string;
  caption: Record<StoreLang, Caption>;
}

const CYAN = '#3ef0ff';
const PINK = '#ff4fd8';
const AMBER = '#ffc04d';
const LIME = '#a8ff5c';
const VIOLET = '#7a3cff';

export const SCENES: readonly SceneDef[] = [
  {
    id: 'aim',
    order: 1,
    accent: [CYAN, VIOLET],
    highlight: CYAN,
    caption: {
      en: { title: 'Aim. Fling. *Blast!*', sub: 'Slingshot aiming · 5 bot levels' },
      hu: { title: 'Célozz, lőj, *robbants!*', sub: 'Csúzlis célzás · 5 bot-nehézség' },
    },
  },
  {
    id: 'blast',
    order: 2,
    accent: [PINK, AMBER],
    highlight: AMBER,
    caption: {
      en: {
        title: 'Every blast leaves *a crater*',
        sub: 'Fully destructible terrain · 5 map themes',
      },
      hu: {
        title: 'Minden lövés *krátert* hagy',
        sub: 'Teljesen rombolható terep · 5 pályatéma',
      },
    },
  },
  {
    id: 'weapons',
    order: 3,
    accent: [PINK, VIOLET],
    highlight: PINK,
    caption: {
      en: { title: '*16* explosive weapons', sub: 'Cluster bombs, air strikes, girders & more' },
      hu: {
        title: '*16* robbanékony fegyver',
        sub: 'Repeszbomba, légicsapás és még sok más',
      },
    },
  },
  {
    id: 'campaign',
    order: 4,
    accent: [AMBER, PINK],
    highlight: AMBER,
    caption: {
      en: { title: '*30* missions to conquer', sub: '3 chapters · earn stars, unlock hats' },
      hu: {
        title: '*30* küldetés vár rád',
        sub: '3 fejezet · gyűjts csillagokat, nyiss kalapokat',
      },
    },
  },
  {
    id: 'daily',
    order: 5,
    accent: [AMBER, VIOLET],
    highlight: AMBER,
    caption: {
      en: {
        title: 'A new *challenge* every day',
        sub: 'Same battle for everyone · keep the streak',
      },
      hu: {
        title: 'Minden nap *új kihívás*',
        sub: 'Ugyanaz a csata mindenkinek · tartsd a sorozatot',
      },
    },
  },
  {
    id: 'team',
    order: 6,
    accent: [LIME, CYAN],
    highlight: LIME,
    caption: {
      en: { title: 'Make the crew *yours*', sub: 'Name, color & hats · pass & play on one phone' },
      hu: { title: 'Saját csapat, *saját stílus*', sub: 'Név, szín, kalap · ketten egy telefonon' },
    },
  },
];

export function sceneFileName(scene: SceneDef): string {
  return `${String(scene.order).padStart(2, '0')}-${scene.id}.png`;
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `Aim. Fling. *Blast!*` → HTML with the starred part highlighted. */
export function captionHtml(title: string): string {
  return escapeHtml(title).replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/** Deterministic pseudo-random numbers (stable frames; no Math.random). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Two layers of mountain silhouettes and a neon ridge line along the bottom of the frame. */
function mountainsSvg(w: number, h: number, accent: string, seed: number): string {
  const rnd = lcg(seed);
  const layer = (y0: number, amp: number, step: number): string => {
    let d = `M0,${h} L0,${y0.toFixed(1)}`;
    for (let x = 0; x <= w + step; x += step)
      d += ` L${x.toFixed(1)},${(y0 - rnd() * amp).toFixed(1)}`;
    return `${d} L${w},${h} Z`;
  };
  const far = layer(h * 0.8, h * 0.09, w / 7);
  const near = layer(h * 0.88, h * 0.06, w / 11);
  return `<svg class="hills" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <path d="${far}" fill="#1b1040"/>
    <path d="${near}" fill="#120a2c"/>
    <path d="${near}" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="${(w * 0.004).toFixed(2)}"/>
  </svg>`;
}

export interface FrameInput {
  target: StoreTarget;
  scene: SceneDef;
  lang: StoreLang;
  /** `data:image/png;base64,…` of the raw capture. */
  shot: string;
}

/** Full-page HTML of one marketing frame; sizes are relative to the output viewport. */
export function frameHtml({ target, scene, lang, shot }: FrameInput): string {
  const { width: W, height: H } = target.output.viewport;
  const cap = scene.caption[lang];
  const shotAspect = target.capture.viewport.width / target.capture.viewport.height;
  // Caption block takes the top; the device fills the rest with a small bottom margin.
  const captionH = H * 0.215;
  const bottom = H * 0.035;
  let devH = H - captionH - bottom;
  let devW = devH * shotAspect;
  const maxW = W * 0.86;
  if (devW > maxW) {
    devW = maxW;
    devH = devW / shotAspect;
  }
  const bezel = Math.max(3, devW * 0.022);
  const radius = devW * target.radius;
  const longest = Math.max(
    ...cap.title
      .replace(/\*/g, '')
      .split(' ')
      .map((w) => w.length),
  );
  const titleSize = W * 0.088 * (cap.title.length > 26 || longest > 10 ? 0.88 : 1);
  const subSize = W * 0.037;
  const [a1, a2] = scene.accent;
  const px = (n: number): string => `${n.toFixed(2)}px`;
  const seed = scene.order * 97 + W;

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #05040f; }
  body { position: relative; font-family: 'Inter', 'Segoe UI', 'Avenir Next', system-ui, sans-serif; color: #fff; }
  .bg { position: absolute; inset: 0;
    background:
      radial-gradient(ellipse ${px(W * 0.9)} ${px(H * 0.42)} at 10% 6%, ${a1}4d, transparent 70%),
      radial-gradient(ellipse ${px(W * 0.95)} ${px(H * 0.5)} at 95% 62%, ${a2}47, transparent 70%),
      radial-gradient(ellipse ${px(W * 1.3)} ${px(H * 0.3)} at 50% 100%, ${PINK}33, transparent 70%),
      linear-gradient(180deg, #05040f 0%, #120a2e 55%, #2a0f45 100%); }
  .sun { position: absolute; width: ${px(W * 0.9)}; height: ${px(W * 0.9)}; left: ${px(W * 0.05)}; top: ${px(H * 0.5)};
    border-radius: 50%; opacity: .35; filter: blur(${px(W * 0.01)});
    background: linear-gradient(180deg, #ffe08a 0%, #ff8a5c 45%, ${PINK} 100%);
    -webkit-mask-image: repeating-linear-gradient(180deg, #000 0 ${px(W * 0.05)}, transparent ${px(W * 0.05)} ${px(W * 0.062)});
            mask-image: repeating-linear-gradient(180deg, #000 0 ${px(W * 0.05)}, transparent ${px(W * 0.05)} ${px(W * 0.062)}); }
  .stars { position: absolute; inset: 0; opacity: .6;
    background-image:
      radial-gradient(1.2px 1.2px at 20% 30%, #fff, transparent),
      radial-gradient(1px 1px at 70% 12%, #fff, transparent),
      radial-gradient(1.4px 1.4px at 85% 40%, #cfc8ff, transparent),
      radial-gradient(1px 1px at 40% 60%, #fff, transparent),
      radial-gradient(1.2px 1.2px at 10% 75%, #ffd2f0, transparent),
      radial-gradient(1px 1px at 55% 85%, #fff, transparent);
    background-size: ${px(W * 0.5)} ${px(W * 0.5)}; }
  .hills { position: absolute; left: 0; bottom: 0; width: ${W}px; height: ${px(H * 0.5)}; }
  .caption { position: absolute; left: ${px(W * 0.06)}; right: ${px(W * 0.06)}; top: 0; height: ${px(captionH)};
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: ${px(H * 0.011)}; }
  h1 { font-size: ${px(titleSize)}; line-height: 1.05; font-weight: 900; font-style: italic;
    letter-spacing: -0.01em; text-transform: uppercase; text-wrap: balance;
    text-shadow: 0 0 ${px(titleSize * 0.35)} ${a2}99, 0 ${px(titleSize * 0.05)} 0 #00000066; }
  h1 em { font-style: italic; color: ${scene.highlight};
    text-shadow: 0 0 ${px(titleSize * 0.25)} ${scene.highlight}cc, 0 0 ${px(titleSize * 0.6)} ${a1}99, 0 ${px(titleSize * 0.05)} 0 #00000066; }
  p { font-size: ${px(subSize)}; font-weight: 600; letter-spacing: 0.03em; color: #ddd6ff; opacity: .92; text-wrap: balance; }
  .device { position: absolute; left: ${px((W - devW) / 2)}; top: ${px(captionH)}; width: ${px(devW)}; height: ${px(devH)};
    border-radius: ${px(radius)}; padding: ${px(bezel)};
    background: linear-gradient(140deg, ${CYAN}, ${a1} 45%, ${PINK});
    box-shadow: 0 0 ${px(devW * 0.08)} ${a1}88, 0 0 ${px(devW * 0.2)} ${a2}55, 0 ${px(devW * 0.04)} ${px(devW * 0.1)} #000000aa; }
  .screen { width: 100%; height: 100%; border-radius: ${px(radius - bezel)}; overflow: hidden; background: #05040f; }
  .screen img { display: block; width: 100%; height: 100%; }
</style></head>
<body>
  <div class="bg"></div><div class="sun"></div><div class="stars"></div>
  ${mountainsSvg(W, H * 0.5, a1, seed)}
  <div class="caption"><h1>${captionHtml(cap.title)}</h1><p>${escapeHtml(cap.sub).replace(/ · /g, '&nbsp;· ')}</p></div>
  <div class="device"><div class="screen"><img src="${shot}" alt=""></div></div>
</body></html>`;
}
