# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B05
active_atom: P04-B05-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 345/1000
phase_progress: 45/100
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

P04-B05-A06 — Citation ve provenance graph: evidence, telemetry ve provenance kaydını ekle.

objective: P04-B05-A05 PASS; failure/recovery slice gate wired; 6 failure/recovery probes aligned; zero unexpected mismatches.
target: Forge citation provenance graph evidence slice with auditable run record for failure_path, recovery_path and nogo_path probes.
hypothesis: Evidence slice extends failure/recovery gate with disposition, criterion and provenance metadata.
acceptance: Evidence run record validates; failure/recovery probes align; regression suite stays green.
commands: npx tsx --test src/forge-p04-researcher-citation-provenance-graph*.test.ts
blast_radius: src/forge-p04-researcher-citation-provenance-graph*.ts
rollback: P04-B05-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B05-A05
last_commit: pending
tests: PASS — forge-p04-researcher-citation-provenance-graph*.test.ts (23/23); runResearcherCitationProvenanceGraphFailureRecoverySlice; passAligned=4 gapAligned=2
evidence: validateResearcherCitationProvenanceGraphFailureRecoveryProbeMatrix + runResearcherCitationProvenanceGraphFailureRecoverySlice; documented NO-GO parser/validator debt aligned
next: P04-B05-A06
