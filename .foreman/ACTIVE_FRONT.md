# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B03
active_atom: P03-B03-A01
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 219/1000
phase_progress: 20/100
block_progress: 0/10
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

P03-B03-A01 — Atomization ve atom boyutu: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-B02-A10 PASS; P03-B03-A01 measure atomization behavior and failing baseline fixture.
target: loadStrategistAtomizationBaseline, validateStrategistAtomizationBaseline.
hypothesis: P03-B03-A01 establishes measurable atomization baseline wired to sealed P03-B02 block gate handoff.
acceptance: baseline fixture loads; probes measure current behavior; B02 handoff prerequisites validated.
commands: npx tsx --test src/forge-p03-strategist-atomization*.test.ts
blast_radius: src/forge-p03-strategist-atomization.ts, src/fixtures/forge-strategist-atomization-v1.json
rollback: P03-B03-A01 baseline slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: B02 handoff misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B02-A10
last_commit: dc4fa49
tests: PASS — forge-p03-strategist-block-contract*.test.ts (45/45); block gate 10/10 seals; handoff→P03-B03
evidence: runForgeStrategistBlockContractBlockGate; buildStrategistBlockContractBlockGateEvidence
next: P03-B03-A01
