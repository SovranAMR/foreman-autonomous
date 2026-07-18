# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 38/1000
phase_progress: 38/100
block_progress: 7/10
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

P01-B04-A09 — Typed phase/event schema: adversarial, performance, cost ve safety kontrolünü geçir.

objective: Typed phase/event schema için adversarial, performance, cost ve safety kontrolünü geçir.
target: Guard gate rejects tampered records, enforces perf/cost/safety bounds on canonical schema matrix.
hypothesis: A08 regression wires guard; A09 validates guard controls pass standalone adversarial scenarios.
acceptance: guard gate passes; adversarial scenarios rejected; perf/cost/safety within bounds.
commands: npx tsx --test src/forge-phase-event-schema.test.ts src/forge-phase-event-schema.guard.test.ts
blast_radius: forge-phase-event-schema*.ts
rollback: A09 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A08
last_commit: pending
tests: PASS — forge-phase-event-schema (30/30)
evidence: regression gate 35/35 probes aligned; detectPhaseEventSchemaProbeRegression flags misalignment; prior-record compare no false regression; orchestrator verifyForgePhaseEventSchemaRegression emits phase_event_schema_regression; guard integrated (adversarial 3/3)
next: P01-B04-A09
