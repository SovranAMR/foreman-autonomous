# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B04
active_atom: P01-B04-A04
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 35/1000
phase_progress: 34/100
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

P01-B04-A06 — Typed phase/event schema: evidence, telemetry ve provenance kaydını ekle.

objective: Typed phase/event schema için evidence, telemetry ve provenance kaydını ekle.
target: Failure/recovery slice run record bundles evidence, telemetry and provenance for audit.
hypothesis: A05 failure/recovery slice validates path probes; A06 adds auditable run records.
acceptance: run record validates; evidence per probe; telemetry non-negative; provenance lineage.
commands: npx tsx --test src/forge-phase-event-schema.test.ts
blast_radius: forge-phase-event-schema*.ts
rollback: A06 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B04-A05
last_commit: 0726ca9
tests: PASS — forge-phase-event-schema (17/17)
evidence: failure/recovery slice; 9 path probes (failure_path×3, recovery_path×3, nogo_path×3); validatePhaseEventSchemaFailureRecoveryProbeMatrix zero unexpected mismatches; runPhaseEventSchemaFailureRecoverySlice gate; 6 documented FAIL gaps preserved
next: P01-B04-A06
