# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A02
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 351/1000
phase_progress: 51/100
block_progress: 1/10
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

P04-B06-A02 — Contradiction ve freshness çözümü: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: P04-B06-A01 PASS; baseline fixture frozen; probe matrix documents FAIL gaps.
target: Forge contradiction freshness typed contract with measurable acceptance criteria.
hypothesis: Typed contract aligns fixture probe matrix to contradiction/freshness categories and dispositions.
acceptance: Contract validates; fixture aligns; category minProbeCount satisfied.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A02 contract slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A01
last_commit: pending
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (7/7); 23-probe matrix; 2 FAIL gaps aligned
evidence: forge-researcher-contradiction-freshness-v1.json + forge-p04-researcher-contradiction-freshness.ts + runResearcherContradictionFreshnessProbes + B05 handoff validation
next: P04-B06-A02
