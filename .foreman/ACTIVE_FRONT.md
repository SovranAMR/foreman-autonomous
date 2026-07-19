# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 355/1000
phase_progress: 55/100
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

P04-B06-A06 — Contradiction ve freshness çözümü: evidence, telemetry ve provenance kaydını ekle.

objective: P04-B06-A05 PASS; failure/recovery slice 6/6 probes; validateResearcherContradictionFreshnessFailureRecoveryProbeMatrix + runResearcherContradictionFreshnessFailureRecoverySlice exported; 28/28 tests PASS.
target: Forge contradiction freshness evidence slice with disposition, criterion and aligned probe outcomes.
hypothesis: Evidence slice closes telemetry/provenance recording while preserving A05 failure/recovery wiring.
acceptance: Evidence record exports; failure/recovery slice remains green; regression suite green.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A05
last_commit: pending
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (28/28); failure/recovery slice 6/6 probes PASS; validateResearcherContradictionFreshnessFailureRecoveryProbeMatrix + runResearcherContradictionFreshnessFailureRecoverySlice
evidence: failure_path + recovery_path + nogo_path slice gate + invalid version/null-byte guards + recoverContradictionFreshnessEvidence + orchestrator validateResearchFreshness wiring
next: P04-B06-A06
