# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B10
active_atom: P02-B10-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 189/1000
phase_progress: 88/100
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

P02-B10-A01 — Vizyoner phase gate: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P02-B09-A10 PASS; establish visioner phase gate baseline from sealed P02-B09 block gate.
target: forge-p02-visioner-phase-gate baseline fixture and probe harness.
hypothesis: versioned baseline fixture captures visioner phase gate behavior with measurable probes.
acceptance: baseline loads, contract alignment validates, probe matrix executes with evidence.
commands: npx tsx --test src/forge-p02-visioner-phase-gate-baseline.test.ts
blast_radius: src/forge-p02-visioner-phase-gate*, src/fixtures/forge-visioner-phase-gate-v1.json
rollback: P02-B10-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: Baseline cannot align with sealed B09 handoff ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B09-A10
last_commit: fb71a1d
tests: PASS — forge-p02-visioner-approval-block-gate.test.ts (6/6), forge-pipeline-regression.integration.test.ts (+2 P02-B09-A10, 104 total in run)
evidence: runForgeVisionerApprovalBlockGate; verifyForgeVisionerApprovalBlockGate; atomSeals=10/10; handoff=PASS→P02-B10
next: P02-B10-A01
