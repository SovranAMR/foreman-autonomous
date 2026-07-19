# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B10
active_atom: P04-B10-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 395/1000
phase_progress: 93/100
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

P04-B10-A06 — Araştırmacı phase gate: evidence, telemetry ve provenance kaydını ekle.

objective: P04-B10-A05 PASS; failure/recovery/NO-GO slice matrix valid with zero unexpected mismatches.
target: Complete evidence/telemetry/provenance run record for failure/recovery slice gate validators.
hypothesis: Failure/recovery slice from A05 enables targeted A06 evidence run record validation.
acceptance: Evidence run record validates; slice matrix valid; zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher-phase-gate*.test.ts
blast_radius: src/forge-p04-researcher-phase-gate*.ts
rollback: P04-B10-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Evidence slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B10-A05
last_commit: pending
tests: PASS — forge-p04-researcher-phase-gate-baseline.test.ts (8/8); forge-p04-researcher-phase-gate-contract.test.ts (8/8); forge-p04-researcher-phase-gate.test.ts (13/13); failure/recovery probes=7/7
evidence: validateResearcherPhaseGateFailureRecoveryProbeMatrix + runResearcherPhaseGateFailureRecoverySlice + failure_path/recovery_path/nogo_path guard-path probes
next: P04-B10-A06
