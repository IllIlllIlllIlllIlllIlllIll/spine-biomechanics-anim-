/* =============================================================================
 *  BIOMÉCANIQUE DU RACHIS — animation scientifique déterministe
 *  1920×1080 · 60 fps · 1800 frames (30 s)
 *
 *  Architecture
 *  ------------
 *  renderFrame(frame) / renderAt(t) sont des fonctions PURES du temps :
 *   - aucun état n'est conservé d'une frame à l'autre ;
 *   - aucun appel à Math.random(), Date ou performance.now() ;
 *   - les textures (os trabéculaire) viennent d'un PRNG à graine fixe.
 *  On peut donc rendre n'importe quelle frame isolément, dans n'importe quel
 *  ordre, sur plusieurs navigateurs en parallèle : le résultat est identique.
 *
 *  Pipeline d'une frame :  t → state(t) → courbe rachidienne → géométrie des
 *  vertèbres → caméra → dessin du monde → calques de scène → panneau → HUD.
 *
 *  Unités du monde : millimètres, x = postérieur (+), y = caudal (+).
 *  Origine : centre du plateau supérieur de S1.
 * ========================================================================== */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ constantes
  const W = 1920, H = 1080, FPS = 60, TOTAL = 1800;
  const T_LAST = (TOTAL - 1) / FPS;
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
  const FOCUS = D_FINAL.center;                  // cible du zoom (centre du disque L4/L5)
  const CIR = discMap(D_FINAL, 0.3, 0.85, 0, 0); // centre instantané de rotation
  const H0A = D_FINAL.hA, H0P = D_FINAL.hP;
  const NUC = { u0: 0.08, v0: 0.04, ru: 0.40, rv: 0.58 };

  // ---- modèle mécanique didactique (ordres de grandeur, cf. panneau)
  const DISC_AREA = 1800; // mm² (≈ 18 cm², disque L4/L5)
  const P_of = (th) => (th >= 0 ? 0.5 + 0.6 * Math.pow(th / 10, 1.6) : 0.5 - 0.05 * Math.pow(-th / 5, 1.6)); // MPa — Wilke 1999
  const facetShare = (th) => (th >= 0 ? 0.1 * (1 - smooth(th / 4)) : 0.1 + 0.1 * smooth(-th / 5));
  const NUC_SHIFT = 0.2; // mm/° (migration postérieure en flexion)
  const F_SCALE = 0.15;  // px/N, échelle unique de tous les vecteurs force

  function mechanics(theta, D) {
    const P = P_of(theta);
    const Fc = (P * DISC_AREA) / 1.5;              // Nachemson : F = P·A / 1,5
    const Fs = Fc * Math.tan(D.beta * DEG);          // R vertical → Fs = Fc·tan β
    const share = facetShare(theta);
    const Ff = (share / (1 - share)) * Fc;
    return { P, Fc, Fs, share, Ff, dx: NUC_SHIFT * theta };
  }

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
  //  TIMELINE
  // =========================================================================
  const TH_KEYS = [[18, 0], [19, 0], [21.5, 10], [22.3, 10], [23.8, -5], [24.8, -5], [26, 0]];
  function thetaAt(t) {
    if (t <= TH_KEYS[0][0] || t >= TH_KEYS[TH_KEYS.length - 1][0]) return 0;
    for (let i = 0; i < TH_KEYS.length - 1; i++) {
      const [t0, a] = TH_KEYS[i], [t1, b] = TH_KEYS[i + 1];
      if (t >= t0 && t <= t1) return lerp(a, b, E.ios((t - t0) / (t1 - t0)));
    }
    return 0;
  }
  function state(t) {
    const S = { t };
    S.gA = Math.min(smooth(seg(t, 0, 0.8)), 1 - smooth(seg(t, 29.4, T_LAST)));
    S.aL = E.io(seg(t, 2.0, 3.4)); S.aT = E.io(seg(t, 3.4, 4.8)); S.aC = E.io(seg(t, 4.8, 6.0));
    const tau = t - 6.3;
    S.k = 1 + (tau > 0 ? 0.05 * (1 - Math.exp(-4 * tau) * Math.cos(12 * tau)) : 0) * (1 - smooth(seg(t, 6.8, 7.25)));
    S.theta = thetaAt(t);
    S.gamma = 0.8 * S.theta; // bascule lombo-pelvienne accompagnant la flexion segmentaire
    S.zoom = E.io(seg(t, 7.4, 9.0)) * (1 - E.io(seg(t, 26.0, 27.0)));
    S.focus = smooth(seg(t, 7.6, 8.8)) * (1 - smooth(seg(t, 26.0, 26.8)));
    S.tint = 1 - smooth(seg(t, 7.2, 7.9));
    return S;
  }

  // =========================================================================
  //  CAMÉRA (zoom continu, interpolation géométrique de l'échelle)
  // =========================================================================
  const CAM_OV = { fw: [0, 0], fs: [620, 878], sc: 1.05 };
  const CAM_FSU = { fs: [470, 560], sc: 8.5 };
  function camera(z) {
    const So = vadd(CAM_OV.fs, vmul(vsub(FOCUS, CAM_OV.fw), CAM_OV.sc));
    const sc = CAM_OV.sc * Math.pow(CAM_FSU.sc / CAM_OV.sc, z);
    const Sp = vlerp(So, CAM_FSU.fs, z);
    return {
      sc,
      w2s: (w) => [Sp[0] + (w[0] - FOCUS[0]) * sc, Sp[1] + (w[1] - FOCUS[1]) * sc],
      s2w: (s) => [FOCUS[0] + (s[0] - Sp[0]) / sc, FOCUS[1] + (s[1] - Sp[1]) / sc],
    };
  }

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

  // =========================================================================
  //  RACHIS (vue d'ensemble + détails selon le zoom)
  // =========================================================================
  const appearT = (i) => 0.8 + i / 30; // empilement C1 → sacrum
  function levelAppear(S, i) { return smooth(seg(S.t, appearT(i), appearT(i) + 0.3)); }
  function levelDy(S, i) { return -16 * (1 - E.out(seg(S.t, appearT(i), appearT(i) + 0.35))); }
  function regionTint(S, L) {
    if (L.reg === 'L') return S.aL * S.tint;
    if (L.reg === 'C' || L.reg === 'C1' || L.reg === 'C2') return S.aC * S.tint;
    return 0;
  }

  function drawSpine(ctx, G, cam, S, R) {
    const sc = cam.sc;
    const lw = clamp(0.7 + sc * 0.17, 1, 2.2);
    const dA = R.detail;
    const ctxDim = (i) => (i === IX.L4 || i === IX.L5 ? 1 : lerp(1, 0.3, S.focus));
    const W2S = (p, dy) => { const s = cam.w2s(p); return [s[0], s[1] + (dy || 0), (p[2] || 0) * sc]; };

    // ---- disques
    for (let i = 1; i < NL; i++) {
      const up = G.lv[i - 1], lo = G.lv[i];
      if (up.L.reg === 'C1') continue;
      const a = levelAppear(S, i) * ctxDim(i === IX.L5 ? IX.L4 : -1) * (i === IX.L5 ? 1 - dA : 1);
      if (a <= 0.004) continue;
      drawDiscSimple(ctx, up.BA, up.BP, lo.TP, lo.TA, cam, levelDy(S, i), a, R.discTint, sc);
    }
    { // L5/S1
      const up = G.lv[NL - 1];
      const a = levelAppear(S, NL) * ctxDim(-1);
      drawDiscSimple(ctx, up.BA, up.BP, G.s1TP, G.s1TA, cam, levelDy(S, NL), a, R.discTint, sc);
    }
    // ---- sacrum
    {
      const a = levelAppear(S, NL) * ctxDim(-1);
      if (a > 0.004) {
        const pts = G.sacrum.map((p) => W2S(p, levelDy(S, NL)));
        roundedPath(ctx, pts);
        ctx.fillStyle = rgba('bone', 0.94 * a); ctx.fill();
        ctx.strokeStyle = rgba('white', 0.8 * a); ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
        // crêtes transverses des vertèbres sacrées soudées
        ctx.strokeStyle = rgba('white', 0.22 * a); ctx.lineWidth = 1;
        for (const [p, q] of G.sacRidges) line(ctx, W2S(p, levelDy(S, NL)), W2S(q, levelDy(S, NL)));
      }
    }
    // ---- vertèbres
    for (let i = NL - 1; i >= 0; i--) {
      const V = G.lv[i];
      const a = levelAppear(S, i) * ctxDim(i);
      if (a <= 0.004) continue;
      const dy = levelDy(S, i);
      const tint = regionTint(S, V.L);
      const col = mix('white', 'cyan', tint * 0.85);
      ctx.lineJoin = 'round';
      for (const ex of V.extraW) {
        roundedPath(ctx, ex.map((p) => W2S(p, dy)));
        ctx.fillStyle = rgba('bone', 0.94 * a); ctx.fill();
        ctx.strokeStyle = rgba(col, 0.85 * a); ctx.lineWidth = lw; ctx.stroke();
      }
      roundedPath(ctx, V.world.map((p) => W2S(p, dy)));
      ctx.fillStyle = rgba('bone', (V.L.reg === 'C1' ? 0.7 : 0.94) * a); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.85 * a); ctx.lineWidth = lw; ctx.stroke();
      if (dA > 0.01 && (i === IX.L4 || i === IX.L5 || i === IX.L3)) drawBoneDetail(ctx, V, cam, dA * (i === IX.L3 ? 0.4 : 1) * a);
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

  // =========================================================================
  //  SEGMENT L4/L5 DÉTAILLÉ : disque, noyau, ligaments
  // =========================================================================
  function ligamentPaths(G, D) {
    const L4 = G.lv[IX.L4], L5 = G.lv[IX.L5];
    const w4 = (p) => toW(L4.F, p), w5 = (p) => toW(L5.F, p);
    const b4 = L4.loc.body, b5 = L5.loc.body;
    const s4 = L4.loc, s5 = L5.loc;
    const offA = (p, F, d) => vsub(p, vmul(F.x, d));
    const offP = (p, F, d) => vadd(p, vmul(F.x, d));
    const B4 = (u, v) => toW(L4.F, bodyMap(b4, u, v)), B5 = (u, v) => toW(L5.F, bodyMap(b5, u, v));
    const sx4 = s4.sx, sy4 = s4.sy, sx5 = s5.sx, sy5 = s5.sy;
    const P4 = (x, y) => w4([x * sx4, y * sy4]), P5 = (x, y) => w5([x * sx5, y * sy5]);
    return {
      lla: [offA(B4(-1, -0.95), L4.F, 1.4), offA(B4(-1.02, 0), L4.F, 1.2), offA(B4(-1, 0.95), L4.F, 1.4),
        vadd(discMap(D, -1, 0), vmul(D.ant, 1.3)), offA(B5(-1, -0.95), L5.F, 1.4), offA(B5(-1.02, 0), L5.F, 1.2), offA(B5(-1, 0.95), L5.F, 1.4)],
      llp: [offP(B4(1, 0.0), L4.F, 1.0), offP(B4(1, 0.95), L4.F, 1.0), vadd(discMap(D, 1, 0), vmul(D.post, 1.0)),
        offP(B5(1, -0.95), L5.F, 1.0), offP(B5(1, 0.0), L5.F, 1.0)],
      flavum: [P4(54.5, 11.6), vlerp(P4(54.5, 11.6), P5(52, -4.6), 0.5), P5(52, -4.6)],
      inter: [[P4(58.5, 11.4), P5(55.5, -3.6)], [P4(62, 11.3), P5(59.5, -2.6)], [P4(65.5, 11.1), P5(63, -2)], [P4(69, 11), P5(66.5, -1.4)], [P4(72.5, 10.6), P5(70, -1)]],
      supra: [P4(78.5, -1), P4(80.8, 5.5), P4(78.5, 10.5), P5(77, 0), P5(80.8, 5.5), P5(78.5, 10.5)],
      facet: L4.loc.art ? { top: w4(L4.loc.art.top), bot: w4(L4.loc.art.bot) } : null,
      supraMid: vlerp(P4(78.5, 10.5), P5(77, 0), 0.5),
      interMid: vlerp(P4(65.5, 11.1), P5(63, -2), 0.5),
    };
  }
  const LIG0 = (() => { const p = ligamentPaths(G_FINAL, D_FINAL); return {
    lla: polyLen(p.lla), llp: polyLen(p.llp), flavum: polyLen(p.flavum),
    inter: p.inter.map((f) => polyLen(f)), supra: polyLen(p.supra) }; })();

  function drawLigament(ctx, cam, ptsW, o) {
    if (o.a <= 0.004) return;
    let pts = ptsW.map((p) => cam.w2s(p));
    if (o.strain < 0) { // ligament détendu : légère ondulation
      const tot = polyLen(pts); let acc = 0;
      const amp = Math.min(0.5 * cam.sc, -o.strain * 4 * cam.sc, 0.05 * tot), out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], L = vlen(vsub(b, a)), n = vnorm(perp(vsub(b, a)));
        const k = Math.max(2, Math.ceil(L / 6));
        for (let j = 0; j < k; j++) { const f = j / k, d = acc + f * L; out.push(vadd(vlerp(a, b, f), vmul(n, amp * Math.sin((d / tot) * Math.PI * 6) * Math.sin((d / tot) * Math.PI)))); }
        acc += L;
      }
      out.push(pts[pts.length - 1]); pts = out;
    }
    pts = partial(pts, o.prog == null ? 1 : o.prog);
    const col = o.col;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    smoothPath(ctx, pts);
    ctx.strokeStyle = rgba(col, 0.22 * o.a); ctx.lineWidth = Math.max(3, o.width * cam.sc); ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.9 * o.a); ctx.lineWidth = Math.max(1.2, o.width * cam.sc * 0.28); ctx.stroke();
  }

  function drawFSU(ctx, G, cam, S, R) {
    const a = R.detail; if (a <= 0.01) return;
    const D = R.D, t = S.t;
    // ---------- disque : contour externe
    const outline = [];
    for (let k = 0; k <= 20; k++) outline.push(discMap(D, -1 + k / 10, -1));
    for (let k = 0; k <= 20; k++) outline.push(discMap(D, 1, -1 + k / 10));
    for (let k = 0; k <= 20; k++) outline.push(discMap(D, 1 - k / 10, 1));
    for (let k = 0; k <= 20; k++) outline.push(discMap(D, -1, 1 - k / 10));
    const so = outline.map((p) => cam.w2s(p));
    polyPath(ctx, so, true);
    const cS = cam.w2s(D.center);
    const gr = ctx.createRadialGradient(cS[0], cS[1], 4, cS[0], cS[1], D.depth * cam.sc * 0.55);
    gr.addColorStop(0, rgba(mix('cyan', 'bg', 0.55), 0.85 * a)); gr.addColorStop(1, rgba(mix('cyan', 'bg', 0.82), 0.92 * a));
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = rgba('cyan', 0.85 * a); ctx.lineWidth = 1.8; ctx.stroke();

    // ---------- lamelles de l'anneau fibreux
    const lamP = R.lamProg;
    if (lamP > 0) {
      const un = NUC.u0 + R.nucShift;
      const sides = [{ sgn: -1, inner: un - NUC.ru - 0.05, stress: R.stressA }, { sgn: 1, inner: un + NUC.ru + 0.05, stress: R.stressP }];
      for (const sd of sides) {
        for (let k = 1; k <= 7; k++) {
          const f = k / 7;
          const u = lerp(sd.inner, sd.sgn, f);
          const pts = []; for (let j = 0; j <= 18; j++) { const v = -0.97 + (j * 1.94) / 18; pts.push(cam.w2s(discMap(D, u, v))); }
          const pr = seg(lamP, (k - 1) / 10, (k - 1) / 10 + 0.4);
          if (pr <= 0) continue;
          const col = R.stressMode > 0 ? mix(mix('cyan', 'orange', R.hoop * 0.75), stressRGB(sd.stress * (0.45 + 0.55 * f)), R.stressMode) : mix('cyan', 'orange', R.hoop * 0.75);
          smoothPath(ctx, partial(pts, pr));
          ctx.strokeStyle = rgba(col, (0.38 + 0.5 * f) * a * R.lamA); ctx.lineWidth = 1.1 + 0.9 * f; ctx.stroke();
        }
      }
    }
    // ---------- noyau pulpeux
    if (R.nucA > 0.01) {
      const un = NUC.u0 + R.nucShift, vn = NUC.v0;
      const pts = [];
      for (let k = 0; k < 64; k++) {
        const g = (k / 64) * Math.PI * 2;
        const wob = 1 + 0.035 * Math.sin(3 * g + 2.1 * t) + 0.02 * Math.sin(5 * g - 1.3 * t);
        // en flexion le noyau s'épaissit côté postérieur (forme en goutte)
        const bias = 1 + 0.18 * clamp(R.nucShift / 0.1, -1, 1) * Math.cos(g);
        pts.push(cam.w2s(discMap(D, un + NUC.ru * wob * bias * Math.cos(g), vn + NUC.rv * wob * Math.sin(g))));
      }
      const c = cam.w2s(discMap(D, un, vn));
      polyPath(ctx, pts, true);
      const rad = NUC.ru * D.depth * 0.5 * cam.sc;
      const g2 = ctx.createRadialGradient(c[0], c[1], 2, c[0], c[1], rad * 1.1);
      const core = mix([170, 240, 255], 'orange', R.press), edge = mix('cyan', 'orange', R.press);
      g2.addColorStop(0, rgba(core, 0.62 * R.nucA)); g2.addColorStop(0.7, rgba(edge, 0.32 * R.nucA)); g2.addColorStop(1, rgba(edge, 0.16 * R.nucA));
      ctx.fillStyle = g2; ctx.fill();
      ctx.strokeStyle = rgba(mix([190, 245, 255], 'orange', R.press), 0.9 * R.nucA); ctx.lineWidth = 1.6; ctx.stroke();
      // structure de gel
      ctx.lineWidth = 1;
      for (let j = 1; j <= 3; j++) {
        const f = 1 - j * 0.22, gp = [];
        for (let k = 0; k <= 40; k++) {
          const g = (k / 40) * Math.PI * 2, wob = 1 + 0.08 * Math.sin(2 * g + j * 1.7 + 1.6 * t);
          gp.push(cam.w2s(discMap(D, un + NUC.ru * f * wob * Math.cos(g), vn + NUC.rv * f * Math.sin(g))));
        }
        polyPath(ctx, gp, true); ctx.strokeStyle = rgba(mix([190, 245, 255], 'orange', R.press), 0.18 * R.nucA); ctx.stroke();
      }
    }
  }

  function drawLigaments(ctx, G, cam, S, R) {
    if (R.ligA <= 0.01) return;
    const P = R.lig;
    const strain = (cur, ref) => cur / ref - 1;
    const colOf = (st) => (R.stressMode > 0 ? mix('cyan', stressRGB(clamp(st / 0.45)), R.stressMode * smooth(st / 0.08)) : rgbOf('cyan'));
    const show = R.ligShow; // apparition séquentielle (scène 2)
    const A = R.ligA;
    const sLLA = strain(polyLen(P.lla), LIG0.lla), sLLP = strain(polyLen(P.llp), LIG0.llp), sFl = strain(polyLen(P.flavum), LIG0.flavum);
    const sSup = strain(polyLen(P.supra), LIG0.supra);
    const sInt = P.inter.map((f, i) => strain(polyLen(f), LIG0.inter[i]));
    const sIntM = sInt.reduce((x, y) => x + y, 0) / sInt.length;
    R.ligStrain = { lla: sLLA, llp: sLLP, flavum: sFl, inter: sIntM, supra: sSup };
    drawLigament(ctx, cam, P.lla, { col: colOf(sLLA), a: A * show[1] * R.hl(1), prog: show[1], width: 1.6, strain: sLLA });
    drawLigament(ctx, cam, P.llp, { col: colOf(sLLP), a: A * show[2] * R.hl(2), prog: show[2], width: 1.0, strain: sLLP });
    drawLigament(ctx, cam, P.flavum, { col: colOf(sFl), a: A * show[3] * R.hl(3), prog: show[3], width: 2.6, strain: sFl });
    P.inter.forEach((f, i) => drawLigament(ctx, cam, f, { col: colOf(sInt[i]), a: A * show[4] * R.hl(4) * 0.85, prog: show[4], width: 0.9, strain: sInt[i] }));
    drawLigament(ctx, cam, P.supra, { col: colOf(sSup), a: A * show[5] * R.hl(5), prog: show[5], width: 1.4, strain: sSup });
    // capsule articulaire zygapophysaire
    if (P.facet && show[6] > 0) {
      const c = cam.w2s(vlerp(P.facet.top, P.facet.bot, 0.5));
      const ax = vsub(cam.w2s(P.facet.bot), cam.w2s(P.facet.top));
      const ang = Math.atan2(ax[1], ax[0]);
      ctx.save(); ctx.translate(c[0], c[1]); ctx.rotate(ang);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = rgba(R.facetCol || 'cyan', 0.8 * A * show[6] * R.hl(6)); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(0, 0, vlen(ax) / 2 + 2.6 * cam.sc, 4.2 * cam.sc, 0, 0, Math.PI * 2 * show[6]); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
  }

  // =========================================================================
  //  RENDU PRINCIPAL
  // =========================================================================
  let CTX = null;
  const curveMemo = new Map();
  function curveFor(S) {
    if (S.aL >= 1 && S.aT >= 1 && S.aC >= 1 && S.k === 1) return CURVE_FINAL;
    const key = [S.aL, S.aT, S.aC, S.k].map((v) => v.toFixed(6)).join('|');
    let c = curveMemo.get(key);
    if (!c) { c = spineCurve(S.aL, S.aT, S.aC, S.k); if (curveMemo.size > 64) curveMemo.clear(); curveMemo.set(key, c); }
    return c;
  }

  function renderAt(ctx, t) {
    LBL = [];
    const S = state(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);

    const C = curveFor(S);
    const G = geometry(C, S.theta, CIR, S.gamma, FOCUS);
    const cam = camera(S.zoom);

    // ---- paramètres de rendu dérivés
    const R = {};
    R.detail = smooth(seg(cam.sc, 3.2, 7.5));
    R.discTint = 0;
    if (t > 6.2 && t < 7.4) R.discTint = clamp((S.k - 1) / 0.05) * 0.9;
    R.cir = G.cir;
    R.D = discFrame(G);
    const D = R.D;
    D.bA = 0.6 + 0.55 * Math.max(0, H0A - D.hA);
    D.bP = 0.6 + 0.55 * Math.max(0, H0P - D.hP);
    R.mech = mechanics(S.theta, D);
    R.nucShift = R.mech.dx / (D.depth / 2);
    R.lamProg = seg(t, 11.35, 12.4);
    if (t >= 26) R.lamProg = 1;
    R.lamA = 1;
    R.nucA = smooth(seg(t, 11.3, 12.0)) * R.detail;
    R.hoop = fio(t, 14.0, 17.2, 0.6, 0.6);
    R.press = R.hoop * 0.8;
    R.stressMode = fio(t, 18.0, 26.2, 0.6, 0.5);
    const tens = (h, h0) => Math.max(Math.max(0, 1 - h / h0) / 0.45, Math.max(0, h / h0 - 1) / 0.18);
    R.stressA = clamp(tens(D.hA, H0A)); R.stressP = clamp(tens(D.hP, H0P));
    R.lig = ligamentPaths(G, D);
    const ligStart = 9.15, ligStep = 0.3;
    R.ligShow = [0, 1, 2, 3, 4, 5, 6].map((k) => smooth(seg(t, ligStart + k * ligStep, ligStart + k * ligStep + 0.45)));
    R.ligA = R.detail * (1 - smooth(seg(t, 26.0, 26.6)));
    // mise en évidence (scène 2a) puis atténuation pendant le focus discal
    const dimLig = 1 - 0.6 * fio(t, 11.2, 17.6, 0.5, 0.6);
    R.hl = () => dimLig;
    R.facetCol = 'cyan';

    ctx.globalAlpha = S.gA;
    drawGrid(ctx, cam);
    scene1Under(ctx, G, cam, S, R);
    drawSpine(ctx, G, cam, S, R);
    drawFSU(ctx, G, cam, S, R);
    drawLigaments(ctx, G, cam, S, R);
    scene1Over(ctx, G, cam, S, R);
    scene2Over(ctx, G, cam, S, R);
    scene3Over(ctx, G, cam, S, R);
    scene4Over(ctx, G, cam, S, R);
    drawVignette(ctx);
    drawPanel(ctx, G, cam, S, R);
    drawHUD(ctx, cam, S);
    ctx.globalAlpha = 1;
    return { t, labels: LBL };
  }

  // =========================================================================
  //  SCÈNE 1 — courbures, loi de Delmas
  // =========================================================================
  const REGIONS = [
    { key: 'L', name: 'LORDOSE LOMBAIRE', range: 'L1–S1', side: 1, sA: () => LV[IX.L1].sTop, sB: () => 0, col: 'cyan', amp: (S) => S.aL, t0: 2.0, ext: 104 },
    { key: 'T', name: 'CYPHOSE THORACIQUE', range: 'T4–T12', side: -1, sA: () => LV[IX.T4].sTop, sB: () => LV[IX.T12].sBot, col: 'white', amp: (S) => S.aT, t0: 3.4, ext: 36 },
    { key: 'C', name: 'LORDOSE CERVICALE', range: 'C2–C7', side: 1, sA: () => LV[IX.C2].sBot, sB: () => LV[IX.C7].sBot, col: 'cyan', amp: (S) => S.aC, t0: 4.8, ext: 54 },
  ];
  function depthAt(s) { // profondeur du corps vertébral à l'abscisse s (pour les lignes de Cobb)
    if (s <= 0) return S1D;
    for (const L of LV) if (s >= L.sBot - 0.01 && s <= L.sTop + 0.01) return L.D;
    return 30;
  }

  function scene1Under(ctx, G, cam, S) {
    const t = S.t;
    if (t > 8.2) return;
    // axe vertical de référence (gravité)
    const a = smooth(seg(t, 0.15, 0.8)) * (1 - smooth(seg(t, 7.2, 7.8)));
    if (a > 0.004) {
      const top = cam.w2s([0, -LV[0].sTop - 30]), bot = cam.w2s([0, SAC_LEN + 15]);
      const pr = E.io(seg(t, 0.1, 0.9));
      ctx.setLineDash([6, 6]); ctx.strokeStyle = rgba('grey', 0.75 * a); ctx.lineWidth = 1.2;
      line(ctx, top, vlerp(top, bot, pr)); ctx.setLineDash([]);
      text(ctx, 'VERTICALE', top[0] + 8, top[1] + 4, { size: 12, c: 'grey', a: a * fio(t, 0.6, 2.3, 0.4, 0.4), ls: 2 });
    }
  }

  function scene1Over(ctx, G, cam, S, R) {
    const t = S.t;
    if (t > 8.6) return;
    const C = G.C;
    // ---- ligne technique (axe des corps) colorée par région
    const lineA = smooth(seg(t, 1.6, 2.0)) * (1 - smooth(seg(t, 7.2, 7.8)));
    if (lineA > 0.004) {
      const sTop = LV[IX.C2].sMid;
      const pts = []; for (let s = 0; s <= sTop; s += 4) pts.push(cam.w2s([lookup(C.X, s), lookup(C.Y, s)]));
      polyPath(ctx, pts); ctx.strokeStyle = rgba('grey', 0.6 * lineA); ctx.lineWidth = 1.2; ctx.stroke();
      for (const rg of REGIONS) {
        const amp = rg.amp(S); if (amp <= 0.01) continue;
        const sa = rg.sA(), sb = rg.sB(), p2 = [];
        for (let s = sb; s <= sa; s += 3) p2.push(cam.w2s([lookup(C.X, s), lookup(C.Y, s)]));
        polyPath(ctx, p2); glowStroke(ctx, rg.col, 0.9 * lineA * amp, 2.4);
      }
    }
    // ---- mesures de Cobb + étiquettes
    for (const rg of REGIONS) {
      const a = fio(t, rg.t0, 7.4, 0.45, 0.35);
      if (a <= 0.004) continue;
      const sa = rg.sA(), sb = rg.sB();
      const angle = Math.abs(curveAngle(C, sa) - curveAngle(C, sb));
      const Fa = frameAt(C, sa), Fb = frameAt(C, sb);
      const dir = rg.side;
      ctx.setLineDash([4, 5]); ctx.lineWidth = 1.1; ctx.strokeStyle = rgba(rg.col, 0.75 * a);
      for (const [F, s] of [[Fa, sa], [Fb, sb]]) {
        const d = depthAt(s);
        line(ctx, cam.w2s(vadd(F.o, vmul(F.x, -dir * d / 2))), cam.w2s(vadd(F.o, vmul(F.x, dir * rg.ext))));
      }
      ctx.setLineDash([]);
      const br = []; for (let s = sb; s <= sa + 0.01; s += (sa - sb) / 24) { const F = frameAt(C, s); br.push(cam.w2s(vadd(F.o, vmul(F.x, dir * rg.ext)))); }
      polyPath(ctx, br); ctx.strokeStyle = rgba(rg.col, 0.9 * a); ctx.lineWidth = 1.6; ctx.stroke();
      for (const p of [br[0], br[br.length - 1]]) dot(ctx, p, 2.6, rg.col, a);
      const Fm = frameAt(C, (sa + sb) / 2);
      const m = cam.w2s(vadd(Fm.o, vmul(Fm.x, dir * rg.ext)));
      const lx = m[0] + dir * 16, align = dir > 0 ? 'left' : 'right';
      text(ctx, rg.name, lx, m[1] - 8, { size: 14, c: rg.col, a, align, ls: 1.5, w: 600 });
      text(ctx, rg.range + ' · ' + Math.round(angle) + '°', lx, m[1] + 18, { size: 22, c: 'white', a, align, w: 500 });
    }
    // ---- charge axiale
    const la = fio(t, 6.0, 7.3, 0.25, 0.35);
    if (la > 0.004) {
      const top = cam.w2s(toW(G.lv[0].F, [0, -LV[0].H / 2]));
      const drop = E.out(seg(t, 6.0, 6.3));
      const tip = [top[0], top[1] - 8 - 24 * (1 - drop)];
      arrow(ctx, [tip[0], tip[1] - 58], tip, 'orange', la, { lw: 4, head: 16 });
      text(ctx, 'CHARGE AXIALE', tip[0] + 24, tip[1] - 30, { size: 14, c: 'orange', a: la, ls: 1.5, w: 600 });
      text(ctx, 'amortissement élastique', tip[0] + 24, tip[1] - 10, { size: 13, c: 'grey', a: la * smooth(seg(t, 6.35, 6.6)) });
    }
    // ---- réticule de visée L4–L5 (ancré dans le monde, il grossit avec le zoom)
    const ra = fio(t, 7.15, 8.9, 0.3, 0.5);
    if (ra > 0.004) {
      const c = cam.w2s(FOCUS), r = 30 * cam.sc * (1 + 0.6 * (1 - E.out(seg(t, 7.15, 7.6))));
      ctx.strokeStyle = rgba('cyan', 0.9 * ra); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); ctx.stroke();
      const rot = (t - 7.15) * 0.8;
      for (let k = 0; k < 4; k++) {
        const g = rot + (k * Math.PI) / 2, u = [Math.cos(g), Math.sin(g)];
        line(ctx, vadd(c, vmul(u, r - 8)), vadd(c, vmul(u, r + 12)));
      }
      ctx.strokeStyle = rgba('cyan', 0.35 * ra); ctx.lineWidth = 1;
      line(ctx, [c[0] - r * 0.35, c[1]], [c[0] + r * 0.35, c[1]]); line(ctx, [c[0], c[1] - r * 0.35], [c[0], c[1] + r * 0.35]);
      const la2 = ra * smooth(seg(t, 7.35, 7.6)) * (1 - smooth(seg(t, 7.95, 8.3)));
      text(ctx, 'CIBLE · SEGMENT L4–L5', c[0] + r + 22, c[1] + 6, { size: 15, c: 'cyan', a: la2, ls: 1.5, w: 600, bg: 0.7 });
    }
  }

  // =========================================================================
  //  SCÈNE 2 — segment mobile de Junghanns
  // =========================================================================
  const COMPONENTS = ['DISQUE INTERVERTÉBRAL', 'LIG. LONGITUDINAL ANTÉRIEUR', 'LIG. LONGITUDINAL POSTÉRIEUR', 'LIGAMENT JAUNE',
    'LIG. INTERÉPINEUX', 'LIG. SUPRA-ÉPINEUX', 'ART. ZYGAPOPHYSAIRE'];

  function markerPositions(G, cam, R) {
    const D = R.D, P = R.lig, L4 = G.lv[IX.L4];
    const s = (w) => cam.w2s(w);
    return [
      s(discMap(D, -0.62, 0)),
      vadd(s(toW(L4.F, bodyMapL(L4, -1, 0))), [-34, 0]),
      vadd(s(vadd(discMap(D, 1, 0), vmul(D.post, 6))), [0, 0]),
      vadd(s(vlerp(P.flavum[1], P.flavum[2], 0.5)), [-22, -6]),
      s(P.interMid),
      vadd(s(P.supraMid), [30, 0]),
      vadd(s(vlerp(P.facet.top, P.facet.bot, 0.15)), [-26, -24]),
    ];
  }
  const bodyMapL = (V, u, v) => bodyMap(V.loc.body, u, v);

  function scene2Over(ctx, G, cam, S, R) {
    const t = S.t;
    if (t < 8.6 || t > 18.4) return;
    const D = R.D;
    // ---- enveloppe de l'unité fonctionnelle
    const ea = fio(t, 9.0, 17.6, 0.5, 0.6) * (0.35 + 0.65 * (1 - smooth(seg(t, 11.0, 11.6))));
    if (ea > 0.004) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const V of [G.lv[IX.L4], G.lv[IX.L5]]) for (const p of V.world) {
        const q = cam.w2s(p); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      }
      x0 = Math.max(70, x0 - 34); y0 = Math.max(178, y0 - 22); x1 = Math.min(1200, x1 + 30); y1 = Math.min(948, y1 + 22);
      const pr = E.io(seg(t, 9.0, 9.8));
      ctx.setLineDash([8, 7]); ctx.lineDashOffset = -t * 30;
      roundedPath(ctx, [[x0, y0, 16], [x1, y0, 16], [x1, y1, 16], [x0, y1, 16]]);
      ctx.strokeStyle = rgba('cyan', 0.5 * ea * pr); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      text(ctx, 'UNITÉ FONCTIONNELLE · L4–L5', x1 - 8, y1 - 12, { size: 13, c: 'cyan', a: ea * pr, ls: 2.5, w: 600, bg: 0.8, align: 'right' });
    }
    // ---- marqueurs numérotés
    const ma = 1 - smooth(seg(t, 11.0, 11.5));
    if (ma > 0.004 && t > 9.1) {
      const M = markerPositions(G, cam, R);
      M.forEach((p, k) => {
        const tk = 9.15 + k * 0.3, a = smooth(seg(t, tk, tk + 0.25)) * ma;
        if (a <= 0.004) return;
        const sc = E.back(seg(t, tk, tk + 0.3));
        ctx.fillStyle = rgba('bg', 0.92 * a); ctx.beginPath(); ctx.arc(p[0], p[1], 13 * sc, 0, Math.PI * 2); ctx.fill();
        ring(ctx, p, 13 * sc, 'cyan', a, 1.8);
        text(ctx, String(k + 1), p[0], p[1] + 5.5, { size: 15, c: 'white', a, align: 'center', w: 700, id: 'mk' + k });
      });
    }
    // ---- étiquettes anneau / noyau
    const ta = fio(t, 11.4, 17.2, 0.4, 0.5);
    if (ta > 0.004) {
      leaderTag(ctx, cam.w2s(discMap(D, -0.86, -0.25)), [200, 420], [{ s: 'ANNEAU', c: 'cyan', w: 600 }, { s: 'FIBREUX', c: 'cyan', w: 600 }], { a: ta, size: 15, lc: 'cyan', align: 'right' });
      const na = fio(t, 11.7, 17.2, 0.4, 0.5);
      leaderTag(ctx, cam.w2s(discMap(D, NUC.u0 - 0.15, 0.25)), [200, 690], [{ s: 'NOYAU', c: [190, 245, 255], w: 600 }, { s: 'PULPEUX', c: [190, 245, 255], w: 600 }], { a: na, size: 15, lc: [190, 245, 255], align: 'right' });
    }
    // ---- principe hydrostatique : pression isotrope du noyau
    const ha = R.hoop;
    if (ha > 0.004) {
      const un = NUC.u0 + R.nucShift, vn = NUC.v0, pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.1);
      for (let k = 0; k < 16; k++) {
        const g = (k / 16) * Math.PI * 2 + 0.2;
        const pu = un + NUC.ru * Math.cos(g), pv = vn + NUC.rv * Math.sin(g);
        const nu = Math.cos(g) / NUC.ru, nv = Math.sin(g) / NUC.rv, nl = Math.hypot(nu, nv);
        const p0 = cam.w2s(discMap(D, pu, pv)), p1 = cam.w2s(discMap(D, pu + (0.02 * nu) / nl, pv + (0.02 * nv) / nl));
        const dir = vnorm(vsub(p1, p0));
        const L = (2.6 + 1.1 * pulse) * cam.sc;
        arrow(ctx, vadd(p0, vmul(dir, 2)), vadd(p0, vmul(dir, 2 + L)), 'orange', ha * 0.95, { lw: 1.8, head: 7, noGlow: true });
      }
      // charge axiale sur L4
      const L4 = G.lv[IX.L4];
      for (const u of [-0.45, 0.3]) {
        const p = cam.w2s(toW(L4.F, bodyMapL(L4, u, -1)));
        arrow(ctx, [p[0], p[1] - 78], [p[0], p[1] - 10], 'orange', ha, { lw: 3.5, head: 15 });
      }
      const p = cam.w2s(toW(L4.F, bodyMapL(L4, -0.45, -1)));
      text(ctx, 'CHARGE AXIALE', p[0] - 18, p[1] - 44, { size: 14, c: 'orange', a: ha, align: 'right', ls: 1.5, w: 600, bg: 0.7 });
    }
    // ---- repère discal n̂/t̂ et CIR (transition vers la scène 3)
    drawDiscAxes(ctx, cam, R, fio(t, 17.0, 26.2, 0.5, 0.6), t);
  }

  function drawDiscAxes(ctx, cam, R, a, t) {
    if (a <= 0.004) return;
    const D = R.D, c = cam.w2s(D.center), L = 7 * cam.sc;
    const nE = vadd(c, vmul([D.n[0], D.n[1]], L * 0.9)), tE = vadd(c, vmul(D.t, L * 1.25));
    // plan moyen du disque
    ctx.setLineDash([3, 5]); ctx.strokeStyle = rgba('white', 0.35 * a); ctx.lineWidth = 1;
    line(ctx, cam.w2s(vlerp(D.TA, D.BA, 0.5)), cam.w2s(vlerp(D.TP, D.BP, 0.5))); ctx.setLineDash([]);
    const ax = 1 - smooth(seg(t, 18.2, 18.8)) * 0.65;
    arrow(ctx, c, nE, 'white', 0.75 * a * ax, { lw: 1.6, head: 10, noGlow: true });
    arrow(ctx, c, tE, 'white', 0.75 * a * ax, { lw: 1.6, head: 10, noGlow: true });
    text(ctx, 'n̂', nE[0] + 10, nE[1] + 4, { size: 16, c: 'white', a: a * ax, id: 'axis-n' });
    text(ctx, 't̂', tE[0] - 6, tE[1] - 10, { size: 16, c: 'white', a: a * ax, align: 'right', id: 'axis-t' });
    // CIR
    const p = cam.w2s(R.cir);
    ctx.strokeStyle = rgba('cyan', a); ctx.lineWidth = 1.6;
    ring(ctx, p, 7, 'cyan', a, 1.6);
    line(ctx, [p[0] - 13, p[1]], [p[0] + 13, p[1]]); line(ctx, [p[0], p[1] - 13], [p[0], p[1] + 13]);
    text(ctx, 'CIR', p[0] + 14, p[1] + 24, { size: 13, c: 'cyan', a, ls: 1.5, w: 600, bg: 0.7 });
  }

  // =========================================================================
  //  SCÈNE 3 — flexion / extension, vecteurs de force
  // =========================================================================
  function scene3Over(ctx, G, cam, S, R) {
    const t = S.t;
    if (t < 17.8 || t > 26.6) return;
    const a = fio(t, 18.0, 26.2, 0.5, 0.6);
    if (a <= 0.004) return;
    const D = R.D, M = R.mech, c = cam.w2s(D.center);
    // décomposition R = Fc + Fs (R vertical)
    const Cv = vmul(D.n, -M.Fc * F_SCALE), Sv = vmul(D.t, M.Fs * F_SCALE);
    const Rv = vadd(Cv, Sv);
    const tailC = vsub(c, Cv), tailS = vsub(c, Sv), tailR = vsub(c, Rv);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba('white', 0.4 * a); ctx.lineWidth = 1;
    line(ctx, tailR, tailC); line(ctx, tailR, tailS); ctx.setLineDash([]);
    arrow(ctx, tailR, c, 'white', 0.8 * a, { lw: 2, head: 12, dash: [7, 5], noGlow: true, outline: true });
    arrow(ctx, tailC, c, 'red', a, { lw: 4.5, head: 18, outline: true });
    arrow(ctx, tailS, c, 'orange', a, { lw: 4, head: 16, outline: true });
    text(ctx, 'Fc', tailC[0] - 14, tailC[1] + 4, { size: 18, c: 'red', a, align: 'right', w: 700, bg: 0.7 });
    text(ctx, 'R', tailR[0] + 12, tailR[1] + 2, { size: 16, c: 'white', a: a * 0.9, w: 700, bg: 0.7 });
    const sLbl = vadd(tailS, [10, -14]);
    text(ctx, 'Fs', sLbl[0], sLbl[1], { size: 18, c: 'orange', a: a * smooth((Math.abs(M.Fs) - 50) / 60), w: 700, bg: 0.7 });

    // facettes : contact (Ff) ou décoaptation
    const P = R.lig;
    if (P.facet) {
      const fc = vlerp(P.facet.top, P.facet.bot, 0.55), fs = cam.w2s(fc);
      const L4 = G.lv[IX.L4];
      const nW = toW(L4.F, L4.loc.art.n), n0 = toW(L4.F, [0, 0]);
      const nDir = vnorm(vsub(nW, n0)); // normale articulaire (vers l'arrière)
      const len = M.Ff * F_SCALE;
      if (len > 1.5) arrow(ctx, vadd(fs, vmul(nDir, len + 6)), vadd(fs, vmul(nDir, 4)), 'orange', a * smooth(M.share / 0.08), { lw: 3.5, head: 12, outline: true });
      const share = M.share;
      const lbl = share > 0.11 ? 'FACETTES EN CONTACT' : share < 0.02 ? 'DÉCOAPTATION FACETTAIRE' : 'FACETTES';
      const col = share > 0.11 ? 'orange' : share < 0.02 ? 'cyan' : 'white';
      leaderTag(ctx, fs, [fs[0] + 150, fs[1] + 250], [{ s: lbl, c: col, w: 600 }, { s: 'Ff ' + Math.round(M.Ff) + ' N · ' + Math.round(share * 100) + ' %', c: 'white', size: 14 }],
        { a: a * fio(t, 18.6, 26.2, 0.4, 0.6), size: 14, lc: col });
    }
    // migration du noyau
    const un = NUC.u0 + R.nucShift;
    const nc = cam.w2s(discMap(D, un - 0.12 * Math.sign(M.dx || 1), NUC.v0 + 0.36));
    const md = vmul(D.post, Math.sign(M.dx) || 1);
    const mlen = Math.abs(M.dx) * cam.sc * 3.2;
    if (mlen > 3) arrow(ctx, nc, vadd(nc, vmul(md, mlen)), 'cyan', a, { lw: 2.6, head: 10, outline: true });
    const dirTxt = M.dx > 0.05 ? '→ POSTÉRIEUR' : M.dx < -0.05 ? '← ANTÉRIEUR' : 'CENTRÉ';
    leaderTag(ctx, cam.w2s(discMap(D, un - 0.2, 0.3)), [200, 690], [{ s: 'NOYAU', c: [190, 245, 255], w: 600 }, { s: dirTxt, c: 'cyan', size: 14 }, { s: fmt(Math.abs(M.dx), 1) + ' mm', c: 'white', size: 14 }],
      { a: a * smooth(seg(t, 18.4, 18.9)), size: 15, lc: [190, 245, 255], align: 'right' });
    // ligaments postérieurs en tension
    const st = R.ligStrain || { supra: 0, inter: 0 };
    const tA = a * smooth((Math.max(st.supra, st.inter) - 0.05) / 0.12);
    if (tA > 0.004) {
      const p = cam.w2s(P.supraMid);
      text(ctx, 'TENSION', p[0] + 24, p[1] - 4, { size: 14, c: 'red', a: tA, w: 700, ls: 1.5, bg: 0.75 });
      text(ctx, 'lig. post.', p[0] + 24, p[1] + 16, { size: 13, c: 'white', a: tA * 0.9, bg: 0.75 });
    }
    const aA = a * smooth((st.lla - 0.04) / 0.1);
    if (aA > 0.004) {
      const p = cam.w2s(R.lig.lla[1]);
      text(ctx, 'TENSION LLA', p[0] - 20, p[1] + 64, { size: 13, c: 'orange', a: aA, align: 'right', w: 700, ls: 1, bg: 0.75 });
    }
  }

  // =========================================================================
  //  SCÈNE 4 — synthèse : alignement sagittal et facettes
  // =========================================================================
  function scene4Over(ctx, G, cam, S) {
    const t = S.t;
    if (t < 26.6) return;
    // fil à plomb de C7
    const pa = fio(t, 26.9, 30.2, 0.4, 0.4);
    if (pa > 0.004) {
      const c7 = toW(G.lv[IX.C7].F, [0, 0]);
      const corner = G.s1TP;
      const y1 = corner[1] + 22;
      const pr = E.io(seg(t, 26.9, 27.7));
      const top = cam.w2s(c7), bot = cam.w2s([c7[0], lerp(c7[1], y1, pr)]);
      dot(ctx, top, 4, 'white', pa);
      ctx.setLineDash([7, 5]); ctx.strokeStyle = rgba('white', 0.85 * pa); ctx.lineWidth = 1.4; line(ctx, top, bot); ctx.setLineDash([]);
      text(ctx, 'FIL À PLOMB C7', top[0] - 70, top[1] + 5, { size: 14, c: 'white', a: pa, align: 'right', ls: 1.5, w: 600, bg: 0.7 });
      const da = pa * smooth(seg(t, 27.5, 27.9));
      if (da > 0.004) {
        const yS = cam.w2s(corner)[1] + 16, xP = cam.w2s([c7[0], 0])[0], xC = cam.w2s(corner)[0];
        ctx.strokeStyle = rgba('cyan', da); ctx.lineWidth = 1.4;
        line(ctx, [xP, yS], [xC, yS]); line(ctx, [xC, yS - 6], [xC, yS + 6]); line(ctx, [xP, yS - 6], [xP, yS + 6]);
        dot(ctx, cam.w2s(corner), 3.5, 'cyan', da);
        const sva = corner[0] - c7[0];
        leaderTag(ctx, [Math.min(xP, xC) - 2, yS], [Math.min(xP, xC) - 150, yS + 40],
          [{ s: 'SVA ' + fmt(sva, 0) + ' mm', c: 'cyan', w: 600 }, { s: 'norme < 50 mm', c: 'grey', size: 13 }], { a: da, size: 15, align: 'right', lc: 'cyan' });
      }
    }
    // facettes articulaires
    const fa = fio(t, 27.1, 30.2, 0.3, 0.4);
    if (fa > 0.004) {
      let k = 0;
      for (let i = 1; i < NL; i++) {
        const V = G.lv[i]; if (!V.facetW) continue;
        const tk = 27.15 + k * 0.045; k++;
        const a = fa * smooth(seg(t, tk, tk + 0.2));
        if (a <= 0.004) continue;
        const p = cam.w2s(V.facetW);
        dot(ctx, p, 7, 'cyan', 0.18 * a); dot(ctx, p, 3.2, 'cyan', a);
        const pr = seg(t, tk, tk + 0.6);
        if (pr < 1) ring(ctx, p, 4 + pr * 14, 'cyan', a * (1 - pr), 1.2);
      }
      const l5 = cam.w2s(G.lv[IX.L3].facetW);
      text(ctx, 'FACETTES', l5[0] + 26, l5[1] + 6, { size: 14, c: 'cyan', a: fa * smooth(seg(t, 27.6, 28.0)), ls: 2, w: 600, bg: 0.7 });
    }
  }

  // =========================================================================
  //  PANNEAU DE DONNÉES (x 1260 → 1840)
  // =========================================================================
  const PX = 1260, PY = 196, PW = 580, PH = 766;
  function drawPanel(ctx, G, cam, S, R) {
    const t = S.t;
    const a = fio(t, 0.6, 31, 0.6, 0.1);
    if (a <= 0.004) return;
    ctx.fillStyle = rgba('bg', 0.88 * a); ctx.fillRect(PX, PY, PW, PH);
    ctx.strokeStyle = rgba('grey', 0.45 * a); ctx.lineWidth = 1; ctx.strokeRect(PX + 0.5, PY + 0.5, PW - 1, PH - 1);
    ctx.strokeStyle = rgba('cyan', 0.9 * a); ctx.lineWidth = 2;
    for (const [x, y, dx, dy] of [[PX, PY, 1, 1], [PX + PW, PY, -1, 1], [PX, PY + PH, 1, -1], [PX + PW, PY + PH, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x + dx * 18, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * 18); ctx.stroke();
    }
    panelScene1(ctx, S, a);
    panelScene2(ctx, S, R, a);
    panelScene3(ctx, S, R, a);
    panelScene4(ctx, S, a);
  }

  function panelHeader(ctx, s, sub, a, id) {
    text(ctx, s, PX + 30, PY + 44, { size: 15, c: 'cyan', a, ls: 3, w: 700, id: id + 'h' });
    if (sub) text(ctx, sub, PX + PW - 30, PY + 44, { size: 13, c: 'grey', a, align: 'right', id: id + 's' });
    ctx.strokeStyle = rgba('grey', 0.4 * a); ctx.lineWidth = 1; line(ctx, [PX + 30, PY + 62], [PX + PW - 30, PY + 62]);
  }

  function panelScene1(ctx, S, pa) {
    const t = S.t, a = pa * fio(t, 0.6, 7.9, 0.6, 0.5);
    if (a <= 0.004) return;
    panelHeader(ctx, 'LOI DE DELMAS', 'A. Delmas, 1951', a, 'p1');
    text(ctx, 'R = N² + 1', PX + 30, PY + 132, { size: 50, c: 'white', a, w: 500 });
    text(ctx, 'R : résistance relative aux charges axiales', PX + 30, PY + 170, { size: 14, c: 'grey', a });
    text(ctx, 'N : nombre de courbures mobiles', PX + 30, PY + 192, { size: 14, c: 'grey', a });
    // compteur
    const N = (t >= 3.4 ? 1 : 0) + (t >= 4.8 ? 1 : 0) + (t >= 6.0 ? 1 : 0);
    const tN = [1.3, 3.4, 4.8, 6.0][N];
    const pulse = 1 - smooth(seg(t, tN, tN + 0.5));
    text(ctx, 'N = ' + N, PX + 30, PY + 252, { size: 34, c: 'cyan', a, w: 600, id: 'p1N' });
    const rw = text(ctx, 'R = ' + (N * N + 1), PX + 250, PY + 252, { size: 34, c: mix('white', 'cyan', pulse), a, w: 600, id: 'p1R' });
    if (pulse > 0.01) {
      ctx.strokeStyle = rgba('cyan', pulse * a * 0.8); ctx.lineWidth = 1.5;
      const g = 10 + 14 * (1 - pulse);
      ctx.strokeRect(PX + 250 - g, PY + 224 - g * 0.6, rw + 2 * g, 36 + 1.2 * g);
    }
    // histogramme
    const rows = [
      { lbl: 'TIGE RECTILIGNE', r: 1, t0: 1.2 },
      { lbl: '+ LORDOSE LOMBAIRE', r: 2, t0: 3.4 },
      { lbl: '+ CYPHOSE THORACIQUE', r: 5, t0: 4.8 },
      { lbl: '+ LORDOSE CERVICALE', r: 10, t0: 6.0 },
    ];
    const bx = PX + 30, bmax = 440;
    rows.forEach((rw, i) => {
      const ra = a * smooth(seg(t, rw.t0 - 0.1, rw.t0 + 0.25));
      if (ra <= 0.004) return;
      const y = PY + 310 + i * 76;
      const grow = E.out(seg(t, rw.t0, rw.t0 + 0.6));
      const hl = i === 3 ? fio(t, 6.2, 7.9, 0.3, 0.5) : 0;
      text(ctx, rw.lbl, bx, y, { size: 14, c: i === 0 ? 'grey' : 'white', a: ra, ls: 1 });
      text(ctx, 'N = ' + i, bx + bmax + 70, y, { size: 13, c: 'grey', a: ra, align: 'right', id: 'p1n' + i });
      const w = (bmax * rw.r * grow) / 10;
      ctx.fillStyle = rgba(i === 0 ? 'grey' : 'cyan', (0.35 + 0.35 * hl) * ra); ctx.fillRect(bx, y + 12, w, 22);
      ctx.fillStyle = rgba(i === 0 ? 'grey' : 'cyan', ra); ctx.fillRect(bx, y + 12, 3, 22);
      text(ctx, '×' + rw.r, bx + w + 12, y + 30, { size: 18, c: i === 0 ? 'grey' : 'white', a: ra * smooth(grow * 3), w: 600, id: 'p1x' + i });
    });
    const ra = a * fio(t, 6.3, 7.9, 0.3, 0.5);
    text(ctx, 'RÉSISTANCE ×10', PX + 30, PY + 650, { size: 30, c: 'cyan', a: ra, w: 700, ls: 1 });
    text(ctx, 'par rapport à une tige rectiligne', PX + 30, PY + 676, { size: 14, c: 'grey', a: ra });
    text(ctx, 'Courbure sacrée fixe : non comptée dans N', PX + 30, PY + 734, { size: 13, c: 'grey', a });
  }

  // ---- encart : coupe axiale du disque (réniforme : plus large que profond, bord postérieur concave)
  function kidney(g, s, cx, cy, ax, ay) {
    const gg = Math.atan2(Math.sin(g), Math.cos(g));
    const indent = 0.4 * Math.exp(-Math.pow(gg / 0.5, 2));
    return [cx + ax * s * Math.cos(g) * (1 - indent), cy + ay * s * Math.sin(g)];
  }
  function drawAxialInset(ctx, x0, y0, a, hoop, t) {
    const cx = x0 + 136, cy = y0 + 112, ax = 84, ay = 100;
    // lamelles concentriques de l'anneau fibreux (de l'extérieur vers le noyau)
    for (let k = 9; k >= 0; k--) {
      const s = lerp(0.66, 1, k / 9), pts = [];
      for (let j = 0; j < 90; j++) pts.push(kidney((j / 90) * Math.PI * 2, s, cx - 3 * (1 - k / 9), cy, ax, ay));
      polyPath(ctx, pts, true);
      if (k === 9) { ctx.fillStyle = rgba(mix('cyan', 'bg', 0.8), 0.92 * a); ctx.fill(); }
      ctx.strokeStyle = rgba(mix('cyan', 'orange', hoop * 0.8), (0.3 + 0.6 * (k / 9)) * a); ctx.lineWidth = k === 9 ? 2 : 1.1; ctx.stroke();
    }
    // noyau pulpeux (≈ 40 % de la section, légèrement postérieur)
    const nx = cx - 2, np = [];
    for (let j = 0; j < 60; j++) { const g = (j / 60) * Math.PI * 2; np.push([nx + 44 * Math.cos(g) * (1 + 0.03 * Math.sin(3 * g + 2 * t)), cy + 60 * Math.sin(g)]); }
    polyPath(ctx, np, true);
    ctx.fillStyle = rgba(mix([170, 240, 255], 'orange', hoop * 0.8), 0.42 * a); ctx.fill();
    ctx.strokeStyle = rgba(mix([190, 245, 255], 'orange', hoop * 0.8), 0.9 * a); ctx.lineWidth = 1.5; ctx.stroke();
    if (hoop > 0.01) {
      // tension circonférentielle (hoop stress) dans l'anneau
      for (let k = 0; k < 8; k++) {
        const g = (k / 8) * Math.PI * 2 + 0.55;
        arrow(ctx, kidney(g, 1.1, cx, cy, ax, ay), kidney(g + 0.36, 1.1, cx, cy, ax, ay), 'orange', a * hoop, { lw: 1.8, head: 8, noGlow: true });
      }
      // pression isotrope du noyau
      for (let k = 0; k < 8; k++) {
        const g = (k / 8) * Math.PI * 2 + 0.39, d = [Math.cos(g), Math.sin(g)], p = [nx + d[0] * 14, cy + d[1] * 20];
        arrow(ctx, p, vadd(p, vmul(d, 16 + 4 * Math.sin(t * 7))), 'orange', a * hoop, { lw: 1.6, head: 6, noGlow: true });
      }
    }
    text(ctx, 'ANT', cx - ax - 26, cy + 5, { size: 12, c: 'grey', a, align: 'right', id: 'axANT' });
    text(ctx, 'POST', cx + ax * 0.6 + 20, cy + 5, { size: 12, c: 'grey', a, id: 'axPOST' });
    text(ctx, 'COUPE AXIALE', cx, y0 + 248, { size: 13, c: 'white', a, align: 'center', ls: 2, w: 600 });
  }
  // ---- encart : trois lamelles déroulées, fibres de collagène alternées ±30°
  function drawLamellaStrip(ctx, x0, y0, a) {
    const w = 150, h = 34;
    for (let k = 0; k < 3; k++) {
      const x = x0 + k * 14, y = y0 + k * 40;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fillStyle = rgba(mix('cyan', 'bg', 0.82), 0.95 * a); ctx.fill();
      ctx.strokeStyle = rgba('cyan', 0.8 * a); ctx.lineWidth = 1.2; ctx.stroke(); ctx.clip();
      const sgn = k % 2 === 0 ? 1 : -1, tan = Math.tan(30 * DEG);
      ctx.strokeStyle = rgba(k % 2 ? 'white' : 'cyan', 0.75 * a); ctx.lineWidth = 1.2;
      for (let d = -h / tan; d < w + h / tan; d += 11) { ctx.beginPath(); ctx.moveTo(x + d, y + (sgn > 0 ? h : 0)); ctx.lineTo(x + d + h / tan, y + (sgn > 0 ? 0 : h)); ctx.stroke(); }
      ctx.restore();
    }
    text(ctx, '+30°', x0 + w + 12, y0 + 22, { size: 14, c: 'cyan', a, id: 'lam+30' });
    text(ctx, '−30°', x0 + w + 26, y0 + 62, { size: 14, c: 'white', a, id: 'lam-30' });
    text(ctx, '+30°', x0 + w + 40, y0 + 102, { size: 14, c: 'cyan', a, id: 'lam+30b' });
    text(ctx, 'LAMELLES DÉROULÉES', x0, y0 + 148, { size: 13, c: 'white', a, ls: 2, w: 600 });
    text(ctx, 'angle / plateau', x0, y0 + 168, { size: 12, c: 'grey', a });
  }

  function panelScene2(ctx, S, R, pa) {
    const t = S.t;
    // 2a : composants
    const a1 = pa * fio(t, 8.3, 11.4, 0.5, 0.35);
    if (a1 > 0.004) {
      panelHeader(ctx, 'SEGMENT MOBILE', 'unité fonctionnelle', a1, 'p2a');
      text(ctx, 'Deux vertèbres et les tissus qui les unissent :', PX + 30, PY + 96, { size: 14, c: 'grey', a: a1 });
      COMPONENTS.forEach((c, k) => {
        const tk = 9.15 + k * 0.3, a = a1 * smooth(seg(t, tk, tk + 0.3));
        const y = PY + 140 + k * 46;
        ring(ctx, [PX + 46, y - 6], 13, 'cyan', a, 1.6);
        text(ctx, String(k + 1), PX + 46, y - 0.5, { size: 15, c: 'white', a, align: 'center', w: 700, id: 'p2n' + k });
        text(ctx, c, PX + 74, y, { size: 16, c: 'white', a, ls: 0.5, w: 500 });
      });
      const sa = a1 * smooth(seg(t, 10.4, 10.8));
      ctx.strokeStyle = rgba('grey', 0.4 * sa); line(ctx, [PX + 30, PY + 470], [PX + PW - 30, PY + 470]);
      text(ctx, '= 2 VERTÈBRES ADJACENTES + PARTIES MOLLES', PX + 30, PY + 506, { size: 15, c: 'cyan', a: sa, w: 600 });
      text(ctx, 'PILIER ANTÉRIEUR', PX + 30, PY + 560, { size: 14, c: 'white', a: sa, ls: 1.5, w: 600 });
      text(ctx, 'corps + disque : supporte la charge', PX + 30, PY + 584, { size: 14, c: 'grey', a: sa });
      text(ctx, 'PILIER POSTÉRIEUR', PX + 30, PY + 626, { size: 14, c: 'white', a: sa, ls: 1.5, w: 600 });
      text(ctx, 'arcs + facettes : guide le mouvement', PX + 30, PY + 650, { size: 14, c: 'grey', a: sa });
      text(ctx, 'Junghanns : « Bewegungssegment »', PX + 30, PY + 728, { size: 13, c: 'grey', a: sa });
    }
    // 2b : disque intervertébral
    const a2 = pa * fio(t, 11.4, 17.5, 0.4, 0.4);
    if (a2 > 0.004) {
      panelHeader(ctx, 'DISQUE INTERVERTÉBRAL', 'L4–L5', a2, 'p2b');
      drawAxialInset(ctx, PX + 22, PY + 82, a2 * smooth(seg(t, 11.45, 11.95)), R.hoop, t);
      drawLamellaStrip(ctx, PX + 322, PY + 110, a2 * smooth(seg(t, 11.7, 12.2)));
      const b1 = a2 * fio(t, 11.7, 14.15, 0.4, 0.35);
      if (b1 > 0.004) {
        const y = PY + 390;
        text(ctx, 'ANNEAU FIBREUX', PX + 30, y, { size: 19, c: 'cyan', a: b1, w: 700, ls: 1 });
        text(ctx, '15–25 lamelles concentriques de collagène', PX + 30, y + 30, { size: 15, c: 'white', a: b1 });
        text(ctx, 'fibres croisées à ±30° d’une lamelle à l’autre', PX + 30, y + 54, { size: 15, c: 'white', a: b1 });
        text(ctx, 'NOYAU PULPEUX', PX + 30, y + 112, { size: 19, c: [190, 245, 255], a: b1 * smooth(seg(t, 11.9, 12.3)), w: 700, ls: 1 });
        text(ctx, 'gel de protéoglycanes · 70–90 % d’eau', PX + 30, y + 142, { size: 15, c: 'white', a: b1 * smooth(seg(t, 11.9, 12.3)) });
        text(ctx, '≈ 40 % de la section discale', PX + 30, y + 166, { size: 15, c: 'white', a: b1 * smooth(seg(t, 11.9, 12.3)) });
        text(ctx, 'Sagittal : échelle réelle', PX + 30, y + 236, { size: 13, c: 'grey', a: b1 });
      }
      const b2 = a2 * fio(t, 14.05, 17.3, 0.4, 0.4);
      if (b2 > 0.004) {
        const y = PY + 390;
        text(ctx, 'PRINCIPE HYDROSTATIQUE', PX + 30, y, { size: 19, c: 'orange', a: b2, w: 700, ls: 1 });
        text(ctx, 'P', PX + 30, y + 62, { size: 22, c: 'grey', a: b2, id: 'p2P' });
        text(ctx, fmt(P_of(0), 2) + ' MPa', PX + 64, y + 62, { size: 40, c: 'white', a: b2, w: 600 });
        text(ctx, 'L4–L5, debout · Wilke et al., Spine 1999', PX + 30, y + 92, { size: 13, c: 'grey', a: b2 });
        const chain = ['CHARGE AXIALE', 'PRESSION ISOTROPE DU NOYAU', 'TENSION DES FIBRES DE L’ANNEAU'];
        chain.forEach((c, k) => {
          const ca = b2 * smooth(seg(t, 14.4 + k * 0.45, 14.8 + k * 0.45));
          const yy = y + 140 + k * 54;
          ctx.strokeStyle = rgba('orange', 0.7 * ca); ctx.lineWidth = 1.2; ctx.strokeRect(PX + 30.5, yy - 24.5, PW - 60, 34);
          text(ctx, c, PX + 46, yy - 1, { size: 15, c: 'white', a: ca, w: 600, ls: 0.5 });
          if (k < 2) arrow(ctx, [PX + PW / 2, yy + 11], [PX + PW / 2, yy + 28], 'orange', ca, { lw: 2, head: 8, noGlow: true });
        });
      }
    }
  }

  // ---- oscilloscope θ(t) / P(t)
  function drawScope(ctx, x0, y0, w, h, t, a) {
    const tx = (tt) => x0 + ((tt - 18) / 8) * w;
    const ty = (th) => y0 + h - ((th + 6) / 18) * h;
    const tp = (p) => y0 + h - (p / 1.2) * h;
    ctx.strokeStyle = rgba('grey', 0.5 * a); ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
    ctx.strokeStyle = rgba('grey', 0.22 * a);
    for (const th of [-5, 5, 10]) line(ctx, [x0, ty(th)], [x0 + w, ty(th)]);
    ctx.strokeStyle = rgba('grey', 0.5 * a); line(ctx, [x0, ty(0)], [x0 + w, ty(0)]);
    for (let s = 19; s < 26; s++) { ctx.strokeStyle = rgba('grey', 0.18 * a); line(ctx, [tx(s), y0], [tx(s), y0 + h]); }
    text(ctx, '+10°', x0 - 8, ty(10) + 4, { size: 11, c: 'cyan', a, align: 'right', id: 'sc10' });
    text(ctx, '0°', x0 - 8, ty(0) + 4, { size: 11, c: 'cyan', a, align: 'right', id: 'sc0' });
    text(ctx, MINUS + '5°', x0 - 8, ty(-5) + 4, { size: 11, c: 'cyan', a, align: 'right', id: 'sc-5' });
    text(ctx, '1.2', x0 + w + 8, tp(1.2) + 10, { size: 11, c: 'orange', a, id: 'scP12' });
    text(ctx, '0.5', x0 + w + 8, tp(0.5) + 4, { size: 11, c: 'orange', a, id: 'scP05' });
    text(ctx, '18 s', x0, y0 + h + 18, { size: 11, c: 'grey', a, id: 'sc18' });
    text(ctx, '26 s', x0 + w, y0 + h + 18, { size: 11, c: 'grey', a, align: 'right', id: 'sc26' });
    text(ctx, 'θ (°)', x0 + 8, y0 - 10, { size: 13, c: 'cyan', a, w: 600, id: 'scTh' });
    text(ctx, 'P (MPa)', x0 + w - 8, y0 - 10, { size: 13, c: 'orange', a, align: 'right', w: 600, id: 'scP' });
    const tEnd = Math.min(t, 26);
    if (tEnd > 18) {
      for (const [f, col] of [[(tt) => ty(thetaAt(tt)), 'cyan'], [(tt) => tp(P_of(thetaAt(tt))), 'orange']]) {
        ctx.beginPath();
        for (let tt = 18; tt <= tEnd + 1e-9; tt += 1 / 30) { const X = tx(tt), Y = f(tt); if (tt === 18) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
        ctx.lineTo(tx(tEnd), f(tEnd));
        ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 2; ctx.stroke();
        dot(ctx, [tx(tEnd), f(tEnd)], 4, col, a);
      }
      ctx.strokeStyle = rgba('white', 0.25 * a); line(ctx, [tx(tEnd), y0], [tx(tEnd), y0 + h]);
    }
  }
  function drawTrunk(ctx, cx, cy, ang, a) {
    const hip = [cx, cy];
    ctx.lineCap = 'round'; ctx.strokeStyle = rgba('cyan', a); ctx.lineWidth = 3;
    line(ctx, hip, [cx - 5, cy + 52]); line(ctx, hip, [cx + 5, cy + 52]);
    const u = vrot([0, -1], -ang * DEG);
    const sh = vadd(hip, vmul(u, 56));
    // tronc légèrement courbé (lordose / cyphose)
    const mid = vadd(vlerp(hip, sh, 0.5), vmul(perp(u), 6));
    ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.quadraticCurveTo(mid[0], mid[1], sh[0], sh[1]); ctx.stroke();
    ring(ctx, vadd(sh, vmul(u, 14)), 9, 'cyan', a, 3);
    const arm = vadd(sh, vrot(vmul(u, 38), Math.PI * 0.85));
    line(ctx, sh, arm);
    ctx.strokeStyle = rgba('grey', 0.6 * a); ctx.lineWidth = 1; line(ctx, [cx - 40, cy + 52], [cx + 40, cy + 52]);
    // zone lombaire (segment L4–L5)
    dot(ctx, vadd(hip, vmul(u, 12)), 4.5, 'orange', a);
  }

  function panelScene3(ctx, S, R, pa) {
    const t = S.t, a = pa * fio(t, 17.5, 26.4, 0.4, 0.5);
    if (a <= 0.004) return;
    const th = S.theta, M = R.mech;
    const mode = th > 0.5 ? 'FLEXION' : th < -0.5 ? 'EXTENSION' : 'NEUTRE';
    panelHeader(ctx, 'SEGMENT L4–L5 · CHARGEMENT', '', a, 'p3');
    const mc = th > 0.5 ? 'red' : th < -0.5 ? 'orange' : 'cyan';
    const mw = measure(ctx, mode, 14, MONO, 700, 2);
    ctx.strokeStyle = rgba(mc, a); ctx.lineWidth = 1.5; ctx.strokeRect(PX + PW - 30 - mw - 18.5, PY + 24.5, mw + 18, 28);
    text(ctx, mode, PX + PW - 39, PY + 44, { size: 14, c: mc, a, align: 'right', w: 700, ls: 2, id: 'p3mode' });
    const rows = [
      ['θ', 'ANGLE SEGMENTAIRE', fmtS(th, 1), '°', 'cyan', ''],
      ['Fc', 'COMPRESSION', Math.round(M.Fc).toString(), 'N', 'red', ''],
      ['Fs', 'CISAILLEMENT', Math.round(Math.abs(M.Fs)).toString(), 'N', 'orange', M.Fs > 0.5 ? '← ANT' : M.Fs < -0.5 ? '→ POST' : ''],
      ['P', 'PRESSION DISCALE', M.P.toFixed(2), 'MPa', 'orange', ''],
      ['Δx', 'NOYAU PULPEUX', fmt(Math.abs(M.dx), 1), 'mm', 'cyan', M.dx > 0.05 ? '→ POST' : M.dx < -0.05 ? '← ANT' : ''],
      ['Ff', 'FACETTES', Math.round(M.share * 100).toString(), '%', 'white', Math.round(M.Ff) + ' N'],
    ];
    rows.forEach((r, i) => {
      const y = PY + 104 + i * 42;
      text(ctx, r[0], PX + 30, y, { size: 18, c: r[4], a, w: 700, id: 'p3k' + i });
      text(ctx, r[1], PX + 80, y, { size: 13, c: 'grey', a, ls: 1, id: 'p3l' + i });
      text(ctx, r[2], PX + 390, y, { size: 26, c: 'white', a, align: 'right', w: 600, id: 'p3v' + i });
      text(ctx, r[3], PX + 398, y, { size: 15, c: 'grey', a, id: 'p3u' + i });
      if (r[5]) text(ctx, r[5], PX + PW - 30, y, { size: 14, c: r[4], a, align: 'right', w: 600, id: 'p3d' + i });
      ctx.strokeStyle = rgba('grey', 0.15 * a); ctx.lineWidth = 1; line(ctx, [PX + 30, y + 14], [PX + PW - 30, y + 14]);
    });
    // échelle des forces
    const ly = PY + 370;
    text(ctx, 'ÉCHELLE', PX + 30, ly, { size: 12, c: 'grey', a, ls: 1.5, id: 'p3sc' });
    ctx.strokeStyle = rgba('white', a); ctx.lineWidth = 2; line(ctx, [PX + 110, ly - 5], [PX + 110 + 500 * F_SCALE, ly - 5]);
    line(ctx, [PX + 110, ly - 10], [PX + 110, ly]); line(ctx, [PX + 110 + 500 * F_SCALE, ly - 10], [PX + 110 + 500 * F_SCALE, ly]);
    text(ctx, '500 N', PX + 120 + 500 * F_SCALE, ly, { size: 12, c: 'white', a, id: 'p3scv' });
    text(ctx, 'R vertical = Fc + Fs', PX + PW - 30, ly, { size: 12, c: 'grey', a, align: 'right', id: 'p3dec' });
    drawScope(ctx, PX + 64, PY + 420, PW - 128, 138, t, a);
    // pictogramme (tronc ≈ 4·θ, bassin ≈ 0,8·θ) et note de modèle
    drawTrunk(ctx, PX + 92, PY + 680, th * 4, a);
    text(ctx, 'TRONC', PX + 92, PY + 754, { size: 11, c: 'grey', a, align: 'center', ls: 2, id: 'p3tr' });
    const nx = PX + 190;
    text(ctx, 'MODÈLE STATIQUE SIMPLIFIÉ', nx, PY + 626, { size: 12, c: 'white', a, ls: 1.5, w: 600 });
    text(ctx, 'Fc = P·A / 1,5   (Nachemson, A = 18 cm²)', nx, PY + 648, { size: 12, c: 'grey', a });
    text(ctx, 'Fs = Fc·tan β   β = ' + fmtS(R.D.beta, 1) + '° (plan discal)', nx, PY + 668, { size: 12, c: 'grey', a, id: 'p3beta' });
    text(ctx, 'P(θ) : Wilke et al. 1999 · CIR fixe', nx, PY + 688, { size: 12, c: 'grey', a });
    text(ctx, 'bascule pelvienne γ = 0,8·θ', nx, PY + 708, { size: 12, c: 'grey', a });
    text(ctx, 'Valeurs indicatives (ordres de grandeur)', nx, PY + 728, { size: 12, c: 'grey', a });
  }

  function panelScene4(ctx, S, pa) {
    const t = S.t, a = pa * fio(t, 26.7, 31, 0.5, 0.1);
    if (a <= 0.004) return;
    panelHeader(ctx, 'STABILITÉ RACHIDIENNE', 'Panjabi, 1992', a, 'p4');
    // boucle de stabilité : passif → contrôle neural → actif → passif (sens horaire)
    const cx = PX + PW / 2, cy = PY + 232, rx = 168, ry = 118;
    const E2 = (g) => [cx + rx * Math.cos(g), cy + ry * Math.sin(g)];
    const nodes = [
      { g: -90, t1: 'PASSIF', t2: 'os · disques · ligaments', col: 'white' },
      { g: 30, t1: 'CONTRÔLE', t2: 'neural', col: 'orange' },
      { g: 150, t1: 'ACTIF', t2: 'muscles', col: 'cyan' },
    ];
    const arcs = [{ lbl: 'afférences', g: -30 }, { lbl: 'commande', g: 90 }, { lbl: 'forces', g: 210 }];
    const la = a * smooth(seg(t, 27.0, 27.5));
    for (let k = 0; k < 3; k++) {
      const g0 = (nodes[k].g + (k === 0 ? 50 : 40)) * DEG;
      const g1 = (nodes[(k + 1) % 3].g + 360 * (k === 2 ? 1 : 0) - ((k + 1) % 3 === 0 ? 50 : 40)) * DEG;
      const pr = E.io(seg(t, 27.1 + k * 0.15, 27.6 + k * 0.15));
      const ge = g0 + (g1 - g0) * pr;
      ctx.strokeStyle = rgba('grey', 0.85 * la); ctx.lineWidth = 2;
      ctx.beginPath(); for (let j = 0; j <= 30; j++) { const p = E2(g0 + ((ge - g0) * j) / 30); if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); } ctx.stroke();
      if (pr > 0.9) arrow(ctx, E2(ge - 0.08), E2(ge), 'grey', la, { lw: 2, head: 11, noGlow: true });
      const lp = [cx + rx * 0.62 * Math.cos(arcs[k].g * DEG), cy + ry * 0.62 * Math.sin(arcs[k].g * DEG) + 4];
      text(ctx, arcs[k].lbl, lp[0], lp[1], { size: 12, c: 'grey', a: la * smooth(pr * 2 - 1), align: 'center', id: 'arc' + k });
    }
    // particule : l'information circule dans la boucle
    const pa2 = la * smooth(seg(t, 27.7, 28.0));
    if (pa2 > 0.004) {
      const g = -Math.PI / 2 + (t - 27.7) * Math.PI * 2 * 0.5;
      for (let k = 0; k < 7; k++) dot(ctx, E2(g - k * 0.06), 4.5 - k * 0.55, 'cyan', pa2 * (1 - k / 7));
    }
    nodes.forEach((n, k) => {
      const na = a * smooth(seg(t, 26.9 + k * 0.12, 27.3 + k * 0.12));
      const p = E2(n.g * DEG);
      const bw = k === 0 ? 236 : 168, bh = 56;
      ctx.fillStyle = rgba('bg', 0.96 * na); ctx.fillRect(p[0] - bw / 2, p[1] - bh / 2, bw, bh);
      ctx.strokeStyle = rgba(n.col, na); ctx.lineWidth = 1.5; ctx.strokeRect(p[0] - bw / 2 + 0.5, p[1] - bh / 2 + 0.5, bw, bh);
      text(ctx, n.t1, p[0], p[1] - 3, { size: 16, c: n.col, a: na, align: 'center', w: 700, ls: 2 });
      text(ctx, n.t2, p[0], p[1] + 18, { size: 12, c: 'grey', a: na, align: 'center' });
    });
    const fa = a * smooth(seg(t, 27.7, 28.1));
    const y = PY + 456;
    text(ctx, 'FACETTES ARTICULAIRES', PX + 30, y, { size: 17, c: 'cyan', a: fa, w: 700, ls: 1 });
    text(ctx, 'guident le mouvement segmentaire', PX + 30, y + 28, { size: 14, c: 'white', a: fa });
    text(ctx, 'limitent cisaillement antérieur et rotation', PX + 30, y + 50, { size: 14, c: 'white', a: fa });
    text(ctx, 'jusqu’à ~20 % de la charge en extension', PX + 30, y + 72, { size: 14, c: 'white', a: fa });
    const sa = a * smooth(seg(t, 28.5, 28.9));
    ctx.strokeStyle = rgba('cyan', 0.6 * sa); ctx.lineWidth = 1; line(ctx, [PX + 30, y + 112], [PX + PW - 30, y + 112]);
    text(ctx, 'COURBURES + SEGMENT MOBILE + FACETTES', PX + 30, y + 150, { size: 17, c: 'cyan', a: sa, w: 700 });
    text(ctx, '= un système amortissant, mobile et stable.', PX + 30, y + 180, { size: 17, c: 'white', a: sa, w: 500 });
    text(ctx, 'Alignement sagittal neutre = coût énergétique minimal', PX + 30, y + 222, { size: 13, c: 'grey', a: sa });
  }

  // =========================================================================
  //  HUD
  // =========================================================================
  const SCENES = [
    { a: 0, b: 8, n: '01', title: 'COURBURES PHYSIOLOGIQUES', sub: 'Lordoses · cyphose · loi de Delmas', ch: 'COURBURES' },
    { a: 8, b: 18, n: '02', title: 'SEGMENT MOBILE RACHIDIEN', sub: 'Unité fonctionnelle de Junghanns · L4–L5', ch: 'SEGMENT MOBILE' },
    { a: 18, b: 26, n: '03', title: 'CONTRAINTES DYNAMIQUES', sub: 'Flexion / extension · compression · cisaillement', ch: 'CONTRAINTES' },
    { a: 26, b: 30, n: '04', title: 'SYNTHÈSE · STABILITÉ', sub: 'Facettes articulaires · alignement sagittal', ch: 'SYNTHÈSE' },
  ];
  function drawVignette(ctx) {
    const g = ctx.createRadialGradient(W * 0.42, H * 0.5, 380, W * 0.5, H * 0.5, 1250);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const top = ctx.createLinearGradient(0, 0, 0, 185);
    top.addColorStop(0, rgba('bg', 0.94)); top.addColorStop(0.62, rgba('bg', 0.75)); top.addColorStop(1, rgba('bg', 0));
    ctx.fillStyle = top; ctx.fillRect(0, 0, W, 185);
    const bot = ctx.createLinearGradient(0, H - 120, 0, H);
    bot.addColorStop(0, rgba('bg', 0)); bot.addColorStop(0.6, rgba('bg', 0.85)); bot.addColorStop(1, rgba('bg', 0.95));
    ctx.fillStyle = bot; ctx.fillRect(0, H - 120, W, 120);
  }
  function niceScale(sc) {
    for (const mm of [1, 2, 5, 10, 20, 50, 100, 200]) if (mm * sc >= 70) return mm;
    return 200;
  }
  function drawHUD(ctx, cam, S) {
    const t = S.t;
    // titres de scène
    SCENES.forEach((sc, i) => {
      const a = fio(t, sc.a, sc.b, i === 0 ? 0.01 : 0.35, i === 3 ? 0.01 : 0.35);
      if (a <= 0.004) return;
      const slide = 12 * (1 - E.out(seg(t, sc.a, sc.a + 0.5)));
      text(ctx, sc.n + ' / 04', 80, 74, { size: 15, c: 'cyan', a, ls: 3, w: 700, id: 'hudn' });
      ctx.strokeStyle = rgba('cyan', 0.8 * a); ctx.lineWidth = 2; line(ctx, [176, 69], [176 + 60 * a, 69]);
      text(ctx, sc.title, 80 + slide, 116, { size: 34, c: 'white', a, ls: 2, w: 600, font: SANS, id: 'hudt' });
      text(ctx, sc.sub, 80 + slide * 0.5, 146, { size: 16, c: 'grey', a, ls: 0.5, id: 'huds' });
    });
    text(ctx, 'VUE SAGITTALE · PROFIL GAUCHE', 1840, 74, { size: 13, c: 'grey', a: 1, align: 'right', ls: 2 });
    const f = Math.round(t * FPS);
    text(ctx, 'T+' + t.toFixed(2).padStart(5, '0') + ' s  ·  F' + String(f).padStart(4, '0'), 1840, 104, { size: 18, c: 'white', a: 0.9, align: 'right', ls: 1, id: 'tc' });
    // orientation
    const ox = 150, oy = 905;
    ctx.strokeStyle = rgba('grey', 0.9); ctx.lineWidth = 1.2;
    arrow(ctx, [ox, oy], [ox - 48, oy], 'grey', 0.9, { lw: 1.2, head: 7, noGlow: true });
    arrow(ctx, [ox, oy], [ox + 48, oy], 'grey', 0.9, { lw: 1.2, head: 7, noGlow: true });
    arrow(ctx, [ox, oy], [ox, oy - 32], 'grey', 0.9, { lw: 1.2, head: 7, noGlow: true });
    text(ctx, 'ANT', ox - 56, oy + 5, { size: 12, c: 'grey', align: 'right', ls: 1 });
    text(ctx, 'POST', ox + 56, oy + 5, { size: 12, c: 'grey', ls: 1 });
    text(ctx, 'CRÂNIAL', ox, oy - 40, { size: 12, c: 'grey', align: 'center', ls: 1 });
    // échelle graphique
    const mm = niceScale(cam.sc), L = mm * cam.sc;
    const sy = 962;
    ctx.strokeStyle = rgba('white', 0.9); ctx.lineWidth = 2;
    line(ctx, [80, sy], [80 + L, sy]); line(ctx, [80, sy - 6], [80, sy + 6]); line(ctx, [80 + L, sy - 6], [80 + L, sy + 6]);
    ctx.lineWidth = 1; line(ctx, [80 + L / 2, sy - 3], [80 + L / 2, sy + 3]);
    text(ctx, mm + ' mm', 80 + L + 12, sy + 5, { size: 13, c: 'white', id: 'scale' });
    // frise chronologique
    const ty = 1034, x0 = 80, x1 = 1840, tw = x1 - x0;
    ctx.strokeStyle = rgba('grey', 0.5); ctx.lineWidth = 2; line(ctx, [x0, ty], [x1, ty]);
    ctx.strokeStyle = rgba('cyan', 1); line(ctx, [x0, ty], [x0 + (tw * t) / 30, ty]);
    SCENES.forEach((sc, i) => {
      const xs = x0 + (tw * sc.a) / 30, cur = t >= sc.a && t < sc.b;
      ctx.strokeStyle = rgba(cur ? 'cyan' : 'grey', 0.9); ctx.lineWidth = 1.5; line(ctx, [xs, ty - 8], [xs, ty + 8]);
      text(ctx, sc.n + '  ' + sc.ch, xs + 10, ty - 10, { size: 12, c: cur ? 'cyan' : 'grey', ls: 1.5, w: cur ? 700 : 400, id: 'ch' + i });
    });
    dot(ctx, [x0 + (tw * t) / 30, ty], 5, 'cyan', 1);
  }

  // =========================================================================
  //  API
  // =========================================================================
  function renderFrame(frame) {
    if (!CTX) throw new Error('animation non initialisée');
    const f = Math.max(0, Math.min(TOTAL - 1, Math.round(frame)));
    return renderAt(CTX, f / FPS);
  }
  function init(canvas) {
    canvas.width = W; canvas.height = H;
    CTX = canvas.getContext('2d', { alpha: false });
    CTX.imageSmoothingQuality = 'high';
    return CTX;
  }
  // contrôle qualité : chevauchements d'étiquettes et sorties de cadre
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

  const API = {
    W, H, FPS, TOTAL, init, renderFrame,
    renderAt: (t) => renderAt(CTX, t),
    qaReport,
    _internals: { LV, IX, spineCurve, geometry, CURVE_FINAL, G_FINAL, D_FINAL, CIR, curveAngle, frameAt, mechanics, thetaAt, P_of },
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.SpineAnim = API;
})(typeof window !== 'undefined' ? window : globalThis);
