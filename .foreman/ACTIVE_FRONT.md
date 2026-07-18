# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A10
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 39/1000
phase_progress: 39/100
block_progress: 8/10
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

P01-B04-A10 — Typed phase/event schema: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: Typed phase/event schema block gate kanıtını mühürle ve P01-B05 handoff'unu hazırla.
target: Block gate validates A01–A09 deliverables, regression, guard, and B05 handoff.
hypothesis: A09 guard PASS sonrası block gate tüm atom deliverable'larını doğrular ve handoff üretir.
acceptance: block gate passes; all A01–A09 checks sealed; B05 handoff contract ready.
commands: npx tsx --test src/forge-phase-event-schema-block-gate.test.ts
blast_radius: forge-phase-event-schema*.ts
rollback: A10 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A09
last_commit: pending
tests: PASS — forge-phase-event-schema guard (38/38)
evidence: adversarial 3/3 rejected; perf/cost/safety bounds enforced; validateForgePhaseEventSchemaGuard PASS; orchestrator verifyForgePhaseEventSchemaGuard emits phase_event_schema_guard verification
next: P01-B04-A10
