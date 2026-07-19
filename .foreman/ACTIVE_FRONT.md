# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 357/1000
phase_progress: 57/100
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

P04-B06-A08 — Contradiction ve freshness çözümü: Forge entegrasyonu ile regression testini tamamla.

objective: P04-B06-A07 PASS; property/fuzz slice exports; 8 structural properties; contract fuzz 72/72 rejected; run record fuzz 5/5 rejected; evidence slice 6/6 preserved.
target: Forge contradiction freshness regression integration for probe alignment drift detection.
hypothesis: Regression slice detects probe misalignment between prior and current run records without weakening A07 property/fuzz gates.
acceptance: Regression exports; property/fuzz slice remains green; regression suite green.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A08 regression değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A07
last_commit: 1f9f9f4
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (37/37); property/fuzz slice 8/8 properties + 72/72 contract fuzz rejected + 5/5 run record fuzz rejected; evidence slice 6/6 preserved
evidence: runResearcherContradictionFreshnessPropertyValidation + runResearcherContradictionFreshnessFuzzValidation + runResearcherContradictionFreshnessRunRecordFuzzValidation + runResearcherContradictionFreshnessPropertyFuzzSlice exported; harnessVersion 1.0.0-a07
next: P04-B06-A08
