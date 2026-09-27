// Builds rabona_final.html from tools/rabona_final.template.html, splicing in
// the APPROVED motion code verbatim from rabona.html (the biomechanical
// reference), so the final page cannot drift from the approved movement.
//
//   node tools/build_final.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const ref = fs.readFileSync(path.join(ROOT, 'rabona.html'), 'utf8').split('\n');
const tpl = fs.readFileSync(path.join(__dirname, 'rabona_final.template.html'), 'utf8');

const SEP = '  // ---------------------------------------------------------------';
function block(startTitle, endTitle) {
  const s = ref.findIndex((l, i) => l.includes(startTitle) && ref[i - 1] === SEP) - 1;
  const e = ref.findIndex((l, i) => i > s && l.includes(endTitle) && ref[i - 1] === SEP) - 1;
  if (s < 0 || e < 0) throw new Error(`markers not found: ${startTitle} / ${endTitle}`);
  return ref.slice(s, e).join('\n');
}
const motion = block('//  Scene constants', '//  Drawing primitives');
const aStart = ref.findIndex((l, i) => l.includes('//  Analysis helpers') && ref[i - 1] === SEP) - 1;
const aEnd = ref.findIndex((l, i) => i > aStart && l.startsWith('  function drawDebug'));
if (aStart < 0 || aEnd < 0) throw new Error('analysis markers not found');
const analysis = ref.slice(aStart, aEnd).join('\n');
const out = tpl.replace('/*@@MOTION@@*/', motion).replace('/*@@ANALYSIS@@*/', analysis);
fs.writeFileSync(path.join(ROOT, 'rabona_final.html'), out);
console.log('rabona_final.html written;', motion.split('\n').length, 'motion lines,', analysis.split('\n').length, 'analysis lines');
