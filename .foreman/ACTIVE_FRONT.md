# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B03
active_atom: P04-B03-A10
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 329/1000
phase_progress: 29/100
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

P04-B03-A10 — Web ve primary-source araştırma: block gate kanıtını mühürle ve sonraki block handoff'unu yap.

objective: P04-B03-A09 PASS; dedicated guard suite sealed; block gate + B04 handoff.
target: runResearcherWebPrimarySourceBlockGate, getForgeP04B03BlockGate, getForgeP04B03ToB04Handoff.
hypothesis: Block gate seals all ten B03 atoms and prepares benchmark/prior-art entry.
acceptance: block gate test suite PASS; handoff contract valid; A01-A09 baseline remains valid.
commands: npx tsx --test src/forge-p04-researcher-web-primary-source*block-gate*.test.ts
blast_radius: src/forge-p04-researcher-web-primary-source*.ts
rollback: P04-B03-A10 block gate değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B03-A09
last_commit: 920daaa
tests: PASS — forge-p04-researcher-web-primary-source.guard.test.ts (8/8); adversarial=3/3; perf/cost/safety guard; orchestrator verifyForgeResearcherWebPrimarySourceGuard
evidence: validateForgeResearcherWebPrimarySourceGuard; runResearcherWebPrimarySourceAdversarialGuardChecks; forge-p04-researcher-web-primary-source.guard.test.ts
next: P04-B03-A10
