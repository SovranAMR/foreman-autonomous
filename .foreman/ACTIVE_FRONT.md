# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B01
active_atom: P01-B01-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 1/1000
phase_progress: 1/100
block_progress: 1/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-18

## Tek seferlik bootstrap — program atomu değildir

İlk automation koşusunda src/kimi-provider.ts veya MessagingGateway hâlâ ana model
olarak kimi-k2.6 kullanıyorsa Kimi K3'e tek bounded değişiklikle geçir:

- ana model kimi-k3;
- resmi K3 request parametreleri;
- K2.x thinking alanını K3'e gönderme;
- provider-aware model seçimi;
- odaklı test.

Bu bootstrap için phase/block üretme. Kanıtlı PASS sonrası doğrudan P01-B01-A01'e dön.
Zaten tamamlanmışsa tekrar yapma.

## Aktif atom

P01-B01-A02 — Typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: Baseline matrisindeki davranışları typed Forge contract'a dönüştür.
target: src/forge-baseline-harness.ts, src/fixtures/forge-baseline-v1.json ve yeni contract modülü.
hypothesis: Executable baseline var; şimdi ölçülebilir acceptance typed sözleşmeye taşınmalı.
acceptance: Her path kategorisi için typed contract + probe eşlemesi testle enforce edildi.
commands: npx tsx --test src/forge-pipeline-baseline.test.ts; ilgili contract testi.
blast_radius: contract/harness seam; orchestrator davranışını değiştirme.
rollback: contract modülü ve A02 test eklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: contract modülü ayrıştırılamazsa harness içinde minimal typed export ekle.

## Tur sonunda zorunlu kayıt

last_atom: P01-B01-A01
last_commit: ad19959
tests: PASS — forge-pipeline-baseline (2/2), orchestrator smoke (5/5)
evidence: 20-scenario PASS/FAIL matrix (18 PASS expected, 2 documented FAIL gaps)
next: P01-B01-A02
