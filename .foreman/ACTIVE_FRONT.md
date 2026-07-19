# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A03
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 352/1000
phase_progress: 52/100
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

P04-B06-A03 — Contradiction ve freshness çözümü: en küçük üretim dikey dilimini uygula.

objective: P04-B06-A02 PASS; typed contract frozen; fixture aligns with contract probe matrix.
target: Forge contradiction freshness production slice wiring resolveResearchContradictions and validateResearchFreshness.
hypothesis: Minimal production exports close documented nogo FAIL gaps while preserving contract alignment.
acceptance: Documented nogo probes flip to PASS; contract matrix remains aligned; regression suite green.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A03 production slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A02
last_commit: pending
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (15/15); typed contract 23 probes; 2 nogo FAIL gaps documented
evidence: FORGE_RESEARCHER_CONTRADICTION_FRESHNESS_CONTRACT_V1 + validateResearcherContradictionFreshnessAgainstContract + category dispositions + criterion wiring
next: P04-B06-A03
