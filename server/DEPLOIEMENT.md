# Déployer le classement en ligne de Pépin (VPS Hostinger)

1. **DNS** : créer un enregistrement `A` `pepin-api.lhusser.fr` → `76.13.43.193`.
2. **Fichiers** (sur le VPS) :
   ```bash
   sudo mkdir -p /opt/pepin-scores/data
   sudo curl -H "Accept: application/vnd.github.raw" -o /opt/pepin-scores/pepin-scores.js https://api.github.com/repos/Laurent-67370/pepin/contents/server/pepin-scores.js
   sudo curl -H "Accept: application/vnd.github.raw" -o /opt/pepin-scores/verif-partie.js https://api.github.com/repos/Laurent-67370/pepin/contents/server/verif-partie.js
   sudo curl -H "Accept: application/vnd.github.raw" -o /opt/pepin-scores/moteur-headless.js https://api.github.com/repos/Laurent-67370/pepin/contents/tools/moteur-headless.js
   sudo chown -R www-data:www-data /opt/pepin-scores
   ```
3. **Service** :
   ```bash
   sudo curl -H "Accept: application/vnd.github.raw" -o /etc/systemd/system/pepin-scores.service https://api.github.com/repos/Laurent-67370/pepin/contents/server/pepin-scores.service
   sudo systemctl daemon-reload && sudo systemctl enable --now pepin-scores
   curl http://127.0.0.1:3215/api/health
   ```
4. **nginx + HTTPS** :
   ```bash
   sudo curl -H "Accept: application/vnd.github.raw" -o /etc/nginx/sites-available/pepin-api https://api.github.com/repos/Laurent-67370/pepin/contents/server/nginx-pepin-api.conf
   sudo ln -s /etc/nginx/sites-available/pepin-api /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d pepin-api.lhusser.fr
   ```
5. **Sauvegarde quotidienne** (3 h 15, 14 jours conservés dans `/opt/pepin-scores/sauvegardes`) :
   ```bash
   sudo curl -H "Accept: application/vnd.github.raw" -o /opt/pepin-scores/sauvegarde-scores.sh https://api.github.com/repos/Laurent-67370/pepin/contents/server/sauvegarde-scores.sh
   sudo chmod +x /opt/pepin-scores/sauvegarde-scores.sh
   echo '15 3 * * * root /opt/pepin-scores/sauvegarde-scores.sh' | sudo tee /etc/cron.d/pepin-scores
   sudo /opt/pepin-scores/sauvegarde-scores.sh && ls -l /opt/pepin-scores/sauvegardes
   ```
   Restaurer : arrêter le service, `gunzip -c sauvegardes/scores-AAAA-MM-JJ.json.gz > data/scores.json`, relancer.
6. **Vérifier** : https://pepin-api.lhusser.fr/api/health doit répondre `{"ok":true,...}`.

Les fichiers sont récupérés par l'API GitHub plutôt que par raw.githubusercontent.com, qui peut servir une version périmée.

## Mettre à jour le serveur
```bash
sudo curl -H "Accept: application/vnd.github.raw" -o /opt/pepin-scores/pepin-scores.js https://api.github.com/repos/Laurent-67370/pepin/contents/server/pepin-scores.js
sudo curl -H "Accept: application/vnd.github.raw" -o /opt/pepin-scores/verif-partie.js https://api.github.com/repos/Laurent-67370/pepin/contents/server/verif-partie.js
sudo curl -H "Accept: application/vnd.github.raw" -o /opt/pepin-scores/moteur-headless.js https://api.github.com/repos/Laurent-67370/pepin/contents/tools/moteur-headless.js
sudo systemctl restart pepin-scores
```
Une mise à jour du jeu seul ne demande rien sur le serveur : à la première partie d'une version inconnue, il télécharge lui-même
le nouvel `index.html` (au plus une fois toutes les 10 minutes) et le garde dans `data/jeu/`.

## Vérification des parties (depuis 1.5.6, mode observation)
Le jeu joint sa partie (les entrées, quelques Ko) à chaque score envoyé. Le serveur accepte le record tout de suite,
puis rejoue la partie dans un thread séparé, avec le code exact de la version jouée, et note le résultat sans rien refuser :
- `ok` : score et temps retrouvés à l'identique ;
- `ecart` : score, temps, graine du défi ou état final différents (la raison est donnée) ;
- `absent` : jeu antérieur à 1.5.6, qui n'envoie pas sa partie ;
- `version` : version du jeu introuvable ou trop ancienne ;
- `erreur` : rejeu trop long (30 s) ou planté.

```bash
curl -s https://pepin-api.lhusser.fr/api/health          # compteurs par résultat, versions du jeu connues
curl -s https://pepin-api.lhusser.fr/api/verifs          # les 50 dernières vérifications
journalctl -u pepin-scores --since today | grep Vérification
```
Un `ecart` avec « empreinte finale différente » sur une partie honnête signale une désynchronisation entre appareils :
c'est précisément ce que cette phase d'observation sert à mesurer avant de refuser quoi que ce soit.

### Passage à la 1.5.6 : dans cet ordre
1. **nginx** : la limite de 4 Ko bloquerait les envois avec partie.
   ```bash
   sudo sed -i 's/client_max_body_size 4k;/client_max_body_size 300k;/' /etc/nginx/sites-available/pepin-api
   grep client_max_body_size /etc/nginx/sites-available/pepin-api   # 300k partout (certbot a pu dupliquer le bloc)
   sudo nginx -t && sudo systemctl reload nginx
   ```
2. **Node 18 ou plus** : `node --version`.
3. **Serveur** : les trois fichiers ci-dessus (« Mettre à jour le serveur »), puis `curl -s http://127.0.0.1:3215/api/health`.

Le jeu 1.5.6 est publié dès le push par GitHub Pages ; s'il parle encore à l'ancien serveur ou à l'ancienne limite nginx,
l'envoi avec partie échoue et le jeu renvoie aussitôt le score seul : aucun score n'est perdu pendant la transition.
Avant de pousser une modification du serveur : `node --test tests/serveur.test.js`.

Les scores sont stockés dans `/opt/pepin-scores/data/scores.json`. Pour remettre le classement à zéro : arrêter le service, supprimer ce fichier, relancer.

### Passage à la 1.6.1 (monde 13, le Jardin d'or)
Le serveur doit accepter un 13e monde (`LEVELS = 13`, temps minimal 11 s) ; le défi du jour, lui, reste tiré parmi les 12 mondes
de l'aventure (`DAILY_WORLDS = 12`), comme dans le jeu. Mettre à jour `pepin-scores.js` (« Mettre à jour le serveur ») juste après le push.
Avant cette mise à jour, seuls les records du monde 13 seraient refusés (« monde invalide ») ; ce monde n'est ouvert qu'aux joueurs
qui ont les 12 graines d'or, la fenêtre de quelques minutes ne gêne personne.
