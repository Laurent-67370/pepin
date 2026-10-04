# Déployer le classement en ligne de Pépin (VPS Hostinger)

1. **DNS** : créer un enregistrement `A` `pepin-api.lhusser.fr` → `76.13.43.193`.
2. **Fichiers** (sur le VPS) :
   ```bash
   sudo mkdir -p /opt/pepin-scores/data
   sudo curl -H "Accept: application/vnd.github.raw" -o /opt/pepin-scores/pepin-scores.js https://api.github.com/repos/Laurent-67370/pepin/contents/server/pepin-scores.js
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
sudo systemctl restart pepin-scores
```
Avant de pousser une modification du serveur : `node --test tests/serveur.test.js`.

Les scores sont stockés dans `/opt/pepin-scores/data/scores.json`. Pour remettre le classement à zéro : arrêter le service, supprimer ce fichier, relancer.
