/* =============================================================================
 *  partie2/scene1.js — SCÈNE 1 (squelette à compléter, voir partie2/SPEC.md)
 * ========================================================================== */
(function (root) {
  'use strict';
  const SC = root.SpineCore, P2 = root.P2;
  const { fio, text } = SC;
  const T0 = [0, 10.4][0], T1 = [0, 10.4][1];

  P2.scenes.push({
    id: 's1',
    // state(F) : (optionnel) prépare F.M / F.skel avant le dessin
    state(F) {},
    // sag(ctx, F, cam) : dessin dans la vue sagittale (après le squelette)
    sag(ctx, F, cam) {},
    // panel(ctx, F, pa) : contenu du panneau de droite
    panel(ctx, F, pa) {
      const a = pa * fio(F.t, T0, T1, 0.4, 0.4);
      if (a <= 0.004) return;
      F.panel.header(ctx, 'SCÈNE 1', 'à implémenter', a, 'p1');
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
