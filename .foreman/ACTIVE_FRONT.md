# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A04
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 353/1000
phase_progress: 53/100
block_progress: 3/10
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

P04-B06-A04 — Contradiction ve freshness çözümü: boundary ve edge-case davranışlarını tamamla.

objective: P04-B06-A03 PASS; resolveResearchContradictions + validateResearchFreshness exported; 23/23 probes PASS; orchestrator wired.
target: Forge contradiction freshness boundary slice for input edge cases and probe runner alignment.
hypothesis: Boundary probes close remaining edge-case gaps while preserving A03 production wiring.
acceptance: Boundary category probes PASS; contract matrix aligned; regression suite green.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A03
last_commit: 6e9bb4b
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (19/19); 23/23 probes PASS; 0 nogo FAIL gaps
evidence: resolveResearchContradictions + validateResearchFreshness + runResearcherContradictionFreshnessProductionSlice + orchestrator validateResearchFreshness wiring
next: P04-B06-A04
