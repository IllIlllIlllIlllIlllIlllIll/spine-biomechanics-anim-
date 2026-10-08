/* =============================================================================
 *  partie2/scene1.js — SCÈNE 1 : STABILISATEURS LOCAUX PROFONDS (0 → 10 s)
 *
 *  0,0–5,5  vue sagittale (caméras lumbo → multi) : repères de niveaux,
 *           processus mamillaires / bord inférieur des épineuses, MULTIFIDE
 *           (5 bandes segmentaires), activation, mécanique au disque L4/L5
 *           (ligne d'action résultante, bras de levier, décomposition selon
 *           le plan discal), plan de coupe L3.
 *  5,0–8,5  VUE AXIALE L3 (P2.views.axial) : transverse de l'abdomen, fascia
 *           thoraco-lombaire (3 feuillets), raphé latéral, effet corset, PIA.
 *  8,0–10,0 vue sagittale (caméra iap) : transverse en projection latérale,
 *           « ballon » de pression intra-abdominale, décharge axiale.
 *  Panneau 0,6 → 9,9 s (blocs séquentiels, jamais superposés).
 *
 *  Toutes les fonctions sont PURES de F.t : aucune donnée n'est conservée d'une
 *  frame à l'autre (seuls des gabarits constants sont précalculés au chargement).
 * ========================================================================== */
(function (root) {
  'use strict';
  const SC = root.SpineCore, P2 = root.P2, MU = P2.muscles;
  const {
    fio, text, seg, smooth, E, clamp, lerp, vadd, vsub, vmul, vlen, vnorm, vlerp, vdot, perp, rgba, mix,
    arrow, dot, line, polyPath, smoothPath, partial, polyLen, fmt, toW, IX, NL, DEG, S1D, mulberry32,
  } = SC;

  // ===========================================================================
  //  OUTILS
  // ===========================================================================
  const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
  const KPA_MMHG = 7.50062; // 1 kPa = 7,50062 mmHg
  const fr = (v, d) => fmt(v, d).replace('.', ','); // décimale française
  /** Spline de Catmull-Rom fermée. */
  function closedCR(pts, n) {
    const out = [], N = pts.length;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    return out;
  }
  const openCR = (pts, n) => MU.catmull(pts, n);
  /** Point dans un polygone (règle pair-impair). */
  function pip(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  /** Semis de points déterministe dans un polygone (texture de fibres coupées). */
  function stipple(poly, step, seed) {
    const rnd = mulberry32(seed), out = [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    let row = 0;
    for (let y = y0 + step * 0.5; y < y1; y += step * 0.87, row++) {
      for (let x = x0 + (row % 2 ? step * 0.5 : 0); x < x1; x += step) {
        const p = [x + (rnd() - 0.5) * step * 0.5, y + (rnd() - 0.5) * step * 0.5];
        if (pip(p, poly)) out.push(p);
      }
    }
    return out;
  }
  const mir = (pts) => pts.map((p) => [-p[0], p[1]]);
  /** Contour symétrique : demi-contour droit (x ≥ 0) de la ligne médiane antérieure à la postérieure. */
  const sym = (half) => [...half, ...mir(half.slice(1, -1)).reverse()];
  /** Décalage latéral d'une polyligne écran à largeur variable. */
  function offsetVar(pts, ws, k) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      out.push(vadd(pts[i], vmul(vnorm(perp(vsub(b, a))), ws[i] * k)));
    }
    return out;
  }
  /** Étiquette à ligne de rappel coudée (variante de SC.leaderTag avec ids explicites). */
  function tag(ctx, anchor, at, lines, o) {
    const a = o.a; if (a <= 0.004) return;
    const col = o.c || 'white', size = o.size || 15, align = o.align || 'left';
    const side = align === 'left' ? -1 : 1, ly = at[1] - size * 0.35;
    const elbow = [at[0] + side * 18, ly];
    ctx.strokeStyle = rgba(o.lc || 'grey', a * 0.9); ctx.lineWidth = 1.2;
    for (const an of [anchor, ...(o.more || [])]) {
      ctx.beginPath(); ctx.moveTo(an[0], an[1]); ctx.lineTo(elbow[0], elbow[1]); ctx.lineTo(at[0] + side * 6, ly); ctx.stroke();
      dot(ctx, an, 3, o.lc || col, a);
    }
    lines.forEach((ln, i) => {
      const L = typeof ln === 'string' ? { s: ln } : ln;
      text(ctx, L.s, at[0], at[1] + i * (size + 5), { size: L.size || size, c: L.c || col, a, align, ls: L.ls == null ? 1 : L.ls, w: L.w || 600, bg: 0.75, id: o.id + ':' + i });
    });
  }

  const COBALT_L = mix('cobalt', 'white', 0.3);   // cobalt éclairci (textes)
  const TEAL_L = mix('teal', 'white', 0.2);

  // ===========================================================================
  //  MULTIFIDE : 5 bandes segmentaires (épineuse + lame de L1…L5)
  //  Faisceau = [origine, terminaison] ; origine 'lam' = lame / base de l'épineuse,
  //  sinon u le long du bord inférieur de l'épineuse (0 racine → 1 pointe).
  //  Terminaison : processus mamillaire ('L3'…), face dorsale du sacrum (s, mm), EIPS.
  // ===========================================================================
  const MF_LAM = [50, 9.5]; // point du gabarit lombaire : jonction lame / base de l'épineuse
  const BANDS = [
    { n: 'L1', fas: [['lam', 'L3'], [0.4, 'L4'], [0.8, 'L5']] },
    { n: 'L2', fas: [['lam', 'L4'], [0.4, 'L5'], [0.8, -10]] },
    { n: 'L3', fas: [['lam', 'L5'], [0.4, -25], [0.8, -40]] },
    { n: 'L4', fas: [['lam', -10], [0.35, -30], [0.65, -50], [0.92, 'PSIS']] },
    { n: 'L5', fas: [['lam', -25], [0.35, -45], [0.65, -62], [0.92, 'PSIS']] },
  ];
  const BAND_COL = [mix('cobalt', 'cyan', 0.28), [45, 114, 217], mix('cobalt', 'cyan', 0.28), [45, 114, 217], mix('cobalt', 'cyan', 0.28)];
  const MF = (() => {
    const out = [];
    let gi = 0;
    BANDS.forEach((b, bi) => {
      b.fas.forEach(([o, ins], fi) => {
        const org = o === 'lam' ? (A) => A.vt(b.n, MF_LAM) : (A) => A.spinInf(b.n, o);
        const end = typeof ins === 'number' ? (A) => A.sac(ins) : ins === 'PSIS' ? (A) => A.pel('PSIS') : (A) => A.mam(ins);
        const insIdx = typeof ins === 'number' || ins === 'PSIS' ? NL : IX[ins];
        // léger galbe dorsal du faisceau (le chemin reste une corde pour la mécanique : loa [0, 2])
        const mid = (A) => {
          const p = org(A), q = end(A), d = vsub(q, p);
          let nn = vnorm(perp(d)); if (nn[0] < 0) nn = vmul(nn, -1);
          return vadd(vlerp(p, q, 0.5), vmul(nn, 0.04 * vlen(d)));
        };
        const w = o === 'lam' ? 3.6 : 4.8;
        out.push({
          bi, fi, gi: gi++, nb: b.fas.length, lam: o === 'lam',
          cross: IX[b.n] <= IX.L4 && insIdx >= IX.L5, // le faisceau enjambe le disque L4/L5
          spec: { group: 'deep', color: BAND_COL[bi], tendon: 0.09, fascicles: [{ path: [org, mid, end], w, fibers: o === 'lam' ? 4 : 5, loa: [0, 2], n: 12 }] },
        });
      });
    });
    return out;
  })();

  /**
   * Mécanique du multifide au disque L4/L5, CALCULÉE sur la géométrie :
   * résultante des faisceaux qui enjambent L4/L5 (poids = largeur, proxy de la
   * section), force sur le corps sus-jacent dirigée de l'origine vers la terminaison.
   */
  function mfMech(A) {
    const c = A.disc('L4'), D = SC.discFrame(A.G);
    let F = [0, 0], M = 0, cen = [0, 0], ws = 0, n = 0;
    for (const f of MF) {
      if (!f.cross) continue;
      const fas = f.spec.fascicles[0], P = MU.resolve(A, fas), o = P[0], e = P[P.length - 1];
      const u = vnorm(vsub(e, o)), w = fas.w;
      F = vadd(F, vmul(u, w)); M += w * MU.momentArm(c, o, u);
      cen = vadd(cen, vmul(vlerp(o, e, 0.5), w)); ws += w; n++;
    }
    const Fm = vlen(F), U = vmul(F, 1 / Fm), d = M / Fm;          // bras de levier signé (mm)
    const p0 = vadd(c, vmul([U[1], -U[0]], d));                   // point de la ligne d'action
    cen = vmul(cen, 1 / ws);
    const p = vadd(p0, vmul(U, vdot(vsub(cen, p0), U)));          // ramené au milieu des faisceaux
    const comp = -vdot(U, D.n), shear = vdot(U, D.t);             // D.n : normale vers L4 ; D.t : vers l'avant
    // intersection de la ligne d'action avec le plan discal moyen
    const s = -vdot(vsub(p, c), D.n) / vdot(U, D.n), q = vadd(p, vmul(U, s));
    return { c, D, U, d, p, q, comp, shear, n, ang: Math.atan2(Math.abs(shear), comp) / DEG, arm: MU.momentArm(c, p, U) };
  }

  // ===========================================================================
  //  VUE AXIALE L3 — repère propre (mm) : origine = centre du corps de L3,
  //  x vers la GAUCHE du patient (droite de l'écran, convention radiologique,
  //  coupe vue d'en bas), y vers l'ARRIÈRE (antérieur en haut de l'écran).
  // ===========================================================================
  const AXC = { f: [0, -14], s: [628, 588], sc: 2.6 };
  // corps vertébral réniforme (≈ 50 × 35 mm), bord postérieur concave
  const AX_BODY = (() => {
    const out = [];
    for (let k = 0; k < 72; k++) {
      const g = (k / 72) * Math.PI * 2, s = Math.sin(g);
      const dg = Math.atan2(Math.sin(g - Math.PI / 2), Math.cos(g - Math.PI / 2));
      out.push([25 * Math.cos(g) * (1 - 0.04 * s * s), (s < 0 ? 18 : 17.5) * s - 6.5 * Math.exp(-Math.pow(dg / 0.55, 2))]);
    }
    return out;
  })();
  // arc postérieur : pédicules, processus costiformes (pointes ±55 mm), processus articulaires, lames, épineuse
  const AX_ARCH = sym([[0, 8], [11, 9.5], [14.5, 13.5], [16.5, 19.5], [20, 23], [31, 23.5], [43, 24.2], [51.5, 25.2], [55.5, 27.3], [55, 30.3], [46, 31.5],
    [33, 31.6], [24.5, 31], [22, 33.5], [25, 36.5], [25.4, 41.8], [21, 44.2], [14, 44.6], [7.6, 46.2], [4.4, 50], [3.8, 62], [3.3, 71], [0, 75.5]]);
  const AX_CANAL = sym([[0, 9.5], [8.5, 11], [11.8, 16.5], [12.2, 23], [10.2, 28.6], [6, 33], [2.6, 35.2], [0, 35.6]]);
  // parties molles (côté gauche du patient = x > 0 ; miroir pour le côté droit)
  const SH = {
    psoas: closedCR([[27, -14], [34, -19.5], [43.5, -17], [49.5, -7.5], [50, 4], [45, 12], [36.5, 14], [29.5, 8.5], [26.2, -3]], 8),
    ql: closedCR([[48, 13], [56.5, 9.2], [68, 9], [77.5, 14], [82.5, 22], [79, 27.6], [68, 28.6], [57, 27], [49.5, 21.5]], 8),
    es: closedCR([[24.5, 42], [31, 35.2], [44, 33.4], [58, 34.2], [71, 38.4], [81, 45.6], [85, 54.5], [80.5, 64], [68.5, 72], [50, 76], [33, 76.8], [25.4, 72], [23.6, 58]], 8),
    mf: closedCR([[5, 47.5], [13, 45.8], [21, 44.6], [24.6, 49], [25, 60], [24.2, 71.6], [16, 76.6], [7.5, 77], [4.4, 66], [4.4, 55]], 8),
    rectus: closedCR([[5, -100.6], [25, -100.2], [48, -100.6], [66, -102.2], [71.2, -106.6], [65.5, -111.6], [45, -114.2], [22, -114.6], [5, -113.6]], 8),
  };
  const STIP = {
    psoas: stipple(SH.psoas, 3.4, 11), ql: stipple(SH.ql, 3.4, 12), es: stipple(SH.es, 3.6, 13),
    mf: stipple(SH.mf, 3.2, 14), rectus: stipple(SH.rectus, 3.2, 15),
  };
  // feuillets du fascia thoraco-lombaire (côté x > 0) → raphé latéral
  const RAPHE = [88, 47];
  const FTL = {
    post: openCR([[0, 78.2], [12, 80], [27, 80.6], [46, 80], [62, 77.2], [75.5, 71], [84.6, 62], [88.6, 53.5], RAPHE], 8),
    mid: openCR([[55.6, 28.8], [63, 30.6], [72, 33.8], [80, 39.4], [85.6, 43.8], RAPHE], 8),
    ant: openCR([[44.5, 16.5], [50.5, 8.6], [60, 4.8], [72, 5.2], [82, 10.8], [87.6, 22], [89.4, 34], [91.5, 41.5]], 8),
  };
  // paroi abdominale : lignes moyennes (raphé → ligne blanche), largeurs (mm) le long du trajet
  const TRA_C = openCR([RAPHE, [97, 40], [108, 30], [119, 16], [126, -2], [128, -24], [123, -48], [110, -70], [92, -86], [72, -95], [52, -97.6], [30, -97.8], [12, -97.4], [0, -97]], 8);
  const IO_C = openCR([[92, 51], [103, 44], [115, 32], [127, 16], [134, -3], [135.5, -26], [130.5, -51], [116.5, -74], [97, -91], [80, -100.5], [70.5, -103.2]], 8);
  const EO_C = openCR([[117, 43], [129, 28], [139, 10], [143.4, -12], [142.6, -35], [135.5, -59], [121.5, -80.5], [102, -97.5], [83, -108], [70.5, -111.5]], 8);
  const APO = {
    eo: openCR([[70.5, -111.5], [52, -116.6], [26, -117.8], [0, -117.8]], 6),
    ioA: openCR([[70.5, -103.2], [66, -112.6], [48, -116], [26, -116.6], [0, -116.4]], 6),
    ioP: openCR([[70.5, -103.2], [62, -99.4], [40, -99], [14, -98.8], [0, -98.6]], 6),
  };
  const arcS = (pts) => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + vlen(vsub(pts[i], pts[i - 1]))); return L.map((v) => v / L[L.length - 1]); };
  const TRA_S = arcS(TRA_C), IO_S = arcS(IO_C), EO_S = arcS(EO_C);
  const traW = (s) => lerp(1.3, 4.8, smooth(seg(s, 0.06, 0.15))) * (1 - smooth(seg(s, 0.6, 0.68))) + 1.3 * smooth(seg(s, 0.6, 0.68));
  const ioW = (s) => lerp(1.4, 6.2, smooth(seg(s, 0.0, 0.12))) * (1 - 0.75 * smooth(seg(s, 0.88, 1)));
  const eoW = (s) => 5.2 * smooth(seg(s, -0.04, 0.05)) * (1 - 0.7 * smooth(seg(s, 0.86, 1)));
  const SKIN = sym([[0, -127], [30, -126], [62, -122], [95, -111.5], [124, -91.5], [145, -62.5], [155, -28], [156.5, 6], [150.5, 38], [135, 64.5], [110, 85], [78, 97.5], [45, 101], [18, 99.5], [6, 95], [0, 92]]);
  const SKIN_S = closedCR(SKIN, 6);
  const LINEA = [[-4.4, -99.4], [4.4, -99.4], [4.4, -116.8], [-4.4, -116.8]];
  // bord postérieur de la cavité (côté x > 0, de latéral vers médial) : feuillet antérieur, psoas, corps
  const CAV_POST = [[93, 35], [88, 22], [82.5, 11.5], [72, 6.5], [60, 6.4], [51, 9.5], [51, 1], [46.5, -11], [38, -19.5], [28, -17.5], [22, -15.5], [12, -18.8], [0, -19.6]];

  // contraction du transverse : rapprochement centripète de la paroi (pondéré 0 au raphé → 1 en avant)
  const CC = [0, -40];
  const wallW = (p) => smooth(seg(p[1], 46, 6));
  const dispK = (p, k) => vadd(p, vmul(vsub(CC, p), k * wallW(p)));
  const TRA_LEN0 = 2 * polyLen(TRA_C);
  const traLen = (k) => 2 * polyLen(TRA_C.map((p) => dispK(p, k)));
  // calibrage (pur, au chargement) : raccourcissement de 3 % de la circonférence du transverse
  const K_CON = (() => {
    let k = 0.03;
    for (let i = 0; i < 4; i++) { const r = 1 - traLen(k) / TRA_LEN0; k *= 0.03 / r; }
    return k;
  })();
  /** Variation relative (%) de la circonférence du transverse pour un niveau de contraction c ∈ [0, 1], mesurée sur le tracé. */
  const circChange = (c) => (traLen(K_CON * c) / TRA_LEN0 - 1) * 100;

  // ===========================================================================
  //  TIMELINE DE LA SCÈNE (s)
  // ===========================================================================
  const TL = {
    grow0: 1.8, growStep: 0.25, fasStep: 0.06, growDur: 0.5,
    act: [3.5, 3.9],
    mech: [3.6, 5.05],
    cut: [5.0, 5.55],
    trA: [6.0, 6.6], ftl: [6.3, 6.8], con: [6.8, 7.7], pia: [6.85, 8.0],
  };
  const piaKPa = (t) => 0.5 + 4.5 * smooth(seg(t, TL.pia[0], TL.pia[1])); // illustratif : 0,5 → 5 kPa

  // ===========================================================================
  //  VUE SAGITTALE 0 → 5,5 s : niveaux, repères osseux, multifide, mécanique, coupe
  // ===========================================================================
  function drawLevels(ctx, F, cam) {
    const t = F.t, a = fio(t, 0.4, 3.7, 0.6, 0.35);
    if (a <= 0.004) return;
    const A = F.A;
    const items = ['L1', 'L2', 'L3', 'L4', 'L5'].map((n) => {
      const V = F.G.lv[IX[n]];
      return [n, A.v(n, [-V.L.D / 2 - 3, 0]), A.v(n, [-V.L.D / 2 - 11, 0])];
    });
    items.push(['S1', toW(F.G.s1, [-S1D / 2 - 3, 13]), toW(F.G.s1, [-S1D / 2 - 11, 13])]);
    for (const [n, p0, p1] of items) {
      const s0 = cam.w2s(p0), s1 = cam.w2s(p1);
      const ka = a * smooth(seg(s1[1], 190, 215)) * (1 - smooth(seg(s1[1], 955, 985))); // hors des zones du HUD
      if (ka <= 0.004) continue;
      ctx.strokeStyle = rgba('cyan', 0.55 * ka); ctx.lineWidth = 1.2; line(ctx, s0, s1);
      text(ctx, n, s1[0] - 8, s1[1] + 5, { size: 14, c: mix('cyan', 'white', 0.35), a: 0.85 * ka, align: 'right', w: 600, bg: 0.75, id: 's1-lvl' + n });
    }
  }

  function drawLandmarks(ctx, F, cam) {
    const t = F.t, a = fio(t, 1.05, 3.1, 0.45, 0.45);
    if (a <= 0.004) return;
    const A = F.A, pulse = 0.5 + 0.5 * Math.sin((t - 1.05) * 7);
    for (const n of ['L1', 'L2', 'L3', 'L4', 'L5']) {
      // bord inférieur de l'épineuse
      const pts = []; for (let k = 0; k <= 8; k++) pts.push(cam.w2s(A.spinInf(n, k / 8)));
      smoothPath(ctx, pts); ctx.lineCap = 'round';
      ctx.strokeStyle = rgba('cobalt', 0.25 * a); ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = rgba(COBALT_L, 0.95 * a); ctx.lineWidth = 3; ctx.stroke();
      // processus mamillaire
      const m = cam.w2s(A.mam(n)), r = 2.4 * cam.sc;
      dot(ctx, m, r + 4 + 2 * pulse, 'cobalt', 0.25 * a);
      dot(ctx, m, r, COBALT_L, 0.95 * a);
      dot(ctx, m, 1.6, 'white', a);
    }
    // origine (bord inférieur des épineuses) puis terminaison (processus mamillaires) : les deux faisceaux de traits ne coexistent pas
    const lo = fio(t, 1.2, 2.45, 0.3, 0.3), lm = fio(t, 2.3, 3.55, 0.3, 0.35);
    const mL2 = cam.w2s(A.mam('L2')), mL3 = cam.w2s(A.mam('L3')), mL4 = cam.w2s(A.mam('L4'));
    tag(ctx, mL3, [884, mL2[1] - 52], [{ s: 'PROCESSUS MAMILLAIRES', c: COBALT_L }], { a: lm, lc: COBALT_L, size: 15, id: 's1-mam', more: [mL2, mL4] });
    const s3 = cam.w2s(A.spinInf('L3', 0.55)), s2 = cam.w2s(A.spinInf('L2', 0.55)), s4 = cam.w2s(A.spinInf('L4', 0.55));
    tag(ctx, s3, [884, s3[1] + 58], [{ s: 'BORD INFÉRIEUR DES ÉPINEUSES', c: COBALT_L }], { a: lo, lc: COBALT_L, size: 15, id: 's1-spi', more: [s2, s4] });
  }

  function drawMultifidus(ctx, F, cam) {
    const t = F.t;
    if (t < TL.grow0 || t > 6.0) return;
    const A = F.A;
    const act = smooth(seg(t, TL.act[0], TL.act[1]));
    const foc = fio(t, 3.95, 5.1, 0.35, 0.3);           // mise en avant des faisceaux qui croisent L4/L5
    for (const f of MF) {
      const t0 = TL.grow0 + f.bi * TL.growStep + f.fi * TL.fasStep;
      const g = E.out(seg(t, t0, t0 + TL.growDur));
      if (g <= 0) continue;
      const a = f.cross ? 1 - 0.25 * foc * smooth(seg(t, 4.1, 4.45)) : 1 - 0.65 * foc;
      MU.drawMuscle(ctx, cam, A, f.spec, { grow: g / 1.35, act: act * (f.cross ? 1 : 1 - 0.5 * foc), a, t: t + f.gi * 0.173 });
    }
    // origines / terminaisons (points marqués) après la croissance
    const aa = fio(t, 3.2, 6.0, 0.4, 0.4) * (1 - 0.5 * foc);
    if (aa > 0.004) for (const f of MF) MU.drawAttachments(ctx, cam, A, f.spec, { a: aa * 0.8 });
    // étiquette
    const la = fio(t, 2.7, 5.0, 0.35, 0.3);
    const fL2 = MF.find((f) => f.bi === 1 && f.fi === 2), P = MU.resolve(A, fL2.spec.fascicles[0]);
    const anc = cam.w2s(vlerp(P[0], P[2], 0.32));
    tag(ctx, anc, [884, 268], [{ s: 'MULTIFIDE', c: COBALT_L, w: 700, size: 17 }, { s: '5 bandes segmentaires L1 → L5', c: 'white', size: 14, w: 400 }], { a: la, lc: COBALT_L, size: 17, id: 's1-mf' });
  }

  function drawMech(ctx, F, cam) {
    const t = F.t, a = fio(t, TL.mech[0], TL.mech[1], 0.35, 0.3);
    if (a <= 0.004) return;
    const R = mfMech(F.A), D = R.D, W = (p) => cam.w2s(p);
    const cS = W(R.c);
    const a1 = a * smooth(seg(t, 3.6, 3.95)), a2 = a * smooth(seg(t, 3.85, 4.2)), a3 = a * smooth(seg(t, 3.9, 4.2));
    // plan discal moyen L4/L5 et normale n̂
    ctx.setLineDash([6, 5]); ctx.strokeStyle = rgba('white', 0.6 * a1); ctx.lineWidth = 1.4;
    line(ctx, W(vadd(R.c, vmul(D.post, -34))), W(vadd(R.c, vmul(D.post, 92)))); ctx.setLineDash([]);
    arrow(ctx, cS, W(vadd(R.c, vmul(D.n, 15))), 'white', 0.9 * a1, { lw: 2, head: 9, noGlow: true });
    const nS = W(vadd(R.c, vmul(D.n, 15)));
    text(ctx, 'n̂', nS[0] + 8, nS[1] + 4, { size: 16, c: 'white', a: a1, w: 700, bg: 0.75, id: 's1-n' });
    const pa = W(vadd(R.c, vmul(D.post, -34)));
    text(ctx, 'PLAN DISCAL L4–L5', pa[0] - 10, pa[1] + 5, { size: 14, c: 'white', a: a1, align: 'right', w: 600, bg: 0.75, id: 's1-plan' });
    // ligne d'action résultante (faisceaux qui enjambent L4/L5)
    ctx.setLineDash([7, 6]); ctx.lineCap = 'butt';
    ctx.strokeStyle = rgba('bg', 0.7 * a1); ctx.lineWidth = 4.5; line(ctx, W(vadd(R.p, vmul(R.U, -75))), W(vadd(R.p, vmul(R.U, 95))));
    ctx.strokeStyle = rgba(TEAL_L, 0.95 * a1); ctx.lineWidth = 2; line(ctx, W(vadd(R.p, vmul(R.U, -75))), W(vadd(R.p, vmul(R.U, 95))));
    ctx.setLineDash([]);
    const top = W(vadd(R.p, vmul(R.U, -60)));
    tag(ctx, top, [884, top[1] - 6], [{ s: 'RÉSULTANTE', c: TEAL_L, w: 700 }, { s: R.n + ' faisceaux croisent L4–L5', c: 'white', size: 14, w: 400 }], { a: a1, lc: 'teal', size: 15, id: 's1-res' });
    // bras de levier (calculé)
    MU.leverDim(ctx, cam, R.c, R.p, R.U, { a: a2, label: false });
    const ft = MU.foot(R.c, R.p, R.U), mS = W(vlerp(R.c, ft, 0.5));
    text(ctx, 'd = ' + fr(Math.abs(R.arm) / 10, 1) + ' cm', mS[0], mS[1] + 30, { size: 16, c: TEAL_L, a: a2, align: 'center', w: 700, bg: 0.8, id: 's1-d' });
    // moment : rotation sagittale postérieure (sens horaire à l'écran, profil gauche)
    MU.momentArc(ctx, cS, 66, R.arm > 0 ? -0.5 : 0.5, { a: a2, Mref: 1, start: Math.PI * 0.6, col: 'teal' });
    text(ctx, 'ROTATION SAGITTALE', cS[0] - 86, cS[1] - 66, { size: 15, c: TEAL_L, a: a2, align: 'right', w: 700, bg: 0.75, id: 's1-rot1' });
    text(ctx, 'POSTÉRIEURE', cS[0] - 86, cS[1] - 46, { size: 15, c: TEAL_L, a: a2, align: 'right', w: 700, bg: 0.75, id: 's1-rot2' });
    // décomposition de la force selon le plan discal (longueur relative, sans valeur en N)
    const L = 52, q = R.q, qS = W(q);
    const tip = vadd(q, vmul(R.U, L)), cTip = vadd(q, vmul(D.n, -L * R.comp)), sTip = vadd(q, vmul(D.t, L * R.shear));
    // halo sombre pour détacher les vecteurs des fibres
    ctx.lineCap = 'round'; ctx.strokeStyle = rgba('bg', 0.55 * a3); ctx.lineWidth = 16;
    line(ctx, qS, W(tip)); line(ctx, qS, W(cTip));
    ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba('white', 0.6 * a3); ctx.lineWidth = 1.2;
    line(ctx, W(cTip), W(tip)); line(ctx, W(sTip), W(tip)); ctx.setLineDash([]);
    const compCol = mix('teal', 'white', 0.5);
    arrow(ctx, qS, W(cTip), compCol, a3, { lw: 2.6, head: 12, outline: true, noGlow: true });
    arrow(ctx, qS, W(sTip), compCol, a3, { lw: 2.6, head: 11, outline: true, noGlow: true });
    arrow(ctx, qS, W(tip), 'teal', a3, { lw: 4, head: 17, outline: true });
    dot(ctx, qS, 4.5, 'white', a3);
    const tS = W(tip);
    text(ctx, 'F', tS[0] + 14, tS[1] + 4, { size: 18, c: TEAL_L, a: a3, w: 700, bg: 0.75, id: 's1-F' });
    const cTS = W(cTip);
    // composantes F·cos θ et F·sin θ (θ = angle entre F et la normale) : facteurs, non additifs
    tag(ctx, cTS, [884, cTS[1] - 4], [{ s: 'Fc  COMPRESSION  ' + fr(R.comp, 2) + ' F', c: TEAL_L, w: 700 }], { a: a3, lc: 'teal', size: 15, id: 's1-fc' });
    const sTS = W(sTip);
    tag(ctx, sTS, [884, cTS[1] - 50], [{ s: 'Fs  CISAILLEMENT  ' + fr(Math.abs(R.shear), 2) + ' F', c: TEAL_L, w: 700 },
      { s: R.shear > 0 ? 'faible, vers l’avant' : 'faible, vers l’arrière', c: 'white', size: 14, w: 400 }], { a: a3, lc: 'teal', size: 15, id: 's1-fs' });
  }

  function drawCut(ctx, F, cam) {
    const t = F.t, a = fio(t, TL.cut[0], TL.cut[1] + 0.3, 0.12, 0.4);
    if (a <= 0.004) return;
    const y = cam.w2s(F.A.body('L3'))[1];
    const sweep = E.io(seg(t, 5.0, 5.35)), x0 = 90, x1 = lerp(x0, 1180, sweep);
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, rgba('cyan', 0)); g.addColorStop(0.75, rgba('cyan', 0.55 * a)); g.addColorStop(1, rgba('white', a));
    ctx.fillStyle = rgba('cyan', 0.07 * a); ctx.fillRect(x0, y - 9, x1 - x0, 18);
    ctx.strokeStyle = g; ctx.lineWidth = 2.2; line(ctx, [x0, y], [x1, y]);
    dot(ctx, [x1, y], 4, 'white', a * (1 - smooth(seg(t, 5.35, 5.5))));
    text(ctx, 'PLAN DE COUPE L3', 1170, y - 16, { size: 15, c: 'white', a: a * smooth(seg(t, 5.15, 5.3)), align: 'right', w: 700, ls: 2, bg: 0.75, id: 's1-cut' });
  }

  // ===========================================================================
  //  VUE SAGITTALE 8,0 → 10,0 s : transverse (projection latérale) et PIA
  // ===========================================================================
  function traPoly(A) {
    const top = [12, 11, 10, 9, 8, 7].map((i) => A.cart(i));
    const ant = []; for (let k = 0; k <= 12; k++) ant.push(A.wall(lerp(0.04, 0.88, k / 12)));
    const bot = [A.inguinal(0.33), A.inguinal(0), A.crest(0.12), A.crest(0.3), A.crest(0.48), A.crest(0.66)];
    const post = [A.v('L4', [40, 0]), A.v('L3', [40, 0])];
    return [...top, ...ant, ...bot, ...post];
  }
  function outward(pts, i, ref) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let n = vnorm(perp(vsub(b, a)));
    if (vdot(n, vsub(pts[i], ref)) < 0) n = vmul(n, -1);
    return n;
  }
  function polyAt(pts, u) { const f = clamp(u) * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)); return vlerp(pts[k], pts[k + 1], f - k); }

  const cavCentroid = (cav) => cav.reduce((s, p) => vadd(s, p), [0, 0]).map((v) => v / cav.length);
  const iapOut = (t) => 1 - smooth(seg(t, 9.55, 10.0));   // fondu de sortie des graphismes (fini à 10,0 s)

  /** Sous le squelette : ballon de PIA (cavité abdomino-pelvienne) et transverse en projection latérale. */
  function drawIAPUnder(ctx, F, cam) {
    const t = F.t;
    if (t < 7.95 || t > 10.05) return;
    const A = F.A, G = F.G, W = (p) => cam.w2s(p), out = iapOut(t);
    // --- ballon de PIA (remplissage progressif de la cavité)
    const pb = smooth(seg(t, 8.7, 9.4)) * out;
    const cav = G.wall.cavity, cen = cavCentroid(cav);
    if (pb > 0.004) {
      const cS = W(cen), R = 190 * cam.sc;
      const g = ctx.createRadialGradient(cS[0], cS[1], 10, cS[0], cS[1], R);
      g.addColorStop(0, rgba('teal', 0.45 * pb)); g.addColorStop(0.6, rgba('teal', 0.24 * pb)); g.addColorStop(1, rgba('teal', 0.09 * pb));
      polyPath(ctx, cav.map(W), true); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = rgba(TEAL_L, 0.65 * pb); ctx.lineWidth = 1.5; ctx.stroke();
    }
    // --- transverse de l'abdomen : fibres horizontales tracées du FTL (arrière) vers la ligne blanche (avant)
    const ta = Math.min(fio(t, 8.0, 10.0, 0.35, 0.45), out) * (1 - 0.4 * smooth(seg(t, 8.9, 9.3)));
    if (ta > 0.004) {
      const poly = traPoly(A).map(W);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const gr = E.io(seg(t, 8.1, 8.8)), xg = lerp(x1, x0, gr);
      ctx.save();
      polyPath(ctx, poly, true); ctx.clip();
      ctx.beginPath(); ctx.rect(xg, y0 - 2, x1 - xg + 4, y1 - y0 + 4); ctx.clip();
      polyPath(ctx, poly, true); ctx.fillStyle = rgba('cobalt', 0.2 * ta); ctx.fill();
      const step = 6.5 * cam.sc;
      ctx.lineCap = 'round';
      for (let y = y0 + step * 0.5; y < y1; y += step) {
        ctx.strokeStyle = rgba('cobalt', 0.16 * ta); ctx.lineWidth = 4.5; line(ctx, [x0, y], [x1, y]);
        ctx.strokeStyle = rgba(mix('cobalt', 'white', 0.3), 0.8 * ta); ctx.lineWidth = 1.3; line(ctx, [x0, y], [x1, y]);
      }
      ctx.restore();
      polyPath(ctx, poly, true); ctx.strokeStyle = rgba(COBALT_L, 0.6 * ta * gr); ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  /** Sur le squelette : insertions, pressions sur les parois du ballon, décharge axiale, étiquettes. */
  function drawIAP(ctx, F, cam) {
    const t = F.t;
    if (t < 7.95 || t > 10.05) return;
    const A = F.A, G = F.G, W = (p) => cam.w2s(p), out = iapOut(t);
    const cav = G.wall.cavity, cen = cavCentroid(cav);
    // --- insertions du transverse et étiquette
    const ta = Math.min(fio(t, 8.0, 10.0, 0.35, 0.45), out);
    const ia = ta * smooth(seg(t, 8.5, 8.8));
    if (ia > 0.004) {
      for (let i = 7; i <= 12; i++) dot(ctx, W(A.cart(i)), 3.4, COBALT_L, ia);
      for (const u of [0.05, 0.25, 0.45, 0.66]) dot(ctx, W(A.crest(u)), 3.4, COBALT_L, ia);
      for (const u of [0, 0.15, 0.3]) dot(ctx, W(A.inguinal(u)), 3.4, COBALT_L, ia);
    }
    const lt = fio(t, 8.35, 9.85, 0.3, 0.3);
    tag(ctx, W(A.v('L3', [-58, -12])), [330, 380], [{ s: 'TRANSVERSE', c: COBALT_L, w: 700 }, { s: 'DE L’ABDOMEN', c: COBALT_L, w: 700 }, { s: 'fibres horizontales', c: 'white', size: 14, w: 400 }],
      { a: lt, lc: COBALT_L, size: 16, align: 'right', id: 's1-tra' });
    const li = fio(t, 8.55, 9.85, 0.3, 0.3);
    tag(ctx, W(A.cart(9)), [330, 268], [{ s: 'CARTILAGES 7–12', c: 'white', size: 14 }], { a: li, lc: COBALT_L, size: 14, align: 'right', id: 's1-cart' });
    tag(ctx, W(A.crest(0.25)), [330, 796], [{ s: 'CRÊTE ILIAQUE', c: 'white', size: 14 }, { s: '+ LIGAMENT INGUINAL', c: 'white', size: 14 }],
      { a: li, lc: COBALT_L, size: 14, align: 'right', id: 's1-cre', more: [W(A.inguinal(0.15))] });
    // --- pressions sur les parois du ballon (normales sortantes)
    const pr = smooth(seg(t, 8.9, 9.4)) * out;
    if (pr > 0.004) {
      // radial : direction centroïde → paroi (coupole du diaphragme, où les normales locales se croisent)
      const push = (pts, us, len, radial) => {
        for (const u of us) {
          const i = Math.round(clamp(u) * (pts.length - 1)), p = polyAt(pts, u);
          const n = radial ? vnorm(vsub(p, cen)) : outward(pts, i, cen);
          arrow(ctx, W(vsub(p, vmul(n, len * 0.95))), W(vadd(p, vmul(n, len * 0.3))), TEAL_L, pr, { lw: 2.4, head: 10, noGlow: true, outline: true });
        }
      };
      push(G.wall.diaph, [0.14, 0.3, 0.46], 24 * pr, true); // versant antérieur et coupole : vers le haut
      push(G.wall.floor, [0.3, 0.5, 0.7], 22 * pr);          // plancher pelvien : vers le bas
      push(G.wall.inner, [0.35, 0.48, 0.61, 0.74], 22 * pr); // paroi antérieure : vers l'avant
    }
    const la = fio(t, 9.0, 9.85, 0.3, 0.3) * out;
    const d0 = polyAt(G.wall.diaph, 0.46), fl = polyAt(G.wall.floor, 0.62);
    tag(ctx, W(d0), [884, W(d0)[1] + 4], [{ s: 'DIAPHRAGME', c: 'white' }, { s: 'poussé vers le haut', c: 'grey', size: 13, w: 400 }], { a: la, lc: 'grey', size: 15, id: 's1-dia' });
    tag(ctx, W(fl), [884, Math.min(944, W(fl)[1] + 10)], [{ s: 'PLANCHER PELVIEN', c: 'white' }, { s: 'poussé vers le bas', c: 'grey', size: 13, w: 400 }], { a: la, lc: 'grey', size: 15, id: 's1-flo' });
    // --- décharge axiale : poussée verticale sous le thorax (résultante de la PIA sur le diaphragme)
    const da = fio(t, 9.05, 9.85, 0.3, 0.3) * out;
    const xa = cen[0] - 4, base = [xa, cen[1] - 22], top = [xa, A.xiphoid()[1] + 34];
    if (da > 0.004) arrow(ctx, W(base), W(top), 'teal', da, { lw: 5, head: 20, outline: true });
    const tS = W(top), pS = W(cen);
    text(ctx, 'DÉCHARGE AXIALE', tS[0] - 22, tS[1] + 14, { size: 16, c: TEAL_L, a: da, align: 'right', w: 700, bg: 0.8, id: 's1-dech' });
    text(ctx, 'PIA', pS[0], pS[1] + 8, { size: 22, c: 'white', a: la, align: 'center', w: 700, ls: 2, bg: 0.6, id: 's1-pia' });
  }

  // ===========================================================================
  //  VUE AXIALE L3 (P2.views.axial)
  // ===========================================================================
  function band(ctx, ptsS, ws, col, a, o) {
    if (a <= 0.004 || ptsS.length < 2) return;
    const L = offsetVar(ptsS, ws, 0.5), R = offsetVar(ptsS, ws, -0.5);
    polyPath(ctx, [...L, ...R.slice().reverse()], true);
    ctx.fillStyle = rgba(col, (o.fill || 0.28) * a); ctx.fill();
    ctx.strokeStyle = rgba(col, (o.edge || 0.7) * a); ctx.lineWidth = 1; ctx.stroke();
    const nf = o.fibers || 0;
    ctx.lineCap = 'round';
    for (let k = 0; k < nf; k++) {
      const f = nf === 1 ? 0 : lerp(-0.3, 0.3, k / (nf - 1));
      smoothPath(ctx, offsetVar(ptsS, ws, f));
      ctx.strokeStyle = rgba(mix(col, 'white', o.light || 0.25), (o.fa || 0.75) * a); ctx.lineWidth = o.flw || 1.1; ctx.stroke();
    }
  }
  function blob(ctx, cam, shape, dots, col, a, o) {
    const S = shape.map((p) => cam.w2s(p));
    polyPath(ctx, S, true);
    ctx.fillStyle = rgba(col, (o.fill || 0.2) * a); ctx.fill();
    ctx.strokeStyle = rgba(col, (o.edge || 0.75) * a); ctx.lineWidth = o.lw || 1.4; ctx.stroke();
    ctx.fillStyle = rgba(mix(col, 'white', 0.3), (o.dot || 0.45) * a);
    const r = Math.max(0.8, 0.36 * cam.sc);
    for (const p of dots) { const s = cam.w2s(p); ctx.fillRect(s[0] - r / 2, s[1] - r / 2, r, r); }
  }

  function drawAxial(ctx, F, cam) {
    const t = F.t;
    const W = (p) => cam.w2s(p);
    const both = (fn) => { fn(1); fn(-1); };
    const X = (p, s) => [p[0] * s, p[1]];
    const con = E.io(seg(t, TL.con[0], TL.con[1]));
    const pk = smooth(seg(t, TL.pia[0], TL.pia[1]));
    const D = (p) => dispK(p, K_CON * con);
    const trG = E.io(seg(t, TL.trA[0], TL.trA[1]));
    const ftlH = smooth(seg(t, TL.ftl[0], TL.ftl[0] + 0.25));
    const muted = mix('crimson', 'bg', 0.35);

    // --- peau et tissu sous-cutané
    const skin = SKIN_S.map((p) => W(D(p)));
    polyPath(ctx, skin, true);
    ctx.fillStyle = rgba('white', 0.025); ctx.fill();
    ctx.strokeStyle = rgba('grey', 0.75); ctx.lineWidth = 1.4; ctx.stroke();

    // --- cavité abdominale (bord antérieur = face profonde du transverse)
    const traIn = (s) => {
      const pts = TRA_C.map((p) => X(D(p), s));
      return pts.map((p, i) => vadd(p, vmul(outward(pts, i, [0, -40]), -2.8)));
    };
    const inR = traIn(1).filter((p) => p[1] < 34), inL = traIn(-1).filter((p) => p[1] < 34);
    const cav = [...CAV_POST.slice().reverse(), ...inR, ...inL.slice().reverse(), ...mir(CAV_POST)];
    const cavS = cav.map(W);
    polyPath(ctx, cavS, true);
    ctx.fillStyle = rgba('grey', 0.07); ctx.fill();
    if (pk > 0.004) {
      const c = W([0, -45]), R = 135 * cam.sc;
      const g = ctx.createRadialGradient(c[0], c[1], 8, c[0], c[1], R);
      g.addColorStop(0, rgba('teal', 0.46 * pk)); g.addColorStop(0.55, rgba('teal', 0.26 * pk)); g.addColorStop(1, rgba('teal', 0.1 * pk));
      polyPath(ctx, cavS, true); ctx.fillStyle = g; ctx.fill();
    }
    ctx.setLineDash([4, 5]); polyPath(ctx, cavS, true); ctx.strokeStyle = rgba('grey', 0.45 + 0.3 * pk); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);

    // --- obliques externe et interne (crimson atténué), gaine et grand droit
    both((s) => {
      const eo = EO_C.map((p) => W(X(D(p), s))), io = IO_C.map((p) => W(X(D(p), s)));
      band(ctx, eo, EO_S.map((u) => eoW(u) * cam.sc), muted, 1, { fill: 0.3, edge: 0.6, fibers: 2, fa: 0.45, light: 0.2 });
      band(ctx, io, IO_S.map((u) => ioW(u) * cam.sc), muted, 1, { fill: 0.3, edge: 0.6, fibers: 2, fa: 0.45, light: 0.2 });
      ctx.lineWidth = 1.3;
      for (const k of ['eo', 'ioA', 'ioP']) { smoothPath(ctx, APO[k].map((p) => W(X(D(p), s)))); ctx.strokeStyle = rgba(mix(muted, 'white', 0.3), 0.7); ctx.stroke(); }
      blob(ctx, cam, SH.rectus.map((p) => X(D(p), s)), STIP.rectus.map((p) => X(D(p), s)), 'crimson', 0.8, { fill: 0.22, edge: 0.7 });
    });
    polyPath(ctx, LINEA.map((p) => W(D(p))), true);
    ctx.fillStyle = rgba('white', 0.55); ctx.fill();

    // --- transverse de l'abdomen (cobalt) : tracé du raphé vers la ligne blanche, puis contraction
    if (trG > 0.002) {
      both((s) => {
        const pts = TRA_C.map((p) => W(X(D(p), s)));
        const n = Math.max(2, Math.ceil(trG * pts.length));
        const sub = pts.slice(0, n), ws = TRA_S.slice(0, n).map((u) => traW(u) * cam.sc * (1 + 0.15 * con));
        if (n < pts.length) { const f = trG * (pts.length - 1) - (n - 2); sub[n - 1] = vlerp(pts[n - 2], pts[n - 1], clamp(f)); }
        band(ctx, sub, ws, 'cobalt', 1, { fill: 0.4 + 0.2 * con, edge: 0.9, fibers: 3, fa: 0.85 + 0.15 * con, light: 0.3 + 0.3 * con, flw: 1.2 });
        // onde d'activation le long des fibres pendant la contraction
        if (con > 0.02 && trG >= 1) {
          const ph = ((t - TL.con[0]) * 0.8) % 1;
          const segp = partial(pts, Math.min(1, ph + 0.1)).slice(Math.floor(ph * pts.length));
          if (segp.length > 1) { smoothPath(ctx, segp); ctx.strokeStyle = rgba('white', 0.6 * con); ctx.lineWidth = 2.4; ctx.stroke(); }
        }
      });
    }

    // --- muscles postérieurs et psoas
    both((s) => {
      blob(ctx, cam, SH.psoas.map((p) => X(p, s)), STIP.psoas.map((p) => X(p, s)), 'crimson', 0.75, { fill: 0.2 });
      blob(ctx, cam, SH.ql.map((p) => X(p, s)), STIP.ql.map((p) => X(p, s)), 'amber', 0.7, { fill: 0.18 });
      blob(ctx, cam, SH.es.map((p) => X(p, s)), STIP.es.map((p) => X(p, s)), 'amber', 0.75, { fill: 0.18 });
      // cloison longissimus / iliocostal
      ctx.strokeStyle = rgba('amber', 0.35); ctx.lineWidth = 1; smoothPath(ctx, [W(X([59, 35.5], s)), W(X([57, 55], s)), W(X([56, 74.5], s))]); ctx.stroke();
      blob(ctx, cam, SH.mf.map((p) => X(p, s)), STIP.mf.map((p) => X(p, s)), 'cobalt', 1, { fill: 0.3, edge: 0.95, dot: 0.6 });
    });

    // --- fascia thoraco-lombaire : 3 feuillets → raphé latéral
    const tens = smooth(seg(t, TL.con[0] + 0.1, TL.con[1]));
    both((s) => {
      [['post', 0], ['mid', 0.08], ['ant', 0.16]].forEach(([k, dl]) => {
        const h = smooth(seg(t, TL.ftl[0] + dl, TL.ftl[0] + dl + 0.25));
        const S = FTL[k].map((p) => W(X(p, s)));
        smoothPath(ctx, S); ctx.lineCap = 'round';
        if (h > 0.004) { ctx.strokeStyle = rgba('white', 0.14 * h + 0.1 * tens); ctx.lineWidth = 7; ctx.stroke(); }
        ctx.strokeStyle = rgba(mix('white', 'teal', 0.35 * tens), 0.45 + 0.5 * h); ctx.lineWidth = 1.5 + 1.1 * h + 0.6 * tens; ctx.stroke();
      });
      // raphé latéral
      const r = W(X(RAPHE, s));
      dot(ctx, r, 4 + 2 * ftlH, 'white', 0.25 + 0.3 * ftlH);
      dot(ctx, r, 2.6, 'white', 0.95);
    });

    // --- vertèbre L3 (os : style du squelette sagittal)
    const boneFill = rgba('bone', 0.95), boneEdge = rgba('cyan', 0.6);
    polyPath(ctx, AX_ARCH.map(W), true); ctx.fillStyle = boneFill; ctx.fill(); ctx.strokeStyle = boneEdge; ctx.lineWidth = 1.5; ctx.stroke();
    polyPath(ctx, closedCR(AX_CANAL, 5).map(W), true); ctx.fillStyle = rgba('bg', 1); ctx.fill(); ctx.strokeStyle = rgba('cyan', 0.45); ctx.lineWidth = 1.2; ctx.stroke();
    polyPath(ctx, AX_BODY.map(W), true); ctx.fillStyle = boneFill; ctx.fill(); ctx.strokeStyle = boneEdge; ctx.lineWidth = 1.6; ctx.stroke();
    polyPath(ctx, AX_BODY.map((p) => W(vmul(p, 0.86))), true); ctx.strokeStyle = rgba('white', 0.18); ctx.lineWidth = 1; ctx.stroke();

    // --- flèches : tension circonférentielle du transverse, traction du FTL, pression
    const ta = smooth(seg(t, TL.con[0] + 0.15, TL.con[0] + 0.5)) * (1 - smooth(seg(t, 8.0, 8.3)));
    if (ta > 0.004) {
      both((s) => {
        const pts = TRA_C.map((p) => X(D(p), s));
        for (const u of [0.2, 0.33, 0.46, 0.59, 0.86]) {
          const i = Math.round(u * (pts.length - 1)), p = pts[i];
          const tg = vnorm(vsub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
          const nOut = outward(pts, i, [0, -40]), base = vadd(p, vmul(nOut, u > 0.8 ? -7 : -8)); // côté cavité, le long de la bande
          const L = 9 + 3 * con;
          arrow(ctx, W(vadd(base, vmul(tg, 1.5))), W(vadd(base, vmul(tg, L))), 'teal', ta, { lw: 2.2, head: 8, noGlow: true, outline: true });
          arrow(ctx, W(vsub(base, vmul(tg, 1.5))), W(vsub(base, vmul(tg, L))), 'teal', ta, { lw: 2.2, head: 8, noGlow: true, outline: true });
        }
        // le raphé latéral est tiré latéralement : mise en tension des feuillets du FTL
        const r = X(RAPHE, s), dir = vnorm(X([0.75, -0.66], s));
        arrow(ctx, W(vadd(r, vmul(dir, 3))), W(vadd(r, vmul(dir, 14 + 6 * tens))), 'teal', ta, { lw: 3, head: 11, outline: true });
        for (const k of ['post', 'mid']) {
          const P = FTL[k].map((p) => X(p, s)), i = Math.round(P.length * 0.55), p = P[i];
          const tg = vnorm(vsub(P[i + 1], P[i - 1]));
          arrow(ctx, W(vsub(p, vmul(tg, 3))), W(vadd(p, vmul(tg, 8))), TEAL_L, 0.85 * ta, { lw: 1.8, head: 7, noGlow: true });
        }
      });
      // pression isotrope dans la cavité
      if (pk > 0.02) {
        const c = [0, -48];
        for (let k = 0; k < 10; k++) {
          const g = (k / 10) * Math.PI * 2 + 0.31, d = [Math.cos(g) * 1.25, Math.sin(g) * 0.78];
          const p0 = vadd(c, vmul(d, 26)), p1 = vadd(c, vmul(d, 26 + 22 * pk));
          arrow(ctx, W(p0), W(p1), TEAL_L, ta * pk, { lw: 1.8, head: 7, noGlow: true });
        }
      }
    }

    drawAxialLabels(ctx, F, cam, con, pk);
  }

  function drawAxialLabels(ctx, F, cam, con, pk) {
    const t = F.t, W = (p) => cam.w2s(p);
    const base = fio(t, 5.95, 8.0, 0.3, 0.3);
    if (base <= 0.004) return;
    const aT = fio(t, 6.1, 8.0, 0.3, 0.3), aF = fio(t, 6.4, 8.0, 0.3, 0.3);
    const L = (anchor, at, lines, o) => tag(ctx, W(anchor), at, lines, Object.assign({ size: 15 }, o));
    // côté gauche de l'écran (droite du patient)
    L([-141, -48], [206, 380], [{ s: 'OBLIQUE', c: mix('crimson', 'white', 0.35) }, { s: 'EXTERNE', c: mix('crimson', 'white', 0.35) }], { a: base, lc: 'crimson', align: 'right', id: 'ax-eo' });
    L([-134.5, -8], [206, 474], [{ s: 'OBLIQUE', c: mix('crimson', 'white', 0.35) }, { s: 'INTERNE', c: mix('crimson', 'white', 0.35) }], { a: base, lc: 'crimson', align: 'right', id: 'ax-io' });
    L([-124, 6], [206, 568], [{ s: 'TRANSVERSE', c: COBALT_L, w: 700 }, { s: 'raphé → ligne', c: 'white', size: 13, w: 400 }, { s: 'blanche', c: 'white', size: 13, w: 400 }],
      { a: aT, lc: 'cobalt', align: 'right', id: 'ax-tra' });
    const ca = aT * smooth(seg(t, TL.con[0] + 0.05, TL.con[0] + 0.3));
    text(ctx, 'Δ circ. ' + fr(circChange(con), 1) + ' %', 206, 632, { size: 13, c: TEAL_L, a: ca, align: 'right', w: 700, bg: 0.75, id: 'ax-dcirc' });
    L([-66, 19], [206, 690], [{ s: 'CARRÉ DES', c: mix('amber', 'white', 0.3) }, { s: 'LOMBES', c: mix('amber', 'white', 0.3) }], { a: base, lc: 'amber', align: 'right', id: 'ax-ql' });
    L([-RAPHE[0], RAPHE[1]], [206, 790], [{ s: 'RAPHÉ', c: 'white' }, { s: 'LATÉRAL', c: 'white' }], { a: aF, lc: 'white', align: 'right', id: 'ax-rap' });
    // haut
    L([-38, -114.4], [470, 205], [{ s: 'GRAND DROIT', c: mix('crimson', 'white', 0.35) }], { a: base, lc: 'crimson', align: 'right', id: 'ax-rec' });
    L([0, -117], [690, 205], [{ s: 'LIGNE BLANCHE', c: 'white' }], { a: base, lc: 'white', align: 'left', id: 'ax-lb' });
    // côté droit de l'écran (gauche du patient)
    L([62, -46], [1050, 318], [{ s: 'CAVITÉ', c: 'white' }, { s: 'ABDOMINALE', c: 'white' }], { a: base, lc: 'grey', align: 'left', id: 'ax-cav' });
    text(ctx, 'PIA ↑', 1050, 362, { size: 14, c: TEAL_L, a: base * smooth(seg(pk, 0.02, 0.2)), w: 700, bg: 0.75, id: 'ax-piaup' });
    L([16, -9], [1050, 446], [{ s: 'CORPS', c: 'white' }, { s: 'VERTÉBRAL L3', c: 'white' }], { a: base, lc: 'cyan', align: 'left', id: 'ax-body' });
    L([44, -6], [1050, 548], [{ s: 'PSOAS', c: mix('crimson', 'white', 0.35) }], { a: base, lc: 'crimson', align: 'left', id: 'ax-pso' });
    L(FTL.post[Math.round((FTL.post.length - 1) * 0.94)], [1050, 640], [{ s: 'FTL', c: 'white', w: 700 }, { s: '(3 FEUILLETS)', c: 'white' }],
      { a: aF, lc: 'white', align: 'left', id: 'ax-ftl', more: [W(FTL.mid[Math.round(FTL.mid.length * 0.5)]), W(FTL.ant[Math.round(FTL.ant.length * 0.55)])] });
    L([66, 52], [1050, 760], [{ s: 'ÉRECTEURS', c: mix('amber', 'white', 0.3) }, { s: 'longissimus', c: 'grey', size: 13, w: 400 }, { s: '+ iliocostal', c: 'grey', size: 13, w: 400 }], { a: base, lc: 'amber', align: 'left', id: 'ax-es' });
    // bas
    L([-15, 62], [560, 952], [{ s: 'MULTIFIDE', c: COBALT_L, w: 700 }], { a: base, lc: 'cobalt', align: 'right', id: 'ax-mf' });
  }

  P2.views.axial = {
    camera() { return P2.layout.camFrom(AXC); },
    draw(ctx, F, cam) { drawAxial(ctx, F, cam); },
  };

  // ===========================================================================
  //  PANNEAU (blocs séquentiels : 0,9–5,3 · 5,4–8,2 · 8,25–9,95)
  // ===========================================================================
  function panelMultifidus(ctx, F, a) {
    const P = F.panel, x = P.PX + 30, maxW = P.PW - 60, t = F.t;
    P.header(ctx, 'MULTIFIDE', 'stabilisateur segmentaire', a, 'p1m', COBALT_L);
    let y = P.PY + 100;
    const rows = [
      ['ORIGINE', 'processus épineux (bord inférieur) et lames de L1 à L5', 1.2],
      ['TERMINAISON', 'processus mamillaires 2 à 5 niveaux plus bas, face dorsale du sacrum, EIPS', 1.55],
      ['INNERVATION', 'unisegmentaire : chaque bande reçoit le rameau médial d’une seule branche dorsale', 1.9],
      ['ACTION', 'rotation sagittale postérieure (extension segmentaire), sans action de translation', 2.25],
    ];
    for (const [l, v, t0] of rows) {
      const ra = a * smooth(seg(t, t0, t0 + 0.3));
      y += P.attachRow(ctx, l, v, x, y, ra, { id: 'p1m-' + l, lc: l === 'ACTION' ? COBALT_L : 'grey' }) + 12;
    }
    // ordres de grandeur (lus avant le calcul)
    const na = a * smooth(seg(t, 2.6, 2.9));
    y += P.wrap(ctx, '≈ 20 % du moment extenseur en L4–L5', x, y, maxW, { size: 14, c: 'white', a: na, id: 'p1m-n1' });
    y += P.wrap(ctx, 'Groupe le plus influent sur la stabilité du segment (in vitro)', x, y, maxW, { size: 14, c: 'white', a: na, id: 'p1m-n2' });
    y += 4;
    y += P.cite(ctx, 'Macintosh et al. 1986 ; Macintosh & Bogduk 1986 · Bogduk et al. 1992 · Wilke et al. 1995', x, y, na);
    // ---- valeurs calculées (géométrie neutre de la frame)
    const ma = a * smooth(seg(t, 3.65, 4.0));
    if (ma <= 0.004) return;
    const R = mfMech(F.A);
    y += 4;
    ctx.strokeStyle = rgba('grey', 0.4 * ma); ctx.lineWidth = 1; line(ctx, [x, y - 8], [x + maxW, y - 8]);
    y += 16;
    text(ctx, 'AU DISQUE L4–L5 · CALCUL SUR LA GÉOMÉTRIE', x, y, { size: 12, c: 'grey', a: ma, ls: 1.5, w: 700, id: 'p1m-calc' });
    y += 40;
    text(ctx, 'd', x, y, { size: 20, c: TEAL_L, a: ma, w: 700, id: 'p1m-dk' });
    text(ctx, fr(Math.abs(R.arm) / 10, 1) + ' cm', x + 34, y, { size: 30, c: 'white', a: ma, w: 600, id: 'p1m-dv' });
    text(ctx, 'bras de levier de la résultante', x + 210, y - 8, { size: 13, c: 'grey', a: ma, id: 'p1m-dl1' });
    text(ctx, '(' + R.n + ' faisceaux qui enjambent L4/L5)', x + 210, y + 10, { size: 13, c: 'grey', a: ma, id: 'p1m-dl2' });
    y += 34;
    const bars = [
      ['COMPRESSION', R.comp, 'F·cos θ ⊥ plateau'],
      ['CISAILLEMENT', Math.abs(R.shear), 'F·sin θ ' + (R.shear > 0 ? 'vers l’avant' : 'vers l’arrière')],
    ];
    bars.forEach(([l, v, s], k) => {
      const yy = y + k * 34, bx = x + 140, bw = 140;
      text(ctx, l, x, yy, { size: 13, c: 'white', a: ma, ls: 1, id: 'p1m-bl' + k });
      ctx.fillStyle = rgba('grey', 0.25 * ma); ctx.fillRect(bx, yy - 11, bw, 12);
      ctx.fillStyle = rgba('teal', 0.85 * ma); ctx.fillRect(bx, yy - 11, bw * clamp(v) * smooth(seg(t, 3.9, 4.4)), 12);
      text(ctx, fr(v, 2) + ' F', bx + bw + 12, yy, { size: 15, c: TEAL_L, a: ma, w: 700, id: 'p1m-bv' + k });
      text(ctx, s, x + maxW, yy, { size: 12, c: 'grey', a: ma, align: 'right', id: 'p1m-bs' + k });
    });
    y += 64;
    text(ctx, 'θ = ' + fr(R.ang, 1) + '° entre F et la normale au disque · force relative', x, y, { size: 12, c: 'grey', a: ma, id: 'p1m-ang' });
  }

  function panelTransverse(ctx, F, a) {
    const P = F.panel, x = P.PX + 30, maxW = P.PW - 60, t = F.t;
    P.header(ctx, 'TRANSVERSE + FTL', 'effet corset', a, 'p1t', COBALT_L);
    let y = P.PY + 100;
    const ra = (t0) => a * smooth(seg(t, t0, t0 + 0.3));
    y += P.attachRow(ctx, 'ORIGINES', 'cartilages costaux 7–12 · FTL (raphé latéral) · crête iliaque · ligament inguinal', x, y, ra(5.5), { id: 'p1t-orig' }) + 12;
    y += P.attachRow(ctx, 'TERMINAISON', 'ligne blanche', x, y, ra(5.75), { id: 'p1t-term' }) + 12;
    y += P.attachRow(ctx, 'EFFET CORSET', 'contraction → tension circonférentielle → PIA ↑ et mise en tension du FTL', x, y, ra(6.4), { id: 'p1t-cor', lc: COBALT_L }) + 14;
    // jauge de PIA (illustrative) et raccourcissement calculé
    const ga = ra(6.85);
    if (ga <= 0.004) return;
    const con = E.io(seg(t, TL.con[0], TL.con[1]));
    text(ctx, 'Δ circonférence du transverse (tracé) : ' + fr(circChange(con), 1) + ' %', x, y, { size: 13, c: 'white', a: ga, id: 'p1t-dc' });
    y += 34;
    const kpa = piaKPa(t), gx = x, gw = maxW - 150, vmax = 6;
    text(ctx, 'PIA', gx, y, { size: 18, c: TEAL_L, a: ga, w: 700, id: 'p1t-pia' });
    const bx = gx + 52;
    ctx.fillStyle = rgba('grey', 0.25 * ga); ctx.fillRect(bx, y - 14, gw - 52, 16);
    const gg = ctx.createLinearGradient(bx, 0, bx + gw - 52, 0);
    gg.addColorStop(0, rgba('teal', 0.4 * ga)); gg.addColorStop(1, rgba('teal', ga));
    ctx.fillStyle = gg; ctx.fillRect(bx, y - 14, (gw - 52) * (kpa / vmax), 16);
    ctx.strokeStyle = rgba('grey', 0.6 * ga); ctx.lineWidth = 1;
    for (const v of [0, 1, 2, 3, 4, 5, 6]) { const xx = bx + (gw - 52) * (v / vmax); line(ctx, [xx, y + 4], [xx, y + 9]); }
    text(ctx, '0', bx, y + 24, { size: 12, c: 'grey', a: ga, align: 'center', id: 'p1t-g0' });
    text(ctx, '6 kPa', bx + gw - 52, y + 24, { size: 12, c: 'grey', a: ga, align: 'center', id: 'p1t-g6' });
    text(ctx, fr(kpa, 1) + ' kPa', x + maxW, y - 4, { size: 20, c: 'white', a: ga, align: 'right', w: 600, id: 'p1t-kpa' });
    text(ctx, Math.round(kpa * KPA_MMHG) + ' mmHg', x + maxW, y + 18, { size: 14, c: 'grey', a: ga, align: 'right', id: 'p1t-mmhg' });
    y += 46;
    text(ctx, 'valeurs indicatives : repos ≈ 0,5 kPa → contraction ≈ 5 kPa', x, y, { size: 12, c: 'grey', a: ga, id: 'p1t-ind' });
  }

  function panelUnload(ctx, F, a) {
    const P = F.panel, x = P.PX + 30, maxW = P.PW - 60, t = F.t;
    P.header(ctx, 'DÉCHARGE AXIALE', 'pression intra-abdominale', a, 'p1d', TEAL_L);
    let y = P.PY + 104;
    const chain = ['CONTRACTION DU TRANSVERSE', 'PIA ↑ : ENCEINTE PRESSURISÉE', 'POUSSÉE SUR DIAPHRAGME ET PLANCHER', 'DÉCHARGE PARTIELLE DU RACHIS'];
    chain.forEach((c, k) => {
      const ca = a * smooth(seg(t, 8.3 + k * 0.08, 8.55 + k * 0.08));
      const yy = y + k * 52;
      ctx.strokeStyle = rgba('teal', 0.7 * ca); ctx.lineWidth = 1.2; ctx.strokeRect(x + 0.5, yy - 23.5, maxW, 34);
      text(ctx, c, x + 16, yy, { size: 14, c: 'white', a: ca, w: 600, ls: 0.5, id: 'p1d-c' + k });
      if (k < chain.length - 1) arrow(ctx, [x + maxW / 2, yy + 11], [x + maxW / 2, yy + 28], 'teal', ca, { lw: 2, head: 8, noGlow: true });
    });
    y += chain.length * 52 + 34;
    const va = a * smooth(seg(t, 8.55, 8.8));
    text(ctx, '−18 à −31 %', x, y, { size: 34, c: TEAL_L, a: va, w: 700, id: 'p1d-v' });
    y += 28;
    text(ctx, 'de compression rachidienne', x, y, { size: 15, c: 'white', a: va, id: 'p1d-v2' });
    y += 22;
    text(ctx, 'modèle : PIA 5 → 10 kPa, efforts de 60 N·m', x, y, { size: 13, c: 'grey', a: va, id: 'p1d-v3' });
    y += 20;
    y += P.cite(ctx, 'Stokes, Gardner-Morse & Henry 2010, Clin Biomech', x, y, va);
    y += 22;
    const sa = a * smooth(seg(t, 8.75, 9.0));
    text(ctx, '+ RAIDEUR DU TRONC', x, y, { size: 20, c: 'white', a: sa, w: 700, id: 'p1d-s' });
    y += 24;
    text(ctx, 'ceinture lombaire : moins d’activité abdominale', x, y, { size: 14, c: 'white', a: sa, id: 'p1d-s2' });
    y += 20;
    text(ctx, 'in vivo ; effet attribué à la PIA (hypothèse)', x, y, { size: 13, c: 'grey', a: sa, id: 'p1d-s3' });
    y += 22;
    P.cite(ctx, 'Ludvig et al. 2019, Clin Biomech', x, y, sa);
  }

  // ===========================================================================
  //  ENREGISTREMENT
  // ===========================================================================
  P2.scenes.push({
    id: 's1',
    state(F) {
      const t = F.t;
      if (t > 10.4) return;
      if (t < 6.0) {
        // focus lombaire pendant le multifide : thorax, côtes, bassin et fémur atténués
        const k = fio(t, 1.0, 5.6, 0.6, 0.4);
        if (k > 0.004) {
          const dimT = 1 - 0.6 * k;
          F.skel.dim = (i) => (i >= IX.L1 ? 1 : dimT);
          F.skel.ribs *= 1 - 0.7 * k; F.skel.pelvis = 1 - 0.4 * k; F.skel.femur = 1 - 0.5 * k; F.skel.silhouette *= 1 - 0.5 * k;
        }
      } else {
        // PIA : silhouette de la paroi un peu plus visible
        const k = fio(t, 8.0, 10.2, 0.4, 0.5);
        F.skel.silhouette += 0.25 * k;
      }
    },
    sagUnder(ctx, F, cam) {
      if (F.t >= 7.95 && F.t <= 10.05) drawIAPUnder(ctx, F, cam);
    },
    sag(ctx, F, cam) {
      const t = F.t;
      if (t > 10.1) return;
      if (t < 6.0) {
        drawLevels(ctx, F, cam);
        drawLandmarks(ctx, F, cam);
        drawMultifidus(ctx, F, cam);
        drawMech(ctx, F, cam);
        drawCut(ctx, F, cam);
      } else drawIAP(ctx, F, cam);
    },
    panel(ctx, F, pa) {
      const t = F.t;
      if (t > 9.95 || pa <= 0.004) return;
      const a1 = pa * fio(t, 0.9, 5.3, 0.3, 0.3);
      if (a1 > 0.004) panelMultifidus(ctx, F, a1);
      const a2 = pa * fio(t, 5.4, 8.2, 0.3, 0.3);
      if (a2 > 0.004) panelTransverse(ctx, F, a2);
      const a3 = pa * fio(t, 8.25, 9.95, 0.3, 0.2);
      if (a3 > 0.004) panelUnload(ctx, F, a3);
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
