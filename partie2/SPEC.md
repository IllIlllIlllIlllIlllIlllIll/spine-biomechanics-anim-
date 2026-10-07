# Partie 2 — « Le haubanage musculaire » : contrat des modules de scène

1920×1080 · 60 fps · **2400 frames (40 s)** · Canvas 2D **déterministe** (`window.seekToFrame(i)`).
Langue de tous les textes à l'écran : **français**, terminologie anatomique française.

## 1. Architecture

```
lib/core.js           moteur commun (maths, couleurs, text(), primitives, grille, modèle rachidien) — NE PAS MODIFIER
partie2/anatomy.js    squelette sagittal + posture + ANCRAGES (A)                                — framework
partie2/muscles.js    moteur musculaire + vecteurs (P2.muscles)                                 — framework
partie2/animation.js  timeline globale, caméras, vues/transitions, HUD, panneau, API            — framework
partie2/scene1.js … scene4.js   modules de scène (UN fichier par scène)
partie2/index.html    lecteur ; ?frame=N, ?debug (cadres des étiquettes), ?debug=anchors (repères nommés)
```

Ordre de chargement : core → anatomy → muscles → animation → scene1 → scene2 → scene3 → scene4.
Chaque scène fait `P2.scenes.push({ id, state?, sagUnder?, sag?, panel? })` et peut enregistrer une vue dédiée
`P2.views.axial = { camera(F), draw(ctx, F, cam) }` (scène 1) ou `P2.views.cor = {…}` (scène 2).

Le framework dessine : fond, grille liée au monde, squelette sagittal, vignette, cadre du panneau, **HUD**
(titres de scène, timecode, légende des 4 couleurs, orientation, échelle graphique, frise). **Les scènes ne
redessinent jamais ces éléments.**

## 2. Contrat d'une scène

```js
P2.scenes.push({
  id: 's1',
  state(F) {},                 // optionnel : remplit F.M (données partagées de la frame) et règle F.skel
  sagUnder(ctx, F, cam) {},    // optionnel : dessin AVANT le squelette (vue sagittale)
  sag(ctx, F, cam) {},         // dessin APRÈS le squelette (muscles, vecteurs, étiquettes) — vue sagittale
  panel(ctx, F, pa) {},        // contenu du panneau ; pa = opacité du cadre (multiplier par votre propre fio)
});
```

Toutes les fonctions sont appelées **à chaque frame, pour toutes les scènes** : chacune doit retourner
immédiatement hors de sa fenêtre temporelle (utiliser `fio(F.t, t0, t1, fi, fo)` pour les opacités).

### Objet de frame `F`
| champ | contenu |
|---|---|
| `F.t`, `F.frame` | temps (s), numéro de frame |
| `F.S` | état global : `lean` (antéflexion du tronc, °), `posture {lumbarFlex, hipFlex, pelvicTilt}`, `latBend` (°, vue frontale), `load` (kg sur les épaules), `views` |
| `F.G` | géométrie sagittale (lib/core `geometry` + bassin, fémur, côtes, crâne, paroi). `F.G.posture` : `{SS, LL, rho, trunk, …}` mesurés |
| `F.A` | API d'ancrages (§4) |
| `F.camSag` | caméra sagittale courante (`w2s`, `s2w`, `sc` en px/mm) |
| `F.skel` | options du squelette, modifiables dans `state()` : `{a, ribs, skull, silhouette, pelvis, femur, dim}` ; `dim(i)` = facteur par vertèbre (indice `i` de `LV`, `i+0.5` pour le disque sous-jacent, `NL` pour le sacrum) |
| `F.M` | objet libre partagé entre scènes pour la frame |
| `F.panel` | `{PX, PY, PW, PH, header(ctx, titre, sous-titre, a, id, col?), wrap(ctx, s, x, y, maxW, o) → hauteur, attachRow(ctx, label, valeur, x, y, a, o) → hauteur, cite(ctx, s, x, y, a) → hauteur}` |

## 3. Repères, caméras, vues (timeline globale — NE PAS CHANGER, se caler dessus)

Monde sagittal : mm, **x = postérieur (+)**, **y = caudal (+)**, origine = centre du plateau de S1 en posture neutre.
Profil gauche : **antérieur à gauche de l'écran**. Fémur fixe ; le bassin pivote autour de la hanche `A.hip()`.

| t (s) | vue | caméra sagittale | posture |
|---|---|---|---|
| 0–1,0 | sagittale | `lumbo` (T11 → fémur, 1,75 px/mm) | neutre |
| 1,0–1,8 | sagittale | zoom → `multi` (L2 → S2, 3,6 px/mm) | neutre |
| 5,0–6,1 | coupe sag → **axiale** : la vue axiale se déplie verticalement depuis le niveau de L3 (`xf` vertical) | `multi` | neutre |
| 6,0–8,0 | **axiale** (vue de la scène 1) | (sagittale passe hors champ à `iap`) | neutre |
| 8,0–8,5 | fondu axiale → sagittale | `iap` (thorax bas → bassin, 1,45 px/mm) | neutre |
| 10,0–11,0 | sagittale | zoom arrière → `trunk` (crâne → fémur, 0,72 px/mm) | neutre |
| 13,5–17,9 | sagittale | `trunk` | **antéflexion** α : 0 → 40° (16,0) → 40° (16,9) → 0 (17,9) ; lombaire 0,6·α, hanche 0,4·α |
| 18,0–18,6 | bascule sag → **frontale** (écrasement horizontal) | | |
| 18,6–22,0 | **frontale postérieure** (vue de la scène 2) | | `latBend` 0 → 10° (20,1) → 10° (20,9) → 0 (21,6) |
| 22,0–22,6 | bascule frontale → sagittale | `lumbo` | |
| 24,8–31,9 | sagittale | `lumbo` | version pelvienne : 0 → **+6°** (25,9–26,9, antéversion) → 0 (27,5) ; 29,5 → **−6°** (30,6–31,4, rétroversion) → 0 (31,9) |
| 32,0–33,0 | sagittale | zoom arrière → `trunk` | |
| 33,0–37,0 | sagittale | `trunk` | antéflexion 0 → 30° (34,3) → 30° (36,2) → 0 (37,0) ; **charge** 0 → 20 kg (33,5) → 20 kg (36,3) → 0 (36,9) |
| 39,4–40,0 | fondu final vers la grille vide (frame 2399 = frame 0) | | |

Zone visuelle : x ∈ [80, 1180], y ∈ [180, 990]. **Zones réservées au HUD** (aucun texte de scène) :
titre en haut à gauche (x < 720, y < 165), légende en haut à droite (x > 1180, y < 150),
orientation et échelle en bas à gauche (x < 280, y > 840), frise (y > 1000). Panneau : x ∈ [PX+30, PX+PW−30], y ∈ [PY+70, PY+PH−20].

Vues dédiées (scènes 1 et 2) : la caméra est fournie par la vue elle-même, par exemple
`camera(F) { return P2.layout.camFrom({ f: [0, 0], s: [640, 575], sc: 2.8 }) }`. Le framework applique les
transitions (opacité, écrasement) autour de `(640, 575)`.

## 4. Ancrages `F.A` (points monde, recalculés à chaque frame selon la posture)

| appel | point |
|---|---|
| `A.v(n, [x,y])` | point local (mm) dans le repère de la vertèbre `n` ('C1'…'L5') : origine au centre du corps, x postérieur, y caudal |
| `A.vt(n, [x,y])` | point du **gabarit** (lombaire : D0 = 45, H0 = 28 mm ; épineuse pointe ≈ [78.5, 5.5], bord inf. ≈ y 11, PAS ≈ [41.5, −21]→[44, −10.5], pédicule y ∈ [−13.5, −3]) |
| `A.body(n)`, `A.disc(n)` | centre du corps ; centre du disque **sous** `n` ('L4' → L4/L5, 'L5' → L5/S1) |
| `A.mam(n)` | processus mamillaire (lombaires) |
| `A.spinTip(n)`, `A.spinInf(n, u)` | pointe et bord inférieur (u = 0 → racine, 1 → pointe) de l'épineuse (lombaires) |
| `A.tp(n)` | processus costiforme (projection sagittale) — lombaires |
| `A.sac(s, off)`, `A.sacCrest(s)` | face dorsale / crête sacrée médiane, `s` ∈ [−100, −5] mm le long du sacrum (−5 = S1) |
| `A.pel(k)` | `ASIS, AIIS, PSIS, PIIS, crestTop, iliacTubercle, iliopubic, pubicTubercle, symphysisTop, symphysisBot, ischialTuber, ischialSpine, obturator, acetabulum` |
| `A.pelN([x,y])` | point quelconque de l'os coxal en coordonnées neutres (fosse iliaque ≈ [-45, -5]) |
| `A.crest(u)`, `A.inguinal(u)` | crête iliaque (0 = EIAS → 1 = EIPS) ; ligament inguinal (0 = EIAS → 1 = tubercule pubien) |
| `A.fem(k)` | `'head'`, `'lesserTrochanter'`, `'greaterTrochanter'`, `'shaft'` |
| `A.rib(i, u)`, `A.ribAngle(i)` | côte i (1–12), u = 0 tête → 1 extrémité antérieure (jonction chondro-costale) ; angle costal |
| `A.cart(i)` | milieu du cartilage costal i (1–10 ; 11–12 = pointe libre) |
| `A.xiphoid()`, `A.sternum(u)` | pointe xiphoïde ; sternum (0 = incisure jugulaire → 1 = jonction xipho-sternale) |
| `A.wall(u)`, `A.umbilicus()` | face profonde de la paroi abdominale antérieure (0 = xiphoïde → 1 = symphyse) ; ombilic |
| `A.thN([x,y])` | point solidaire du thorax en coordonnées monde neutres |
| `A.skull(k)` | `'mastoid'`, `'occiput'`, `'nuchal'` |
| `A.comHAT()` | centre de masse tête-bras-tronc (au-dessus de L4/L5), W = 412 N (60 % de 70 kg) |
| `A.shoulder()` | appui de la charge axiale (trapèzes, en arrière de C7–T1) |
| `A.hip()` | centre de la tête fémorale |

`F.G.wall` : `inner`, `skin`, `diaph` (diaphragme), `floor` (plancher pelvien), `cavity` (polygone de la cavité abdomino-pelvienne).
`?debug=anchors` affiche les repères nommés.

## 5. Moteur musculaire `P2.muscles`

```js
const spec = { group: 'deep' | 'erector' | 'flexor', color?, tendon: 0.1, fascicles: [
  { path: [A => A.spinInf('L3'), A => A.mam('L5')], w: 4 /* mm */, fibers: 4, loa: [0, 1] /* segment de la ligne d'action */ },
]};
P2.muscles.drawMuscle(ctx, cam, F.A, spec, { grow, act, a, t: F.t });   // croissance 0→1, activation 0→1
P2.muscles.drawAttachments(ctx, cam, F.A, spec, { a });                 // points d'origine et de terminaison
const L = P2.muscles.resultantLine(F.A, spec);                          // {p, u} ligne d'action moyenne
const d = P2.muscles.momentArm(c, L.p, L.u);                            // bras de levier signé (mm)
P2.muscles.leverDim(ctx, cam, c, L.p, L.u, { a, prefix: 'd = ' });      // cote du bras de levier
P2.muscles.actionLine(ctx, cam, L.p, L.u, { a });                       // ligne d'action prolongée
P2.muscles.forceVector(ctx, cam, p, u, N, { a, label: 'F', toPoint });  // vecteur force vert, F_SCALE = 0,12 px/N
P2.muscles.momentArc(ctx, screenPt, r, M, { a });                       // arc de moment (N·m)
```

Couleurs nommées : `'cobalt'` (profonds), `'amber'` (érecteurs / haubans), `'crimson'` (fléchisseurs),
`'teal'` (vecteurs, moments), `'cyan'`, `'white'`, `'grey'`, `'bg'`, `'bone'`. **Toutes les valeurs affichées
(bras de levier, angles, moments) doivent être CALCULÉES sur la géométrie**, jamais écrites en dur, sauf les
constantes de la littérature, qui sont alors citées.

## 6. Règles obligatoires

1. **Pureté** : aucun `Math.random`, `Date`, `performance.now`, aucun état conservé entre frames (pas de variable
   modifiée d'une frame à l'autre ; un cache mémoïsé d'une fonction pure est autorisé). Textures : `SC.mulberry32(graine)`.
2. **Textes** : toujours `SC.text(ctx, s, x, y, {size, c, a, align, w, ls, bg, id})` (contrôle automatique des
   chevauchements). Taille ≥ 14 px pour les étiquettes anatomiques, ≥ 12 px pour les notes et références.
   `id` stable et unique par étiquette. Fond (`bg: 0.75`) pour les étiquettes posées sur le dessin.
3. `ctx.globalAlpha` : ne jamais le modifier sans `save()`/`restore()` (le framework y met l'opacité de vue).
4. Ne modifier **que votre fichier `partie2/sceneN.js`**. Si le framework doit changer, décrire le besoin dans
   le rapport final (champ `frameworkRequests`) et contourner localement si possible.
5. Pas de dépendance externe.

## 7. Rigueur scientifique (validée avec l'utilisateur)

- **Multifide** : faisceaux issus des épineuses et des lames, qui descendent sur 2 à 5 niveaux vers les
  processus mamillaires, la face dorsale du sacrum et l'EIPS. Innervation unisegmentaire. Action principale :
  **rotation sagittale postérieure, sans action de translation** → pas « d'opposition directe au
  cisaillement ». ≈ 20 % du moment extenseur en L4–L5. Effet dominant sur la zone neutre in vitro.
  Références : Macintosh & Bogduk 1986 (doi:10.1016/0268-0033(86)90147-6) ; Macintosh et al. 1986 (doi:10.1016/0268-0033(86)90146-4) ; Bogduk, Macintosh & Pearcy 1992 (doi:10.1097/00007632-199208000-00007) ; Wilke et al. 1995 (doi:10.1097/00007632-199501150-00011).
- **Transverse de l'abdomen** : face interne des cartilages 7 à 12, fascia thoraco-lombaire (feuillet moyen →
  processus costiformes, via le raphé latéral), 2/3 antérieurs de la lèvre interne de la crête iliaque, tiers
  latéral du ligament inguinal → ligne blanche. Effet corset → PIA. Décharge : **−18 à −31 % de compression
  (modèle, PIA 5 → 10 kPa)** (Stokes 2010, doi:10.1016/j.clinbiomech.2010.06.018) et hausse de raideur sans hausse
  de compression (Ludvig 2019, doi:10.1016/j.clinbiomech.2019.04.019). Libellé « selon modèle ».
- **Érecteurs** : iliocostal (crête iliaque, aponévrose → angles costaux 4–12, processus transverses C4–C6),
  longissimus (sacrum, aponévrose, processus accessoires → processus transverses T1–T12, côtes 3–12 ;
  longissimus capitis → **processus mastoïde**), épineux (épineuses T11–L2 → T1–T8). L'occiput est atteint par
  le semi-épineux de la tête (transversaire-épineux), pas par les érecteurs. Faisceaux thoraciques ≈ 50 % du
  moment extenseur en L4–L5 (Bogduk 1992). En flexion, bras de levier réduits d'au plus 18 % (Macintosh 1993,
  doi:10.1097/00007632-199306000-00013).
- **Carré des lombes** : lèvre interne de la crête iliaque, ligament ilio-lombaire → bord inférieur de la 12e côte
  et sommets des processus costiformes L1–L4 ; faisceaux ilio-costaux, ilio-transversaires et costo-transversaires.
- **Psoas** : faces latérales des corps T12–L5 et disques, processus costiformes L1–L5 → **petit trochanter**
  (tendon commun avec l'iliaque), réfléchi sur l'éminence ilio-pubienne. **Moments segmentaires très faibles,
  compression sévère, cisaillement important** (Bogduk, Pearcy & Hadfield 1992, doi:10.1016/0268-0033(92)90024-X).
  Effet lordosant **indirect** : fémur fixe → antéversion pelvienne.
- **Grand droit** : crête et symphyse pubiennes → cartilages 5–7 et xiphoïde, 3 intersections tendineuses.
  **Oblique externe** : face externe des côtes 5–12 → moitié antérieure de la crête iliaque, ligament inguinal,
  ligne blanche (fibres en bas et en avant). **Oblique interne** : FTL, 2/3 antérieurs de la crête iliaque,
  ligament inguinal → bord inférieur des côtes 10–12, ligne blanche (fibres en haut et en avant). Les obliques
  sont les principaux rotateurs du tronc (Macintosh 1993, doi:10.1111/j.1445-2197.1993.tb00520.x).
- **Panjabi 1992** : système passif, actif, contrôle neural ; **zone neutre** : diminuée de 83 % en flexion-
  extension par des forces musculaires simulées (Wilke 1995). La cocontraction psoas + multifide rigidifie en
  inclinaison latérale et en rotation, mais augmente de 13 % l'amplitude sagittale (Quint 1998,
  doi:10.1097/00007632-199809150-00003).

## 8. Tester

```bash
node render.js --page partie2/index.html --frames 120,300,450 --out /tmp/<scratch>/s1   # images PNG à inspecter
node render.js --page partie2/index.html --qa --start 0 --end 630                          # chevauchements / sorties de cadre
```
Ouvrir les PNG (outil Read) et inspecter **au moins 10 frames** de votre fenêtre, transitions comprises.
Déterminisme : rendre deux fois la même frame et comparer (`cmp`).
