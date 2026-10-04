/* Vérification d'une partie par le serveur de classement de Pépin.
   Le serveur rejoue les entrées envoyées avec le score dans le vrai code du jeu (même version), sans affichage,
   puis compare le score et le temps obtenus à ceux annoncés.
   Utilisé directement (tests) ou dans un thread séparé (serveur), pour ne jamais bloquer les requêtes.
   Contrat avec index.html (depuis 1.5.6) : startReplay(texte, back(ok, raison)), scoreBreakdown(monde), dailySeed(jour),
   levelIdx, stats.time, replay.r.codes. Le garder intact dans les versions suivantes, sinon leurs parties seront « version ». */
'use strict';
const path = require('path'), fs = require('fs');
const { isMainThread, parentPort, workerData } = require('worker_threads');
// Le harnais est à côté du serveur une fois déployé, dans tools/ dans le dépôt
const MOTEUR = [path.join(__dirname, 'moteur-headless.js'), path.join(__dirname, '..', 'tools', 'moteur-headless.js')].find(f => fs.existsSync(f));
const { creerMoteur } = require(MOTEUR);

const MAX_PAS = 60 * 60 * 15; // 15 minutes de jeu au plus

/* html : index.html de la version de la partie ; replay : la partie (texte JSON) ;
   annonce : { level, score, time, day } envoyés par le joueur.
   Renvoie { r: 'ok' | 'ecart' | 'erreur', why, total, time, ms } */
function verifierPartie(html, replay, annonce) {
  const t0 = Date.now(), fin = (r, why, extra = {}) => ({ r, why, ms: Date.now() - t0, ...extra });
  let o; try { o = JSON.parse(replay); } catch (e) { return fin('ecart', 'partie illisible'); }
  if (!o || typeof o !== 'object') return fin('ecart', 'partie illisible');
  if (o.level !== annonce.level) return fin('ecart', `monde ${o.level} au lieu de ${annonce.level}`);
  if (!Number.isInteger(o.ticks) || o.ticks <= 0 || o.ticks > MAX_PAS) return fin('ecart', 'durée invalide');
  if ((annonce.day || null) !== (o.daily || null)) return fin('ecart', 'défi du jour incohérent');

  const m = creerMoteur({ html, alea: () => 0.5 });
  if (m.ev(`typeof scoreBreakdown !== 'function' || typeof startReplay !== 'function'`)) return fin('version', 'jeu trop ancien pour être vérifié');
  if (annonce.day && m.ev(`dailySeed(${JSON.stringify(annonce.day)})`) !== o.seed) return fin('ecart', 'graine du défi du jour modifiée');
  m.ev(`__fin = null; __ok = startReplay(${JSON.stringify(replay)}, (ok, why) => { __fin = { ok, why, ...scoreBreakdown(levelIdx), time: stats.time } })`);
  if (!m.ev('__ok')) return fin('ecart', 'partie illisible');
  if (m.ev('(replay.r.codes || []).some(c => c & 96)')) return fin('ecart', 'assistance utilisée');
  // On rejoue par paquets, jusqu'à la fin de la partie ou un peu au-delà de sa durée annoncée
  for (let k = 0; k < o.ticks + 120 && !m.ev('__fin'); k += 60) m.pas(60);
  const f = m.ev('__fin');
  if (!f) return fin('ecart', 'la partie ne se termine pas');
  if (f.why !== 'arrivee') return fin('ecart', f.why === 'gameover' ? 'partie perdue' : 'partie interrompue');
  const extra = { total: f.total, time: Math.round(f.time / 6) / 10 };
  if (!f.ok) return fin('ecart', 'empreinte finale différente', extra);
  if (f.total !== annonce.score) return fin('ecart', `score ${annonce.score} annoncé, ${f.total} rejoué`, extra);
  if (Math.abs(extra.time - annonce.time) > 0.11) return fin('ecart', `temps ${annonce.time} s annoncé, ${extra.time} s rejoué`, extra);
  return fin('ok', '', extra);
}

if (!isMainThread && parentPort) {
  // Thread de vérification : un travail, une réponse
  let res; try { res = verifierPartie(workerData.html, workerData.replay, workerData.annonce); } catch (e) { res = { r: 'erreur', why: String(e && e.message || e).slice(0, 200) }; }
  parentPort.postMessage(res);
}

module.exports = { verifierPartie, MAX_PAS };
