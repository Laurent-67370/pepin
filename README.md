# Pépin, la graine voyageuse 🌱

[![Vérifications](https://github.com/Laurent-67370/pepin/actions/workflows/verifications.yml/badge.svg)](https://github.com/Laurent-67370/pepin/actions/workflows/verifications.yml)

Jeu de plateforme original en HTML5, jouable au doigt, au clavier ou à la manette. Installable comme une application (PWA) et jouable hors ligne.

**Jouer : https://laurent-67370.github.io/pepin/**

- 12 mondes : verger, racines, cime, forêt givrée, lac, nid du frelon, dunes, grotte de cristal, marais, volcan, nuages, citadelle
- Des ennemis propres à chaque monde et 2 boss : le Grand Frelon et le Frelon Royal
- 36 gouttes de rosée à trouver
- Carte du monde, médailles de temps (bronze, argent, or) par monde
- Mode assistance (vitesse réduite, invincibilité, double saut), mode classique avec vies limitées, qualité graphique automatique
- Tactile : joystick flottant, saut sur toute la moitié droite, bouton Élan
- Clavier : flèches ou ZQSD, Espace pour sauter, X ou Maj pour l'Élan, Échap pour la pause

## Installer
- Android (Chrome) : bouton « Installer le jeu sur cet appareil » dans le menu.
- iPhone (Safari) : bouton Partager, puis « Sur l'écran d'accueil ».

## Vérifier
- `node tools/verifier-niveaux.js [numéro de monde]` rejoue la physique du saut et signale toute arrivée, graine, goutte ou caisse inaccessible.
- `node tools/verifier-coherence.js` contrôle que `APP_VERSION` (index.html) et `VERSION` (sw.js) correspondent, et que le jeu et le serveur tirent le même monde du jour.
- `node --test tests/serveur.test.js` teste le serveur de classement (validation, défi du jour, anti-abus, sauvegarde, purge).

Ces trois vérifications tournent automatiquement sur GitHub Actions à chaque push.

Pixel art procédural et musiques Web Audio, tout est généré par code. La progression est enregistrée dans le navigateur.
