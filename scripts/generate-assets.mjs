#!/usr/bin/env node
/*
 * Generates every Pandaro brand asset from the vector sources defined below.
 * Outputs:
 *   assets/*.svg                      vector sources (committed)
 *   public/favicon.svg, public/icons/  PWA icons, apple-touch-icon, social card
 *   android/app/src/main/res/          launcher + adaptive icons, splash (when android/ exists)
 *   ios/App/App/Assets.xcassets/       AppIcon + Splash (when ios/ exists)
 *   docs/store/                        Play feature graphic
 * All artwork is original to this project (MIT licensed with the code).
 */
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const C = {
  forest: '#2F5D46',
  forestDeep: '#244A37',
  bamboo: '#A7C98A',
  ivory: '#F7F3EA',
  fur: '#FFFDF8',
  patch: '#1F1E1B',
  blush: '#E9A6A0',
  charcoal: '#161816',
};

/** Panda face centred at (512, 540) on a 1024 canvas, scaled by `s` around the centre. */
function face(s = 1, { ring = true, mono = false } = {}) {
  const fur = mono ? '#000' : C.fur;
  const patch = mono ? 'none' : C.patch;
  const ringColor = mono ? '#000' : C.bamboo;
  // Progress ring: 300° arc starting at 12 o'clock, clockwise.
  const r = 420;
  const a = (300 / 360) * 2 * Math.PI;
  const ex = 512 + r * Math.sin(a);
  const ey = 512 - r * Math.cos(a);
  const ringPath = `M512 ${512 - r} A${r} ${r} 0 1 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  return `
  <g transform="translate(512 512) scale(${s}) translate(-512 -512)">
    ${ring ? `<path d="${ringPath}" fill="none" stroke="${ringColor}" stroke-width="44" stroke-linecap="round"/>` : ''}
    <circle cx="322" cy="352" r="96" fill="${mono ? '#000' : C.patch}"/>
    <circle cx="702" cy="352" r="96" fill="${mono ? '#000' : C.patch}"/>
    <ellipse cx="512" cy="560" rx="290" ry="255" fill="${fur}"/>
    ${
      mono
        ? `<g fill="#fff"><ellipse cx="420" cy="548" rx="66" ry="88" transform="rotate(28 420 548)"/>
           <ellipse cx="604" cy="548" rx="66" ry="88" transform="rotate(-28 604 548)"/>
           <ellipse cx="512" cy="650" rx="34" ry="25"/></g>`
        : `<ellipse cx="420" cy="548" rx="66" ry="88" transform="rotate(28 420 548)" fill="${patch}"/>
    <ellipse cx="604" cy="548" rx="66" ry="88" transform="rotate(-28 604 548)" fill="${patch}"/>
    <circle cx="426" cy="542" r="24" fill="${C.fur}"/>
    <circle cx="598" cy="542" r="24" fill="${C.fur}"/>
    <circle cx="431" cy="547" r="13" fill="${C.patch}"/>
    <circle cx="603" cy="547" r="13" fill="${C.patch}"/>
    <ellipse cx="512" cy="642" rx="34" ry="25" fill="${C.patch}"/>
    <path d="M478 682 Q495 700 512 682 Q529 700 546 682" fill="none" stroke="${C.patch}" stroke-width="11" stroke-linecap="round"/>
    <ellipse cx="350" cy="660" rx="38" ry="22" fill="${C.blush}" opacity="0.5"/>
    <ellipse cx="674" cy="660" rx="38" ry="22" fill="${C.blush}" opacity="0.5"/>`
    }
  </g>`;
}

const svg = (body, w = 1024, h = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>\n`;

const SOURCES = {
  // Rounded-square icon for browsers and stores ("any" purpose).
  'icon.svg': svg(`<rect width="1024" height="1024" rx="224" fill="${C.forest}"/>${face(0.86)}`),
  // Full-bleed square: iOS applies its own mask; must not contain transparency.
  'icon-ios.svg': svg(`<rect width="1024" height="1024" fill="${C.forest}"/>${face(0.86)}`),
  // Maskable: art within the central 80% safe zone.
  'icon-maskable.svg': svg(`<rect width="1024" height="1024" fill="${C.forest}"/>${face(0.7)}`),
  // Monochrome silhouette for themed icons.
  'icon-monochrome.svg': svg(face(0.7, { mono: true })),
  // Android adaptive icon layers (108dp canvas; keep art inside the 66dp safe circle).
  'adaptive-foreground.svg': svg(face(0.6)),
  'adaptive-background.svg': svg(`<rect width="1024" height="1024" fill="${C.forest}"/>`),
  'adaptive-monochrome.svg': svg(face(0.6, { mono: true })),
  favicon: null,
  'splash.svg': svg(
    `<rect width="2732" height="2732" fill="${C.ivory}"/><g transform="translate(1110 1110) scale(0.5)"><rect width="1024" height="1024" rx="224" fill="${C.forest}"/>${face(0.86)}</g>`,
    2732,
    2732,
  ),
  'splash-dark.svg': svg(
    `<rect width="2732" height="2732" fill="${C.charcoal}"/><g transform="translate(1110 1110) scale(0.5)"><rect width="1024" height="1024" rx="224" fill="${C.forest}"/>${face(0.86)}</g>`,
    2732,
    2732,
  ),
  'social-card.svg': svg(
    `<rect width="1200" height="630" fill="${C.ivory}"/>
     <g transform="translate(90 135) scale(0.35)"><rect width="1024" height="1024" rx="224" fill="${C.forest}"/>${face(0.86)}</g>
     <text x="510" y="300" font-family="Arial Rounded MT Bold, Arial, sans-serif" font-weight="700" font-size="104" fill="${C.patch}">Pandaro</text>
     <text x="514" y="380" font-family="Arial, sans-serif" font-size="44" fill="${C.forest}">Stay focused. Stay panda.</text>
     <text x="514" y="440" font-family="Arial, sans-serif" font-size="30" fill="#5E5A50">A calm Pomodoro timer · private · offline</text>`,
    1200,
    630,
  ),
  'feature-graphic.svg': svg(
    `<rect width="1024" height="500" fill="${C.forest}"/>
     <path d="M0 430 Q256 400 512 430 T1024 430 V500 H0 Z" fill="${C.forestDeep}"/>
     <g fill="${C.bamboo}"><rect x="952" y="110" width="14" height="330" rx="7"/><rect x="986" y="190" width="14" height="250" rx="7"/><path d="M966 170 q30 -22 52 -8 q-24 18 -52 8z"/></g>
     <g transform="translate(70 70) scale(0.34)">${face(1)}</g>
     <text x="450" y="230" font-family="Arial Rounded MT Bold, Arial, sans-serif" font-weight="700" font-size="92" fill="${C.ivory}">Pandaro</text>
     <text x="454" y="300" font-family="Arial, sans-serif" font-size="38" fill="${C.bamboo}">Stay focused. Stay panda.</text>`,
    1024,
    500,
  ),
};

// Circular launcher icon for launchers that request a round icon.
const ROUND_ICON = svg(`<circle cx="512" cy="512" r="512" fill="${C.forest}"/>${face(0.74)}`);

const FAVICON = svg(
  `<rect width="1024" height="1024" rx="300" fill="${C.forest}"/>${face(0.86, { ring: false })}`,
);

async function png(svgText, out, width, height = width, background) {
  await mkdir(dirname(out), { recursive: true });
  let img = sharp(Buffer.from(svgText), { density: 300 }).resize(width, height, {
    fit: 'contain',
    background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (background) img = img.flatten({ background });
  await img.png({ compressionLevel: 9 }).toFile(out);
}

async function main() {
  await mkdir(join(root, 'assets'), { recursive: true });
  for (const [name, text] of Object.entries(SOURCES)) {
    if (text) await writeFile(join(root, 'assets', name), text);
  }
  await writeFile(join(root, 'assets', 'favicon.svg'), FAVICON);
  await writeFile(join(root, 'public', 'favicon.svg'), FAVICON);

  const icons = join(root, 'public', 'icons');
  await png(SOURCES['icon.svg'], join(icons, 'icon-192.png'), 192);
  await png(SOURCES['icon.svg'], join(icons, 'icon-512.png'), 512);
  await png(SOURCES['icon-maskable.svg'], join(icons, 'maskable-512.png'), 512);
  await png(SOURCES['icon-monochrome.svg'], join(icons, 'monochrome-512.png'), 512);
  await png(SOURCES['icon-ios.svg'], join(icons, 'apple-touch-icon.png'), 180, 180, C.forest);
  await png(SOURCES['social-card.svg'], join(icons, 'social-card.png'), 1200, 630);
  await png(
    SOURCES['feature-graphic.svg'],
    join(root, 'docs', 'store', 'feature-graphic.png'),
    1024,
    500,
    C.forest,
  );
  // Google Play applies its own mask, so the store icon is full-bleed with no transparency.
  await png(
    SOURCES['icon-ios.svg'],
    join(root, 'docs', 'store', 'icon-512.png'),
    512,
    512,
    C.forest,
  );

  await androidAssets();
  await iosAssets();
  console.log('Assets generated.');
}

async function androidAssets() {
  const res = join(root, 'android', 'app', 'src', 'main', 'res');
  if (!existsSync(res)) return console.log('android/ not found, skipping Android assets');
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(densities)) {
    const dir = join(res, `mipmap-${d}`);
    await png(SOURCES['icon.svg'], join(dir, 'ic_launcher.png'), Math.round(48 * k));
    await png(ROUND_ICON, join(dir, 'ic_launcher_round.png'), Math.round(48 * k));
    await png(
      SOURCES['adaptive-foreground.svg'],
      join(dir, 'ic_launcher_foreground.png'),
      Math.round(108 * k),
    );
    await png(
      SOURCES['adaptive-background.svg'],
      join(dir, 'ic_launcher_background.png'),
      Math.round(108 * k),
    );
    await png(
      SOURCES['adaptive-monochrome.svg'],
      join(dir, 'ic_launcher_monochrome.png'),
      Math.round(108 * k),
    );
  }
  const anydpi = join(res, 'mipmap-anydpi-v26');
  await mkdir(anydpi, { recursive: true });
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  await writeFile(join(anydpi, 'ic_launcher.xml'), adaptive);
  await writeFile(join(anydpi, 'ic_launcher_round.xml'), adaptive);
  // Splash: Android 12+ uses the launcher icon on windowSplashScreenBackground; older versions use this drawable.
  for (const entry of await readdir(res)) {
    if (entry.startsWith('drawable') && existsSync(join(res, entry, 'splash.png'))) {
      await rm(join(res, entry, 'splash.png'));
    }
  }
  await png(SOURCES['splash.svg'], join(res, 'drawable-nodpi', 'splash.png'), 1280, 1280, C.ivory);
  await png(
    SOURCES['splash-dark.svg'],
    join(res, 'drawable-night-nodpi', 'splash.png'),
    1280,
    1280,
    C.charcoal,
  );
  console.log('Android assets written');
}

async function iosAssets() {
  const xc = join(root, 'ios', 'App', 'App', 'Assets.xcassets');
  if (!existsSync(xc)) return console.log('ios/ not found, skipping iOS assets');
  const iconDir = join(xc, 'AppIcon.appiconset');
  await rm(iconDir, { recursive: true, force: true });
  await png(SOURCES['icon-ios.svg'], join(iconDir, 'AppIcon-512@2x.png'), 1024, 1024, C.forest);
  await writeFile(
    join(iconDir, 'Contents.json'),
    JSON.stringify(
      {
        images: [
          {
            filename: 'AppIcon-512@2x.png',
            idiom: 'universal',
            platform: 'ios',
            size: '1024x1024',
          },
        ],
        info: { author: 'xcode', version: 1 },
      },
      null,
      2,
    ),
  );
  const splashDir = join(xc, 'Splash.imageset');
  await rm(splashDir, { recursive: true, force: true });
  for (const scale of ['', '-1', '-2']) {
    await png(
      SOURCES['splash.svg'],
      join(splashDir, `splash-2732x2732${scale}.png`),
      2732,
      2732,
      C.ivory,
    );
  }
  await png(
    SOURCES['splash-dark.svg'],
    join(splashDir, 'splash-2732x2732-dark.png'),
    2732,
    2732,
    C.charcoal,
  );
  await writeFile(
    join(splashDir, 'Contents.json'),
    JSON.stringify(
      {
        images: [
          { idiom: 'universal', filename: 'splash-2732x2732-2.png', scale: '1x' },
          { idiom: 'universal', filename: 'splash-2732x2732-1.png', scale: '2x' },
          { idiom: 'universal', filename: 'splash-2732x2732.png', scale: '3x' },
          {
            idiom: 'universal',
            filename: 'splash-2732x2732-dark.png',
            scale: '1x',
            appearances: [{ appearance: 'luminosity', value: 'dark' }],
          },
        ],
        info: { version: 1, author: 'xcode' },
      },
      null,
      2,
    ),
  );
  console.log('iOS assets written');
}

await main();
