/* Vérifications rapides de cohérence entre le jeu, le service worker et le serveur.
   Usage : node tools/verifier-coherence.js   (depuis la racine du dépôt)
   1. APP_VERSION (index.html) et VERSION (sw.js) doivent correspondre, sinon les PWA installées ne se mettent pas à jour.
   2. Le monde du défi du jour doit être tiré de la même façon côté jeu et côté serveur.
   3. Le serveur doit connaître autant de mondes que le jeu, avec un temps minimal pour chacun. */
'use strict';
const fs = require('fs'), path = require('path');
const lire = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = lire('index.html'), sw = lire('sw.js'), serveur = lire('server/pepin-scores.js');
const erreurs = [];
const extraire = (texte, re, quoi) => { const m = texte.match(re); if (!m) erreurs.push(`${quoi} introuvable`); return m && m[1]; };

// 1. Versions
const appVersion = extraire(html, /const APP_VERSION = '([^']+)'/, 'APP_VERSION dans index.html');
const swVersion = extraire(sw, /const VERSION = 'pepin-([^']+)'/, 'VERSION dans sw.js');
if (appVersion && swVersion && appVersion !== swVersion)
  erreurs.push(`versions différentes : index.html ${appVersion}, sw.js pepin-${swVersion}`);

// 2. Nombre de mondes et temps minimaux
const vm = require('vm'), a = html.indexOf('function Builder(w)'), b = html.indexOf('const LEVELS = ['), e = html.indexOf('\n];', b) + 3;
const ctx = { T: 16, ROWS: 15 }; vm.createContext(ctx); vm.runInContext(html.slice(a, e).replace('const LEVELS', 'var LEVELS'), ctx);
const mondesJeu = ctx.LEVELS.length; // même extraction que verifier-niveaux.js
const mondesServeur = +extraire(serveur, /const LEVELS = (\d+);/, 'LEVELS dans pepin-scores.js');
const tempsMin = (extraire(serveur, /const MIN_TIME = \[([^\]]+)\]/, 'MIN_TIME dans pepin-scores.js') || '').split(',').filter(s => s.trim()).length;
if (mondesJeu !== mondesServeur) erreurs.push(`le jeu a ${mondesJeu} mondes, le serveur en attend ${mondesServeur}`);
if (tempsMin !== mondesServeur) erreurs.push(`MIN_TIME a ${tempsMin} valeurs pour ${mondesServeur} mondes`);

// 3. Monde du jour : on exécute les deux fonctions sur trois ans de dates
const fonction = (texte, quoi) => {
  const corps = extraire(texte, /function dailyWorld\(day\) \{([^\n]+)\}/, `dailyWorld dans ${quoi}`);
  return corps && new Function('day', 'LEVELS', corps.replace(/LEVELS\.length/g, 'LEVELS'));
};
const fJeu = fonction(html, 'index.html'), fServeur = fonction(serveur, 'pepin-scores.js');
if (fJeu && fServeur) {
  const d = new Date('2026-01-01T12:00:00Z');
  for (let k = 0; k < 1100; k++, d.setUTCDate(d.getUTCDate() + 1)) {
    const jour = d.toISOString().slice(0, 10), a = fJeu(jour, mondesJeu), b = fServeur(jour, mondesServeur);
    if (a !== b) { erreurs.push(`monde du jour différent le ${jour} : jeu ${a}, serveur ${b}`); break; }
  }
}

if (erreurs.length) { console.error('Cohérence : ÉCHEC\n - ' + erreurs.join('\n - ')); process.exitCode = 1; }
else console.log(`Cohérence : OK (version ${appVersion}, ${mondesJeu} mondes, monde du jour identique sur 3 ans)`);
