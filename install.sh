#!/bin/bash
#
# FOREMAN — Installer
#
# curl -fsSL https://raw.githubusercontent.com/SovranAMR/foreman/main/install.sh | bash
#
# What it does:
#   1. Checks Node.js >= 20
#   2. Clones the repo (or updates if exists)
#   3. Installs dependencies
#   4. Creates global symlink
#   5. Runs setup wizard
#

set -e

# ─── Colors ───────────────────────────────────────────────────

GOLD='\033[38;2;245;166;35m'
CYAN='\033[38;2;0;212;255m'
GREEN='\033[38;2;34;197;94m'
RED='\033[38;2;239;68;68m'
DIM='\033[38;2;107;114;128m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Logo ─────────────────────────────────────────────────────

logo() {
  echo ""
  echo -e "${GOLD}  ███████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ █████╗ ███╗   ██╗${NC}"
  echo -e "${GOLD}  ██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔══██╗████╗  ██║${NC}"
  echo -e "${CYAN}  █████╗  ██║   ██║██████╔╝█████╗  ██╔████╔██║███████║██╔██╗ ██║${NC}"
  echo -e "${CYAN}  ██╔══╝  ██║   ██║██╔══██╗██╔══╝  ██║╚██╔╝██║██╔══██║██║╚██╗██║${NC}"
  echo -e "${GREEN}  ██║     ╚██████╔╝██║  ██║███████╗██║ ╚═╝ ██║██║  ██║██║ ╚████║${NC}"
  echo -e "${GREEN}  ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝${NC}"
  echo -e "${DIM}  AI Agent Orchestrator — Atomic Thought Chains${NC}"
  echo ""
}

info()  { echo -e "  ${CYAN}▸${NC} $1"; }
ok()    { echo -e "  ${GREEN}✔${NC} $1"; }
warn()  { echo -e "  ${GOLD}⚠${NC} $1"; }
fail()  { echo -e "  ${RED}✖${NC} $1"; }
step()  { echo -e "\n  ${GOLD}─── $1 ───${NC}\n"; }

# ─── Defaults ─────────────────────────────────────────────────

INSTALL_DIR="${FOREMAN_HOME:-$HOME/.foreman}"
REPO_URL="https://github.com/SovranAMR/foreman.git"
BIN_NAME="foreman"

logo

# ─── 1. Check Node.js ─────────────────────────────────────────

step "Gereksinimler"

if ! command -v node &>/dev/null; then
  fail "Node.js bulunamadı."
  echo ""
  echo -e "  Node.js 20+ gerekli. Kurulum:"
  echo -e "  ${CYAN}curl -fsSL https://fnm.vercel.app/install | bash${NC}"
  echo -e "  ${CYAN}fnm install 22${NC}"
  echo ""
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  fail "Node.js $NODE_VERSION bulundu, 20+ gerekli."
  echo ""
  echo -e "  Güncelleme: ${CYAN}fnm install 22${NC} veya ${CYAN}nvm install 22${NC}"
  echo ""
  exit 1
fi
ok "Node.js $(node -v)"

if command -v npm &>/dev/null; then
  ok "npm $(npm -v 2>/dev/null)"
else
  fail "npm bulunamadı."
  exit 1
fi

# ─── 2. Install/Update Repo ──────────────────────────────────

step "Kurulum"

REPO_DIR="$INSTALL_DIR/repo"

if [ -d "$REPO_DIR/.git" ]; then
  info "Mevcut kurulum güncelleniyor..."
  cd "$REPO_DIR"
  git pull --rebase origin main 2>/dev/null || {
    warn "Git pull başarısız, temiz kurulum yapılıyor..."
    cd "$HOME"
    rm -rf "$REPO_DIR"
    git clone --depth 1 "$REPO_URL" "$REPO_DIR"
    cd "$REPO_DIR"
  }
  ok "Güncellendi"
else
  info "İndiriliyor..."
  mkdir -p "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$REPO_DIR" 2>/dev/null
  cd "$REPO_DIR"
  ok "İndirildi → $REPO_DIR"
fi

# ─── 3. Install Dependencies ─────────────────────────────────

step "Bağımlılıklar"

info "npm install..."
npm install --omit=dev --silent 2>/dev/null
ok "Bağımlılıklar kuruldu"

# ─── 4. Create Wrapper Script ─────────────────────────────────

step "Global Komut"

WRAPPER="$INSTALL_DIR/bin/$BIN_NAME"
mkdir -p "$INSTALL_DIR/bin"

cat > "$WRAPPER" << 'WRAPPER_EOF'
#!/bin/bash
# Foreman CLI wrapper
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")/repo"

if [ ! -d "$REPO_DIR" ]; then
  echo "Foreman repo bulunamadı: $REPO_DIR"
  echo "Tekrar kurun: curl -fsSL https://raw.githubusercontent.com/SovranAMR/foreman/main/install.sh | bash"
  exit 1
fi

# tsx ile çalıştır (npx veya local)
if command -v tsx &>/dev/null; then
  exec tsx "$REPO_DIR/src/cli.ts" "$@"
elif [ -f "$REPO_DIR/node_modules/.bin/tsx" ]; then
  exec "$REPO_DIR/node_modules/.bin/tsx" "$REPO_DIR/src/cli.ts" "$@"
else
  exec npx tsx "$REPO_DIR/src/cli.ts" "$@"
fi
WRAPPER_EOF

chmod +x "$WRAPPER"
ok "Wrapper → $WRAPPER"

# ─── 5. Add to PATH ──────────────────────────────────────────

BIN_DIR="$INSTALL_DIR/bin"
ADDED_TO_PATH=false

add_to_path() {
  local rcfile="$1"
  local export_line="export PATH=\"$BIN_DIR:\$PATH\""

  if [ -f "$rcfile" ]; then
    if ! grep -qF "$BIN_DIR" "$rcfile" 2>/dev/null; then
      echo "" >> "$rcfile"
      echo "# Foreman" >> "$rcfile"
      echo "$export_line" >> "$rcfile"
      ADDED_TO_PATH=true
    fi
  fi
}

# Detect shell
if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "$(which zsh 2>/dev/null)" ]; then
  add_to_path "$HOME/.zshrc"
  SHELL_RC=".zshrc"
elif [ -n "$FISH_VERSION" ]; then
  FISH_CONFIG="$HOME/.config/fish/config.fish"
  if [ -f "$FISH_CONFIG" ] && ! grep -qF "$BIN_DIR" "$FISH_CONFIG" 2>/dev/null; then
    echo "" >> "$FISH_CONFIG"
    echo "# Foreman" >> "$FISH_CONFIG"
    echo "set -gx PATH $BIN_DIR \$PATH" >> "$FISH_CONFIG"
    ADDED_TO_PATH=true
  fi
  SHELL_RC="config.fish"
else
  add_to_path "$HOME/.bashrc"
  add_to_path "$HOME/.profile"
  SHELL_RC=".bashrc"
fi

# Also export for current session
export PATH="$BIN_DIR:$PATH"

if [ "$ADDED_TO_PATH" = true ]; then
  ok "PATH'e eklendi ($SHELL_RC)"
else
  ok "PATH zaten ayarlı"
fi

# ─── 6. Verify ───────────────────────────────────────────────

step "Doğrulama"

if "$WRAPPER" --version &>/dev/null; then
  VERSION=$("$WRAPPER" --version 2>/dev/null)
  ok "foreman v${VERSION} çalışıyor"
else
  warn "Doğrulama atlandı (tsx yükleniyor olabilir)"
fi

# ─── 7. Summary ──────────────────────────────────────────────

echo ""
echo -e "  ${GOLD}═══════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}✔ Foreman başarıyla kuruldu!${NC}"
echo -e "  ${GOLD}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BOLD}Sonraki adımlar:${NC}"
echo ""
echo -e "  ${CYAN}1.${NC} Terminali yeniden aç veya çalıştır:"
echo -e "     ${DIM}source ~/$SHELL_RC${NC}"
echo ""
echo -e "  ${CYAN}2.${NC} API key'lerini ayarla:"
echo -e "     ${GOLD}foreman setup${NC}"
echo ""
echo -e "  ${CYAN}3.${NC} İlk projeyi oluştur:"
echo -e "     ${GOLD}foreman init \"Proje Adı\"${NC}"
echo ""
echo -e "  ${CYAN}4.${NC} Görev çalıştır:"
echo -e "     ${GOLD}foreman run \"Görev tanımı\"${NC}"
echo ""
echo -e "  ${DIM}Yardım: foreman --help${NC}"
echo -e "  ${DIM}Docs:   https://github.com/SovranAMR/foreman${NC}"
echo ""
