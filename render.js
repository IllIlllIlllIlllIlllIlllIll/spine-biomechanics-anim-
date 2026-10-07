#!/usr/bin/env node
/**
 * render.js — capture des 1800 frames de l'animation en PNG via Playwright (Chromium headless).
 *
 *   node render.js                      → ./frames/frame_00000.png … frame_01799.png
 *   node render.js --start 600 --end 720 --out frames_test
 *   node render.js --frames 0,450,900   → uniquement ces frames
 *   node render.js --workers 4          → pages en parallèle (frames indépendantes)
 *   node render.js --qa                 → contrôle qualité : chevauchements / sorties de cadre des étiquettes
 *
 * Chaque frame est une fonction pure de son numéro : on peut donc répartir le
 * travail sur plusieurs pages et dans n'importe quel ordre.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const o = { out: 'frames', start: 0, end: 1799, workers: Math.max(1, Math.min(4, os.cpus().length)), qa: false, frames: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--out') { o.out = v; i++; }
    else if (a === '--start') { o.start = parseInt(v, 10); i++; }
    else if (a === '--end') { o.end = parseInt(v, 10); i++; }
    else if (a === '--workers') { o.workers = Math.max(1, parseInt(v, 10)); i++; }
    else if (a === '--frames') { o.frames = v.split(',').map((x) => parseInt(x, 10)); i++; }
    else if (a === '--qa') o.qa = true;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
  }
  return o;
}

async function openPage(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { console.error('[page error]', e.message); process.exitCode = 1; });
  await page.goto(url);
  await page.waitForFunction(() => window.animationReady === true, null, { timeout: 30000 });
  return page;
}

(async () => {
  const opt = parseArgs(process.argv);
  const list = opt.frames || Array.from({ length: opt.end - opt.start + 1 }, (_, k) => opt.start + k);
  const url = 'file://' + path.resolve(__dirname, 'index.html') + '?render';
  const browser = await chromium.launch();
  const t0 = Date.now();

  if (opt.qa) {
    const page = await openPage(browser, url);
    const issues = await page.evaluate((frames) => {
      const out = [];
      for (const f of frames) for (const is of window.SpineAnim.qaReport(f)) out.push(Object.assign({ frame: f }, is));
      return out;
    }, list);
    const groups = new Map();
    for (const is of issues) {
      const key = is.type + ' : ' + (is.id || is.a + ' ↔ ' + is.b);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(is.frame);
    }
    if (!groups.size) console.log(`QA OK — ${list.length} frames, aucun chevauchement ni sortie de cadre.`);
    for (const [k, fr] of groups) console.log(`${k}  (${fr.length} frames : ${fr[0]} … ${fr[fr.length - 1]})`);
    await browser.close();
    process.exitCode = groups.size ? 2 : 0;
    return;
  }

  fs.mkdirSync(opt.out, { recursive: true });
  const pages = await Promise.all(Array.from({ length: Math.min(opt.workers, list.length) }, () => openPage(browser, url)));
  let done = 0;
  await Promise.all(pages.map(async (page, w) => {
    for (let k = w; k < list.length; k += pages.length) {
      const f = list[k];
      const dataUrl = await page.evaluate(async (frame) => {
        await window.seekToFrame(frame);
        return document.getElementById('c').toDataURL('image/png');
      }, f);
      const file = path.join(opt.out, 'frame_' + String(f).padStart(5, '0') + '.png');
      fs.writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
      done++;
      if (done % 60 === 0 || done === list.length) {
        const el = (Date.now() - t0) / 1000;
        process.stdout.write(`\r${done}/${list.length} frames · ${el.toFixed(0)} s · ${(done / el).toFixed(1)} fps   `);
      }
    }
  }));
  process.stdout.write('\n');
  await browser.close();
  console.log(`Terminé : ${list.length} frames dans ${opt.out} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
})().catch((e) => { console.error(e); process.exit(1); });
