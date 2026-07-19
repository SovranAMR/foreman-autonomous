# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B09
active_atom: P02-B09-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 179/1000
phase_progress: 78/100
block_progress: 0/10
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

P02-B09-A01 — Kullanıcı approval ve steering: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P02-B08 block gate PASS; measure user approval/steering wiring and establish failing baseline fixture.
target: forge-p02-visioner-approval baseline probe harness and forge-visioner-approval-v1.json fixture.
hypothesis: Sealed P02-B08 scoring artifacts expose measurable gaps in approval/steering before typed contract.
acceptance: forge-p02-visioner-approval-baseline.test.ts with documented FAIL gaps from probe matrix.
commands: npx tsx --test src/forge-p02-visioner-approval-baseline.test.ts
blast_radius: src/forge-p02-visioner-approval*
rollback: P02-B09-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: approval wiring absent beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B08-A10
last_commit: 9a0764d
tests: PASS — forge-p02-visioner-scoring-block-gate.test.ts (6/6)
evidence: runForgeVisionerScoringBlockGate seals 10/10 atom seals; handoff=PASS→P02-B09; orchestrator verifyForgeVisionerScoringBlockGate visioner_scoring_block_gate
next: P02-B09-A01
