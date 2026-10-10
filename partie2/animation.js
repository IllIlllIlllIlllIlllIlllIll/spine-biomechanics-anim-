/* =============================================================================
 *  PARTIE 2 — LE HAUBANAGE MUSCULAIRE
 *  1920×1080 · 60 fps · 2400 frames (40 s) · Canvas 2D déterministe
 *
 *  renderFrame(frame) est une fonction PURE du numéro de frame.
 *  Ce fichier possède : la timeline globale (posture, caméras, vues et leurs
 *  transitions), le compositeur, le HUD, le cadre du panneau et l'API.
 *  Les scènes (scene1.js … scene4.js) s'enregistrent dans P2.scenes et
 *  dessinent muscles, vecteurs, étiquettes et contenu du panneau.
 *  Voir partie2/SPEC.md pour le contrat des scènes.
 * ========================================================================== */
(function (root) {
  'use strict';
  const SC = root.SpineCore;
  const P2 = (root.P2 = root.P2 || {});
  const {
    W, H, DEG, COL, MONO, SANS, clamp, lerp, seg, smooth, E, fio, vadd, vsub, vmul, vlerp, rgba, mix,
    text, measure, line, arrow, dot, ring, drawGrid, polyPath,
  } = SC;
  const FPS = 60, TOTAL = 2400, T_LAST = (TOTAL - 1) / FPS;

  // =========================================================================
  //  TIMELINE GLOBALE
  // =========================================================================
  const SCENES = [
    { a: 0, b: 10, n: '01', title: 'STABILISATEURS LOCAUX', sub: 'Multifide · transverse de l’abdomen · fascia thoraco-lombaire', ch: 'STABILISATEURS' },
    { a: 10, b: 22, n: '02', title: 'HAUBANAGE POSTÉRIEUR', sub: 'Érecteurs du rachis · carré des lombes', ch: 'ÉRECTEURS' },
    { a: 22, b: 32, n: '03', title: 'SANGLE ANTÉRIEURE', sub: 'Psoas · grand droit · obliques · couples pelviens', ch: 'SANGLE ANTÉRIEURE' },
    { a: 32, b: 40, n: '04', title: 'ÉQUILIBRE DES COUPLES', sub: 'Cocontraction · système actif de Panjabi', ch: 'SYNTHÈSE' },
  ];
  /** Interpolation par clés [t, valeur] avec transitions sinusoïdales. */
  function keys(K, t) {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 0; i < K.length - 1; i++) {
      const [t0, a] = K[i], [t1, b] = K[i + 1];
      if (t >= t0 && t <= t1) return t1 === t0 ? b : lerp(a, b, E.ios((t - t0) / (t1 - t0)));
    }
    return K[K.length - 1][1];
  }
  // Posture (°) : antéflexion du tronc α (60 % lombaire, 40 % hanche), version pelvienne, inclinaison latérale (vue frontale)
  const LEAN_K = [[0, 0], [13.5, 0], [16.0, 40], [16.9, 40], [17.9, 0], [33.0, 0], [34.3, 30], [36.2, 30], [37.0, 0]];
  const TILT_K = [[0, 0], [24.8, 0], [25.9, 6], [26.9, 6], [27.5, 0], [29.5, 0], [30.6, -6], [31.4, -6], [31.9, 0]];
  const BEND_K = [[0, 0], [19.3, 0], [20.1, 10], [20.9, 10], [21.6, 0]];
  const LOAD_K = [[0, 0], [33.0, 0], [33.5, 20], [36.3, 20], [36.9, 0]]; // kg sur les épaules (charge axiale)

  // Caméras de la vue sagittale (repère monde, mm)
  const CAM = {
    lumbo: { f: [-45, -50], s: [600, 575], sc: 1.75 },   // T11 → fémur (scènes 1, 3)
    multi: { f: [25, -58], s: [620, 580], sc: 3.6 },      // L2 → S2 (multifide)
    iap: { f: [-55, -95], s: [620, 580], sc: 1.45 },      // thorax bas → bassin (PIA)
    trunk: { f: [-31, 95], s: [760, 800], sc: 0.72 },     // crâne → fémur (scènes 2, 4)
  };
  const CAM_K = [[0, 'lumbo'], [1.0, 'lumbo'], [1.8, 'multi'], [6.0, 'multi'], [8.0, 'iap'], [10.0, 'iap'], [11.0, 'trunk'],
    [18.3, 'trunk'], [22.0, 'lumbo'], [32.0, 'lumbo'], [33.0, 'trunk'], [40, 'trunk']];
  function camFrom(c) {
    return {
      sc: c.sc,
      w2s: (w) => [c.s[0] + (w[0] - c.f[0]) * c.sc, c.s[1] + (w[1] - c.f[1]) * c.sc],
      s2w: (p) => [c.f[0] + (p[0] - c.s[0]) / c.sc, c.f[1] + (p[1] - c.s[1]) / c.sc],
      def: c,
    };
  }
  /** Caméra interpolée : point visé (monde & écran) linéaire, échelle géométrique. */
  function camAt(K, t, defs) {
    let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
    const [t0, n0] = K[i], [t1, n1] = K[i + 1];
    const A = defs[n0], B = defs[n1];
    const z = t1 === t0 ? 1 : E.io(clamp((t - t0) / (t1 - t0)));
    return camFrom({ f: vlerp(A.f, B.f, z), s: vlerp(A.s, B.s, z), sc: A.sc * Math.pow(B.sc / A.sc, z) });
  }

  /**
   * Vues actives et transitions. Chaque vue : { name, a (opacité), xf: [sx, sy, cx, cy] }
   *  - sag → axial (5,0–6,1) : coupe ; la vue axiale se déplie verticalement depuis le plan de coupe
   *  - axial → sag (8,0–8,5) : fondu
   *  - sag ↔ cor (18,0–18,6 et 22,0–22,6) : bascule (écrasement horizontal)
   */
  const VCX = 640, VCY = 575; // centre des transformations de vue (zone visuelle)
  function viewsAt(t) {
    const out = [];
    const flip = (t0, from, to) => {
      const p = clamp((t - t0) / 0.6);
      if (p < 0.5) out.push({ name: from, a: 1, xf: [Math.max(0.002, 1 - E.io(p * 2)), 1, VCX, VCY] });
      else out.push({ name: to, a: 1, xf: [Math.max(0.002, E.io(p * 2 - 1)), 1, VCX, VCY] });
    };
    if (t < 5.4) out.push({ name: 'sag', a: 1, xf: [1, 1, VCX, VCY] });
    else if (t < 8.0) {
      const sa = 1 - smooth(seg(t, 5.4, 6.0));
      if (sa > 0.002) out.push({ name: 'sag', a: sa, xf: [1, 1, VCX, VCY] });
      const ua = E.io(seg(t, 5.5, 6.1));
      out.push({ name: 'axial', a: smooth(seg(t, 5.45, 5.8)), xf: [1, Math.max(0.002, ua), VCX, P2.cutY || VCY] });
    } else if (t < 8.5) {
      // retour symétrique de l'entrée : la coupe se replie sur son plan pendant que la vue sagittale revient
      const fold = E.io(seg(t, 8.0, 8.35));
      out.push({ name: 'axial', a: 1 - smooth(seg(t, 8.25, 8.45)), xf: [1, Math.max(0.002, 1 - fold), VCX, VCY] });
      out.push({ name: 'sag', a: smooth(seg(t, 8.1, 8.45)), xf: [1, 1, VCX, VCY] });
    } else if (t < 18.0) out.push({ name: 'sag', a: 1, xf: [1, 1, VCX, VCY] });
    else if (t < 18.6) flip(18.0, 'sag', 'cor');
    else if (t < 22.0) out.push({ name: 'cor', a: 1, xf: [1, 1, VCX, VCY] });
    else if (t < 22.6) flip(22.0, 'cor', 'sag');
    else out.push({ name: 'sag', a: 1, xf: [1, 1, VCX, VCY] });
    return out;
  }

  function state(t) {
    const S = { t };
    S.gA = Math.min(smooth(seg(t, 0, 0.8)), 1 - smooth(seg(t, 39.4, T_LAST)));
    S.lean = keys(LEAN_K, t);
    S.posture = { lumbarFlex: 0.6 * S.lean, hipFlex: 0.4 * S.lean, pelvicTilt: keys(TILT_K, t) };
    S.latBend = keys(BEND_K, t);
    S.load = keys(LOAD_K, t);
    S.scene = t < 10 ? 0 : t < 22 ? 1 : t < 32 ? 2 : 3;
    S.views = viewsAt(t);
    return S;
  }

  // =========================================================================
  //  PANNEAU (x 1260 → 1840) — cadre ; contenu fourni par les scènes
  // =========================================================================
  const PX = 1260, PY = 196, PW = 580, PH = 766;
  function drawPanelFrame(ctx, a) {
    if (a <= 0.004) return;
    ctx.fillStyle = rgba('bg', 0.88 * a); ctx.fillRect(PX, PY, PW, PH);
    ctx.strokeStyle = rgba('grey', 0.45 * a); ctx.lineWidth = 1; ctx.strokeRect(PX + 0.5, PY + 0.5, PW - 1, PH - 1);
    ctx.strokeStyle = rgba('cyan', 0.9 * a); ctx.lineWidth = 2;
    for (const [x, y, dx, dy] of [[PX, PY, 1, 1], [PX + PW, PY, -1, 1], [PX, PY + PH, 1, -1], [PX + PW, PY + PH, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x + dx * 18, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * 18); ctx.stroke();
    }
  }
  /** En-tête de panneau (titre cyan à gauche, sous-titre gris à droite, filet). */
  function panelHeader(ctx, s, sub, a, id, col) {
    text(ctx, s, PX + 30, PY + 44, { size: 15, c: col || 'cyan', a, ls: 3, w: 700, id: id + 'h' });
    if (sub) text(ctx, sub, PX + PW - 30, PY + 44, { size: 13, c: 'grey', a, align: 'right', id: id + 's' });
    ctx.strokeStyle = rgba('grey', 0.4 * a); ctx.lineWidth = 1; line(ctx, [PX + 30, PY + 62], [PX + PW - 30, PY + 62]);
  }
  /** Texte avec retour à la ligne automatique ; renvoie la hauteur consommée. */
  function wrap(ctx, s, x, y, maxW, o) {
    o = o || {}; const size = o.size || 14, lh = o.lh || size + 6;
    const words = s.split(' '); let lineS = '', yy = y, n = 0;
    for (const w of words) {
      const test = lineS ? lineS + ' ' + w : w;
      if (lineS && measure(ctx, test, size, o.font, o.w, o.ls) > maxW) { text(ctx, lineS, x, yy, Object.assign({}, o, { id: (o.id || s.slice(0, 12)) + n })); yy += lh; lineS = w; n++; }
      else lineS = test;
    }
    if (lineS) { text(ctx, lineS, x, yy, Object.assign({}, o, { id: (o.id || s.slice(0, 12)) + n })); yy += lh; }
    return yy - y;
  }
  /** Bloc « insertion » : étiquette grise + valeur blanche (avec retour à la ligne). */
  function attachRow(ctx, label, value, x, y, a, o) {
    o = o || {};
    text(ctx, label, x, y, { size: 12, c: o.lc || 'grey', a, ls: 1.5, w: 700, id: (o.id || label) + 'L' });
    return 18 + wrap(ctx, value, x, y + 20, o.maxW || PW - 60, { size: o.size || 14, c: o.c || 'white', a, id: (o.id || label) + 'V' });
  }
  /** Référence bibliographique (petite, grise). */
  function cite(ctx, s, x, y, a, o) { return wrap(ctx, s, x, y, (o && o.maxW) || PW - 60, { size: 12, c: 'grey', a, id: 'cite' + s.slice(0, 14) }); }

  // =========================================================================
  //  HUD
  // =========================================================================
  const VIEW_LABEL = { sag: 'VUE SAGITTALE · PROFIL GAUCHE', axial: 'COUPE AXIALE L3', cor: 'VUE FRONTALE · POSTÉRIEURE' };
  const LEGEND = [['cobalt', 'STABILISATEURS PROFONDS'], ['amber', 'ÉRECTEURS · HAUBANS'], ['crimson', 'FLÉCHISSEURS'], ['teal', 'FORCES · MOMENTS']];
  function niceScale(sc) { for (const mm of [1, 2, 5, 10, 20, 50, 100, 200, 500]) if (mm * sc >= 70) return mm; return 500; }
  function drawVignette(ctx) {
    const g = ctx.createRadialGradient(W * 0.42, H * 0.5, 380, W * 0.5, H * 0.5, 1250);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const top = ctx.createLinearGradient(0, 0, 0, 200);
    top.addColorStop(0, rgba('bg', 0.95)); top.addColorStop(0.62, rgba('bg', 0.9)); top.addColorStop(1, rgba('bg', 0));
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, 200);
    const bot = ctx.createLinearGradient(0, H - 140, 0, H);
    bot.addColorStop(0, rgba('bg', 0)); bot.addColorStop(0.55, rgba('bg', 0.88)); bot.addColorStop(1, rgba('bg', 0.96));
    ctx.fillStyle = bot; ctx.fillRect(0, H - 140, W, 140);
  }
  function drawHUD(ctx, S, mainView, cam) {
    const t = S.t;
    SCENES.forEach((sc, i) => {
      const a = fio(t, sc.a, sc.b, i === 0 ? 0.01 : 0.35, i === 3 ? 0.01 : 0.35);
      if (a <= 0.004) return;
      const slide = 12 * (1 - E.out(seg(t, sc.a, sc.a + 0.5)));
      text(ctx, 'PARTIE 2  ·  ' + sc.n + ' / 04', 80, 74, { size: 15, c: 'cyan', a, ls: 3, w: 700, id: 'hudn' });
      text(ctx, sc.title, 80 + slide, 116, { size: 34, c: 'white', a, ls: 2, w: 600, font: SANS, id: 'hudt' });
      text(ctx, sc.sub, 80 + slide * 0.5, 146, { size: 16, c: 'grey', a, ls: 0.5, id: 'huds' });
    });
    text(ctx, VIEW_LABEL[mainView] || '', 1840, 74, { size: 13, c: 'grey', a: 1, align: 'right', ls: 2, id: 'view' });
    const f = Math.round(t * FPS);
    text(ctx, 'T+' + t.toFixed(2).padStart(5, '0') + ' s  ·  F' + String(f).padStart(4, '0'), 1840, 104, { size: 18, c: 'white', a: 0.9, align: 'right', ls: 1, id: 'tc' });
    // légende des couleurs
    let x = 1840;
    for (let k = LEGEND.length - 1; k >= 0; k--) {
      const [c, s] = LEGEND[k];
      const w = text(ctx, s, x, 142, { size: 12, c: 'grey', a: 1, align: 'right', ls: 0.5, id: 'leg' + k });
      ctx.fillStyle = rgba(c, 1); ctx.fillRect(x - w - 18, 133, 10, 10);
      x -= w + 34;
    }
    // orientation selon la vue
    const ox = 150, oy = 905;
    const lab = mainView === 'cor' ? ['GAUCHE', 'DROITE', 'CRÂNIAL'] : mainView === 'axial' ? ['DROITE', 'GAUCHE', 'ANT'] : ['ANT', 'POST', 'CRÂNIAL'];
    arrow(ctx, [ox, oy], [ox - 48, oy], 'grey', 0.9, { lw: 1.2, head: 7, noGlow: true });
    arrow(ctx, [ox, oy], [ox + 48, oy], 'grey', 0.9, { lw: 1.2, head: 7, noGlow: true });
    arrow(ctx, [ox, oy], [ox, oy - 32], 'grey', 0.9, { lw: 1.2, head: 7, noGlow: true });
    text(ctx, lab[0], ox - 56, oy + 5, { size: 12, c: 'grey', align: 'right', ls: 1, id: 'oL' });
    text(ctx, lab[1], ox + 56, oy + 5, { size: 12, c: 'grey', ls: 1, id: 'oR' });
    text(ctx, lab[2], ox, oy - 40, { size: 12, c: 'grey', align: 'center', ls: 1, id: 'oU' });
    // échelle graphique
    if (cam) {
      const mm = niceScale(cam.sc), L = mm * cam.sc, sy = 962;
      ctx.strokeStyle = rgba('white', 0.9); ctx.lineWidth = 2;
      line(ctx, [80, sy], [80 + L, sy]); line(ctx, [80, sy - 6], [80, sy + 6]); line(ctx, [80 + L, sy - 6], [80 + L, sy + 6]);
      ctx.lineWidth = 1; line(ctx, [80 + L / 2, sy - 3], [80 + L / 2, sy + 3]);
      text(ctx, mm + ' mm', 80 + L + 12, sy + 5, { size: 13, c: 'white', id: 'scale' });
    }
    // frise chronologique (40 s)
    const ty = 1034, x0 = 80, x1 = 1840, tw = x1 - x0;
    ctx.strokeStyle = rgba('grey', 0.5); ctx.lineWidth = 2; line(ctx, [x0, ty], [x1, ty]);
    ctx.strokeStyle = rgba('cyan', 1); line(ctx, [x0, ty], [x0 + (tw * t) / 40, ty]);
    SCENES.forEach((sc, i) => {
      const xs = x0 + (tw * sc.a) / 40, cur = t >= sc.a && t < sc.b;
      ctx.strokeStyle = rgba(cur ? 'cyan' : 'grey', 0.9); ctx.lineWidth = 1.5; line(ctx, [xs, ty - 8], [xs, ty + 8]);
      text(ctx, sc.n + '  ' + sc.ch, xs + 10, ty - 10, { size: 12, c: cur ? 'cyan' : 'grey', ls: 1.5, w: cur ? 700 : 400, id: 'ch' + i });
    });
    dot(ctx, [x0 + (tw * t) / 40, ty], 5, 'cyan', 1);
  }

  // =========================================================================
  //  RENDU
  // =========================================================================
  let CTX = null, DEBUG = '';
  P2.scenes = P2.scenes || [];
  P2.views = P2.views || {};
  const geoMemo = new Map();
  function sagGeometry(P) {
    const key = [P.pelvicTilt, P.lumbarFlex, P.hipFlex].map((v) => v.toFixed(5)).join('|');
    let G = geoMemo.get(key);
    if (!G) { G = P2.anatomy.sagittal(P); if (geoMemo.size > 48) geoMemo.clear(); geoMemo.set(key, G); }
    return G;
  }

  function renderAt(ctx, t) {
    SC.beginLabels();
    SC.setLabelXform(null);
    const S = state(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);

    const G = sagGeometry(S.posture);
    const A = P2.anatomy.anchors(G);
    const camSag = camAt(CAM_K, t, CAM);
    // la vue axiale se déplie depuis le plan de coupe passant par L3
    for (const v of S.views) if (v.name === 'axial' && t < 8) v.xf[3] = camSag.w2s(A.body('L3'))[1];
    // contexte partagé par les scènes pour cette frame
    const F = {
      t, frame: Math.round(t * FPS), S, G, A, camSag, M: {}, P2,
      skel: { a: 1, ribs: 0.5, skull: 0.6, silhouette: 0.3, pelvis: 1, femur: 1, dim: null },
      panel: { PX, PY, PW, PH, header: panelHeader, wrap, attachRow, cite },
    };
    for (const sc of P2.scenes) if (sc.state) sc.state(F);

    let main = 'sag', mainA = -1, mainCam = camSag;
    for (const v of S.views) {
      const view = v.name === 'sag' ? null : P2.views[v.name];
      const cam = v.name === 'sag' ? camSag : view && view.camera ? view.camera(F) : camSag;
      const vis = v.a * v.xf[0] * v.xf[1];   // HUD de la vue la plus visible (opacité × dépliement)
      if (vis > mainA) { mainA = vis; main = v.name; mainCam = cam; }
      const [sx, sy, cx, cy] = v.xf;
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(sx, sy); ctx.translate(-cx, -cy);
      ctx.globalAlpha = S.gA * v.a;
      SC.setLabelXform([sx, sy, cx, cy, v.a]);
      drawGrid(ctx, cam);
      if (v.name === 'sag') {
        for (const sc of P2.scenes) if (sc.sagUnder) sc.sagUnder(ctx, F, cam);
        P2.anatomy.drawSagittal(ctx, G, cam, F.skel);
        for (const sc of P2.scenes) if (sc.sag) sc.sag(ctx, F, cam);
        if (DEBUG === 'anchors') drawAnchorDebug(ctx, A, cam);
      } else if (view && view.draw) view.draw(ctx, F, cam);
      else text(ctx, 'VUE ' + v.name.toUpperCase() + ' — À IMPLÉMENTER', VCX, VCY, { size: 22, c: 'grey', align: 'center', id: 'todo' + v.name });
      ctx.restore();
    }
    SC.setLabelXform(null);
    ctx.globalAlpha = S.gA;
    drawVignette(ctx);
    const pa = fio(t, 0.6, 41, 0.6, 0.1);
    drawPanelFrame(ctx, pa);
    for (const sc of P2.scenes) if (sc.panel) sc.panel(ctx, F, pa);
    drawHUD(ctx, S, main, mainCam);
    ctx.globalAlpha = 1;
    return { t, labels: SC.labels() };
  }

  function drawAnchorDebug(ctx, A, cam) {
    for (const [name, p] of P2.anatomy.anchorCatalog(A)) {
      const s = cam.w2s(p); dot(ctx, s, 3, 'red', 1);
      text(ctx, name, s[0] + 5, s[1] - 4, { size: 10, c: 'white', noreg: true });
    }
  }

  // =========================================================================
  //  API
  // =========================================================================
  function init(canvas, opts) {
    canvas.width = W; canvas.height = H;
    CTX = canvas.getContext('2d', { alpha: false });
    CTX.imageSmoothingQuality = 'high';
    DEBUG = (opts && opts.debug) || '';
    return CTX;
  }
  function renderFrame(frame) {
    if (!CTX) throw new Error('animation non initialisée');
    const f = Math.max(0, Math.min(TOTAL - 1, Math.round(frame)));
    return renderAt(CTX, f / FPS);
  }
  function qaReport(frame) {
    const res = renderFrame(frame), issues = [];
    const L = res.labels.filter((b) => b.a > 0.55);
    for (const b of L) if (b.x0 < 30 || b.x1 > W - 30 || b.y0 < 20 || b.y1 > H - 10) issues.push({ type: 'hors-cadre', id: b.id });
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const p = L[i], q = L[j];
      if (p.id === q.id) continue;
      const ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), oy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
      if (ox > 2 && oy > 2) issues.push({ type: 'chevauchement', a: p.id, b: q.id });
    }
    return issues;
  }

  P2.API = {
    W, H, FPS, TOTAL, init, renderFrame, renderAt: (t) => renderAt(CTX, t), qaReport,
    _internals: { state, keys, camAt, CAM, CAM_K, viewsAt, SCENES, LEAN_K, TILT_K, BEND_K, LOAD_K, PX, PY, PW, PH },
  };
  P2.layout = { PX, PY, PW, PH, VCX, VCY, panelHeader, wrap, attachRow, cite, keys, camFrom, SCENES };
  root.SpineAnim2 = P2.API;
})(typeof window !== 'undefined' ? window : globalThis);
