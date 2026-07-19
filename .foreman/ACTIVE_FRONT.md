# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B04
active_atom: P03-B04-A05
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 233/1000
phase_progress: 34/100
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

P03-B04-A05 — Dependency DAG: failure, recovery ve NO-GO yollarını uygula.

objective: P03-B04-A04 PASS; P03-B04-A05 implement failure, recovery and NO-GO paths.
target: runStrategistDependencyDagFailureRecoverySlice, validateStrategistDependencyDagFailureRecoveryProbeMatrix.
hypothesis: P03-B04-A05 closes failure/recovery/NO-GO dependency DAG gaps from typed contract.
acceptance: failure/recovery slice runs; failure/recovery/nogo probes aligned; matrix validation passes.
commands: npx tsx --test src/forge-p03-strategist-dependency-dag*.test.ts
blast_radius: src/forge-p03-strategist-dependency-dag.ts
rollback: P03-B04-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: failure/recovery slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B04-A04
last_commit: 7132a92
tests: PASS — forge-p03-strategist-dependency-dag.test.ts (15/15); forge-p03-strategist-dependency-dag-baseline.test.ts (3/3); 27 probes; 7 boundary probes PASS
evidence: assessStrategistDependencyDagInputBoundary; runStrategistDependencyDagBoundarySlice; validateStrategistDependencyDagBoundaryProbeMatrix
next: P03-B04-A05
