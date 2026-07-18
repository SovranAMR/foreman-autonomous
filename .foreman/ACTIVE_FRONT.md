# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B02
active_atom: P01-B02-A06
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 15/1000
phase_progress: 15/100
block_progress: 5/10
parallel_front: NONE
max_attempts_per_atom: 3
updated_at: 2026-07-18

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

P01-B02-A06 — Mevcut pipeline davranış haritası: evidence, telemetry ve provenance kaydını ekle.

objective: Pipeline behavior map evidence, telemetry ve provenance kaydını ekle.
target: Behavior map harness için probe evidence/telemetry/provenance kayıt yolları.
hypothesis: B02-A05 failure/recovery/NO-GO sealed; A06 evidence slice.
acceptance: Evidence/telemetry/provenance coverage, hedefli test PASS.
commands: npx tsx --test src/forge-pipeline-behavior-map.test.ts
blast_radius: forge-pipeline-behavior-map*.ts
rollback: A06 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: slice uygulanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B02-A05
last_commit: PENDING
tests: PASS — forge-pipeline-behavior-map (11/11), forge-baseline-block-gate (6/6), forge-pipeline-baseline (3/3), forge-pipeline-regression.integration (4/4)
evidence: failure_path/recovery_path/nogo_path categories; 9 new probes (worker_blocked, atom_retry, block_abandon, re_decompose, recovery_runner, rollback_on_reject, reviewer_reject, rejection_feedback, hook_block); 26/26 aligned
next: P01-B02-A06
