# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B08
active_atom: P04-B08-A07
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 376/1000
phase_progress: 75/100
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

P04-B08-A07 — Spike ve falsification deneyi: unit, property ve fuzz doğrulamasını ekle.

objective: P04-B08-A06 PASS; property/fuzz validation for spike falsification evidence slice guard probes.
target: Property and fuzz checks for failure_path + recovery_path + nogo_path evidence run record integrity.
hypothesis: Property/fuzz suite rejects tampered evidence/telemetry/provenance without regressing A06 wiring.
acceptance: Property/fuzz tests pass; structural invariants hold across evidence slice mutations.
commands: npx tsx --test src/forge-p04-researcher-spike-falsification.property-fuzz.test.ts
blast_radius: src/forge-p04-researcher-spike-falsification*.ts
rollback: P04-B08-A07 property/fuzz değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B08-A06
last_commit: pending
tests: PASS — forge-p04-researcher-spike-falsification.test.ts (21/21); forge-p04-researcher-spike-falsification-baseline.test.ts (15/15); evidence slice 6/6 probes, 0 mismatches, valid run record
evidence: runResearcherSpikeFalsificationEvidenceSlice + validateResearcherSpikeFalsificationEvidenceRunRecord + buildResearcherSpikeFalsificationRunRecord guard paths
next: P04-B08-A07
