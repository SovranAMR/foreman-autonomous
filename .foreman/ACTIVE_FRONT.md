# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B02
active_atom: P04-B02-A06
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 315/1000
phase_progress: 15/100
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

P04-B02-A06 — Repo içi kanıt toplama: evidence, telemetry ve provenance kaydını ekle.

objective: P04-B02-A05 PASS; add evidence, telemetry and provenance recording for in-repo evidence collection.
target: failure_path, recovery_path, nogo_path probe evidence artifacts and run record validation.
hypothesis: Evidence slice gate captures disposition-aligned probe artifacts with zero validation failures.
acceptance: evidence/telemetry/provenance probes PASS; run record validates with zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B02-A06 evidence slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B02-A05
last_commit: 2c5b263
tests: PASS — forge-p04-researcher*.test.ts (80/80); failure/recovery 6 probes; expectedFail=0; harnessVersion=1.0.0-a05
evidence: runResearcherInRepoEvidenceFailureRecoverySlice; validateResearcherInRepoEvidenceFailureRecoveryProbeMatrix; failure/recovery slice PASS
next: P04-B02-A06
