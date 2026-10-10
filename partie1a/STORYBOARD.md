# Partie 1a — « Conflit zygapophysaire, transfert de charge par l'arc neural et pathomécanique de l'hyperextension lombaire »

**Storyboard et plan de coordonnées — validé (option A).**

- **Format** : 1920×1080, 60 fps, **35 s = 2100 frames, numérotées 0 → 2099**. Le brief écrivait « 0–600 / 601–1320 / 1321–2100 », mais la frame 2100 n'existe pas.
- **Moteur** : Canvas 2D déterministe, piloté par `window.seekToFrame(i)`. Il réutilise `lib/core.js` (texte, contrôle des chevauchements, primitives).
- **Textes à l'écran** : tous en français, avec la virgule décimale (« 2,0 mm »).

---

## 1. Corrections scientifiques proposées (sources PubMed)

| Brief | Problème | Proposition | Source |
|---|---|---|---|
| Lordose L4–L5 neutre 12° | — | **Conservé : 12°** (≈ ¼ de la lordose L1–S1) | Mi Le 2022, doi:10.1038/s41598-022-21840-x ; Chen 1994 |
| Extension physiologique 12° → 18°, puis hyperextension → **28°** | L4–L5 ne s'étend que de **≈ 3–6°** : 5,8° in vitro sous 10 N·m. +16° représentent ≈ 3 fois la fin de course et supposeraient une rupture (anneau, LLA, épineuses). | **Option A (recommandée)** : 12° → **15°** (physiologique) → **19°** (hyperextension forcée, +7°). **Option B** : garder 12 → 18 → 28°, avec la mention à l'écran « amplitude exagérée ×3 pour la lisibilité ». | Yamamoto 1989, doi:10.1097/00007632-198911000-00020 ; Pearcy 1984 ; Liu 2016, doi:10.1016/j.jbiomech.2015.12.029 |
| « Disque 82 % / facettes 18 % » | La mesure de référence est **16 %** debout (in vitro), avec une fourchette de 10 à 20 %. | **DISQUE ≈ 84 % / FACETTES ≈ 16 %** | Adams & Hutton 1980, doi:10.1302/0301-620X.62B3.6447702 ; Yang & King 1984 |
| Facettes 18 % → **42 % (+133 %)** en hyperextension | Sur un **disque sain**, l'extension ne multiplie la part facettaire que par ≈ 1,65. Les valeurs ≥ 40 % n'existent qu'avec un **disque pincé ou dégénéré**. | Ajouter un temps « **DISQUE PINCÉ (−2 mm)** » avant l'hyperextension. Afficher **≈ 26 %** (disque sain, fin d'extension) puis **≈ 40 %** (disque pincé + hyperextension). Supprimer « +133 % ». | Sawa & Crawford 2008, doi:10.1016/j.jbiomech.2008.06.010 ; Pollintine 2004, doi:10.1097/01.brs.0000119401.23006.d2 ; Luo 2007 ; Dunlop 1984 |
| « CONTRAINTE FACETTAIRE : 42 % » | Un pourcentage de charge n'est pas une contrainte (MPa). | « **PART FACETTAIRE DE LA COMPRESSION** » | — |
| Espace inter-facettaire **3,2 mm** | L'interligne mesuré à L4/L5 vaut 1,95 ± 0,43 mm. | **2,0 mm** au neutre ; cartilage ≈ 0,6 mm par face | Simon 2012, doi:10.1097/BRS.0b013e3182552ec9 ; Woldtvedt 2011 |
| Foramen **−28,4 %** (« jusqu'à −30 % ») | −28,4 % n'apparaît dans aucune source. Mesures du neutre à l'extension : ≈ −15 % in vitro, ≈ −5 % in vivo, −20 % au plus. La valeur de −30 % correspond au trajet **flexion → extension**. | Valeur **calculée sur la géométrie** du modèle : −5 % (15°), −13 % (disque pincé), **≈ −18 %** (19°). Repère affiché : « −15 % en extension (in vitro) ». | Inufusa 1996, doi:10.1097/00007632-199611010-00002 ; Zhong 2015 ; Panjabi 1983 ; Singh 2013 |
| Ordre des butées : PAI → lame, puis épineuses | Les épineuses entrent souvent en contact **en premier**, selon leur espacement. | Le modèle garde PAI puis épineuses (géométrie choisie). Un panneau précise « l'ordre dépend de l'espacement des épineuses ». | Adams, Dolan & Hutton 1988, doi:10.1097/00007632-198809000-00009 |
| « Bras de levier antérieur… tension de l'anneau antérieur et du LLA » | Le pivot postérieur est un **schéma mécanique**, non mesuré. Le LLA s'allonge d'environ +2 % en extension. | Le contact postérieur devient le **pivot** et l'avant du disque s'ouvre, étiqueté « schéma mécanique ». Valeur affichée : « LLA ≈ +2 % ». | Palanca 2020, doi:10.1371/journal.pone.0227210 ; O'Connell 2011 |
| « **Cisaillement postérieur (τ)** » | **Faux.** Une charge axiale sur un segment en lordose produit un **cisaillement ANTÉRIEUR** de L4 sur L5, retenu par les facettes. C'est la **réaction facettaire, dirigée vers l'arrière**, qui cintre l'isthme. | « **Cisaillement antérieur (τ)** », « **Réaction facettaire (vers l'arrière)** », « **Cintrage de l'isthme** » au lieu de « moment de flexion postérieur » | Troup 1976 ; Adams & Hutton 1983, doi:10.1097/00007632-198304000-00017 ; Green, Allvey & Adams 1994 |
| Isthme sollicité | — | Dans l'unité L4–L5, **l'isthme de L5 est frappé** par la pointe du PAI de L4 (effet « casse-noix »). Celui de L4 est cintré par son propre PAI. L5 représente ≈ 90 % des spondylolyses. | Suezawa 1980, doi:10.1007/BF00268157 ; Terai 2010 ; Sakai 2009 |
| « MICRO-FRACTURE **SUBCARDIALE** » | Terme erroné | « MICRO-FRACTURES **SOUS-CHONDRALES** » | — |
| « CINÉMATIQUE **SACRO-LOMBAIRE** » | L4–L5 est un étage lombaire ; « lombo-sacré » désigne L5–S1. | « **CINÉMATIQUE LOMBAIRE L4–L5 : EXTENSION PHYSIOLOGIQUE** » | — |
| « SYNDROME FACETTAIRE COMPRESSIF » | L'entité clinique est contestée : on ne la diagnostique que par blocs anesthésiques contrôlés. Le pincement des méniscoïdes reste une hypothèse. | « **DOULEUR FACETTAIRE (ZYGAPOPHYSAIRE)** : capsule innervée par les rameaux médiaux L3 et L4 », avec « 15–40 % des lombalgies chroniques (blocs) » | Schwarzer 1994/1995, doi:10.1136/ard.54.2.100 ; Bogduk 1983 ; Engel & Bogduk 1982 |
| Courbe « MPa et με vs angle », inflexion à **20°** | Aucune courbe publiée, et 20° dépasse l'amplitude réelle. | **« Modèle illustratif »** : inflexion à la **mise en contact** (17,5°). Pression facettaire calée sur ≈ 3 MPa en fin d'extension (éléments finis). Seuils matériau tracés en pointillés : 2 500 με (début d'endommagement en fatigue) et 7 300 με (limite élastique corticale), avec la mention « os fémoral, in vitro ». | Du 2016, doi:10.1186/s12891-016-0980-4 ; Pattin 1996 ; Bayraktar 2004 |
| `Fc` en #00d2ff | Même couleur que l'os, donc confusion possible | `Fc` en bleu ciel **clair #8fe9ff** (opaque, avec halo) ; l'os reste #00d2ff translucide | — |
| Racine dans le foramen | — | « **Racine émergente L4 + ganglion spinal** », sous le pédicule de L4 | Cohen 1990 ; Jenis & An 2000 |

---

## 2. Repère, échelle et coordonnées du canevas

- **Monde en mm, repère lié à L5 (fixe)** : origine au centre du plateau supérieur de L5, x vers l'arrière (+), y vers le bas (+).
- **Écran** : profil gauche, antérieur à gauche ; **5 px/mm**, soit une maille de 50 px = 10 mm conforme au brief. Les graduations du quadrillage sont indexées en mm depuis l'origine.
- **Orientation in vivo** : le plateau de L5 est **incliné de 20°**, bord antérieur plus bas, et la gravité reste verticale à l'écran. C'est cette inclinaison qui rend visible le cisaillement **antérieur**.
- **Origine sur le canevas** : centre du plateau sup. de L5 = **(600, 640) px**. La conversion est `écran = (600, 640) + 5 · R(−20°) · p_mm`.

### Cinématique (option A) : coordonnées calculées par le prototype

| Repère | mm (repère L5) | Écran (px) |
|---|---|---|
| Centre du plateau sup. de L5 (fixe) | (0, 0) | **(600, 640)** |
| CIR physiologique de L4/L5 (84–92 % de la profondeur discale, juste sous le plateau ; Liu 2016) | (13, 2) | **(665, 627)** |
| Pivot après contact : pointe du PAI de L4 sur l'isthme de L5 | (35,5 ; 13,2) | **(790, 641)** |
| Contact épineux L4/L5 (Baastrup) | (64,7 ; 1,2) | **(906, 535)** |

| Instant | Angle | Disque ant./post. (mm) | Centre du plateau inf. de L4 (px) | Pointe du PAI de L4 (px) | Écart PAI → isthme | Écart épineux | Foramen |
|---|---|---|---|---|---|---|---|
| Neutre (0–5 s) | 12° | 13,0 / 8,0 | (577, 592) | (787, 620) | 4,3 mm | 7,7 mm | 0 % |
| Extension physiologique (9,5 s) | 15° | 14,6 / 7,8 | (579, 588) | (787, 626) | 3,0 mm | 5,0 mm | −5,2 % |
| Disque pincé −2 mm (12,5 s) | 15° | 12,6 / 5,8 | (582, 597) | (790, 636) | 1,1 mm | 3,0 mm | −13,0 % |
| Butée zygapophysaire (16,0 s) | 17,5° | 14,0 / 5,6 | (584, 594) | (790, 641) | **0** | 0,8 mm | −17,1 % |
| Conflit inter-épineux (17,5 s) | 19° | 15,4 / 6,1 | (585, 588) | (790, 641) | 0 | **0** | **−18,5 %** |

- **Règle de mouvement** : L5 reste fixe. L4 pivote d'abord autour du CIR, puis, une fois le contact établi, autour de ce point de contact. Le pivot apparaît à l'écran sous la forme d'une cible qui glisse de (665, 627) à (790, 641).
- **Translation postérieure couplée** : ≤ 0,6 mm (Liu 2016).
- **Contacts garantis** : la surface de l'isthme et le bord de l'épineuse de L5 sont construits sur la trajectoire de L4. Les contacts tombent donc exactement à 17,5° et à 19°, sans interpénétration.
- **Option B** (angles du brief) : même construction, avec le contact du PAI à 20° et le contact épineux à 28°, sans temps de pincement discal ; le foramen calculé atteint alors ≈ −28 %.

### Zones de l'écran (aucun chevauchement : vérifié par la QA automatique à chaque frame)

| Zone | Boîte (px) |
|---|---|
| En-tête : « PARTIE 1A · 01A / 04 », titre de section, sous-titre | x 80–1180, y 50–160 |
| Bandeau d'alerte (scène 2) | x 440–1190, y 178–222 |
| Unité fonctionnelle L4–L5 | x ≈ 490–960, y ≈ 395–870 |
| Étiquettes antérieures (alignées à droite sur x = 430) | y = 440 (corps vertébral de L4), 520 (LLA), 600 (anneau fibreux), 650 (noyau pulpeux), 720 (plateau / os sous-chondral), 800 (corps vertébral de L5) |
| Étiquettes postérieures (alignées à gauche sur x = 1000) | y = 420 (épineuse de L4), 465 (ligament supra-épineux), 510 (ligament interépineux), 560 (articulation zygapophysaire, capsule), 605 (PAI de L4 / PAS de L5), 655 (isthme de L5), 700 (lame de L5), 745 (épineuse de L5) |
| Rangée haute (foramen) | « FORAMEN INTERVERTÉBRAL · RACINE L4 + GANGLION » centré en (700, 345) |
| Rangée basse (canal) | « LIGAMENT JAUNE (canal, pointillés) » en (760, 905) |
| Cartouche de données | x 1230–1840, y 180–420 (5 lignes : y 236, 276, 316, 356, 396) |
| Jauges | x 1230–1840, y 440–625 |
| Loupe ×3 (scène 2) puis graphique (scène 3) | x 1230–1840, y 650–990 |
| Orientation (ANT / POST / CRÂNIAL) et échelle « 10 mm » (50 px) | x 60–280, y 880–1000 |
| Frise des 3 scènes | y 1015–1060 |

---

## 3. Découpage seconde par seconde (option A)

### Scène 1 · 0–10 s · frames 0–599 — « 01A / 04 — CINÉMATIQUE LOMBAIRE L4–L5 : EXTENSION PHYSIOLOGIQUE »

| t (s) | Frames | Image | HUD (français) |
|---|---|---|---|
| 0,0–0,8 | 0–47 | Le quadrillage apparaît en fondu ; l'en-tête glisse en place. | En-tête |
| 0,5–3,0 | 30–179 | Tracé progressif de L5 puis de L4 : contours nets, liseré sous-chondral, disque (lamelles de l'anneau, noyau), LLA, ligaments inter- et supra-épineux, capsule, ligament jaune en pointillés. | — |
| 2,0–5,0 | 120–299 | Étiquettes anatomiques en escalier, d'abord la colonne gauche puis la droite. `Fc` (bleu ciel clair), normale au disque ; `Ff` (vert #06d6a0) à la facette. | Cartouche : **ANGLE SEGMENTAIRE : +12°** · **RÉPARTITION DE CHARGE : DISQUE ≈ 84 % / FACETTES ≈ 16 %** · **INTERLIGNE FACETTAIRE : 2,0 mm** |
| 5,0–9,5 | 300–569 | Extension 12° → 15° autour du CIR : le PAI de L4 glisse vers le bas et l'arrière le long du PAS de L5 (flèche de glissement), la capsule se tend, l'interligne reste ouvert. Pas de contact osseux. | Valeurs en direct : **ANGLE SEGMENTAIRE : +12° → +15°** · facettes 16 → 20 % · foramen −5 % · « Extension physiologique L4–L5 : ≈ 3–6° » |
| 9,5–10,0 | 570–599 | Maintien ; fondu des étiquettes de la scène 1. | — |

### Scène 2 · 10–22 s · frames 600–1319 — « HYPEREXTENSION CRITIQUE : CONFLIT ARTICULAIRE POSTÉRIEUR »

| t (s) | Frames | Image | HUD |
|---|---|---|---|
| 10,0–10,6 | 600–635 | Changement de titre de section | — |
| 10,6–12,5 | 636–749 | **Disque pincé (−2 mm)** : L4 descend, l'interligne se resserre, le foramen se réduit. | « DISQUE PINCÉ (DÉGÉNÉRATIF) : −2 mm » · facettes → ≈ 28 % · foramen −13 % |
| 12,5–16,0 | 750–959 | Extension 15° → 17,5° : la pointe du PAI de L4 descend sur l'isthme de L5. **À 16,0 s (frame 960), butée.** Le pivot saute du CIR au point de contact. | Flèches rouges #d90429 « **BUTÉE ZYGAPOPHYSAIRE** » ; bandeau « **CONFLIT ARTICULAIRE POSTÉRIEUR DÉTECTÉ** » |
| 16,0–17,5 | 960–1049 | Extension 17,5° → 19° autour du pivot postérieur : l'avant du disque s'ouvre, le LLA se colore en tension. **À 17,5 s (frame 1050), contact des épineuses.** | « **CONFLIT INTER-ÉPINEUX (PHÉNOMÈNE DE BAASTRUP)** » · « pivot postérieur : schéma mécanique » |
| 17,5–22,0 | 1050–1319 | Maintien à 19°. Loupe ×3 sur la facette et l'isthme : carte de contrainte ambre → cramoisi (indice relatif). Foramen surligné : racine L4 et ganglion à l'étroit. | **ANGLE SEGMENTAIRE : +19° (HYPEREXTENSION CRITIQUE)** · jauge **PART FACETTAIRE DE LA COMPRESSION : ≈ 40 %** (repères 16 % neutre et 26 % disque sain) · **SURFACE DU FORAMEN : −18 %** (modèle ; repère −15 % in vitro) · « l'ordre des butées dépend de l'espacement des épineuses » |

### Scène 3 · 22–35 s · frames 1320–2099 — « SYNTHÈSE : PATHOMÉCANIQUE DE L'HYPEREXTENSION »

| t (s) | Frames | Image | HUD |
|---|---|---|---|
| 22,0–23,0 | 1320–1379 | Changement de titre ; la loupe se replie. | — |
| 23,0–27,0 | 1380–1619 | Décomposition des forces. `F_résultante` (charge axiale 500 N, verticale, appliquée à L4) se décompose en **`Fc`** (normale au disque) et **`Cisaillement antérieur (τ)`** (parallèle au plateau, vers l'avant). La **`Réaction facettaire`** sur le PAI de L4 est dirigée vers l'arrière et le haut ; un **moment de cintrage** (arc) agit sur l'isthme de L4 ; l'**impact du PAI de L4 sur l'isthme de L5** est marqué en rouge. | Cartouche : F = 500 N · Fc = F·cos 20° ≈ 470 N · τ = F·sin 20° ≈ 171 N · facettes ≈ 40 % |
| 27,0–30,5 | 1620–1829 | Diagnostics : (1) « **MISE EN DÉCHARGE DISCALE ANTÉRIEURE : TENSION ANORMALE DE L'ANNEAU ET DU LLA** » ; (2) « **MICRO-FRACTURES SOUS-CHONDRALES · ZONE À RISQUE ISTHMIQUE (L5)** » ; (3) « **DOULEUR FACETTAIRE : CAPSULE PINCÉE** », avec des impulsions le long du rameau médial jusqu'à la branche dorsale. | « Spondylolyse : L5 dans ≈ 90 % des cas » · « Douleur facettaire : 15–40 % des lombalgies chroniques (blocs) » |
| 28,0–34,0 | 1680–2039 | Graphique : abscisse « Angle de lordose L4–L5 (°) » de 12 à 19° ; courbes « Pression de contact facettaire (MPa) » et « Déformation de l'isthme (με) », tracées de gauche à droite ; **inflexion à la mise en contact (17,5°)** marquée « RÉGIME NON LINÉAIRE » ; seuils en pointillés à 2 500 με et 7 300 με. | « **MODÈLE ILLUSTRATIF** » · sources en pied de graphique |
| 34,0–35,0 | 2040–2099 | Fondu vers le quadrillage vide (frame 2099 ≈ frame 0, bouclable). | — |

---

## 4. Palette et typographie

- **Couleurs** : fond #0a0e14 ; quadrillage blanc à 5 % (maille de 50 px). Os #00d2ff translucide avec liseré sous-chondral. Contacts ambre #ffb703 → cramoisi #d90429. Vecteurs et HUD vert #06d6a0 et rouge signal #ef476f. `Fc` bleu ciel clair #8fe9ff.
- **Polices** : monospace pour le HUD et les données, sans-serif pour les titres.
- **Tailles** : étiquettes anatomiques ≥ 14 px, notes ≥ 12 px ; texte secondaire contrasté à 5:1 au moins.

## 5. Livrables (étapes 2 et 3)

- **Code** : `partie1a/index.html` et `partie1a/scene1a.js`, avec la géométrie paramétrique f(t), sans `Math.random` ni horloge.
- **Capture** : `render.js` existant (Playwright, `--page partie1a/index.html --out partie1a/frames_1a`).
- **Vidéo et planche** : `ffmpeg -framerate 60 -i frames_1a/frame_%05d.png -c:v libx264 -pix_fmt yuv420p output_1a.mp4`, puis `contact_sheet_1a.png` (une image toutes les 90 frames, grille 4×6). Les deux commandes s'exécutent dans `partie1a/`.
- **Contrôles** : QA des textes sur les 2100 frames, `ffprobe` (2100 frames, 35,000 s), détection des sauts, inspection visuelle.
