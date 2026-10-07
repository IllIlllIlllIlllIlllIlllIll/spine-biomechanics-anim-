/* =============================================================================
 *  lib/core.js — moteur commun des animations « Biomécanique du rachis »
 *
 *  Fonctions PURES uniquement (aucun état entre deux frames, aucun appel à
 *  Math.random/Date) : maths, couleurs, typographie, primitives Canvas,
 *  grille millimétrée, modèle anatomique paramétrique du rachis (C1 → sacrum).
 *  Utilisé par la partie 1 (animation.js) et la partie 2 (partie2/).
 *
 *  Unités du monde : millimètres, x = postérieur (+), y = caudal (+).
 *  Origine : centre du plateau supérieur de S1.
 * ========================================================================== */
(function (root) {
  'use strict';

  const W = 1920, H = 1080;
  const DEG = Math.PI / 180;

  const COL = {
    bg: '#0f141c', cyan: '#00d2ff', white: '#e8e4da', grey: '#5a6b80',
    orange: '#ff8a3d', red: '#ff3b3b', bone: '#131b26', dim: '#8a9ab0',
  };
  const MONO = "'JetBrains Mono','IBM Plex Mono','DejaVu Sans Mono','Liberation Mono',Menlo,Consolas,monospace";
  const SANS = "Inter,'Helvetica Neue','Segoe UI',Arial,sans-serif";

  // ------------------------------------------------------------ maths
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const E = {
    io: (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    ios: (x) => (1 - Math.cos(Math.PI * clamp(x))) / 2,
    out: (x) => 1 - Math.pow(1 - clamp(x), 3),
    back: (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  // fenêtre d'apparition/disparition douce
  const fio = (t, a, b, fi = 0.4, fo = 0.4) => Math.min(smooth(seg(t, a, a + fi)), 1 - smooth(seg(t, b - fo, b)));

  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const vmul = (a, s) => [a[0] * s, a[1] * s];
  const vlen = (a) => Math.hypot(a[0], a[1]);
  const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l]; };
  const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const vrot = (a, g) => { const c = Math.cos(g), s = Math.sin(g); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; };
  const vrotAbout = (p, o, g) => vadd(o, vrot(vsub(p, o), g));
  const perp = (a) => [-a[1], a[0]];

  // repère local {o, x̂ (postérieur), ŷ (caudal)}
  const toW = (F, p) => [F.o[0] + F.x[0] * p[0] + F.y[0] * p[1], F.o[1] + F.x[1] * p[0] + F.y[1] * p[1]];
  const toL = (F, w) => { const d = vsub(w, F.o); return [vdot(d, F.x), vdot(d, F.y)]; };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------ couleurs
  const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const RGB = {}; for (const k in COL) RGB[k] = hexRGB(COL[k]);
  const rgbOf = (c) => (Array.isArray(c) ? c : RGB[c] || hexRGB(c));
  function rgba(c, a) {
    const v = rgbOf(c);
    return 'rgba(' + (v[0] | 0) + ',' + (v[1] | 0) + ',' + (v[2] | 0) + ',' + clamp(a).toFixed(3) + ')';
  }
  const mix = (a, b, t) => { a = rgbOf(a); b = rgbOf(b); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; };
  // rampe de contrainte : cyan (repos) → orange → rouge (max)
  const stressRGB = (s) => { s = clamp(s); return s < 0.5 ? mix('cyan', 'orange', s * 2) : mix('orange', 'red', (s - 0.5) * 2); };
  const MINUS = '−';
  const fmt = (v, d) => (v < -1e-9 && Math.abs(v).toFixed(d) !== (0).toFixed(d) ? MINUS : '') + Math.abs(v).toFixed(d);
  const fmtS = (v, d) => (Math.abs(v).toFixed(d) === (0).toFixed(d) ? ' ' : v > 0 ? '+' : MINUS) + Math.abs(v).toFixed(d);

  // =========================================================================
  //  MODÈLE ANATOMIQUE — niveaux vertébraux (dimensions moyennes adulte, mm)
  //  H : hauteur du corps, D : profondeur antéro-postérieure, below : disque
  //  sous-jacent. s : abscisse curviligne depuis le plateau de S1 (s = 0).
  // =========================================================================
  const LV = (() => {
    const L = [];
    L.push({ n: 'C1', reg: 'C1', H: 9, D: 16, below: 3 });
    L.push({ n: 'C2', reg: 'C2', H: 16, D: 16, below: 5 });
    for (let i = 3; i <= 7; i++) L.push({ n: 'C' + i, reg: 'C', H: 14, D: 16 + (i - 3) * 0.7, below: 5 });
    for (let i = 1; i <= 12; i++) L.push({ n: 'T' + i, reg: 'T', H: 17 + (i - 1) * 9 / 11, D: 21 + (i - 1) * 12 / 11, below: 4 + (i - 1) * 3 / 11 });
    const lh = [27, 28, 28, 28, 28], ld = [38, 40, 42, 44, 45], ldisc = [9, 10, 11, 12, 11];
    for (let i = 1; i <= 5; i++) L.push({ n: 'L' + i, reg: 'L', H: lh[i - 1], D: ld[i - 1], below: ldisc[i - 1] });
    let s = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      s += L[i].below; L[i].sBot = s; s += L[i].H; L[i].sTop = s; L[i].sMid = (L[i].sBot + L[i].sTop) / 2;
    }
    return L;
  })();
  const IX = {}; LV.forEach((l, i) => (IX[l.n] = i));
  const NL = LV.length;
  const S1D = 45, SAC_LEN = 105, SAC_KYPH = 70; // sacrum : courbure fixe (non comptée par Delmas)
  const BAL_X = 5; // C7 à l'aplomb de S1 (+5 mm en arrière du centre du plateau)

  // ---- tables de courbure le long de s
  const DS = 0.5, S_MIN = -SAC_LEN, S_MAX = LV[0].sTop + 6;
  const NS = Math.round((S_MAX - S_MIN) / DS) + 1, K0 = Math.round(-S_MIN / DS);
  const sAt = (k) => S_MIN + k * DS;
  function lookup(arr, s) {
    const f = (s - S_MIN) / DS; const k = Math.max(0, Math.min(NS - 2, Math.floor(f)));
    return lerp(arr[k], arr[k + 1], f - k);
  }
  // vrai si s tombe dans un espace discal
  function inDisc(s) {
    for (const L of LV) if (s > L.sBot - L.below && s < L.sBot) return true;
    return false;
  }
  // distribution cumulée normalisée d'une fenêtre de courbure (forme bêta),
  // pondérée par le tissu : les disques (wd) sont plus déformables que les corps
  function cumWin(sa, sb, p, q, wd) {
    const out = new Float64Array(NS); let acc = 0;
    for (let k = 0; k < NS; k++) {
      const s = sAt(k), u = (s - sa) / (sb - sa);
      const w = inDisc(s) ? wd : 1;
      acc += u > 0 && u < 1 ? w * Math.pow(u, p) * Math.pow(1 - u, q) : 0;
      out[k] = acc;
    }
    for (let k = 0; k < NS; k++) out[k] /= acc;
    return out;
  }
  // Lordose lombaire : décroissante depuis S1 (≈ 2/3 sur L4–S1), portée surtout par le cunéiforme discal.
  // Cyphose thoracique : apex T7, portée surtout par le cunéiforme des corps. Lordose cervicale : apex C4–C5.
  const WLUM = cumWin(0, LV[IX.L1].sTop, 0, 2.0, 3.0);
  const WTHO = cumWin(LV[IX.T12].sBot, LV[IX.T1].sTop, 1.8, 1.5, 1.3);
  const WCER = cumWin(LV[IX.C7].sBot, LV[IX.C2].sBot, 1.3, 1.3, 2.5);
  const TARGET = { LL: 50, TK: 40, CL: 30 };
  // calibrage : les angles de Cobb mesurés valent exactement les cibles à amplitude 1
  const A_L = -TARGET.LL / (lookup(WLUM, LV[IX.L1].sTop) - lookup(WLUM, 0));
  const A_T = TARGET.TK / (lookup(WTHO, LV[IX.T4].sTop) - lookup(WTHO, LV[IX.T12].sBot));
  const A_C = -TARGET.CL / (lookup(WCER, LV[IX.C2].sBot) - lookup(WCER, LV[IX.C7].sBot));

  function integrate(phi, X, Y) {
    X[K0] = 0; Y[K0] = 0;
    for (let i = K0; i < NS - 1; i++) {
      const a = ((phi[i] + phi[i + 1]) / 2) * DEG;
      X[i + 1] = X[i] - DS * Math.sin(a); Y[i + 1] = Y[i] - DS * Math.cos(a);
    }
    for (let i = K0; i > 0; i--) {
      const a = ((phi[i] + phi[i - 1]) / 2) * DEG;
      X[i - 1] = X[i] + DS * Math.sin(a); Y[i - 1] = Y[i] + DS * Math.cos(a);
    }
  }

  /**
   * Courbe rachidienne. φ(s) = inclinaison antérieure de la tangente (°).
   * aL, aT, aC : amplitude de formation de chaque courbure (0 → 1)
   * k          : facteur de charge (réponse élastique des courbures)
   * L'équilibre sagittal est résolu : rotation globale autour de S1 pour
   * placer C7 à l'aplomb du plateau sacré (le bassin compense).
   */
  function spineCurve(aL, aT, aC, k) {
    const phi = new Float64Array(NS), X = new Float64Array(NS), Y = new Float64Array(NS);
    for (let i = 0; i < NS; i++) {
      const s = sAt(i);
      phi[i] = s >= 0 ? k * (aL * A_L * WLUM[i] + aT * A_T * WTHO[i] + aC * A_C * WCER[i]) : SAC_KYPH * (s / SAC_LEN);
    }
    integrate(phi, X, Y);
    const c7 = [lookup(X, LV[IX.C7].sMid), lookup(Y, LV[IX.C7].sMid)];
    const r = vlen(c7), gamma = Math.atan2(-c7[0], -c7[1]);
    const alpha = (Math.asin(clamp(-BAL_X / r, -1, 1)) - gamma) / DEG;
    for (let i = 0; i < NS; i++) phi[i] += alpha;
    integrate(phi, X, Y);
    return { phi, X, Y, phi0: alpha };
  }
  function frameAt(C, s) {
    const a = lookup(C.phi, s) * DEG;
    return { o: [lookup(C.X, s), lookup(C.Y, s)], x: [Math.cos(a), -Math.sin(a)], y: [Math.sin(a), Math.cos(a)], a };
  }
  const curveAngle = (C, s) => lookup(C.phi, s);

  // =========================================================================
  //  GABARITS DES VERTÈBRES (profil latéral, repère local du corps, mm)
  //  pre : pédicule + processus articulaire supérieur (PAS)
  //  sap : surface articulaire du PAS (2 points)   lam : lame + épineuse
  //  Le processus articulaire inférieur (PAI) est AJUSTÉ sur le PAS de la
  //  vertèbre sous-jacente : les facettes s'emboîtent quelle que soit la courbure.
  // =========================================================================
  const TPL = {
    L: {
      D0: 45, H0: 28, gap: 1.5, conc: 1.1,
      pre: [[26, -13.5, 2], [31, -13, 3], [33.5, -15.5, 2], [35, -21, 2], [37.5, -24.5, 2.5], [40.5, -24, 2]],
      sap: [[41.5, -21, 1.2], [44, -10.5, 1.5]],
      lam: [[45.5, -7, 2], [50, -5, 3], [60, -2.5, 3], [70, -1, 3], [76.5, 1, 3], [78.5, 5.5, 3], [76.5, 10, 3], [69, 11, 3], [59, 11.5, 3], [53, 12, 3]],
      iap: [[43.5, 12], [45.5, 24]], pedBot: [26, -3], pw: [22.5, -2],
    },
    T: {
      D0: 30, H0: 22, gap: 1.2, conc: 0.7,
      pre: [[17, -10.5, 1.5], [21, -10, 2], [22.5, -13, 1.5], [24, -17, 1.5], [26.5, -17.5, 1.5]],
      sap: [[27.5, -15, 1], [28.5, -8, 1.2]],
      lam: [[31, -5, 2], [38, -2, 2], [46, 6, 2], [53, 17, 2], [56, 24, 2.5], [54, 27, 2], [48, 22, 2], [40, 12, 2], [34, 8, 2]],
      iap: [[29, 10], [30, 16]], pedBot: [18, -2.5], pw: [15, -1.5],
    },
    C: {
      D0: 16, H0: 14, gap: 1.0, conc: 0.4,
      pre: [[10, -6.5, 1], [13, -7, 1], [14, -10, 1], [15.5, -12, 1]],
      sap: [[17, -11.5, 0.8], [20.5, -7.5, 1]],
      lam: [[22, -4, 1.5], [27, -3, 1.5], [33, -1.5, 1.5], [35, 1, 1.5], [33.5, 3.5, 1.5], [27, 4, 1.5], [23, 4.5, 1.5]],
      iap: [[17.5, 7], [21, 11]], pedBot: [11, 0], pw: [8, 0.5],
    },
  };
  const SPIN_EXT = { C2: 1.25, C7: 1.55, T1: 1.3 };
  // sacrum (repère du plateau de S1) : promontoire, plateau, PAS de S1, crête
  const SAC_TOP = [[22.5, 0, 1.5], [26, 0.5, 2], [30, -1, 2], [32.5, -4, 1.5], [34.5, -10.5, 1.5], [37, -14, 2], [40, -13.5, 1.5],
    [41.2, -9.5, 1], [43.2, 0.5, 1.5], [46.5, 4, 2], [49, 8, 3]];
  const SAC_SAP = [[41.2, -9.5], [43.2, 0.5]];

  function tplOf(L) { return TPL[L.reg === 'C2' || L.reg === 'C1' ? 'C' : L.reg]; }
  function tplScale(L) { const T = tplOf(L); return [L.D / T.D0, L.H / T.H0]; }
  function sapLocal(L) {
    const T = tplOf(L), [sx, sy] = tplScale(L);
    return T.sap.map((p) => [p[0] * sx, p[1] * sy]);
  }

  // points concaves d'un plateau (a → b), creusés vers l'intérieur du corps
  function concave(a, b, c, center) {
    const e = vsub(b, a); let n = vnorm(perp(e));
    if (vdot(n, vsub(center, vlerp(a, b, 0.5))) < 0) n = vmul(n, -1);
    return [-0.55, 0, 0.55].map((u) => { const p = vadd(vlerp(a, b, (u + 1) / 2), vmul(n, c * (1 - u * u))); return [p[0], p[1], 40]; });
  }
  function bez(a, c, b, t) { return vadd(vadd(vmul(a, (1 - t) * (1 - t)), vmul(c, 2 * (1 - t) * t)), vmul(b, t * t)); }

  /** Contour local d'une vertèbre (points [x, y, rayon mm]). */
  function vertLocal(G, i) {
    const V = G.lv[i], L = V.L, F = V.F0;
    const TA = toL(F, V.TA), TP = toL(F, V.TP), BA = toL(F, V.BA), BP = toL(F, V.BP);
    if (L.reg === 'C1') {
      const s = L.D / 16;
      const sc = (p) => [p[0] * s, p[1] * s, (p[2] || 1) * s];
      const arch = [[-3, -5.5, 1], [7, -6, 1], [10, -4, 1], [16, -4.5, 1.5], [25, -4, 1.5], [31, -5, 1.5], [34, -2.5, 1.5], [33.5, 2, 1.5],
        [27, 3, 1.5], [16, 2.5, 1.5], [10, 4.5, 1], [7, 6, 1], [-3, 5.5, 1]].map(sc);
      const ant = []; for (let k = 0; k < 16; k++) { const g = (k / 16) * Math.PI * 2; ant.push([(-L.D / 2 + 0.5) + 2.8 * s * Math.cos(g), 4.8 * s * Math.sin(g), 0]); }
      return { pts: arch, extra: [ant], body: null };
    }
    const T = tplOf(L), [sx, sy] = tplScale(L), sr = Math.min(sx, sy);
    const sc = (p) => [p[0] * sx, p[1] * sy, (p[2] == null ? 1.5 : p[2]) * sr];
    const pre = T.pre.map(sc), sap = T.sap.map(sc), pedBot = sc(T.pedBot), pw = sc(T.pw);
    let lam = T.lam.map(sc);
    const ext = SPIN_EXT[L.n];
    if (ext) { const x0 = T.D0 / 2 * sx + 5 * sx; lam = lam.map((p) => (p[0] > x0 ? [x0 + (p[0] - x0) * ext, p[1], p[2]] : p)); }

    // --- processus articulaire inférieur, ajusté sur le PAS sous-jacent
    let art;
    const lower = G.sapW[i + 1];
    const g = T.gap * sr;
    if (lower) {
      const a1 = toL(F, lower[0]), a2 = toL(F, lower[1]);
      const e = vnorm(vsub(a2, a1)); let n = perp(e); if (n[0] < 0) n = vmul(n, -1);
      const artTop = vsub(vadd(a1, vmul(n, g)), vmul(e, 2 * sr));
      const artBot = vsub(vadd(a2, vmul(n, g)), vmul(e, 0.8 * sr));
      art = { top: artTop, bot: artBot, e, n };
    } else {
      const it = T.iap.map(sc); const e = vnorm(vsub(it[1], it[0])); let n = perp(e); if (n[0] < 0) n = vmul(n, -1);
      art = { top: it[0], bot: it[1], e, n };
    }
    // garde-fou : le PAI reste sous le pédicule
    if (art.top[1] < pedBot[1] + 3 * sy) art.top = [art.top[0], pedBot[1] + 3 * sy];
    const tip = vadd(vadd(art.bot, vmul(art.e, 1.6 * sr)), vmul(art.n, 1.8 * sr));
    const postBot = vsub(vadd(art.bot, vmul(art.n, 4.6 * sr)), vmul(art.e, 0.5 * sr));
    const iap = [[postBot[0], postBot[1], 2 * sr], [tip[0], tip[1], 1.8 * sr], [art.bot[0], art.bot[1], 1.0 * sr], [art.top[0], art.top[1], 1.5 * sr]];
    // échancrure vertébrale inférieure (courbe de Bézier vers le bas du pédicule)
    const ctrl = [lerp(pedBot[0], art.top[0], 0.8), pedBot[1] + 0.5 * sy];
    const notch = [0.3, 0.6, 0.85].map((t) => { const p = bez(art.top, ctrl, pedBot, t); return [p[0], p[1], 3 * sr]; });

    const cen = [0, 0], c = T.conc * sx;
    const top = [[TA[0], TA[1], 2.2 * sr]];
    let topMid = concave(TA, TP, c, cen);
    if (L.reg === 'C2') { // dent de l'axis (processus odontoïde)
      const m = vlerp(TA, TP, 0.5); const up = vnorm(vsub(vlerp(TA, TP, 0.5), vlerp(BA, BP, 0.5)));
      const ax = vnorm(vsub(TP, TA));
      const P = (u, h, r) => { const p = vadd(vadd(m, vmul(ax, u)), vmul(up, h)); return [p[0], p[1], r]; };
      topMid = [P(-4.5, -0.3, 1.5), P(-4, 8, 2), P(-2, 13, 2.5), P(2.5, 13, 2.5), P(4.2, 8, 2), P(4.5, -0.3, 1.5)];
    }
    const pts = [...top, ...topMid, [TP[0], TP[1], 1.5 * sr], ...pre, ...sap, ...lam, ...iap, ...notch,
      [pedBot[0], pedBot[1], 1.5 * sr], [pw[0], pw[1], 1 * sr], [BP[0], BP[1], 2 * sr],
      ...concave(BP, BA, c, cen), [BA[0], BA[1], 2.2 * sr],
      [lerp(TA[0], BA[0], 0.5) + 1.0 * sx, lerp(TA[1], BA[1], 0.5), 60]];
    return { pts, extra: [], body: { TA, TP, BP, BA, c }, art, lamTpl: lam, sr, sx, sy };
  }

  function sacrumOutline(C, F0) {
    const pts = [];
    const TA = [-S1D / 2, 0], TP = [S1D / 2, 0];
    pts.push([TA[0], TA[1], 2.5]);
    concave(TA, TP, 1.1, [0, 20]).forEach((p) => pts.push(p));
    SAC_TOP.forEach((p) => pts.push(p.slice()));
    const world = pts.map((p) => { const w = toW(F0, p); return [w[0], w[1], p[2]]; });
    for (let s = -12; s >= -SAC_LEN + 6; s -= 3) {
      const F = frameAt(C, s), u = -s / SAC_LEN;
      const crest = 2.4 * Math.pow(Math.max(0, Math.sin(u * Math.PI * 4.3)), 2);
      const hw = 5 + 44 * Math.pow(1 - u, 1.25) + crest;
      const w = vadd(F.o, vmul(F.x, hw)); world.push([w[0], w[1], 3]);
    }
    const Ft = frameAt(C, -SAC_LEN);
    const tp1 = vadd(Ft.o, vmul(Ft.x, 3)), tp2 = vadd(vadd(Ft.o, vmul(Ft.y, 2)), vmul(Ft.x, -2));
    world.push([tp1[0], tp1[1], 2], [tp2[0], tp2[1], 2.5]);
    for (let s = -SAC_LEN + 6; s <= -3; s += 3) {
      const F = frameAt(C, s), u = -s / SAC_LEN;
      const hw = 4 + 18.5 * Math.pow(1 - u, 0.9);
      const w = vadd(F.o, vmul(F.x, -hw)); world.push([w[0], w[1], 4]);
    }
    return world;
  }

  /**
   * Géométrie complète d'une frame (positions monde de tous les éléments).
   * theta : flexion segmentaire de L4 sur L5 (rotation autour du CIR)
   * gamma : bascule globale du rachis (rythme lombo-pelvien) autour de `pivot`
   */
  function geometry(C, theta, cir, gamma, pivot) {
    const G = { C, lv: new Array(NL), theta, gamma: gamma || 0 };
    for (let i = 0; i < NL; i++) {
      const L = LV[i];
      const F = frameAt(C, L.sMid), Ft = frameAt(C, L.sTop), Fb = frameAt(C, L.sBot);
      G.lv[i] = {
        L, F0: F, F,
        TA: vadd(Ft.o, vmul(Ft.x, -L.D / 2)), TP: vadd(Ft.o, vmul(Ft.x, L.D / 2)),
        BA: vadd(Fb.o, vmul(Fb.x, -L.D / 2)), BP: vadd(Fb.o, vmul(Fb.x, L.D / 2)),
      };
    }
    G.s1 = frameAt(C, 0);
    G.s1TA = toW(G.s1, [-S1D / 2, 0]); G.s1TP = toW(G.s1, [S1D / 2, 0]);
    G.sapW = new Array(NL + 1).fill(null);
    for (let i = 2; i < NL; i++) G.sapW[i] = sapLocal(LV[i]).map((p) => toW(G.lv[i].F0, p));
    G.sapW[NL] = SAC_SAP.map((p) => toW(G.s1, p));
    for (let i = 0; i < NL; i++) G.lv[i].loc = vertLocal(G, i);
    G.sacrum = sacrumOutline(C, G.s1);
    // crêtes transverses des vertèbres sacrées soudées
    G.sacRidges = [-22, -40, -56, -70, -83].map((s) => {
      const F = frameAt(C, s), u = -s / SAC_LEN, hw = 4 + 18.5 * Math.pow(1 - u, 0.9);
      return [vadd(F.o, vmul(F.x, -hw + 1)), vadd(F.o, vmul(F.x, hw * 0.55))];
    });
    // mouvement rigide de L4 (et de tout le rachis sus-jacent) autour du CIR
    if (theta && cir) {
      const psi = -theta * DEG;
      for (let i = 0; i <= IX.L4; i++) {
        const V = G.lv[i];
        V.F = { o: vrotAbout(V.F0.o, cir, psi), x: vrot(V.F0.x, psi), y: vrot(V.F0.y, psi) };
        V.TA = vrotAbout(V.TA, cir, psi); V.TP = vrotAbout(V.TP, cir, psi);
        V.BA = vrotAbout(V.BA, cir, psi); V.BP = vrotAbout(V.BP, cir, psi);
      }
    }
    if (gamma && pivot) {
      const g = -gamma * DEG, R = (p) => vrotAbout(p, pivot, g);
      for (let i = 0; i < NL; i++) {
        const V = G.lv[i];
        V.F = { o: R(V.F.o), x: vrot(V.F.x, g), y: vrot(V.F.y, g) };
        V.TA = R(V.TA); V.TP = R(V.TP); V.BA = R(V.BA); V.BP = R(V.BP);
      }
      G.s1 = { o: R(G.s1.o), x: vrot(G.s1.x, g), y: vrot(G.s1.y, g), a: G.s1.a + g };
      G.s1TA = R(G.s1TA); G.s1TP = R(G.s1TP);
      G.sacrum = G.sacrum.map((p) => { const q = R(p); return [q[0], q[1], p[2]]; });
      G.sacRidges = G.sacRidges.map(([p, q]) => [R(p), R(q)]);
      G.cir = R(cir);
    } else G.cir = cir;
    for (let i = 0; i < NL; i++) {
      const V = G.lv[i];
      V.world = V.loc.pts.map((p) => { const w = toW(V.F, p); return [w[0], w[1], p[2]]; });
      V.extraW = V.loc.extra.map((path) => path.map((p) => { const w = toW(V.F, p); return [w[0], w[1], p[2]]; }));
      if (V.loc.art) V.facetW = vlerp(toW(V.F, V.loc.art.top), toW(V.F, V.loc.art.bot), 0.5);
    }
    return G;
  }

  // ---- disque L4/L5 : carte bilinéaire (u ∈ [−1,1] ant→post, v ∈ [−1,1] haut→bas)
  function discFrame(G) {
    const up = G.lv[IX.L4], lo = G.lv[IX.L5];
    const D = { TA: up.BA, TP: up.BP, BA: lo.TA, BP: lo.TP };
    const mA = vlerp(D.TA, D.BA, 0.5), mP = vlerp(D.TP, D.BP, 0.5);
    D.post = vnorm(vsub(mP, mA)); D.ant = vmul(D.post, -1);
    D.down = vnorm(vsub(vlerp(D.BA, D.BP, 0.5), vlerp(D.TA, D.TP, 0.5)));
    D.hA = vlen(vsub(D.TA, D.BA)); D.hP = vlen(vsub(D.TP, D.BP));
    D.center = vlerp(mA, mP, 0.5);
    D.n = [D.post[1], -D.post[0]]; // normale au plan moyen, vers L4
    D.t = D.ant;                    // tangente, vers l'avant
    D.beta = Math.atan2(-D.post[1], D.post[0]) / DEG; // inclinaison du plan moyen
    D.conc = up.loc.body.c;
    D.depth = vlen(vsub(mP, mA));
    D.bA = 0.6; D.bP = 0.6;
    return D;
  }
  function discMap(D, u, v, bA, bP) {
    const top = vlerp(D.TA, D.TP, (u + 1) / 2), bot = vlerp(D.BA, D.BP, (u + 1) / 2);
    let p = vlerp(top, bot, (v + 1) / 2);
    p = vadd(p, vmul(D.down, D.conc * (1 - u * u) * v));
    const w = 1 - v * v;
    const ba = bA == null ? D.bA : bA, bp = bP == null ? D.bP : bP;
    if (u < 0) p = vadd(p, vmul(D.ant, ba * w * Math.pow(-u, 3)));
    else p = vadd(p, vmul(D.post, bp * w * Math.pow(u, 3)));
    return p;
  }
  const bodyMap = (b, u, v) => vlerp(vlerp(b.TA, b.TP, (u + 1) / 2), vlerp(b.BA, b.BP, (u + 1) / 2), (v + 1) / 2);

  // ---- précalculs : géométrie finale (toutes courbures formées), CIR, longueurs au repos
  const CURVE_FINAL = spineCurve(1, 1, 1, 1);
  const G_FINAL = geometry(CURVE_FINAL, 0, null, 0, null);
  const D_FINAL = discFrame(G_FINAL);
  // ---- texture trabéculaire (systèmes vertical, horizontal et en éventail — Gallois & Japiot)
  const TRAB = (() => {
    const rnd = mulberry32(1951), lines = [];
    for (let i = 0; i < 10; i++) {
      const u = -0.84 + (i * 1.68) / 9 + (rnd() - 0.5) * 0.05, ph = rnd() * 6.28, pts = [];
      for (let j = 0; j <= 14; j++) { const v = -0.9 + (j * 1.8) / 14; pts.push([u + 0.025 * Math.sin(ph + v * 5), v]); }
      lines.push({ pts, a: 1 });
    }
    for (let i = 0; i < 7; i++) {
      const v = -0.75 + (i * 1.5) / 6 + (rnd() - 0.5) * 0.06, ph = rnd() * 6.28, pts = [];
      for (let j = 0; j <= 14; j++) { const u = -0.9 + (j * 1.8) / 14; pts.push([u, v + 0.03 * Math.sin(ph + u * 4)]); }
      lines.push({ pts, a: 0.6 });
    }
    for (let i = 0; i < 3; i++) for (const sgn of [-1, 1]) {
      const a = [0.95, sgn * (0.62 - i * 0.12)], c = [0.05, sgn * (0.15 - i * 0.1)], b = [-0.85 + i * 0.22, -sgn * 0.92], pts = [];
      for (let j = 0; j <= 14; j++) pts.push(bez(a, c, b, j / 14));
      lines.push({ pts, a: 0.45 });
    }
    return lines;
  })();

  // =========================================================================
  //  PRIMITIVES DE DESSIN
  // =========================================================================
  let LBL = null; // registre des étiquettes (contrôle qualité automatique)
  function regBox(id, x0, y0, x1, y1, a) { if (LBL && a > 0.05) LBL.push({ id, x0, y0, x1, y1, a }); }

  function text(ctx, s, x, y, o) {
    o = o || {};
    const a = o.a == null ? 1 : o.a; if (a <= 0.004 || !s) return 0;
    const size = o.size || 16;
    ctx.font = (o.w || 400) + ' ' + size + 'px ' + (o.font || MONO);
    ctx.letterSpacing = (o.ls || 0) + 'px';
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'alphabetic';
    const w = ctx.measureText(s).width;
    const x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
    const y0 = y - size * 0.78, y1 = y + size * 0.24;
    if (o.bg) { ctx.fillStyle = rgba('bg', o.bg * a); ctx.fillRect(x0 - 6, y0 - 4, w + 12, y1 - y0 + 8); }
    ctx.fillStyle = rgba(o.c || 'white', a);
    ctx.fillText(s, x, y);
    ctx.letterSpacing = '0px';
    if (!o.noreg) regBox(o.id || s, x0, y0, x0 + w, y1, a);
    return w;
  }
  function measure(ctx, s, size, font, weight, ls) {
    ctx.font = (weight || 400) + ' ' + size + 'px ' + (font || MONO); ctx.letterSpacing = (ls || 0) + 'px';
    const w = ctx.measureText(s).width; ctx.letterSpacing = '0px'; return w;
  }
  function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function polyPath(ctx, pts, close) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  }
  function smoothPath(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length < 3) { ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); return; }
    for (let i = 1; i < pts.length - 1; i++) { const m = vlerp(pts[i], pts[i + 1], 0.5); ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
  }
  // contour fermé à coins arrondis (rayon par sommet, borné géométriquement)
  function roundedPath(ctx, pts) {
    const n = pts.length; ctx.beginPath();
    const m0 = vlerp(pts[n - 1], pts[0], 0.5); ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const p = pts[i], prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
      const m = vlerp(p, next, 0.5);
      const d1 = vsub(prev, p), d2 = vsub(next, p), l1 = vlen(d1), l2 = vlen(d2);
      let r = p[2] || 0;
      if (l1 > 1e-6 && l2 > 1e-6) {
        const half = Math.acos(clamp(vdot(d1, d2) / (l1 * l2), -1, 1)) / 2;
        r = Math.min(r, 0.5 * Math.min(l1, l2) * Math.tan(half));
      } else r = 0;
      if (r > 0.05 && isFinite(r)) ctx.arcTo(p[0], p[1], m[0], m[1], r); else ctx.lineTo(p[0], p[1]);
    }
    ctx.closePath();
  }
  // sous-polyligne jusqu'à une fraction de la longueur (tracé progressif)
  function partial(pts, f) {
    if (f >= 1) return pts; if (f <= 0) return [pts[0], pts[0]];
    let tot = 0; const L = [0];
    for (let i = 1; i < pts.length; i++) { tot += vlen(vsub(pts[i], pts[i - 1])); L.push(tot); }
    const target = tot * f, out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (L[i] >= target) { out.push(vlerp(pts[i - 1], pts[i], (target - L[i - 1]) / ((L[i] - L[i - 1]) || 1))); break; }
      out.push(pts[i]);
    }
    return out;
  }
  const polyLen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += vlen(vsub(pts[i], pts[i - 1])); return s; };

  function arrow(ctx, a, b, col, alpha, o) {
    o = o || {};
    const lw = o.lw || 3, hl = o.head || 14;
    const d = vsub(b, a), L = vlen(d);
    if (L < 0.5 || alpha <= 0.004) return;
    const u = vmul(d, 1 / L), n = perp(u), h = Math.min(hl, L * 0.7);
    const hb = vsub(b, vmul(u, h * 0.8));
    ctx.lineCap = 'round';
    if (o.dash) ctx.setLineDash(o.dash);
    if (!o.noGlow) { ctx.strokeStyle = rgba(col, alpha * 0.16); ctx.lineWidth = lw + 8; line(ctx, a, hb); }
    if (o.outline) { ctx.strokeStyle = rgba('bg', alpha * 0.8); ctx.lineWidth = lw + 3; line(ctx, a, hb); }
    ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = lw; line(ctx, a, hb);
    ctx.setLineDash([]);
    const base = vsub(b, vmul(u, h));
    const p1 = vadd(base, vmul(n, h * 0.42)), p2 = vsub(base, vmul(n, h * 0.42));
    ctx.fillStyle = rgba(col, alpha);
    ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.closePath(); ctx.fill();
  }
  function glowStroke(ctx, col, a, lw) {
    ctx.strokeStyle = rgba(col, a * 0.15); ctx.lineWidth = lw + 7; ctx.stroke();
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; ctx.stroke();
  }
  function dot(ctx, p, r, col, a) { ctx.fillStyle = rgba(col, a); ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); }
  function ring(ctx, p, r, col, a, lw) { ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw || 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.stroke(); }

  /** Étiquette reliée par une ligne de rappel coudée. */
  function leaderTag(ctx, anchor, at, lines, o) {
    const a = o.a; if (a <= 0.004) return;
    const col = o.c || 'white', size = o.size || 15, align = o.align || 'left';
    const side = align === 'left' ? -1 : 1, ly = at[1] - size * 0.35;
    ctx.strokeStyle = rgba(o.lc || 'grey', a * 0.9); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(at[0] + side * 18, ly); ctx.lineTo(at[0] + side * 6, ly); ctx.stroke();
    dot(ctx, anchor, 3, o.lc || col, a);
    lines.forEach((ln, i) => {
      const L = typeof ln === 'string' ? { s: ln } : ln;
      text(ctx, L.s, at[0], at[1] + i * (size + 6), { size: L.size || size, c: L.c || col, a, align, ls: L.ls || 1, w: L.w, bg: 0.75 });
    });
  }

  // =========================================================================
  //  FOND : grille millimétrée liée au monde (niveaux de détail selon le zoom)
  // =========================================================================
  function drawGrid(ctx, cam) {
    const tl = cam.s2w([0, 0]), br = cam.s2w([W, H]);
    const levels = [1, 5, 10, 50, 100];
    for (const sp of levels) {
      const px = sp * cam.sc;
      const a = smooth(seg(px, 9, 34)) * (1 - smooth(seg(px, 420, 900))) * (sp % 50 === 0 ? 0.075 : sp % 10 === 0 ? 0.06 : 0.045);
      if (a < 0.003) continue;
      ctx.strokeStyle = rgba('cyan', a); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.floor(tl[0] / sp) * sp; x <= br[0]; x += sp) { const X = Math.round(cam.w2s([x, 0])[0]) + 0.5; ctx.moveTo(X, 0); ctx.lineTo(X, H); }
      for (let y = Math.floor(tl[1] / sp) * sp; y <= br[1]; y += sp) { const Y = Math.round(cam.w2s([0, y])[1]) + 0.5; ctx.moveTo(0, Y); ctx.lineTo(W, Y); }
      ctx.stroke();
    }
  }

  function drawDiscSimple(ctx, TA, TP, BP, BA, cam, dy, a, tint, sc) {
    const ant = vnorm(vsub(vlerp(TA, BA, 0.5), vlerp(TP, BP, 0.5)));
    const mA = vadd(vlerp(TA, BA, 0.5), vmul(ant, 0.8)), mP = vsub(vlerp(TP, BP, 0.5), vmul(ant, 0.8));
    const pts = [TA, TP, mP, BP, BA, mA].map((p, k) => { const s = cam.w2s(p); return [s[0], s[1] + dy, (k === 2 || k === 5 ? 6 : 0.6) * sc]; });
    roundedPath(ctx, pts);
    const col = mix('cyan', 'orange', clamp(tint));
    ctx.fillStyle = rgba(col, 0.26 * a); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.55 * a); ctx.lineWidth = 1; ctx.stroke();
  }

  /** Détails osseux : corticale, plateaux, travées (visibles au zoom). */
  function drawBoneDetail(ctx, V, cam, a) {
    const b = V.loc.body; if (!b) return;
    const bw = { TA: toW(V.F, b.TA), TP: toW(V.F, b.TP), BP: toW(V.F, b.BP), BA: toW(V.F, b.BA) };
    const sc = cam.sc;
    // trabécules (clip sur le corps)
    ctx.save();
    const inset = (u, v) => cam.w2s(bodyMap(bw, u * 0.94, v * 0.9));
    polyPath(ctx, [inset(-1, -1), inset(1, -1), inset(1, 1), inset(-1, 1)], true);
    ctx.clip();
    ctx.lineWidth = 1;
    for (const L of TRAB) {
      ctx.strokeStyle = rgba('cyan', 0.16 * L.a * a);
      smoothPath(ctx, L.pts.map((p) => cam.w2s(bodyMap(bw, p[0], p[1])))); ctx.stroke();
    }
    ctx.restore();
    // corticale interne
    ctx.strokeStyle = rgba('white', 0.25 * a); ctx.lineWidth = 1;
    const ci = 1.3 / 1;
    const inner = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const p = bodyMap(bw, u, v), c = bodyMap(bw, 0, 0); return cam.w2s(vadd(p, vmul(vnorm(vsub(c, p)), ci * 1.2)));
    });
    polyPath(ctx, inner, true); ctx.stroke();
    // plateaux vertébraux (cartilage + os sous-chondral)
    for (const [a1, a2, sgn] of [[bw.TA, bw.TP, 1], [bw.BA, bw.BP, -1]]) {
      const n = vmul(vnorm(perp(vsub(a2, a1))), 1);
      const c = V.loc.body.c, pts = [];
      for (let k = 0; k <= 16; k++) {
        const u = -1 + (k * 2) / 16; const p = vlerp(a1, a2, (u + 1) / 2);
        const toward = vsub(bodyMap(bw, 0, 0), p);
        const nn = vdot(n, toward) > 0 ? n : vmul(n, -1);
        pts.push(cam.w2s(vadd(p, vmul(nn, c * (1 - u * u) + 0.6))));
      }
      polyPath(ctx, pts); ctx.lineCap = 'round';
      glowStroke(ctx, 'cyan', 0.55 * a, Math.max(1.2, 0.28 * sc));
      void sgn;
    }
  }


  // ---- registre des étiquettes (contrôle qualité) et palette extensible
  function beginLabels() { LBL = []; return LBL; }
  function labels() { return LBL; }
  function addColors(map) { for (const k in map) { COL[k] = map[k]; RGB[k] = hexRGB(map[k]); } }

  const API = {
    W, H, beginLabels, labels, addColors,
    DEG,
    COL,
    MONO,
    SANS,
    clamp,
    lerp,
    seg,
    smooth,
    E,
    fio,
    vadd,
    vsub,
    vmul,
    vlen,
    vnorm,
    vlerp,
    vdot,
    vrot,
    vrotAbout,
    perp,
    toW,
    toL,
    mulberry32,
    hexRGB,
    RGB,
    rgbOf,
    rgba,
    mix,
    stressRGB,
    MINUS,
    fmt,
    fmtS,
    LV,
    IX,
    NL,
    S1D,
    BAL_X,
    DS,
    NS,
    sAt,
    lookup,
    inDisc,
    cumWin,
    WLUM,
    WTHO,
    WCER,
    TARGET,
    A_L,
    A_T,
    A_C,
    integrate,
    spineCurve,
    frameAt,
    curveAngle,
    TPL,
    SPIN_EXT,
    SAC_TOP,
    SAC_SAP,
    tplOf,
    tplScale,
    sapLocal,
    concave,
    bez,
    vertLocal,
    sacrumOutline,
    geometry,
    discFrame,
    discMap,
    bodyMap,
    CURVE_FINAL,
    G_FINAL,
    D_FINAL,
    TRAB,
    regBox,
    text,
    measure,
    line,
    polyPath,
    smoothPath,
    roundedPath,
    partial,
    polyLen,
    arrow,
    glowStroke,
    dot,
    ring,
    leaderTag,
    drawGrid,
    drawDiscSimple,
    drawBoneDetail,
    S_MIN,
    S_MAX,
    K0,
    SAC_LEN,
    SAC_KYPH,
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.SpineCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
