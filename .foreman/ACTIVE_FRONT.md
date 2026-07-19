# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P05
active_atom: P02-B05-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 139/1000
phase_progress: 39/100
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

P02-B05-A01 — Research trigger belirleme: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P02-B04 block gate sealed; B05 research trigger baseline next.
target: Measure current research trigger behavior and create failing baseline fixture for P02-B05.
hypothesis: Sealed P02-B04 grounding artifacts provide stable entry for research trigger baseline measurement.
acceptance: failing baseline fixture; probe matrix wired; B04 handoff validated; regression suite green.
commands: npx tsx --test src/forge-p02-visioner-research-trigger-baseline.test.ts
blast_radius: src/forge-p02-visioner-research-trigger*
rollback: P02-B05-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: research trigger requires unrelated harness refactor ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A10
last_commit: pending
tests: PASS — forge-p02-visioner-grounding-block-gate.test.ts (6/6); forge-p02-visioner-grounding*.test.ts (43/43 total)
evidence: runVisionerGroundingBlockGate; FORGE_P02_B04_BLOCK_GATE_V1; FORGE_P02_B04_TO_B05_HANDOFF_V1; orchestrator verifyForgeVisionerGroundingBlockGate visioner_grounding_block_gate verification
next: P02-B05-A01
