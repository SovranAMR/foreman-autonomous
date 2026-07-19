# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B09
active_atom: P03-B09-A05
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 283/1000
phase_progress: 83/100
block_progress: 4/10
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

P03-B09-A05 — Plan provenance ve drift: failure, recovery ve NO-GO yollarını uygula.

objective: P03-B09-A04 PASS; P03-B09-A05 implement failure/recovery/NO-GO vertical slice.
target: failure_path, recovery_path, nogo_path probe matrix and slice wiring.
hypothesis: P03-B09-A05 closes failure/recovery/NO-GO category probes with zero mismatches.
acceptance: Failure/recovery slice runs; failure_path + recovery_path + nogo_path matrix valid.
commands: npx tsx --test src/forge-p03-strategist-provenance*.test.ts
blast_radius: src/forge-p03-strategist-provenance.ts, src/orchestrator.ts
rollback: P03-B09-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B09-A04
last_commit: c0fd449
tests: PASS — forge-p03-strategist-provenance.test.ts (15/15); forge-p03-strategist-provenance-baseline.test.ts (3/3)
evidence: runStrategistProvenanceBoundarySlice; validateStrategistProvenanceBoundaryProbeMatrix; assessStrategistProvenanceInputBoundary edge cases; validatePlanDrift boundary rejection
next: P03-B09-A05
