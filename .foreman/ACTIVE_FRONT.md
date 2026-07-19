# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B03
active_atom: P03-B03-A02
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 220/1000
phase_progress: 21/100
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

P03-B03-A02 — Atomization ve atom boyutu: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P03-B03-A01 PASS; P03-B03-A02 define typed atomization contract with measurable acceptance criteria.
target: getActiveStrategistAtomizationContract, validateStrategistAtomizationCoverage.
hypothesis: P03-B03-A02 seals probe matrix from A01 baseline into typed contract with category invariants.
acceptance: contract declares all categories; coverage validation passes; fixture aligns to contract probes.
commands: npx tsx --test src/forge-p03-strategist-atomization*.test.ts
blast_radius: src/forge-p03-strategist-atomization.ts
rollback: P03-B03-A02 contract slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: A01 baseline misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B03-A01
last_commit: 5c3e8b3
tests: PASS — forge-p03-strategist-atomization-baseline.test.ts (3/3); 4 documented FAIL gaps; B02 handoff validated
evidence: loadStrategistAtomizationBaseline; validateStrategistAtomizationBaseline; runStrategistAtomizationProbes
next: P03-B03-A02
