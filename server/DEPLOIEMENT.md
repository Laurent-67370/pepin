# Déployer le classement en ligne de Pépin (VPS Hostinger)

1. **DNS** : créer un enregistrement `A` `pepin-api.lhusser.fr` → `76.13.43.193`.
2. **Fichiers** (sur le VPS) :
   ```bash
   sudo mkdir -p /opt/pepin-scores/data
   sudo curl -o /opt/pepin-scores/pepin-scores.js https://raw.githubusercontent.com/Laurent-67370/pepin/main/server/pepin-scores.js
   sudo chown -R www-data:www-data /opt/pepin-scores
   ```
3. **Service** :
   ```bash
   sudo curl -o /etc/systemd/system/pepin-scores.service https://raw.githubusercontent.com/Laurent-67370/pepin/main/server/pepin-scores.service
   sudo systemctl daemon-reload && sudo systemctl enable --now pepin-scores
   curl http://127.0.0.1:3215/api/health
   ```
4. **nginx + HTTPS** :
   ```bash
   sudo curl -o /etc/nginx/sites-available/pepin-api https://raw.githubusercontent.com/Laurent-67370/pepin/main/server/nginx-pepin-api.conf
   sudo ln -s /etc/nginx/sites-available/pepin-api /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d pepin-api.lhusser.fr
   ```
5. **Vérifier** : https://pepin-api.lhusser.fr/api/health doit répondre `{"ok":true,...}`.

Les scores sont stockés dans `/opt/pepin-scores/data/scores.json`. Pour remettre le classement à zéro : arrêter le service, supprimer ce fichier, relancer.
