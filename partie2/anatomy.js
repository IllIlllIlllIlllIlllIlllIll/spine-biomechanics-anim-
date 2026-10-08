/* =============================================================================
 *  partie2/anatomy.js — squelette sagittal de la partie 2 (fonctions pures)
 *
 *  Étend le modèle rachidien de lib/core.js avec : bassin (os coxal, vue
 *  latérale), fémur proximal, gril costal (12 paires, cartilages, sternum),
 *  crâne, silhouette cutanée, paroi abdominale, diaphragme et cavité
 *  abdominale. Fournit un modèle de POSTURE (version pelvienne, flexion
 *  lombaire, flexion de hanche) et une API d'ANCRAGES pour les muscles.
 *
 *  Repère monde (mm) : x = postérieur (+), y = caudal (+), origine = centre du
 *  plateau de S1 en posture neutre. Fémur fixe (pied au sol).
 * ========================================================================== */
(function (root) {
  'use strict';
  const SC = root.SpineCore || (typeof require === 'function' ? require('../lib/core.js') : null);
  const P2 = (root.P2 = root.P2 || {});

  // Texte secondaire : le gris des tracés (#5a6b80, 3,4:1 sur le fond) est trop sombre pour du texte de 12–13 px.
  // Partie 2 seulement : les textes demandés en 'grey' utilisent 'greyT' (5,3:1) ; les tracés gardent 'grey'.
  if (!SC.text.__greyT) {
    SC.addColors({ greyT: '#7a8ba1' });
    const _text = SC.text;
    SC.text = (ctx, s, x, y, o) => _text(ctx, s, x, y, o && o.c === 'grey' ? Object.assign({}, o, { c: 'greyT' }) : o);
    SC.text.__greyT = true;
  }
  const {
    DEG, clamp, lerp, smooth, vadd, vsub, vmul, vlen, vnorm, vlerp, vrot, vrotAbout, perp, toW, toL,
    LV, IX, NL, NS, sAt, WLUM, WTHO, WCER, A_L, A_T, A_C, TARGET, SAC_LEN, SAC_KYPH, integrate,
    geometry, frameAt, CURVE_FINAL, tplOf, tplScale, rgba, roundedPath, polyPath, smoothPath,
  } = SC;

  // ------------------------------------------------------------------ bassin
  // Pente sacrée de référence = celle de la partie 1 (équilibre résolu) ≈ 31,7°.
  const SS0 = CURVE_FINAL.phi0;
  const PI_DEG = 50;            // incidence pelvienne (Legaye) : PI = PT + SS
  const HIP_D = 100;            // distance centre du plateau S1 → axe bicoxo-fémoral (mm)
  const PT0 = PI_DEG - SS0;     // version pelvienne ≈ 18°
  const HIP0 = [-HIP_D * Math.sin(PT0 * DEG), HIP_D * Math.cos(PT0 * DEG)];

  // Repères de l'os coxal, vue latérale gauche, posture neutre (mm, monde).
  const PELVIS_LM = {
    ASIS: [-100, 18], AIIS: [-90, 52], iliopubic: [-66, 74], pubicTubercle: [-103, 112],
    symphysisTop: [-100, 120], symphysisBot: [-90, 160], ischialTuber: [-8, 160],
    ischialSpine: [12, 112], PIIS: [48, 45], PSIS: [60, 18], crestTop: [-15, -52],
    iliacTubercle: [-72, -30], acetabulum: HIP0, obturator: [-62, 136],
  };
  // Contour de l'os coxal (sens horaire depuis l'EIAS) [x, y, rayon d'arrondi]
  const PELVIS_OUTLINE = [
    [-100, 18, 6], [-93, 38, 5], [-90, 52, 5], [-74, 66, 6], [-66, 74, 4], [-88, 98, 8], [-103, 112, 5],
    [-101, 122, 4], [-91, 160, 6], [-70, 166, 10], [-40, 168, 12], [-10, 166, 10], [2, 150, 8],
    [6, 128, 6], [12, 112, 3], [21, 94, 12], [30, 74, 12], [40, 57, 8], [48, 45, 4], [60, 18, 6],
    [56, -6, 14], [38, -32, 20], [10, -50, 24], [-20, -54, 24], [-55, -40, 22], [-72, -30, 14],
    [-86, -10, 16],
  ];
  // Crête iliaque paramétrée de l'EIAS (u = 0) à l'EIPS (u = 1)
  const CREST = [[-100, 18], [-86, -10], [-72, -30], [-55, -40], [-20, -54], [10, -50], [38, -32], [56, -6], [60, 18]];

  // ------------------------------------------------------------------ fémur
  // Repère : origine au centre de la tête fémorale, axes du monde (fémur fixe).
  const FEMUR = {
    headR: 23,
    outline: [[14, -6, 6], [24, 28, 10], [27, 50, 4], [22, 64, 4], [16, 90, 30], [15, 290, 2], [-13, 290, 2],
      [-14, 90, 30], [-15, 52, 12], [-19, 28, 10], [-20, 6, 6]],
    lesserTrochanter: [27, 56], greaterTrochanter: [16, -4], shaft: [1, 200],
  };

  // ------------------------------------------------------------------ posture → courbe
  /**
   * Courbe rachidienne à pente sacrée imposée (pas d'équilibre automatique).
   * aL : amplitude de la lordose lombaire (1 = 50°), phi0 : pente sacrée (°).
   */
  function curveFixed(aL, phi0) {
    const phi = new Float64Array(NS), X = new Float64Array(NS), Y = new Float64Array(NS);
    for (let i = 0; i < NS; i++) {
      const s = sAt(i);
      phi[i] = (s >= 0 ? aL * A_L * WLUM[i] + A_T * WTHO[i] + A_C * WCER[i] : SAC_KYPH * (s / SAC_LEN)) + phi0;
    }
    integrate(phi, X, Y);
    return { phi, X, Y, phi0 };
  }

  /**
   * Géométrie sagittale complète pour une posture donnée.
   * P = { pelvicTilt (° , + antéversion), lumbarFlex (°), hipFlex (°) }
   *  - antéversion : le bassin bascule autour des hanches, la lordose augmente
   *    d'autant (le tronc reste vertical) ;
   *  - flexion lombaire : la lordose diminue ;
   *  - flexion de hanche : bassin + rachis basculent ensemble vers l'avant.
   */
  function sagittal(P) {
    P = P || {};
    const tilt = P.pelvicTilt || 0, lflex = P.lumbarFlex || 0, hflex = P.hipFlex || 0;
    const aL = (TARGET.LL + tilt - lflex) / TARGET.LL;
    const C = curveFixed(aL, SS0);
    const rho = tilt + hflex; // rotation du bassin (°, + = vers l'avant)
    const G = geometry(C, 0, HIP0, rho, HIP0);
    const g = -rho * DEG;
    const R = (p) => vrotAbout(p, HIP0, g);
    G.posture = { pelvicTilt: tilt, lumbarFlex: lflex, hipFlex: hflex, rho, aL, LL: TARGET.LL * aL, SS: SS0 + rho, trunk: lflex + hflex };
    G.hip = HIP0;
    G.pelvisR = R;
    G.pelvisRot = g;
    G.pelvis = PELVIS_OUTLINE.map((p) => { const q = R(p); return [q[0], q[1], p[2]]; });
    G.pelvisLM = {};
    for (const k in PELVIS_LM) G.pelvisLM[k] = R(PELVIS_LM[k]);
    G.crest = CREST.map(R);
    G.femur = FEMUR.outline.map((p) => [HIP0[0] + p[0], HIP0[1] + p[1], p[2]]);
    G.ribs = buildRibs(G);
    G.skull = buildSkull(G);
    G.wall = buildWall(G);
    G.back = buildBack(G);
    return G;
  }

  // ------------------------------------------------------------------ spline de Catmull-Rom
  function catmull(pts, n) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // ------------------------------------------------------------------ repères solidaires
  // Un point défini en coordonnées MONDE de la posture neutre est transporté
  // avec le solide de référence (thorax = T7, tête = C1) : translation + rotation.
  const G_N = SC.G_FINAL;
  const frameAngle = (F) => Math.atan2(F.x[1], F.x[0]);
  function rigidMap(G, n) {
    const V0 = G_N.lv[IX[n]].F, V = G.lv[IX[n]].F, d = frameAngle(V) - frameAngle(V0);
    return (q) => vadd(V.o, vrot(vsub(q, V0.o), d));
  }

  // ------------------------------------------------------------------ gril costal
  // Arc postérieur (tête, tubercule, angle) dans le repère de chaque vertèbre Ti ;
  // partie antérieure (jonctions chondro-costales, cartilages, sternum) dans le
  // repère solidaire du thorax (T7), coordonnées monde de la posture neutre.
  const STERNUM_N = { jugular: [-62, -478], angle: [-74, -440], xiphJ: [-104, -292], xiphoid: [-106, -262] };
  const RIB_U = [0, 0.03, 0.17, 0.33, 0.48, 0.63, 0.78, 0.93];
  function ribAntN(i) {
    const X = STERNUM_N.xiphJ, J = STERNUM_N.jugular;
    if (i <= 7) { const s = vlerp(J, X, RIB_U[i]); return { st: s, cc: vadd(s, [18 + 5 * i, 6 + 7 * i]) }; }
    const s7 = vlerp(J, X, RIB_U[7]);
    const off = { 8: [60, 85], 9: [75, 112], 10: [92, 138], 11: [120, 160], 12: [150, 176] }[i];
    return { st: null, cc: vadd(s7, off) };
  }
  function buildRibs(G) {
    const TH = rigidMap(G, 'T7');
    const ribs = [];
    for (let i = 1; i <= 12; i++) {
      const V = G.lv[IX['T' + i]], D = V.L.D, Hh = V.L.H, k = i / 12;
      const W = (p) => toW(V.F, p);
      const head = W([D / 2 - 1, -Hh / 2 + 4]), tub = W([D / 2 + 13, -Hh / 2 + 3]), angle = W([D / 2 + 26 + 10 * k, 2 + 5 * k]);
      const an = ribAntN(i), ant = TH(an.cc);
      const mid = vadd(vlerp(angle, ant, 0.5), vrot([-8, 22 + 1.5 * i], frameAngle(G.lv[IX.T7].F) - frameAngle(G_N.lv[IX.T7].F)));
      const ctrl = [head, tub, angle, mid, ant];
      ribs[i] = { i, ctrl, angle, ant, head, path: catmull(ctrl, 10), st: an.st ? TH(an.st) : null };
    }
    // cartilages : côtes 1–7 → sternum ; 8–10 → cartilage sus-jacent (rebord costal) ; 11–12 flottantes
    for (let i = 1; i <= 7; i++) ribs[i].cart = vlerp(ribs[i].ant, ribs[i].st, 0.55);
    for (let i = 8; i <= 10; i++) { ribs[i].st = vlerp(ribs[i - 1].ant, ribs[i - 1].st, 0.45); ribs[i].cart = vlerp(ribs[i].ant, ribs[i].st, 0.5); }
    ribs[11].cart = ribs[11].ant; ribs[12].cart = ribs[12].ant;
    ribs.sternum = [TH(STERNUM_N.jugular), TH(STERNUM_N.angle), ...[3, 4, 5, 6, 7].map((i) => ribs[i].st), TH(STERNUM_N.xiphJ)];
    ribs.xiphJ = TH(STERNUM_N.xiphJ);
    ribs.xiphoid = TH(STERNUM_N.xiphoid);
    ribs.margin = [ribs.xiphJ, ribs[7].st, ribs[8].st, ribs[8].ant, ribs[9].ant, ribs[10].ant];
    ribs.map = TH;
    return ribs;
  }

  // ------------------------------------------------------------------ crâne
  // Repère de C1 (x postérieur, y caudal). Silhouette stylisée + repères.
  const SKULL_OUT = [
    [62, -34, 10], [55, -82, 40], [20, -132, 50], [-35, -148, 50], [-88, -118, 40], [-104, -78, 14], [-110, -58, 8],
    [-104, -34, 10], [-112, -14, 8], [-100, 6, 8], [-96, 32, 10], [-78, 48, 12], [-42, 40, 14], [-24, 20, 10],
    [-6, 6, 8], [16, 2, 4], [24, -6, 6], [44, -12, 10],
  ];
  const SKULL_LM = { mastoid: [20, 0], occiput: [62, -34], nuchal: [52, -20], ear: [4, -22] };
  function buildSkull(G) {
    const C1n = G_N.lv[IX.C1].F.o, M = rigidMap(G, 'C1');
    const W = (p) => M(vadd(C1n, p));
    const lm = {};
    for (const k in SKULL_LM) lm[k] = W(SKULL_LM[k]);
    return { outline: SKULL_OUT.map((p) => { const q = W(p); return [q[0], q[1], p[2]]; }), lm };
  }

  // ------------------------------------------------------------------ paroi abdominale, dos
  function bez2(a, c, b, t) { return vadd(vadd(vmul(a, (1 - t) * (1 - t)), vmul(c, 2 * (1 - t) * t)), vmul(b, t * t)); }
  function buildWall(G) {
    const xi = G.ribs.xiphoid, pub = G.pelvisLM.symphysisTop;
    const L3 = G.lv[IX.L3];
    const ctrl = toW(L3.F, [-185, 4]);
    const inner = []; for (let k = 0; k <= 24; k++) inner.push(bez2(xi, ctrl, pub, k / 24));
    // normale extérieure (vers l'avant)
    const skin = inner.map((p, k) => {
      const a = inner[Math.max(0, k - 1)], b = inner[Math.min(inner.length - 1, k + 1)];
      let n = vnorm(perp(vsub(b, a))); if (n[0] > 0) n = vmul(n, -1);
      return vadd(p, vmul(n, 16));
    });
    const umbilicus = bez2(xi, ctrl, pub, 0.58);
    // diaphragme : xiphoïde → coupole (en avant de T9) → piliers (face antérieure de L1–L2)
    const T9 = G.lv[IX.T9], L1 = G.lv[IX.L1], L2 = G.lv[IX.L2];
    const dome = toW(T9.F, [-70, -12]);
    const crus = toW(L2.F, [-L2.L.D / 2 - 2, 0]);
    const diaph = [];
    for (let k = 0; k <= 12; k++) diaph.push(bez2(xi, vadd(dome, [-10, -30]), dome, k / 12));
    for (let k = 1; k <= 12; k++) diaph.push(bez2(dome, toW(L1.F, [-L1.L.D / 2 - 30, -30]), crus, k / 12));
    // plancher pelvien : symphyse → coccyx
    const cocc = frameAt(G.C, -SAC_LEN + 4).o;
    const coccW = G.pelvisR ? G.pelvisR(cocc) : cocc;
    const floor = []; for (let k = 0; k <= 10; k++) floor.push(bez2(G.pelvisLM.symphysisBot, vadd(vlerp(G.pelvisLM.symphysisBot, coccW, 0.5), [0, 24]), coccW, k / 10));
    // cavité abdomino-pelvienne : diaphragme, rachis lombaire, sacrum, plancher, paroi
    const spineFront = [];
    for (const n of ['L2', 'L3', 'L4', 'L5']) { const V = G.lv[IX[n]]; spineFront.push(toW(V.F, [-V.L.D / 2 - 14, 0])); }
    spineFront.push(vadd(G.s1TA, [-6, 6]));
    const sacFront = [];
    for (let s = -10; s >= -SAC_LEN + 8; s -= 16) { const F = frameAt(G.C, s); sacFront.push(G.pelvisR(vadd(F.o, vmul(F.x, -12)))); }
    const cavity = [...diaph, ...spineFront, ...sacFront, ...floor.slice().reverse(), ...inner.slice().reverse()];
    return { inner, skin, umbilicus, diaph, floor, cavity, ctrl };
  }
  function buildBack(G) {
    // peau du dos : 22 mm en arrière des pointes épineuses ; nuque ; fesse
    const pts = [];
    for (let i = 1; i < NL; i++) {
      const V = G.lv[i];
      const lam = V.loc.lamTpl; if (!lam) continue;
      let tip = lam[0]; for (const p of lam) if (p[0] > tip[0]) tip = p;
      pts.push(toW(V.F, [tip[0] + 20, tip[1]]));
    }
    const sk = G.skull.lm;
    const buttock = [G.pelvisR([92, 60]), G.pelvisR([86, 150]), G.pelvisR([52, 210])];
    return [vadd(sk.occiput, [8, 10]), ...pts, ...buttock];
  }

  // ------------------------------------------------------------------ ancrages
  /** API d'ancrages (points monde recalculés à chaque frame selon la posture). */
  function anchors(G) {
    const vert = (n) => G.lv[IX[n]];
    const A = {
      G,
      /** point local (mm) dans le repère de la vertèbre n */
      v: (n, p) => toW(vert(n).F, p),
      /** point du GABARIT (unités du gabarit lombaire/thoracique/cervical, mises à l'échelle) */
      vt: (n, p) => { const V = vert(n), [sx, sy] = tplScale(V.L); return toW(V.F, [p[0] * sx, p[1] * sy]); },
      /** centre du corps vertébral */
      body: (n) => vert(n).F.o,
      /** centre du disque sous la vertèbre n (ex. 'L4' → disque L4/L5 ; 'L5' → L5/S1) */
      disc: (n) => {
        const i = IX[n], V = G.lv[i];
        const lo = i + 1 < NL ? [G.lv[i + 1].TA, G.lv[i + 1].TP] : [G.s1TA, G.s1TP];
        return vlerp(vlerp(V.BA, V.BP, 0.5), vlerp(lo[0], lo[1], 0.5), 0.5);
      },
      /** processus mamillaire (bord postérieur du PAS) */
      mam: (n) => A.vt(n, [45.6, -15.5]),
      /** pointe et bord inférieur du processus épineux (lombaires) */
      spinTip: (n) => A.vt(n, [78.5, 5.5]),
      spinInf: (n, u) => A.vt(n, [lerp(56, 75, u == null ? 0.5 : u), 11.2]),
      /** processus costiforme / transverse (projection sagittale) */
      tp: (n) => A.vt(n, [30, -5]),
      /** face dorsale du sacrum, s ∈ [−100, −5] (mm le long du sacrum) */
      sac: (s, off) => {
        const F = frameAt(G.C, s), u = -s / SAC_LEN;
        const hw = 5 + 44 * Math.pow(1 - u, 1.25) + (off || 0);
        return G.pelvisR(vadd(F.o, vmul(F.x, hw)));
      },
      /** crête sacrée médiane (légèrement en arrière de la face dorsale) */
      sacCrest: (s) => A.sac(s, 3),
      /** repère du bassin : ASIS, AIIS, PSIS, PIIS, iliopubic, pubicTubercle, symphysisTop/Bot, crestTop… */
      pel: (k) => G.pelvisLM[k],
      /** point quelconque de l'os coxal donné en coordonnées NEUTRES (ex. fosse iliaque [-40, 0]) */
      pelN: (p) => G.pelvisR(p),
      /** point quelconque du thorax donné en coordonnées monde NEUTRES (solidaire de T7) */
      thN: (p) => G.ribs.map(p),
      /** crête iliaque, u = 0 (EIAS) → 1 (EIPS) */
      crest: (u) => { const n = G.crest.length - 1, f = clamp(u) * n, k = Math.min(n - 1, Math.floor(f)); return vlerp(G.crest[k], G.crest[k + 1], f - k); },
      /** ligament inguinal, u = 0 (EIAS) → 1 (tubercule pubien) */
      inguinal: (u) => vlerp(G.pelvisLM.ASIS, G.pelvisLM.pubicTubercle, u),
      /** fémur : 'head', 'lesserTrochanter', 'greaterTrochanter', 'shaft' */
      fem: (k) => (k === 'head' ? G.hip : vadd(G.hip, FEMUR[k])),
      /** côte i : u = 0 tête → 1 extrémité antérieure ; angle costal */
      rib: (i, u) => { const p = G.ribs[i].path, f = clamp(u) * (p.length - 1), k = Math.min(p.length - 2, Math.floor(f)); return vlerp(p[k], p[k + 1], f - k); },
      ribAngle: (i) => G.ribs[i].angle,
      /** cartilage costal i (extrémité sternale ou sur le rebord costal) */
      cart: (i) => G.ribs[i].cart || G.ribs[i].ant,
      xiphoid: () => G.ribs.xiphoid,
      sternum: (u) => { const p = G.ribs.sternum, f = clamp(u) * (p.length - 1), k = Math.min(p.length - 2, Math.floor(f)); return vlerp(p[k], p[k + 1], f - k); },
      /** paroi abdominale (face profonde), u = 0 xiphoïde → 1 symphyse */
      wall: (u) => { const p = G.wall.inner, f = clamp(u) * (p.length - 1), k = Math.min(p.length - 2, Math.floor(f)); return vlerp(p[k], p[k + 1], f - k); },
      umbilicus: () => G.wall.umbilicus,
      /** crâne : 'mastoid', 'occiput', 'nuchal' */
      skull: (k) => G.skull.lm[k],
      /** centre de masse du haut du corps (tête-bras-tronc au-dessus de L4/L5) */
      comHAT: () => G.ribs.map([-24, -290]),
      /** appui d'une charge sur les épaules (trapèzes, en arrière de C7–T1) */
      shoulder: () => toW(vert('T1').F, [46, -26]),
      hip: () => G.hip,
    };
    return A;
  }

  // ------------------------------------------------------------------ dessin du squelette
  const BONE = 'cyan';
  function W2S(cam, p) { const s = cam.w2s(p); return [s[0], s[1], (p[2] || 0) * cam.sc]; }

  /**
   * Squelette sagittal technique (cyan atténué). o.a : opacité globale,
   * o.dim(i) : facteur par vertèbre (focus), o.ribs/skull/silhouette : opacités.
   */
  function drawSagittal(ctx, G, cam, o) {
    o = o || {};
    const a = o.a == null ? 1 : o.a;
    const sc = cam.sc, lw = clamp(0.6 + sc * 0.22, 1, 2.2);
    const dim = o.dim || (() => 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // silhouette cutanée (pointillés)
    const sa = (o.silhouette == null ? 0.35 : o.silhouette) * a;
    if (sa > 0.004) {
      ctx.setLineDash([5, 6]); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba('grey', sa);
      smoothPath(ctx, G.wall.skin.map((p) => cam.w2s(p))); ctx.stroke();
      smoothPath(ctx, G.back.map((p) => cam.w2s(p))); ctx.stroke();
      ctx.setLineDash([]);
    }
    // gril costal (derrière le rachis)
    const ra = (o.ribs == null ? 0.5 : o.ribs) * a;
    if (ra > 0.004) {
      ctx.lineWidth = Math.max(1, 0.9 * lw);
      for (let i = 1; i <= 12; i++) {
        const r = G.ribs[i];
        ctx.strokeStyle = rgba(BONE, 0.32 * ra);
        smoothPath(ctx, r.path.map((p) => cam.w2s(p))); ctx.stroke();
        if (r.st) { ctx.strokeStyle = rgba('white', 0.22 * ra); polyPath(ctx, [cam.w2s(r.ant), cam.w2s(r.st)]); ctx.stroke(); }
      }
      ctx.strokeStyle = rgba(BONE, 0.45 * ra); ctx.lineWidth = Math.max(1.4, 1.6 * lw);
      smoothPath(ctx, G.ribs.sternum.map((p) => cam.w2s(p))); ctx.stroke();
      polyPath(ctx, [cam.w2s(G.ribs.xiphJ), cam.w2s(G.ribs.xiphoid)]); ctx.stroke();
    }
    // crâne
    const ka = (o.skull == null ? 0.6 : o.skull) * a;
    if (ka > 0.004) {
      roundedPath(ctx, G.skull.outline.map((p) => W2S(cam, p)));
      ctx.fillStyle = rgba('bone', 0.55 * ka); ctx.fill();
      ctx.strokeStyle = rgba(BONE, 0.42 * ka); ctx.lineWidth = lw; ctx.stroke();
    }
    // fémur
    const fa = (o.femur == null ? 1 : o.femur) * a;
    if (fa > 0.004) {
      roundedPath(ctx, G.femur.map((p) => W2S(cam, p)));
      ctx.fillStyle = rgba('bone', 0.85 * fa); ctx.fill();
      ctx.strokeStyle = rgba(BONE, 0.5 * fa); ctx.lineWidth = lw; ctx.stroke();
      const h = cam.w2s(G.hip);
      ctx.beginPath(); ctx.arc(h[0], h[1], FEMUR.headR * sc, 0, Math.PI * 2);
      ctx.fillStyle = rgba('bone', 0.9 * fa); ctx.fill(); ctx.stroke();
    }
    // disques
    for (let i = 1; i < NL; i++) {
      const up = G.lv[i - 1], lo = G.lv[i];
      if (up.L.reg === 'C1') continue;
      discShape(ctx, cam, up.BA, up.BP, lo.TP, lo.TA, a * dim(i - 0.5));
    }
    const L5 = G.lv[NL - 1];
    discShape(ctx, cam, L5.BA, L5.BP, G.s1TP, G.s1TA, a * dim(NL - 0.5));
    // sacrum
    roundedPath(ctx, G.sacrum.map((p) => W2S(cam, p)));
    ctx.fillStyle = rgba('bone', 0.9 * a * dim(NL)); ctx.fill();
    ctx.strokeStyle = rgba(BONE, 0.55 * a * dim(NL)); ctx.lineWidth = lw; ctx.stroke();
    // vertèbres
    for (let i = NL - 1; i >= 0; i--) {
      const V = G.lv[i], va = a * dim(i);
      if (va <= 0.004) continue;
      for (const ex of V.extraW) { roundedPath(ctx, ex.map((p) => W2S(cam, p))); ctx.fillStyle = rgba('bone', 0.9 * va); ctx.fill(); ctx.strokeStyle = rgba(BONE, 0.55 * va); ctx.lineWidth = lw; ctx.stroke(); }
      roundedPath(ctx, V.world.map((p) => W2S(cam, p)));
      ctx.fillStyle = rgba('bone', (V.L.reg === 'C1' ? 0.7 : 0.92) * va); ctx.fill();
      ctx.strokeStyle = rgba(BONE, 0.6 * va); ctx.lineWidth = lw; ctx.stroke();
      // processus mamillaire (lombaires) : petit tubercule sur le bord postérieur du PAS
      if (V.L.reg === 'L' && sc > 2.2) {
        const [sx, sy] = tplScale(V.L), c = cam.w2s(toW(V.F, [45.6 * sx, -15.5 * sy]));
        ctx.beginPath(); ctx.arc(c[0], c[1], 2.2 * sc, 0, Math.PI * 2);
        ctx.fillStyle = rgba('bone', va); ctx.fill(); ctx.strokeStyle = rgba(BONE, 0.6 * va); ctx.stroke();
      }
    }
    // os coxal (translucide : le sacrum reste lisible au travers)
    const pa = (o.pelvis == null ? 1 : o.pelvis) * a;
    if (pa > 0.004) {
      roundedPath(ctx, G.pelvis.map((p) => W2S(cam, p)));
      ctx.fillStyle = rgba('bone', 0.5 * pa); ctx.fill();
      ctx.strokeStyle = rgba(BONE, 0.55 * pa); ctx.lineWidth = lw; ctx.stroke();
      const ob = G.pelvisLM.obturator, oc = cam.w2s(ob);
      ctx.beginPath(); ctx.ellipse(oc[0], oc[1], 21 * sc, 14 * sc, G.pelvisRot - 0.35, 0, Math.PI * 2);
      ctx.fillStyle = rgba('bg', 0.7 * pa); ctx.fill(); ctx.strokeStyle = rgba(BONE, 0.4 * pa); ctx.stroke();
      const ac = cam.w2s(G.hip);
      ctx.beginPath(); ctx.arc(ac[0], ac[1], 28 * sc, -2.6 + G.pelvisRot, 0.9 + G.pelvisRot);
      ctx.strokeStyle = rgba(BONE, 0.55 * pa); ctx.lineWidth = lw * 1.2; ctx.stroke();
    }
  }
  function discShape(ctx, cam, TA, TP, BP, BA, a) {
    if (a <= 0.004) return;
    const ant = vnorm(vsub(vlerp(TA, BA, 0.5), vlerp(TP, BP, 0.5)));
    const mA = vadd(vlerp(TA, BA, 0.5), vmul(ant, 0.8)), mP = vsub(vlerp(TP, BP, 0.5), vmul(ant, 0.8));
    const pts = [TA, TP, mP, BP, BA, mA].map((p, k) => { const s = cam.w2s(p); return [s[0], s[1], (k === 2 || k === 5 ? 6 : 0.6) * cam.sc]; });
    roundedPath(ctx, pts);
    ctx.fillStyle = rgba(BONE, 0.16 * a); ctx.fill();
    ctx.strokeStyle = rgba(BONE, 0.4 * a); ctx.lineWidth = 1; ctx.stroke();
  }

  /** Repères nommés (mode debug=anchors). */
  function anchorCatalog(A) {
    const out = [];
    for (const n of ['L1', 'L2', 'L3', 'L4', 'L5']) {
      out.push(['mam ' + n, A.mam(n)], ['spinInf ' + n, A.spinInf(n)], ['tp ' + n, A.tp(n)]);
    }
    for (const k in A.G.pelvisLM) out.push([k, A.pel(k)]);
    out.push(['lesserTroch', A.fem('lesserTrochanter')], ['xiphoid', A.xiphoid()], ['umbilicus', A.umbilicus()],
      ['mastoid', A.skull('mastoid')], ['occiput', A.skull('occiput')], ['comHAT', A.comHAT()], ['shoulder', A.shoulder()]);
    for (let i = 5; i <= 12; i++) out.push(['ribAngle ' + i, A.ribAngle(i)]);
    for (let i = 5; i <= 7; i++) out.push(['cart ' + i, A.cart(i)]);
    return out;
  }

  P2.anatomy = { SS0, PI_DEG, HIP0, PELVIS_LM, FEMUR, curveFixed, sagittal, anchors, drawSagittal, anchorCatalog, catmull, bez2 };
  if (typeof module === 'object' && module.exports) module.exports = P2.anatomy;
})(typeof window !== 'undefined' ? window : globalThis);
