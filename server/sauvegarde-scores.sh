#!/bin/sh
# Sauvegarde quotidienne du classement de Pépin, 14 jours conservés.
# Installée par /etc/cron.d/pepin-scores (voir DEPLOIEMENT.md).
# Le serveur écrit scores.json de façon atomique (fichier temporaire puis renommage), la copie est donc toujours cohérente.
set -eu
SRC=/opt/pepin-scores/data/scores.json
DEST=/opt/pepin-scores/sauvegardes
GARDER=14
[ -f "$SRC" ] || exit 0
mkdir -p "$DEST"
gzip -c "$SRC" > "$DEST/scores-$(date +%F).json.gz"
ls -1t "$DEST"/scores-*.json.gz | tail -n +$((GARDER + 1)) | xargs -r rm -f
