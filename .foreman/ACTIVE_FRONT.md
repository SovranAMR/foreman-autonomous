# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B03
active_atom: P04-B03-A07
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 326/1000
phase_progress: 26/100
block_progress: 6/10
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

P04-B03-A07 — Web ve primary-source araştırma: unit, property ve fuzz doğrulamasını ekle.

objective: P04-B03-A06 PASS; add unit, property and fuzz validation for web primary-source research.
target: property checks, fuzz validation, run record fuzz for failure/recovery categories.
hypothesis: Property and fuzz gates reject tampered records while aligned probes stay green.
acceptance: property/fuzz slice PASS; A01-A06 baseline remains valid.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-web-primary-source*.ts
rollback: P04-B03-A07 property/fuzz değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B03-A06
last_commit: pending
tests: PASS — forge-p04-researcher*.test.ts; evidenceProbeCount=6; runResearcherWebPrimarySourceEvidenceSlice exported
evidence: runResearcherWebPrimarySourceEvidenceSlice; validateResearcherWebPrimarySourceEvidenceRunRecord; forge-p04-researcher-web-primary-source-baseline.test.ts
next: P04-B03-A07
