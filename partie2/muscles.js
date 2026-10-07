/* =============================================================================
 *  partie2/muscles.js — moteur de rendu musculaire et de vecteurs (pur)
 *
 *  Un MUSCLE = liste de FASCICULES. Chaque fascicule = chemin d'ancrages
 *  (fonctions A => point monde, A = API d'ancrages de anatomy.js), une largeur
 *  w (mm) et un nombre de fibres. Rendu : ventre translucide + fibres
 *  lumineuses + tendons clairs aux extrémités ; croissance progressive de
 *  l'origine vers la terminaison ; onde d'activation qui parcourt les fibres.
 *
 *  Ligne d'action : segment [i, j] du chemin (par défaut : 2 derniers points).
 *  Bras de levier : distance perpendiculaire d'un centre articulaire à la ligne.
 * ========================================================================== */
(function (root) {
  'use strict';
  const SC = root.SpineCore || (typeof require === 'function' ? require('../lib/core.js') : null);
  const P2 = (root.P2 = root.P2 || {});
  const { clamp, lerp, smooth, vadd, vsub, vmul, vlen, vnorm, vlerp, vdot, perp, rgba, mix, partial, polyPath, smoothPath, text, arrow, dot, line, fmt } = SC;

  // Couleurs de la partie 2
  SC.addColors({ cobalt: '#2d72d9', amber: '#ff9f1c', crimson: '#e71d36', teal: '#2ec4b6' });
  const GROUP_COLOR = { deep: 'cobalt', erector: 'amber', flexor: 'crimson', vector: 'teal' };

  // ----------------------------------------------------------------- géométrie des chemins
  function catmull(pts, n) {
    if (pts.length < 3) { const out = []; for (let j = 0; j <= n; j++) out.push(vlerp(pts[0], pts[1], j / n)); return out; }
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
  /** Évalue les ancrages d'un fascicule → points monde. */
  const resolve = (A, fas) => fas.path.map((f) => (typeof f === 'function' ? f(A) : f));
  /** Échantillonne un chemin monde en polyligne écran lissée. */
  function screenPath(cam, ptsW, n) { return catmull(ptsW.map((p) => cam.w2s(p)), n || 10); }

  // décalage latéral d'une polyligne (fibres parallèles), effilé aux extrémités (tendons)
  function offsetPath(path, off, taper) {
    const out = [], n = path.length;
    for (let k = 0; k < n; k++) {
      const a = path[Math.max(0, k - 1)], b = path[Math.min(n - 1, k + 1)];
      const nrm = vnorm(perp(vsub(b, a)));
      const u = k / (n - 1);
      const env = taper ? Math.pow(Math.sin(Math.PI * clamp(u * 0.92 + 0.04)), 0.7) : 1;
      out.push(vadd(path[k], vmul(nrm, off * env)));
    }
    return out;
  }

  /**
   * Dessine un muscle.
   * spec = { color, fascicles: [{ path: [A=>pt,…], w (mm), fibers }], tendon (0..0.3) }
   * o = { grow (0..1), act (0..1), a (opacité), t (temps, pour l'onde), glow, belly }
   */
  function drawMuscle(ctx, cam, A, spec, o) {
    o = o || {};
    const a = o.a == null ? 1 : o.a; if (a <= 0.004) return;
    const grow = o.grow == null ? 1 : o.grow, act = o.act || 0, t = o.t || 0;
    const col = spec.color || GROUP_COLOR[spec.group] || 'cobalt';
    const sc = cam.sc;
    spec.fascicles.forEach((fas, fi) => {
      // croissance décalée par fascicule
      const nf = spec.fascicles.length;
      const g = clamp((grow * (1 + 0.35) - 0.35 * (fi / Math.max(1, nf - 1))));
      if (g <= 0) return;
      const pts = screenPath(cam, resolve(A, fas), fas.n || 10);
      const w = (fas.w || 4) * sc * (1 + 0.18 * act);
      const nfib = fas.fibers || 4;
      // ventre musculaire
      if (o.belly !== false) {
        const L = partial(offsetPath(pts, w / 2, true), g), R = partial(offsetPath(pts, -w / 2, true), g);
        polyPath(ctx, [...L, ...R.slice().reverse()], true);
        ctx.fillStyle = rgba(col, (0.16 + 0.14 * act) * a); ctx.fill();
      }
      // fibres
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let k = 0; k < nfib; k++) {
        const off = nfib === 1 ? 0 : lerp(-w / 2 + 1, w / 2 - 1, k / (nfib - 1));
        const fp = partial(offsetPath(pts, off, true), g);
        if (o.glow !== false) { smoothPath(ctx, fp); ctx.strokeStyle = rgba(col, (0.1 + 0.12 * act) * a); ctx.lineWidth = 4.5; ctx.stroke(); }
        smoothPath(ctx, fp); ctx.strokeStyle = rgba(mix(col, 'white', 0.15 + 0.35 * act), (0.6 + 0.35 * act) * a); ctx.lineWidth = 1.2; ctx.stroke();
        // onde d'activation : segment brillant qui parcourt la fibre (déterministe en t)
        if (act > 0.02 && g >= 1) {
          const ph = (t * 0.9 + k * 0.137 + fi * 0.31) % 1;
          const seg = partial(fp, Math.min(1, ph + 0.12)).slice(Math.floor(ph * fp.length));
          if (seg.length > 1) { smoothPath(ctx, seg); ctx.strokeStyle = rgba('white', 0.55 * act * a); ctx.lineWidth = 2; ctx.stroke(); }
        }
      }
      // tendons (extrémités claires)
      const tl = spec.tendon == null ? 0.1 : spec.tendon;
      if (tl > 0 && g > 0.02) {
        ctx.strokeStyle = rgba('white', 0.55 * a); ctx.lineWidth = 1.4;
        smoothPath(ctx, partial(pts, Math.min(g, tl))); ctx.stroke();
        if (g >= 1) { smoothPath(ctx, partial(pts.slice().reverse(), tl)); ctx.stroke(); }
      }
    });
  }

  /** Ancrages extrêmes (origine/terminaison) en points marqués. */
  function drawAttachments(ctx, cam, A, spec, o) {
    o = o || {}; const a = o.a == null ? 1 : o.a; if (a <= 0.004) return;
    const col = spec.color || GROUP_COLOR[spec.group] || 'cobalt';
    for (const fas of spec.fascicles) {
      const p = resolve(A, fas);
      for (const q of [p[0], p[p.length - 1]]) { const s = cam.w2s(q); dot(ctx, s, 3.2, col, a); dot(ctx, s, 1.4, 'white', a); }
    }
  }

  // ----------------------------------------------------------------- mécanique
  /** Ligne d'action d'un fascicule : {p, u} (point, direction unitaire vers la TERMINAISON → origine = sens de traction sur le point distal). */
  function lineOfAction(A, fas, ij) {
    const p = resolve(A, fas), n = p.length;
    const [i, j] = ij || fas.loa || [n - 2, n - 1];
    return { p: p[i], q: p[j], u: vnorm(vsub(p[j], p[i])) };
  }
  /** Résultante moyenne de plusieurs fascicules (directions pondérées par w). */
  function resultantLine(A, spec, ij) {
    let pm = [0, 0], um = [0, 0], ws = 0;
    for (const fas of spec.fascicles) {
      const l = lineOfAction(A, fas, ij), w = fas.w || 1;
      pm = vadd(pm, vmul(vlerp(l.p, l.q, 0.5), w)); um = vadd(um, vmul(l.u, w)); ws += w;
    }
    return { p: vmul(pm, 1 / ws), u: vnorm(um) };
  }
  /** Bras de levier signé (mm) d'une ligne (p, u) autour du centre c ; + = moment extenseur si u pointe vers le haut côté postérieur. */
  function momentArm(c, p, u) { const d = vsub(p, c); return d[0] * u[1] - d[1] * u[0]; }
  /** Pied de la perpendiculaire de c sur la ligne (p, u). */
  function foot(c, p, u) { return vadd(p, vmul(u, vdot(vsub(c, p), u))); }

  // ----------------------------------------------------------------- dessin des vecteurs
  const F_SCALE = 0.12; // px/N, échelle unique des forces de la partie 2
  /** Vecteur force en vert : origine monde p, direction unitaire u (monde), intensité N. */
  function forceVector(ctx, cam, p, u, N, o) {
    o = o || {}; const a = o.a == null ? 1 : o.a; if (a <= 0.004 || N <= 0) return null;
    const s = cam.w2s(p), L = N * (o.scale || F_SCALE);
    const e = vadd(s, vmul(vnorm(u), L));
    const from = o.toPoint ? vsub(s, vmul(vnorm(u), L)) : s, to = o.toPoint ? s : e;
    arrow(ctx, from, to, o.col || 'teal', a, { lw: o.lw || 3.5, head: o.head || 14, outline: true, dash: o.dash, noGlow: o.noGlow });
    if (o.label) text(ctx, o.label, (o.toPoint ? from : to)[0] + (o.lx || 10), (o.toPoint ? from : to)[1] + (o.ly || 4), { size: o.size || 15, c: o.col || 'teal', a, w: 700, bg: 0.75, id: o.id });
    return { from, to };
  }
  /** Arc de moment (sens trigonométrique écran si M > 0) autour d'un point écran. */
  function momentArc(ctx, c, r, M, o) {
    o = o || {}; const a = o.a == null ? 1 : o.a; if (a <= 0.004 || Math.abs(M) < 1e-6) return;
    const span = clamp(Math.abs(M) / (o.Mref || 80)) * Math.PI * 1.4 + 0.3;
    const a0 = o.start == null ? -Math.PI / 2 : o.start, a1 = a0 + (M > 0 ? -span : span);
    ctx.strokeStyle = rgba(o.col || 'teal', a); ctx.lineWidth = o.lw || 3;
    ctx.beginPath(); ctx.arc(c[0], c[1], r, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    const end = [c[0] + r * Math.cos(a1), c[1] + r * Math.sin(a1)], tg = M > 0 ? [Math.sin(a1), -Math.cos(a1)] : [-Math.sin(a1), Math.cos(a1)];
    arrow(ctx, vsub(end, vmul(tg, 10)), end, o.col || 'teal', a, { lw: o.lw || 3, head: 11, noGlow: true });
  }
  /** Cote de bras de levier : du centre c (monde) au pied de la perpendiculaire sur (p,u). */
  function leverDim(ctx, cam, c, p, u, o) {
    o = o || {}; const a = o.a == null ? 1 : o.a; if (a <= 0.004) return 0;
    const f = foot(c, p, u), d = vlen(vsub(f, c));
    const sc = cam.w2s(c), sf = cam.w2s(f);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(o.col || 'teal', 0.9 * a); ctx.lineWidth = 1.4; line(ctx, sc, sf); ctx.setLineDash([]);
    const n = vnorm(perp(vsub(sf, sc)));
    for (const q of [sc, sf]) line(ctx, vadd(q, vmul(n, -6)), vadd(q, vmul(n, 6)));
    dot(ctx, sc, 3.5, o.col || 'teal', a);
    if (o.label !== false) {
      const m = vlerp(sc, sf, 0.5);
      text(ctx, (o.prefix || 'd = ') + fmt(d / 10, 1) + ' cm', m[0] + (o.lx || 10), m[1] + (o.ly || -8), { size: o.size || 15, c: o.col || 'teal', a, w: 700, bg: 0.75, id: o.id, align: o.align });
    }
    return d;
  }
  /** Ligne d'action prolongée (pointillés fins). */
  function actionLine(ctx, cam, p, u, o) {
    o = o || {}; const a = o.a == null ? 1 : o.a; if (a <= 0.004) return;
    const L = o.len || 400;
    ctx.setLineDash([3, 6]); ctx.strokeStyle = rgba(o.col || 'teal', 0.55 * a); ctx.lineWidth = 1.2;
    line(ctx, cam.w2s(vsub(p, vmul(u, L))), cam.w2s(vadd(p, vmul(u, L)))); ctx.setLineDash([]);
  }

  P2.muscles = { GROUP_COLOR, catmull, resolve, screenPath, offsetPath, drawMuscle, drawAttachments, lineOfAction, resultantLine, momentArm, foot, F_SCALE, forceVector, momentArc, leverDim, actionLine };
  if (typeof module === 'object' && module.exports) module.exports = P2.muscles;
})(typeof window !== 'undefined' ? window : globalThis);
