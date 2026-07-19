# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B04
active_atom: P03-B04-A07
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 235/1000
phase_progress: 36/100
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

P03-B04-A07 — Dependency DAG: unit, property ve fuzz doğrulamasını ekle.

objective: P03-B04-A06 PASS; P03-B04-A07 implement unit, property and fuzz validation for dependency DAG run records.
target: runStrategistDependencyDagPropertyChecks, runStrategistDependencyDagRunRecordFuzzValidation, runStrategistDependencyDagFuzzValidation.
hypothesis: P03-B04-A07 closes property/fuzz validation gaps for dependency DAG evidence slice.
acceptance: structural properties pass; fuzz rejects mutations; run record fuzz validates baseline.
commands: npx tsx --test src/forge-p03-strategist-dependency-dag*.test.ts
blast_radius: src/forge-p03-strategist-dependency-dag.ts
rollback: P03-B04-A07 property/fuzz slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: property/fuzz slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B04-A06
last_commit: pending
tests: PASS — forge-p03-strategist-dependency-dag.test.ts (25/25); forge-p03-strategist-dependency-dag-baseline.test.ts (3/3); 8 failure/recovery probes with auditable run record
evidence: buildStrategistDependencyDagRunRecord; validateStrategistDependencyDagFailureRecoveryRunRecord; runStrategistDependencyDagFailureRecoverySliceWithRecord; runStrategistDependencyDagEvidenceSlice
next: P03-B04-A07
