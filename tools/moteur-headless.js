/* Fait tourner le vrai code de index.html dans Node, sans navigateur ni affichage.
   Le DOM, le canvas, l'audio et le stockage sont remplacés par des objets inertes : seule la logique du jeu compte.
   Sert aux tests de déterminisme, et servira au rejeu des parties (fantôme, validation des scores). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SCRIPT = HTML.slice(HTML.indexOf('<script>') + 8, HTML.lastIndexOf('</script>'));

// Objet « absorbant » : toute propriété, tout appel, toute construction renvoie encore un objet inerte
function inerte() {
  const f = function () {};
  return new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === 'then') return () => {}; // promesse qui ne se résout jamais
      if (k === 'length') return 0;
      if (!(k in t) || k === 'prototype' || k === 'name') t[k] = inerte();
      return t[k];
    },
    set(t, k, v) { t[k] = v; return true; },
    apply() { return inerte(); },
    construct() { return inerte(); },
  });
}

/* Crée un moteur isolé. alea : générateur utilisé à la place de Math.random (affichage uniquement).
   reglages : valeurs de save.settings à imposer (classic, invincible, easyJump…). */
function creerMoteur({ alea = Math.random, reglages = {} } = {}) {
  const stockage = new Map();
  const g = {
    console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, queueMicrotask() {},
    performance: { now: () => 0 }, crypto: globalThis.crypto, URL, URLSearchParams, TextEncoder, TextDecoder, structuredClone,
    fetch: () => new Promise(() => {}), innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    localStorage: { getItem: k => (stockage.has(k) ? stockage.get(k) : null), setItem: (k, v) => stockage.set(k, String(v)), removeItem: k => stockage.delete(k) },
    document: inerte(), navigator: inerte(), location: inerte(), history: inerte(), screen: inerte(),
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    addEventListener() {}, removeEventListener() {}, getComputedStyle: () => inerte(),
    AudioContext: inerte(), webkitAudioContext: undefined, Image: inerte(), OffscreenCanvas: inerte(), ImageData: inerte(),
  };
  g.window = g; g.self = g; g.globalThis = g;
  g.navigator.getGamepads = () => [];
  const ctx = vm.createContext(g);
  vm.runInContext(`Math.random = __alea;`, Object.assign(ctx, { __alea: alea }));
  vm.runInContext(SCRIPT, ctx, { filename: 'index.html' });
  vm.runInContext(`Object.assign(save.settings, ${JSON.stringify(reglages)})`, ctx);
  const ev = code => vm.runInContext(code, ctx);

  return {
    ev,
    /* Lance un monde (comme le bouton Jouer) avec une graine donnée */
    lancer(monde, graine) { ev(`dailyRun = null; armBack(); loadLevel(${monde}, ${graine}); state = 'play';`); },
    /* Fournit la source d'entrées : fn(numéro du pas) renvoie { x, down, jump, dash, jumpPressed, dashPressed } */
    entrees(fn) { let k = 0; ctx.__feed = () => fn(k++); ev(`inputFeed = inp => Object.assign(inp, __feed(), { pausePressed: false })`); },
    pas(n = 1) { for (let k = 0; k < n; k++) ev('update()'); },
    etat: () => ev('state'),
    /* Empreinte de tout ce qui compte pour la partie (pas les particules ni la caméra) */
    empreinte() {
      return ev(`JSON.stringify({
        state, levelIdx, P: [P.x, P.y, P.vx, P.vy, P.face, P.hearts, P.dashT, P.inv, P.onGround],
        stats: [stats.score, stats.combo, stats.seeds, stats.time, stats.deaths, stats.lives, stats.gems],
        enemies: enemies.map(e => [e.x, e.y, e.vx, e.vy, e.dead || 0, e.st || '']),
        boss: boss && [boss.x, boss.y, boss.hp, boss.st], shots: shots.map(s => [s.x, s.y]),
        movers: movers.map(m => [m.x, m.y]), items: items.length, rng: rngState
      })`);
    },
  };
}

/* Petit générateur à graine pour fabriquer des entrées de test reproductibles */
function mulberry(seed) {
  return () => { let t = seed = (seed + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* Joueur robot : avance surtout vers la droite, saute et prend de l'élan au hasard (mais toujours le même hasard) */
function joueurRobot(graine) {
  const r = mulberry(graine); let x = 1, saut = 0, elan = 0, bas = false;
  const etats = [];
  return pas => {
    while (etats.length <= pas) {
      if (r() < 0.03) x = r() < 0.75 ? 1 : r() < 0.5 ? -1 : Math.round((r() * 2 - 1) * 32) / 32;
      bas = r() < 0.01 ? !bas : bas;
      const nouveauSaut = saut === 0 && r() < 0.06; if (nouveauSaut) saut = 3 + Math.floor(r() * 30); else if (saut > 0) saut--;
      const nouvelElan = r() < 0.01; elan = nouvelElan ? 6 : Math.max(0, elan - 1);
      etats.push({ x, down: bas, jump: saut > 0, dash: elan > 0, jumpPressed: nouveauSaut, dashPressed: nouvelElan });
    }
    return etats[pas];
  };
}

module.exports = { creerMoteur, joueurRobot, mulberry };
