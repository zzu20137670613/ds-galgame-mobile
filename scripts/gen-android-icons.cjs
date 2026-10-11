// 从 public/icon.png 生成 Android mipmap 图标（替换默认 Android 机器人）
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const SRC = path.resolve(__dirname, "..", "public/icon.png");
const RES = path.resolve(__dirname, "..", "android/app/src/main/res");

// mipmap launcher icons (pre-API 26 fallback)
const MIPMAP_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// adaptive icon foreground (API 26+), 108dp base
const FOREGROUND_SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

async function main() {
  // 1. Mipmap launcher icons (square, exact size)
  for (const [density, size] of Object.entries(MIPMAP_SIZES)) {
    const dir = path.join(RES, `mipmap-${density}`);
    await sharp(SRC).resize(size, size).png().toFile(path.join(dir, "ic_launcher.png"));
    await sharp(SRC).resize(size, size).png().toFile(path.join(dir, "ic_launcher_round.png"));
    console.log(`  mipmap-${density}: ${size}x${size}`);
  }

  // 2. Adaptive icon foreground (API 26+): icon centered inside 108dp canvas
  for (const [density, size] of Object.entries(FOREGROUND_SIZES)) {
    const dir = path.join(RES, `mipmap-${density}`);
    const iconSize = Math.round(size * 0.65); // 65% of canvas = within safe zone
    const icon = await sharp(SRC).resize(iconSize, iconSize).png().toBuffer();
    const left = Math.round((size - iconSize) / 2);
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: icon, left, top: left }])
      .png()
      .toFile(path.join(dir, "ic_launcher_foreground.png"));
    console.log(`  mipmap-${density} foreground: ${size}x${size} (icon ${iconSize}x${iconSize})`);
  }

  // 3. Update ic_launcher background color → DeepSeek blue
  const colorXml = path.join(RES, "values/ic_launcher_background.xml");
  fs.writeFileSync(
    colorXml,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#00A3DC</color>\n</resources>\n`,
  );
  console.log("  background color → #00A3DC (DeepSeek blue)");

  // 4. Replace foreground vector drawable → use the PNG mipmap instead (already handled above)
  //    The adaptive-icon XML already references @mipmap/ic_launcher_foreground, so no change needed

  console.log("\nDone! Android icons generated from public/icon.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});