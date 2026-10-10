#!/usr/bin/env node
/**
 * contact-text.js — planche de LISIBILITÉ des textes anatomiques (partie 2).
 * Assemble 10 frames clés (les plus denses en textes) à 960 px de large, en 2 × 5,
 * directement depuis les PNG sans perte (pas depuis la vidéo compressée).
 *
 *   node partie2/contact-text.js [--frames 270,430,…] [--src partie2/frames] [--out partie2/contact_sheet_text.png]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const KEY_FRAMES = [
  270,  // scène 1 : multifide, vecteur et bras de levier en L4/L5
  450,  // scène 1 : coupe axiale L3, transverse, FTL, PIA
  560,  // scène 1 : ballon de PIA, décharge axiale
  760,  // scène 2 : érecteurs, insertions
  1000, // scène 2 : antéflexion 40°, M = F × d
  1210, // scène 2 : vue frontale, carré des lombes
  1560, // scène 3 : psoas, compression, antéversion
  1830, // scène 3 : grand droit, obliques, rétroversion
  2130, // scène 4 : cocontraction, charge axiale
  2300, // scène 4 : zone neutre de Panjabi
];

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const frames = arg('--frames') ? arg('--frames').split(',').map(Number) : KEY_FRAMES;
const src = path.resolve(arg('--src', path.join(__dirname, 'frames')));
const out = path.resolve(arg('--out', path.join(__dirname, 'contact_sheet_text.png')));
const cols = 2, rows = Math.ceil(frames.length / cols);

const list = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-')), 'list.txt');
fs.writeFileSync(list, frames.map((f) => {
  const file = path.join(src, 'frame_' + String(f).padStart(5, '0') + '.png');
  if (!fs.existsSync(file)) throw new Error('frame manquante : ' + file + ' (lancer npm run p2:render)');
  return "file '" + file + "'";
}).join('\n') + '\n');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-vf', `scale=960:-1:flags=lanczos,tile=${cols}x${rows}`, '-frames:v', '1', out], { stdio: 'inherit' });
console.log(`Planche de lisibilité : ${out} (${frames.length} frames, ${cols}×${rows}, 960 px)`);
