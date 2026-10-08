/* =============================================================================
 *  partie2/scene4.js — SCÈNE 4 (32–40 s) : ÉQUILIBRE DES COUPLES
 *  Synthèse dynamique : haubans musculaires, cocontraction, système actif de Panjabi.
 *
 *  Vue sagittale (32,0 → 39,4 s, puis fondu global du framework) :
 *   - 32,0–33,9 : tous les groupes musculaires figurés comme des HAUBANS
 *     (érecteurs ambre, multifide et transverse cobalt, grand droit et psoas
 *     cramoisi), dessinés avec P2.muscles.drawMuscle ;
 *   - 33,0–37,0 : antéflexion 30° + charge axiale 20 kg (F.S.lean, F.S.load) :
 *     équilibre des moments au disque L4/L5, CALCULÉ sur la géométrie de la
 *     frame (A.disc, A.comHAT, A.shoulder, lignes d'action des haubans) ;
 *     scénario 1 sans cocontraction, scénario 2 avec cocontraction des
 *     abdominaux (niveau illustratif signalé) ;
 *   - 37,0–39,4 : système de stabilisation de Panjabi (passif / actif / neural).
 *  Panneau (32,0 → 39,4, blocs séquentiels) : mât et haubans ; équilibre des
 *  couples (valeurs en direct) ; graphe charge-déplacement L4–L5 (Wilke 1995).
 *
 *  Fonctions pures : aucun état entre frames (seuls des caches mémoïsés de
 *  fonctions pures de la posture sont conservés).
 * ========================================================================== */
(function (root) {
  'use strict';
  const SC = root.SpineCore, P2 = root.P2, MU = P2.muscles;
  const {
    clamp, lerp, seg, smooth, E, fio, vadd, vsub, vmul, vlen, vnorm, vlerp, vdot, perp,
    rgba, mix, text, measure, line, arrow, dot, ring, polyPath, smoothPath, roundedPath, SANS, LV, IX,
  } = SC;

  // ------------------------------------------------------------------ fenêtres temporelles (s)
  const T = {
    s0: 32.0,                   // début du contenu sagittal (la scène 3 a terminé à 32,0)
    lab: [32.45, 33.85],        // étiquettes des haubans
    mech: [33.0, 36.95],        // équilibre des couples (dessin)
    coB: 35.2,                  // bascule scénario 1 → scénario 2 (cocontraction)
    pj: [37.05, 41],            // système de Panjabi (dessin) — suit le fondu global (39,4 → 40)
    p1: [32.1, 33.25], p2: [33.3, 36.95], p3: [37.0, 41],   // bloc 1 : 0,2 s après la fin du panneau de la scène 3 (31,9)
  };

  // ------------------------------------------------------------------ constantes
  const W_HAT = 412;     // N : tête-bras-tronc (60 % de 70 kg), appliqué en A.comHAT() (SPEC §4)
  const GRAV = 9.81;     // m/s²
  const K_CO = 0.15;     // M_ABD = 15 % de M_ES : niveau de cocontraction ILLUSTRATIF (moment antagoniste / agoniste, signalé à l'écran)
  const MF_SHARE = 0.2;  // multifide ≈ 20 % du moment extenseur en L4–L5 (SPEC §7, Bogduk et al. 1992)
  const LEAN_REF = 30, LOAD_REF = 20; // posture de référence des jauges (pic de la séquence)

  // ------------------------------------------------------------------ formats
  const NBSP = ' ';
  const fr = (v, d) => SC.fmt(v, d).replace('.', ',');
  const frN = (v) => { const r = Math.round(v); return (r < 0 ? SC.MINUS : '') + String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); };
  const frS = (v, d) => SC.fmtS(v, d).replace('.', ',').trim();
  /** Espaces insécables avant les unités et après ≈ / − (pas de coupure « 85 | % » dans les textes à la ligne). */
  const nb = (s) => s.replace(/(\d) (%|N·m|N\b|kg|cm|mm)/g, '$1' + NBSP + '$2').replace(/(≈|−|à) (\d)/g, '$1' + NBSP + '$2').replace(/ et al\./g, NBSP + 'et' + NBSP + 'al.');

  /** Texte composé avec indices : parts = ['F', {s:'ES', sub:true}, ' = 1 200 N'] ; un fond unique optionnel. */
  function compo(ctx, parts, x, y, o) {
    const a = o.a; if (a <= 0.004) return 0;
    const size = o.size || 16;
    const P = parts.map((p) => (typeof p === 'string' ? { s: p } : Object.assign({}, p)));
    const ws = P.map((p) => {
      p.sz = p.sub ? Math.max(11, Math.round(size * 0.68)) : size;
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
  /** Étiquette reliée par une ligne de rappel coudée (fond 0,75, ids stables). */
  function tag(ctx, anchor, at, lines, o) {
    const a = o.a; if (a <= 0.004) return;
    const size = o.size || 15, align = o.align || 'left', side = align === 'left' ? -1 : 1, ly = at[1] - size * 0.35;
    ctx.strokeStyle = rgba(o.lc || 'grey', a * 0.9); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(at[0] + side * 18, ly); ctx.lineTo(at[0] + side * 6, ly); ctx.stroke();
    dot(ctx, anchor, 3, o.lc || 'grey', a);
    let y = at[1];
    lines.forEach((L, i) => {
      text(ctx, L.s, at[0], y, { size: L.size || size, c: L.c || 'white', a, align, ls: L.ls == null ? 1 : L.ls, w: L.w, bg: 0.75, id: o.id + i });
      y += (L.size || size) + 6;
    });
  }

  /** Étiquette composée (symbole à indice + valeur) reliée par une ligne de rappel, sous-titre optionnel. */
  function tagCompo(ctx, anchor, at, parts, sub, o) {
    const a = o.a; if (a <= 0.004) return;
    const col = o.c || 'teal', ly = at[1] - 5;
    ctx.strokeStyle = rgba(col, a * 0.8); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(at[0] - 18, ly); ctx.lineTo(at[0] - 6, ly); ctx.stroke();
    dot(ctx, anchor, 3, col, a);
    compo(ctx, parts, at[0], at[1], { size: 16, c: col, a, w: 700, bg: 0.75, id: o.id });
    if (sub) text(ctx, sub, at[0], at[1] + 21, { size: 13, c: 'white', a, ls: 0.5, bg: 0.75, id: o.id + 's' });
  }

  // =========================================================================
  //  HAUBANS : chemins d'ancrages (repères vertébraux A.v en mm, x postérieur)
  // =========================================================================
  const V = (n, x, y) => (A) => A.v(n, [x, y]);
  const RA = (i) => (A) => A.ribAngle(i);
  /** Point de la peau abdominale (interpolé sur G.wall.skin), u = 0 xiphoïde → 1 symphyse. */
  function skinAt(G, u) { const p = G.wall.skin, f = clamp(u) * (p.length - 1), k = Math.min(p.length - 2, Math.floor(f)); return vlerp(p[k], p[k + 1], f - k); }
  /** Point dans l'épaisseur de la paroi : f = 0 face profonde → 1 peau. */
  const RW = (u, f) => (A) => vlerp(A.wall(u), skinAt(A.G, u), f);

  // ÉRECTEURS (ambre) : bassin / sacrum → angles costaux et thorax. Les 4 premiers faisceaux
  // (iliocostal des lombes et longissimus du thorax, parties thoraciques) enjambent L4/L5 :
  // leur ligne d'action = segment [origine → point de passage en regard de L2] (loa [0, 1]).
  const ES_LOW = [
    { path: [(A) => A.crest(0.84), V('L2', 64, 0), V('T12', 52, 4), RA(11)], w: 7, fibers: 4, loa: [0, 1] },
    { path: [(A) => A.crest(0.9), V('L2', 67, 0), V('T12', 55, 2), V('T10', 54, 6), RA(9)], w: 7, fibers: 4, loa: [0, 1] },
    { path: [(A) => A.sac(-45, 12), V('L2', 62, 0), V('T12', 38, 0), V('T9', 32, 0), (A) => A.rib(7, 0.3)], w: 7, fibers: 4, loa: [0, 1] },
    { path: [(A) => A.sac(-25, 12), V('L2', 66, 0), V('T11', 40, -2), V('T8', 33, 0), V('T6', 30, 0), (A) => A.rib(4, 0.3)], w: 6, fibers: 3, loa: [0, 1] },
  ];
  const ES_UP = [ // iliocostal du thorax : angles costaux inférieurs → angles supérieurs
    { path: [RA(10), V('T8', 54, 6), V('T6', 50, 6), RA(5)], w: 5, fibers: 3 },
    { path: [RA(7), V('T5', 50, 6), V('T3', 44, 4), RA(2)], w: 5, fibers: 3 },
  ];
  const ES = { group: 'erector', color: 'amber', tendon: 0.1, fascicles: [...ES_LOW, ...ES_UP] };
  const ES_THOR = { fascicles: ES_LOW };

  // MULTIFIDE (cobalt) : courts faisceaux segmentaires, épineuses → processus mamillaires 2 niveaux plus bas, sacrum
  const MF = { group: 'deep', color: 'cobalt', tendon: 0.12, fascicles: [
    { path: [(A) => A.spinInf('L1', 0.3), (A) => A.mam('L3')], w: 4, fibers: 3 },
    { path: [(A) => A.spinInf('L2', 0.3), (A) => A.mam('L4')], w: 4, fibers: 3 },
    { path: [(A) => A.spinInf('L3', 0.3), (A) => A.mam('L5')], w: 4.5, fibers: 3 },
    { path: [(A) => A.spinInf('L4', 0.3), (A) => A.sac(-14, 2)], w: 5, fibers: 3 },
    { path: [(A) => A.spinInf('L5', 0.3), (A) => A.sac(-38, 2)], w: 5, fibers: 3 },
  ] };

  // GRAND DROIT (cramoisi) : crête et symphyse pubiennes → cartilages 5–7 ; ligne d'action en regard de L4/L5 :
  // segment [pubis → point de la paroi à hauteur de l'ombilic] (loa [0, 2]).
  const RECT = { group: 'flexor', color: 'crimson', tendon: 0.08, fascicles: [
    { path: [(A) => A.pel('symphysisTop'), RW(0.86, 0.45), RW(0.62, 0.5), RW(0.36, 0.5), RW(0.12, 0.45), (A) => A.cart(7)], w: 7, fibers: 4, loa: [0, 2] },
    { path: [(A) => vlerp(A.pel('symphysisTop'), A.pel('pubicTubercle'), 0.5), RW(0.86, 0.62), RW(0.62, 0.66), RW(0.36, 0.64), RW(0.1, 0.58), (A) => A.cart(5)], w: 6, fibers: 3, loa: [0, 2] },
  ] };
  // PSOAS (cramoisi) : faces latérales T12–L5 → éminence ilio-pubienne (réflexion) → petit trochanter
  const PSOAS = { group: 'flexor', color: 'crimson', tendon: 0.1, fascicles: [
    { path: [V('T12', -6, 6), V('L2', -10, 0), V('L4', -16, 2), V('L5', -26, 16), (A) => vadd(A.pel('iliopubic'), [2, -6]), (A) => A.fem('lesserTrochanter')], w: 11, fibers: 5 },
  ] };
  // TRANSVERSE (cobalt) : bande de la paroi, fibres horizontales (ceinture) entre la paroi et l'arrière de la cavité
  const TA_LV = ['L1', 'L2', 'L3', 'L4', 'L5'];
  const TA_U = (() => { // u de la paroi à la hauteur de chaque corps (posture neutre ; fonction pure, calculée une fois)
    const G0 = P2.anatomy.sagittal({ pelvicTilt: 0, lumbarFlex: 0, hipFlex: 0 }), A0 = P2.anatomy.anchors(G0);
    return TA_LV.map((n) => {
      const y = A0.body(n)[1]; let lo = 0, hi = 1;
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (A0.wall(m)[1] < y) lo = m; else hi = m; }
      return (lo + hi) / 2;
    });
  })();
  const TRA = { group: 'deep', color: 'cobalt', tendon: 0.06, fascicles: TA_LV.map((n, i) => {
    const D = LV[IX[n]].D;
    return { path: [V(n, -(D / 2 + 16), 0), (A) => vlerp(A.v(n, [-(D / 2 + 16), 0]), A.wall(TA_U[i]), 0.5), (A) => A.wall(TA_U[i])], w: 9, fibers: 3 };
  }) };

  // =========================================================================
  //  MÉCANIQUE : équilibre des moments au disque L4/L5 (fonction pure de A, G, charge)
  // =========================================================================
  /**
   * M_req = W·d_G + P·d_L (bras de levier horizontaux au centre du disque L4/L5) ;
   * F_ES·d_ES = M_req + F_ABD·d_ABD avec M_ABD = F_ABD·d_ABD = k·M_ES  →  M_ES = M_req / (1 − k) ;
   * compression C = −(W + P + F_ES·u_ES + F_ABD·u_ABD)·n (n : normale au plan discal, vers L4).
   */
  function mech(A, G, loadKg) {
    const c = A.disc('L4'), g = A.comHAT(), s = A.shoulder();
    const P = loadKg * GRAV;
    const dG = c[0] - g[0], dL = c[0] - s[0];                // mm (> 0 : en avant du disque → moment fléchissant)
    const M = (W_HAT * dG + P * dL) / 1000;                  // N·m
    const L = MU.resultantLine(A, ES_THOR), La = MU.resultantLine(A, RECT);
    const dES = Math.abs(MU.momentArm(c, L.p, L.u)), dABD = Math.abs(MU.momentArm(c, La.p, La.u));
    const uES = L.u[1] > 0 ? L.u : vmul(L.u, -1);            // traction des érecteurs sur le tronc : vers le bassin
    const uABD = La.u[1] > 0 ? La.u : vmul(La.u, -1);        // traction du grand droit sur le thorax : vers le pubis
    const D = SC.discFrame(G);
    const scen = (k) => {
      const MES = Math.max(0, M) / (1 - k), MABD = k * MES;      // N·m
      const FES = (MES * 1000) / dES, FABD = (MABD * 1000) / dABD;
      const Fv = vadd(vadd([0, W_HAT + P], vmul(uES, FES)), vmul(uABD, FABD));
      return { k, FES, FABD, MES, MABD, C: -vdot(Fv, D.n), S: vdot(Fv, D.t), stiff: FES + FABD };
    };
    const A1 = scen(0), B1 = scen(K_CO);
    return {
      c, g, s, P, load: loadKg, dG, dL, M, L, La, dES, dABD, uES, uABD, D, A: A1, B: B1, scen,
      footES: MU.foot(c, L.p, L.u), footABD: MU.foot(c, La.p, La.u),
      dC: (B1.C / A1.C - 1) * 100, dF: (B1.FES / Math.max(1e-6, A1.FES) - 1) * 100, alpha: G.posture.trunk,
    };
  }
  // Référence des jauges : pic de la séquence (30°, 20 kg, scénario 2) — fonction pure, mémoïsée.
  let REF = null;
  function ref() {
    if (!REF) {
      const G = P2.anatomy.sagittal({ pelvicTilt: 0, lumbarFlex: 0.6 * LEAN_REF, hipFlex: 0.4 * LEAN_REF });
      const m = mech(P2.anatomy.anchors(G), G, LOAD_REF);
      REF = { MES: m.B.MES, FES: m.B.FES, stiff: m.B.stiff, C: m.B.C };
    }
    return REF;
  }
  /** Niveau de cocontraction appliqué sur le dessin (0 → K_CO à partir de 35,2 s). */
  const kcAt = (t) => K_CO * smooth(seg(t, T.coB, T.coB + 0.4));

  // =========================================================================
  //  VUE SAGITTALE
  // =========================================================================
  /** Activations des haubans (0..1) — pilotées par les moments calculés ; transverse : qualitatif. */
  function activations(F, m) {
    const t = F.t, R = ref();
    const ma = fio(t, T.mech[0], T.mech[1] + 0.1, 0.3, 0.4);
    let es = 0, abd = 0, tra = 0.12;
    if (m && ma > 0.004) {
      const sc = m.scen(kcAt(t));
      es = clamp(sc.MES / R.MES) * ma; abd = clamp(sc.MABD / (0.5 * R.MES)) * ma;
      tra = 0.12 + (0.18 * smooth(seg(m.load, 0, LOAD_REF)) + 0.35 * kcAt(t) / K_CO) * ma;
    }
    const pj = fio(t, T.pj[0], T.pj[1], 0.4, 0.1);  // tonus de fond pendant le bloc Panjabi
    return { es: Math.max(es, 0.3 * pj), mf: Math.max(es, 0.45 * pj), abd: Math.max(abd, 0.15 * pj), ps: 0.1 + 0.1 * pj, tra: Math.max(tra, 0.3 * pj) };
  }

  function drawHaubans(ctx, F, cam, m) {
    const t = F.t, A = F.A;
    const g = (t0) => E.io(seg(t, t0, t0 + 0.55));
    const ac = activations(F, m);
    const mech = fio(t, T.mech[0] + 0.3, T.mech[1], 0.4, 0.4);   // focus sur les haubans du plan sagittal
    const att = 0.8 * fio(t, 32.5, 34.0, 0.3, 0.4);              // points d'insertion (bloc 1)
    const items = [
      [TRA, g(32.35), ac.tra, 1 - 0.35 * mech],
      [PSOAS, g(32.25), ac.ps, 1 - 0.45 * mech],
      [RECT, g(32.15), ac.abd, 1],
      [MF, g(32.08), ac.mf, 1 - 0.2 * mech],
      [ES, g(32.0), ac.es, 1],
    ];
    for (const [spec, grow, act, a] of items) {
      if (grow <= 0) continue;
      MU.drawMuscle(ctx, cam, A, spec, { grow, act, a, t });
      if (att > 0.004) MU.drawAttachments(ctx, cam, A, spec, { a: att * smooth(seg(grow, 0.8, 1)) });
    }
    // intersections tendineuses du grand droit (3, au-dessus de l'ombilic)
    const ia = 0.7 * smooth(seg(g(32.15), 0.9, 1));
    if (ia > 0.004) {
      ctx.strokeStyle = rgba('white', ia); ctx.lineWidth = 1.4;
      for (const u of [0.18, 0.32, 0.46]) line(ctx, cam.w2s(RW(u, 0.25)(A)), cam.w2s(RW(u, 0.85)(A)));
    }
  }

  /** Charge axiale : barre de 20 kg vue en bout (manchon Ø 50 mm, bague Ø 80 mm, disque Ø 160 mm). */
  function drawLoad(ctx, cam, A, a, kg) {
    if (a <= 0.004) return;
    const c = cam.w2s(A.shoulder()), sc = cam.sc, k = smooth(seg(kg, 0, 10));
    const rP = 80 * sc, rC = 40 * sc, rS = 25 * sc;
    ctx.fillStyle = rgba('bg', 0.55 * a); ctx.beginPath(); ctx.arc(c[0], c[1], rP, 0, Math.PI * 2); ctx.fill();
    ring(ctx, c, rP, 'white', 0.55 * a * k, 1.6);
    ring(ctx, c, rP - 5, 'white', 0.25 * a * k, 1);
    ctx.fillStyle = rgba('grey', 0.35 * a); ctx.beginPath(); ctx.arc(c[0], c[1], rC, 0, Math.PI * 2); ctx.fill();
    ring(ctx, c, rC, 'white', 0.8 * a, 1.6);
    ctx.fillStyle = rgba('white', 0.18 * a); ctx.beginPath(); ctx.arc(c[0], c[1], rS, 0, Math.PI * 2); ctx.fill();
    ring(ctx, c, rS, 'white', 0.9 * a, 1.4);
    dot(ctx, c, 2.5, 'white', a);
  }

  /** Symbole de centre de masse (cercle à quartiers). */
  function comSymbol(ctx, p, r, a) {
    ctx.fillStyle = rgba('bg', 0.9 * a); ctx.beginPath(); ctx.arc(p[0], p[1], r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba('teal', a);
    for (const q of [0, Math.PI]) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.arc(p[0], p[1], r, q - Math.PI / 2, q); ctx.closePath(); ctx.fill(); }
    ring(ctx, p, r, 'teal', a, 1.6);
  }
  /** Cote horizontale (écran) entre x0 et x1 à la hauteur y. */
  function hDim(ctx, x0, x1, y, col, a) {
    ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 1.5;
    line(ctx, [x0, y], [x1, y]); line(ctx, [x0, y - 7], [x0, y + 7]); line(ctx, [x1, y - 7], [x1, y + 7]);
  }

  function sagLabels(ctx, F, cam) {
    const t = F.t, A = F.A, S = (p) => cam.w2s(p);
    const k = (t0) => fio(t, t0, T.lab[1], 0.3, 0.3);
    const XR = 930, XL = 440;
    tag(ctx, S(A.v('T11', [53, 3])), [XR, 452], [{ s: 'ÉRECTEURS DU RACHIS', c: 'amber', w: 700 }, { s: 'haubans postérieurs', size: 13, ls: 0.5 }, { s: 'bassin, sacrum → côtes', size: 13, ls: 0.5 }], { a: k(T.lab[0]), lc: 'amber', id: 's4lES' });
    tag(ctx, S(vlerp(A.spinInf('L3', 0.3), A.mam('L5'), 0.5)), [XR, 636], [{ s: 'MULTIFIDE', c: 'cobalt', w: 700 }, { s: 'courts haubans segmentaires', size: 13, ls: 0.5 }], { a: k(T.lab[0] + 0.1), lc: 'cobalt', id: 's4lMF' });
    tag(ctx, S(RW(0.3, 0.5)(A)), [XL, 474], [{ s: 'GRAND DROIT', c: 'crimson', w: 700 }, { s: 'pubis → cartilages 5–7', size: 13, ls: 0.5 }], { a: k(T.lab[0] + 0.05), lc: 'crimson', align: 'right', id: 's4lRA' });
    tag(ctx, S(vlerp(A.v('L3', [-(LV[IX.L3].D / 2 + 16), 0]), A.wall(TA_U[2]), 0.35)), [XL, 600], [{ s: 'TRANSVERSE', c: 'cobalt', w: 700 }, { s: 'ceinture de la paroi', size: 13, ls: 0.5 }], { a: k(T.lab[0] + 0.15), lc: 'cobalt', align: 'right', id: 's4lTA' });
    tag(ctx, S(A.v('L5', [-26, 16])), [XL, 742], [{ s: 'PSOAS', c: 'crimson', w: 700 }, { s: 'corps lombaires → petit trochanter', size: 13, ls: 0.5 }], { a: k(T.lab[0] + 0.2), lc: 'crimson', align: 'right', id: 's4lPS' });
  }

  function sagMech(ctx, F, cam, m) {
    const t = F.t;
    const a = fio(t, T.mech[0], T.mech[1], 0.3, 0.35);
    if (a <= 0.004 || !m) return;
    const k = (t0) => a * smooth(seg(t, t0, t0 + 0.3));
    const aL = k(33.05) * smooth(seg(m.load, 0, 6)), aW = k(33.15), aD = k(33.45), aE = k(33.7), aF = k(33.9), aM = k(34.1), aC = k(34.3);
    const kc = kcAt(t), sc = m.scen(kc), aB = a * kc / K_CO;
    const c = cam.w2s(m.c), g = cam.w2s(m.g), s = cam.w2s(m.s);

    // charge sur les épaules
    drawLoad(ctx, cam, F.A, aL, m.load);
    // verticale passant par le centre du disque L4/L5 (référence des bras de levier horizontaux)
    const yTop = Math.min(g[1], s[1]) - 26;
    ctx.setLineDash([3, 6]); ctx.strokeStyle = rgba('teal', 0.55 * aD); ctx.lineWidth = 1.2; line(ctx, [c[0], c[1]], [c[0], yTop]); ctx.setLineDash([]);
    // cotes d_G et d_L (horizontales, à la hauteur de G et de la charge)
    if (aD > 0.004) {
      hDim(ctx, g[0], c[0], g[1], 'teal', aD);
      compo(ctx, ['d', { s: 'G', sub: true }, ' = ' + fr(m.dG / 10, 1) + ' cm'], Math.max(g[0], c[0]) + 12, g[1] + 5, { size: 15, c: 'teal', a: aD, w: 700, bg: 0.75, id: 's4dG' });
      const aDL = aD * smooth(seg(m.load, 0, 6));
      hDim(ctx, s[0], c[0], s[1], 'teal', aDL);
      compo(ctx, ['d', { s: 'L', sub: true }, ' = ' + fr(m.dL / 10, 1) + ' cm'], Math.max(s[0], c[0]) + 12, s[1] + 5, { size: 15, c: 'teal', a: aDL, w: 700, bg: 0.75, id: 's4dL' });
    }
    // poids de la charge P (à l'appui des épaules) et W au centre de masse
    if (m.P > 1) MU.forceVector(ctx, cam, m.s, [0, 1], m.P, { a: aL, col: 'teal', lw: 3.5, head: 12 });
    compo(ctx, ['P = ' + frN(m.P) + ' N'], s[0] - 70, s[1] + 20, { size: 15, c: 'teal', a: aL, w: 700, bg: 0.75, align: 'right', id: 's4P' });
    compo(ctx, ['CHARGE ' + fr(m.load, 0) + ' kg'], s[0] - 70, s[1] - 4, { size: 14, c: 'white', a: aL, w: 600, bg: 0.75, align: 'right', id: 's4Pk' });
    MU.forceVector(ctx, cam, m.g, [0, 1], W_HAT, { a: aW, col: 'teal', lw: 3.5, head: 14 });
    comSymbol(ctx, g, 7, aW);
    compo(ctx, ['W = ' + W_HAT + ' N'], g[0] - 14, g[1] + 34, { size: 15, c: 'teal', a: aW, w: 700, bg: 0.75, align: 'right', id: 's4W' });
    compo(ctx, ['G'], g[0] - 14, g[1] - 6, { size: 15, c: 'teal', a: aW, w: 700, bg: 0.75, align: 'right', id: 's4G' });

    // disque L4/L5 teinté selon la compression (cyan → orange → rouge)
    if (aC > 0.004) {
      const up = F.G.lv[IX.L4], lo = F.G.lv[IX.L5];
      polyPath(ctx, [up.BA, up.BP, lo.TP, lo.TA].map((p) => cam.w2s(p)), true);
      ctx.fillStyle = rgba(SC.stressRGB(clamp((sc.C - 600) / 3400)), 0.75 * aC); ctx.fill();
      tag(ctx, c, [950, 790], [{ s: 'COMPRESSION L4–L5', size: 13, c: 'grey', w: 700 }, { s: 'C = ' + frN(sc.C) + ' N', size: 16, c: 'white', w: 700 }], { a: aC, lc: 'white', id: 's4C' });
    }
    // érecteurs : ligne d'action, bras de levier, force
    MU.actionLine(ctx, cam, m.L.p, m.L.u, { a: aE, len: 230, col: 'amber' });
    if (aE > 0.004) {
      MU.leverDim(ctx, cam, m.c, m.L.p, m.L.u, { a: aE, col: 'amber', label: false });
      const f = cam.w2s(m.footES);
      compo(ctx, ['d', { s: 'ES', sub: true }, ' = ' + fr(m.dES / 10, 1) + ' cm'], f[0] + 14, f[1] + 34, { size: 15, c: 'amber', a: aE, w: 700, bg: 0.75, id: 's4dES' });
    }
    if (aF > 0.004 && sc.FES > 1) {
      const fv = MU.forceVector(ctx, cam, m.footES, m.uES, sc.FES, { a: aF, col: 'teal', toPoint: true, lw: 4, head: 16 });
      if (fv) {
        const mid = vlerp(fv.from, fv.to, 0.45);
        tagCompo(ctx, mid, [930, 640], ['F', { s: 'ES', sub: true }, ' = ' + frN(sc.FES) + ' N'], 'traction des extenseurs', { a: aF, id: 's4FES' });
      }
    }
    // grand droit (scénario 2) : ligne d'action, bras de levier, force antagoniste
    if (aB > 0.004) {
      MU.actionLine(ctx, cam, vlerp(m.La.p, m.footABD, 0.5), m.La.u, { a: aB, len: 150, col: 'crimson' });
      MU.leverDim(ctx, cam, m.c, m.La.p, m.La.u, { a: aB, col: 'crimson', label: false });
      const f = cam.w2s(m.footABD);
      compo(ctx, ['d', { s: 'ABD', sub: true }, ' = ' + fr(m.dABD / 10, 1) + ' cm'], f[0] - 14, f[1] + 34, { size: 15, c: 'crimson', a: aB, w: 700, bg: 0.75, align: 'right', id: 's4dAB' });
      const fv = MU.forceVector(ctx, cam, m.footABD, m.uABD, sc.FABD, { a: aB, col: 'teal', toPoint: true, lw: 4, head: 14 });
      if (fv) compo(ctx, ['F', { s: 'ABD', sub: true }, ' = ' + frN(sc.FABD) + ' N'], fv.from[0] - 14, fv.from[1] - 2, { size: 15, c: 'teal', a: aB, w: 700, bg: 0.75, align: 'right', id: 's4FAB' });
    }
    // arcs de moment au disque : requis (fléchissant, teal), extenseur (ambre), antagoniste (cramoisi)
    if (aM > 0.004) {
      MU.momentArc(ctx, c, 30, m.M, { a: aM, col: 'teal', start: -Math.PI / 2 - 0.12, Mref: 200, lw: 2.5 });
      MU.momentArc(ctx, c, 42, -sc.MES, { a: aM, col: 'amber', start: -Math.PI / 2 + 0.12, Mref: 200, lw: 2.5 });
      if (aB > 0.004) MU.momentArc(ctx, c, 54, sc.MABD, { a: aM * aB / a, col: 'crimson', start: -Math.PI / 2 - 0.12, Mref: 200, lw: 2.5 });
    }
    dot(ctx, c, 5.5, 'bg', 0.9 * aW); ring(ctx, c, 5.5, 'teal', aW, 2); dot(ctx, c, 2.2, 'white', aW);

    // bandeau du scénario (haut gauche de la zone visuelle)
    const b1 = a * fio(t, 33.6, T.coB + 0.1, 0.3, 0.25), b2 = a * smooth(seg(t, T.coB + 0.15, T.coB + 0.45));
    text(ctx, 'SCÉNARIO 1 · SANS COCONTRACTION', 80, 226, { size: 18, c: 'white', a: b1, w: 700, ls: 1.5, id: 's4b1' });
    text(ctx, 'seuls les extenseurs équilibrent le moment requis', 80, 252, { size: 14, c: 'grey', a: b1, id: 's4b1s' });
    text(ctx, 'SCÉNARIO 2 · AVEC COCONTRACTION DES ABDOMINAUX', 80, 226, { size: 18, c: 'white', a: b2, w: 700, ls: 1.5, id: 's4b2' });
    compo(ctx, ['moment antagoniste M', { s: 'ABD', sub: true }, ' = ' + fr(K_CO * 100, 0) + ' % de M', { s: 'ES', sub: true }, ' : niveau illustratif'], 80, 252, { size: 14, c: 'crimson', a: b2, id: 's4b2s' });
    // échelle des forces
    const sa = k(33.9);
    if (sa > 0.004) {
      const L = 500 * MU.F_SCALE, x0 = 880, y0 = 960;
      ctx.strokeStyle = rgba('teal', sa); ctx.lineWidth = 3; line(ctx, [x0, y0], [x0 + L, y0]);
      ctx.lineWidth = 1.5; line(ctx, [x0, y0 - 6], [x0, y0 + 6]); line(ctx, [x0 + L, y0 - 6], [x0 + L, y0 + 6]);
      text(ctx, '500 N · échelle des forces', x0 + L + 12, y0 + 5, { size: 12, c: 'teal', a: sa, id: 's4sc' });
    }
  }

  /** Bloc Panjabi sur le dessin : sous-systèmes passif, actif, neural ; segment L4–L5. */
  function sagPanjabi(ctx, F, cam) {
    const t = F.t, A = F.A, G = F.G, S = (p) => cam.w2s(p);
    const a = fio(t, T.pj[0], T.pj[1], 0.35, 0.1);
    if (a <= 0.004) return;
    const k = (t0) => a * smooth(seg(t, t0, t0 + 0.3));
    // segment L4–L5 surligné
    const aS = k(37.15);
    if (aS > 0.004) {
      const up = G.lv[IX.L4], lo = G.lv[IX.L5];
      polyPath(ctx, [up.BA, up.BP, lo.TP, lo.TA].map((p) => S(p)), true);
      ctx.fillStyle = rgba('cyan', 0.45 * aS); ctx.fill();
      ring(ctx, S(A.disc('L4')), 30, 'cyan', 0.8 * aS, 1.4);
    }
    // contrôle neural : influx du cerveau le long du canal vertébral vers les haubans (phase = fonction de t)
    const aN = k(37.35);
    if (aN > 0.004) {
      const out = G.skull.outline; let cx = 0, cy = 0; for (const p of out) { cx += p[0]; cy += p[1]; }
      const brain = [cx / out.length, cy / out.length - 10];
      const pts = [brain];
      for (let i = IX.C1; i <= IX.L4; i++) { const V0 = G.lv[i]; pts.push(SC.toW(V0.F, [V0.L.D / 2 + 0.25 * V0.L.D + 2, 0])); }
      const sp = pts.map(S);
      ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba('white', 0.45 * aN); ctx.lineWidth = 1.4; smoothPath(ctx, sp); ctx.stroke(); ctx.setLineDash([]);
      const tot = SC.polyLen(sp);
      for (let j = 0; j < 4; j++) {
        const ph = (t * 0.55 + j / 4) % 1, q = SC.partial(sp, ph), p = q[q.length - 1];
        dot(ctx, p, 6, 'white', 0.15 * aN); dot(ctx, p, 2.6, 'white', 0.9 * aN);
      }
      void tot;
      tag(ctx, S(brain), [930, 262], [{ s: 'CONTRÔLE NEURAL', w: 700 }, { s: 'SNC, récepteurs → commande', size: 13, ls: 0.5 }], { a: aN, lc: 'white', id: 's4jN' });
    }
    tag(ctx, S(A.v('T10', [54, 6])), [930, 420], [{ s: 'SYSTÈME ACTIF', c: 'amber', w: 700 }, { s: 'muscles et tendons = haubans', size: 13, ls: 0.5 }], { a: k(37.25), lc: 'amber', id: 's4jA' });
    tag(ctx, S(A.body('L2')), [930, 580], [{ s: 'SYSTÈME PASSIF', c: 'cyan', w: 700 }, { s: 'vertèbres, disques, ligaments', size: 13, ls: 0.5 }], { a: k(37.2), lc: 'cyan', id: 's4jP' });
    tag(ctx, S(A.disc('L4')), [930, 730], [{ s: 'SEGMENT L4–L5', c: 'cyan', w: 700 }, { s: 'courbe charge-déplacement →', size: 13, ls: 0.5 }], { a: aS, lc: 'cyan', id: 's4jS' });
  }

  // =========================================================================
  //  PANNEAU
  // =========================================================================
  function chip(ctx, x, y, col, a) { ctx.fillStyle = rgba(col, a); ctx.fillRect(x, y - 10, 10, 10); }

  /** Bloc 1 : analogie du mât et des haubans (vectoriel). */
  function panelMast(ctx, F, a) {
    const P = F.panel, t = F.t, x = P.PX + 30, Wd = P.PW - 60;
    P.header(ctx, 'HAUBANAGE MUSCULAIRE', 'analogie du mât', a, 's4p1', 'amber');
    const k = (t0) => a * smooth(seg(t, t0, t0 + 0.25));
    const mx = P.PX + 175, top = P.PY + 120, base = P.PY + 600;
    // coque / pont (bassin)
    const ad = k(32.05);
    polyPath(ctx, [[mx - 120, base], [mx + 120, base], [mx + 95, base + 36], [mx - 95, base + 36]], true);
    ctx.fillStyle = rgba('bone', 0.9 * ad); ctx.fill(); ctx.strokeStyle = rgba('grey', 0.9 * ad); ctx.lineWidth = 1.5; ctx.stroke();
    // mât segmenté (vertèbres)
    const am = k(32.1), nS = 12, hS = (base - top) / nS;
    for (let i = 0; i < nS; i++) {
      const y0 = top + i * hS + 2;
      roundedPath(ctx, [[mx - 9, y0, 3], [mx + 9, y0, 3], [mx + 9, y0 + hS - 4, 3], [mx - 9, y0 + hS - 4, 3]]);
      ctx.fillStyle = rgba('cyan', 0.18 * am); ctx.fill(); ctx.strokeStyle = rgba('cyan', 0.85 * am); ctx.lineWidth = 1.3; ctx.stroke();
    }
    // barres de flèche (postérieures, comme les processus épineux) et étai arrière
    const as = k(32.2), spY = [top + 0.25 * (base - top), top + 0.5 * (base - top), top + 0.75 * (base - top)];
    ctx.strokeStyle = rgba('white', 0.9 * as); ctx.lineWidth = 3;
    for (const y of spY) line(ctx, [mx + 9, y], [mx + 62, y + 10]);
    const ab = k(32.3), bs = [[mx + 4, top + 4], ...spY.map((y) => [mx + 62, y + 10]), [mx + 112, base]];
    ctx.strokeStyle = rgba('amber', 0.95 * ab); ctx.lineWidth = 2.4; polyPath(ctx, bs); ctx.stroke();
    ctx.strokeStyle = rgba('amber', 0.25 * ab); ctx.lineWidth = 7; polyPath(ctx, bs); ctx.stroke();
    // étai avant
    const af = k(32.4);
    ctx.strokeStyle = rgba('crimson', 0.95 * af); ctx.lineWidth = 2.4; line(ctx, [mx - 4, top + 4], [mx - 112, base]);
    ctx.strokeStyle = rgba('crimson', 0.25 * af); ctx.lineWidth = 7; line(ctx, [mx - 4, top + 4], [mx - 112, base]);
    // bas-haubans (courts, près du pied de mât)
    const al = k(32.5);
    ctx.strokeStyle = rgba('cobalt', 0.95 * al); ctx.lineWidth = 2.2;
    for (const [y, dx] of [[base - 150, 46], [base - 90, 40]]) { line(ctx, [mx + 9, y], [mx + dx, base]); line(ctx, [mx - 9, y], [mx - dx, base]); }
    // charge axiale sur la tête de mât
    arrow(ctx, [mx, top - 48], [mx, top - 6], 'teal', k(32.55), { lw: 3, head: 11, noGlow: true });
    // légende (à droite du mât)
    const lx = P.PX + 330, rows = [
      ['cyan', 'MÂT', 'rachis ostéo-ligamentaire', 32.1],
      ['white', 'BARRES DE FLÈCHE', 'processus = bras de levier', 32.2],
      ['amber', 'ÉTAI ARRIÈRE', 'érecteurs du rachis', 32.3],
      ['crimson', 'ÉTAI AVANT', 'grand droit (abdominaux)', 32.4],
      ['cobalt', 'BAS-HAUBANS', 'multifide, transverse', 32.5],
      ['grey', 'PIED DE MÂT', 'bassin, sacrum', 32.05],
    ];
    rows.forEach(([col, n, d, t0], i) => {
      const y = P.PY + 150 + i * 74, ra = k(t0);
      chip(ctx, lx, y, col, ra);
      text(ctx, n, lx + 18, y, { size: 14, c: col === 'grey' ? 'white' : col, a: ra, w: 700, ls: 1, id: 's4p1n' + i });
      text(ctx, d, lx + 18, y + 22, { size: 13, c: 'white', a: ra, id: 's4p1d' + i });
    });
    let y = P.PY + 680;
    y += P.wrap(ctx, nb('Sans haubans, le rachis lombaire ligamentaire isolé flambe sous ≈ 88 N : la stabilité vient des muscles.'), x, y, Wd, { size: 14, c: 'white', a: k(32.6), id: 's4p1m' });
    P.cite(ctx, 'Crisco et al. 1992 · doi:10.1016/0268-0033(92)90004-N', x, P.PY + P.PH - 34, a);
  }

  /** Bloc 2 : équilibre des couples (valeurs calculées en direct). */
  function panelBalance(ctx, F, a, m) {
    const P = F.panel, t = F.t, x = P.PX + 30, Wd = P.PW - 60, R = ref();
    P.header(ctx, 'ÉQUILIBRE DES COUPLES · L4–L5', 'antéflexion + charge', a, 's4p2', 'teal');
    const g = { size: 15, c: 'white', a, w: 600, id: '' };
    compo(ctx, ['M', { s: 'req', sub: true }, ' = W·d', { s: 'G', sub: true }, ' + P·d', { s: 'L', sub: true }], x, P.PY + 96, Object.assign({}, g, { id: 's4f1' }));
    compo(ctx, ['F', { s: 'ES', sub: true }, '·d', { s: 'ES', sub: true }, ' = M', { s: 'req', sub: true }, ' + F', { s: 'ABD', sub: true }, '·d', { s: 'ABD', sub: true }], x, P.PY + 120, Object.assign({}, g, { id: 's4f2' }));
    const rows = [
      [['α'], 'ANTÉFLEXION DU TRONC', fr(m.alpha, 1), '°', 'white'],
      [['P'], 'CHARGE ' + fr(m.load, 1) + ' kg × 9,81', frN(m.P), 'N', 'teal'],
      [['d', { s: 'G', sub: true }], 'BRAS DE LEVIER DE W (412 N)', fr(m.dG / 10, 1), 'cm', 'teal'],
      [['d', { s: 'L', sub: true }], 'BRAS DE LEVIER DE LA CHARGE', fr(m.dL / 10, 1), 'cm', 'teal'],
      [['M', { s: 'req', sub: true }], 'MOMENT FLÉCHISSANT REQUIS', fr(m.M, 1), 'N·m', 'teal'],
      [['d', { s: 'ES', sub: true }], 'BRAS DE LEVIER DES ÉRECTEURS', fr(m.dES / 10, 1), 'cm', 'amber'],
      [['d', { s: 'ABD', sub: true }], 'BRAS DE LEVIER DU GRAND DROIT', fr(m.dABD / 10, 1), 'cm', 'crimson'],
    ];
    rows.forEach((r, i) => {
      const y = P.PY + 154 + i * 26;
      compo(ctx, r[0], x, y, { size: 16, c: r[4], a, w: 700, id: 's4p2k' + i });
      text(ctx, r[1], x + 64, y - 1, { size: 12, c: 'grey', a, ls: 0.6, id: 's4p2l' + i });
      text(ctx, r[2], x + 446, y, { size: 18, c: 'white', a, align: 'right', w: 600, id: 's4p2v' + i });
      text(ctx, r[3], x + 454, y, { size: 13, c: 'grey', a, id: 's4p2u' + i });
      ctx.strokeStyle = rgba('grey', 0.15 * a); ctx.lineWidth = 1; line(ctx, [x, y + 9], [x + Wd, y + 9]);
    });
    // tableau comparatif
    const aB = a * smooth(seg(t, T.coB, T.coB + 0.35));
    const sel = t >= T.coB + 0.2 ? 1 : 0;
    const cA = x + 330, cB = x + Wd, y0 = P.PY + 346;
    ctx.fillStyle = rgba('white', 0.05 * a); ctx.fillRect(sel ? cB - 168 : cA - 150, y0 - 20, sel ? 168 : 158, 154);
    text(ctx, 'SANS', cA, y0, { size: 13, c: sel ? 'grey' : 'white', a, align: 'right', w: 700, ls: 1.5, id: 's4tA' });
    text(ctx, 'COCONTRACTION', cA, y0 + 16, { size: 12, c: 'grey', a, align: 'right', ls: 0.5, id: 's4tA2' });
    text(ctx, 'AVEC', cB, y0, { size: 13, c: sel ? 'white' : 'grey', a: aB, align: 'right', w: 700, ls: 1.5, id: 's4tB' });
    compo(ctx, ['M', { s: 'ABD', sub: true }, ' = ' + fr(K_CO * 100, 0) + ' % M', { s: 'ES', sub: true }], cB, y0 + 16, { size: 12, c: 'crimson', a: aB, align: 'right', id: 's4tB2' });
    const tr = [
      [['F', { s: 'ES', sub: true }], frN(m.A.FES) + ' N', frN(m.B.FES) + ' N', frS(m.dF, 0) + ' %'],
      [['F', { s: 'ABD', sub: true }], '0 N', frN(m.B.FABD) + ' N', ''],
      [['C', { s: 'L4–L5', sub: true }], frN(m.A.C) + ' N', frN(m.B.C) + ' N', frS(m.dC, 0) + ' %'],
    ];
    tr.forEach((r, i) => {
      const y = y0 + 42 + i * 26;
      compo(ctx, r[0], x, y, { size: 16, c: i === 1 ? 'crimson' : i === 0 ? 'amber' : 'white', a, w: 700, id: 's4tk' + i });
      text(ctx, r[1], cA, y, { size: 17, c: 'white', a, align: 'right', w: 600, id: 's4ta' + i });
      text(ctx, r[2], cB - 62, y, { size: 17, c: 'white', a: aB, align: 'right', w: 600, id: 's4tb' + i });
      if (r[3]) text(ctx, r[3], cB, y, { size: 14, c: 'teal', a: aB, align: 'right', w: 700, id: 's4td' + i });
      ctx.strokeStyle = rgba('grey', 0.15 * a); ctx.lineWidth = 1; line(ctx, [x, y + 9], [x + Wd, y + 9]);
    });
    // raideur : indice qualitatif ∝ somme des forces musculaires (raideur musculaire ∝ force)
    const yS = y0 + 42 + 3 * 26 + 2;
    text(ctx, 'RAIDEUR', x, yS, { size: 13, c: 'white', a, w: 700, ls: 1, id: 's4rk' });
    text(ctx, 'indice qualitatif ∝ Σ F', x, yS + 16, { size: 12, c: 'grey', a, id: 's4rk2' });
    const bw = 130;
    for (const [col, v, aa, xr] of [['amber', m.A.stiff, a, cA], ['teal', m.B.stiff, aB, cB]]) {
      const w = bw * clamp(v / (1.1 * R.stiff));
      ctx.strokeStyle = rgba('grey', 0.6 * aa); ctx.lineWidth = 1; ctx.strokeRect(xr - bw + 0.5, yS - 9.5, bw, 12);
      ctx.fillStyle = rgba(col, 0.85 * aa); ctx.fillRect(xr - w, yS - 9, w, 11);
    }
    text(ctx, '+', cB - bw - 18, yS + 1, { size: 16, c: 'teal', a: aB, w: 700, id: 's4rk3' });
    // activation des groupes : moment produit au disque L4/L5 (barres : relatif au pic de la séquence)
    const yA = P.PY + 512;
    text(ctx, 'ACTIVATION DES GROUPES', x, yA, { size: 12, c: 'grey', a, ls: 1.5, w: 700, id: 's4ah' });
    text(ctx, 'moment produit en L4–L5', x + Wd, yA, { size: 12, c: 'grey', a, align: 'right', id: 's4ah2' });
    const cur = m.scen(kcAt(t));
    const grp = [
      ['amber', 'érecteurs', (1 - MF_SHARE) * cur.MES, fr((1 - MF_SHARE) * cur.MES, 0) + ' N·m'],
      ['cobalt', 'multifide', MF_SHARE * cur.MES, fr(MF_SHARE * cur.MES, 0) + ' N·m'],
      ['crimson', 'abdominaux', cur.MABD, fr(cur.MABD, 0) + ' N·m'],
      ['cobalt', 'transverse · PIA', null, 'qualitatif'],
    ];
    const act = activations(F, m);
    grp.forEach(([col, n, v, s], i) => {
      const y = yA + 25 + i * 23, gx = x + 170, gw = 230;
      text(ctx, n, x, y, { size: 14, c: col, a, w: 600, id: 's4an' + i });
      ctx.strokeStyle = rgba('grey', 0.5 * a); ctx.lineWidth = 1; ctx.strokeRect(gx + 0.5, y - 10.5, gw, 12);
      const f = v == null ? clamp(act.tra) : clamp(v / R.MES);
      if (v == null) { ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba(col, 0.9 * a); ctx.strokeRect(gx + 1.5, y - 9.5, gw * f - 2, 10); ctx.setLineDash([]); }
      else { ctx.fillStyle = rgba(col, 0.85 * a); ctx.fillRect(gx + 1, y - 10, gw * f, 11); }
      text(ctx, s, x + Wd, y, { size: 13, c: v == null ? 'grey' : 'white', a, align: 'right', id: 's4av' + i });
    });
    // notes
    let y = P.PY + 636;
    y += P.wrap(ctx, nb('Modèle statique plan. F_ES : résultante des extenseurs sur la ligne d’action des faisceaux thoraciques (multifide ≈ 20 % du moment : Bogduk et al. 1992) ; C = (W + P + F_ES + F_ABD)·n du disque.'), x, y, Wd, { size: 12, c: 'grey', a, id: 's4n1' });
    y += 6;
    y += P.wrap(ctx, nb('In vivo, la cocontraction augmente la compression de 12 à 18 % et la stabilité de 34 à 64 % (Granata & Marras 2000, doi:10.1097/00007632-200006010-00012).'), x, y, Wd, { size: 12, c: 'grey', a: aB, id: 's4n2' });
  }

  // ---- courbe charge-déplacement L4–L5 (Panjabi ; Wilke et al. 1995)
  // Amplitudes PASSIVES : ordre de grandeur schématique ; réductions MUSCULAIRES : Wilke et al. 1995
  // (5 paires de forces de 80 N : amplitude −93 % en flexion, −85 % en extension, zone neutre −83 %).
  const PJ = { Mmax: 3.75, flex: 4.5, ext: 3.0, nz: 2.0, rF: 0.93, rE: 0.85, rNZ: 0.83, m0: 0.22, m1: 1.4 };
  /** Rotation (°) sous un moment pur M (N·m) : zone neutre (tanh) + zone élastique qui se raidit. */
  function rot(M, active) {
    const nzh = (PJ.nz / 2) * (active ? 1 - PJ.rNZ : 1);
    const rom = M >= 0 ? PJ.flex * (active ? 1 - PJ.rF : 1) : PJ.ext * (active ? 1 - PJ.rE : 1);
    const a = Math.abs(M), nzEnd = nzh * Math.tanh(PJ.Mmax / PJ.m0);
    const el = (1 - Math.exp(-a / PJ.m1)) / (1 - Math.exp(-PJ.Mmax / PJ.m1));
    return Math.sign(M) * (nzh * Math.tanh(a / PJ.m0) + Math.max(0, rom - nzEnd) * el);
  }

  function panelPanjabi(ctx, F, a) {
    const P = F.panel, t = F.t, x = P.PX + 30, Wd = P.PW - 60;
    P.header(ctx, 'SYSTÈME ACTIF DE PANJABI', 'stabilité segmentaire', a, 's4p3', 'cyan');
    const k = (t0) => a * smooth(seg(t, t0, t0 + 0.3));
    // boucle des trois sous-systèmes
    const bw = 150, bh = 60, by = P.PY + 80, gap = (Wd - 3 * bw) / 2;
    const boxes = [
      ['cyan', 'PASSIF', ['vertèbres, disques,', 'ligaments'], 37.0],
      ['white', 'NEURAL', ['récepteurs, SNC :', 'commande'], 37.1],
      ['amber', 'ACTIF', ['muscles, tendons :', 'haubans'], 37.2],
    ];
    boxes.forEach(([col, n, d, t0], i) => {
      const bx = x + i * (bw + gap), ba = k(t0);
      roundedPath(ctx, [[bx, by, 6], [bx + bw, by, 6], [bx + bw, by + bh, 6], [bx, by + bh, 6]]);
      ctx.fillStyle = rgba(col, 0.07 * ba); ctx.fill(); ctx.strokeStyle = rgba(col, 0.8 * ba); ctx.lineWidth = 1.4; ctx.stroke();
      text(ctx, n, bx + bw / 2, by + 20, { size: 14, c: col, a: ba, w: 700, ls: 2, align: 'center', id: 's4bx' + i });
      d.forEach((s, j) => text(ctx, s, bx + bw / 2, by + 38 + j * 15, { size: 12, c: 'white', a: ba, align: 'center', id: 's4bd' + i + j }));
    });
    const aa = k(37.3), ym = by + bh / 2;
    arrow(ctx, [x + bw + 4, ym], [x + bw + gap - 4, ym], 'grey', aa, { lw: 1.6, head: 8, noGlow: true });
    arrow(ctx, [x + 2 * bw + gap + 4, ym], [x + 2 * (bw + gap) - 4, ym], 'grey', aa, { lw: 1.6, head: 8, noGlow: true });
    // retour actif → passif
    if (aa > 0.004) {
      const xa = x + 2 * (bw + gap) + bw / 2, xp = x + bw / 2, yb = by + bh + 14;
      ctx.strokeStyle = rgba('grey', aa); ctx.lineWidth = 1.6;
      polyPath(ctx, [[xa, by + bh + 2], [xa, yb], [xp, yb]]); ctx.stroke();
      arrow(ctx, [xp, yb], [xp, by + bh + 4], 'grey', aa, { lw: 1.6, head: 8, noGlow: true });
      text(ctx, 'stabilité = forces musculaires sur le segment', (xa + xp) / 2, yb + 18, { size: 12, c: 'grey', a: aa, align: 'center', id: 's4bxr' });
    }
    // graphe charge-déplacement
    const gx0 = x + 46, gx1 = x + Wd - 10, gy0 = P.PY + 238, gy1 = P.PY + 458;
    const yMax = 5.5, yMin = -4;
    const X = (M) => lerp(gx0, gx1, (M + PJ.Mmax) / (2 * PJ.Mmax)), Y = (r) => lerp(gy1, gy0, (r - yMin) / (yMax - yMin));
    const ag = k(37.3);
    text(ctx, 'COURBE CHARGE-DÉPLACEMENT L4–L5', x, P.PY + 204, { size: 12, c: 'grey', a: ag, ls: 1.5, w: 700, id: 's4gT' });
    text(ctx, 'in vitro, moment pur', x + Wd, P.PY + 204, { size: 12, c: 'grey', a: ag, align: 'right', id: 's4gT2' });
    ctx.strokeStyle = rgba('grey', 0.6 * ag); ctx.lineWidth = 1;
    line(ctx, [gx0, gy0], [gx0, gy1]); line(ctx, [gx0, Y(0)], [gx1, Y(0)]);
    ctx.strokeStyle = rgba('grey', 0.25 * ag); line(ctx, [X(0), gy0], [X(0), gy1]);
    for (const r of [-2, 2, 4]) {
      ctx.strokeStyle = rgba('grey', 0.15 * ag); line(ctx, [gx0, Y(r)], [gx1, Y(r)]);
      text(ctx, (r > 0 ? '+' : SC.MINUS) + Math.abs(r), gx0 - 8, Y(r) + 4, { size: 12, c: 'grey', a: ag, align: 'right', id: 's4gy' + r });
    }
    text(ctx, '0', gx0 - 8, Y(0) + 4, { size: 12, c: 'grey', a: ag, align: 'right', id: 's4gy0' });
    for (const M of [-PJ.Mmax, PJ.Mmax]) {
      ctx.strokeStyle = rgba('grey', 0.6 * ag); line(ctx, [X(M), Y(0) - 4], [X(M), Y(0) + 4]);
      text(ctx, (M > 0 ? '+' : SC.MINUS) + fr(Math.abs(M), 2), X(M) + (M > 0 ? -2 : 4), gy1 + 18, { size: 12, c: 'grey', a: ag, align: M > 0 ? 'right' : 'left', id: 's4gx' + (M > 0 ? 'p' : 'm') });
    }
    text(ctx, 'M (N·m)', X(0), gy1 + 18, { size: 12, c: 'grey', a: ag, align: 'center', id: 's4gxt' });
    text(ctx, '← extension', gx0 + 8, gy0 + 12, { size: 12, c: 'grey', a: ag, id: 's4gxe' });
    text(ctx, 'flexion →', X(0) + 10, gy0 + 12, { size: 12, c: 'grey', a: ag, id: 's4gxf' });
    text(ctx, 'rotation (°)', gx0 - 8, gy0 - 8, { size: 12, c: 'grey', a: ag, id: 's4gyt' });
    // courbes (tracé progressif)
    const curve = (active, u, col, lw, ca) => {
      if (ca <= 0.004 || u <= 0) return;
      const pts = [];
      for (let i = 0; i <= 120; i++) { const M = -PJ.Mmax + (2 * PJ.Mmax * i) / 120; pts.push([X(M), Y(rot(M, active))]); }
      const q = SC.partial(pts, u);
      ctx.strokeStyle = rgba(col, 0.2 * ca); ctx.lineWidth = lw + 5; polyPath(ctx, q); ctx.stroke();
      ctx.strokeStyle = rgba(col, ca); ctx.lineWidth = lw; polyPath(ctx, q); ctx.stroke();
    };
    const uP = E.io(seg(t, 37.35, 37.85)), uA = E.io(seg(t, 37.75, 38.25));
    curve(false, uP, 'cyan', 2.4, ag);
    curve(true, uA, 'amber', 3, ag);
    const lp = k(37.75), la = k(38.15);
    for (const [col, s, ya, id, y] of [['cyan', 'passif (sans muscles)', lp, 's4cP', gy0 + 40], ['amber', 'avec forces musculaires', la, 's4cA', gy0 + 62]]) {
      ctx.strokeStyle = rgba(col, ya); ctx.lineWidth = 3; line(ctx, [gx0 + 12, y - 4], [gx0 + 30, y - 4]);
      text(ctx, s, gx0 + 38, y, { size: 13, c: col, a: ya, w: 600, id });
    }
    // accolades de zone neutre
    const brace = (xb, r0, r1, col, ba, side) => {
      if (ba <= 0.004) return;
      const y0 = Y(r1), y1 = Y(r0), d = 6 * side;
      ctx.strokeStyle = rgba(col, ba); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(xb + d, y0); ctx.quadraticCurveTo(xb, y0, xb, y0 + 5); ctx.lineTo(xb, (y0 + y1) / 2 - 4);
      ctx.lineTo(xb - d, (y0 + y1) / 2); ctx.lineTo(xb, (y0 + y1) / 2 + 4); ctx.lineTo(xb, y1 - 5); ctx.quadraticCurveTo(xb, y1, xb + d, y1); ctx.stroke();
    };
    const nzP = PJ.nz / 2, nzA = (PJ.nz / 2) * (1 - PJ.rNZ);
    const bp = k(38.1), ba = k(38.35);
    brace(X(0) - 14, -nzP, nzP, 'cyan', bp, 1);
    text(ctx, 'ZN', X(0) - 24, Y(0) - 8, { size: 14, c: 'cyan', a: bp, align: 'right', w: 700, id: 's4zP' });
    brace(X(0) + 16, -Math.max(nzA, 0.18), Math.max(nzA, 0.18), 'amber', ba, -1);
    text(ctx, 'ZN ' + SC.MINUS + fr(PJ.rNZ * 100, 0) + ' %', X(0) + 30, Y(0) + 26, { size: 14, c: 'amber', a: ba, w: 700, bg: 0.75, id: 's4zA' });
    P.wrap(ctx, nb('Muscles (5 paires × 80 N) : amplitude ' + SC.MINUS + fr(PJ.rF * 100, 0) + ' % en flexion, ' + SC.MINUS + fr(PJ.rE * 100, 0) + ' % en extension, zone neutre ' + SC.MINUS + fr(PJ.rNZ * 100, 0) + ' %. Passif : schématique.'), x, gy1 + 40, Wd, { size: 12, c: 'grey', a: la, id: 's4gN' });
    // message final
    const am = k(38.35);
    text(ctx, 'SYSTÈME ACTIF = HAUBANS MUSCULAIRES', x, P.PY + 562, { size: 20, c: 'amber', a: am, w: 700, ls: 1, id: 's4msg' });
    text(ctx, 'ils compensent la laxité du système passif', x, P.PY + 588, { size: 16, c: 'white', a: am, id: 's4msg2' });
    let y = P.PY + 620;
    y += P.wrap(ctx, nb('Nuance : in vitro, la cocontraction psoas + multifide rigidifie le segment en inclinaison et en rotation, mais augmente de 13 % l’amplitude sagittale (Quint et al. 1998).'), x, y, Wd, { size: 12, c: 'grey', a: k(38.55), id: 's4q' });
    y += 10;
    P.cite(ctx, 'Panjabi 1992 · doi:10.1097/00002517-199212000-00001 ; Wilke et al. 1995 · doi:10.1097/00007632-199501150-00011 ; Quint et al. 1998 · doi:10.1097/00007632-199809150-00003', x, y, a);
  }

  // =========================================================================
  //  ENREGISTREMENT
  // =========================================================================
  P2.scenes.push({
    id: 's4',
    state(F) {
      const t = F.t;
      if (t >= T.mech[0] - 0.1 && t <= T.p2[1] + 0.05) F.M.s4 = mech(F.A, F.G, F.S.load);
    },
    sag(ctx, F, cam) {
      const t = F.t;
      if (t < T.s0) return;
      const m = F.M.s4;
      drawHaubans(ctx, F, cam, m);
      sagLabels(ctx, F, cam);
      sagMech(ctx, F, cam, m);
      sagPanjabi(ctx, F, cam);
    },
    panel(ctx, F, pa) {
      const t = F.t;
      if (t < T.p1[0]) return;
      const a1 = pa * fio(t, T.p1[0], T.p1[1], 0.25, 0.2);
      if (a1 > 0.004) panelMast(ctx, F, a1);
      const a2 = pa * fio(t, T.p2[0], T.p2[1], 0.25, 0.25);
      if (a2 > 0.004 && F.M.s4) panelBalance(ctx, F, a2, F.M.s4);
      const a3 = pa * fio(t, T.p3[0], T.p3[1], 0.3, 0.1);
      if (a3 > 0.004) panelPanjabi(ctx, F, a3);
    },
  });
  // accès en lecture (tests)
  P2.s4 = { mech, ref, rot, PJ, K_CO, ES_THOR, RECT, TA_U };
})(typeof window !== 'undefined' ? window : globalThis);
