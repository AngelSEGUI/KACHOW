# Interface graphique KACHOW (Partie 8)

Nouvelle interface web de contrôle et de programmation du robot. Elle remplace uniquement
`templates/` et `static/`. **`app.py` et les firmwares ne sont pas modifiés.**

## Installation

Copier les fichiers dans `rpi-gui/` (en écrasant les anciens) :

```
rpi-gui/
├── templates/index.html
└── static/
    ├── css/style.css
    └── js/
        ├── robot.js        # liaison Socket.IO + simulateur / odométrie
        ├── blocks.js       # éditeur de blocs type Scratch + interpréteur
        ├── main.js         # onglets, pavé de commande, indicateurs, réglages
        └── vendor/socket.io.min.js   # client Socket.IO 4.7.5 local (fonctionne sans Internet)
    └── fonts/              # Racing Sans One, Barlow Condensed, Space Mono (licence SIL OFL), servies en local
```

Style : thème « course » (rouge, feu, damier), en version sombre ou claire : bouton ☀/☾ de la barre
du haut, ou Réglages → Thème (Sombre / Clair / Auto = suit le système). Mise en page adaptée
ordinateur, tablette (portrait/paysage) et téléphone (portrait/paysage).

Puis lancer `python3 app.py` comme avant et ouvrir `http://<IP_RPI>:5000`.

## Trois onglets

| Onglet | Contenu |
|---|---|
| **Pilotage** | Croix directionnelle tactile/souris : avant, arrière, rotation gauche, rotation droite, stop (maintenir = mouvement, relâcher = arrêt). Clavier : ZQSD / flèches, Espace = stop. Flux caméra YOLO (la carte n'existe qu'en mode démo), capteurs, journal |
| **Programmation** | Bibliothèque de blocs (Mouvement, Actions, Capteurs, Contrôle), espace de travail glisser-déposer, Lancer/Arrêter, exemples, import/export JSON, aperçu du code généré |
| **Réglages** | Mode Wi-Fi (point d'accès du robot ou réseau commun), calibration cm/s et °/s, tableau de compatibilité firmware |

Le bouton **STOP** rouge (ou la touche Espace) est toujours visible et interrompt aussi un programme en cours.

## Mode démo

Si aucun serveur Socket.IO ne répond (page ouverte hors de la RPi), l'interface bascule
automatiquement sur un simulateur 2D : arène avec obstacles, capteurs ultrason simulés,
collisions (arrêt + bip + message), caméra simulée qui détecte une balle. Utile pour
préparer et tester un programme sans le robot.

## Protocole utilisé (compatible avec l'existant)

| Sens | Événement | Données |
|---|---|---|
| client → serveur | `move` | `{direction: forward\|backward\|left\|right\|stop}` → `F/B/L/R/S` sur le port série |
| serveur → client | `cpu_temp` | `{temp}` |
| HTTP | `/video_feed` | flux MJPEG + YOLO |

Les blocs « Avancer de … cm » / « Tourner de … ° » sont exécutés **côté navigateur** :
la distance est convertie en durée (calibration dans Réglages), puis `S` est envoyé.

## Extensions prévues (optionnelles, côté `app.py`)

L'interface écoute déjà ces événements ; il suffira de les émettre depuis `app.py` quand
les capteurs seront câblés :

- `telemetry` → `{battery, dist_front, dist_back, heading, bump: {front, back, left, right}}`
- `detections` → `[{label, conf}]` (résultats YOLO)
- `voice` → `{word}` (mot reconnu par le micro)

Elle émet `action` → `{type: gripper|led|say|audio|beep, ...}` pour la pince, la LED et
le haut-parleur. `app.py` actuel ignore cet événement
sans erreur ; ces blocs sont marqués **sim** tant que le firmware ne les gère pas.

> ⚠️ Le firmware garde la dernière commande reçue. Si la liaison Wi-Fi est coupée pendant
> un mouvement, le robot continue : l'interface envoie `S` dès qu'elle perd le focus, mais
> un *watchdog* côté ESP32 (arrêt si aucune commande depuis ~500 ms) serait plus sûr.
