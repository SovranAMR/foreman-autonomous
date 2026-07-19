# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B10
active_atom: P02-B10-A10
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 199/1000
phase_progress: 98/100
block_progress: 10/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-19

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

P03-B01-A01 — Stratejist intent ve görev anlamlandırma: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P02-B10-A10 PASS; P03 strategist phase entry from sealed P02 visioner phase gate block gate handoff.
target: loadStrategistIntentBaseline, validateStrategistIntentBaseline.
hypothesis: P03-B01-A01 measures strategist intent behavior from sealed P02 phase gate artifacts.
acceptance: baseline fixture created; failing probes documented; P02 handoff contract referenced.
commands: npx tsx --test src/forge-p03-strategist-intent-baseline.test.ts
blast_radius: src/forge-p03-strategist-intent.ts, src/fixtures/forge-strategist-intent-v1.json
rollback: P03-B01-A01 baseline slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: P02 handoff contract misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B10-A10
last_commit: 0af93c4
tests: PASS — forge-p02-visioner-phase-gate-block-gate.test.ts (6/6); forge-pipeline-regression.integration.test.ts P02-B10-A10 (2/2); 114/114 targeted
evidence: runForgeVisionerPhaseGateBlockGate; verifyForgeP02VisionerPhaseGateBlockGate; seals=10/10; inventory=9; handoff=P03-B01-A01
next: P03-B01-A01
