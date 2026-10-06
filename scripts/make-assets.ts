/// <reference types="node" />
/**
 * Renders the app icon, splash screens and store graphics from code (SVG → Chromium → PNG).
 *
 *   npx tsx scripts/make-assets.ts                       # resources/*.png + store/*.png
 *   npx capacitor-assets generate --android --ios --assetPath resources
 *   npx tsx scripts/make-assets.ts --native-post         # crisp adaptive icons + smaller splashes
 *
 * (`npm run assets` runs all three.) Visual identity follows the in-game neon palette
 * (src/render/palette.ts): a floating island with a glowing pink crater rim, a cyan slingshot and
 * a cyan shot arcing in, on the dark violet night sky. Uses the Chromium that Playwright provides
 * (PLAYWRIGHT_BROWSERS_PATH fallback like playwright.config.ts).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { cssColor, PALETTE } from '../src/render/palette';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESOURCES = join(ROOT, 'resources');
const STORE = join(ROOT, 'store');

const P = PALETTE;
const CYAN = cssColor(P.waterEdge); // #3ef0ff
const PINK = cssColor(P.soilEdge); // #ff4fd8
const SKY_TOP = cssColor(P.skyTop);
const SKY_BOTTOM = cssColor(P.skyBottom);

/** Deterministic pseudo-random sequence for star fields (no Math.random: stable output). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

let uid = 0;
const nextId = (p: string): string => `${p}${uid++}`;
const f = (n: number): string => n.toFixed(1);

// --- primitives ---------------------------------------------------------------------------------

/** Night sky: violet gradient, a soft horizon glow and a seeded star field. */
function backdrop(w: number, h: number, stars = 60, glowAt = 0.72): string {
  const id = nextId('bg');
  const rnd = lcg(w * 31 + h);
  const dots: string[] = [];
  for (let i = 0; i < stars; i++) {
    const x = rnd() * w;
    const y = rnd() * h * 0.75;
    const r = (0.6 + rnd() * 1.6) * Math.max(1, Math.min(w, h) / 700);
    dots.push(
      `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${cssColor(P.stars)}" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}"/>`,
    );
  }
  return `
  <defs>
    <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY_TOP}"/>
      <stop offset="1" stop-color="${SKY_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="${id}glow" cx="0.5" cy="${glowAt}" r="0.65">
      <stop offset="0" stop-color="${PINK}" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#7a3cff" stop-opacity="0.1"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#${id}sky)"/>
  <rect width="${w}" height="${h}" fill="url(#${id}glow)"/>
  <g>${dots.join('')}</g>`;
}

/** Distant mountain silhouettes along the bottom (feature graphic). */
function mountains(w: number, h: number, base: number): string {
  const rnd = lcg(7 + w);
  const layer = (color: string, amp: number, y0: number, step: number): string => {
    let d = `M0,${h} L0,${f(y0)}`;
    for (let x = 0; x <= w + step; x += step) {
      d += ` L${f(x)},${f(y0 - rnd() * amp)}`;
    }
    return `<path d="${d} L${w},${h} Z" fill="${color}"/>`;
  };
  return (
    layer(cssColor(P.mountainsFar), h * 0.22, base, w / 9) +
    layer(cssColor(P.mountainsNear), h * 0.14, base + h * 0.1, w / 13)
  );
}

/**
 * The logo mark in a 1000×1000 box: a floating island whose top is blasted into a crater (pink
 * neon rim), a cyan slingshot on the left lip and a glowing cyan shot arcing in from the top.
 */
function logoMark(): string {
  const id = nextId('m');
  // Island top: flat ground, rounded raised lips, a deep crater bowl between them.
  const top =
    'L318,560 C342,560 352,528 376,528 C398,528 402,552 412,578 ' + // left lip
    'C452,690 648,700 690,578 C700,552 704,528 726,528 C750,528 758,560 784,560 L800,560'; // bowl + right lip
  const island =
    `M150,600 C150,575 175,560 215,560 ${top} C835,560 860,575 860,602 ` +
    'C860,640 820,660 780,690 C740,720 720,770 670,800 C620,830 590,880 520,900 ' +
    'C470,912 440,870 400,830 C350,780 300,760 250,720 C200,690 150,650 150,600 Z';
  // Neon edge along the blasted surface.
  const rim = `M160,585 C170,566 190,560 215,560 ${top} C825,560 845,568 855,585`;
  // Strata lines inside the island.
  const strata = [
    'M200,640 C300,660 360,690 470,720 C560,740 700,720 820,640',
    'M260,720 C340,760 420,790 520,800 C600,805 680,780 760,700',
    'M400,840 C450,860 520,860 600,830',
  ];
  // Slingshot (Y fork) standing on the left lip.
  const fork = 'M262,560 L262,470 M262,470 L222,395 M262,470 L302,395';
  // Shot trajectory: from the slingshot up and over, coming down into the crater.
  const arc = 'M268,360 C330,110 560,60 636,282';
  const ball = { x: 640, y: 330, r: 46 };
  return `
  <defs>
    <linearGradient id="${id}soil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${cssColor(P.soilLine)}"/>
      <stop offset="0.45" stop-color="${cssColor(P.soil)}"/>
      <stop offset="1" stop-color="${SKY_TOP}"/>
    </linearGradient>
    <radialGradient id="${id}ball" cx="0.38" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.35" stop-color="#bffaff"/>
      <stop offset="1" stop-color="${CYAN}"/>
    </radialGradient>
    <radialGradient id="${id}heat" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${PINK}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="${PINK}" stop-opacity="0"/>
    </radialGradient>
    <filter id="${id}wide" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>
    <filter id="${id}soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
    <clipPath id="${id}clip"><path d="${island}"/></clipPath>
  </defs>
  <!-- glow in the crater bowl -->
  <ellipse cx="550" cy="600" rx="230" ry="120" fill="url(#${id}heat)"/>
  <!-- island body -->
  <path d="${island}" fill="${PINK}" opacity="0.55" filter="url(#${id}wide)"/>
  <path d="${island}" fill="url(#${id}soil)"/>
  <g clip-path="url(#${id}clip)" fill="none" stroke="${cssColor(P.mountainsNear)}" stroke-width="10" stroke-linecap="round" opacity="0.9">
    ${strata.map((d) => `<path d="${d}"/>`).join('')}
  </g>
  <path d="${island}" fill="none" stroke="${PINK}" stroke-width="10" opacity="0.55"/>
  <!-- neon crater rim + top edge -->
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${rim}" stroke="${PINK}" stroke-width="34" opacity="0.8" filter="url(#${id}soft)"/>
    <path d="${rim}" stroke="#ffd0f4" stroke-width="12"/>
  </g>
  <!-- trajectory (dashed, fading in) -->
  <g fill="none" stroke-linecap="round">
    <path d="${arc}" stroke="${CYAN}" stroke-width="30" opacity="0.45" filter="url(#${id}soft)" stroke-dasharray="2 46"/>
    <path d="${arc}" stroke="#d6fdff" stroke-width="16" stroke-dasharray="2 46"/>
  </g>
  <!-- slingshot -->
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${fork}" stroke="${CYAN}" stroke-width="48" opacity="0.7" filter="url(#${id}soft)"/>
    <path d="${fork}" stroke="${CYAN}" stroke-width="30"/>
    <path d="${fork}" stroke="#d6fdff" stroke-width="10"/>
    <path d="M222,395 Q262,450 302,395" stroke="${PINK}" stroke-width="10"/>
  </g>
  <!-- the shot -->
  <circle cx="${ball.x}" cy="${ball.y}" r="${ball.r * 2.1}" fill="${CYAN}" opacity="0.55" filter="url(#${id}wide)"/>
  <circle cx="${ball.x}" cy="${ball.y}" r="${ball.r}" fill="url(#${id}ball)"/>`;
}

/** Place the 1000-box logo mark at a given center and size. */
function placedMark(cx: number, cy: number, size: number): string {
  const k = size / 1000;
  return `<g transform="translate(${f(cx - size / 2)} ${f(cy - size / 2)}) scale(${k})">${logoMark()}</g>`;
}

/**
 * "CRATERPULT" word mark: cyan CRATER + pink PULT with a neon glow. `width` is the exact text
 * width (textLength), so the layout does not depend on the installed font's metrics.
 */
function wordmark(cx: number, baseline: number, width: number): string {
  const id = nextId('w');
  const size = width / 5.6;
  const gap = size * 0.06;
  const wCrater = (width - gap) * 0.62;
  const wPult = width - gap - wCrater;
  const x0 = cx - width / 2;
  const font = `font-family="Inter, 'Arial Black', 'DejaVu Sans', sans-serif" font-weight="900" font-size="${f(size)}"`;
  const word = (text: string, x: number, w: number, fill: string, extra = ''): string =>
    `<text x="${f(x)}" y="${f(baseline)}" ${font} textLength="${f(w)}" lengthAdjust="spacingAndGlyphs" fill="${fill}" ${extra}>${text}</text>`;
  const both = (crater: string, pult: string, extra = ''): string =>
    word('CRATER', x0, wCrater, crater, extra) +
    word('PULT', x0 + wCrater + gap, wPult, pult, extra);
  return `
  <defs>
    <filter id="${id}glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="${f(size * 0.12)}"/></filter>
    <filter id="${id}tight" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="${f(size * 0.035)}"/></filter>
  </defs>
  <g opacity="0.9" filter="url(#${id}glow)">${both(CYAN, PINK)}</g>
  <g filter="url(#${id}tight)">${both(CYAN, PINK)}</g>
  ${both('#a6f9ff', '#ffa3ec', `stroke-width="${f(size * 0.05)}" stroke-linejoin="round"`)}
  ${both('none', 'none', `stroke="${'#ffffff'}" stroke-opacity="0.35" stroke-width="${f(size * 0.012)}"`)}`;
}

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

// --- compositions ------------------------------------------------------------------------------

interface Job {
  file: string;
  w: number;
  h: number;
  svg: string;
  /** Transparent background (PNG with alpha). */
  transparent?: boolean;
  /** Encode as a dithered 256-color PNG (large smooth images). */
  palette?: boolean;
}

function jobs(): Job[] {
  const icon = svg(1024, 1024, `${backdrop(1024, 1024, 46)}${placedMark(512, 500, 1000)}`);
  // Adaptive icon layers span the full 108dp canvas (see writeAdaptiveIcons); launchers show the
  // inner 72dp and guarantee only the 66dp circle, so the mark stays inside ~61% of the canvas.
  const fg = svg(1024, 1024, placedMark(512, 505, 640));
  const bg = svg(1024, 1024, backdrop(1024, 1024, 46));
  // Only `splash.png` (no dark variant): the app is dark-only. Portrait phones crop the 2732
  // square to roughly its middle 45 % width, so the word mark stays within ~1150 px.
  const splash = svg(
    2732,
    2732,
    `${backdrop(2732, 2732, 60, 0.6)}${placedMark(1366, 1130, 760)}${wordmark(1366, 1690, 1150)}`,
  );
  const feature = svg(
    1024,
    500,
    `${backdrop(1024, 500, 40, 0.9)}${mountains(1024, 500, 430)}${placedMark(225, 245, 410)}${wordmark(665, 285, 560)}`,
  );
  return [
    { file: join(RESOURCES, 'icon-only.png'), w: 1024, h: 1024, svg: icon },
    { file: join(RESOURCES, 'icon-foreground.png'), w: 1024, h: 1024, svg: fg, transparent: true },
    { file: join(RESOURCES, 'icon-background.png'), w: 1024, h: 1024, svg: bg },
    { file: join(RESOURCES, 'splash.png'), w: 2732, h: 2732, svg: splash, palette: true },
    { file: join(STORE, 'app-store-icon-1024.png'), w: 1024, h: 1024, svg: icon },
    {
      file: join(STORE, 'play-icon-512.png'),
      w: 512,
      h: 512,
      // Same 1024 artwork, scaled down via the viewBox (rendering it at 512 would crop it).
      svg: icon.replace('width="1024" height="1024"', 'width="512" height="512"'),
    },
    { file: join(STORE, 'play-feature-graphic-1024x500.png'), w: 1024, h: 500, svg: feature },
  ];
}

// --- render ------------------------------------------------------------------------------------

function chromiumPath(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const candidate = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers', 'chromium');
  return existsSync(candidate) ? candidate : undefined;
}

/**
 * capacitor-assets writes full-color splash PNGs (~2.5 MB each, ×3 on iOS). The splash is a smooth
 * gradient + logo, so a dithered 256-color palette is visually identical at a fraction of the size.
 */
async function compressNativeSplashes(): Promise<void> {
  const files: string[] = [];
  const res = join(ROOT, 'android/app/src/main/res');
  for (const dir of readdirSync(res)) {
    if (dir.startsWith('drawable') && existsSync(join(res, dir, 'splash.png'))) {
      files.push(join(res, dir, 'splash.png'));
    }
  }
  const ios = join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset');
  if (existsSync(ios)) {
    for (const file of readdirSync(ios)) if (file.endsWith('.png')) files.push(join(ios, file));
  }
  for (const file of files) {
    const before = readFileSync(file);
    const after = await sharp(before)
      .png({ palette: true, quality: 100, dither: 1, compressionLevel: 9 })
      .toBuffer();
    if (after.length < before.length) writeFileSync(file, after);
    console.log(
      `${file.slice(ROOT.length + 1)}: ${before.length} → ${Math.min(after.length, before.length)}`,
    );
  }
}

/**
 * capacitor-assets emits 48dp-sized adaptive layers wrapped in a 16.7% <inset>, which Android then
 * upscales (blurry on xxxhdpi). Write full 108dp layers from resources/ instead, without inset.
 */
async function writeAdaptiveIcons(): Promise<void> {
  const res = join(ROOT, 'android/app/src/main/res');
  const densities: Record<string, number> = {
    ldpi: 0.75,
    mdpi: 1,
    hdpi: 1.5,
    xhdpi: 2,
    xxhdpi: 3,
    xxxhdpi: 4,
  };
  for (const [name, scale] of Object.entries(densities)) {
    const dir = join(res, `mipmap-${name}`);
    if (!existsSync(dir)) continue;
    const px = Math.round(108 * scale);
    for (const layer of ['foreground', 'background'] as const) {
      await sharp(join(RESOURCES, `icon-${layer}.png`))
        .resize(px, px, { kernel: 'lanczos3' })
        .png({ compressionLevel: 9 })
        .toFile(join(dir, `ic_launcher_${layer}.png`));
    }
    console.log(`mipmap-${name}: adaptive layers ${px}px`);
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  for (const file of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    writeFileSync(join(res, 'mipmap-anydpi-v26', file), xml);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--native-post')) {
    await writeAdaptiveIcons();
    await compressNativeSplashes();
    return;
  }
  const only = args;
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  try {
    for (const job of jobs()) {
      if (only.length && !only.some((o) => job.file.includes(o))) continue;
      mkdirSync(dirname(job.file), { recursive: true });
      const page = await browser.newPage({ viewport: { width: job.w, height: job.h } });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent">${job.svg}</body></html>`,
      );
      await page.evaluate(() => document.fonts.ready);
      const shot = await page.screenshot({
        omitBackground: job.transparent ?? false,
        clip: { x: 0, y: 0, width: job.w, height: job.h },
      });
      // Opaque images are written without an alpha channel (App Store rejects icons with alpha).
      const img = sharp(shot);
      await (job.transparent ? img : img.removeAlpha())
        .png(
          job.palette
            ? { palette: true, quality: 100, dither: 1, compressionLevel: 9 }
            : { compressionLevel: 9 },
        )
        .toFile(job.file);
      await page.close();
      console.log(`wrote ${job.file.slice(ROOT.length + 1)}`);
    }
  } finally {
    await browser.close();
  }
}

await main();
