/* =============================================================================
 *  partie2/scene2.js — SCÈNE 2 (10–22 s) : HAUBANAGE POSTÉRIEUR
 *
 *  Vue sagittale (10,0 → 18,3 s, caméra « trunk ») :
 *   - repères (processus mastoïde, angles costaux, crête iliaque, sacrum) ;
 *   - érecteurs du rachis en trois colonnes (iliocostal, longissimus, épineux)
 *     qui poussent depuis leurs origines ; aponévrose des érecteurs ;
 *   - antéflexion 0 → 40° → 0 : équilibre des moments au disque L4/L5
 *     (W, d_G, M_G, ligne d'action des faisceaux thoraciques, d_ES, F_ES,
 *     compression). Toutes les valeurs sont CALCULÉES sur la géométrie de la
 *     frame (F.A, F.G) ; seules W = 412 N et les données de la littérature
 *     (citées) sont des constantes.
 *  Vue frontale postérieure (18,0 → 22,6 s) : P2.views.cor — repère propre en
 *  mm (origine = centre du plateau de S1, x = droite du patient vers la droite
 *  de l'écran, y caudal) : T11–T12, 11es et 12es côtes, L1–L5, sacrum, ailes
 *  iliaques, ligaments ilio-lombaires, carré des lombes (3 groupes de
 *  faisceaux) ; inclinaison latérale F.S.latBend : hauban côté convexe.
 *  Panneau 10,0 → 21,9 s : 3 blocs séquentiels.
 *
 *  Fonctions pures : aucun état entre frames (seul un cache mémoïsé de la
 *  fonction pure mechAt(α) est conservé).
 * ========================================================================== */
(function (root) {
  'use strict';
  const SC = root.SpineCore, P2 = root.P2, MU = P2.muscles;
  const {
    DEG, clamp, lerp, seg, smooth, E, fio, vadd, vsub, vmul, vlen, vnorm, vlerp, vdot, vrot, perp, toW,
    rgba, mix, text, measure, line, arrow, dot, ring, polyPath, smoothPath, roundedPath, MONO, SANS, LV, IX,
  } = SC;

  // ------------------------------------------------------------------ fenêtres temporelles (s)
  const T = {
    sag0: 10.0, sag1: 18.36,           // contenu sagittal (la vue s'écrase de 18,0 à 18,3)
    lab1: 13.42,                       // fin des étiquettes anatomiques sagittales
    mech0: 13.5, mech1: 17.85,         // vecteurs de l'antéflexion
    corLab0: 18.65, corLab1: 21.85,    // étiquettes de la vue frontale
    p1: [10.0, 13.4], p2: [13.5, 18.0], p3: [18.2, 21.9],
  };

  // ------------------------------------------------------------------ couleurs, formats
  const C_IC = [255, 118, 34];   // iliocostal (latéral) : ambre tirant sur l'orangé
  const C_LG = [255, 163, 30];   // longissimus (intermédiaire) : ambre
  const C_SP = [255, 212, 112];  // épineux (médial) : ambre clair
  const NBSP = ' ';
  /** Nombre décimal à la française (virgule, vrai signe moins). */
  const fr = (v, d) => SC.fmt(v, d).replace('.', ',');
  /** Entier avec séparateur de milliers (espace insécable). */
  const frN = (v) => { const r = Math.round(v); return (r < 0 ? SC.MINUS : '') + String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); };

  // ------------------------------------------------------------------ typographie
  /**
   * Texte composé (symboles avec indices) : parts = ['M', {s:'G', sub:true}, ' = 67 N·m'].
   * Un seul fond sous l'ensemble ; chaque morceau est enregistré (id + '_' + k).
   */
  function compo(ctx, parts, x, y, o) {
    const a = o.a; if (a <= 0.004) return 0;
    const size = o.size || 16;
    const P = parts.map((p) => (typeof p === 'string' ? { s: p } : p));
    const ws = P.map((p) => {
      p.sz = p.sub ? Math.max(12, Math.round(size * 0.75)) : p.size || size;
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
  /** Étiquette reliée par une ligne de rappel coudée (ids stables, fond 0,75). */
  function tag(ctx, anchor, at, lines, o) {
    const a = o.a; if (a <= 0.004) return;
    const size = o.size || 14, align = o.align || 'left', side = align === 'left' ? -1 : 1, ly = at[1] - size * 0.35;
    ctx.strokeStyle = rgba(o.lc || 'grey', a * 0.9); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(at[0] + side * 18, ly); ctx.lineTo(at[0] + side * 6, ly); ctx.stroke();
    dot(ctx, anchor, 3, o.lc || 'grey', a);
    let y = at[1];
    lines.forEach((L, i) => {
      const la = a * (L.a == null ? 1 : L.a);
      text(ctx, L.s, at[0], y, { size: L.size || size, c: L.c || 'white', a: la, align, ls: L.ls == null ? 1 : L.ls, w: L.w, bg: 0.75, id: o.id + i });
      y += (L.size || size) + 6;
    });
  }

  // =========================================================================
  //  ÉRECTEURS DU RACHIS (vue sagittale) — chemins d'ancrages
  //  Points de passage dans le repère des vertèbres (A.v : mm, x postérieur) :
  //  en arrière des arcs postérieurs ; profondeur croissante longissimus →
  //  iliocostal → épineux dans la région thoracique (lisibilité en projection).
  // =========================================================================
  const V = (n, x, y) => (A) => A.v(n, [x, y]);
  const VT = (n, x, y) => (A) => A.vt(n, [x, y]);
  const RA = (i) => (A) => A.ribAngle(i);
  const RB = (i, u) => (A) => A.rib(i, u);

  // ILIOCOSTAL : crête iliaque + aponévrose → angles costaux 12 → 4 ; cou : angles 3–6 → PT C4–C6
  const IC_FAS = [
    // iliocostal des lombes, partie thoracique (enjambe L4/L5)
    { path: [(A) => A.crest(0.83), V('L2', 63, 0), V('T12', 50, 4), RA(12)], w: 7, fibers: 4, loa: [0, 1], thor: true },
    { path: [(A) => A.crest(0.88), V('L2', 66, 0), V('T12', 54, 2), V('T11', 52, 6), RA(10)], w: 7, fibers: 4, loa: [0, 1], thor: true },
    { path: [(A) => A.sac(-22, 16), V('L2', 69, 0), V('T12', 58, 0), V('T10', 54, 6), RA(8)], w: 7, fibers: 4, loa: [0, 1], thor: true },
    // iliocostal du thorax : angles 11–9 → angles 6–4
    { path: [RA(11), V('T9', 54, 6), V('T7', 50, 6), RA(6)], w: 6, fibers: 3 },
    { path: [RA(9), V('T7', 54, 4), V('T5', 48, 6), RA(4)], w: 6, fibers: 3 },
    // iliocostal du cou : angles 6 et 3 → processus transverses C6 et C4
    { path: [RA(6), V('T4', 46, 4), V('T2', 40, 4), V('C7', 26, 2), V('C6', 15, 2)], w: 5, fibers: 3 },
    { path: [RA(3), V('T1', 37, 2), V('C7', 24, 0), V('C5', 16, 0), V('C4', 14, 2)], w: 5, fibers: 3 },
  ];
  // LONGISSIMUS : sacrum, aponévrose, processus accessoires lombaires → PT thoraciques et côtes 3–12 ; capitis → mastoïde
  const LG_FAS = [
    { path: [(A) => A.sac(-50, 12), V('L2', 62, 0), V('T12', 36, 0), V('T10', 30, 0), RB(9, 0.3)], w: 7, fibers: 4, loa: [0, 1], thor: true },
    { path: [(A) => A.sac(-35, 12), V('L2', 65, 0), V('T12', 38, -2), V('T9', 32, 0), V('T7', 28, 0), RB(6, 0.3)], w: 7, fibers: 4, loa: [0, 1], thor: true },
    { path: [(A) => A.sacCrest(-18), V('L2', 67, 0), V('T12', 40, -2), V('T9', 34, 0), V('T6', 30, 0), RB(3, 0.3)], w: 6, fibers: 3, loa: [0, 1], thor: true },
    // partie lombaire : processus accessoires L3 et L2 → côtes 12 et 10
    { path: [VT('L3', 38, -6), V('L1', 50, 0), V('T12', 30, 0), RB(12, 0.3)], w: 5, fibers: 3 },
    { path: [VT('L2', 38, -6), V('T12', 28, 4), V('T11', 26, 0), RB(10, 0.28)], w: 5, fibers: 3 },
    // longissimus de la tête : PT T1–T5 → processus mastoïde
    { path: [V('T5', 26, 0), V('T3', 24, 0), V('T1', 22, 0), V('C6', 15, 0), V('C4', 13, 0), V('C2', 13, 0), (A) => A.skull('mastoid')], w: 5, fibers: 3, capitis: true },
  ];
  // ÉPINEUX : épineuses T11–L2 → épineuses T1–T8 (passent contre les pointes épineuses)
  const SP_FAS = [
    { path: [(A) => A.spinTip('L2'), VT('T12', 60, 21), VT('T10', 60, 21), VT('T8', 55, 23)], w: 4.5, fibers: 3 },
    { path: [(A) => A.spinTip('L1'), VT('T11', 61, 20), VT('T9', 61, 20), VT('T7', 60, 21), VT('T6', 55, 23)], w: 4.5, fibers: 3 },
    { path: [VT('T12', 56, 23), VT('T10', 62, 20), VT('T8', 62, 20), VT('T6', 61, 20), VT('T4', 55, 23)], w: 4.5, fibers: 3 },
    { path: [VT('T11', 56, 23), VT('T9', 63, 19), VT('T7', 63, 19), VT('T5', 62, 19), VT('T3', 60, 20), VT('T2', 55, 23)], w: 4, fibers: 3 },
  ];
  const mkSpec = (color, fas, tendon) => ({ group: 'erector', color, tendon, fascicles: fas });
  const COLS = [
    { id: 'ic', color: C_IC, thor: mkSpec(C_IC, IC_FAS.filter((f) => f.thor), 0.1), rest: mkSpec(C_IC, IC_FAS.filter((f) => !f.thor), 0.1), g: [11.0, 12.0] },
    { id: 'lg', color: C_LG, thor: mkSpec(C_LG, LG_FAS.filter((f) => f.thor), 0.1), rest: mkSpec(C_LG, LG_FAS.filter((f) => !f.thor), 0.1), g: [11.2, 12.2] },
    { id: 'sp', color: C_SP, thor: null, rest: mkSpec(C_SP, SP_FAS, 0.14), g: [11.4, 12.4] },
  ];
  // faisceaux thoraciques passant en regard de L4/L5 (longissimus du thorax et iliocostal des lombes, parties thoraciques)
  const ES_THOR = { fascicles: [...IC_FAS, ...LG_FAS].filter((f) => f.thor) };

  // =========================================================================
  //  MÉCANIQUE : équilibre des moments au disque L4/L5 (levier du 1er genre)
  // =========================================================================
  const W_HAT = 412; // N : tête-bras-tronc = 60 % de 70 kg (A.comHAT, SPEC §4)
  /** Fonction pure de la géométrie (A, G) de la frame. */
  function mech(A, G) {
    const c = A.disc('L4'), g = A.comHAT();
    const dG = c[0] - g[0];                                    // mm (> 0 : G en avant du disque → moment fléchissant)
    const MG = (W_HAT * dG) / 1000;                            // N·m
    const L = MU.resultantLine(A, ES_THOR);                    // ligne d'action moyenne (segment qui enjambe L4/L5)
    const dES = Math.abs(MU.momentArm(c, L.p, L.u));           // mm, perpendiculaire
    const FES = (Math.max(0, MG) * 1000) / dES;                // N : M_ES = M_G
    const uDown = L.u[1] > 0 ? L.u : vmul(L.u, -1);            // traction exercée sur le tronc : vers le bassin
    const D = SC.discFrame(G);                                 // D.n : normale au plan discal (vers L4)
    const Fv = vadd([0, W_HAT], vmul(uDown, FES));             // W + F_ES (action du tronc sur le disque)
    const C = -vdot(Fv, D.n);                                  // compression (composante normale)
    const S = vdot(Fv, D.t);                                   // cisaillement (+ antérieur)
    return { c, g, dG, MG, L, dES, FES, uDown, D, Fv, C, S, foot: MU.foot(c, L.p, L.u), ratio: dG / dES, alpha: G.posture.trunk };
  }
  // F_ES(α), C(α) : cache mémoïsé d'une fonction pure (même partage 60 % lombaire / 40 % hanche que le framework)
  const TBL = new Map();
  function mechAt(alpha) {
    const k = Math.round(alpha * 2) / 2;
    let r = TBL.get(k);
    if (!r) {
      const G = P2.anatomy.sagittal({ pelvicTilt: 0, lumbarFlex: 0.6 * k, hipFlex: 0.4 * k });
      const m = mech(P2.anatomy.anchors(G), G);
      r = { alpha: k, FES: m.FES, C: m.C, MG: m.MG, dES: m.dES, dG: m.dG };
      TBL.set(k, r);
    }
    return r;
  }

  // =========================================================================
  //  VUE SAGITTALE
  // =========================================================================
  /** Aponévrose des érecteurs : nappe tendineuse blanche translucide (sacrum → L1). */
  function drawAponeurosis(ctx, A, cam, a) {
    if (a <= 0.004) return;
    const inner = [], outer = [];
    for (const s of [-78, -62, -46, -30, -14]) { inner.push(A.sac(s, 3)); outer.push(A.sac(s, 15)); }
    for (const n of ['L5', 'L4', 'L3', 'L2', 'L1']) { inner.push(A.v(n, [58, 0])); outer.push(A.v(n, [82, 0])); }
    const N = inner.length;
    for (let k = 0; k < N - 1; k++) {
      const fade = k < N - 3 ? 1 : k === N - 3 ? 0.6 : 0.25;  // s'estompe vers L1 (corps charnus thoraciques)
      polyPath(ctx, [inner[k], inner[k + 1], outer[k + 1], outer[k]].map((p) => cam.w2s(p)), true);
      ctx.fillStyle = rgba('white', 0.13 * fade * a); ctx.fill();
    }
    // stries tendineuses
    ctx.lineWidth = 1;
    for (const f of [0.15, 0.4, 0.65, 0.9]) {
      const pts = inner.map((p, k) => cam.w2s(vlerp(p, outer[k], f)));
      ctx.strokeStyle = rgba('white', 0.38 * a); smoothPath(ctx, pts.slice(0, N - 1)); ctx.stroke();
    }
  }

  /** Symbole du centre de masse (cercle à quartiers). */
  function comSymbol(ctx, p, r, a) {
    ctx.fillStyle = rgba('bg', 0.9 * a); ctx.beginPath(); ctx.arc(p[0], p[1], r + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba('teal', a);
    for (const q of [0, Math.PI]) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.arc(p[0], p[1], r, q - Math.PI / 2, q); ctx.closePath(); ctx.fill(); }
    ring(ctx, p, r, 'teal', a, 1.6);
  }

  function sagAnatomy(ctx, F, cam) {
    const t = F.t, A = F.A, X = 925;
    const la = fio(t, 10.4, T.lab1, 0.5, 0.3);   // points de repère
    const ll = fio(t, 10.6, T.lab1, 0.4, 0.3);   // étiquettes des repères
    if (la > 0.004) {
      const pts = [A.skull('mastoid'), A.crest(0.8), A.crest(0.88), A.sacCrest(-45), A.sacCrest(-25)];
      for (let i = 4; i <= 12; i++) pts.push(A.ribAngle(i));
      for (const p of pts) { const s = cam.w2s(p); ring(ctx, s, 4.5, 'white', 0.75 * la, 1.2); dot(ctx, s, 1.6, 'white', la); }
    }
    const capA = ll * smooth(seg(t, 12.1, 12.4));
    tag(ctx, cam.w2s(A.skull('mastoid')), [X, 300], [{ s: 'PROCESSUS MASTOÏDE', w: 600 }, { s: '← longissimus capitis', size: 13, c: C_LG, a: capA / Math.max(ll, 1e-6), ls: 0.5 }], { a: ll, id: 's2lmM' });
    tag(ctx, cam.w2s(A.ribAngle(9)), [X, 470], [{ s: 'ANGLES COSTAUX', w: 600 }], { a: ll, id: 's2lmR' });
    tag(ctx, cam.w2s(A.crest(0.8)), [X, 716], [{ s: 'CRÊTE ILIAQUE', w: 600 }], { a: ll, id: 's2lmC' });
    tag(ctx, cam.w2s(A.sacCrest(-45)), [X, 776], [{ s: 'SACRUM', w: 600 }, { s: 'crête sacrée médiane', size: 13, c: 'grey', ls: 0.5 }], { a: ll, id: 's2lmS' });
    // colonnes
    const aIC = fio(t, 11.5, T.lab1, 0.35, 0.3), aLG = fio(t, 11.7, T.lab1, 0.35, 0.3), aSP = fio(t, 11.9, T.lab1, 0.35, 0.3);
    tag(ctx, cam.w2s(A.v('T5', [62, 20])), [X, 384], [{ s: 'ÉPINEUX', c: C_SP, w: 700, size: 15 }, { s: 'épineuses T11–L2 → T1–T8', size: 13, c: 'white', ls: 0.5 }], { a: aSP, lc: C_SP, id: 's2cSP' });
    tag(ctx, cam.w2s(A.v('T10', [53, 4])), [X, 540], [{ s: 'ILIOCOSTAL', c: C_IC, w: 700, size: 15 }, { s: 'crête iliaque → angles costaux', size: 13, c: 'white', ls: 0.5 }], { a: aIC, lc: C_IC, id: 's2cIC' });
    tag(ctx, cam.w2s(A.v('T12', [37, -1])), [X, 616], [{ s: 'LONGISSIMUS', c: C_LG, w: 700, size: 15 }, { s: 'sacrum → transverses, côtes', size: 13, c: 'white', ls: 0.5 }], { a: aLG, lc: C_LG, id: 's2cLG' });
    tag(ctx, cam.w2s(A.v('L4', [74, 0])), [X, 668], [{ s: 'APONÉVROSE DES ÉRECTEURS', size: 14, w: 600 }], { a: fio(t, 11.4, T.lab1, 0.35, 0.3), id: 's2apo' });
  }

  function sagErectors(ctx, F, cam, m) {
    const t = F.t, A = F.A;
    const ma = m ? fio(t, T.mech0, 18.0, 0.4, 0.3) : 0;
    const act = m ? clamp(m.FES / 1100) * ma : 0;
    for (const col of COLS) {
      const grow = E.io(seg(t, col.g[0], col.g[1]));
      if (grow <= 0) continue;
      if (col.rest) MU.drawMuscle(ctx, cam, A, col.rest, { grow, act: 0.35 * act, a: 1 - 0.25 * ma, t });
      if (col.thor) MU.drawMuscle(ctx, cam, A, col.thor, { grow, act, a: 1, t });
      const aa = 0.8 * smooth(seg(t, col.g[1] - 0.2, col.g[1] + 0.3));
      if (col.rest) MU.drawAttachments(ctx, cam, A, col.rest, { a: aa });
      if (col.thor) MU.drawAttachments(ctx, cam, A, col.thor, { a: aa });
    }
    drawAponeurosis(ctx, A, cam, smooth(seg(t, 10.9, 11.6)));
  }

  /** Vecteurs de l'antéflexion : W, d_G, ligne d'action des érecteurs, d_ES, F_ES, moments, compression. */
  function sagMech(ctx, F, cam, m) {
    const t = F.t;
    const a = fio(t, T.mech0, T.mech1, 0.3, 0.4);
    if (a <= 0.004 || !m) return;
    const k = (t0) => a * smooth(seg(t, t0, t0 + 0.3));
    const aW = k(13.5), aG = k(13.75), aE = k(13.95), aF = k(14.15), aM = k(14.35), aC = k(14.55);
    const c = cam.w2s(m.c), g = cam.w2s(m.g);
    // ligne d'action des faisceaux thoraciques (pointillés ambre)
    MU.actionLine(ctx, cam, m.L.p, m.L.u, { a: aE, len: 210, col: C_LG });
    // ligne d'action de W (verticale passant par G)
    ctx.setLineDash([3, 6]); ctx.strokeStyle = rgba('teal', 0.6 * aW); ctx.lineWidth = 1.2;
    line(ctx, g, [g[0], c[1] + 26]); ctx.setLineDash([]);
    // cote d_G : distance horizontale entre la verticale de G et le centre du disque
    if (aG > 0.004) {
      const y = c[1];
      ctx.strokeStyle = rgba('teal', aG); ctx.lineWidth = 1.5;
      line(ctx, [g[0], y], c); line(ctx, [g[0], y - 7], [g[0], y + 7]); line(ctx, [c[0], y - 7], [c[0], y + 7]);
      compo(ctx, ['d', { s: 'G', sub: true }, ' = ' + fr(m.dG / 10, 1) + ' cm'], Math.min(g[0], c[0]) - 12, y + 22, { size: 15, c: 'teal', a: aG, w: 700, bg: 0.75, align: 'right', id: 's2dG' });
    }
    // cote d_ES (perpendiculaire du centre du disque à la ligne d'action)
    if (aE > 0.004) {
      MU.leverDim(ctx, cam, m.c, m.L.p, m.L.u, { a: aE, col: C_LG, label: false });
      const f = cam.w2s(m.foot);
      compo(ctx, ['d', { s: 'ES', sub: true }, ' = ' + fr(m.dES / 10, 1) + ' cm'], f[0] + 16, f[1] + 30, { size: 15, c: C_LG, a: aE, w: 700, bg: 0.75, id: 's2dES' });
    }
    // arcs de moment opposés autour du disque (gravité : fléchissant ; érecteurs : extenseur)
    if (aM > 0.004) {
      MU.momentArc(ctx, c, 46, m.MG, { a: aM, col: 'teal', start: -Math.PI / 2 - 0.12, Mref: 150, lw: 2.5 });
      MU.momentArc(ctx, c, 46, -m.MG, { a: aM, col: C_LG, start: -Math.PI / 2 + 0.12, Mref: 150, lw: 2.5 });
    }
    // compression : composante de (W + F_ES) selon la normale du disque
    if (aC > 0.004) {
      const R = vlen(m.Fv), uR = vnorm(m.Fv);
      MU.forceVector(ctx, cam, m.c, uR, R, { a: 0.55 * aC, col: 'white', toPoint: true, dash: [6, 5], lw: 1.6, head: 10, noGlow: true });
      const fv = MU.forceVector(ctx, cam, m.c, vmul(m.D.n, -1), m.C, { a: aC, col: 'white', toPoint: true, lw: 4, head: 16 });
      if (fv) {
        const mid = vlerp(fv.from, fv.to, 0.45), d = vnorm(vsub(fv.to, fv.from));
        let nrm = perp(d); if (nrm[0] > 0) nrm = vmul(nrm, -1);
        compo(ctx, ['C = ' + frN(m.C) + ' N'], mid[0] + nrm[0] * 16, mid[1] + nrm[1] * 16 + 5, { size: 15, c: 'white', a: aC, w: 700, bg: 0.75, align: 'right', id: 's2C' });
      }
    }
    // F_ES le long de la ligne d'action, appliquée au pied de la perpendiculaire
    if (aF > 0.004) {
      const fv = MU.forceVector(ctx, cam, m.foot, m.uDown, m.FES, { a: aF, col: C_LG, toPoint: true, lw: 4, head: 16 });
      if (fv) {
        const mid = vlerp(fv.from, fv.to, 0.4);
        compo(ctx, ['F', { s: 'ES', sub: true }, ' = ' + frN(m.FES) + ' N'], mid[0] + 18, mid[1], { size: 15, c: C_LG, a: aF, w: 700, bg: 0.75, id: 's2FES' });
      }
    }
    // W au centre de masse
    MU.forceVector(ctx, cam, m.g, [0, 1], W_HAT, { a: aW, col: 'teal', lw: 4, head: 16 });
    comSymbol(ctx, g, 7, aW);
    compo(ctx, ['W = ' + W_HAT + ' N'], g[0] - 14, g[1] + 34, { size: 15, c: 'teal', a: aW, w: 700, bg: 0.75, align: 'right', id: 's2W' });
    compo(ctx, ['G'], g[0] - 14, g[1] - 6, { size: 15, c: 'teal', a: aW, w: 700, bg: 0.75, align: 'right', id: 's2G' });
    // appui : disque L4/L5
    dot(ctx, c, 6, 'bg', 0.9 * aW); ring(ctx, c, 6, 'teal', aW, 2); dot(ctx, c, 2.4, 'white', aW);
  }

  // =========================================================================
  //  VUE FRONTALE POSTÉRIEURE (repère propre, mm)
  // =========================================================================
  const COR_LEVELS = ['T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5'];
  // bw : largeur du corps ; sap : demi-écart des processus articulaires sup. ; tp : demi-portée des processus
  // costiformes / transverses (L3 le plus long) ; tpY, tpW, tpUp : niveau, épaisseur, relèvement de la pointe
  const COR_DIM = {
    T11: { bw: 34, sap: 10, tp: 25, tpY: -8, tpW: 7, tpUp: 5, sp: 4.5, spBot: 18 },
    T12: { bw: 37, sap: 11, tp: 19, tpY: -7, tpW: 6.5, tpUp: 3, sp: 5, spBot: 9 },
    L1: { bw: 40, sap: 13, tp: 34, tpY: -3, tpW: 8, tpUp: 0, sp: 5, spBot: 6 },
    L2: { bw: 42, sap: 14, tp: 40, tpY: -3, tpW: 8.5, tpUp: 0, sp: 5, spBot: 6 },
    L3: { bw: 45, sap: 15, tp: 47, tpY: -3, tpW: 9, tpUp: 0, sp: 5, spBot: 6 },
    L4: { bw: 48, sap: 16.5, tp: 43, tpY: -4, tpW: 9, tpUp: 3, sp: 5, spBot: 6 },
    L5: { bw: 51, sap: 18, tp: 44, tpY: -6, tpW: 11, tpUp: 7, sp: 4.5, spBot: 4, cone: true },
  };
  // part de l'inclinaison latérale portée par le disque SOUS chaque vertèbre (somme = 1, T12/L1 → L5/S1)
  const BEND_SHARE = { T11: 0, T12: 0.10, L1: 0.18, L2: 0.20, L3: 0.22, L4: 0.18, L5: 0.12 };
  // côtes 12 et 11 (repère de T12 / T11, côté droit ; miroir pour le gauche) : ligne médiane et épaisseur (mm)
  const RIBS_F = {
    12: { v: 'T12', pts: [[17, -3], [30, -1], [48, 8], [68, 22], [88, 38], [104, 52]], w: [9, 9, 8.5, 7.5, 6, 4] },
    11: { v: 'T11', pts: [[16, -3], [30, 0], [52, 11], [78, 28], [104, 47], [122, 62]], w: [9, 9, 8.5, 7.5, 6, 4] },
  };
  // crête iliaque (côté droit) : de l'EIPS (u = 0) vers le dehors (u = 1)
  const CREST_F = [[42, 16], [50, 0], [60, -14], [74, -27], [92, -41], [112, -51], [128, -50], [140, -38], [147, -16], [146, 8]];
  // aile iliaque (côté droit) : crête, bord latéral, région supra-acétabulaire, grande incisure ischiatique, EIPI, EIPS
  const ILIUM_F = [[42, 16, 4], [50, 0, 6], [60, -14, 10], [74, -27, 14], [92, -41, 18], [112, -51, 16], [128, -50, 12], [140, -38, 10],
    [147, -16, 10], [146, 8, 10], [140, 36, 16], [127, 60, 14], [112, 80, 12], [94, 90, 8], [82, 86, 8], [75, 72, 10], [64, 58, 10],
    [53, 47, 5], [47, 32, 4]];
  const SACRUM_F = [[-24, -9, 2], [-13, -4, 2], [0, -2, 3], [13, -4, 2], [24, -9, 2], [33, -2, 3], [47, 4, 4], [49, 18, 6], [46, 34, 8],
    [40, 50, 10], [30, 68, 10], [18, 84, 8], [8, 96, 4], [0, 102, 3], [-8, 96, 4], [-18, 84, 8], [-30, 68, 10], [-40, 50, 10],
    [-46, 34, 8], [-49, 18, 6], [-47, 4, 4], [-33, -2, 3]];
  const HIP_F = [88, 96]; // centre de la tête fémorale (côté droit)

  /** Point et tangente à l'abscisse curviligne relative u d'une polyligne. */
  function along(pts, u) {
    let tot = 0; const Ls = [0];
    for (let i = 1; i < pts.length; i++) { tot += vlen(vsub(pts[i], pts[i - 1])); Ls.push(tot); }
    const target = clamp(u) * tot;
    let i = 1; while (i < pts.length - 1 && Ls[i] < target) i++;
    const f = (target - Ls[i - 1]) / ((Ls[i] - Ls[i - 1]) || 1);
    return { p: vlerp(pts[i - 1], pts[i], f), d: vnorm(vsub(pts[i], pts[i - 1])), i, f };
  }
  const mir = (p, s) => [p[0] * s, p[1]];

  /** Chaîne vertébrale frontale (S1 fixe) ; inclinaison répartie sur les disques T12/L1 → L5/S1. */
  function corFrames(bend) {
    const out = {}; let p = [0, 0], ang = 0;
    for (let k = COR_LEVELS.length - 1; k >= 0; k--) {
      const n = COR_LEVELS[k], L = LV[IX[n]], half = L.below / 2;
      const disc = vadd(p, vrot([0, -half], ang));
      ang += (BEND_SHARE[n] || 0) * bend * DEG;
      const bot = vadd(disc, vrot([0, -half], ang));
      const o = vadd(bot, vrot([0, -L.H / 2], ang));
      out[n] = { n, o, ang, x: [Math.cos(ang), Math.sin(ang)], y: [-Math.sin(ang), Math.cos(ang)], H: L.H, below: L.below, disc, d: COR_DIM[n] };
      p = vadd(o, vrot([0, -L.H / 2], ang));
    }
    return out;
  }
  /** API d'ancrages frontaux (fonctions pures), passée au moteur musculaire. */
  function corAnchors(fr, rest) {
    const FA = {
      fr, rest,
      v: (n, p) => toW(fr[n], p),
      tpTip: (n, s) => { const d = COR_DIM[n]; return toW(fr[n], [s * (d.tp - 1.5), d.tpY - d.tpUp]); },
      /** côte k (11|12), u = 0 tête → 1 pointe ; off : décalage vers le bord inférieur (en demi-épaisseurs) */
      rib: (k, u, s, off) => {
        const R = RIBS_F[k], q = along(R.pts, u), w = lerp(R.w[q.i - 1], R.w[q.i], q.f);
        let nrm = perp(q.d); if (nrm[1] < 0) nrm = vmul(nrm, -1);
        return toW(fr[R.v], mir(vadd(q.p, vmul(nrm, (off || 0) * w * 0.5)), s));
      },
      crest: (u, s) => mir(along(CREST_F, u).p, s),
      ilioLig: (s, u) => vlerp(FA.tpTip('L5', s), FA.crest(0.31, s), u),
      /** milieu d'un faisceau ; côté relâché : le faisceau se détend (léger ventre vers le dehors) */
      mid: (e0, e1, s) => {
        const p0 = e0(FA), p1 = e1(FA), m = vlerp(p0, p1, 0.5);
        if (!FA.rest) return m;
        const slack = vlen(vsub(e1(FA.rest), e0(FA.rest))) - vlen(vsub(p1, p0));
        if (slack <= 0) return m;
        let nrm = vnorm(perp(vsub(p1, p0))); if (nrm[0] * s < 0) nrm = vmul(nrm, -1);
        return vadd(m, vmul(nrm, Math.min(9, 1.2 * slack)));
      },
    };
    return FA;
  }
  const COR_REST = corAnchors(corFrames(0), null);

  // CARRÉ DES LOMBES : 3 groupes de faisceaux par côté
  function qlFas(e0, e1, w, s) { return { path: [e0, (A) => A.mid(e0, e1, s), e1], w, fibers: 3, e0, e1 }; }
  function qlSpecs(s) {
    const r12 = (u) => (A) => A.rib(12, u, s, 1), cr = (u) => (A) => A.crest(u, s), tp = (n) => (A) => A.tpTip(n, s);
    return {
      // ilio-costaux : crête iliaque postérieure + ligament ilio-lombaire → bord inférieur de la 12e côte
      ic: { group: 'erector', color: C_IC, tendon: 0.08, fascicles: [
        qlFas((A) => A.ilioLig(s, 0.62), r12(0.2), 5, s), qlFas(cr(0.37), r12(0.31), 6, s),
        qlFas(cr(0.43), r12(0.42), 6, s), qlFas(cr(0.49), r12(0.53), 6, s)] },
      // ilio-transversaires : crête → sommets des processus costiformes L1–L4
      it: { group: 'erector', color: C_LG, tendon: 0.08, fascicles: [
        qlFas(cr(0.33), tp('L4'), 5, s), qlFas(cr(0.35), tp('L3'), 5, s), qlFas(cr(0.37), tp('L2'), 5, s), qlFas(cr(0.39), tp('L1'), 5, s)] },
      // costo-transversaires : 12e côte → processus costiformes L2–L4
      ct: { group: 'erector', color: C_SP, tendon: 0.08, fascicles: [
        qlFas(r12(0.36), tp('L2'), 4.5, s), qlFas(r12(0.45), tp('L3'), 4.5, s), qlFas(r12(0.54), tp('L4'), 4.5, s)] },
    };
  }
  const QL = { '-1': qlSpecs(-1), 1: qlSpecs(1) };
  const QL_GROUPS = ['ic', 'it', 'ct'];
  /** Allongement relatif moyen d'un groupe de faisceaux (L / L0 − 1). */
  function strainOf(FA, spec) {
    let s = 0;
    for (const f of spec.fascicles) s += vlen(vsub(f.e1(FA), f.e0(FA))) / vlen(vsub(f.e1(FA.rest), f.e0(FA.rest))) - 1;
    return s / spec.fascicles.length;
  }
  /** État frontal de la frame (fonction pure de l'inclinaison). */
  function corState(bend) {
    const FA = corAnchors(corFrames(bend), COR_REST);
    const st = {};
    for (const s of [-1, 1]) { st[s] = {}; for (const k of QL_GROUPS) st[s][k] = strainOf(FA, QL[s][k]); }
    const T12 = FA.fr.T12;
    const tilt = Math.atan2(T12.x[1], T12.x[0]) / DEG;          // inclinaison mesurée de T12 (°)
    const conv = bend >= 0 ? -1 : 1;                              // côté convexe (gauche si inclinaison à droite)
    return { FA, st, tilt, conv, bend };
  }

  // ---- dessin des os (vue postérieure)
  const W2S = (cam, p, r) => { const s = cam.w2s(p); return [s[0], s[1], (r || 0) * cam.sc]; };
  function boneFill(ctx, a, k) {
    ctx.fillStyle = rgba('bone', 0.88 * a); ctx.fill();
    ctx.strokeStyle = rgba('cyan', (k || 0.55) * a); ctx.lineWidth = 1.4; ctx.stroke();
  }
  function localPath(ctx, cam, F, pts) { roundedPath(ctx, pts.map((p) => W2S(cam, toW(F, p), p[2]))); }
  function archPts(d, H, below) {
    const h = H / 2, s = d.sap, iapBot = h + below + 5;
    const R = [[0, -h + 3, 2], [s - 6, -h + 1, 2], [s - 5, -h - 5, 1.5], [s - 1, -h - 8, 2], [s + 5, -h - 5, 2.5], [s + 6, -h + 5, 2],
      [s + 2, h - 3, 3], [s + 1, iapBot - 6, 2], [s - 4, iapBot, 2.5], [s - 9, iapBot - 5, 2], [5, h + 3, 2]];
    return [...R, ...R.slice(1).reverse().map((p) => [-p[0], p[1], p[2]])];
  }
  function tpPts(d, s) {
    const x0 = d.sap + 2, w0 = d.tpW * (d.cone ? 1.5 : 1.1), w1 = d.tpW * (d.cone ? 0.8 : 0.9), ty = d.tpY - d.tpUp;
    return [[x0, d.tpY - w0 / 2, 2], [d.tp - 3, ty - w1 / 2, 3], [d.tp + 1, ty, 3], [d.tp - 3, ty + w1 / 2, 3], [x0, d.tpY + w0 / 2, 2]].map((p) => [p[0] * s, p[1], p[2]]);
  }
  function drawBodies(ctx, cam, fr, a) {
    for (const n of COR_LEVELS) {
      const F = fr[n], d = F.d, h = F.H / 2, w = d.bw / 2, da = n === 'T11' ? 0.55 : 1;
      localPath(ctx, cam, F, [[-w, -h, 3], [w, -h, 3], [w - 1.8, 0, 30], [w, h, 3], [-w, h, 3], [-w + 1.8, 0, 30]]);
      ctx.fillStyle = rgba('cyan', 0.05 * a * da); ctx.fill();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba('cyan', 0.38 * a * da); ctx.lineWidth = 1.1; ctx.stroke(); ctx.setLineDash([]);
    }
    // disques (entre corps adjacents) ; L5/S1 : plateau de S1 (largeur 50 mm)
    for (let k = 0; k < COR_LEVELS.length; k++) {
      const up = fr[COR_LEVELS[k]], lo = fr[COR_LEVELS[k + 1]];
      const wu = up.d.bw / 2, hu = up.H / 2;
      const p1 = toW(up, [-wu, hu]), p2 = toW(up, [wu, hu]);
      const p3 = lo ? toW(lo, [lo.d.bw / 2, -lo.H / 2]) : [25, 0], p4 = lo ? toW(lo, [-lo.d.bw / 2, -lo.H / 2]) : [-25, 0];
      const bulge = (q1, q2, sgn) => { const m = vlerp(q1, q2, 0.5), u = vnorm(vsub(q2, q1)); return vadd(m, vmul([u[1], -u[0]], sgn * 1.2)); };
      const pts = [p1, p2, bulge(p2, p3, 1), p3, p4, bulge(p4, p1, 1)].map((p, i) => W2S(cam, p, i === 2 || i === 5 ? 4 : 0.6));
      roundedPath(ctx, pts);
      const da = k === 0 ? 0.55 : 1;
      ctx.fillStyle = rgba('cyan', 0.13 * a * da); ctx.fill(); ctx.strokeStyle = rgba('cyan', 0.36 * a * da); ctx.lineWidth = 1; ctx.stroke();
    }
  }
  function drawPelvis(ctx, cam, a) {
    // têtes fémorales (discrètes)
    for (const s of [-1, 1]) {
      const c = cam.w2s(mir(HIP_F, s));
      ctx.beginPath(); ctx.arc(c[0], c[1], 22 * cam.sc, 0, Math.PI * 2);
      ctx.fillStyle = rgba('bone', 0.5 * a); ctx.fill(); ctx.strokeStyle = rgba('cyan', 0.25 * a); ctx.lineWidth = 1.2; ctx.stroke();
    }
    // sacrum : crête sacrée médiane, trous sacrés postérieurs, hiatus
    roundedPath(ctx, SACRUM_F.map((p) => W2S(cam, p, p[2]))); boneFill(ctx, a, 0.55);
    for (const [y, x] of [[14, 15.5], [31, 14.5], [48, 12.5], [64, 10]]) for (const s of [-1, 1]) {
      const c = cam.w2s([x * s, y]); ctx.beginPath(); ctx.ellipse(c[0], c[1], 3.2 * cam.sc, 4.2 * cam.sc, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba('bg', 0.85 * a); ctx.fill(); ctx.strokeStyle = rgba('cyan', 0.4 * a); ctx.lineWidth = 1; ctx.stroke();
    }
    for (const y of [10, 27, 44, 60]) { roundedPath(ctx, [[-3.5, y - 5, 2], [3.5, y - 5, 2], [3.5, y + 5, 2], [-3.5, y + 5, 2]].map((p) => W2S(cam, p, p[2]))); boneFill(ctx, a, 0.6); }
    const hz = cam.w2s([0, 86]); ctx.beginPath(); ctx.ellipse(hz[0], hz[1], 5 * cam.sc, 7 * cam.sc, 0, Math.PI, 0);
    ctx.strokeStyle = rgba('cyan', 0.45 * a); ctx.lineWidth = 1.2; ctx.stroke();
    // ailes iliaques
    for (const s of [-1, 1]) {
      roundedPath(ctx, ILIUM_F.map((p) => W2S(cam, mir(p, s), p[2]))); boneFill(ctx, a, 0.55);
      // crête iliaque soulignée (lèvre)
      ctx.strokeStyle = rgba('cyan', 0.75 * a); ctx.lineWidth = 2;
      smoothPath(ctx, CREST_F.map((p) => cam.w2s(mir(p, s)))); ctx.stroke();
    }
  }
  function drawRib(ctx, cam, FA, k, s, a) {
    const R = RIBS_F[k], top = [], bot = [];
    for (let i = 0; i <= 24; i++) { const u = i / 24; top.push(FA.rib(k, u, s, -1)); bot.push(FA.rib(k, u, s, 1)); }
    polyPath(ctx, [...top, ...bot.reverse()].map((p) => cam.w2s(p)), true);
    ctx.fillStyle = rgba('bone', 0.88 * a); ctx.fill(); ctx.strokeStyle = rgba('cyan', 0.55 * a); ctx.lineWidth = 1.3; ctx.stroke();
    void R;
  }
  function drawArches(ctx, cam, fr, a) {
    for (let k = COR_LEVELS.length - 1; k >= 0; k--) {
      const n = COR_LEVELS[k], F = fr[n], d = F.d, h = F.H / 2, va = n === 'T11' ? 0.55 * a : a;
      for (const s of [-1, 1]) { localPath(ctx, cam, F, tpPts(d, s)); boneFill(ctx, va); }
      localPath(ctx, cam, F, archPts(d, F.H, F.below)); boneFill(ctx, va, 0.6);
      // processus mamillaires (bord postérieur des processus articulaires supérieurs)
      for (const s of [-1, 1]) { const c = cam.w2s(toW(F, [s * (d.sap + 4.5), -h - 3])); dot(ctx, c, 1.6 * cam.sc, 'bone', va); ring(ctx, c, 1.6 * cam.sc, 'cyan', 0.5 * va, 1); }
      // épineuse (médiane)
      const sp = d.sp, top = -h + (d.spBot > 10 ? 4 : 2), bot = h + d.spBot;
      localPath(ctx, cam, F, [[-sp + 0.5, top, 2], [sp - 0.5, top, 2], [sp + 0.8, bot - 3, 3], [0, bot + 0.5, 3], [-sp - 0.8, bot - 3, 3]]);
      boneFill(ctx, va, 0.7);
    }
  }
  function drawIlioLig(ctx, cam, FA, a) {
    if (a <= 0.004) return;
    for (const s of [-1, 1]) {
      const p0 = FA.tpTip('L5', s), p1 = FA.crest(0.31, s), p2 = mir([57, 4], s);
      for (const [q, w] of [[p1, 4.5], [p2, 3.5]]) {
        const A0 = cam.w2s(vadd(p0, [0, -1.5])), B0 = cam.w2s(q);
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba('white', 0.18 * a); ctx.lineWidth = w * cam.sc; line(ctx, A0, B0);
        ctx.strokeStyle = rgba('white', 0.6 * a); ctx.lineWidth = 1; ctx.setLineDash([5, 3]); line(ctx, A0, B0); ctx.setLineDash([]);
      }
    }
  }

  function drawCor(ctx, F, cam) {
    const t = F.t;
    if (t < 17.95 || t > 22.65) return;
    const cs = F.M.s2cor || corState(F.S.latBend);
    const FA = cs.FA, fr = FA.fr;
    drawBodies(ctx, cam, fr, 1);
    drawPelvis(ctx, cam, 1);  // têtes fémorales, sacrum, ailes iliaques (avant les faisceaux pour la crête… redessinée ci-dessous)
    // carré des lombes (en avant des processus costiformes et des côtes)
    const grow = E.io(seg(t, 18.7, 19.5));
    const bendA = clamp(Math.abs(cs.bend) / 3);
    for (const s of [-1, 1]) {
      const conv = s === cs.conv;
      for (const k of QL_GROUPS) {
        const e = cs.st[s][k];
        const act = conv ? clamp(e / 0.05) : 0.12 * (1 - bendA);
        MU.drawMuscle(ctx, cam, FA, QL[s][k], { grow, act, a: (conv ? 1 : 1 - 0.35 * bendA) * (1 - smooth(seg(t, 21.7, 22.0))), t });
      }
    }
    // crêtes iliaques redessinées par-dessus les origines
    for (const s of [-1, 1]) { ctx.strokeStyle = rgba('cyan', 0.75); ctx.lineWidth = 2; smoothPath(ctx, CREST_F.map((p) => cam.w2s(mir(p, s)))); ctx.stroke(); }
    for (const s of [-1, 1]) { drawRib(ctx, cam, FA, 11, s, 0.5); drawRib(ctx, cam, FA, 12, s, 1); }
    drawIlioLig(ctx, cam, FA, smooth(seg(t, 18.45, 18.8)));
    drawArches(ctx, cam, fr, 1);
    const qa = smooth(seg(t, 19.2, 19.6));
    for (const s of [-1, 1]) for (const k of QL_GROUPS) MU.drawAttachments(ctx, cam, FA, QL[s][k], { a: 0.75 * qa });
    corHinge(ctx, F, cam, cs);
    corTension(ctx, F, cam, cs);
    corBendGauge(ctx, F, cam, cs);
    corLabels(ctx, F, cam, cs);
  }
  /** Charnière thoraco-lombaire T12–L1 surlignée. */
  function corHinge(ctx, F, cam, cs) {
    const a = fio(F.t, 18.7, 22.3, 0.4, 0.3);
    if (a <= 0.004) return;
    const T12 = cs.FA.fr.T12, L1 = cs.FA.fr.L1;
    const p1 = toW(T12, [-T12.d.bw / 2 - 3, T12.H / 2 - 2]), p2 = toW(T12, [T12.d.bw / 2 + 3, T12.H / 2 - 2]);
    const p3 = toW(L1, [L1.d.bw / 2 + 3, -L1.H / 2 + 2]), p4 = toW(L1, [-L1.d.bw / 2 - 3, -L1.H / 2 + 2]);
    roundedPath(ctx, [p1, p2, p3, p4].map((p) => W2S(cam, p, 3)));
    ctx.strokeStyle = rgba('cyan', 0.18 * a); ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = rgba('cyan', 0.95 * a); ctx.lineWidth = 2; ctx.stroke();
    for (const s of [-1, 1]) { const c = cam.w2s(toW(T12, [s * (T12.d.sap - 4), T12.H / 2 + T12.below + 1])); ring(ctx, c, 7, 'cyan', 0.9 * a, 1.6); }
  }
  /** Vecteurs de tension (côté convexe) : traction des faisceaux sur la 12e côte et les processus costiformes. */
  function corTension(ctx, F, cam, cs) {
    const a = fio(F.t, 19.4, 21.75, 0.3, 0.3);
    if (a <= 0.004) return;
    const s = cs.conv, FA = cs.FA;
    for (const k of ['ic', 'it']) {
      const e = cs.st[s][k], ka = a * clamp(e / 0.015);
      if (ka <= 0.004) continue;
      for (const f of QL[s][k].fascicles) {
        const p1 = cam.w2s(f.e1(FA)), p0 = cam.w2s(f.e0(FA)), u = vnorm(vsub(p0, p1));
        const len = 14 + 70 * clamp(e / 0.08);
        arrow(ctx, p1, vadd(p1, vmul(u, len)), 'teal', ka, { lw: 2.6, head: 10, outline: true });
      }
    }
  }
  /** Inclinaison de T12 (mesurée sur la géométrie) par rapport à la verticale. */
  function corBendGauge(ctx, F, cam, cs) {
    const a = fio(F.t, 19.3, 21.8, 0.3, 0.3) * clamp(Math.abs(cs.tilt) / 1.5);
    if (a <= 0.004) return;
    const T12 = cs.FA.fr.T12, o = cam.w2s(T12.o), R = 62 * cam.sc;
    const up = [-T12.y[0], -T12.y[1]];
    ctx.setLineDash([5, 5]); ctx.strokeStyle = rgba('white', 0.6 * a); ctx.lineWidth = 1.2;
    line(ctx, o, [o[0], o[1] - R - 10]); ctx.setLineDash([]);
    ctx.strokeStyle = rgba('teal', a); ctx.lineWidth = 2;
    line(ctx, o, vadd(o, vmul(up, R + 10)));
    const a0 = -Math.PI / 2, a1 = Math.atan2(up[1], up[0]);
    ctx.beginPath(); ctx.arc(o[0], o[1], R - 12, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    const lp = vadd(o, vmul(vnorm(vadd([0, -1], up)), R - 2));
    compo(ctx, [fr(Math.abs(cs.tilt), 1) + '°'], lp[0] + 14, lp[1] + 2, { size: 15, c: 'teal', a, w: 700, bg: 0.75, id: 's2tilt' });
  }
  function corLabels(ctx, F, cam, cs) {
    const t = F.t, FA = cs.FA;
    const ab = fio(t, T.corLab0, T.corLab1, 0.3, 0.3);
    const ag = fio(t, 19.05, T.corLab1, 0.3, 0.3);
    const ac = fio(t, 19.6, T.corLab1, 0.3, 0.3);
    const XL = 330, XR = 950, S = (p) => cam.w2s(p);
    // gauche : carré des lombes et ses 3 groupes
    const L = -1;
    const fm = (k, i, u) => { const f = QL[L][k].fascicles[i]; return S(vlerp(f.e0(FA), f.e1(FA), u)); };
    text(ctx, 'CARRÉ DES LOMBES', XL + 12, 372, { size: 16, c: 'amber', a: ag, w: 700, align: 'right', id: 's2qlT' });
    tag(ctx, fm('ct', 0, 0.35), [XL, 420], [{ s: 'costo-transversaires', c: C_SP, w: 600 }], { a: ag, align: 'right', lc: C_SP, id: 's2qlC' });
    tag(ctx, fm('ic', 2, 0.3), [XL, 470], [{ s: 'faisceaux ilio-costaux', c: C_IC, w: 600 }], { a: ag, align: 'right', lc: C_IC, id: 's2qlI' });
    tag(ctx, fm('it', 1, 0.45), [XL, 520], [{ s: 'ilio-transversaires', c: C_LG, w: 600 }], { a: ag, align: 'right', lc: C_LG, id: 's2qlT2' });
    const conv = cs.conv, sideName = (s) => (s < 0 ? 'GAUCHE' : 'DROIT');
    // états des deux côtés pendant l'inclinaison
    tag(ctx, S(FA.crest(0.5, conv)), [conv < 0 ? XL : XR, 650], [{ s: 'CÔTÉ CONVEXE (' + sideName(conv) + ')', c: 'teal', w: 700 }, { s: 'hauban tendu', c: 'white', size: 13, ls: 0.5 }],
      { a: ac, align: conv < 0 ? 'right' : 'left', lc: 'teal', id: 's2cvx' });
    const f2 = QL[-conv].ic.fascicles[2];
    tag(ctx, S(vlerp(f2.e0(FA), f2.e1(FA), 0.75)), [conv < 0 ? XR : XL, 548], [{ s: 'CÔTÉ CONCAVE (' + sideName(-conv) + ')', c: 'grey', w: 700 }, { s: 'relâché', c: 'white', size: 13, ls: 0.5 }],
      { a: ac, align: conv < 0 ? 'left' : 'right', id: 's2ccv' });
    // droite : repères osseux
    const R = 1, T12 = FA.fr.T12;
    tag(ctx, S(toW(T12, [T12.d.bw / 2 + 3, T12.H / 2 + T12.below / 2])), [XR, 300], [{ s: 'CHARNIÈRE T12–L1', c: 'cyan', w: 700 }], { a: ab, lc: 'cyan', id: 's2hin' });
    tag(ctx, S(FA.rib(12, 0.78, R, 0)), [XR, 360], [{ s: '12e CÔTE', w: 600 }, { s: 'oblique en bas et en dehors', size: 13, c: 'grey', ls: 0.5 }], { a: ab, id: 's2r12' });
    tag(ctx, S(FA.tpTip('L3', R)), [XR, 450], [{ s: 'PROCESSUS COSTIFORME L3', w: 600 }, { s: 'le plus long', size: 13, c: 'grey', ls: 0.5 }], { a: ab, id: 's2tp3' });
    tag(ctx, S(FA.crest(0.62, R)), [XR, 622], [{ s: 'CRÊTE ILIAQUE', w: 600 }], { a: ab, id: 's2crt' });
    tag(ctx, S(vlerp(FA.tpTip('L5', R), FA.crest(0.31, R), 0.5)), [XR, 690], [{ s: 'LIGAMENT ILIO-LOMBAIRE', w: 600 }], { a: ab, id: 's2ilg' });
    tag(ctx, S([22, 40]), [XR, 770], [{ s: 'SACRUM', w: 600 }], { a: ab, id: 's2sac' });
  }

  P2.views.cor = {
    /** Caméra fixe de la vue frontale : T11 → têtes fémorales. */
    camera() { return P2.layout.camFrom({ f: [0, -62], s: [640, 575], sc: 1.85 }); },
    draw: drawCor,
  };

  // =========================================================================
  //  PANNEAU
  // =========================================================================
  function chip(ctx, x, y, col, a) { ctx.fillStyle = rgba(col, a); ctx.fillRect(x, y - 10, 10, 10); }

  function panelErectors(ctx, F, a) {
    const P = F.panel, t = F.t, x = P.PX + 30, Wd = P.PW - 60;
    P.header(ctx, 'ÉRECTEURS DU RACHIS', 'haubans postérieurs', a, 's2p1', 'amber');
    let y = P.PY + 98;
    y += P.wrap(ctx, 'Trois colonnes parallèles, tendues du bassin au thorax, au cou et au crâne.', x, y, Wd, { size: 14, c: 'white', a, id: 's2p1i' });
    y += 10;
    y += P.attachRow(ctx, 'ORIGINES', 'crête sacrée médiane · crête iliaque postérieure · épineuses lombaires basses · aponévrose des érecteurs', x, y, a, { id: 's2p1o' });
    y += 16;
    const cols = [
      [C_IC, 'ILIOCOSTAL', 'colonne latérale', '→ angles costaux 4 à 12 ; iliocostal du cou → processus transverses C4–C6', 10.6],
      [C_LG, 'LONGISSIMUS', 'colonne intermédiaire', '→ processus transverses T1–T12, côtes 3 à 12 ; → processus mastoïde (longissimus capitis)', 10.85],
      [C_SP, 'ÉPINEUX', 'colonne médiale', 'épineuses T11–L2 → épineuses T1–T8', 11.1],
    ];
    for (const [col, name, pos, ins, t0] of cols) {
      const ca = a * smooth(seg(t, t0, t0 + 0.35));
      chip(ctx, x, y, col, ca);
      const w = text(ctx, name, x + 18, y, { size: 15, c: col, a: ca, w: 700, ls: 1.5, id: 's2p1n' + name });
      text(ctx, pos, x + 30 + Math.max(w, 120), y, { size: 12, c: 'grey', a: ca, ls: 1, id: 's2p1p' + name });
      y += 22 + P.wrap(ctx, ins, x + 18, y + 22, Wd - 18, { size: 14, c: 'white', a: ca, id: 's2p1v' + name });
      y += 10;
    }
    y += 4;
    const na = a * smooth(seg(t, 11.4, 11.75));
    ctx.strokeStyle = rgba('grey', 0.4 * na); ctx.lineWidth = 1; line(ctx, [x, y - 8], [x + Wd, y - 8]);
    y += 10 + P.wrap(ctx, 'L’occiput n’est pas une insertion des érecteurs : il reçoit le semi-épineux de la tête (système transversaire-épineux).', x, y + 10, Wd, { size: 13, c: 'grey', a: na, id: 's2p1occ' });
    y += 12;
    y += P.attachRow(ctx, 'ACTION', 'bilatérale : extension du rachis et freinage excentrique de la flexion ; unilatérale : inclinaison homolatérale', x, y, a * smooth(seg(t, 11.8, 12.1)), { id: 's2p1a' });
    P.cite(ctx, 'Bogduk, Macintosh & Pearcy 1992 · doi:10.1097/00007632-199208000-00007', x, P.PY + P.PH - 34, a);
  }

  /** Levier du 1er genre : appui = disque L4/L5 ; bras d_G (W) et d_ES (F_ES) à l'échelle. */
  function drawLever(ctx, xf, yb, m, a) {
    const k = 9.5; // px/cm
    const xl = xf - (Math.max(0, m.dG) / 10) * k, xr = xf + (m.dES / 10) * k, fs = 0.042; // px/N
    ctx.strokeStyle = rgba('white', 0.9 * a); ctx.lineWidth = 3; ctx.lineCap = 'round'; line(ctx, [xl, yb], [xr, yb]);
    // appui
    ctx.fillStyle = rgba('bg', a); ctx.strokeStyle = rgba('white', 0.9 * a); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xf, yb + 2); ctx.lineTo(xf - 9, yb + 17); ctx.lineTo(xf + 9, yb + 17); ctx.closePath(); ctx.fill(); ctx.stroke();
    arrow(ctx, [xl, yb - 6 - W_HAT * fs], [xl, yb - 2], 'teal', a, { lw: 2.5, head: 9, noGlow: true });
    arrow(ctx, [xr, yb - 6 - m.FES * fs], [xr, yb - 2], C_LG, a, { lw: 2.5, head: 9, noGlow: true });
    text(ctx, 'W', xl - 8, yb - 12, { size: 13, c: 'teal', a, align: 'right', w: 700, id: 's2lvW' });
    compo(ctx, ['F', { s: 'ES', sub: true }], xr + 8, yb - 12, { size: 13, c: C_LG, a, w: 700, id: 's2lvF' });
    text(ctx, 'disque L4–L5', xf, yb + 34, { size: 12, c: 'grey', a, align: 'center', id: 's2lvD' });
  }

  /** F_ES(α) et C(α) tracés au fil de l'antéflexion. */
  function drawPlot(ctx, F, x0, y0, w, h, a, m) {
    const t = F.t, AMAX = 40, FMAX = 1600;
    const X = (al) => x0 + (al / AMAX) * w, Y = (f) => y0 + h - (f / FMAX) * h;
    ctx.strokeStyle = rgba('grey', 0.6 * a); ctx.lineWidth = 1; line(ctx, [x0, y0 + h], [x0 + w, y0 + h]); line(ctx, [x0, y0], [x0, y0 + h]);
    for (const f of [500, 1000, 1500]) {
      ctx.strokeStyle = rgba('grey', 0.18 * a); line(ctx, [x0, Y(f)], [x0 + w, Y(f)]);
      text(ctx, frN(f), x0 - 8, Y(f) + 4, { size: 12, c: 'grey', a, align: 'right', id: 's2plY' + f });
    }
    for (const al of [0, 10, 20, 30, 40]) {
      ctx.strokeStyle = rgba('grey', 0.6 * a); line(ctx, [X(al), y0 + h], [X(al), y0 + h + 5]);
      text(ctx, String(al), X(al), y0 + h + 19, { size: 12, c: 'grey', a, align: 'center', id: 's2plX' + al });
    }
    text(ctx, 'α (°)', x0 + w, y0 + h + 36, { size: 12, c: 'grey', a, align: 'right', id: 's2plXt' });
    text(ctx, 'N', x0 - 8, y0 - 6, { size: 12, c: 'grey', a, align: 'right', id: 's2plYt' });
    // tracé jusqu'à l'angle maximal atteint (aller), le point revient le long de la courbe (retour)
    const amax = t < 16.0 ? m.alpha : AMAX;
    const n = Math.max(1, Math.floor(amax));
    for (const [key, col, lw] of [['C', 'white', 1.6], ['FES', C_LG, 2.6]]) {
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push([X(i), Y(mechAt(i)[key])]);
      if (amax > n) pts.push([X(amax), Y(lerp(mechAt(n)[key], mechAt(n + 1)[key], amax - n))]);
      if (pts.length > 1) { ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; polyPath(ctx, pts); ctx.stroke(); }
    }
    const pF = [X(m.alpha), Y(m.FES)], pC = [X(m.alpha), Y(m.C)];
    dot(ctx, pC, 4, 'white', a); dot(ctx, pF, 5, C_LG, a); dot(ctx, pF, 2, 'white', a);
    // étiquettes des courbes : C au-dessus de sa courbe, F_ES au-dessous de la sienne (jamais entre les deux)
    const lx = Math.min(X(m.alpha) + 10, x0 + w - 36);
    compo(ctx, ['F', { s: 'ES', sub: true }], lx, pF[1] + 19, { size: 13, c: C_LG, a, w: 700, id: 's2plF' });
    compo(ctx, ['C'], lx, pC[1] - 9, { size: 13, c: 'white', a, w: 700, id: 's2plC' });
  }

  function panelMoment(ctx, F, a, m) {
    const P = F.panel, t = F.t, x = P.PX + 30, Wd = P.PW - 60;
    P.header(ctx, 'MOMENT EXTENSEUR · L4–L5', 'levier du 1er genre', a, 's2p2', 'amber');
    // formule
    text(ctx, 'M = F × d', x, P.PY + 132, { size: 40, c: 'white', a, w: 600, font: SANS, ls: 1, id: 's2p2f' });
    text(ctx, 'équilibre : M', x, P.PY + 160, { size: 13, c: 'grey', a, id: 's2p2e0' });
    compo(ctx, [{ s: 'ES', sub: true }, ' = M', { s: 'G', sub: true }, ' → F', { s: 'ES', sub: true }, ' = M', { s: 'G', sub: true }, ' / d', { s: 'ES', sub: true }],
      x + measure(ctx, 'équilibre : M', 13), P.PY + 160, { size: 13, c: 'grey', a, id: 's2p2e1' });
    drawLever(ctx, P.PX + P.PW - 130, P.PY + 120, m, a);
    // valeurs en direct
    const rows = [
      [['α'], 'ANTÉFLEXION DU TRONC', fr(m.alpha, 1), '°', 'white'],
      [['W'], 'POIDS TÊTE-BRAS-TRONC', frN(W_HAT), 'N', 'teal'],
      [['d', { s: 'G', sub: true }], 'BRAS DE LEVIER DU POIDS', fr(m.dG / 10, 1), 'cm', 'teal'],
      [['M', { s: 'G', sub: true }], 'MOMENT FLÉCHISSANT W × d', fr(m.MG, 1), 'N·m', 'teal'],
      [['d', { s: 'ES', sub: true }], 'BRAS DE LEVIER DES ÉRECTEURS', fr(m.dES / 10, 1), 'cm', C_LG],
      [['F', { s: 'ES', sub: true }], 'FORCE DES ÉRECTEURS', frN(m.FES), 'N', C_LG],
      [['d', { s: 'G', sub: true }, '/d', { s: 'ES', sub: true }], 'DÉSAVANTAGE MÉCANIQUE', fr(m.ratio, 2), '', 'white'],
      [['C'], 'COMPRESSION DU DISQUE L4–L5', frN(m.C), 'N', 'white'],
    ];
    rows.forEach((r, i) => {
      const y = P.PY + 214 + i * 31;
      compo(ctx, r[0], x, y, { size: 17, c: r[4], a, w: 700, id: 's2p2k' + i });
      text(ctx, r[1], x + 86, y - 1, { size: 12, c: 'grey', a, ls: 0.8, id: 's2p2l' + i });
      text(ctx, r[2], x + 446, y, { size: 21, c: 'white', a, align: 'right', w: 600, id: 's2p2v' + i });
      if (r[3]) text(ctx, r[3], x + 454, y, { size: 14, c: 'grey', a, id: 's2p2u' + i });
      ctx.strokeStyle = rgba('grey', 0.15 * a); ctx.lineWidth = 1; line(ctx, [x, y + 11], [x + Wd, y + 11]);
    });
    drawPlot(ctx, F, x + 46, P.PY + 480, Wd - 60, 120, a, m);
    // notes
    const m0 = mechAt(0), red = (1 - m.dES / m0.dES) * 100;
    let y = P.PY + 664;
    y += P.wrap(ctx, 'Modèle plan : W = 60 % de 70 kg, en G ; force des érecteurs = résultante de tous les extenseurs ; C = composante normale au disque.', x, y, Wd, { size: 12, c: 'grey', a, id: 's2p2n1' });
    P.wrap(ctx, 'Bras de levier des érecteurs : −' + fr(Math.max(0, red), 0) + ' % ici ; en flexion, moment maximal ≤ −18 % (Macintosh et al. 1993).', x, y, Wd, { size: 12, c: 'grey', a, id: 's2p2n2' });
  }

  function panelQL(ctx, F, a, cs) {
    const P = F.panel, t = F.t, x = P.PX + 30, Wd = P.PW - 60;
    P.header(ctx, 'CARRÉ DES LOMBES', 'hauban frontal', a, 's2p3', 'amber');
    let y = P.PY + 100;
    const sa = (k) => a * smooth(seg(t, 18.4 + 0.25 * k, 18.7 + 0.25 * k));
    text(ctx, 'TROIS GROUPES DE FAISCEAUX', x, y, { size: 12, c: 'grey', a: sa(0), ls: 1.5, w: 700, id: 's2p3g' });
    y += 24;
    const G = [[C_IC, 'ilio-costaux', 'crête → 12e côte'], [C_LG, 'ilio-transversaires', 'crête → costiformes L1–L4'], [C_SP, 'costo-transversaires', '12e côte → costiformes']];
    G.forEach(([col, n, d], i) => {
      const ga = sa(i + 1);
      ctx.strokeStyle = rgba(col, ga); ctx.lineWidth = 3; line(ctx, [x, y - 5], [x + 14, y - 5]);
      text(ctx, n, x + 24, y, { size: 14, c: col, a: ga, w: 700, id: 's2p3gn' + i });
      text(ctx, d, x + 250, y, { size: 13, c: 'white', a: ga, id: 's2p3gd' + i });
      y += 24;
    });
    y += 10;
    y += P.attachRow(ctx, 'RÔLE', 'hauban frontal : en inclinaison latérale, le côté convexe se tend et freine le mouvement ; fixe la 12e côte et la charnière thoraco-lombaire', x, y, sa(4), { id: 's2p3r' });
    // valeurs en direct
    y += 14;
    ctx.strokeStyle = rgba('grey', 0.4 * a); ctx.lineWidth = 1; line(ctx, [x, y - 14], [x + Wd, y - 14]);
    const dir = cs.tilt > 0.05 ? 'DROITE' : cs.tilt < -0.05 ? 'GAUCHE' : '';
    text(ctx, 'INCLINAISON LATÉRALE' + (dir ? ' ' + dir : ''), x, y + 10, { size: 12, c: 'grey', a, ls: 1.5, w: 700, id: 's2p3b' });
    text(ctx, fr(Math.abs(cs.tilt), 1), x + 446, y + 14, { size: 26, c: 'teal', a, align: 'right', w: 600, id: 's2p3bv' });
    text(ctx, '°', x + 452, y + 14, { size: 15, c: 'grey', a, id: 's2p3bu' });
    y += 44;
    const ic = (s) => cs.st[s].ic * 100;
    const rowsS = [[cs.conv, 'CONVEXE'], [-cs.conv, 'CONCAVE']];
    text(ctx, 'ALLONGEMENT DES FAISCEAUX ILIO-COSTAUX', x, y, { size: 12, c: 'grey', a, ls: 1, id: 's2p3e' });
    y += 26;
    rowsS.forEach(([s, nm], i) => {
      const v = ic(s), col = v > 0.05 ? 'teal' : 'grey';
      text(ctx, 'côté ' + nm.toLowerCase() + ' (' + (s < 0 ? 'gauche' : 'droit') + ')', x, y, { size: 14, c: 'white', a, id: 's2p3s' + i });
      // jauge ±10 %
      const gx = x + 250, gw = 120, gc = gx + gw / 2;
      ctx.strokeStyle = rgba('grey', 0.5 * a); ctx.lineWidth = 1; line(ctx, [gx, y - 5], [gx + gw, y - 5]); line(ctx, [gc, y - 11], [gc, y + 1]);
      const vx = gc + clamp(v / 10, -1, 1) * gw / 2;
      ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 5; line(ctx, [gc, y - 5], [vx, y - 5]);
      text(ctx, SC.fmtS(v, 1).replace('.', ',').trim() + ' %', x + 446, y, { size: 16, c: col, a, align: 'right', w: 600, id: 's2p3sv' + i });
      y += 26;
    });
    P.wrap(ctx, 'Inclinaison répartie de T12/L1 à L5/S1 (modèle) ; allongement = longueur / longueur au repos − 1, calculé sur la géométrie.', x, P.PY + P.PH - 52, Wd, { size: 12, c: 'grey', a, id: 's2p3m' });
  }

  // =========================================================================
  //  ENREGISTREMENT
  // =========================================================================
  P2.scenes.push({
    id: 's2',
    state(F) {
      const t = F.t;
      if (t >= 13.3 && t <= 18.1) F.M.s2 = mech(F.A, F.G);
      if (t >= 17.95 && t <= 22.65) F.M.s2cor = corState(F.S.latBend);
    },
    sag(ctx, F, cam) {
      const t = F.t;
      if (t < T.sag0 || t > T.sag1) return;
      const m = F.M.s2;
      sagErectors(ctx, F, cam, m);
      sagAnatomy(ctx, F, cam);
      sagMech(ctx, F, cam, m);
    },
    panel(ctx, F, pa) {
      const t = F.t;
      if (t < T.p1[0] || t > T.p3[1]) return;
      const a1 = pa * fio(t, T.p1[0], T.p1[1], 0.3, 0.3);
      if (a1 > 0.004) panelErectors(ctx, F, a1);
      const a2 = pa * fio(t, T.p2[0], T.p2[1], 0.3, 0.3);
      if (a2 > 0.004 && F.M.s2) panelMoment(ctx, F, a2, F.M.s2);
      const a3 = pa * fio(t, T.p3[0], T.p3[1], 0.3, 0.3);
      if (a3 > 0.004 && F.M.s2cor) panelQL(ctx, F, a3, F.M.s2cor);
    },
  });
  // accès en lecture (tests, autres scènes)
  P2.s2 = { mech, mechAt, corState, ES_THOR };
})(typeof window !== 'undefined' ? window : globalThis);
