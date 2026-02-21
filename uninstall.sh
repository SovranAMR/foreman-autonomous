#!/bin/bash
#
# FOREMAN — Uninstaller
#
# foreman uninstall  veya  bash ~/.foreman/repo/uninstall.sh
#

set -e

GOLD='\033[38;2;245;166;35m'
GREEN='\033[38;2;34;197;94m'
RED='\033[38;2;239;68;68m'
DIM='\033[38;2;107;114;128m'
NC='\033[0m'

INSTALL_DIR="${FOREMAN_HOME:-$HOME/.foreman}"

echo ""
echo -e "  ${GOLD}Foreman Kaldırma${NC}"
echo ""

if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "  ${DIM}Foreman kurulu değil.${NC}"
  exit 0
fi

echo -e "  Silinecek: ${DIM}$INSTALL_DIR${NC}"
echo ""
read -p "  Devam edilsin mi? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "  ${DIM}İptal edildi.${NC}"
  exit 0
fi

# Config dosyasını koru mu?
if [ -f "$INSTALL_DIR/config.json" ]; then
  echo ""
  read -p "  API key config'i de silinsin mi? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    cp "$INSTALL_DIR/config.json" "/tmp/foreman-config-backup.json"
    echo -e "  ${GREEN}✔${NC} Config yedeklendi → /tmp/foreman-config-backup.json"
  fi
fi

rm -rf "$INSTALL_DIR"
echo -e "  ${GREEN}✔${NC} $INSTALL_DIR silindi"

# PATH'ten temizle
for rcfile in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
  if [ -f "$rcfile" ]; then
    if grep -qF ".foreman/bin" "$rcfile" 2>/dev/null; then
      sed -i '/# Foreman/d' "$rcfile" 2>/dev/null
      sed -i '/.foreman\/bin/d' "$rcfile" 2>/dev/null
      echo -e "  ${GREEN}✔${NC} PATH temizlendi ($(basename $rcfile))"
    fi
  fi
done

echo ""
echo -e "  ${GREEN}✔ Foreman kaldırıldı.${NC}"
echo ""
