# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B04
active_atom: P03-B04-A07
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 236/1000
phase_progress: 37/100
block_progress: 6/10
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

P03-B04-A08 — Dependency DAG: Forge entegrasyonu ile regression testini tamamla.

objective: P03-B04-A07 PASS; P03-B04-A08 implement Forge regression integration for dependency DAG evidence slice.
target: runStrategistDependencyDagForgeRegression, runStrategistDependencyDagProbeRegression.
hypothesis: P03-B04-A08 closes Forge regression integration gaps for dependency DAG evidence slice.
acceptance: regression slice passes; probe regression detects mismatches; zero unexpected mismatches.
commands: npx tsx --test src/forge-p03-strategist-dependency-dag*.test.ts
blast_radius: src/forge-p03-strategist-dependency-dag.ts
rollback: P03-B04-A08 regression slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: regression slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B04-A07
last_commit: pending
tests: PASS — forge-p03-strategist-dependency-dag.test.ts (31/31); forge-p03-strategist-dependency-dag-baseline.test.ts (3/3); 8 structural properties; 72 fixture fuzz + 5 run-record fuzz mutations rejected
evidence: runStrategistDependencyDagPropertyChecks; runStrategistDependencyDagFuzzValidation; runStrategistDependencyDagRunRecordFuzzValidation; runStrategistDependencyDagPropertyFuzzSlice
next: P03-B04-A08
