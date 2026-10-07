# Biomécanique du rachis — animation scientifique

Vidéo explicative de 30 s (1920×1080, 60 fps, 1800 frames) sur le fonctionnement biomécanique de la colonne vertébrale, générée par un moteur Canvas 2D **déterministe** : chaque image est une fonction pure de son numéro.

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
