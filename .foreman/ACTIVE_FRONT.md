# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B03
active_atom: P04-B03-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 325/1000
phase_progress: 25/100
block_progress: 5/10
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

P04-B03-A06 — Web ve primary-source araştırma: evidence, telemetry ve provenance kaydını ekle.

objective: P04-B03-A05 PASS; add evidence, telemetry and provenance record for web primary-source research.
target: evidence slice probes, run record, disposition/criterion wiring for failure/recovery categories.
hypothesis: Evidence slice records aligned probe outcomes with zero unexpected mismatches when paths ship.
acceptance: evidence slice PASS; A01-A05 baseline remains valid.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-web-primary-source*.ts
rollback: P04-B03-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B03-A05
last_commit: 642242a
tests: PASS — forge-p04-researcher*.test.ts (138/138); failureRecovery probes=6; expectedFail=0; runResearcherWebPrimarySourceFailureRecoverySlice exported
evidence: runResearcherWebPrimarySourceFailureRecoverySlice; validateResearcherWebPrimarySourceFailureRecoveryProbeMatrix; forge-p04-researcher-web-primary-source-baseline.test.ts
next: P04-B03-A06
