# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P05
active_block: P05-B01
active_atom: P05-B01-A06
phase_file: .foreman/phases/P05_WORKER_EXECUTION.md
program_progress: 405/1000
phase_progress: 5/100
block_progress: 5/10
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

P05-B01-A07 — Typed tool interface ve dispatch: unit, property ve fuzz doğrulamasını ekle.

objective: P05-B01-A06 evidence/telemetry slice sealed; implement unit, property and fuzz validation gate.
target: Extend typed tool dispatch with property/fuzz slice gate.
hypothesis: property_checks + fuzz_mutations map to validateWorkerToolDispatchPropertyProbeMatrix.
acceptance: Property/fuzz slice PASS with zero unexpected mismatches against contract matrix.
commands: npx tsx --test src/forge-p05-worker-tool-dispatch*.test.ts
blast_radius: src/forge-p05-worker-tool-dispatch.ts
rollback: P05-B01-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P05_WORKER_EXECUTION.md Son Kanıt bölümü.
fallback: Property/fuzz slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P05-B01-A06
last_commit: pending
tests: PASS — forge-p05-worker-tool-dispatch-baseline.test.ts (8/8), forge-p05-worker-tool-dispatch-contract.test.ts (8/8), forge-p05-worker-tool-dispatch-production.test.ts (5/5), forge-p05-worker-tool-dispatch-boundary.test.ts (4/4), forge-p05-worker-tool-dispatch-failure-recovery.test.ts (5/5), forge-p05-worker-tool-dispatch-evidence.test.ts (5/5)
evidence: validateWorkerToolDispatchEvidenceProbeMatrix + runWorkerToolDispatchEvidenceSlice; 7/7 evidence/telemetry/provenance probes aligned (failure_path, recovery_path, nogo_path) with auditable run record, zero unexpected mismatches
next: P05-B01-A07
