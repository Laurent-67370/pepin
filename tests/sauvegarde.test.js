/* Export et import de la sauvegarde, image de score à partager.
   Usage : node --test tests/sauvegarde.test.js */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { creerMoteur, joueurRobot, mulberry } = require('../tools/moteur-headless.js');
const { partieTerminee } = require('./aide-partie.js');

const J = (m, code) => JSON.parse(m.ev(`JSON.stringify(${code})`));
/* Un appareil avec un joueur qui a terminé le monde 1 (meilleure partie et fantôme compris) */
function appareilJoue() {
  const p = partieTerminee(); const m = p.m;
  m.ev(`save.playerName = 'Laurent'; save.settings.size = 1.3; persist()`);
  return m;
}

test('export puis import sur un autre appareil : progression, records, défis et meilleure partie retrouvés', () => {
  const a = appareilJoue(), fichier = a.ev('JSON.stringify(buildExport())');
  const b = creerMoteur();
  b.ev(`save.settings.size = 0.8`);
  const r = J(b, `mergeImport(JSON.parse(${JSON.stringify(fichier)}))`);
  assert.equal(r.added, 1); assert.equal(r.replaced, 0);
  const pa = J(a, 'prof()'), pb = J(b, `save.profiles.find(p => p.id === ${JSON.stringify(pa.id)})`);
  assert.deepEqual(pb, pa, 'profil différent après import');
  assert.equal(b.ev('save.settings.size'), 0.8, 'les réglages de l\'appareil ne doivent pas bouger');
  b.ev(`save.current = ${JSON.stringify(pa.id)}`);
  assert.equal(b.ev('bestReplay(0)'), a.ev('bestReplay(0)'), 'meilleure partie perdue');
  b.jouerMonde(0); assert.ok(b.ev('ghost !== null'), 'le fantôme doit suivre le joueur sur son nouvel appareil');
  assert.deepEqual(J(b, 'save.hof'), J(a, 'save.hof'));
});

test('import d\'un même joueur : remplacé, pas dupliqué ; six joueurs au maximum', () => {
  const a = appareilJoue(), fichier = J(a, 'buildExport()');
  const n0 = a.ev('save.profiles.length');
  const r = J(a, `mergeImport(${JSON.stringify(fichier)})`);
  assert.equal(r.replaced, 1); assert.equal(r.added, 0); assert.equal(a.ev('save.profiles.length'), n0);
  // Fichier de 8 joueurs vers un appareil vide (1 joueur) : 5 ajoutés, 3 ignorés
  const b = creerMoteur(), uid = k => 'abcdef0123456789' + String(k).padStart(4, '0');
  const huit = { ...fichier, profiles: Array.from({ length: 8 }, (_, k) => ({ id: 'profil-' + k + '-xxxxxxxx', name: 'Joueur' + k, unlocked: 2, best: {}, uid: uid(k), daily: {} })) };
  const r2 = J(b, `mergeImport(${JSON.stringify(huit)})`);
  assert.equal(r2.added, 5); assert.equal(r2.skipped, 3); assert.equal(b.ev('save.profiles.length'), 6);
});

test('fichier piégé ou abîmé : refusé ou nettoyé', () => {
  const b = creerMoteur();
  assert.match(J(b, `mergeImport({ format: 'autre chose', profiles: [] })`).error, /pas une sauvegarde/);
  assert.match(J(b, `mergeImport({ format: 'pepin-sauvegarde', profiles: [null, 42, { id: '../x' }] })`).error, /Aucun joueur/);
  const piege = { format: 'pepin-sauvegarde', profiles: [{ id: 'piege-0123456789', name: '<img src=x onerror=alert(1)>', color: 99, unlocked: 99,
    best: { 0: { time: -5, seeds: 'beaucoup', gems: [1, 0, 'x'], medal: 9, score: 1e9 }, 50: { score: 1 }, abc: {} }, daily: { 'pas-une-date': 1, '2026-10-01': 1e9 }, uid: 'pas un uid' }],
    hof: { 0: [{ name: '<b>', score: 1, time: 1 }, { name: 'Ok', score: 'x', time: 1 }, { name: 'Bon', score: 900, time: 30 }], 99: [{ name: 'Hors', score: 1, time: 1 }] },
    replays: { 'piege-0123456789': { 0: '{"level":3,"time":1}', 1: 'x'.repeat(500000) } } };
  const r = J(b, `mergeImport(${JSON.stringify(piege)})`);
  assert.equal(r.added, 1);
  const p = J(b, `save.profiles.find(p => p.id === 'piege-0123456789')`);
  assert.equal(p.name, 'Joueur 1'); assert.equal(p.color, 5); assert.equal(p.unlocked, 12);
  assert.deepEqual(Object.keys(p.best), ['0']);
  assert.deepEqual(p.best[0], { time: 1, seeds: 0, gems: [true, false, true], gold: false, medal: 3, score: 60000 });
  assert.deepEqual(p.daily, { '2026-10-01': 60000 });
  assert.match(p.uid, /^[a-f0-9-]{16,40}$/i);
  assert.deepEqual(J(b, 'save.hof[0]').map(e => e.name), ['Bon']);
  assert.equal(b.ev('save.hof[99]'), undefined);
  b.ev(`save.current = 'piege-0123456789'`);
  assert.equal(b.ev('bestReplay(0)'), null, 'partie d\'un autre monde acceptée'); assert.equal(b.ev('bestReplay(1)'), null, 'partie démesurée acceptée');
});

test('meilleure partie : la plus rapide des deux appareils est gardée', () => {
  const a = appareilJoue(), id = a.ev('prof().id'), vraie = a.ev('bestReplay(0)');
  const lente = JSON.stringify({ ...JSON.parse(vraie), time: JSON.parse(vraie).time + 600 });
  const rapide = JSON.stringify({ ...JSON.parse(vraie), time: JSON.parse(vraie).time - 600 });
  const f = t => ({ ...J(a, 'buildExport()'), replays: { [id]: { 0: t } } });
  a.ev(`mergeImport(${JSON.stringify(f(lente))})`); assert.equal(a.ev('bestReplay(0)'), vraie);
  a.ev(`mergeImport(${JSON.stringify(f(rapide))})`); assert.equal(a.ev('bestReplay(0)'), rapide);
});

test('tableau d\'honneur : réuni sans doublon, cinq meilleurs', () => {
  const b = creerMoteur(), e = (name, score) => ({ name, score, time: 40, date: score });
  b.ev(`save.hof = { 2: ${JSON.stringify([e('Ana', 500), e('Léo', 300)])} }`);
  const f = { format: 'pepin-sauvegarde', profiles: [{ id: 'profil-hof-12345678', name: 'Ana', best: {} }], hof: { 2: [e('Ana', 500), e('Zoé', 900), e('Max', 100), e('Lou', 700), e('Tom', 600)] } };
  b.ev(`mergeImport(${JSON.stringify(f)})`);
  assert.deepEqual(J(b, 'save.hof[2]').map(x => x.name), ['Zoé', 'Lou', 'Tom', 'Ana', 'Léo']);
});

test('partage : texte, image et feuille de partage du téléphone, ou téléchargement', async () => {
  const p = partieTerminee(), m = p.m;
  m.ev('document.fonts = null'); // pas de police à charger dans le harnais
  const r = J(m, 'lastResult');
  assert.equal(r.level, 0); assert.equal(r.score, p.score); assert.equal(r.world, 'Le Verger');
  assert.equal(m.ev('shareText(lastResult)'), `J'ai terminé Monde 1 « Le Verger » en ${m.ev('fmtTime(lastResult.time)')} avec ${m.ev('fmtNum(lastResult.score)')} points dans Pépin, la graine voyageuse ! https://laurent-67370.github.io/pepin/`);
  m.ev(`lastResult.daily = '2026-10-05'`); assert.match(m.ev('shareText(lastResult)'), /^J'ai terminé le défi du jour \(Le Verger\)/); m.ev(`lastResult.daily = null`);
  m.ev('buildScoreImage(lastResult)'); // le dessin complet s'exécute sans erreur
  // Téléphone : la feuille de partage reçoit l'image et le texte
  m.ev(`buildScoreImage = () => ({ toBlob: cb => cb(new Blob(['png'], { type: 'image/png' })) });
        __partage = null; navigator.canShare = () => true; navigator.share = d => { __partage = { n: d.files.length, nom: d.files[0].name, type: d.files[0].type, text: d.text }; return Promise.resolve(); }`);
  await m.ev('shareScore(null)');
  const s = J(m, '__partage');
  assert.deepEqual(s, { n: 1, nom: 'pepin-monde-1.png', type: 'image/png', text: m.ev('shareText(lastResult)') });
  // Ordinateur sans partage de fichiers : téléchargement et texte copié
  m.ev(`navigator.canShare = () => false; __copie = null; navigator.clipboard = { writeText: t => { __copie = t; return Promise.resolve(); } }; URL.createObjectURL = () => 'blob:x'; URL.revokeObjectURL = () => {}`);
  const btn = m.ev(`__btn = { textContent: 'Partager mon score' }`);
  await m.ev('shareScore(__btn)');
  assert.equal(m.ev('__copie'), m.ev('shareText(lastResult)'));
  assert.match(m.ev('__btn.textContent'), /téléchargée/);
});

test('import depuis l\'écran des réglages : lecture du fichier, confirmation, message', () => {
  const a = appareilJoue(), fichier = a.ev('JSON.stringify(buildExport())');
  const b = creerMoteur();
  b.ev(`FileReader = class { readAsText(f) { this.result = f.texte; this.onload(); } }; __msg = { textContent: '' };
        document.getElementById = id => id === 'saveMsg' ? __msg : { textContent: '' }`);
  b.ev(`confirm = () => false; importSave({ size: 100, texte: ${JSON.stringify(fichier)} })`);
  assert.equal(b.ev('save.profiles.length'), 1, 'import fait malgré le refus');
  b.ev(`confirm = () => true; importSave({ size: 100, texte: ${JSON.stringify(fichier)} })`);
  assert.equal(b.ev('save.profiles.length'), 2); assert.match(b.ev('__msg.textContent'), /1 joueur\(s\) ajouté/);
  b.ev(`importSave({ size: 100, texte: '{"pas":"pepin"}' })`); assert.match(b.ev('__msg.textContent'), /pas une sauvegarde/);
  b.ev(`importSave({ size: 9e6, texte: '' })`); assert.match(b.ev('__msg.textContent'), /trop gros/);
});
