# Pépin, la graine voyageuse 🌱

Jeu de plateforme original en HTML5, jouable au doigt, au clavier ou à la manette. Installable comme une application (PWA) et jouable hors ligne.

**Jouer : https://laurent-67370.github.io/pepin/**

- 12 mondes : verger, racines, cime, forêt givrée, lac, nid du frelon, dunes, grotte de cristal, marais, volcan, nuages, citadelle
- Des ennemis propres à chaque monde et 2 boss : le Grand Frelon et le Frelon Royal
- 36 gouttes de rosée à trouver
- Mode classique avec vies limitées, qualité graphique automatique (Réglages)
- Tactile : joystick flottant, saut sur toute la moitié droite, bouton Élan
- Clavier : flèches ou ZQSD, Espace pour sauter, X ou Maj pour l'Élan, Échap pour la pause

## Installer
- Android (Chrome) : bouton « Installer le jeu sur cet appareil » dans le menu.
- iPhone (Safari) : bouton Partager, puis « Sur l'écran d'accueil ».

## Vérifier les niveaux
`node tools/verifier-niveaux.js [numéro de monde]` rejoue la physique du saut et signale toute arrivée, graine, goutte ou caisse inaccessible.

Pixel art procédural et musiques Web Audio, tout est généré par code. La progression est enregistrée dans le navigateur.
