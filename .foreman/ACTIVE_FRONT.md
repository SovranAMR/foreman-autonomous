# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B06
active_atom: P04-B06-A05
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 354/1000
phase_progress: 54/100
block_progress: 4/10
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

P04-B06-A05 — Contradiction ve freshness çözümü: failure, recovery ve NO-GO yollarını uygula.

objective: P04-B06-A04 PASS; boundary slice 6/6 probes; validateResearcherContradictionFreshnessBoundaryProbeMatrix + runResearcherContradictionFreshnessBoundarySlice exported; 24/24 tests PASS.
target: Forge contradiction freshness failure/recovery/NO-GO slice for failure_path, recovery_path and nogo_path probes.
hypothesis: Failure/recovery slice closes remaining path gaps while preserving A04 boundary wiring.
acceptance: Failure/recovery/NO-GO category probes PASS; contract matrix aligned; regression suite green.
commands: npx tsx --test src/forge-p04-researcher-contradiction-freshness*.test.ts
blast_radius: src/forge-p04-researcher-contradiction-freshness*.ts
rollback: P04-B06-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B06-A04
last_commit: 8c411d5
tests: PASS — forge-p04-researcher-contradiction-freshness*.test.ts (24/24); boundary slice 6/6 probes PASS; 23/23 full matrix PASS
evidence: validateResearcherContradictionFreshnessBoundaryProbeMatrix + runResearcherContradictionFreshnessBoundarySlice + exact max-length boundary edge cases
next: P04-B06-A05
