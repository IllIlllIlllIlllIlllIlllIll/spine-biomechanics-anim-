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
  // ------------------------------------------------------------ moteur commun (lib/core.js)
  const SC = root.SpineCore || (typeof require === 'function' ? require('./lib/core.js') : null);
  const {
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
  } = SC;

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
    SC.beginLabels();
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
    return { t, labels: SC.labels() };
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
