// Quick look: renders given times of rabona_final.html to PNGs.
//   node tools/snap.js out_dir t1 t2 ... [--debug]
const fs = require('fs'), path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
(async () => {
  const [out, ...rest] = process.argv.slice(2);
  const dbg = rest.includes('--debug'), times = rest.filter((x) => x !== '--debug').map(Number);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(), p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('file://' + path.resolve(__dirname, '..', 'rabona_final.html') + '?export' + (dbg ? '&debug' : ''));
  await p.waitForFunction(() => window.rabona);
  for (const t of times) {
    const d = await p.evaluate((t) => { window.rabona.renderAt(t); return document.getElementById('c').toDataURL('image/png'); }, t);
    fs.writeFileSync(path.join(out, `t${t.toFixed(2)}.png`), Buffer.from(d.split(',')[1], 'base64'));
    console.log(t, JSON.stringify(await p.evaluate((t) => { const a = window.rabona.analyze(t); return { tip: +a.tipGap.toFixed(1), cross: a.cross, side: a.kickAnkleSide, ank: +a.ankleToShin.toFixed(1) }; }, t)));
  }
  if (errs.length) console.log('ERRORS', errs);
  await b.close();
})();
