# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B09
active_atom: P03-B09-A10
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 288/1000
phase_progress: 88/100
block_progress: 9/10
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

P03-B09-A10 — Plan provenance ve drift: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P03-B09-A09 PASS; P03-B09-A10 seal block gate evidence and B10 handoff contract.
target: block gate checks, atom seals, regression+guard pass, handoff to P03-B10.
hypothesis: P03-B09-A10 closes P03-B09 with sealed block gate and valid handoff.
acceptance: Block gate evidence sealed; handoff contract valid; all 10 atoms PASS.
commands: npx tsx --test src/forge-p03-strategist-provenance*.test.ts
blast_radius: src/forge-p03-strategist-provenance.ts
rollback: P03-B09-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B09-A09
last_commit: pending
tests: PASS — forge-p03-strategist-provenance.test.ts (45/45); forge-p03-strategist-provenance-baseline.test.ts (3/3)
evidence: validateForgeStrategistProvenanceGuard; runStrategistProvenanceAdversarialGuardChecks (3/3 tampered rejected); runForgeStrategistProvenanceRegressionGate with guard metrics
next: P03-B09-A10
