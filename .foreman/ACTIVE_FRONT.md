# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B06
active_atom: P02-B06-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 149/1000
phase_progress: 49/100
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

P02-B06-A01 — Uncertainty ve clarification policy: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P02-B05 block gate sealed; uncertainty/clarification baseline slice next.
target: Measure uncertainty and clarification policy behavior and create failing baseline fixture.
hypothesis: Sealed P02-B05 research trigger block gate provides stable entry for B06 baseline probes.
acceptance: baseline fixture loads; contract alignment probes defined; handoff from P02-B05 validated.
commands: npx tsx --test src/forge-p02-visioner-uncertainty-baseline.test.ts
blast_radius: src/forge-p02-visioner-uncertainty*, src/orchestrator.ts
rollback: P02-B06-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: B06 baseline unrelated orchestrator refactor gerektirirse BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B05-A10
last_commit: pending
tests: PASS — forge-p02-visioner-research-trigger-block-gate.test.ts (6/6); forge-pipeline-regression.integration.test.ts P02-B05-A10 (2/2)
evidence: runForgeVisionerResearchTriggerBlockGate seals 10/10 atom seals; handoff=PASS→P02-B06; orchestrator visioner_research_trigger_block_gate verification PASS
next: P02-B06-A01
