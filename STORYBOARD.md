# Storyboard — « Biomécanique du rachis »

1920×1080 · 60 fps · 30 s = 1800 frames (0 → 1799) · rendu Canvas 2D déterministe (`renderFrame(frame)`).

## Charte

| Rôle | Couleur |
|---|---|
| Fond | `#0f141c` + grille millimétrée liée au monde (LOD selon le zoom) |
| Structures, lignes techniques, lordoses | cyan `#00d2ff` |
| Os, texte, cyphose | blanc cassé `#e8e4da` |
| Cotes, annotations secondaires | gris-bleu `#5a6b80` |
| Pression, cisaillement | orange `#ff8a3d` |
| Compression, contrainte max | rouge `#ff3b3b` |

Convention : vue sagittale, profil gauche — **antérieur à gauche**. Une seule caméra virtuelle (zoom continu, pas de coupe).
Zone visuelle x ∈ [80, 1180] px, panneau de données x ∈ [1260, 1840] px. Échelle graphique dynamique en bas à gauche.

## Découpage

| Scène | Temps | Frames |
|---|---|---|
| 1 Courbures & loi de Delmas | 0,0 – 8,0 s | 0 – 479 |
| 2 Segment mobile (Junghanns) | 8,0 – 18,0 s | 480 – 1079 |
| 3 Contraintes flexion / extension | 18,0 – 26,0 s | 1080 – 1559 |
| 4 Synthèse, stabilité, alignement | 26,0 – 30,0 s | 1560 – 1799 |

### Scène 1 — Courbures physiologiques (0 – 8 s)
| t (s) | Action |
|---|---|
| 0,0 – 0,8 | Fondu grille + HUD, axe vertical de référence |
| 0,8 – 2,0 | 24 vertèbres + sacrum s'empilent en **tige rectiligne** ; Delmas `N = 0 → R = 1` |
| 2,0 – 3,4 | Formation de la lordose lombaire (L1–S1 ≈ 50°) → `R = 2` |
| 3,4 – 4,8 | Cyphose thoracique (T4–T12 ≈ 40°) → `R = 5` |
| 4,8 – 6,0 | Lordose cervicale (C2–C7 ≈ 30°) → `R = 10` |
| 6,0 – 7,2 | Charge axiale : réponse élastique amortie des courbures, `RÉSISTANCE ×10` |
| 7,2 – 8,0 | Réticule sur L4–L5, début du zoom |

Les angles affichés sont mesurés en direct sur la géométrie (méthode de Cobb). L'équilibre global (C7 à l'aplomb de S1) est résolu à chaque frame.

### Scène 2 — Segment mobile rachidien (8 – 18 s)
| t (s) | Action |
|---|---|
| 8,0 – 9,0 | Fin du zoom (≈ 8,5 px/mm, échelle réelle) ; détails osseux (cortical, trabéculaire, plateaux) |
| 9,0 – 11,2 | Enveloppe de l'unité fonctionnelle ; 7 composants numérotés (disque, LLA, LLP, ligament jaune, interépineux, supra-épineux, zygapophysaires) |
| 11,0 – 14,0 | Anneau fibreux en lamelles, noyau pulpeux ; encart coupe axiale + lamelles déroulées (±30°) |
| 14,0 – 17,0 | Principe hydrostatique : pression isotrope du noyau, tension circonférentielle des fibres, P ≈ 0,50 MPa (Wilke 1999) |
| 17,0 – 18,0 | Repère discal n̂ / t̂ et centre instantané de rotation (CIR) |

### Scène 3 — Contraintes dynamiques (18 – 26 s)
θ(t) de L4 par rapport à L5, rotation autour du CIR : 0° → +10° (flexion, 19,0–21,5 s) → maintien → −5° (extension, 22,3–23,8 s) → maintien → 0° (24,8–26,0 s).

Vecteurs (échelle unique 0,15 px/N) : compression Fc ⟂ disque (rouge), cisaillement Fs ∥ disque (orange), résultante R (pointillés), force facettaire Ff.
Disque déformé en coin, migration du noyau (≈ 0,2 mm/°), coloration des lamelles et ligaments selon leur déformation, décoaptation / contact des facettes.
Panneau : θ, Fc, Fs, P, Δx noyau, part facettaire, oscilloscope θ(t)/P(t), pictogramme du tronc.

Modèle didactique : P(θ) calé sur Wilke 1999 (0,50 → 1,10 MPa), Fc = P·A/1,5 (Nachemson, A = 18 cm²), Fs = Fc·tan β (β inclinaison mesurée du disque).

### Scène 4 — Synthèse (26 – 30 s)
| t (s) | Action |
|---|---|
| 26,0 – 27,0 | Dézoom vers le rachis entier |
| 27,0 – 28,5 | Fil à plomb C7 + SVA mesurée ; facettes allumées de C2 à S1 ; boucle de stabilité de Panjabi (passif / actif / contrôle neural) |
| 28,5 – 29,4 | Phrase de synthèse |
| 29,4 – 30,0 | Fondu vers la grille vide : la frame 1799 est identique à la frame 0 (boucle parfaite) |
