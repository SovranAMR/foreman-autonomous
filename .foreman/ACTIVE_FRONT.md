# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B10
active_atom: P03-B10-A01
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 289/1000
phase_progress: 89/100
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

P03-B10-A01 — Stratejist phase gate: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P03-B09-A10 PASS; P03-B10-A01 measure strategist phase gate baseline.
target: phase gate baseline fixture, sealed P03-B09 handoff entry.
hypothesis: P03-B10-A01 establishes failing baseline for strategist phase gate from sealed provenance artifacts.
acceptance: Baseline fixture loads; documents gaps; aligns with P03-B09 handoff contract.
commands: npx tsx --test src/forge-p03-strategist-phase-gate*.test.ts
blast_radius: src/forge-p03-strategist-phase-gate.ts
rollback: P03-B10-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B09-A10
last_commit: 542ab1e
tests: PASS — forge-p03-strategist-provenance.test.ts (45/45); forge-p03-strategist-provenance-baseline.test.ts (3/3); forge-p03-strategist-provenance-block-gate.test.ts (7/7)
evidence: runStrategistProvenanceBlockGate; getForgeP03B09BlockGate; getForgeP03B09ToB10Handoff; validateStrategistProvenanceBlockHandoffContract; verifyForgeStrategistProvenanceBlockGate
next: P03-B10-A01
