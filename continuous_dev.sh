#!/bin/bash
# Foreman Continuous Autonomous Dev Loop
# Runs 24/7 as requested by Ali.

echo "Starting Foreman Continuous Dev Loop..."
while true; do
  echo "[$(date)] Running continuous dev cycle..."
  
  # Check if working directory is clean
  if [[ -n $(git status -s) ]]; then
    echo "Uncommitted changes found. Attempting to fix and commit..."
    git add .
    git commit -m "chore(auto): continuous dev cycle checkpoint"
  fi
  
  # Run tests
  npm test > test_output.log 2>&1
  TEST_EXIT=$?
  
  if [ $TEST_EXIT -ne 0 ]; then
    echo "Tests failed. Extracting errors..."
    # If tests fail, try to run a fix command using Foreman itself
    npx tsx src/cli.ts run "Son test hatasını oku (test_output.log), hatanın kaynağını bul, fixle ve testin geçtiğini doğrula." >> dev_cycle.log 2>&1
  else
    echo "Tests passed. Running codebase optimization..."
    # Run code optimization/refactor task
    npx tsx src/cli.ts run "Projede statik kod analizi yap, ölü kodları (dead code) temizle, karmaşık fonksiyonları refactor et ve TODO'ları bulup düzelt. Sonra testleri çalıştır ve değişiklikleri commit at." >> dev_cycle.log 2>&1
  fi
  
  # Wait for 1 hour before next cycle
  sleep 3600
done
