// Renders rabona_final.html frame by frame (deterministic, 30 fps, 1280x720)
// and encodes output/rabona_final.webm (VP9) and output/rabona_final.mp4 (H.264).
// Also writes output/rabona_final_qc.png: the QC moments with rig analysis.
//
//   node tools/export_final.js [framesDir]
//
// Needs Playwright (Chromium) and an ffmpeg with libvpx-vp9 + libx264
// (set FFMPEG=/path/to/ffmpeg; `pip install imageio-ffmpeg` ships one).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'output');
const FRAMES = process.argv[2] || path.join(OUT, 'frames');
function ffmpegBin() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return execFileSync('python3', ['-c', 'import imageio_ffmpeg as i; print(i.get_ffmpeg_exe())']).toString().trim(); }
  catch { return 'ffmpeg'; }
}
const QC_TIMES = [0, 0.45, 0.8, 1.1, 1.35, 1.6, 2.0, 2.4];

(async () => {
  fs.mkdirSync(FRAMES, { recursive: true });
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(ROOT, 'rabona_final.html') + '?export');
  await p.waitForFunction(() => window.rabona);
  const { FPS, DURATION } = await p.evaluate(() => ({ FPS: window.rabona.FPS, DURATION: window.rabona.DURATION }));
  const N = Math.round(DURATION * FPS);            // frames 0..N  (t = 0 … 2.40 s)
  for (let i = 0; i <= N; i++) {
    const d = await p.evaluate((t) => { window.rabona.renderAt(t); return document.getElementById('c').toDataURL('image/png'); }, i / FPS);
    fs.writeFileSync(path.join(FRAMES, `frame_${String(i).padStart(3, '0')}.png`), Buffer.from(d.split(',')[1], 'base64'));
  }
  // QC sheet: the eight inspection moments + the rig analysis for each
  const qc = await p.evaluate(async (times) => {
    const cv = document.getElementById('c'), sheet = document.createElement('canvas');
    const tw = 640, th = 360, cols = 4, pad = 14, head = 26;
    sheet.width = cols * tw + (cols + 1) * pad; sheet.height = 2 * (th + head) + 3 * pad + 40;
    const g = sheet.getContext('2d'); g.fillStyle = '#050505'; g.fillRect(0, 0, sheet.width, sheet.height);
    g.fillStyle = '#efe5cf'; g.font = '600 18px Helvetica, Arial'; g.fillText('LA RABONA · QC MOMENTS (procedural render, 1280×720 @ 30 fps)', pad, 28);
    const rows = [];
    times.forEach((t, i) => {
      window.rabona.renderAt(t);
      const a = window.rabona.analyze(t), x = pad + (i % cols) * (tw + pad), y = 40 + pad + Math.floor(i / cols) * (th + head + pad);
      g.drawImage(cv, x, y + head, tw, th);
      g.fillStyle = '#d6b05a'; g.font = '600 14px Helvetica, Arial';
      g.fillText(`${t.toFixed(2)} s`, x, y + 17);
      g.fillStyle = '#9aa3ad'; g.font = '12px Helvetica, Arial';
      const note = t < 1.6 ? `ball at rest · tip→ball ${a.tipGap.toFixed(1)} px` : t === 1.6 ? 'CONTACT · tip on ball surface' : 'ball in flight';
      g.fillText(`${a.cross ? 'legs crossed (kick leg behind)' : 'legs apart'} · ${note}`, x + 60, y + 17);
      rows.push({ t, cross: a.cross, tipGap: +a.tipGap.toFixed(2), ball: [+a.ball.x.toFixed(1), +a.ball.y.toFixed(1)], supportFoot: a.supportFoot });
    });
    return { png: sheet.toDataURL('image/png'), rows };
  }, QC_TIMES);
  fs.writeFileSync(path.join(OUT, 'rabona_final_qc.png'), Buffer.from(qc.png.split(',')[1], 'base64'));
  // motion checks over every frame
  const check = await p.evaluate((N) => {
    const R = window.rabona, out = { supportFootMoves: 0, ballMovesBeforeContact: 0, minTipGapBefore: 1e9, tipGapAtContact: null, kickLayer: 'behind' };
    for (let i = 0; i <= N; i++) {
      const t = i / R.FPS, a = R.analyze(t), r = R.buildRig(t);
      if (r.sAnk.x !== R.SUPPORT_FOOT.x || r.sAnk.y !== R.SUPPORT_FOOT.y) out.supportFootMoves++;
      if (t < R.T_CONTACT - 1e-9) {
        if (a.ball.moving) out.ballMovesBeforeContact++;
        out.minTipGapBefore = Math.min(out.minTipGapBefore, a.tipGap);
      }
      if (Math.abs(t - R.T_CONTACT) < 1e-9) out.tipGapAtContact = a.tipGap;
    }
    return out;
  }, N);
  await b.close();
  console.log(JSON.stringify({ frames: N + 1, qc: qc.rows, check, errors: errs }, null, 1));

  const ff = ffmpegBin(), src = ['-framerate', String(FPS), '-i', path.join(FRAMES, 'frame_%03d.png')];
  execFileSync(ff, ['-v', 'error', '-y', ...src, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-pix_fmt', 'yuv420p', '-row-mt', '1', path.join(OUT, 'rabona_final.webm')]);
  execFileSync(ff, ['-v', 'error', '-y', ...src, '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'rabona_final.mp4')]);
  console.log('encoded output/rabona_final.webm and output/rabona_final.mp4');
})();
