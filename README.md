# Biomécanique du rachis — animations scientifiques

Deux vidéos explicatives (1920×1080, 60 fps) générées par un moteur Canvas 2D **déterministe** : chaque image est une fonction pure de son numéro.

| Partie | Sujet | Durée | Dossier |
|---|---|---|---|
| 1 | Le fonctionnement biomécanique de la colonne vertébrale | 30 s · 1800 frames | racine |
| 2 | Le haubanage musculaire : stabilisateurs locaux, érecteurs et couples de forces | 40 s · 2400 frames | [`partie2/`](#partie-2--le-haubanage-musculaire) |

Le moteur commun (maths, couleurs, typographie, primitives, modèle rachidien paramétrique) est dans `lib/core.js` ; les deux parties le chargent.

# Partie 1 — Le fonctionnement biomécanique de la colonne vertébrale

| Fichier | Rôle |
|---|---|
| `index.html` | Lecteur (temps réel, image par image) et API `window.seekToFrame(i)` |
| `animation.js` | Modèle anatomique, mécanique et rendu : `renderFrame(frame)` |
| `render.js` | Capture headless des 1800 frames en PNG (Playwright) + contrôle qualité |
| `STORYBOARD.md` | Découpage validé, seconde par seconde |
| `output.mp4` | Vidéo finale (H.264, yuv420p) |
| `contact_sheet.png` | Planche contact : 24 images, une toutes les 75 frames |

## Utilisation

```bash
# aperçu : ouvrir index.html dans un navigateur
#   ESPACE lecture/pause · ← → image par image · ↑ ↓ ±1 s · 0 début
#   index.html?frame=1300  → frame figée     index.html?debug → cadres des étiquettes

npm install                 # Playwright (déjà présent si installé globalement)
npm run render              # → ./frames/frame_00000.png … frame_01799.png
npm run video               # → output.mp4
npm run contact             # → contact_sheet.png
npm run qa                  # chevauchements / sorties de cadre des textes, sur les 1800 frames
```

Commandes FFmpeg utilisées :

```bash
ffmpeg -framerate 60 -i frames/frame_%05d.png -c:v libx264 -pix_fmt yuv420p output.mp4
ffmpeg -i output.mp4 -vf "select='not(mod(n,75))',scale=480:-1,tile=4x6" -vsync vfr contact_sheet.png
```

Options de `render.js` : `--start N --end M`, `--frames 0,450,900`, `--workers 4`, `--out dossier`, `--qa`.

## Architecture du moteur

`t → state(t) → courbe rachidienne → géométrie → caméra → dessin`

- **Pureté** : ni `Math.random`, ni `Date`, aucun état conservé entre deux frames. La texture trabéculaire vient d'un PRNG à graine fixe. Les frames peuvent être rendues dans n'importe quel ordre et en parallèle ; la frame 1799 est identique, octet par octet, à la frame 0, ce qui permet une lecture en boucle sans raccord.
- **Rachis paramétrique** : courbe intégrée le long de l'abscisse curviligne depuis S1, avec 24 vertèbres et le sacrum aux dimensions moyennes de l'adulte. La courbure de chaque région est une fenêtre de forme bêta, plus forte dans les disques (cunéiforme discal), calibrée pour que les angles de Cobb **mesurés** valent LL 50°, TK 40° et CL 30°. L'équilibre sagittal (C7 à l'aplomb de S1) est résolu à chaque frame : la pente sacrée en découle (≈ 32°).
- **Facettes ajustées** : le processus articulaire inférieur de chaque vertèbre est construit sur le processus supérieur de la vertèbre sous-jacente, pour que les articulations s'emboîtent quelle que soit la courbure.
- **Caméra unique** : zoom continu avec interpolation géométrique de l'échelle, grille millimétrée liée au monde (avec niveaux de détail) et échelle graphique dynamique.

## Modèle mécanique (scène 3) — didactique, ordres de grandeur

| Grandeur | Modèle | Source |
|---|---|---|
| Pression intradiscale P(θ) | 0,50 MPa (debout) → 1,10 MPa (flexion +10°) → 0,45 MPa (extension −5°) | Wilke et al., *Spine* 1999 |
| Compression Fc | Fc = P·A / 1,5, avec A = 18 cm² | Nachemson |
| Cisaillement Fs | Fs = Fc·tan β, où β est l'inclinaison mesurée du plan discal (R vertical) | statique |
| Mouvement | L4 pivote autour d'un CIR fixe ; bascule lombo-pelvienne γ = 0,8·θ | White & Panjabi |
| Noyau pulpeux | migration de 0,2 mm/° (postérieure en flexion) | études IRM, ≈ 1–2 mm |
| Facettes | 10 % de la charge au neutre, 0 % en flexion, 20 % en extension | Adams & Hutton |

Autres références : loi de Delmas R = N² + 1 (A. Delmas, 1951 ; Kapandji), unité fonctionnelle de Junghanns, modèle de stabilité de Panjabi (1992).

## Contrôle qualité (boucle QA)

1. `npm run qa` : test automatique des boîtes englobantes de tous les textes, sur les 1800 frames.
2. Planche contact : inspection visuelle des superpositions et de la lisibilité.
3. Détection des sauts : `tblend=difference` + `signalstats` sur `output.mp4` ; aucun pic isolé, la variation la plus forte correspond au dézoom continu de la scène 4.

# Partie 2 — Le haubanage musculaire

40 s (2400 frames, 0 → 2399). Palette : stabilisateurs profonds cobalt `#2d72d9`, érecteurs ambre `#ff9f1c`,
fléchisseurs et paroi abdominale cramoisi `#e71d36`, vecteurs et moments vert `#2ec4b6`, squelette cyan atténué.

| Fichier | Rôle |
|---|---|
| `partie2/index.html` | Lecteur et API `window.seekToFrame(i)` (`?frame=N`, `?debug`, `?debug=anchors`) |
| `partie2/anatomy.js` | Squelette sagittal (bassin, fémur, côtes, crâne, paroi abdominale), posture et ancrages musculaires nommés |
| `partie2/muscles.js` | Moteur musculaire : faisceaux, ventres, tendons, vague d'activation, ligne d'action, bras de levier, vecteurs force, arcs de moment |
| `partie2/animation.js` | Timeline globale, caméras, vues (sagittale, axiale L3, frontale postérieure) et transitions, HUD, panneau |
| `partie2/scene1.js … scene4.js` | Une scène par fichier (contrat dans `partie2/SPEC.md`) |
| `partie2/STORYBOARD.md` | Storyboard validé et table des corrections scientifiques |
| `partie2/output.mp4` | Vidéo finale (H.264, yuv420p) |
| `partie2/contact_sheet.png` | Planche contact : 24 images, une toutes les 100 frames |
| `partie2/contact_sheet_text.png` | Planche de lisibilité : 10 frames clés à 960 px, depuis les PNG sans perte |

```bash
npm run p2:qa             # chevauchements / sorties de cadre des textes, sur les 2400 frames
npm run p2:render         # → partie2/frames/frame_00000.png … frame_02399.png
npm run p2:video          # → partie2/output.mp4
npm run p2:contact        # → partie2/contact_sheet.png
npm run p2:contact-text   # → partie2/contact_sheet_text.png
npm run p2:build          # les cinq, dans l'ordre
```

## Scènes

| Scène | Temps | Contenu |
|---|---|---|
| 1 · Stabilisateurs locaux | 0–10 s | Multifide (L2–S1, processus mamillaires → épineux), résultante en L4/L5 et son bras de levier ; coupe axiale L3 (transverse, trois feuillets du fascia thoraco-lombaire) ; ballon de pression intra-abdominale et décharge axiale |
| 2 · Haubanage postérieur | 10–22 s | Érecteurs du rachis (iliocostal, longissimus jusqu'au processus mastoïde, épineux) ; antéflexion 0 → 40° avec M = F × d calculé en direct ; vue frontale : carré des lombes, inclinaison latérale de 10° |
| 3 · Sangle antérieure | 22–32 s | Psoas et iliaque (compression, faibles moments segmentaires), antéversion +6° ; grand droit et obliques, rétroversion −6° ; couples de forces pelviens |
| 4 · Équilibre des couples | 32–40 s | Antéflexion 30° avec 20 kg sur les épaules, cocontraction ; zone neutre de Panjabi |

## Modèles mécaniques (didactiques, ordres de grandeur)

| Grandeur | Modèle | Source |
|---|---|---|
| Posture | PI = PT + SS ; incidence 50°, pente sacrée ≈ 32°, version ≈ 18° ; antéflexion α répartie 0,6 lombaire / 0,4 hanche ; antéversion compensée par la lordose | Legaye et al. 1998 (relation) ; valeurs du modèle |
| Multifide | Rotation sagittale postérieure, sans action de translation ; ≈ 20 % du moment extenseur en L4–L5 | Macintosh & Bogduk 1986 ; Bogduk et al. 1992 |
| Pression intra-abdominale | −18 à −31 % de compression (modèle, PIA 5 → 10 kPa, efforts de 60 N·m) ; ceinture lombaire in vivo : raideur du tronc accrue avec moins d'activité abdominale, effet attribué à la PIA | Stokes 2010 ; Ludvig 2019 |
| Moment extenseur (scène 2) | Statique plane en L4–L5 : W = 60 % de 70 kg appliqué en G ; F_ES = W·d_G / d_ES ; C = (W + F_ES)·n du disque, n = normale au plateau ; d_ES mesuré sur la géométrie | Macintosh et al. 1993 ; Bogduk et al. 1992 |
| Carré des lombes | Allongement des faisceaux = longueur / longueur au repos − 1, calculé sur la géométrie frontale | modèle |
| Psoas | Compression et cisaillement importants, moments segmentaires faibles ; effet lordosant indirect par l'antéversion pelvienne | Bogduk, Pearcy & Hadfield 1992 |
| Grand droit, obliques | Insertions propres de chaque muscle ; les obliques sont les principaux rotateurs du tronc | Macintosh 1993 |
| Équilibre des couples (scène 4) | Statique plane en L4–L5 : M_req = W·d_G + P·d_L (20 kg sur les épaules) ; extenseurs F_ES·d_ES = M_req + M_ABD ; cocontraction illustrative M_ABD = 15 % de M_ES | modèle ; Granata & Marras 2000 (modèle EMG : compression +12 à 18 %, stabilité +34 à 64 %) |
| Stabilité | Trois sous-systèmes (passif, actif, contrôle neural) ; zone neutre en flexion-extension réduite de 83 % par des forces musculaires simulées (in vitro) ; la cocontraction psoas + multifide rigidifie en inclinaison et en rotation, +13 % d'amplitude sagittale ; rachis ligamentaire seul : flambement ≈ 88 N | Panjabi 1992 I-II ; Wilke et al. 1995 ; Quint et al. 1998 ; Crisco et al. 1992 |

Les DOI de toutes les sources figurent dans `partie2/SPEC.md` (§7).

## Contrôle qualité

1. `npm run p2:qa` : boîtes englobantes de tous les textes, transportées à travers les transitions de vue, sur les 2400 frames.
2. Planche contact et planche de lisibilité des textes anatomiques.
3. Boucle : la frame 2399 est identique, octet par octet, à la frame 0.
4. Détection des sauts sur `partie2/output.mp4` (`tblend=difference` + `signalstats`).
