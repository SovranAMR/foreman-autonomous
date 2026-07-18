# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B02
active_atom: P01-B02-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 14/1000
phase_progress: 14/100
block_progress: 4/10
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

P01-B02-A05 — Mevcut pipeline davranış haritası: failure, recovery ve NO-GO yollarını uygula.

objective: Pipeline behavior map failure, recovery ve NO-GO yollarını uygula.
target: Behavior map harness ve contract için failure/recovery/NO-GO probe yolları.
hypothesis: B02-A04 boundary sealed; A05 failure/recovery slice.
acceptance: Failure/recovery probe coverage, hedefli test PASS.
commands: npx tsx --test src/forge-pipeline-behavior-map.test.ts
blast_radius: forge-pipeline-behavior-map*.ts, orchestrator.ts
rollback: A05 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B02-A04
last_commit: pending
tests: PASS — forge-pipeline-behavior-map (9/9), forge-baseline-block-gate (6/6), forge-pipeline-baseline (3/3), forge-pipeline-regression.integration (4/4)
evidence: atomizing SystemState + VALID_TRANSITIONS; orchestrator atomize→atomizing; engine phase-aware state sync; map.atomize_state_sync + map.verify_state_sync sealed (17/17 PASS)
next: P01-B02-A05
