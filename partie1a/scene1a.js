/* ============================================================================
 *  PARTIE 1A — Conflit zygapophysaire, transfert de charge par l'arc neural
 *  et pathomécanique de l'hyperextension lombaire (unité fonctionnelle L4–L5).
 *
 *  1920×1080 · 60 fps · 35 s = 2100 frames (0 → 2099). Rendu Canvas 2D
 *  DÉTERMINISTE : chaque image est une fonction pure de son numéro
 *  (window.seekToFrame). Ni Math.random, ni horloge.
 *
 *  Repère monde (mm), lié à L5 (fixe) : origine = centre du plateau supérieur
 *  de L5, x = postérieur (+), y = caudal (+). Écran : profil gauche (antérieur
 *  à gauche), 5 px/mm, plateau de L5 incliné de 20° (bord antérieur plus bas),
 *  gravité verticale.
 *
 *  Valeurs (storyboard validé, option A) : lordose segmentaire 12° → 15°
 *  (extension physiologique) ; disque pincé −2 mm ; hyperextension → 19°
 *  avec butée du processus articulaire inférieur (PAI) de L4 sur l'isthme de
 *  L5 à 17,5° puis contact des épineuses (Baastrup) à 19°.
 * ========================================================================== */
(function (root) {
  'use strict';
  const SC = root.SpineCore || (typeof require === 'function' ? require('../lib/core.js') : null);
  const {
    W, H, clamp, lerp, seg, smooth, E, fio, vadd, vsub, vmul, vlen, vnorm, vlerp, vdot, perp,
    rgba, mix, text, measure, line, polyPath, arrow, dot, ring, mulberry32, MONO, SANS, MINUS,
  } = SC;
  const FPS = 60, TOTAL = 2100, D2R = Math.PI / 180;

  SC.addColors({
    bg: '#0a0e14', cyan: '#00d2ff', amber: '#ffb703', crimson: '#d90429', mint: '#06d6a0',
    signal: '#ef476f', sky: '#8fe9ff', white: '#e8e4da', greyT: '#7a8ba1', grey: '#5a6b80',
    nerve: '#f2dc8c', disc: '#6fa8c8', nucleus: '#9fd3ff',
  });

  // ===========================================================================
  //  OUTILS GÉOMÉTRIQUES
  // ===========================================================================
  const rotAbout = (p, c, a) => {
    const s = Math.sin(a), co = Math.cos(a), x = p[0] - c[0], y = p[1] - c[1];
    return [c[0] + co * x - s * y, c[1] + s * x + co * y];
  };
  const rotV = (v, a) => rotAbout(v, [0, 0], a);
  const mapPts = (pts, f) => pts.map(f);
  const shoelace = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
  /** Distance d'un point à un segment. */
  function distSeg(p, a, b) {
    const ab = vsub(b, a), t = clamp(vdot(vsub(p, a), ab) / (vdot(ab, ab) || 1));
    return vlen(vsub(p, vadd(a, vmul(ab, t))));
  }
  const distPoly = (p, pts) => { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, distSeg(p, pts[i - 1], pts[i])); return d; };
  const polyLenL = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += vlen(vsub(pts[i], pts[i - 1])); return s; };
  function samplePoly(pts, f) {
    const L = polyLenL(pts) * clamp(f);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) { const d = vlen(vsub(pts[i], pts[i - 1])); if (acc + d >= L) return vlerp(pts[i - 1], pts[i], (L - acc) / (d || 1)); acc += d; }
    return pts[pts.length - 1];
  }
  /** Polyligne de Catmull-Rom (échantillonnée), ouverte ou fermée. */
  function catmull(pts, n, closed) {
    const out = [], N = pts.length, P = (i) => closed ? pts[(i + N) % N] : pts[Math.max(0, Math.min(N - 1, i))];
    const segs = closed ? N : N - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    if (!closed) out.push(pts[N - 1]);
    return out;
  }
  /** Décalage d'une polyligne le long de ses normales (côté gauche du sens de parcours si d > 0). */
  function offsetLine(pts, d) {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const n = vnorm(perp(vsub(b, a)));
      return vadd(p, vmul(n, d));
    });
  }

  // ===========================================================================
  //  GABARIT VERTÉBRAL (repère local : origine = centre du plateau supérieur,
  //  x postérieur, y caudal). Vue latérale (projection parasagittale).
  // ===========================================================================
  /** Corps vertébral : plateaux légèrement concaves, murs antérieur (taille) et postérieur. */
  function bodyTemplate(Ha, Hp) {
    const a = 17, p = 16.6; // demi-profondeurs antérieure / postérieure du plateau supérieur
    return [
      [-a + 1.2, 0.3], [-8, 0.55], [0, 0.65], [8, 0.55], [p - 1.0, 0.25],          // plateau supérieur
      [p + 0.2, 1.5], [p + 0.4, 5], [p - 0.2, Hp * 0.45], [p, Hp * 0.8], [p + 0.1, Hp - 1.6], // mur postérieur
      [p - 0.9, Hp - 0.2], [8, lerp(Hp, Ha, 0.27) - 0.45], [0, lerp(Hp, Ha, 0.5) - 0.55], [-8, lerp(Hp, Ha, 0.73) - 0.45], [-a + 0.6, Ha - 0.1], // plateau inférieur
      [-a - 0.3, Ha - 1.5], [-a + 0.1, Ha * 0.78], [-a + 1.3, Ha * 0.5], [-a + 0.3, Ha * 0.2], [-a - 0.2, 1.6], // mur antérieur (taille)
    ];
  }
  /**
   * Éléments postérieurs (pédicule, processus articulaire supérieur PAS, isthme,
   * lame, épineuse, processus articulaire inférieur PAI). Points nommés pour
   * les ancrages ; ordre = contour fermé.
   */
  const PE_T = [
    ['pedTop', [16.6, 2.6]], ['notchSupA', [20.8, 3.6]], ['notchSupP', [24.6, 2.4]],          // échancrure supérieure (plancher du foramen sus-jacent)
    ['sapAnt0', [26.2, 0.2]], ['sapAnt1', [26.7, -4.0]], ['sapAnt2', [27.4, -7.6]], ['sapAnt3', [28.3, -10.4]], // PAS : face antérieure
    ['sapTipA', [29.6, -12.2]], ['sapTipP', [31.8, -12.0]],                                    // pointe du PAS
    ['sapArt0', [32.7, -9.6]], ['sapArt1', [33.2, -5.5]], ['sapArt2', [33.5, -1.5]], ['sapArt3', [33.7, 2.5]], ['sapArt4', [34.0, 5.6]], // PAS : surface articulaire (postérieure)
    ['seat0', [34.6, 12.2]], ['seat1', [37.6, 12.0]],                                          // isthme : appui postéro-supérieur (siège du PAI sus-jacent)
    ['lam0', [41.0, 11.0]], ['lam1', [44.2, 10.2]],                                            // lame
    ['spSup0', [48.5, 10.6]], ['spSup1', [54, 11.8]], ['spSup2', [59.5, 13.2]], ['spSup3', [64.2, 14.6]], // bord supérieur de l'épineuse (oblique en bas et en arrière)
    ['spTip0', [67.6, 15.4]], ['spTip1', [69.0, 19.5]], ['spTip2', [68.6, 24.6]], ['spTip3', [65.6, 28.0]], // pointe de l'épineuse
    ['spInf0', [60, 27.4]], ['spInf1', [54, 25.6]], ['spInf2', [48.5, 23.8]], ['lamInf', [44.6, 23.4]],     // bord inférieur → lame
    ['iapPost0', [43.4, 27.5]], ['iapPost1', [42.4, 32.2]], ['iapPost2', [41.2, 35.6]],                    // PAI : face postérieure
    ['iapTip0', [40.0, 37.6]], ['iapTip1', [38.6, 37.9]], ['iapTip2', [37.5, 36.6]],                       // pointe du PAI
    ['iapArt0', [37.1, 32.5]], ['iapArt1', [36.6, 28.4]], ['iapArt2', [36.0, 24.6]],                       // PAI : surface articulaire (antérieure)
    ['parsAnt', [32.4, 19.4]], ['notchInfP', [27.8, 16.6]], ['notchInfA', [21.6, 16.9]], ['pedBot', [16.6, 17.6]], // isthme (face antérieure) → échancrure inférieure (toit du foramen sous-jacent)
  ];
  const peIndex = Object.fromEntries(PE_T.map(([k], i) => [k, i]));

  // ===========================================================================
  //  PLACEMENT AU NEUTRE (lordose segmentaire 12°)
  // ===========================================================================
  const TH0 = 12, TH1 = 15, THC = 17.5, THB = 19, NARROW = 2.0;
  const BETA = 20;                         // inclinaison du plateau de L5 à l'écran (debout)
  const L5_H = [27, 25], L4_H = [28, 25.6];
  const BODY5 = bodyTemplate(L5_H[0], L5_H[1]);
  const BODY4L = bodyTemplate(L4_H[0], L4_H[1]);
  // L4 : repère local tourné de +12° (partie postérieure plus basse = lordose) ; centre du plateau inférieur en (−0,6 ; −10,6)
  const C4I = [-0.6, -10.6];
  const L4R = TH0 * D2R;
  const L4O = vsub(C4I, rotV([0, (L4_H[0] + L4_H[1]) / 2 - 0.55], L4R));
  const toL4n = (p) => vadd(L4O, rotV(p, L4R));          // local L4 → monde (neutre)
  const BODY4N = BODY4L.map(toL4n);

  // Éléments postérieurs de L4 (neutre, monde) : gabarit transformé.
  const PE4N_RAW = PE_T.map(([, p]) => toL4n(p));
  // Surface articulaire du PAI de L4 (antérieure) et sa pointe, au neutre (monde)
  const IAP4_ART = ['iapTip2', 'iapArt0', 'iapArt1', 'iapArt2'].map((k) => PE4N_RAW[peIndex[k]]);
  // Interligne radiologique au neutre : 2,0 mm (Simon 2012) → PAS de L5 = surface du PAI décalée de 2 mm vers l'avant
  const GAP0 = 2.0;

  // ===========================================================================
  //  CINÉMATIQUE DE L4 (L5 fixe)
  //  Phase A : rotation autour du CIR (Liu 2016 : 84–92 % de la profondeur discale, juste sous le plateau).
  //  Phase B : au contact postérieur, pivot autour du point de contact (schéma mécanique).
  //  Pincement discal : translation caudale de L4 le long de la normale au plateau de L5.
  // ===========================================================================
  const ICR = [14, -1.5];         // tiers postérieur du disque, au niveau du plateau de L5 (Liu 2016 : 84–92 % de la profondeur)
  const RETRO = 0.5;                       // translation postérieure couplée (≤ 0,6 mm, Liu 2016)
  function poseA(p, th, nr) {
    const k = clamp((Math.min(th, TH1) - TH0) / (TH1 - TH0));
    const q = vadd(p, [RETRO * k, nr]);
    return rotAbout(q, ICR, (Math.min(th, THC) - TH0) * D2R);
  }
  // point de la pointe du PAI de L4 qui vient au contact (le plus bas du gabarit)
  const TIP_KEY = 'iapTip1';
  const TIP4N = PE4N_RAW[peIndex[TIP_KEY]];
  const PC = poseA(TIP4N, THC, NARROW);    // contact PAI L4 → isthme L5 (monde)
  function pose(p, th, nr) {
    const q = poseA(p, th, nr);
    return th > THC ? rotAbout(q, PC, (th - THC) * D2R) : q;
  }
  // ---------------------------------------------------------------------------
  //  L5 (fixe) : gabarit + surfaces de contact construites sur la trajectoire de L4
  // ---------------------------------------------------------------------------
  function buildL5() {
    const pts = PE_T.map(([k, p]) => p.slice());
    // 1) surface articulaire du PAS de L5 = surface du PAI de L4 (neutre) décalée de GAP0 vers l'avant
    const art = IAP4_ART.slice().reverse();          // de haut en bas
    const artOff = offsetLine(art, GAP0);             // côté gauche du sens (haut → bas) = vers l'avant (x −)
    const keys = ['sapArt1', 'sapArt2', 'sapArt3', 'sapArt4'];
    // on garde sapArt0 (près de la pointe) et on remplace les 4 suivants par la surface décalée
    keys.forEach((k, i) => { pts[peIndex[k]] = artOff[Math.min(i, artOff.length - 1)]; });
    // 2) siège de l'isthme : sous la pointe du PAI de L4 au contact (17,5°, disque pincé), avec 0,15 mm de jeu
    const tipC = PC;
    pts[peIndex.seat0] = vadd(tipC, [-1.6, 0.55]);
    pts[peIndex.seat1] = vadd(tipC, [1.4, 0.35]);
    // 3) épineuse de L5 : bord supérieur rehaussé (pondéré) pour que le contact avec l'épineuse de L4 survienne à 19°
    const inf4 = ['spTip3', 'spInf0', 'spInf1', 'spInf2'].map((k) => pose(PE4N_RAW[peIndex[k]], THB, NARROW));
    const supK = ['spSup0', 'spSup1', 'spSup2', 'spSup3', 'spTip0'], wts = [0.25, 0.7, 1, 1, 0.75];
    let dmin = Infinity, at = null;
    for (let i = 0; i <= 60; i++) {
      const q = samplePoly(inf4, i / 60);
      const sup = supK.map((k) => pts[peIndex[k]]);
      for (let j = 1; j < sup.length; j++) {
        const a = sup[j - 1], b = sup[j];
        if ((q[0] - a[0]) * (q[0] - b[0]) <= 0) { const y = lerp(a[1], b[1], (q[0] - a[0]) / ((b[0] - a[0]) || 1)); if (y - q[1] < dmin) { dmin = y - q[1]; at = q; } }
      }
    }
    const lift = dmin - 0.25;
    supK.forEach((k, i) => { pts[peIndex[k]] = vadd(pts[peIndex[k]], [0, -lift * wts[i]]); });
    return { pts, spc: at };
  }
  const L5B = buildL5(), PE5 = L5B.pts, SPC = L5B.spc;

  /** Géométrie complète de l'unité fonctionnelle à (θ, pincement). */
  function geometry(th, nr) {
    const P = (p) => pose(p, th, nr);
    const body4 = BODY4N.map(P), pe4 = PE4N_RAW.map(P);
    const g = { th, nr, body4, pe4, body5: BODY5, pe5: PE5 };
    const pe = (arr, k) => arr[peIndex[k]];
    g.pe4k = (k) => pe(pe4, k); g.pe5k = (k) => pe(PE5, k);
    // plateaux : L4 inférieur (antérieur → postérieur), L5 supérieur
    g.ep4 = [body4[14], body4[13], body4[12], body4[11], body4[10]];
    g.ep5 = [BODY5[0], BODY5[1], BODY5[2], BODY5[3], BODY5[4]];
    g.discA = vlen(vsub(g.ep4[0], g.ep5[0])); g.discP = vlen(vsub(g.ep4[4], g.ep5[4]));
    // foramen : toit (échancrure inf. de L4) → mur post. de L4 → disque → mur post. de L5 → plancher (échancrure sup. de L5) → PAS de L5 → retour
    const disc = discOutline(g);
    g.disc = disc;
    g.foramen = [
      g.pe4k('pedBot'), body4[8], body4[9], ...disc.post, BODY5[5], BODY5[6],
      g.pe5k('pedTop'), g.pe5k('notchSupA'), g.pe5k('notchSupP'), g.pe5k('sapAnt0'), g.pe5k('sapAnt1'), g.pe5k('sapAnt2'), g.pe5k('sapAnt3'),
      vlerp(g.pe5k('sapTipA'), g.pe4k('parsAnt'), 0.5),      // bord postéro-supérieur (ligament jaune / capsule)
      g.pe4k('parsAnt'), g.pe4k('notchInfP'), g.pe4k('notchInfA'),
    ];
    g.foramenArea = shoelace(g.foramen);
    // interligne facettaire (radiologique) : distance minimale PAI de L4 ↔ PAS de L5 sur la partie articulaire
    const art4 = ['iapArt2', 'iapArt1', 'iapArt0', 'iapTip2'].map(g.pe4k);
    const art5 = ['sapArt0', 'sapArt1', 'sapArt2', 'sapArt3', 'sapArt4'].map(g.pe5k);
    let gmin = Infinity, gmid = 0;
    for (let i = 0; i <= 12; i++) {
      const q = samplePoly(art4, i / 12), d = distPoly(q, art5);
      gmin = Math.min(gmin, d); if (i === 6) gmid = d;
    }
    g.art4 = art4; g.art5 = art5; g.gapMin = gmin; g.gapMid = gmid;
    g.tip = g.pe4k(TIP_KEY);
    g.tipGap = Math.max(0, vlen(vsub(g.tip, PC)) - 0.0);
    g.spGap = Math.max(0, Math.min(...['spTip3', 'spInf0', 'spInf1', 'spInf2'].map((k) => distPoly(g.pe4k(k), ['spSup0', 'spSup1', 'spSup2', 'spSup3', 'spTip0'].map(g.pe5k)))) - 0.25);
    // ligament longitudinal antérieur : du milieu du mur antérieur de L4 au milieu de celui de L5
    g.lla = [body4[17], body4[16], body4[15], g.ep4[0], ...disc.ant, g.ep5[0], BODY5[19], BODY5[18], BODY5[17]];
    g.llaLen = polyLenL(g.lla);
    g.pivot = th > THC ? PC : ICR;
    return g;
  }
  /** Contour du disque : murs antérieur et postérieur bombés selon la hauteur locale. */
  function discOutline(g) {
    const a4 = g.ep4[0], a5 = g.ep5[0], p4 = g.ep4[4], p5 = g.ep5[4];
    const hA = vlen(vsub(a4, a5)), hP = vlen(vsub(p4, p5));
    const bulge = (h, h0, base) => base + 0.35 * Math.max(0, h0 - h);   // le disque bombe quand il est comprimé
    const bA = bulge(hA, 13.4, 0.9), bP = bulge(hP, 8.6, 0.7);
    const mA = vlerp(a4, a5, 0.5), mP = vlerp(p4, p5, 0.5);
    const nA = vnorm(perp(vsub(a5, a4))), nP = vnorm(perp(vsub(p4, p5)));
    const ant = [vlerp(a4, a5, 0.25), vadd(mA, vmul(nA, bA)), vlerp(a4, a5, 0.75)].map((p, i) => i === 1 ? p : vadd(p, vmul(nA, bA * 0.6)));
    const post = [vlerp(p4, p5, 0.2), vadd(mP, vmul(nP, bP)), vlerp(p4, p5, 0.8)].map((p, i) => i === 1 ? p : vadd(p, vmul(nP, bP * 0.6)));
    return { ant, post: post, hA, hP, bA, bP };
  }

  // valeurs de référence (neutre)
  const G0 = geometry(TH0, 0);
  const REF = { foramen: G0.foramenArea, lla: G0.llaLen, gap: G0.gapMin, discA: G0.discA, discP: G0.discP };

  const GEO = { TH0, TH1, THC, THB, NARROW, BETA, ICR, PC, SPC, geometry, REF, PE_T, peIndex, BODY5, BODY4N, PE4N_RAW, PE5, catmull, offsetLine, rotAbout, samplePoly, distPoly };

  if (typeof module === 'object' && module.exports && typeof window === 'undefined') { module.exports = { GEO }; return; }

  // ===========================================================================
  //  TIMELINE (s) — storyboard validé (option A)
  // ===========================================================================
  const EASE = { ios: E.ios, in: (x) => clamp(x) * clamp(x), lin: (x) => clamp(x), out: E.out };
  function keyed(K, t) {
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) {
      if (t <= K[i][0]) { const [t0, v0] = K[i - 1], [t1, v1, e] = K[i]; return lerp(v0, v1, (EASE[e || 'ios'])((t - t0) / (t1 - t0))); }
    }
    return K[K.length - 1][1];
  }
  const TH_K = [[0, 12], [5.0, 12], [9.5, 15, 'ios'], [12.5, 15], [16.0, 17.5, 'in'], [17.5, 19, 'ios'], [40, 19]];
  const NR_K = [[0, 0], [10.6, 0], [12.5, NARROW, 'ios'], [40, NARROW]];
  const T = {
    s2: 10.0, s3: 22.0, end: 35.0,
    draw: [0.5, 3.0], anat: [2.0, 5.4], mech1: [5.0, 9.7],
    narrow: [10.6, 12.5], contact: 16.0, baastrup: 17.5,
    loupe: [3.0, 21.95], graph: [22.6, 34.2], vec3: [23.0, 33.9], diag: [27.0, 33.9],
    fadeOut: [34.0, 34.95],
  };
  /** Part de la compression transmise par les facettes / l'arc postérieur (%). Modèle calé sur la littérature :
   *  16 % au neutre (Adams & Hutton 1980) ; ×1,25 en extension physiologique ; disque pincé + hyperextension → ≈ 40 %
   *  (Pollintine 2004 : 40 % ; Luo 2007 : 39 % en extension). */
  function facetShare(th, nr) {
    const k1 = clamp((th - TH0) / (TH1 - TH0)), kn = nr / NARROW;
    const k2 = 0.35 * clamp((th - TH1) / (THC - TH1)) + 0.65 * clamp((th - THC) / (THB - THC));
    return 16 + 4 * k1 + 8 * kn + 12 * k2;
  }

  const geoMemo = new Map();
  function geoAt(th, nr) {
    const key = th.toFixed(5) + '|' + nr.toFixed(5);
    let g = geoMemo.get(key);
    if (!g) { g = geometry(th, nr); if (geoMemo.size > 64) geoMemo.clear(); geoMemo.set(key, g); }
    return g;
  }
  function state(t) {
    const th = keyed(TH_K, t), nr = keyed(NR_K, t), G = geoAt(th, nr);
    const share = facetShare(th, nr);
    const fArea = (G.foramenArea / REF.foramen - 1) * 100;
    const llaStrain = (G.llaLen / REF.lla - 1) * 100;
    // interligne (pôle inférieur) : géométrie rigide − compression du cartilage sous la charge facettaire (modèle)
    const gap = Math.max(0.6, G.gapMin - 1.2 * clamp((share - 16) / 24));
    const cTip = smooth(seg(th, THC - 0.12, THC)), cSp = smooth(seg(th, THB - 0.12, THB));
    const stress = clamp((share - 16) / 24);
    return { t, th, nr, G, share, fArea, llaStrain, gap, cTip, cSp, stress, gA: gAlpha(t) };
  }
  const gAlpha = (t) => Math.min(smooth(seg(t, 0, 0.6)), 1 - smooth(seg(t, T.fadeOut[0], T.fadeOut[1])));

  // ===========================================================================
  //  CAMÉRAS
  // ===========================================================================
  function makeCam(O, S) {
    const b = -BETA * D2R, cb = Math.cos(b), sb = Math.sin(b);
    return {
      O, sc: S,
      w2s: (p) => [O[0] + S * (cb * p[0] - sb * p[1]), O[1] + S * (sb * p[0] + cb * p[1])],
      dir: (v) => [cb * v[0] - sb * v[1], sb * v[0] + cb * v[1]],             // direction monde → écran
      wdir: (v) => [cb * v[0] + sb * v[1], -sb * v[0] + cb * v[1]],           // direction écran → monde
    };
  }
  const O_MAIN = [600, 640];
  const CAM = makeCam(O_MAIN, 5);
  const LOUPE = { x: 1290, y: 686, w: 550, h: 300, sc: 15, target: [34.0, 5.5] };
  function loupeCam() {
    const c = [LOUPE.x + LOUPE.w / 2, LOUPE.y + LOUPE.h / 2], b = -BETA * D2R, cb = Math.cos(b), sb = Math.sin(b);
    const p = LOUPE.target, off = [LOUPE.sc * (cb * p[0] - sb * p[1]), LOUPE.sc * (sb * p[0] + cb * p[1])];
    return makeCam([c[0] - off[0], c[1] - off[1]], LOUPE.sc);
  }
  const CAM_L = loupeCam();

  // ===========================================================================
  //  TEXTURE TRABÉCULAIRE (déterministe, graine fixe)
  // ===========================================================================
  function inPoly(p, P) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < ((P[j][0] - P[i][0]) * (p[1] - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    }
    return c;
  }
  function trabeculae(poly, seed, n) {
    const rnd = mulberry32(seed), out = [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    let guard = 0;
    while (out.length < n && guard++ < n * 20) {
      const p = [lerp(x0, x1, rnd()), lerp(y0, y1, rnd())];
      if (!inPoly(p, poly)) continue;
      const vertical = rnd() < 0.62, L = 1.6 + 2.8 * rnd(), ang = (vertical ? 90 : 0) + (rnd() - 0.5) * 28;
      const d = [Math.cos(ang * D2R) * L / 2, Math.sin(ang * D2R) * L / 2];
      out.push([vsub(p, d), vadd(p, d)]);
    }
    return out;
  }
  const TRAB5 = trabeculae(BODY5, 515, 170);
  const TRAB4N = trabeculae(BODY4N, 414, 170);

  // ===========================================================================
  //  PRIMITIVES DE DESSIN
  // ===========================================================================
  const stressCol = (s) => mix('amber', 'crimson', clamp(s));
  function smoothPoly(cam, pts, closed, n) { return catmull(pts, n || 5, closed).map(cam.w2s); }
  function drawBone(ctx, cam, pts, a, o) {
    o = o || {};
    if (a <= 0.004) return;
    const S = smoothPoly(cam, pts, true, 5);
    const draw = o.draw == null ? 1 : o.draw;
    if (draw >= 1) {
      polyPath(ctx, S, true);
      ctx.fillStyle = rgba('cyan', (o.fill || 0.085) * a); ctx.fill();
    }
    const P = draw >= 1 ? S.concat([S[0]]) : SC.partial(S.concat([S[0]]), draw);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    polyPath(ctx, P, false);
    ctx.strokeStyle = rgba('cyan', 0.13 * a); ctx.lineWidth = (o.lw || 1.6) + 5; ctx.stroke();
    ctx.strokeStyle = rgba('cyan', 0.92 * a); ctx.lineWidth = o.lw || 1.6; ctx.stroke();
    return S;
  }
  function drawTrab(ctx, cam, segs, poly, a, mapF) {
    if (a <= 0.004) return;
    ctx.save();
    polyPath(ctx, smoothPoly(cam, poly, true, 5), true); ctx.clip();
    ctx.strokeStyle = rgba('cyan', 0.075 * a); ctx.lineWidth = cam.sc > 8 ? 1.2 : 0.9;
    ctx.beginPath();
    for (const [p, q] of segs) { const A = cam.w2s(mapF ? mapF(p) : p), B = cam.w2s(mapF ? mapF(q) : q); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
    ctx.stroke();
    ctx.restore();
  }
  /** Liseré sous-chondral : trait renforcé le long d'une surface + contour pointillé 0,9 mm en profondeur. */
  function subchondral(ctx, cam, pts, depth, a, col) {
    if (a <= 0.004) return;
    const S = smoothPoly(cam, pts, false, 4);
    polyPath(ctx, S, false); ctx.strokeStyle = rgba(col || 'cyan', 0.95 * a); ctx.lineWidth = cam.sc > 8 ? 3.2 : 2.4; ctx.stroke();
    const In = smoothPoly(cam, offsetLine(pts, depth), false, 4);
    ctx.setLineDash([3, 4]); polyPath(ctx, In, false); ctx.strokeStyle = rgba(col || 'cyan', 0.42 * a); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
  }
  function tag(ctx, anchor, at, lines, o) {
    const a = o.a; if (a <= 0.004) return;
    const align = o.align || 'left', size = o.size || 15, side = align === 'left' ? -1 : 1;
    const ly = at[1] - size * 0.35;
    ctx.strokeStyle = rgba(o.lc || 'grey', 0.85 * a); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(anchor[0], anchor[1]); ctx.lineTo(at[0] + side * 16, ly); ctx.lineTo(at[0] + side * 5, ly); ctx.stroke();
    dot(ctx, anchor, 2.6, o.lc || 'white', a);
    let y = at[1];
    lines.forEach((L, i) => {
      const s = L.size || (i ? size - 2 : size);
      text(ctx, L.s, at[0], y, { size: s, c: L.c || (i ? 'greyT' : 'white'), a, align, w: L.w || (i ? 400 : 700), ls: L.ls != null ? L.ls : (i ? 0.3 : 1), bg: 0.8, id: (o.id || L.s) + '_' + i });
      y += s + 6;
    });
  }
  const fr = (v, d) => SC.fmt(v, d).replace('.', ',');
  const frS = (v, d) => (v > 0.0005 ? '+' : '') + fr(v, d);

  // ===========================================================================
  //  UNITÉ FONCTIONNELLE : DISQUE, OS, CARTILAGE, LIGAMENTS, FORAMEN, RACINE
  // ===========================================================================
  function drawDisc(ctx, cam, st, a) {
    const G = st.G, d = G.disc;
    const poly = [...G.ep4, ...d.post, ...G.ep5.slice().reverse(), ...d.ant.slice().reverse()];
    const S = poly.map(cam.w2s);
    polyPath(ctx, S, true);
    ctx.fillStyle = rgba('disc', 0.16 * a); ctx.fill();
    ctx.strokeStyle = rgba('disc', 0.7 * a); ctx.lineWidth = 1.2; ctx.stroke();
    // lamelles de l'anneau fibreux
    ctx.save(); polyPath(ctx, S, true); ctx.clip();
    const lam = (u, bul) => {
      const top = SC.vlerp(G.ep4[0], G.ep4[4], u), bot = SC.vlerp(G.ep5[0], G.ep5[4], u);
      const n = vnorm(perp(vsub(bot, top))), mid = vadd(vlerp(top, bot, 0.5), vmul(n, bul));
      return catmull([top, mid, bot], 6, false).map(cam.w2s);
    };
    ctx.strokeStyle = rgba('disc', 0.42 * a); ctx.lineWidth = 1;
    for (const u of [0.05, 0.11, 0.17, 0.23]) { polyPath(ctx, lam(u, -d.bA * (1 - u * 3.2)), false); ctx.stroke(); }
    for (const u of [0.78, 0.84, 0.9, 0.96]) { polyPath(ctx, lam(u, d.bP * (1 - (1 - u) * 3.2)), false); ctx.stroke(); }
    ctx.restore();
    // noyau pulpeux : migre vers l'avant en extension, s'aplatit avec le pincement
    const u = 0.56 - 0.012 * (st.th - TH0);
    const c = vlerp(SC.vlerp(G.ep4[0], G.ep4[4], u), SC.vlerp(G.ep5[0], G.ep5[4], u), 0.5), cs = cam.w2s(c);
    const h = vlen(vsub(SC.vlerp(G.ep4[0], G.ep4[4], u), SC.vlerp(G.ep5[0], G.ep5[4], u)));
    const rx = 6.4 * cam.sc, ry = Math.max(1.5, h * 0.3) * cam.sc;
    ctx.save(); ctx.translate(cs[0], cs[1]); ctx.rotate(-BETA * D2R + Math.atan2(G.ep5[4][1] - G.ep5[0][1], G.ep5[4][0] - G.ep5[0][0]));
    const gr = ctx.createRadialGradient(0, 0, 1, 0, 0, rx);
    gr.addColorStop(0, rgba('nucleus', 0.42 * a)); gr.addColorStop(1, rgba('nucleus', 0.04 * a));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBones(ctx, cam, st, a, draw) {
    const G = st.G, map4 = (p) => pose(p, st.th, st.nr);
    // L5 puis L4
    drawBone(ctx, cam, PE5, a, { draw, fill: 0.075 });
    drawBone(ctx, cam, BODY5, a, { draw, fill: 0.095 });
    drawBone(ctx, cam, G.pe4, a, { draw, fill: 0.075 });
    drawBone(ctx, cam, G.body4, a, { draw, fill: 0.095 });
    const fa = a * smooth(seg(draw, 0.85, 1));
    drawTrab(ctx, cam, TRAB5, BODY5, fa);
    drawTrab(ctx, cam, TRAB4N, G.body4, fa, map4);
    // liserés sous-chondraux : plateaux vertébraux et surfaces articulaires
    subchondral(ctx, cam, G.ep5.slice().reverse(), -0.9, fa);
    subchondral(ctx, cam, G.ep4, -0.9, fa);
    subchondral(ctx, cam, G.art5, 0.8, fa);
    subchondral(ctx, cam, G.art4.slice().reverse(), 0.8, fa);
  }

  /** Cartilage articulaire (0,6 mm par face) coloré par la pression (indice relatif, max au pôle inférieur). */
  function drawCartilage(ctx, cam, st, a) {
    if (a <= 0.004) return;
    const G = st.G, n = 14;
    const comp = clamp((2.0 - st.gap) / 1.4);              // écrasement du cartilage (modèle)
    for (const [surf, sgn] of [[G.art5, -1], [G.art4.slice().reverse(), 1]]) {
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n, p0 = samplePoly(surf, f0), p1 = samplePoly(surf, f1);
        const nrm = vnorm(perp(vsub(p1, p0))), th = 0.6 * (1 - 0.45 * comp * f1);
        const off = vmul(nrm, -sgn * th);
        const q = [p0, p1, vadd(p1, off), vadd(p0, off)].map(cam.w2s);
        const local = clamp(st.stress * (0.35 + 0.65 * f1) + 0.6 * st.cTip * f1 * f1);
        const col = local < 0.08 ? mix('sky', 'white', 0.3) : stressCol(local);
        polyPath(ctx, q, true); ctx.fillStyle = rgba(col, (0.35 + 0.5 * local) * a); ctx.fill();
      }
    }
  }

  function drawLigaments(ctx, cam, st, a, o) {
    if (a <= 0.004) return;
    o = o || {};
    const G = st.G;
    // LLA
    const lla = offsetLine(G.lla, 1.0), S = smoothPoly(cam, lla, false, 5);
    const e = st.llaStrain, col = e < 1 ? mix('white', 'grey', 0.3) : e < 3 ? mix('white', 'amber', clamp((e - 1) / 2)) : mix('amber', 'crimson', clamp((e - 3) / 2));
    polyPath(ctx, S, false);
    ctx.strokeStyle = rgba(col, 0.25 * a); ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.9 * a); ctx.lineWidth = 2.2; ctx.stroke();
    // ligament interépineux : fibres obliques (se détendent puis sont pincées)
    const top = ['spInf2', 'spInf1', 'spInf0'].map(G.pe4k), bot = ['spSup0', 'spSup1', 'spSup2'].map(G.pe5k);
    const pinch = st.cSp;
    for (let k = 0; k < 6; k++) {
      const f = (k + 0.5) / 6, A = samplePoly(top, f), B = samplePoly(bot, clamp(f - 0.12));
      const mid = vadd(vlerp(A, B, 0.5), [0.9 * Math.sin(k * 1.7) * (0.4 + clamp((st.th - TH0) / 7)), 0]);
      polyPath(ctx, catmull([A, mid, B], 5, false).map(cam.w2s), false);
      ctx.strokeStyle = rgba(pinch > 0.05 ? stressCol(0.4 + 0.6 * pinch) : mix('white', 'grey', 0.35), (0.55 + 0.3 * pinch) * a); ctx.lineWidth = 1.1; ctx.stroke();
    }
    // ligament supra-épineux : relie les pointes des épineuses ; se détend (bombe) en extension
    const t4 = G.pe4k('spTip1'), t5 = G.pe5k('spTip1');
    const slack = clamp((st.th - TH0) / 7);
    const midS = vadd(vlerp(t4, t5, 0.5), [2.4 + 2.6 * slack, 0]);
    polyPath(ctx, catmull([vadd(t4, [0.6, 0]), midS, vadd(t5, [0.6, 0])], 8, false).map(cam.w2s), false);
    ctx.strokeStyle = rgba(mix('white', 'grey', 0.25), 0.8 * a); ctx.lineWidth = 2; ctx.stroke();
    // ligament jaune (dans le canal, projeté) : pointillés, bombe vers l'avant en extension
    const f4 = G.pe4k('parsAnt'), f5 = vlerp(G.pe5k('seat0'), G.pe5k('parsAnt'), 0.3);
    const buck = 0.8 + 2.2 * clamp((st.th - TH0) / 7) + 0.6 * (st.nr / NARROW);
    const midF = vadd(vlerp(f4, f5, 0.5), [-buck, 0]);
    ctx.setLineDash([5, 4]);
    polyPath(ctx, catmull([f4, midF, f5], 8, false).map(cam.w2s), false);
    ctx.strokeStyle = rgba('nerve', 0.5 * a); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  }

  /** Capsule zygapophysaire : enveloppe postérieure de l'articulation, récessus supérieur et inférieur. */
  function drawCapsule(ctx, cam, st, a) {
    if (a <= 0.004) return;
    const G = st.G;
    const sup = G.pe5k('sapTipP'), post4 = vadd(G.pe4k('iapPost0'), [1.2, 0]), post4b = vadd(G.pe4k('iapPost1'), [1.0, 0]);
    const inf = vadd(G.pe4k('iapTip0'), [0.8, 1.2]), seat = G.pe5k('seat1');
    const pts = [vadd(sup, [0.4, -1.2]), vlerp(vadd(sup, [3.5, -1.6]), post4, 0.4), post4, post4b, inf, vadd(seat, [1.2, 0.4])];
    const pinch = clamp(st.cTip * 0.7 + st.stress * 0.5);
    polyPath(ctx, catmull(pts, 6, false).map(cam.w2s), false);
    ctx.strokeStyle = rgba(pinch > 0.15 ? stressCol(pinch) : 'mint', 0.18 * a); ctx.lineWidth = cam.sc > 8 ? 12 : 6; ctx.stroke();
    ctx.strokeStyle = rgba(pinch > 0.15 ? stressCol(pinch) : mix('mint', 'white', 0.4), 0.8 * a); ctx.lineWidth = cam.sc > 8 ? 2 : 1.4; ctx.stroke();
  }

  function drawForamen(ctx, cam, st, a, hl) {
    if (a <= 0.004) return;
    const S = smoothPoly(cam, st.G.foramen, true, 3);
    polyPath(ctx, S, true);
    ctx.fillStyle = rgba(hl > 0.01 ? mix('mint', 'amber', clamp(-st.fArea / 30)) : 'mint', (0.07 + 0.1 * hl) * a); ctx.fill();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba('mint', (0.35 + 0.4 * hl) * a); ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
  }
  /** Racine émergente L4 et son ganglion, sous le pédicule de L4 ; « à l'étroit » quand le foramen se réduit. */
  function rootGeom(st) {
    const G = st.G;
    const roof = vlerp(G.pe4k('notchInfA'), G.pe4k('notchInfP'), 0.45), floor = vlerp(G.pe5k('notchSupA'), G.pe5k('notchSupP'), 0.5);
    const c = vlerp(roof, floor, 0.3);
    const crowd = clamp(-st.fArea / 30);
    return { c, rx: 3.6 * (1 + 0.12 * crowd), ry: 2.7 * (1 - 0.3 * crowd), crowd, exit: [vadd(c, [-6, 9]), vadd(c, [-15, 21])] };
  }
  function drawRoot(ctx, cam, st, a) {
    if (a <= 0.004) return;
    const R = rootGeom(st), cs = cam.w2s(R.c);
    const col = R.crowd > 0.35 ? mix('nerve', 'crimson', clamp((R.crowd - 0.35) / 0.6)) : 'nerve';
    // nerf spinal (projection : sort latéralement, vers l'avant et le bas)
    const path = catmull([R.c, R.exit[0], R.exit[1]], 8, false).map(cam.w2s);
    polyPath(ctx, path, false); ctx.lineCap = 'round';
    ctx.strokeStyle = rgba('nerve', 0.18 * a); ctx.lineWidth = 2.6 * cam.sc; ctx.stroke();
    ctx.strokeStyle = rgba('nerve', 0.6 * a); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.save(); ctx.translate(cs[0], cs[1]); ctx.rotate(-BETA * D2R - 0.5);
    ctx.fillStyle = rgba(col, 0.5 * a); ctx.beginPath(); ctx.ellipse(0, 0, R.rx * cam.sc, R.ry * cam.sc, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.95 * a); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  }

  /** Halo de contrainte (ambre → cramoisi) autour d'un point de contact. */
  function stressGlow(ctx, cam, p, s, r, a) {
    if (a * s <= 0.01) return;
    const c = cam.w2s(p), R = r * cam.sc;
    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R);
    const col = stressCol(s);
    g.addColorStop(0, rgba(col, 0.85 * a * s)); g.addColorStop(0.45, rgba(col, 0.35 * a * s)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, Math.PI * 2); ctx.fill();
  }

  /** Repère du centre de rotation : CIR (phase physiologique) puis pivot au contact postérieur. */
  function pivotPos(st) {
    const k = smooth(seg(st.t, T.contact, T.contact + 0.3));
    return vlerp(ICR, PC, k);
  }
  function drawPivot(ctx, cam, st, a) {
    if (a <= 0.004) return;
    const p = cam.w2s(pivotPos(st)), r = 7;
    ctx.strokeStyle = rgba('white', 0.9 * a); ctx.lineWidth = 1.4;
    ring(ctx, p, r, 'white', 0.9 * a, 1.4);
    line(ctx, [p[0] - r - 5, p[1]], [p[0] - 3, p[1]]); line(ctx, [p[0] + 3, p[1]], [p[0] + r + 5, p[1]]);
    line(ctx, [p[0], p[1] - r - 5], [p[0], p[1] - 3]); line(ctx, [p[0], p[1] + 3], [p[0], p[1] + r + 5]);
    dot(ctx, p, 1.8, 'white', a);
  }

  /** Ensemble de l'unité fonctionnelle (vue principale ou loupe). */
  function drawFSU(ctx, cam, st, o) {
    const a = o.a, t = st.t;
    if (a <= 0.004) return;
    const draw = o.loupe ? 1 : E.io(seg(t, T.draw[0], T.draw[1]));
    const showF = o.loupe ? 0 : smooth(seg(t, 1.6, 2.6));
    drawForamen(ctx, cam, st, a * showF, o.foramenHL || 0);
    drawDisc(ctx, cam, st, a * smooth(seg(draw, 0.2, 0.9)));
    drawBones(ctx, cam, st, a, draw);
    drawCartilage(ctx, cam, st, a * smooth(seg(draw, 0.8, 1)));
    drawCapsule(ctx, cam, st, a * smooth(seg(draw, 0.85, 1)));
    if (!o.loupe) drawLigaments(ctx, cam, st, a * smooth(seg(draw, 0.85, 1)));
    // contraintes de contact
    const sTip = clamp(0.35 + 0.65 * st.stress) * st.cTip, sSp = clamp(0.3 + 0.5 * st.stress) * st.cSp;
    stressGlow(ctx, cam, PC, sTip, o.loupe ? 3.2 : 4.5, a);
    stressGlow(ctx, cam, SPC, sSp, o.loupe ? 3.2 : 5, a);
    if (!o.loupe) drawRoot(ctx, cam, st, a * showF);
  }

  // ===========================================================================
  //  VECTEURS
  // ===========================================================================
  const F_SCALE = 0.2;                  // px/N (500 N → 100 px)
  const W_N = 500;                      // charge axiale (précharge des modèles EF, Schmidt 2008)
  /** Scènes 1–2 : forces exercées SUR L4 — réaction du disque (Fc) et réaction facettaire (Ff). */
  function vectors12(ctx, cam, st, a) {
    if (a <= 0.004) return null;
    const G = st.G;
    const c4 = vlerp(G.ep4[1], G.ep4[3], 0.5);
    const up = cam.dir([0, -1]);                                   // normale au plateau de L5, vers L4
    const Fc = W_N * (1 - st.share / 100), Ff = W_N * st.share / 100;
    const p0 = cam.w2s(c4), base = vsub(p0, vmul(up, Fc * F_SCALE));
    arrow(ctx, base, p0, 'sky', a, { lw: 4, head: 16, outline: true });
    // réaction facettaire : sur la surface articulaire du PAI (aux 3/4 vers le bas), dirigée vers l'arrière (normale au PAS)
    const art = G.art5, q0 = samplePoly(art, 0.72), q1 = samplePoly(art, 0.8);
    const nPost = cam.dir(vnorm(perp(vsub(q0, q1))));
    const qs = cam.w2s(samplePoly(G.art4.slice().reverse(), 0.76));
    const tail = vsub(qs, vmul(nPost, Math.max(18, Ff * F_SCALE * 1.4)));
    arrow(ctx, tail, qs, 'mint', a, { lw: 3.4, head: 13, outline: true });
    return { fc: [base, p0], ff: [tail, qs], Fc, Ff };
  }

  // ===========================================================================
  //  HUD
  // ===========================================================================
  const SCENES = [
    { t0: 0, t1: 10, n: '01', short: 'EXTENSION PHYSIOLOGIQUE', title: 'CINÉMATIQUE LOMBAIRE L4–L5 : EXTENSION PHYSIOLOGIQUE', sub: 'Disque, articulations zygapophysaires, ligaments · vue sagittale, profil gauche' },
    { t0: 10, t1: 22, n: '02', short: 'HYPEREXTENSION · CONFLIT', title: 'HYPEREXTENSION CRITIQUE : CONFLIT ARTICULAIRE POSTÉRIEUR', sub: 'Disque pincé · butée zygapophysaire · conflit inter-épineux · foramen' },
    { t0: 22, t1: 35, n: '03', short: 'SYNTHÈSE', title: "SYNTHÈSE : PATHOMÉCANIQUE DE L'HYPEREXTENSION", sub: 'Décomposition des forces · isthme · douleur facettaire' },
  ];
  function drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
    const ox = O_MAIN[0] % 50, oy = O_MAIN[1] % 50;
    for (let x = ox; x <= W; x += 50) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H); }
    for (let y = oy; y <= H; y += 50) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5); }
    ctx.stroke();
    // indexation (mm depuis l'origine : centre du plateau de L5)
    for (let x = O_MAIN[0] - 200; x <= 1200; x += 100) text(ctx, frS((x - O_MAIN[0]) / 5, 0), x, 1001, { size: 10, c: 'greyT', a: 0.5, align: 'center', noreg: true });
    for (let y = O_MAIN[1] - 400; y <= 940; y += 100) text(ctx, frS((y - O_MAIN[1]) / 5, 0), 48, y + 4, { size: 10, c: 'greyT', a: 0.5, align: 'right', noreg: true });
    text(ctx, 'mm', 1236, 1001, { size: 10, c: 'greyT', a: 0.5, noreg: true });
  }
  function header(ctx, t, a) {
    text(ctx, 'PARTIE 1A  ·  01A / 04  ·  UNITÉ FONCTIONNELLE L4–L5', 80, 70, { size: 15, c: 'cyan', a, w: 700, ls: 2, id: 'h-part' });
    SCENES.forEach((sc, i) => {
      const k = fio(t, sc.t0 - (i ? 0.1 : 0), sc.t1 + 0.05, i ? 0.5 : 0.01, 0.45);
      if (k <= 0.004) return;
      const slide = (1 - smooth(seg(t, sc.t0, sc.t0 + 0.6))) * (i ? 24 : 0);
      text(ctx, sc.title, 80 + slide, 114, { size: 30, c: 'white', a: a * k, w: 600, ls: 1.2, font: SANS, id: 'h-title' });
      text(ctx, sc.sub, 80 + slide * 0.5, 145, { size: 15, c: 'greyT', a: a * k, ls: 0.4, id: 'h-sub' });
    });
    text(ctx, 'VUE SAGITTALE · PROFIL GAUCHE', 1840, 74, { size: 13, c: 'greyT', a, align: 'right', ls: 2, id: 'h-view' });
    const f = Math.round(t * FPS);
    text(ctx, 'T+' + t.toFixed(2).padStart(5, '0') + ' s  ·  F' + String(f).padStart(4, '0'), 1840, 104, { size: 18, c: 'white', a: 0.9 * a, align: 'right', ls: 1, id: 'h-tc' });
  }
  function frame(ctx, x, y, w, h, a, col) {
    ctx.strokeStyle = rgba(col || 'cyan', 0.35 * a); ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.strokeStyle = rgba(col || 'cyan', 0.9 * a); ctx.lineWidth = 2;
    const c = 14;
    for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(px + sx * c, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * c); ctx.stroke();
    }
  }
  const PX = 1290, PW = 550;
  function row(ctx, y, label, value, a, o) {
    o = o || {};
    text(ctx, label, PX + 22, y, { size: 12, c: 'greyT', a, ls: 1.4, w: 700, id: 'c-l' + y });
    text(ctx, value, PX + PW - 22, y, { size: o.size || 19, c: o.c || 'white', a, align: 'right', w: 600, id: 'c-v' + y });
    if (o.sub) text(ctx, o.sub, PX + PW - 22, y + 17, { size: 12, c: o.subc || 'greyT', a, align: 'right', id: 'c-s' + y });
    ctx.strokeStyle = rgba('grey', 0.18 * a); ctx.lineWidth = 1; line(ctx, [PX + 22, y + (o.sub ? 25 : 12)], [PX + PW - 22, y + (o.sub ? 25 : 12)]);
  }
  function cartouche(ctx, st, a) {
    if (a <= 0.004) return;
    const t = st.t;
    frame(ctx, PX, 180, PW, 244, a);
    text(ctx, 'CARTOUCHE · L4–L5', PX + 22, 208, { size: 14, c: 'cyan', a, w: 700, ls: 2.5, id: 'c-title' });
    const a12 = a * (1 - smooth(seg(t, 22.3, 22.65))), a3 = a * smooth(seg(t, 22.7, 23.05));   // fondus enchaînés (pas de superposition)
    if (a12 > 0.004) {
      const crit = st.th > THC - 0.01;
      row(ctx, 244, 'ANGLE SEGMENTAIRE', frS(st.th, 1) + '°', a12, crit ? { c: 'signal', sub: 'HYPEREXTENSION CRITIQUE', subc: 'signal' } : st.th > TH0 + 0.05 ? { sub: 'extension physiologique : ≈ 3–6°' } : { sub: 'lordose segmentaire debout' });
      const y2 = 296;
      text(ctx, 'RÉPARTITION DE CHARGE', PX + 22, y2, { size: 12, c: 'greyT', a: a12, ls: 1.4, w: 700, id: 'c-rl' });
      text(ctx, 'DISQUE ' + fr(100 - st.share, 0) + ' %  /  FACETTES ' + fr(st.share, 0) + ' %', PX + PW - 22, y2, { size: 17, c: 'white', a: a12, align: 'right', w: 600, id: 'c-rv' });
      const bx = PX + 22, bw = PW - 44, by = y2 + 10;
      ctx.fillStyle = rgba('sky', 0.75 * a12); ctx.fillRect(bx, by, bw * (1 - st.share / 100), 6);
      ctx.fillStyle = rgba('mint', 0.9 * a12); ctx.fillRect(bx + bw * (1 - st.share / 100), by, bw * st.share / 100, 6);
      row(ctx, 344, 'INTERLIGNE FACETTAIRE (PÔLE INF.)', fr(st.gap, 1) + ' mm', a12, st.gap < 1.25 ? { c: 'amber', sub: 'cartilages au contact, comprimés', subc: 'amber' } : {});
      row(ctx, 380, 'SURFACE DU FORAMEN', frS(st.fArea, 1) + ' %', a12, { c: st.fArea < -15 ? 'amber' : 'white' });
      row(ctx, 412, 'CENTRE DE ROTATION', st.t >= T.contact ? 'PIVOT AU CONTACT POSTÉRIEUR' : 'CIR · TIERS POST. DU DISQUE', a12, { size: 13, c: st.t >= T.contact ? 'signal' : 'white' });
    }
    if (a3 > 0.004) {
      const Fc = W_N * Math.cos(BETA * D2R), tau = W_N * Math.sin(BETA * D2R);
      row(ctx, 244, 'F RÉSULTANTE (CHARGE AXIALE)', fr(W_N, 0) + ' N', a3, { sub: 'précharge des modèles EF (Schmidt 2008)' });
      row(ctx, 292, 'Fc · COMPRESSION ⊥ PLATEAU', fr(Fc, 0) + ' N', a3, { c: 'sky' });
      row(ctx, 328, 'τ · CISAILLEMENT ANTÉRIEUR', fr(tau, 0) + ' N', a3, { c: 'signal', sub: 'plateau de L5 incliné de 20° (debout)' });
      row(ctx, 376, 'RÉACTION FACETTAIRE', '≈ ' + fr(W_N * st.share / 100, 0) + ' N', a3, { c: 'mint' });
      row(ctx, 412, 'LLA (MODÈLE)', frS(st.llaStrain, 1) + ' %', a3, { size: 15, c: 'amber' });
    }
  }
  function gauge(ctx, y, label, val, vmin, vmax, marks, a, o) {
    const bx = PX + 22, bw = PW - 44, by = y + 14, f = (v) => bx + bw * clamp((v - vmin) / (vmax - vmin));
    text(ctx, label, bx, y, { size: 12, c: 'greyT', a, ls: 1.4, w: 700, id: 'g-l' + y });
    text(ctx, o.txt, bx + bw, y, { size: 19, c: o.c || 'white', a, align: 'right', w: 600, id: 'g-v' + y });
    ctx.fillStyle = rgba('grey', 0.22 * a); ctx.fillRect(bx, by, bw, 10);
    const x0 = f(Math.min(0, val) < vmin ? vmin : (vmin < 0 ? 0 : vmin)), x1 = f(val);
    ctx.fillStyle = rgba(o.c || 'mint', 0.85 * a); ctx.fillRect(Math.min(x0, x1), by, Math.abs(x1 - x0), 10);
    for (const m of marks) {
      const x = f(m.v);
      ctx.setLineDash([3, 3]); ctx.strokeStyle = rgba('white', 0.7 * a); ctx.lineWidth = 1; line(ctx, [x, by - 4], [x, by + 14]); ctx.setLineDash([]);
      text(ctx, m.s, x, by + 30, { size: 12, c: 'greyT', a, align: m.al || 'center', id: 'g-m' + y + m.v });
    }
  }
  function gauges(ctx, st, a) {
    if (a <= 0.004) return;
    frame(ctx, PX, 440, PW, 192, a, 'cyan');
    const s = st.share, crit = st.th > THC - 0.01;
    gauge(ctx, 470, 'PART FACETTAIRE DE LA COMPRESSION', s, 0, 60, [{ v: 16, s: 'neutre 16 %' }, { v: 26, s: 'disque sain 26 %', al: 'left' }], a,
      { txt: '≈ ' + fr(s, 0) + ' %', c: s > 30 ? 'crimson' : s > 22 ? 'amber' : 'mint' });
    if (crit) text(ctx, '×' + fr(s / 16, 1) + ' vs neutre', PX + PW - 22, 514, { size: 12, c: 'crimson', a, align: 'right', w: 700, id: 'g-x' });
    gauge(ctx, 548, 'SURFACE DU FORAMEN (MODÈLE)', st.fArea, -40, 0, [{ v: -15, s: '−15 % : extension, in vitro (Inufusa 1996)' }], a,
      { txt: frS(st.fArea, 1) + ' %', c: st.fArea < -15 ? 'amber' : 'mint' });
    text(ctx, 'Pointillés : repères publiés · valeurs calculées sur la géométrie du modèle', PX + 22, 618, { size: 12, c: 'greyT', a, id: 'g-note' });
  }
  function frise(ctx, t, a) {
    const x0 = 80, x1 = 1840, y = 1036, X = (s) => x0 + (x1 - x0) * s / 35;
    ctx.strokeStyle = rgba('grey', 0.5 * a); ctx.lineWidth = 2; line(ctx, [x0, y], [x1, y]);
    ctx.strokeStyle = rgba('cyan', 0.9 * a); line(ctx, [x0, y], [X(clamp(t, 0, 35)), y]);
    SCENES.forEach((sc, i) => {
      const on = t >= sc.t0 && t < sc.t1;
      ctx.strokeStyle = rgba(on ? 'cyan' : 'grey', a); ctx.lineWidth = 2; line(ctx, [X(sc.t0), y - 8], [X(sc.t0), y + 8]);
      text(ctx, sc.n + '  ' + sc.short, X(sc.t0) + 10, y - 12, { size: 12, c: on ? 'cyan' : 'greyT', a, ls: 1.2, w: on ? 700 : 400, id: 'f-' + i });
    });
    dot(ctx, [X(clamp(t, 0, 35)), y], 5, 'cyan', a);
  }
  function compass(ctx, a) {
    const ox = 150, oy = 925;
    arrow(ctx, [ox, oy], [ox - 46, oy], 'grey', 0.9 * a, { lw: 1.2, head: 7, noGlow: true });
    arrow(ctx, [ox, oy], [ox + 46, oy], 'grey', 0.9 * a, { lw: 1.2, head: 7, noGlow: true });
    arrow(ctx, [ox, oy], [ox, oy - 32], 'grey', 0.9 * a, { lw: 1.2, head: 7, noGlow: true });
    text(ctx, 'ANT', ox - 54, oy + 5, { size: 12, c: 'greyT', a, align: 'right', ls: 1, id: 'o-a' });
    text(ctx, 'POST', ox + 54, oy + 5, { size: 12, c: 'greyT', a, ls: 1, id: 'o-p' });
    text(ctx, 'CRÂNIAL', ox, oy - 40, { size: 12, c: 'greyT', a, align: 'center', ls: 1, id: 'o-c' });
    ctx.strokeStyle = rgba('white', 0.8 * a); ctx.lineWidth = 1.5;
    line(ctx, [80, 975], [130, 975]); line(ctx, [80, 969], [80, 981]); line(ctx, [130, 969], [130, 981]);
    text(ctx, '10 mm', 140, 980, { size: 13, c: 'white', a: 0.85 * a, id: 'o-s' });
  }

  // ===========================================================================
  //  LOUPE ×3 ET GRAPHIQUE (panneau droit, y 650–990)
  // ===========================================================================
  function loupe(ctx, st, a) {
    if (a <= 0.004) return;
    frame(ctx, PX, 650, PW, 340, a);
    text(ctx, 'LOUPE ×3 · FACETTE L4–L5 ET ISTHME DE L5', PX + 22, 674, { size: 13, c: 'cyan', a, w: 700, ls: 1.5, id: 'l-title' });
    ctx.save();
    ctx.beginPath(); ctx.rect(LOUPE.x, LOUPE.y, LOUPE.w, LOUPE.h); ctx.clip();
    ctx.fillStyle = rgba('bg', 0.94 * a); ctx.fillRect(LOUPE.x, LOUPE.y, LOUPE.w, LOUPE.h);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.04 * a).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = LOUPE.x; x <= LOUPE.x + LOUPE.w; x += 30) { ctx.moveTo(x + 0.5, LOUPE.y); ctx.lineTo(x + 0.5, LOUPE.y + LOUPE.h); }
    for (let y = LOUPE.y; y <= LOUPE.y + LOUPE.h; y += 30) { ctx.moveTo(LOUPE.x, y + 0.5); ctx.lineTo(LOUPE.x + LOUPE.w, y + 0.5); }
    ctx.stroke();
    drawFSU(ctx, CAM_L, st, { a, loupe: true });
    // pied à coulisse sur l'interligne (pôle inférieur)
    const G = st.G, p4 = samplePoly(G.art4.slice().reverse(), 0.86);
    let best = null, bd = Infinity;
    for (let i = 0; i <= 40; i++) { const q = samplePoly(G.art5, i / 40), d = vlen(vsub(q, p4)); if (d < bd) { bd = d; best = q; } }
    const A = CAM_L.w2s(best), B = CAM_L.w2s(p4), u = vnorm(vsub(B, A));
    ctx.strokeStyle = rgba('white', 0.9 * a); ctx.lineWidth = 1.2;
    line(ctx, vsub(A, vmul(u, 10)), vadd(B, vmul(u, 10)));
    for (const P of [A, B]) { const n = perp(u); line(ctx, vadd(P, vmul(n, 6)), vsub(P, vmul(n, 6))); }
    ctx.restore();
    // légendes de la loupe (hors zone de dessin des os : bandeau inférieur)
    const ga = a;
    text(ctx, 'INTERLIGNE (PÔLE INF.) : ' + fr(st.gap, 1) + ' mm', PX + 22, 708, { size: 13, c: st.gap < 1.25 ? 'amber' : 'white', a: ga, w: 700, bg: 0.85, id: 'l-gap' });
    const lab = (p, s, dx, dy, id) => { const q = CAM_L.w2s(p); if (q[0] < LOUPE.x + 10 || q[0] > LOUPE.x + LOUPE.w - 10 || q[1] < LOUPE.y + 30 || q[1] > LOUPE.y + LOUPE.h - 10) return; text(ctx, s, q[0] + dx, q[1] + dy, { size: 12, c: 'white', a: 0.9 * a, w: 700, bg: 0.8, align: dx < 0 ? 'right' : 'left', id }); };
    lab(samplePoly(G.art5, 0.35), 'PAS L5', -14, 0, 'l-pas');
    lab(samplePoly(G.art4.slice().reverse(), 0.3), 'PAI L4', 16, 0, 'l-pai');
    lab(vadd(PC, [0, 3.2]), 'ISTHME L5', 10, 14, 'l-isth');
    // échelle et légende de contrainte
    ctx.strokeStyle = rgba('white', 0.8 * a); ctx.lineWidth = 1.5;
    const sx = PX + PW - 120, sy = 972;
    line(ctx, [sx, sy], [sx + 75, sy]); line(ctx, [sx, sy - 5], [sx, sy + 5]); line(ctx, [sx + 75, sy - 5], [sx + 75, sy + 5]);
    text(ctx, '5 mm', sx + 84, sy + 4, { size: 12, c: 'white', a, id: 'l-sc' });
    const gx = PX + 22, gy = 966, gw = 120;
    const gr = ctx.createLinearGradient(gx, 0, gx + gw, 0); gr.addColorStop(0, rgba('amber', a)); gr.addColorStop(1, rgba('crimson', a));
    ctx.fillStyle = gr; ctx.fillRect(gx, gy, gw, 7);
    text(ctx, 'indice de contrainte (modèle)', gx + gw + 10, gy + 8, { size: 12, c: 'greyT', a, id: 'l-leg' });
  }

  // Modèle illustratif (courbes) — repères : ≈ 2,8 MPa en extension à 7,5 N·m (EF, Du 2016) ;
  // seuils osseux 2 500 με (début d'endommagement en fatigue, Pattin 1996) et 7 300 με (limite élastique, Bayraktar 2004).
  const pH = (th) => { const d = th - TH0; return 0.6 + 0.15 * d + 0.04 * d * d; };
  const pN = (th) => pH(th) + 0.6 + (th > THC ? 1.6 * Math.pow((th - THC) / (THB - THC), 1.5) : 0);
  const eH = (th) => { const d = th - TH0; return 300 + 120 * d + 25 * d * d; };
  const eN = (th) => eH(th) + 350 + (th > THC ? 2600 * Math.pow((th - THC) / (THB - THC), 1.5) : 0);
  function graph(ctx, st, a) {
    if (a <= 0.004) return;
    const t = st.t;
    frame(ctx, PX, 650, PW, 340, a);
    text(ctx, "PRESSION FACETTAIRE ET DÉFORMATION DE L'ISTHME", PX + 22, 674, { size: 12, c: 'cyan', a, w: 700, ls: 0.4, id: 'gr-title' });
    text(ctx, 'MODÈLE ILLUSTRATIF', PX + PW - 22, 674, { size: 12, c: 'signal', a, align: 'right', w: 700, ls: 1, id: 'gr-model' });
    const x0 = PX + 70, x1 = PX + PW - 74, y0 = 704, y1 = 888;
    const X = (th) => x0 + (x1 - x0) * (th - TH0) / (THB - TH0), YP = (p) => y1 - (y1 - y0) * p / 7, YE = (e) => y1 - (y1 - y0) * e / 8000;
    ctx.strokeStyle = rgba('grey', 0.6 * a); ctx.lineWidth = 1;
    line(ctx, [x0, y1], [x1, y1]); line(ctx, [x0, y0], [x0, y1]); line(ctx, [x1, y0], [x1, y1]);
    for (let th = 12; th <= 19; th++) { line(ctx, [X(th), y1], [X(th), y1 + 5]); text(ctx, String(th), X(th), y1 + 19, { size: 12, c: 'greyT', a, align: 'center', id: 'gx' + th }); }
    for (const p of [0, 2, 4, 6]) text(ctx, String(p), x0 - 8, YP(p) + 4, { size: 12, c: 'amber', a, align: 'right', id: 'gp' + p });
    text(ctx, 'MPa', x0 - 8, y0 - 6, { size: 12, c: 'amber', a, align: 'right', id: 'gpu' });
    for (const e of [0, 4000]) text(ctx, fr(e / 1000, 0) + ' k', x1 + 8, YE(e) + 4, { size: 12, c: 'signal', a, id: 'ge' + e });
    text(ctx, 'με', x1 + 8, y0 - 6, { size: 12, c: 'signal', a, id: 'geu' });
    // seuils osseux
    ctx.setLineDash([5, 4]);
    for (const [e, s] of [[2500, '2 500 με : endommagement en fatigue'], [7300, '7 300 με : limite élastique']]) {
      ctx.strokeStyle = rgba('signal', 0.55 * a); line(ctx, [x0, YE(e)], [x1, YE(e)]);
      text(ctx, s, x0 + 8, YE(e) - 5, { size: 12, c: 'signal', a: 0.9 * a, id: 'gs' + e });
    }
    // mise en contact
    ctx.strokeStyle = rgba('white', 0.5 * a); line(ctx, [X(THC), y0 + 22], [X(THC), y1]);
    ctx.setLineDash([]);
    text(ctx, 'MISE EN CONTACT', X(THC) - 6, y0 + 40, { size: 12, c: 'white', a, align: 'right', w: 700, bg: 0.85, id: 'gc1' });
    text(ctx, 'régime non linéaire →', X(THC) - 6, y0 + 56, { size: 12, c: 'greyT', a, align: 'right', bg: 0.85, id: 'gc2' });
    // courbes (tracé progressif)
    const k = E.io(seg(t, 28.0, 31.0)), thMax = lerp(TH0, THB, k);
    const curve = (f, col, Y, dash, lim) => {
      const pts = [];
      for (let th = TH0; th <= Math.min(thMax, lim) + 1e-6; th += 0.05) pts.push([X(th), Y(f(th))]);
      if (pts.length < 2) return;
      ctx.setLineDash(dash ? [6, 5] : []); polyPath(ctx, pts, false);
      ctx.strokeStyle = rgba(col, (dash ? 0.6 : 0.95) * a); ctx.lineWidth = dash ? 1.6 : 2.6; ctx.stroke(); ctx.setLineDash([]);
    };
    curve(pH, 'amber', YP, true, 17.8); curve(eH, 'signal', YE, true, 17.8);
    curve(pN, 'amber', YP, false, THB); curve(eN, 'signal', YE, false, THB);
    if (k >= 0.999) { dot(ctx, [X(THB), YP(pN(THB))], 4.5, 'amber', a); dot(ctx, [X(THB), YE(eN(THB))], 4.5, 'signal', a); }
    text(ctx, 'Angle de lordose L4–L5 (°)', (x0 + x1) / 2, y1 + 36, { size: 12, c: 'white', a, align: 'center', id: 'gxl' });
    // légende
    const ly = 946;
    ctx.strokeStyle = rgba('amber', a); ctx.lineWidth = 2.6; line(ctx, [PX + 22, ly - 4], [PX + 40, ly - 4]);
    text(ctx, 'pression (MPa)', PX + 46, ly, { size: 12, c: 'white', a, id: 'gl1' });
    ctx.strokeStyle = rgba('signal', a); line(ctx, [PX + 170, ly - 4], [PX + 188, ly - 4]);
    text(ctx, 'isthme (με)', PX + 194, ly, { size: 12, c: 'white', a, id: 'gl2' });
    text(ctx, 'plein : pincé · tirets : sain', PX + PW - 22, ly, { size: 12, c: 'greyT', a, align: 'right', id: 'gl3' });
    text(ctx, 'Repère : ≈ 2,8 MPa en extension à 7,5 N·m (EF, Du 2016)', PX + 22, 965, { size: 12, c: 'greyT', a, id: 'gl4' });
    text(ctx, 'Seuils osseux : Pattin 1996 ; Bayraktar 2004 (os fémoral, in vitro)', PX + 22, 982, { size: 12, c: 'greyT', a, id: 'gl5' });
  }

  function alertBanner(ctx, t, a) {
    const k = fio(t, T.contact, 21.9, 0.15, 0.3) * a;
    if (k <= 0.004) return;
    const blink = 0.72 + 0.28 * Math.cos((t - T.contact) * 2 * Math.PI * 1.25);
    ctx.fillStyle = rgba('signal', 0.12 * k); ctx.fillRect(440, 178, 750, 44);
    ctx.strokeStyle = rgba('signal', 0.9 * k); ctx.lineWidth = 1.5; ctx.strokeRect(440.5, 178.5, 750, 44);
    text(ctx, '▲  CONFLIT ARTICULAIRE POSTÉRIEUR DÉTECTÉ', 815, 207, { size: 20, c: 'signal', a: k * blink, align: 'center', w: 700, ls: 1.5, id: 'alert' });
  }

  // ===========================================================================
  //  ÉTIQUETTES DES SCÈNES (colonnes : gauche alignée à droite sur x = 430, droite alignée à gauche sur x = 990)
  // ===========================================================================
  const XL = 430, XR = 990;
  const cen = (P) => { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; };
  function labelsScene1(ctx, st, a) {
    const t = st.t, G = st.G, S = (p) => CAM.w2s(p);
    const k = (t0, t1) => a * fio(t, t0, t1 || T.anat[1], 0.35, 0.3);
    const c4 = cen(G.body4), c5 = cen(BODY5);
    // anatomie (2,0–5,4 s), en escalier
    tag(ctx, S(vlerp(G.body4[17], c4, 0.4)), [XL, 440], [{ s: 'CORPS VERTÉBRAL DE L4' }], { a: k(2.0), align: 'right', lc: 'cyan', id: 'a-b4' });
    tag(ctx, S(offsetLine(G.lla, 1.0)[5]), [XL, 520], [{ s: 'LIGAMENT LONGITUDINAL' }, { s: 'ANTÉRIEUR (LLA)', w: 700, c: 'white', size: 15 }], { a: k(2.15), align: 'right', id: 'a-lla' });
    tag(ctx, S(vlerp(SC.vlerp(G.ep4[0], G.ep4[4], 0.12), SC.vlerp(G.ep5[0], G.ep5[4], 0.12), 0.5)), [XL, 610], [{ s: 'ANNEAU FIBREUX' }], { a: k(2.3), align: 'right', lc: 'disc', id: 'a-af' });
    tag(ctx, S(vlerp(SC.vlerp(G.ep4[0], G.ep4[4], 0.5), SC.vlerp(G.ep5[0], G.ep5[4], 0.5), 0.5)), [XL, 660], [{ s: 'NOYAU PULPEUX' }], { a: k(2.45), align: 'right', lc: 'nucleus', id: 'a-np' });
    tag(ctx, S(SC.vlerp(G.ep5[0], G.ep5[4], 0.22)), [XL, 720], [{ s: 'PLATEAU VERTÉBRAL' }, { s: 'os sous-chondral' }], { a: k(2.6), align: 'right', lc: 'cyan', id: 'a-pl' });
    tag(ctx, S(vlerp(BODY5[17], c5, 0.4)), [XL, 800], [{ s: 'CORPS VERTÉBRAL DE L5' }], { a: k(2.75), align: 'right', lc: 'cyan', id: 'a-b5' });
    tag(ctx, S(vlerp(G.pe4k('spSup1'), G.pe4k('spInf1'), 0.5)), [XR, 420], [{ s: 'PROCESSUS ÉPINEUX L4' }], { a: k(2.9), lc: 'cyan', id: 'a-sp4', size: 14 });
    tag(ctx, S(vadd(vlerp(G.pe4k('spTip1'), G.pe5k('spTip1'), 0.5), [3.2, 0])), [XR, 466], [{ s: 'LIG. SUPRA-ÉPINEUX' }], { a: k(3.05), id: 'a-ssp', size: 14 });
    tag(ctx, S(vlerp(vlerp(G.pe4k('spInf1'), G.pe4k('spInf2'), 0.5), vlerp(G.pe5k('spSup0'), G.pe5k('spSup1'), 0.5), 0.5)), [XR, 512], [{ s: 'LIG. INTERÉPINEUX' }], { a: k(3.2), id: 'a-isp', size: 14 });
    tag(ctx, S(vadd(G.pe4k('iapPost0'), [1.2, 0])), [XR, 562], [{ s: 'ARTICULATION' }, { s: 'ZYGAPOPHYSAIRE (CAPSULE)', w: 700, c: 'white', size: 14 }], { a: k(3.35), lc: 'mint', id: 'a-zyg', size: 14 });
    tag(ctx, S(samplePoly(G.art5, 0.4)), [XR, 628], [{ s: 'PAS L5 · PAI L4' }, { s: 'cartilage ≈ 0,6 mm / face' }], { a: k(3.5), lc: 'sky', id: 'a-art', size: 14 });
    tag(ctx, S(vadd(PC, [0.6, 2.4])), [XR, 690], [{ s: 'ISTHME DE L5' }, { s: '(pars interarticularis)' }], { a: k(3.65), lc: 'cyan', id: 'a-isth', size: 14 });
    tag(ctx, S(vlerp(G.pe5k('spSup1'), G.pe5k('spInf1'), 0.5)), [XR, 752], [{ s: 'PROCESSUS ÉPINEUX L5' }], { a: k(3.8), lc: 'cyan', id: 'a-sp5', size: 14 });
    const R = rootGeom(st);
    tag(ctx, S(R.c), [560, 300], [{ s: 'FORAMEN INTERVERTÉBRAL L4–L5' }, { s: 'racine émergente L4 + ganglion spinal' }], { a: k(3.95), lc: 'nerve', id: 'a-for' });
    tag(ctx, S(vadd(vlerp(G.pe4k('parsAnt'), vlerp(G.pe5k('seat0'), G.pe5k('parsAnt'), 0.3), 0.5), [-1.5, 0])), [640, 905], [{ s: 'LIGAMENT JAUNE (canal, projeté)' }], { a: k(4.1), lc: 'nerve', id: 'a-lj', size: 14 });
    // mécanique de l'extension physiologique (5,4–9,7 s)
    const m = (t0) => a * fio(t, t0, T.mech1[1], 0.35, 0.3);
    if (st._v12) {
      const v = st._v12;
      tag(ctx, vlerp(v.fc[0], v.fc[1], 0.35), [XL, 640], [{ s: 'Fc · COMPRESSION AXIALE', c: 'sky' }, { s: 'réaction du disque sur L4' }], { a: m(5.45), align: 'right', lc: 'sky', id: 'm-fc' });
      tag(ctx, v.ff[0], [XR, 600], [{ s: 'Ff · RÉACTION FACETTAIRE', c: 'mint', size: 14 }, { s: 'sur le PAI de L4, vers l’arrière' }], { a: m(5.6), lc: 'mint', id: 'm-ff', size: 14 });
    }
    tag(ctx, S(st.G.tip), [XR, 690], [{ s: 'GLISSEMENT DU PAI DE L4', size: 14 }, { s: 'vers le bas, sans contact osseux' }], { a: m(5.9), lc: 'white', id: 'm-gl', size: 14 });
    tag(ctx, S(ICR), [XL, 520], [{ s: 'CENTRE DE ROTATION (CIR)' }, { s: 'tiers postérieur du disque (Liu 2016)' }], { a: m(6.2), align: 'right', lc: 'white', id: 'm-cir' });
    tag(ctx, S(vadd(G.pe5k('sapTipP'), [1.6, -1.2])), [XR, 520], [{ s: 'CAPSULE', size: 14 }, { s: 'fibres tendues par le glissement' }], { a: m(6.5), lc: 'mint', id: 'm-cap', size: 14 });
  }
  function labelsScene2(ctx, st, a) {
    const t = st.t, G = st.G, S = (p) => CAM.w2s(p);
    const k = (t0, t1) => a * fio(t, t0, t1 || 21.9, 0.35, 0.3);
    const dc = vlerp(SC.vlerp(G.ep4[0], G.ep4[4], 0.62), SC.vlerp(G.ep5[0], G.ep5[4], 0.62), 0.5);
    tag(ctx, S(dc), [XL, 640], [{ s: 'DISQUE PINCÉ (DÉGÉNÉRATIF) : −2 mm' }, { s: 'hauteur postérieure ' + fr(REF.discP, 1) + ' → ' + fr(G.discP, 1) + ' mm' }], { a: k(10.8), align: 'right', lc: 'disc', id: 's2-disc' });
    tag(ctx, S(vadd(PC, [0.4, 1.4])), [XR, 690], [{ s: 'BUTÉE ZYGAPOPHYSAIRE', c: 'crimson', size: 14 }, { s: 'pointe du PAI L4 → isthme L5' }], { a: k(16.0), lc: 'crimson', id: 's2-but', size: 14 });
    tag(ctx, S(vadd(PC, [-0.6, -0.8])), [XR, 590], [{ s: 'PIVOT POSTÉRIEUR', size: 14 }, { s: "l'avant du disque s'ouvre" }, { s: '(schéma mécanique)' }], { a: k(16.35), lc: 'white', id: 's2-piv', size: 14 });
    tag(ctx, S(SPC), [XR, 470], [{ s: 'CONFLIT INTER-ÉPINEUX', c: 'crimson', size: 14 }, { s: '(PHÉNOMÈNE DE BAASTRUP)', c: 'crimson', w: 700 }], { a: k(17.5), lc: 'crimson', id: 's2-baa', size: 14 });
    tag(ctx, S(offsetLine(G.lla, 1.0)[5]), [XL, 520], [{ s: 'LLA : ' + frS(st.llaStrain, 1) + ' % (modèle)', c: 'amber' }, { s: 'mesure in vitro : ≈ +2 % (Palanca 2020)' }], { a: k(16.6), align: 'right', lc: 'amber', id: 's2-lla' });
    const R = rootGeom(st);
    tag(ctx, S(R.c), [560, 300], [{ s: 'FORAMEN ' + frS(st.fArea, 0) + ' % : RACINE L4 À L’ÉTROIT', c: 'amber' }, { s: 'le PAS de L5 remonte quand le disque se pince' }], { a: k(12.6), lc: 'amber', id: 's2-for' });
    text(ctx, "L'ordre des butées dépend de l'espacement des épineuses (Adams 1988) : le contact épineux peut survenir en premier.", 300, 960, { size: 12, c: 'greyT', a: k(17.8), id: 's2-note' });
  }
  /** Scène 3 : décomposition des forces, isthme, voies nociceptives, diagnostics. */
  function scene3(ctx, st, a) {
    const t = st.t, G = st.G, S = (p) => CAM.w2s(p);
    const va = a * fio(t, T.vec3[0], T.vec3[1], 0.4, 0.3);
    const lv = (t0) => a * fio(t, t0, 27.2, 0.35, 0.3);
    const c4 = cen(G.body4), o = S(c4);
    if (va > 0.004) {
      const wv = [0, W_N * F_SCALE], n = CAM.dir([0, 1]), tdir = CAM.dir([-1, 0]);
      const Fc = W_N * Math.cos(BETA * D2R), tau = W_N * Math.sin(BETA * D2R);
      const pW = vadd(o, wv), pC = vadd(o, vmul(n, Fc * F_SCALE)), pT = vadd(o, vmul(tdir, tau * F_SCALE));
      ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba('white', 0.5 * va); ctx.lineWidth = 1; line(ctx, pC, pW); line(ctx, pT, pW); ctx.setLineDash([]);
      arrow(ctx, o, pW, 'white', va, { lw: 4, head: 16, outline: true });
      arrow(ctx, o, pC, 'sky', va * smooth(seg(t, 23.4, 23.8)), { lw: 3.4, head: 14, outline: true });
      arrow(ctx, o, pT, 'signal', va * smooth(seg(t, 23.7, 24.1)), { lw: 3.4, head: 14, outline: true });
      dot(ctx, o, 4, 'white', va);
      // réaction facettaire (vers l'arrière) et cintrage de l'isthme de L4
      const art = G.art5, q0 = samplePoly(art, 0.62), q1 = samplePoly(art, 0.7);
      const nPost = CAM.dir(vnorm(perp(vsub(q0, q1)))), qs = S(samplePoly(G.art4.slice().reverse(), 0.66));
      const ra = va * smooth(seg(t, 24.2, 24.6)), Rf = W_N * st.share / 100;
      arrow(ctx, qs, vadd(qs, vmul(nPost, Rf * F_SCALE)), 'mint', ra, { lw: 3.4, head: 14, outline: true });
      const pars4 = S(vlerp(G.pe4k('parsAnt'), G.pe4k('iapArt2'), 0.55));
      const ba = va * smooth(seg(t, 24.6, 25.0));
      if (ba > 0.004) {
        ctx.strokeStyle = rgba('signal', ba); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(pars4[0], pars4[1], 26, -2.4, 0.4); ctx.stroke();
        const e = [pars4[0] + 26 * Math.cos(0.4), pars4[1] + 26 * Math.sin(0.4)];
        arrow(ctx, [e[0] - 6, e[1] - 9], e, 'signal', ba, { lw: 2.6, head: 10, noGlow: true });
      }
      // impact du PAI de L4 sur l'isthme de L5
      const ia = va * smooth(seg(t, 25.0, 25.4)), pc = S(PC);
      arrow(ctx, vadd(pc, [-14, -40]), vadd(pc, [-2, -6]), 'crimson', ia, { lw: 4, head: 15, outline: true });
      stressGlow(ctx, CAM, vadd(PC, [0.3, 2.5]), ia, 7, 1);
      // étiquettes des vecteurs (23,0–27,2 s)
      tag(ctx, vlerp(o, pW, 0.45), [XL, 440], [{ s: 'F RÉSULTANTE · 500 N' }, { s: 'charge axiale (verticale)' }], { a: lv(23.1), align: 'right', lc: 'white', id: 'v-w' });
      tag(ctx, vlerp(o, pC, 0.75), [XL, 560], [{ s: 'Fc ⊥ PLATEAU · ' + fr(Fc, 0) + ' N', c: 'sky' }, { s: 'compression du disque' }], { a: lv(23.5), align: 'right', lc: 'sky', id: 'v-fc' });
      tag(ctx, vlerp(o, pT, 0.8), [XL, 660], [{ s: 'CISAILLEMENT ANTÉRIEUR (τ)', c: 'signal' }, { s: fr(tau, 0) + ' N : L4 tend à glisser en avant' }], { a: lv(23.8), align: 'right', lc: 'signal', id: 'v-tau' });
      tag(ctx, vadd(qs, vmul(nPost, Rf * F_SCALE * 0.6)), [XR, 520], [{ s: 'RÉACTION FACETTAIRE', c: 'mint', size: 14 }, { s: "vers l'arrière : retient τ" }], { a: lv(24.3), lc: 'mint', id: 'v-rf', size: 14 });
      tag(ctx, [pars4[0] + 18, pars4[1] - 20], [XR, 420], [{ s: "CINTRAGE DE L'ISTHME L4", c: 'signal', size: 14 }, { s: 'flexion mécanique du PAI' }], { a: lv(24.7), lc: 'signal', id: 'v-cin', size: 14 });
      tag(ctx, vadd(pc, [-8, -24]), [XR, 690], [{ s: "IMPACT SUR L'ISTHME L5", c: 'crimson', size: 14 }, { s: '(effet « casse-noix »)' }], { a: lv(25.1), lc: 'crimson', id: 'v-imp', size: 14 });
    }
    // voies nociceptives : rameaux médiaux L4 (sous la facette) et L3 (au-dessus), impulsions vers le nerf spinal
    const na = a * fio(t, T.diag[0], T.diag[1], 0.4, 0.3);
    if (na > 0.004) {
      const R = rootGeom(st);
      const capInf = vadd(vlerp(G.pe4k('iapTip0'), G.pe5k('seat1'), 0.5), [1.6, -0.6]), capSup = vadd(G.pe5k('sapTipP'), [1.8, -1.4]);
      const pL4 = catmull([capInf, vadd(G.pe5k('sapArt4'), [3.4, 2.4]), vadd(G.pe5k('notchSupP'), [1.5, 4.5]), R.c], 10, false);
      const pL3 = catmull([capSup, vadd(G.pe4k('iapPost0'), [4.5, -6]), vadd(G.pe4k('notchSupP'), [6, -2]), vadd(G.pe4k('notchSupP'), [2, -6])], 10, false);
      for (const P of [pL4, pL3]) {
        const Sx = P.map(S);
        ctx.setLineDash([2, 4]); polyPath(ctx, Sx, false); ctx.strokeStyle = rgba('nerve', 0.85 * na); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
        for (let j = 0; j < 3; j++) {
          const ph = ((t - T.diag[0]) * 0.45 + j / 3) % 1, q = samplePoly(Sx, ph);
          dot(ctx, q, 4, 'signal', na * 0.9); dot(ctx, q, 8, 'signal', na * 0.2);
        }
      }
      stressGlow(ctx, CAM, capInf, 0.8 * na, 5, 1);
      // isthme de L5 : zone à risque
      stressGlow(ctx, CAM, vadd(PC, [1.5, 4]), 0.9 * na, 8, 1);
      // mise en tension antérieure (anneau + LLA)
      const ant = vlerp(G.ep4[0], G.ep5[0], 0.5);
      stressGlow(ctx, CAM, ant, 0.55 * na, 6, 1);
      const dg = (t0) => a * fio(t, t0, T.diag[1], 0.35, 0.3);
      tag(ctx, S(ant), [XL, 760], [{ s: 'MISE EN DÉCHARGE DISCALE', c: 'amber' }, { s: 'ANTÉRIEURE', c: 'amber', w: 700, size: 15 }, { s: "tension anormale de l'anneau et du LLA" }], { a: dg(27.2), align: 'right', lc: 'amber', id: 'd-ant' });
      tag(ctx, S(vadd(PC, [1.5, 4])), [XR, 800], [{ s: 'MICRO-FRACTURES', c: 'crimson', size: 14 }, { s: 'SOUS-CHONDRALES', c: 'crimson', w: 700, size: 14 }, { s: 'zone à risque isthmique (L5)' }], { a: dg(27.5), lc: 'crimson', id: 'd-isth', size: 14 });
      tag(ctx, S(capSup), [XR, 300], [{ s: 'DOULEUR FACETTAIRE', c: 'signal', size: 14 }, { s: 'capsule pincée ;' }, { s: 'rameaux médiaux L3 et L4' }], { a: dg(27.8), lc: 'signal', id: 'd-noc', size: 14 });
      text(ctx, 'Spondylolyse : isthme de L5 dans ≈ 90 % des cas (Sakai 2009).', 300, 950, { size: 12, c: 'greyT', a: dg(28.0), id: 's3-note' });
      text(ctx, 'Douleur facettaire : 15–40 % des lombalgies chroniques (blocs contrôlés, Schwarzer 1994–1995).', 300, 968, { size: 12, c: 'greyT', a: dg(28.0), id: 's3-note2' });
    }
  }

  // ===========================================================================
  //  RENDU D'UNE FRAME
  // ===========================================================================
  let CTX = null;
  function renderAt(ctx, t) {
    SC.beginLabels();
    const st = state(t), a = st.gA;
    // état du contexte remis à zéro : chaque frame ne dépend que de son numéro, quel que soit l'ordre de rendu
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.setLineDash([]); ctx.lineWidth = 1; ctx.letterSpacing = '0px';
    ctx.fillStyle = SC.COL.bg; ctx.fillRect(0, 0, W, H);
    drawGrid(ctx);
    if (a > 0.004) {
      const hl = smooth(seg(t, 12.6, 13.2)) * (1 - smooth(seg(t, 21.6, 22.0)));
      drawFSU(ctx, CAM, st, { a, foramenHL: hl });
      // grands repères L4 / L5
      const la = a * smooth(seg(t, 1.0, 1.6));
      text(ctx, 'L4', CAM.w2s(cen(st.G.body4))[0], CAM.w2s(cen(st.G.body4))[1] + 10, { size: 30, c: 'cyan', a: 0.45 * la, align: 'center', w: 700, font: SANS, id: 'n-L4' });
      text(ctx, 'L5', CAM.w2s(cen(BODY5))[0], CAM.w2s(cen(BODY5))[1] + 10, { size: 30, c: 'cyan', a: 0.45 * la, align: 'center', w: 700, font: SANS, id: 'n-L5' });
      const va = a * fio(t, 5.2, 21.9, 0.4, 0.3);
      st._v12 = vectors12(ctx, CAM, st, va);
      drawPivot(ctx, CAM, st, a * fio(t, 5.6, 33.9, 0.4, 0.3));
      if (t < T.s2 + 0.1) labelsScene1(ctx, st, a);
      if (t > T.s2 - 0.1 && t < T.s3 + 0.1) labelsScene2(ctx, st, a);
      if (t > T.s3 - 0.1) scene3(ctx, st, a);
      // HUD
      header(ctx, t, a);
      cartouche(ctx, st, a * smooth(seg(t, 1.0, 1.6)));
      gauges(ctx, st, a * smooth(seg(t, 10.0, 10.6)));
      loupe(ctx, st, a * fio(t, T.loupe[0], T.loupe[1], 0.5, 0.4));
      graph(ctx, st, a * smooth(seg(t, T.graph[0], T.graph[0] + 0.5)));
      alertBanner(ctx, t, a);
      frise(ctx, t, a);
      compass(ctx, a);
    }
    return { t, labels: SC.labels() };
  }
  function renderFrame(f) { return renderAt(CTX, f / FPS); }
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
  function init(canvas) { CTX = canvas.getContext('2d'); return CTX; }
  root.SpineAnim1A = { W, H, FPS, TOTAL, init, renderFrame, renderAt: (t) => renderAt(CTX, t), qaReport, state, GEO };
})(typeof window !== 'undefined' ? window : globalThis);
