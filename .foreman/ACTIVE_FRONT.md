# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B04
active_atom: P03-B04-A01
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 229/1000
phase_progress: 30/100
block_progress: 10/10
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

P03-B04-A01 — Dependency DAG: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-B03-A10 PASS; P03-B04-A01 measure dependency DAG behavior and create failing baseline fixture.
target: ForgeStrategistDependencyDagBaseline, dependency DAG fixture, validateStrategistDependencyDagBaseline.
hypothesis: P03-B04-A01 establishes measurable dependency DAG baseline wired to sealed P03-B03 atomization block gate.
acceptance: baseline fixture loads; probes measure current behavior; validation rejects invalid fixture; B03 handoff referenced.
commands: npx tsx --test src/forge-p03-strategist-dependency-dag*.test.ts
blast_radius: src/forge-p03-strategist-dependency-dag.ts
rollback: P03-B04-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: baseline blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B03-A10
last_commit: 5602a6f
tests: PASS — forge-p03-strategist-atomization*.test.ts (48/48); block gate 7/7; handoff→P03-B04
evidence: runStrategistAtomizationBlockGate; validateStrategistAtomizationBlockHandoffContract; verifyForgeStrategistAtomizationBlockGate
next: P03-B04-A01
