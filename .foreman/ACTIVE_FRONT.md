# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P03
active_block: P03-B02
active_atom: P03-B02-A10
phase_file: .foreman/phases/P03_STRATEGIST.md
program_progress: 218/1000
phase_progress: 19/100
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

P03-B02-A10 — Block üretim kontratı: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P03-B02-A09 PASS; P03-B02-A10 block gate seal and P03-B03 handoff.
target: runForgeStrategistBlockContractRegressionGate, buildStrategistBlockContractBlockGateEvidence.
hypothesis: P03-B02-A10 seals B02 block gate with guard-integrated regression and handoff contract.
acceptance: block gate PASS; guard integrated; handoff valid; next block entry atom wired.
commands: npx tsx --test src/forge-p03-strategist-block-contract*.test.ts
blast_radius: src/forge-p03-strategist-block-contract.ts, src/forge-p03-strategist-block-contract.probe.ts
rollback: P03-B02-A10 block gate slice değişikliklerini geri al.
evidence_path: .foreman/phases/P03_STRATEGIST.md Son Kanıt bölümü.
fallback: A09 guard misaligned ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P03-B02-A09
last_commit: pending
tests: PASS — forge-p03-strategist-block-contract.test.ts (35/35); adversarial 3/3 rejected; guard passed
evidence: runStrategistBlockContractAdversarialGuardChecks; validateForgeStrategistBlockContractGuard
next: P03-B02-A10
