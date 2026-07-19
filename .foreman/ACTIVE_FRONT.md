# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B03
active_atom: P04-B03-A08
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 327/1000
phase_progress: 27/100
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

P04-B03-A08 — Web ve primary-source araştırma: Forge entegrasyonu ile regression testini tamamla.

objective: P04-B03-A07 PASS; wire property/fuzz slice into Forge integration regression gate.
target: integration runner, regression detection, probe matrix alignment with propertyFuzz slice.
hypothesis: Integration gate detects probe regressions while property/fuzz gates remain green.
acceptance: integration slice PASS; A01-A07 baseline remains valid.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-web-primary-source*.ts
rollback: P04-B03-A08 integration değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B03-A07
last_commit: 6172981
tests: PASS — forge-p04-researcher*.test.ts; propertyChecks=8; contractFuzz rejected=24/24; runRecordFuzz rejected=5/5
evidence: runResearcherWebPrimarySourcePropertyFuzzSlice; runResearcherWebPrimarySourcePropertyChecks; forge-p04-researcher-web-primary-source.property-fuzz.test.ts
next: P04-B03-A08
