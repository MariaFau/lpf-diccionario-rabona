// Verifies rabona_final.html uses exactly the approved motion of rabona.html:
// every joint, the ball path and the analysis agree at 1/240 s steps.
//   node tools/check_motion.js
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const ROOT = 'file://' + path.resolve(__dirname, '..') + '/';
(async () => {
  const b = await chromium.launch();
  const errs = [];
  async function sample(file) {
    const p = await b.newPage();
    p.on('pageerror', e => errs.push(file + ': ' + e.message));
    await p.goto(ROOT + file);
    await p.waitForFunction(() => window.rabona && window.rabona.sampleRig);
    return p.evaluate(() => {
      const out = [];
      for (let i = 0; i <= 2.4 * 240; i++) {
        const t = i / 240, r = window.rabona.sampleRig(t), bs = window.rabona.ballState(t);
        const a = window.rabona.analyze(t);
        out.push([t, ...['pelvis', 'sHip', 'sKnee', 'sAnk', 'kHip', 'kKnee', 'kAnk', 'kToe'].flatMap(k => [r[k].x, r[k].y]),
          bs.x, bs.y, bs.rot, a.shinsCross ? 1 : 0, a.kickLayer === 'behind' ? 1 : 0]);
      }
      return out;
    });
  }
  const A = await sample('rabona.html'), B = await sample('rabona_final.html');
  let maxDiff = 0;
  A.forEach((row, i) => row.forEach((v, j) => { maxDiff = Math.max(maxDiff, Math.abs(v - B[i][j])); }));
  const behindAlways = B.every(r => r[r.length - 1] === 1);
  console.log(JSON.stringify({ samples: A.length, maxDifference: maxDiff, kickLegAlwaysBehind: behindAlways, errors: errs }));
  await b.close();
  process.exit(maxDiff === 0 && behindAlways && !errs.length ? 0 : 1);
})();
