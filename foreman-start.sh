#!/bin/bash
# Foreman — Kill, Commit, Push, Login & Start
set -e

cd /home/sovranamr/projects/foreman

echo "🔪 Eski process'ler öldürülüyor..."
pkill -f "test-gateway" 2>/dev/null || true
pkill -f "tsx" 2>/dev/null || true
sleep 2

echo "📦 Git commit & push..."
git add src/antigravity-oauth.ts src/messaging-gateway.ts src/engine.ts src/orchestrator.ts src/security-scanner.test.ts 2>/dev/null || true
git commit -m "fix: restore Antigravity OAuth credentials + add Kimi fallback for chat" 2>/dev/null || echo "(zaten commit edilmiş)"
git push origin main 2>/dev/null || echo "⚠️ Push başarısız"

echo "🔑 Login kontrol..."
if [ ! -f ~/.foreman/antigravity-creds.json ]; then
  echo "Credentials yok, login gerekiyor..."
  npx tsx src/cli.ts login
fi

echo "🚀 Foreman başlatılıyor..."
exec npx tsx src/cli.ts
