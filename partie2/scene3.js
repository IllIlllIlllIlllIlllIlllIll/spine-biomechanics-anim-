/* =============================================================================
 *  partie2/scene3.js — SCÈNE 3 (22–32 s) : SANGLE ANTÉRIEURE ET COMPLEXE
 *  LOMBO-ILIAQUE
 *
 *  Vue sagittale, caméra « lumbo » (T11 → fémur, 1,75 px/mm) :
 *   22,6–24,6  PSOAS (faces latérales des corps et disques T12/L1 → L4/L5,
 *              processus costiformes L1–L5) réfléchi sur l'éminence
 *              ilio-pubienne → petit trochanter ; ILIAQUE (fosse iliaque) qui
 *              rejoint le tendon commun ; croissance de haut en bas.
 *   24,6–27,0  activation ; au disque L4/L5 : lignes d'action des faisceaux qui
 *              enjambent L4/L5 (droite origine → éminence ilio-pubienne),
 *              résultante, bras de levier, décomposition compression /
 *              cisaillement dans le repère du plateau. Antéversion pelvienne
 *              (framework) : flèche de rotation autour de la hanche, pente
 *              sacrée et lordose EN DIRECT.
 *   27,0–29,4  paroi abdominale : grand droit (3 intersections tendineuses),
 *              oblique externe (fibres en bas et en avant), oblique interne
 *              (fibres en haut et en avant).
 *   29,4–31,9  rétroversion (framework) : traction du grand droit sur le pubis,
 *              bras de levier autour de L4/L5, couple fléchisseur, couples de
 *              forces pelviens autour de l'axe des hanches.
 *  Panneau 22,0 → 31,9 : PSOAS (22,0–27,2) puis ABDOMINAUX (27,2–31,9).
 *
 *  Toutes les valeurs affichées sont CALCULÉES sur la géométrie de la frame
 *  (F.A, F.G, P2.muscles) ; seules les constantes citées et la force
 *  illustrative (signalée comme telle) sont écrites en dur. Fonctions pures :
 *  aucun état conservé d'une frame à l'autre.
 * ========================================================================== */
(function (root) {
  'use strict';
  const SC = root.SpineCore, P2 = root.P2, MU = P2.muscles;
  const {
    W, H, DEG, clamp, lerp, seg, smooth, E, fio, vadd, vsub, vmul, vlen, vnorm, vlerp, vdot, perp,
    rgba, mix, text, measure, line, arrow, dot, ring, smoothPath, partial, LV, IX,
  } = SC;

  // ------------------------------------------------------------------ fenêtres temporelles (s)
  const T = {
    v0: 22.3, v1: 31.99,               // contenu sagittal de la scène
    psG: [22.6, 23.7], ilG: [22.95, 23.9], tdG: [23.35, 24.1],
    psLab: [22.9, 24.7],               // étiquettes anatomiques du psoas
    mech: [24.6, 27.0],                // mécanique au disque L4/L5
    ante: [24.9, 27.45],               // antéversion pelvienne (flèche, PS, LL)
    abd: [27.0, 29.55],                // paroi abdominale (étiquettes jusqu'à 29,55)
    retro: [29.45, 31.85],             // rétroversion, couples pelviens
    p1: [22.0, 27.2], p2: [27.2, 31.9],
  };

  // ------------------------------------------------------------------ couleurs
  const C_PS = SC.rgbOf('crimson');               // psoas
  const C_IL = mix('crimson', 'white', 0.42);     // iliaque (cramoisi plus clair)
  const C_RA = mix('crimson', 'white', 0.06);     // grand droit
  const C_EO = [222, 58, 138];                    // oblique externe (cramoisi tirant sur le magenta)
  const C_IO = [255, 128, 108];                   // oblique interne (cramoisi tirant sur le saumon)
  const C_TXT = mix('crimson', 'white', 0.38);    // textes cramoisis lisibles
  const TEAL_L = mix('teal', 'white', 0.2);
  const C_ES = SC.rgbOf('amber');

  // ------------------------------------------------------------------ formats
  const NBSP = ' ';
  const fr = (v, d) => SC.fmt(v, d).replace('.', ',');
  const frS = (v, d) => SC.fmtS(v, d).replace('.', ',').trim();
  const frN = (v) => { const r = Math.round(v); return (r < 0 ? SC.MINUS : '') + String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); };

  // ------------------------------------------------------------------ typographie
  /** Texte composé (indices) : parts = ['d', {s:'PS', sub:true}, ' = 1,2 cm'] ; un fond unique. */
  function compo(ctx, parts, x, y, o) {
    const a = o.a; if (a <= 0.004) return 0;
    const size = o.size || 16;
    const P = parts.map((p) => (typeof p === 'string' ? { s: p } : Object.assign({}, p)));
    const ws = P.map((p) => {
      p.sz = p.sub ? Math.max(11, Math.round(size * 0.68)) : p.size || size;
      return measure(ctx, p.s, p.sz, o.font, p.w || o.w, o.ls) + (p.sub ? 2 : 0);
    });
    const tot = ws.reduce((s, w) => s + w, 0);
    let x0 = o.align === 'right' ? x - tot : o.align === 'center' ? x - tot / 2 : x;
    if (o.bg) { ctx.fillStyle = rgba('bg', o.bg * a); ctx.fillRect(x0 - 6, y - size * 0.78 - 4, tot + 12, size * 1.1 + 8); }
    P.forEach((p, k) => {
      text(ctx, p.s, x0 + (p.sub ? 1 : 0), y + (p.sub ? size * 0.26 : 0), { size: p.sz, c: p.c || o.c, a, w: p.w || o.w, ls: o.ls, font: o.font, id: o.id + '_' + k });
      x0 += ws[k];
    });
    return tot;
  }
  /** Étiquette à ligne de rappel coudée (ids stables, fond 0,75). */
  function tag(ctx, anchor, at, lines, o) {
    const a = o.a; if (a <= 0.004) return;
    const size = o.size || 14, align = o.align || 'left', side = align === 'left' ? -1 : 1, ly = at[1] - size * 0.35;
    ctx.strokeStyle = rgba(o.lc || 'grey', a * 0.9); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(at[0] + side * 18, ly); ctx.lineTo(at[0] + side * 6, ly); ctx.stroke();
    dot(ctx, anchor, 3, o.lc || 'grey', a);
    let y = at[1];
    lines.forEach((L, i) => {
      text(ctx, L.s, at[0], y, { size: L.size || size, c: L.c || 'white', a: a * (L.a == null ? 1 : L.a), align, ls: L.ls == null ? 1 : L.ls, w: L.w, bg: 0.75, id: o.id + i });
      y += (L.size || size) + 6;
    });
  }
  /** Encadré de message (filet coloré à gauche). Renvoie la hauteur. */
  function msgBox(ctx, x, y, w, lines, o) {
    const a = o.a; if (a <= 0.004) return 0;
    let h = 16; for (const L of lines) h += (L.size || 14) + 8;
    ctx.fillStyle = rgba('bg', 0.86 * a); ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = rgba(o.c || 'teal', 0.45 * a); ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = rgba(o.c || 'teal', a); ctx.fillRect(x, y, 3, h);
    let yy = y + 8;
    lines.forEach((L, i) => {
      yy += L.size || 14;
      text(ctx, L.s, x + 16, yy - 2, { size: L.size || 14, c: L.c || 'white', a, w: L.w, ls: L.ls == null ? 0.5 : L.ls, id: o.id + i });
      yy += 8;
    });
    return h;
  }
  /**
   * Dessine `draw(k)` en estompant tout ce qui dépasse vers le haut (y < y1) :
   * bandes horizontales d'opacité décroissante jusqu'à y0 (rien au-dessus),
   * pour ne jamais empiéter sur le titre du HUD.
   */
  function fadeTop(ctx, y0, y1, draw) {
    const N = 6;
    ctx.save(); ctx.beginPath(); ctx.rect(0, y1, W, H - y1); ctx.clip(); draw(1); ctx.restore();
    for (let k = 0; k < N; k++) {
      const ya = y0 + (k * (y1 - y0)) / N, yb = y0 + ((k + 1) * (y1 - y0)) / N;
      ctx.save(); ctx.beginPath(); ctx.rect(0, ya, W, yb - ya + 0.5); ctx.clip(); draw((k + 0.5) / N); ctx.restore();
    }
  }
  /** Arc fléché autour d'un centre écran (angles écran, rad) ; pointe en a1. */
  function rotArrow(ctx, c, r, a0, a1, col, a, o) {
    if (a <= 0.004) return;
    o = o || {};
    const ccw = a1 < a0;
    ctx.lineCap = 'round';
    if (o.dash) ctx.setLineDash(o.dash);
    ctx.strokeStyle = rgba('bg', 0.8 * a); ctx.lineWidth = (o.lw || 3) + 3;
    ctx.beginPath(); ctx.arc(c[0], c[1], r, a0, a1 + (ccw ? 0.06 : -0.06), ccw); ctx.stroke();
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = o.lw || 3;
    ctx.beginPath(); ctx.arc(c[0], c[1], r, a0, a1 + (ccw ? 0.06 : -0.06), ccw); ctx.stroke();
    ctx.setLineDash([]);
    const end = [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)];
    const tg = ccw ? [Math.sin(a1), -Math.cos(a1)] : [-Math.sin(a1), Math.cos(a1)];
    arrow(ctx, vsub(end, vmul(tg, 14)), end, col, a, { lw: o.lw || 3, head: 15, noGlow: true, outline: true });
  }

  // =========================================================================
  //  ANATOMIE (chemins d'ancrages, A = API d'ancrages de la frame)
  // =========================================================================
  const lvl = (n) => LV[IX[n]];
  /** Origine segmentaire du psoas : marge du disque sous n, moitié postérieure du corps (projection). */
  const discOrigin = (n) => (A) => { const L = lvl(n); return A.v(n, [0.2 * L.D, L.H / 2 + L.below / 2]); };
  /** Point de passage sur l'éminence ilio-pubienne (légèrement en avant), étalé selon la couche s (mm). */
  const EMIN = [-71.5, 72];
  const emin = (s) => (A) => A.pelN([EMIN[0] - 0.8 * s, EMIN[1] + 0.6 * s]);
  // en avant de la tête fémorale (repère du fémur, fixe) puis petit trochanter
  const preHip1 = (s) => (A) => vadd(A.hip(), [-27 - 0.5 * s, 21 + 0.3 * s]);
  const LT = (A) => A.fem('lesserTrochanter');

  /** Faisceau du psoas : origine → (corde vers l'éminence) → éminence → avant de la hanche. */
  function psFas(origin, s, w, name, cross) {
    const e = emin(s);
    return {
      path: [origin, (A) => vlerp(origin(A), e(A), 0.36), (A) => vlerp(origin(A), e(A), 0.7), e, preHip1(s)],
      w, fibers: 3, loa: [0, 3], name, cross,
    };
  }
  // couche superficielle (corps et disques T12/L1 → L4/L5) et couche profonde (processus costiformes L1–L5)
  // largeur w (mm) : ventre épais en projection latérale (≈ 4 cm au niveau L4–L5 pour l'ensemble des faisceaux)
  const PS_BODY = {
    group: 'flexor', color: C_PS, tendon: 0.04,
    fascicles: [
      psFas(discOrigin('T12'), -3, 11, 'T12/L1', true),
      psFas(discOrigin('L1'), -1.5, 12, 'L1/L2', true),
      psFas(discOrigin('L2'), 0, 13, 'L2/L3', true),
      psFas(discOrigin('L3'), 1.5, 13, 'L3/L4', true),
      psFas(discOrigin('L4'), 3, 12, 'L4/L5', false),
    ].map((f) => Object.assign(f, { fibers: 5 })),
  };
  const PS_TP = {
    group: 'flexor', color: mix('crimson', 'bg', 0.22), tendon: 0.04,
    fascicles: ['L1', 'L2', 'L3', 'L4', 'L5'].map((n, k) => Object.assign(psFas((A) => A.tp(n), -2 + k, 10, 'PC ' + n, n !== 'L5'), { fibers: 4 })),
  };
  /** Faisceaux qui enjambent le disque L4/L5 (origine au-dessus du disque). */
  const PS_CROSS = { fascicles: [...PS_BODY.fascicles, ...PS_TP.fascicles].filter((f) => f.cross) };
  // ILIAQUE : fosse iliaque (coordonnées neutres de l'os coxal, sous la crête) → gouttière entre EIAI et éminence → tendon commun
  const ilFas = (o, s, w) => ({
    path: [(A) => A.pelN(o), (A) => A.pelN([-66 - 1.2 * s, 40 + 0.4 * s]), (A) => A.pelN([-78 - 0.8 * s, 70 + 0.5 * s]),
      (A) => vadd(A.hip(), [-31 - 0.5 * s, 24 + 0.4 * s])],
    w, fibers: 4,
  });
  const IL = {
    group: 'flexor', color: C_IL, tendon: 0.05,
    fascicles: [[-12, -42], [-24, -38], [-36, -31], [-46, -25], [-55, -19], [-64, -12], [-72, -5], [-80, 2], [-88, 10]].map((o, i) => ilFas(o, -4 + i, i === 8 ? 9 : 11)),
  };
  /** Tendon commun ilio-psoas : éminence → avant de la tête fémorale → petit trochanter. */
  const TENDON = [emin(0), preHip1(0), (A) => vadd(A.hip(), [-13, 47]), LT];

  // --- paroi abdominale : point de la paroi décalé vers l'avant (épaisseur, mm)
  function wallN(A, u) {
    const a = A.wall(Math.max(0, u - 0.01)), b = A.wall(Math.min(1, u + 0.01));
    let n = vnorm(perp(vsub(b, a))); if (n[0] > 0) n = vmul(n, -1);
    return n;
  }
  const wallOff = (u, off) => (A) => vadd(A.wall(u), vmul(wallN(A, u), off));
  // GRAND DROIT : crête et symphyse pubiennes → cartilages 5–7 et processus xiphoïde
  const RA_U = [0.9, 0.75, 0.58, 0.42, 0.27, 0.13];
  const raFas = (orig, ins, off, w) => ({
    path: [orig, ...RA_U.map((u) => wallOff(u, off)), ins], w, fibers: 3, loa: [0, 3], // ligne d'action : pubis → paroi en regard de L4–L5
  });
  const pubCrest = (k) => (A) => vlerp(A.pel('symphysisTop'), A.pel('pubicTubercle'), k);
  const RA = {
    group: 'flexor', color: C_RA, tendon: 0.05,
    fascicles: [
      raFas(pubCrest(0), (A) => A.xiphoid(), 3.5, 4),
      raFas(pubCrest(0.35), (A) => A.cart(7), 6.5, 4),
      raFas(pubCrest(0.7), (A) => A.cart(6), 9.5, 4),
      raFas(pubCrest(1), (A) => A.cart(5), 12.5, 4),
    ],
  };
  const RA_INTER = [0.06, 0.32, 0.58]; // intersections tendineuses : niveau xiphoïdien, intermédiaire, ombilic
  // OBLIQUE EXTERNE : face externe des côtes 5–12 → moitié antérieure de la crête, ligament inguinal, ligne blanche
  // apo : fraction charnue du trajet (le reste est aponévrotique, jusqu'à la ligne blanche / au ligament inguinal)
  const EO_DEF = [
    { r: 12, u: 0.92, to: (A) => A.crest(0.42), apo: 1 },
    { r: 11, u: 0.9, to: (A) => A.crest(0.3), apo: 1 },
    { r: 10, u: 0.9, to: (A) => A.crest(0.17), apo: 1 },
    { r: 9, u: 0.88, to: (A) => A.crest(0.04), apo: 1 },
    { r: 8, u: 0.86, to: (A) => A.inguinal(0.45), apo: 0.62 },
    { r: 7, u: 0.86, to: wallOff(0.74, 14), apo: 0.6 },
    { r: 6, u: 0.86, to: wallOff(0.53, 14), apo: 0.58 },
    { r: 5, u: 0.86, to: wallOff(0.33, 14), apo: 0.56 },
  ];
  const ribO = (r, u) => (A) => A.rib(r, u);
  const EO = {
    group: 'flexor', color: C_EO, tendon: 0.06,
    fascicles: EO_DEF.map((d) => {
      const o = ribO(d.r, d.u), j = (A) => vlerp(o(A), d.to(A), d.apo);
      return { path: [o, j], w: d.r >= 9 ? 17 : 15, fibers: 6, j, to: d.to, apo: d.apo < 1 };
    }),
  };
  // OBLIQUE INTERNE : FTL, 2/3 antérieurs de la crête iliaque, ligament inguinal → bord inférieur des côtes 10–12, ligne blanche
  const ribInf = (r, u) => (A) => vadd(A.rib(r, u), [0, 3]);
  const IO_DEF = [
    { from: (A) => A.v('L4', [64, 8]), to: ribInf(12, 0.94), apo: 1 },   // fascia thoraco-lombaire (raphé latéral)
    { from: (A) => A.v('L3', [50, 12]), to: ribInf(11, 0.98), apo: 1 },  // fascia thoraco-lombaire
    { from: (A) => A.crest(0.6), to: ribInf(10, 0.99), apo: 1 },
    { from: (A) => A.crest(0.44), to: wallOff(0.24, 11), apo: 0.62 },
    { from: (A) => A.crest(0.27), to: wallOff(0.42, 11), apo: 0.6 },
    { from: (A) => A.crest(0.1), to: wallOff(0.6, 11), apo: 0.56 },
    { from: (A) => A.inguinal(0.3), to: wallOff(0.8, 11), apo: 0.5 },
  ];
  const IO = {
    group: 'flexor', color: C_IO, tendon: 0.06,
    fascicles: IO_DEF.map((d) => {
      const j = (A) => vlerp(d.from(A), d.to(A), d.apo);
      return { path: [d.from, j], w: 14, fibers: 5, j, to: d.to, apo: d.apo < 1 };
    }),
  };

  // =========================================================================
  //  MÉCANIQUE (fonctions pures de la géométrie de la frame)
  // =========================================================================
  const F_PS = 500; // N — force ILLUSTRATIVE d'un psoas (hypothèse, signalée comme telle)
  /**
   * Psoas au disque L4/L5. Ligne d'action de chaque faisceau qui enjambe le
   * disque : droite origine → éminence ilio-pubienne (poulie de réflexion) ;
   * résultante pondérée par la largeur. Bras de levier signé (+ extenseur,
   * − fléchisseur), composantes dans le repère du plateau (n̂ vers L4, t̂ vers l'avant).
   */
  function mechPsoas(A, G) {
    const c = A.disc('L4'), D = SC.discFrame(G);
    const lines = PS_CROSS.fascicles.map((f) => { const l = MU.lineOfAction(A, f); return { p: l.p, q: l.q, u: l.u, d: MU.momentArm(c, l.p, l.u), name: f.name }; });
    const L = MU.resultantLine(A, PS_CROSS);
    const d = MU.momentArm(c, L.p, L.u);                 // mm (force sur le tronc dirigée vers le bassin)
    const comp = -vdot(L.u, D.n), shear = vdot(L.u, D.t); // fractions de F
    const ang = Math.acos(clamp(comp, -1, 1)) / DEG;      // angle entre F et la normale au plateau
    return { c, D, L, d, comp, shear, ang, lines, foot: MU.foot(c, L.p, L.u), M: (F_PS * d) / 1000 };
  }
  /**
   * Grand droit : ligne d'action = résultante des segments pubis → paroi à
   * hauteur de l'ombilic (trajet du muscle en regard de L4–L5). Force sur
   * le tronc dirigée vers le pubis ; force sur le bassin dirigée vers le haut.
   */
  function mechRectus(A, G) {
    const c = A.disc('L4'), hip = A.hip();
    const L = MU.resultantLine(A, RA);                   // u : pubis → thorax (vers le haut)
    const uDown = vmul(L.u, -1);
    const d = MU.momentArm(c, L.p, uDown);               // < 0 : fléchisseur
    const pub = A.pel('symphysisTop');
    const dHip = MU.momentArm(hip, pub, L.u);            // > 0 : rotation horaire écran = rétroversion
    return { c, L, d, foot: MU.foot(c, L.p, L.u), pub, dHip, hip };
  }
  /** Mécanique du psoas au bassin neutre (valeurs affichées : stables pendant l'antéversion). */
  let PS_N = null;
  const psN = () => PS_N || (PS_N = (() => {
    const G0 = P2.anatomy.sagittal({ pelvicTilt: 0, lumbarFlex: 0, hipFlex: 0 });
    return mechPsoas(P2.anatomy.anchors(G0), G0);
  })());
  function mechAll(F) {
    if (F.M.s3) return F.M.s3;
    const ps = mechPsoas(F.A, F.G), ra = mechRectus(F.A, F.G);
    const G = F.G, L1 = G.lv[IX.L1];
    // contrôle géométrique : angle de Cobb L1 (plateau sup.) – S1, pente sacrée mesurée
    const angOf = (p, q) => Math.atan2(-(q[1] - p[1]), q[0] - p[0]) / DEG;
    const ssMeas = angOf(G.s1TA, G.s1TP);
    const llMeas = angOf(G.s1TA, G.s1TP) - angOf(L1.TA, L1.TP);
    F.M.s3 = { ps, ra, ss: G.posture.SS, ll: G.posture.LL, tilt: G.posture.pelvicTilt, ssMeas, llMeas };
    return F.M.s3;
  }

  // =========================================================================
  //  VUE SAGITTALE — muscles
  // =========================================================================
  /** Psoas, iliaque et tendon commun. a : opacité, act : activation. */
  function drawIliopsoas(ctx, F, cam, a, act) {
    const t = F.t, A = F.A;
    const gPS = E.io(seg(t, T.psG[0], T.psG[1])), gIL = E.io(seg(t, T.ilG[0], T.ilG[1])), gTD = E.io(seg(t, T.tdG[0], T.tdG[1]));
    if (a <= 0.004 || (gPS <= 0 && gIL <= 0)) return;
    if (gIL > 0) MU.drawMuscle(ctx, cam, A, IL, { grow: gIL, act: act * 0.8, a: a * 0.95, t });
    if (gPS > 0) {
      MU.drawMuscle(ctx, cam, A, PS_TP, { grow: gPS, act, a: a * 0.9, t });
      MU.drawMuscle(ctx, cam, A, PS_BODY, { grow: gPS, act, a, t });
    }
    // tendon commun (éminence → petit trochanter)
    if (gTD > 0) {
      const pts = MU.screenPath(cam, TENDON.map((f) => f(A)), 12);
      const pp = partial(pts, gTD);
      ctx.lineCap = 'round';
      smoothPath(ctx, pp); ctx.strokeStyle = rgba(mix('crimson', 'white', 0.5), 0.3 * a); ctx.lineWidth = 6.5 * cam.sc; ctx.stroke();
      for (const off of [-2.2, 0, 2.2]) {
        smoothPath(ctx, MU.offsetPath(pp, off * cam.sc, false)); ctx.strokeStyle = rgba('white', 0.62 * a); ctx.lineWidth = 1.1; ctx.stroke();
      }
    }
    // points d'origine et terminaison
    const da = a * smooth(seg(t, T.psG[1] - 0.3, T.psG[1] + 0.2));
    if (da > 0.004) {
      for (const f of [...PS_BODY.fascicles, ...PS_TP.fascicles]) { const s = cam.w2s(f.path[0](A)); dot(ctx, s, 3, C_PS, da); dot(ctx, s, 1.3, 'white', da); }
      for (const f of IL.fascicles) { const s = cam.w2s(f.path[0](A)); dot(ctx, s, 2.8, C_IL, da * 0.9); dot(ctx, s, 1.2, 'white', da * 0.9); }
    }
    const la = a * smooth(seg(t, T.tdG[1] - 0.2, T.tdG[1] + 0.2));
    if (la > 0.004) { const s = cam.w2s(LT(A)); dot(ctx, s, 4.5, C_PS, la); dot(ctx, s, 2, 'white', la); }
  }

  /**
   * Aponévrose d'un oblique : nappe blanche translucide entre les segments
   * aponévrotiques (jonction j → terminaison) des faisceaux consécutifs, et
   * fibres tendineuses fines ; croissance g de la jonction vers la ligne blanche.
   */
  function drawApo(ctx, cam, A, spec, g, a) {
    if (g <= 0 || a <= 0.004) return;
    const segs = spec.fascicles.filter((f) => f.apo).map((f) => { const p0 = cam.w2s(f.j(A)), p1 = cam.w2s(f.to(A)); return [p0, vlerp(p0, p1, g)]; });
    for (let i = 0; i < segs.length - 1; i++) {
      const [a0, a1] = segs[i], [b0, b1] = segs[i + 1];
      ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.lineTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b0[0], b0[1]); ctx.closePath();
      ctx.fillStyle = rgba('white', 0.07 * a); ctx.fill();
    }
    ctx.lineCap = 'round'; ctx.lineWidth = 0.9;
    for (let i = 0; i < segs.length; i++) {
      const [p0, p1] = segs[i], q = segs[Math.min(segs.length - 1, i + 1)];
      for (const f of [0, 0.33, 0.66]) {
        if (i === segs.length - 1 && f > 0) break;
        ctx.strokeStyle = rgba('white', (f ? 0.28 : 0.5) * a);
        line(ctx, vlerp(p0, q[0], f), vlerp(p1, q[1], f));
      }
    }
  }
  /**
   * Muscle large et plat (obliques) : nappe continue entre faisceaux de
   * référence consécutifs (origine → jonction musculo-aponévrotique j), fibres
   * parallèles interpolées, croissance g de l'origine vers la jonction.
   */
  function drawSheet(ctx, cam, A, spec, g, a) {
    if (g <= 0 || a <= 0.004) return;
    const col = spec.color, light = mix(col, 'white', 0.2), nPer = 5;
    const Fs = spec.fascicles.map((f) => [cam.w2s(f.path[0](A)), cam.w2s(f.j(A))]);
    const tip = (f) => vlerp(f[0], f[1], g);
    for (let i = 0; i < Fs.length - 1; i++) {
      const p = Fs[i], q = Fs[i + 1], tp = tip(p), tq = tip(q);
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(tp[0], tp[1]); ctx.lineTo(tq[0], tq[1]); ctx.lineTo(q[0][0], q[0][1]); ctx.closePath();
      ctx.fillStyle = rgba(col, 0.13 * a); ctx.fill();
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < Fs.length; i++) {
      const q = Fs[Math.min(Fs.length - 1, i + 1)], n = i === Fs.length - 1 ? 1 : nPer;
      for (let k = 0; k < n; k++) {
        const u = k / nPer, p0 = vlerp(Fs[i][0], q[0], u), p1 = vlerp(Fs[i][1], q[1], u), e = vlerp(p0, p1, g);
        ctx.strokeStyle = rgba(col, 0.1 * a); ctx.lineWidth = 4; line(ctx, p0, e);
        ctx.strokeStyle = rgba(light, (k ? 0.5 : 0.75) * a); ctx.lineWidth = k ? 1 : 1.3; line(ctx, p0, e);
      }
    }
    const da = a * smooth(seg(g, 0, 0.25));
    for (const f of Fs) { dot(ctx, f[0], 2.6, col, da); dot(ctx, f[0], 1.1, 'white', da); }
  }
  function drawObliques(ctx, F, cam, spec, g, a) {
    if (g <= 0 || a <= 0.004) return;
    drawSheet(ctx, cam, F.A, spec, g, a);
    drawApo(ctx, cam, F.A, spec, smooth(seg(g, 0.7, 1)), a);
  }
  /** Grand droit + intersections tendineuses. */
  function drawRectus(ctx, F, cam, g, a, act) {
    if (g <= 0 || a <= 0.004) return;
    const A = F.A;
    MU.drawMuscle(ctx, cam, A, RA, { grow: g, act, a, t: F.t });
    const ia = a * smooth(seg(g, 0.85, 1));
    if (ia > 0.004) {
      for (const u of RA_INTER) {
        const n = wallN(A, u), p = A.wall(u);
        const s0 = cam.w2s(vadd(p, vmul(n, 1.5))), s1 = cam.w2s(vadd(p, vmul(n, 14.5)));
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba('white', 0.25 * ia); ctx.lineWidth = 6; line(ctx, s0, s1);
        ctx.strokeStyle = rgba('white', 0.95 * ia); ctx.lineWidth = 2.2; line(ctx, s0, s1);
      }
    }
  }
  function drawAbdominals(ctx, F, cam) {
    const t = F.t;
    if (t < T.abd[0] || t > T.v1) return;
    const out = 1 - smooth(seg(t, 31.62, 31.98));
    const gRA = E.io(seg(t, 27.0, 27.8)), gEO = E.io(seg(t, 27.45, 28.2)), gIO = E.io(seg(t, 27.95, 28.65));
    const retro = smooth(seg(t, 29.45, 29.85));
    const actRA = retro * (1 - smooth(seg(t, 31.4, 31.75)));
    const aIO = out * (1 - 0.6 * retro);
    const aEO = out * (1 - 0.5 * smooth(seg(t, 28.2, 28.6))) * (1 - 0.45 * retro);
    fadeTop(ctx, 168, 214, (k) => {
      drawObliques(ctx, F, cam, IO, gIO, aIO * k);
      drawObliques(ctx, F, cam, EO, gEO, aEO * k);
      drawRectus(ctx, F, cam, gRA, out * k, actRA);
    });
    // points d'insertion pubiens du grand droit
    const pa = out * smooth(seg(t, 27.5, 27.8));
    if (pa > 0.004) for (const f of RA.fascicles) { const s = cam.w2s(f.path[0](F.A)); dot(ctx, s, 3, C_RA, pa); dot(ctx, s, 1.3, 'white', pa); }
  }

  // =========================================================================
  //  VUE SAGITTALE — étiquettes anatomiques
  // =========================================================================
  const fasPt = (A, fas, u) => { const p = MU.resolve(A, fas); return vlerp(p[0], p[Math.min(p.length - 1, 3)], u); };
  function psoasLabels(ctx, F, cam) {
    const t = F.t, A = F.A, S = (p) => cam.w2s(p);
    const k = (t0) => fio(t, t0, T.psLab[1], 0.3, 0.25);
    tag(ctx, S(fasPt(A, PS_BODY.fascicles[2], 0.42)), [404, 440], [{ s: 'PSOAS', c: C_TXT, w: 700, size: 17 }, { s: 'grand psoas', size: 13, c: 'white', ls: 0.5 }],
      { a: k(22.95), align: 'right', lc: C_PS, id: 's3lPS' });
    tag(ctx, S(PS_BODY.fascicles[1].path[0](A)), [404, 360], [{ s: 'corps et disques T12–L5', size: 14, w: 600 }],
      { a: k(23.15), align: 'right', lc: C_PS, id: 's3lPSb' });
    tag(ctx, S(A.tp('L2')), [880, 420], [{ s: 'processus costiformes L1–L5', size: 14, w: 600 }, { s: 'faisceaux postérieurs', size: 13, c: 'grey', ls: 0.5 }],
      { a: k(23.3), lc: C_PS, id: 's3lPSt' });
    tag(ctx, S(A.pelN([-46, -6])), [404, 630], [{ s: 'ILIAQUE', c: C_IL, w: 700, size: 17 }, { s: 'fosse iliaque', size: 13, c: 'white', ls: 0.5 }],
      { a: k(23.4), align: 'right', lc: C_IL, id: 's3lIL' });
    tag(ctx, S(A.pelN(EMIN)), [404, 760], [{ s: 'ÉMINENCE ILIO-PUBIENNE', w: 600 }, { s: 'poulie de réflexion', size: 13, c: 'grey', ls: 0.5 }],
      { a: k(23.6), align: 'right', id: 's3lEM' });
    tag(ctx, S(LT(A)), [760, 940], [{ s: 'PETIT TROCHANTER', w: 600 }, { s: 'tendon commun ilio-psoas', size: 13, c: 'grey', ls: 0.5 }],
      { a: k(23.8), id: 's3lLT' });
  }
  function abdoLabels(ctx, F, cam) {
    const t = F.t, A = F.A, S = (p) => cam.w2s(p);
    const k = (t0) => fio(t, t0, T.abd[1], 0.3, 0.25);
    const X = 404;
    const raMid = (u, off) => S(wallOff(u, off)(A));
    tag(ctx, raMid(0.1, 5), [X, 230], [{ s: 'CARTILAGES 5–7 · XIPHOÏDE', size: 14, w: 600 }], { a: k(27.7), align: 'right', lc: C_RA, id: 's3aCX' });
    tag(ctx, raMid(0.3, 16), [X, 300], [{ s: 'LIGNE BLANCHE', size: 14, w: 600 }, { s: 'aponévroses des obliques', size: 13, c: 'grey', ls: 0.5 }], { a: k(28.35), align: 'right', id: 's3aLB' });
    tag(ctx, raMid(RA_INTER[1], 8), [X, 380], [{ s: 'INTERSECTIONS', size: 14, w: 600 }, { s: 'TENDINEUSES (3)', size: 14, w: 600 }], { a: k(27.95), align: 'right', id: 's3aIT' });
    tag(ctx, raMid(0.46, 9), [X, 466], [{ s: 'GRAND DROIT', c: C_TXT, w: 700, size: 17 }], { a: k(27.45), align: 'right', lc: C_RA, id: 's3aRA' });
    tag(ctx, raMid(RA_INTER[2], 8), [X, 530], [{ s: 'OMBILIC', size: 14, w: 600 }], { a: k(27.95), align: 'right', id: 's3aUM' });
    const eo = EO.fascicles[5], io = IO.fascicles[4];
    tag(ctx, S(vlerp(eo.path[0](A), eo.j(A), 0.62)), [X, 600], [{ s: 'OBLIQUE EXTERNE', c: mix(C_EO, 'white', 0.25), w: 700, size: 16 }, { s: 'fibres en bas et en avant', size: 13, c: 'white', ls: 0.5 }],
      { a: k(28.0), align: 'right', lc: C_EO, id: 's3aEO' });
    tag(ctx, S(vlerp(io.path[0](A), io.j(A), 0.4)), [X, 680], [{ s: 'OBLIQUE INTERNE', c: mix(C_IO, 'white', 0.2), w: 700, size: 16 }, { s: 'fibres en haut et en avant', size: 13, c: 'white', ls: 0.5 }],
      { a: k(28.5), align: 'right', lc: C_IO, id: 's3aIO' });
    tag(ctx, S(A.inguinal(0.55)), [X, 770], [{ s: 'LIGAMENT INGUINAL', size: 14, w: 600 }], { a: k(28.2), align: 'right', id: 's3aLI' });
    tag(ctx, S(A.pel('symphysisTop')), [X + 40, 830], [{ s: 'CRÊTE ET SYMPHYSE PUBIENNES', size: 14, w: 600 }], { a: k(27.65), align: 'right', lc: C_RA, id: 's3aPU' });
    // pictogrammes d'orientation des fibres (à gauche du sous-titre ; l'avant est à gauche de l'écran)
    const ea = k(28.0), ia = k(28.5);
    const wE = measure(ctx, 'fibres en bas et en avant', 13, null, 400, 0.5), wI = measure(ctx, 'fibres en haut et en avant', 13, null, 400, 0.5);
    const gE = [X - wE - 26, 617], gI = [X - wI - 26, 697];
    if (ea > 0.004) arrow(ctx, vadd(gE, [9, -9]), vadd(gE, [-9, 9]), mix(C_EO, 'white', 0.2), ea, { lw: 2.2, head: 9, noGlow: true });
    if (ia > 0.004) arrow(ctx, vadd(gI, [9, 9]), vadd(gI, [-9, -9]), mix(C_IO, 'white', 0.2), ia, { lw: 2.2, head: 9, noGlow: true });
  }

  // =========================================================================
  //  VUE SAGITTALE — mécanique
  // =========================================================================
  /** Psoas au disque L4/L5 : lignes d'action, résultante, bras de levier, composantes. */
  function psoasMech(ctx, F, cam, m) {
    const t = F.t, a = fio(t, T.mech[0], T.mech[1], 0.3, 0.3);
    if (a <= 0.004) return;
    const P = m.ps, c = cam.w2s(P.c);
    const k = (t0) => a * smooth(seg(t, t0, t0 + 0.3));
    const aL = k(24.65) * (1 - 0.65 * smooth(seg(t, 25.3, 25.7))), aR = k(24.85), aD = k(25.05), aV = k(25.25);
    // lignes d'action individuelles (origine → éminence)
    if (aL > 0.004) {
      ctx.setLineDash([2, 5]); ctx.lineWidth = 1;
      for (const l of P.lines) { ctx.strokeStyle = rgba(C_TXT, 0.75 * aL); line(ctx, cam.w2s(l.p), cam.w2s(l.q)); }
      ctx.setLineDash([]);
    }
    // résultante et bras de levier
    MU.actionLine(ctx, cam, P.L.p, P.L.u, { a: aR, len: 190, col: 'teal' });
    if (aD > 0.004) {
      MU.leverDim(ctx, cam, P.c, P.L.p, P.L.u, { a: aD, label: false });
      const N = psN();
      tag(ctx, vadd(c, [-6, -4]), [404, 372], [{ s: 'd = ' + fr(Math.abs(N.d) / 10, 1) + ' cm', c: TEAL_L, w: 700, size: 16 },
        { s: 'bras de levier ' + (N.d < 0 ? 'fléchisseur' : 'extenseur') + ' (bassin neutre)', size: 13, c: 'white', ls: 0.3 },
        { s: 'la résultante passe près du disque', size: 12, c: 'grey', ls: 0 }], { a: aD, align: 'right', lc: 'teal', id: 's3md' });
    }
    // plan du disque L4/L5 et encart de décomposition (force illustrative)
    if (aV > 0.004) {
      const tt = P.D.t;
      ctx.strokeStyle = rgba('white', 0.8 * aV); ctx.lineWidth = 1.6;
      line(ctx, cam.w2s(vadd(P.c, vmul(tt, 26))), cam.w2s(vadd(P.c, vmul(tt, -26))));
      dot(ctx, c, 5, 'bg', aV); ring(ctx, c, 5, 'white', aV, 1.5);
      drawInset(ctx, psN(), 96, 452, aV, t);
      ctx.setLineDash([3, 5]); ctx.strokeStyle = rgba('grey', 0.8 * aV); ctx.lineWidth = 1;
      line(ctx, [414, 470], vadd(c, [-7, -2])); ctx.setLineDash([]);
    }
    // message (Bogduk, Pearcy & Hadfield 1992)
    msgBox(ctx, 96, 214, 318, [
      { s: 'MOMENTS SEGMENTAIRES FAIBLES', c: C_TXT, w: 700, size: 14, ls: 1 },
      { s: 'COMPRESSION SÉVÈRE', c: 'white', w: 700, size: 14, ls: 1 },
      { s: 'CISAILLEMENT IMPORTANT', c: TEAL_L, w: 700, size: 14, ls: 1 },
      { s: 'Bogduk, Pearcy & Hadfield 1992', c: 'grey', size: 12, ls: 0 },
    ], { a: k(25.5), c: C_PS, id: 's3mB' });
  }

  /**
   * Encart « disque L4–L5 » : plateau, normale, force résultante du psoas
   * (orientation de la frame) et ses composantes compression / cisaillement.
   */
  function drawInset(ctx, P, x0, y0, a, t) {
    const w = 318, h = 228;
    ctx.fillStyle = rgba('bg', 0.9 * a); ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = rgba('grey', 0.55 * a); ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    text(ctx, 'DISQUE L4–L5 · DÉCOMPOSITION', x0 + 14, y0 + 22, { size: 12, c: 'grey', a, ls: 1.2, w: 700, id: 's3iT' });
    const O = [x0 + 214, y0 + 50], L = 92 * smooth(seg(t, 25.25, 25.75)) + 1e-3;
    const tS = P.D.t, nS = P.D.n;               // axes écran (caméra sans rotation) : t̂ vers l'avant, n̂ vers L4
    // plateau (bande translucide) et normale
    const pa = vadd(O, vmul(tS, 92)), pb = vadd(O, vmul(tS, -78));
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba('cyan', 0.18 * a); ctx.lineWidth = 12; line(ctx, pa, pb);
    ctx.strokeStyle = rgba('white', 0.8 * a); ctx.lineWidth = 1.4; line(ctx, pa, pb);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba('white', 0.5 * a); ctx.lineWidth = 1;
    line(ctx, vadd(O, vmul(nS, -L * 1.05)), vadd(O, vmul(nS, 26))); ctx.setLineDash([]);
    text(ctx, 'plateau', pb[0], pb[1] + 20, { size: 12, c: 'grey', a, align: 'right', id: 's3iP' });
    const eF = vadd(O, vmul(P.L.u, L)), eC = vadd(O, vmul(nS, -L * P.comp)), eS = vadd(O, vmul(tS, L * P.shear));
    ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba('white', 0.45 * a); ctx.lineWidth = 1;
    line(ctx, eC, eF); line(ctx, eS, eF); ctx.setLineDash([]);
    // angle entre F et la normale
    const aN = Math.atan2(-nS[1], -nS[0]), aF = Math.atan2(P.L.u[1], P.L.u[0]);
    ctx.strokeStyle = rgba(C_TXT, 0.8 * a); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(O[0], O[1], 34, Math.min(aN, aF), Math.max(aN, aF)); ctx.stroke();
    const am = (aN + aF) / 2, aA = a * smooth(seg(t, 25.65, 25.85)); // angle affiché une fois les vecteurs tracés
    text(ctx, fr(P.ang, 0) + '°', O[0] + 46 * Math.cos(am) - 4, O[1] + 46 * Math.sin(am) + 10, { size: 12, c: C_TXT, a: aA, align: 'right', id: 's3iA' });
    arrow(ctx, O, eC, 'white', a, { lw: 3, head: 12, outline: true, noGlow: true });
    arrow(ctx, O, eS, 'teal', a, { lw: 3, head: 12, outline: true, noGlow: true });
    arrow(ctx, O, eF, C_PS, a, { lw: 3.5, head: 14, outline: true, noGlow: true });
    dot(ctx, O, 4, 'white', a);
    text(ctx, 'C', eC[0] + 10, eC[1] - 2, { size: 14, c: 'white', a, w: 700, id: 's3iC' });
    text(ctx, 'S', eS[0] - 2, eS[1] - 10, { size: 14, c: TEAL_L, a, w: 700, align: 'center', id: 's3iS' });
    text(ctx, 'F', eF[0] - 12, eF[1] + 4, { size: 14, c: C_TXT, a, w: 700, align: 'right', id: 's3iF' });
    // valeurs
    const xl = x0 + 14, y1 = y0 + 162;
    compo(ctx, ['F', { s: 'psoas', sub: true }, ' = ' + frN(F_PS) + ' N'], xl, y1, { size: 14, c: C_TXT, a, w: 700, id: 's3iFv' });
    text(ctx, 'illustratif', x0 + w - 14, y1, { size: 12, c: 'grey', a, align: 'right', id: 's3iFi' });
    text(ctx, 'C = ' + frN(F_PS * P.comp) + ' N', xl, y1 + 24, { size: 14, c: 'white', a, w: 700, id: 's3iCv' });
    text(ctx, 'compression · F·cos θ', x0 + w - 14, y1 + 24, { size: 12, c: 'grey', a, align: 'right', id: 's3iCi' });
    text(ctx, 'S = ' + frN(F_PS * Math.abs(P.shear)) + ' N', xl, y1 + 48, { size: 14, c: TEAL_L, a, w: 700, id: 's3iSv' });
    text(ctx, 'cisaillement ' + (P.shear > 0 ? 'ant.' : 'post.') + ' · F·sin θ', x0 + w - 14, y1 + 48, { size: 12, c: 'grey', a, align: 'right', id: 's3iSi' });
  }

  /** Flèche de rotation du bassin autour de la hanche, PS et LL en direct, fémur fixe. */
  function pelvisTilt(ctx, F, cam, m, a, mode) {
    if (a <= 0.004) return;
    const G = F.G, A = F.A, hip = cam.w2s(A.hip());
    const ante = mode === 'ante';
    const R = 250, a0 = (ante ? 212 : 162) * DEG, a1 = (ante ? 166 : 208) * DEG;
    // axe des hanches
    ring(ctx, hip, 7, 'teal', a, 1.8); dot(ctx, hip, 2.4, 'teal', a);
    ctx.strokeStyle = rgba('teal', 0.7 * a); ctx.lineWidth = 1.2;
    line(ctx, [hip[0] - 12, hip[1]], [hip[0] + 12, hip[1]]); line(ctx, [hip[0], hip[1] - 12], [hip[0], hip[1] + 12]);
    // rayons pointillés : l'arc est centré sur l'axe des hanches
    ctx.setLineDash([2, 6]); ctx.strokeStyle = rgba('teal', 0.45 * a); ctx.lineWidth = 1;
    for (const g of [a0, a1]) line(ctx, vadd(hip, [12 * Math.cos(g), 12 * Math.sin(g)]), vadd(hip, [(R - 8) * Math.cos(g), (R - 8) * Math.sin(g)]));
    ctx.setLineDash([]);
    rotArrow(ctx, hip, R, a0, a1, ante ? C_PS : C_RA, a, { lw: 3.5 });
    const lab = [356, 722];
    text(ctx, ante ? 'ANTÉVERSION' : 'RÉTROVERSION', lab[0], lab[1], { size: 15, c: ante ? C_TXT : mix(C_RA, 'white', 0.3), a, w: 700, ls: 1.5, align: 'right', bg: 0.75, id: 's3t' + mode });
    text(ctx, frS(m.tilt, 1) + '°', lab[0], lab[1] + 24, { size: 18, c: 'white', a, w: 700, align: 'right', bg: 0.75, id: 's3tv' + mode });
    text(ctx, 'autour de l’axe des hanches', lab[0], lab[1] + 44, { size: 12, c: 'grey', a, align: 'right', bg: 0.75, id: 's3ta' + mode });
    // fémur fixe : encastrement symbolique au bas du champ
    const fb = cam.w2s(vadd(A.hip(), [0, 80]));
    ctx.strokeStyle = rgba('white', 0.75 * a); ctx.lineWidth = 2; line(ctx, [fb[0] - 34, fb[1]], [fb[0] + 34, fb[1]]);
    ctx.lineWidth = 1.2;
    for (let i = -3; i <= 3; i++) line(ctx, [fb[0] + i * 10 - 3, fb[1] + 2], [fb[0] + i * 10 - 9, fb[1] + 10]);
    text(ctx, 'FÉMUR FIXE', fb[0] - 46, fb[1] + 5, { size: 14, c: 'white', a, w: 600, ls: 1, align: 'right', bg: 0.75, id: 's3ff' + mode });
    // pente sacrée : plateau de S1, horizontale, arc
    const TA = cam.w2s(G.s1TA), TP = cam.w2s(G.s1TP), u = vnorm(vsub(TP, TA));
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba('teal', a); ctx.lineWidth = 2.6; line(ctx, vsub(TA, vmul(u, 10)), vadd(TP, vmul(u, 26)));
    ctx.setLineDash([5, 5]); ctx.strokeStyle = rgba('white', 0.7 * a); ctx.lineWidth = 1.2; line(ctx, TA, [TA[0] + 130, TA[1]]); ctx.setLineDash([]);
    const ang = Math.atan2(u[1], u[0]);
    ctx.strokeStyle = rgba('teal', a); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(TA[0], TA[1], 92, ang, 0); ctx.stroke();
    const lp = vadd(TA, [104 * Math.cos(ang / 2), 104 * Math.sin(ang / 2)]);
    text(ctx, 'PS', lp[0] + 6, lp[1] + 6, { size: 14, c: TEAL_L, a, w: 700, bg: 0.75, id: 's3ps' + mode });
    // plateau supérieur de L1 (lordose L1–S1)
    const L1 = G.lv[IX.L1], la = cam.w2s(L1.TA), lb = cam.w2s(L1.TP), v = vnorm(vsub(lb, la));
    ctx.strokeStyle = rgba('teal', a); ctx.lineWidth = 2.6; line(ctx, vsub(la, vmul(v, 10)), vadd(lb, vmul(v, 26)));
    // valeurs en direct
    const bx = 868, by = 400, bw = 300;
    ctx.fillStyle = rgba('bg', 0.86 * a); ctx.fillRect(bx, by, bw, 118);
    ctx.strokeStyle = rgba('teal', 0.45 * a); ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 117);
    ctx.fillStyle = rgba('teal', a); ctx.fillRect(bx, by, 3, 118);
    const rows = [['VERSION PELVIENNE (VP)', fr(P2.anatomy.PI_DEG - m.ss, 1)], ['PENTE SACRÉE (PS)', fr(m.ss, 1)], ['LORDOSE L1–S1', fr(m.ll, 1)]];
    rows.forEach(([l, val], i) => {
      const y = by + 32 + i * 34;
      text(ctx, l, bx + 16, y - 2, { size: 12, c: 'grey', a, ls: 1, w: 700, id: 's3bl' + i + mode });
      text(ctx, val + '°', bx + bw - 14, y + 2, { size: 21, c: i === 0 ? 'white' : TEAL_L, a, w: 700, align: 'right', id: 's3bv' + i + mode });
    });
    // repère « L1 » au bout du plateau
    tag(ctx, vadd(lb, vmul(v, 26)), [bx, 366], [{ s: 'plateau sup. de L1', size: 13, c: TEAL_L, ls: 0.3 }], { a, lc: 'teal', id: 's3L1' + mode });
    tag(ctx, vadd(TP, vmul(u, 26)), [bx, 562], [{ s: 'plateau de S1', size: 13, c: TEAL_L, ls: 0.3 }], { a, lc: 'teal', id: 's3S1' + mode });
  }

  /** Rétroversion : traction du grand droit, bras de levier, couple fléchisseur, couples pelviens. */
  function retroMech(ctx, F, cam, m) {
    const t = F.t, a = fio(t, T.retro[0], T.retro[1], 0.3, 0.3);
    if (a <= 0.004) return;
    const R = m.ra, k = (t0) => a * smooth(seg(t, t0, t0 + 0.3));
    const aV = k(29.6), aD = k(29.85), aM = k(30.05), aC = k(30.2), aB = k(30.5);
    const c = cam.w2s(R.c);
    // ligne d'action (corde pubis → thorax) et bras de levier autour de L4/L5
    MU.actionLine(ctx, cam, R.L.p, R.L.u, { a: aD, len: 230, col: 'teal' });
    if (aD > 0.004) {
      MU.leverDim(ctx, cam, R.c, R.L.p, R.L.u, { a: aD, label: false });
      const f = cam.w2s(R.foot), mid = vlerp(c, f, 0.5);
      compo(ctx, ['d', { s: 'GD', sub: true }, ' = ' + fr(Math.abs(R.d) / 10, 1) + ' cm'], mid[0], mid[1] - 14, { size: 16, c: TEAL_L, a: aD, w: 700, bg: 0.75, align: 'center', id: 's3rd' });
    }
    // couple fléchisseur (antagoniste des érecteurs) autour de L4/L5
    if (aM > 0.004) {
      MU.momentArc(ctx, c, 40, 60, { a: aM, col: 'teal', start: -Math.PI / 2 + 0.25, Mref: 80, lw: 2.6 });
      dot(ctx, c, 5, 'bg', aM); ring(ctx, c, 5, 'teal', aM, 1.6);
      tag(ctx, vadd(c, [40, -6]), [880, 600], [{ s: 'COUPLE FLÉCHISSEUR', c: TEAL_L, w: 700, size: 14 }, { s: 'antagoniste des érecteurs', size: 13, c: 'white', ls: 0.3 }],
        { a: aM, lc: 'teal', id: 's3rM' });
    }
    // traction du grand droit sur le pubis (vers le haut)
    if (aV > 0.004) {
      const p = cam.w2s(R.pub), e = vadd(p, vmul(vnorm(cam.w2s(vadd(R.pub, R.L.u)).map((v, i) => v - p[i])), 84));
      arrow(ctx, p, e, C_RA, aV, { lw: 4, head: 16, outline: true });
      tag(ctx, vlerp(p, e, 0.55), [356, 806], [{ s: 'TRACTION DU GRAND DROIT', c: C_TXT, w: 700, size: 14 }, { s: 'sur le pubis, vers le haut', size: 13, c: 'white', ls: 0.3 }],
        { a: aV, align: 'right', lc: C_RA, id: 's3rT' });
    }
    // couples de forces autour de l'axe des hanches
    if (aC > 0.004) {
      const A = F.A, S = (q) => cam.w2s(q);
      // rétroversion : ischio-jambiers (non détaillés) sur la tubérosité ischiatique, vers le bas
      const it = S(A.pel('ischialTuber'));
      arrow(ctx, it, [it[0] + 4, it[1] + 44], 'white', 0.85 * aC, { lw: 3, head: 12, dash: [5, 4], outline: true });
      tag(ctx, [it[0] + 3, it[1] + 22], [760, 972], [{ s: 'ischio-jambiers (non détaillés)', size: 13, c: 'white', ls: 0.3 }], { a: aC, lc: 'grey', id: 's3rH' });
      // antéversion (opposée) : érecteurs sur la crête sacrée / EIPS (vers le haut), psoas-iliaque (vers le bas, en avant de la hanche)
      const ps = S(A.pel('PSIS'));
      arrow(ctx, ps, [ps[0] + 6, ps[1] - 48], C_ES, 0.75 * aC, { lw: 2.6, head: 11, dash: [5, 4], outline: true });
      tag(ctx, [ps[0] + 4, ps[1] - 26], [880, 700], [{ s: 'érecteurs', size: 13, c: mix(C_ES, 'white', 0.25), ls: 0.3 }], { a: 0.9 * aC, lc: C_ES, id: 's3rE' });
      const em = S(A.pelN([-46, -6]));   // fosse iliaque (iliaque) ; l'EIAI est l'origine du droit fémoral
      arrow(ctx, em, [em[0] + 10, em[1] + 46], C_IL, 0.75 * aC, { lw: 2.6, head: 11, dash: [5, 4], outline: true });
      tag(ctx, [em[0] + 5, em[1] + 24], [404, 668], [{ s: 'psoas-iliaque', size: 13, c: C_IL, ls: 0.3 }], { a: 0.9 * aC, align: 'right', lc: C_IL, id: 's3rP' });
      // légende des deux couples
      msgBox(ctx, 868, 768, 300, [
        { s: 'COUPLES AUTOUR DES HANCHES', c: 'white', w: 700, size: 13, ls: 1 },
        { s: 'rétroversion : abdominaux', c: mix(C_RA, 'white', 0.3), size: 13 },
        { s: '  + ischio-jambiers', c: 'white', size: 13 },
        { s: 'antéversion : psoas-iliaque', c: C_IL, size: 13 },
        { s: '  + érecteurs', c: mix(C_ES, 'white', 0.25), size: 13 },
      ], { a: aC, c: 'teal', id: 's3rL' });
    }
    // message
    msgBox(ctx, 868, 214, 300, [
      { s: 'VERROUILLAGE DU BASSIN', c: 'white', w: 700, size: 14, ls: 1 },
      { s: 'EN RÉTROVERSION', c: 'white', w: 700, size: 14, ls: 1 },
      { s: 'pente sacrée et lordose ↓', c: TEAL_L, size: 13 },
    ], { a: aB, c: C_RA, id: 's3rB' });
  }

  function anteMessage(ctx, F, a) {
    msgBox(ctx, 868, 214, 300, [
      { s: 'EFFET LORDOSANT INDIRECT', c: 'white', w: 700, size: 14, ls: 1 },
      { s: 'fémur fixe → antéversion', c: C_TXT, size: 14 },
      { s: 'pelvienne → PS et lordose ↑', c: TEAL_L, size: 14 },
    ], { a, c: C_PS, id: 's3aB' });
  }

  // =========================================================================
  //  PANNEAU
  // =========================================================================
  function chip(ctx, x, y, col, a) { ctx.fillStyle = rgba(col, a); ctx.fillRect(x, y - 10, 10, 10); }
  function sep(ctx, x, y, w, a) { ctx.strokeStyle = rgba('grey', 0.4 * a); ctx.lineWidth = 1; line(ctx, [x, y], [x + w, y]); }
  /** Ligne de valeur : clé (composée), libellé gris, valeur à droite, unité. */
  function valRow(ctx, x, y, key, label, val, unit, col, a, id) {
    compo(ctx, key, x, y, { size: 16, c: col, a, w: 700, id: id + 'k' });
    text(ctx, label, x + 70, y - 1, { size: 12, c: 'grey', a, ls: 0.6, id: id + 'l' });
    text(ctx, val, x + 452, y, { size: 19, c: 'white', a, align: 'right', w: 600, id: id + 'v' });
    if (unit) text(ctx, unit, x + 460, y, { size: 13, c: 'grey', a, id: id + 'u' });
  }

  function panelPsoas(ctx, F, a, m) {
    const P = F.panel, t = F.t, x = P.PX + 30, Wd = P.PW - 60;
    P.header(ctx, 'PSOAS · ILIAQUE', 'fléchisseurs de la hanche', a, 's3p1', C_TXT);
    let y = P.PY + 96;
    const ra = (t0) => a * smooth(seg(t, t0, t0 + 0.35));
    y += P.attachRow(ctx, 'ORIGINES · PSOAS', 'faces latérales des corps et des disques T12–L5 · processus costiformes L1–L5', x, y, ra(22.7), { id: 's3p1o' }) + 8;
    y += P.attachRow(ctx, 'ORIGINE · ILIAQUE', 'fosse iliaque (2/3 supérieurs), lèvre interne de la crête iliaque', x, y, ra(23.1), { id: 's3p1i' }) + 8;
    y += P.attachRow(ctx, 'TERMINAISON', 'petit trochanter : tendon commun ilio-psoas, réfléchi sur l’éminence ilio-pubienne', x, y, ra(23.5), { id: 's3p1t' }) + 6;
    // ---- mécanique au disque L4/L5
    const ma = ra(24.75);
    if (ma > 0.004) {
      const P_ = psN();
      sep(ctx, x, y, Wd, ma); y += 22;
      text(ctx, 'AU DISQUE L4–L5 · BASSIN NEUTRE · GÉOMÉTRIE', x, y, { size: 12, c: 'grey', a: ma, ls: 1.3, w: 700, id: 's3p1m' });
      y += 30;
      valRow(ctx, x, y, ['d'], 'bras de levier de la résultante', fr(Math.abs(P_.d) / 10, 1), 'cm', TEAL_L, ma, 's3p1d');
      y += 20;
      let dmin = Infinity, dmax = -Infinity;
      for (const l of P_.lines) { dmin = Math.min(dmin, l.d); dmax = Math.max(dmax, l.d); }
      text(ctx, P_.lines.length + ' faisceaux : de ' + fr(Math.abs(dmin) / 10, 1) + ' cm (fléchisseur) à ' + fr(Math.abs(dmax) / 10, 1) + ' cm (extenseur)', x + 70, y, { size: 12, c: 'grey', a: ma, id: 's3p1dr' });
      y += 28;
      valRow(ctx, x, y, ['M'], 'F·d ' + (P_.d < 0 ? 'fléchisseur' : 'extenseur') + ' (F = ' + frN(F_PS) + ' N)', fr(Math.abs(P_.M), 1), 'N·m', TEAL_L, ma, 's3p1M');
      y += 30;
      const bars = [['COMPRESSION', 'perpendiculaire au plateau', P_.comp, 'white'], ['CISAILLEMENT', (P_.shear > 0 ? 'antérieur' : 'postérieur') + ' · plan du plateau', Math.abs(P_.shear), TEAL_L]];
      bars.forEach(([l, s, v, col], i) => {
        const yy = y + i * 40;
        const lw = text(ctx, l, x, yy, { size: 13, c: 'white', a: ma, ls: 0.8, w: 700, id: 's3p1bl' + i });
        text(ctx, s, x + lw + 10, yy, { size: 12, c: 'grey', a: ma, id: 's3p1bs' + i });
        text(ctx, fr(v, 2) + ' F', x + 380, yy, { size: 15, c: col, a: ma, w: 700, align: 'right', id: 's3p1bv' + i });
        text(ctx, frN(F_PS * v) + ' N', x + Wd, yy, { size: 15, c: 'white', a: ma, w: 600, align: 'right', id: 's3p1bn' + i });
        ctx.fillStyle = rgba('grey', 0.22 * ma); ctx.fillRect(x, yy + 8, Wd, 7);
        ctx.fillStyle = rgba(i ? 'teal' : 'white', 0.85 * ma); ctx.fillRect(x, yy + 8, Wd * clamp(v) * smooth(seg(t, 25.1, 25.6)), 7);
      });
      y += 80;
      y += P.wrap(ctx, 'F = ' + frN(F_PS) + ' N : force illustrative (un psoas). Ligne d’action : droite origine → éminence ilio-pubienne, résultante des faisceaux qui enjambent L4–L5.', x, y, Wd, { size: 12, c: 'grey', a: ma, id: 's3p1n' });
      y += 4;
      y += P.wrap(ctx, 'Moments segmentaires faibles, compression sévère, cisaillement important : Bogduk, Pearcy & Hadfield 1992 · doi:10.1016/0268-0033(92)90024-X', x, y, Wd, { size: 12, c: C_TXT, a: ra(25.5), id: 's3p1c' });
    }
    // ---- effet indirect sur la lordose
    const ia = ra(25.4);
    if (ia > 0.004) {
      y += 8; sep(ctx, x, y, Wd, ia); y += 22;
      text(ctx, 'EFFET LORDOSANT INDIRECT · EN DIRECT', x, y, { size: 12, c: 'grey', a: ia, ls: 1.3, w: 700, id: 's3p1e' });
      y += 28;
      const cols = [['version pelvienne', fr(P2.anatomy.PI_DEG - m.ss, 1)], ['pente sacrée', fr(m.ss, 1)], ['lordose L1–S1', fr(m.ll, 1)]];
      cols.forEach(([l, v], i) => {
        const xx = x + i * 176;
        text(ctx, l, xx, y, { size: 12, c: 'grey', a: ia, id: 's3p1el' + i });
        text(ctx, v + '°', xx, y + 26, { size: 22, c: i ? TEAL_L : 'white', a: ia, w: 700, id: 's3p1ev' + i });
      });
    }
  }

  function panelAbdo(ctx, F, a, m) {
    const P = F.panel, t = F.t, x = P.PX + 30, Wd = P.PW - 60;
    P.header(ctx, 'SANGLE ABDOMINALE', 'fléchisseurs du tronc', a, 's3p2', C_TXT);
    let y = P.PY + 96;
    const ra = (t0) => a * smooth(seg(t, t0, t0 + 0.35));
    const mus = [
      [C_RA, 'GRAND DROIT', 'crête et symphyse pubiennes → cartilages costaux 5–7 et processus xiphoïde ; 3 intersections tendineuses', null, 27.3],
      [C_EO, 'OBLIQUE EXTERNE', 'face externe des côtes 5–12 → moitié antérieure de la crête iliaque, ligament inguinal, ligne blanche', 'fibres en bas et en avant', 27.6],
      [C_IO, 'OBLIQUE INTERNE', 'FTL, 2/3 antérieurs de la crête iliaque, ligament inguinal → bord inférieur des côtes 10–12, ligne blanche', 'fibres en haut et en avant', 28.1],
    ];
    for (const [col, name, ins, dir, t0] of mus) {
      const ca = ra(t0);
      chip(ctx, x, y, col, ca);
      const w = text(ctx, name, x + 18, y, { size: 15, c: mix(col, 'white', 0.25), a: ca, w: 700, ls: 1.2, id: 's3p2n' + name });
      if (dir) text(ctx, dir, x + 30 + w, y, { size: 12, c: 'grey', a: ca, id: 's3p2d' + name });
      y += 22 + P.wrap(ctx, ins, x + 18, y + 22, Wd - 18, { size: 14, c: 'white', a: ca, id: 's3p2v' + name }) + 8;
    }
    y += P.wrap(ctx, 'Les obliques sont les principaux rotateurs du tronc : Macintosh, Pearcy & Bogduk 1993 · doi:10.1111/j.1445-2197.1993.tb00520.x', x, y, Wd, { size: 12, c: 'grey', a: ra(28.4), id: 's3p2c' });
    // ---- rétroversion, couples pelviens
    const ma = ra(29.6);
    if (ma > 0.004) {
      const R = m.ra;
      y += 8; sep(ctx, x, y, Wd, ma); y += 22;
      text(ctx, 'RÉTROVERSION · CALCULÉ SUR LA GÉOMÉTRIE', x, y, { size: 12, c: 'grey', a: ma, ls: 1.3, w: 700, id: 's3p2m' });
      y += 30;
      valRow(ctx, x, y, ['d', { s: 'GD', sub: true }], 'bras de levier du grand droit · L4–L5', fr(Math.abs(R.d) / 10, 1), 'cm', TEAL_L, ma, 's3p2d');
      y += 28;
      valRow(ctx, x, y, ['d', { s: 'PS', sub: true }], 'psoas, même disque (bassin neutre)', fr(Math.abs(psN().d) / 10, 1), 'cm', C_TXT, ma, 's3p2r');
      y += 28;
      valRow(ctx, x, y, ['d', { s: 'H', sub: true }], 'grand droit · axe des hanches', fr(Math.abs(R.dHip) / 10, 1), 'cm', TEAL_L, ma, 's3p2h');
      y += 26;
      y += P.wrap(ctx, 'Ligne d’action : pubis → paroi en regard de L4–L5. Force sur le tronc dirigée vers le pubis → couple fléchisseur ; sur le bassin, vers le haut → rétroversion.', x, y, Wd, { size: 12, c: 'grey', a: ma, id: 's3p2n2' });
      const ia = ra(29.9);
      y += 10;
      const cols = [['version pelvienne', fr(P2.anatomy.PI_DEG - m.ss, 1)], ['pente sacrée', fr(m.ss, 1)], ['lordose L1–S1', fr(m.ll, 1)]];
      cols.forEach(([l, v], i) => {
        const xx = x + i * 176;
        text(ctx, l, xx, y + 10, { size: 12, c: 'grey', a: ia, id: 's3p2el' + i });
        text(ctx, v + '°', xx, y + 36, { size: 22, c: i ? TEAL_L : 'white', a: ia, w: 700, id: 's3p2ev' + i });
      });
    }
  }

  // =========================================================================
  //  ENREGISTREMENT
  // =========================================================================
  P2.scenes.push({
    id: 's3',
    state(F) {
      const t = F.t;
      if (t >= T.v0 && t <= T.v1) mechAll(F);
    },
    sag(ctx, F, cam) {
      const t = F.t;
      if (t < T.v0 || t > T.v1) return;
      const m = mechAll(F);
      // psoas / iliaque : pleine opacité jusqu'à 27,0 puis atténués (paroi abdominale), sortie avant 32,0
      const aPS = (1 - 0.72 * smooth(seg(t, 26.95, 27.5))) * (1 - smooth(seg(t, 31.6, 31.98)));
      const actPS = smooth(seg(t, 24.6, 25.0)) * (1 - smooth(seg(t, 26.8, 27.3)));
      drawIliopsoas(ctx, F, cam, aPS, actPS);
      drawAbdominals(ctx, F, cam);
      psoasLabels(ctx, F, cam);
      abdoLabels(ctx, F, cam);
      psoasMech(ctx, F, cam, m);
      const aA = fio(t, T.ante[0], T.ante[1], 0.3, 0.3);
      pelvisTilt(ctx, F, cam, m, aA, 'ante');
      anteMessage(ctx, F, fio(t, 25.7, T.ante[1], 0.3, 0.3));
      retroMech(ctx, F, cam, m);
      pelvisTilt(ctx, F, cam, m, fio(t, 29.65, T.retro[1], 0.3, 0.3), 'retro');
    },
    panel(ctx, F, pa) {
      const t = F.t;
      if (t < T.p1[0] || t > T.p2[1]) return;
      const m = mechAll(F);
      const a1 = pa * fio(t, T.p1[0], T.p1[1], 0.3, 0.3);
      if (a1 > 0.004) panelPsoas(ctx, F, a1, m);
      const a2 = pa * fio(t, T.p2[0] + 0.05, T.p2[1], 0.3, 0.3);
      if (a2 > 0.004) panelAbdo(ctx, F, a2, m);
    },
  });
  // accès en lecture (tests)
  P2.s3 = { mechPsoas, mechRectus, PS_BODY, PS_TP, PS_CROSS, IL, RA, EO, IO, F_PS, T };
})(typeof window !== 'undefined' ? window : globalThis);
