# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B07
active_atom: P01-B07-A09
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 68/1000
phase_progress: 67/100
block_progress: 7/10
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

P01-B07-A10 — Reproducible fixture sistemi: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: A09 guard tamamlandı; block gate suite ile B07'yi mühürle.
target: runReproducibleFixtureBlockGate; forge-reproducible-fixture-block-gate.test.ts.
hypothesis: Block gate PASS ile B08 handoff hazır olur.
acceptance: block gate test PASS; 10/10 atom B07 tamamlanır.
commands: npx tsx --test src/forge-reproducible-fixture-block-gate.test.ts
blast_radius: forge-reproducible-fixture*.ts
rollback: A10 block gate slice değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B07-A09
last_commit: pending
tests: PASS — forge-reproducible-fixture.guard.test.ts (8/8); forge-reproducible-fixture-baseline.test.ts (27/27); forge-pipeline-regression.integration.test.ts (+5)
evidence: validateForgeReproducibleFixtureGuard; runReproducibleFixtureAdversarialGuardChecks 3/3 rejected; verifyForgeReproducibleFixtureGuard orchestrator seam; regression gate guard metrics preserved
next: P01-B07-A10
