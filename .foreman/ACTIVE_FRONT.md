# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B07
active_atom: P03-B07-A02
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 260/1000
phase_progress: 61/100
block_progress: 1/10
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

P03-B07-A02 — Parallel execution wave planı: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P03-B07-A01 PASS; P03-B07-A02 define measurable acceptance criteria with typed contract.
target: getActiveStrategistParallelWaveContract, validateStrategistParallelWaveCoverage.
hypothesis: P03-B07-A02 seals A01 probe matrix into versioned contract with category invariants.
acceptance: contract loads; coverage validation passes; fixture aligns with contract probe matrix.
commands: npx tsx --test src/forge-p03-strategist-parallel-wave*.test.ts
blast_radius: src/forge-p03-strategist-parallel-wave.ts
rollback: P03-B07-A02 contract değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Contract blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B07-A01
last_commit: 4f98b70
tests: PASS — forge-p03-strategist-parallel-wave*.test.ts (3/3); 27 probes; 6 documented FAIL gaps aligned
evidence: loadStrategistParallelWaveBaseline; validateStrategistParallelWaveBaseline; runStrategistParallelWaveProbes
next: P03-B07-A02
