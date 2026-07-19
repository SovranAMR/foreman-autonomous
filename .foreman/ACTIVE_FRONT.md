# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B03
active_atom: P04-B03-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 322/1000
phase_progress: 22/100
block_progress: 2/10
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

P04-B03-A03 — Web ve primary-source araştırma: en küçük üretim dikey dilimini uygula.

objective: P04-B03-A02 PASS; implement recoverWebPrimarySourceEvidence production slice closing documented FAIL gap.
target: recoverWebPrimarySourceEvidence export, structured URL citation recovery, probe alignment.
hypothesis: Typed contract gap rwps.structured_web_primary_source_recovery closes when recovery helper ships.
acceptance: recoverWebPrimarySourceEvidence exported; probe PASS; A01/A02 baseline remains valid.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-web-primary-source*.ts
rollback: P04-B03-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B03-A02
last_commit: pending
tests: PASS — forge-p04-researcher*.test.ts (128/128); contract v1 probes=23; expectedFail=1; gap=rwps.structured_web_primary_source_recovery
evidence: getActiveResearcherWebPrimarySourceContract; validateResearcherWebPrimarySourceContractCoverage; validateResearcherWebPrimarySourceAgainstContract; forge-p04-researcher-web-primary-source.test.ts
next: P04-B03-A03
