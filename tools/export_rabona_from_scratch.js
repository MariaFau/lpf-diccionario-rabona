// Renders rabona_from_scratch.html frame-by-frame at a fixed frame rate and
// encodes the result.
//
//   FFMPEG=/path/to/ffmpeg node tools/export_rabona_from_scratch.js [fps]
//
// Output:
//   output/frames/frame_0000.png …   every frame, 1280x720 PNG
//   output/rabona_from_scratch.webm   VP9
//   output/rabona_from_scratch.mp4    H.264 (yuv420p, faststart)
//
// Frames are rendered deterministically: the page is told the exact time of
// each frame (window.rabona.frame(t)), so timing never depends on the
// browser's real-time clock. ffmpeg must include libvpx-vp9 and libx264
// (e.g. the static build shipped with the `imageio-ffmpeg` pip package).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output');
const FRAMES = path.join(OUT, 'frames');
const FPS = +(process.argv[2] || 60);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

(async () => {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.join(ROOT, 'rabona_from_scratch.html') + '?export=1');
  await page.waitForFunction(() => window.rabona && window.rabona.frame);
  const duration = await page.evaluate(() => window.rabona.DURATION);
  const count = Math.round(duration * FPS) + 1;             // includes t = DURATION
  for (let i = 0; i < count; i++) {
    const url = await page.evaluate(t => window.rabona.frame(t), i / FPS);
    fs.writeFileSync(path.join(FRAMES, `frame_${String(i).padStart(4, '0')}.png`),
      Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
  if (errors.length) throw new Error('page errors: ' + errors.join('; '));
  console.log(`rendered ${count} frames at ${FPS} fps (${duration}s)`);

  const input = ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS),
    '-i', path.join(FRAMES, 'frame_%04d.png')];
  execFileSync(FFMPEG, [...input, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-row-mt', '1',
    '-pix_fmt', 'yuv420p', path.join(OUT, 'rabona_from_scratch.webm')], { stdio: 'inherit' });
  execFileSync(FFMPEG, [...input, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'rabona_from_scratch.mp4')], { stdio: 'inherit' });
  console.log('wrote output/rabona_from_scratch.webm and output/rabona_from_scratch.mp4');
})().catch(e => { console.error(e); process.exit(1); });
