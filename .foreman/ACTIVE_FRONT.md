# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B04
active_atom: P03-B04-A06
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 234/1000
phase_progress: 35/100
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

P03-B04-A06 — Dependency DAG: evidence, telemetry ve provenance kaydını ekle.

objective: P03-B04-A05 PASS; P03-B04-A06 implement evidence, telemetry and provenance run records.
target: buildStrategistDependencyDagRunRecord, validateStrategistDependencyDagFailureRecoveryRunRecord, runStrategistDependencyDagFailureRecoverySliceWithRecord.
hypothesis: P03-B04-A06 closes auditable evidence/telemetry/provenance gaps for dependency DAG failure/recovery slice.
acceptance: run record builds; failure/recovery record validation passes; slice emits provenance.
commands: npx tsx --test src/forge-p03-strategist-dependency-dag*.test.ts
blast_radius: src/forge-p03-strategist-dependency-dag.ts
rollback: P03-B04-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: evidence slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B04-A05
last_commit: f2d924f
tests: PASS — forge-p03-strategist-dependency-dag.test.ts (21/21); forge-p03-strategist-dependency-dag-baseline.test.ts (3/3); 8 failure/recovery probes; 5 PASS + 3 NO-GO gaps aligned
evidence: runStrategistDependencyDagFailureRecoverySlice; validateStrategistDependencyDagFailureRecoveryProbeMatrix; listStrategistDependencyDagFailureRecoveryProbeIds
next: P03-B04-A06
