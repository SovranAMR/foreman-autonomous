# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A04
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 133/1000
phase_progress: 33/100
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

P02-B04-A05 — Repo ve kullanıcı bağlamı grounding: failure, recovery ve NO-GO yollarını uygula.

objective: P02-B04-A04 boundary slice sealed; failure/recovery slice next.
target: Wire failure_path, recovery_path and nogo_path probe matrix validation with zero unexpected mismatches.
hypothesis: A04 boundary baseline provides stable edge-case gate for A05 failure/recovery probes.
acceptance: failure/recovery/NO-GO probes PASS, documented gaps preserved, matrix validation wired.
commands: npx tsx --test src/forge-p02-visioner-grounding*.test.ts
blast_radius: src/forge-p02-visioner-grounding.ts
rollback: P02-B04-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: failure slice requires orchestrator seam change ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A04
last_commit: f2007f2
tests: PASS — forge-p02-visioner-grounding.test.ts (15/15); forge-p02-visioner-grounding-baseline.test.ts (3/3)
evidence: validateVisionerGroundingBoundaryProbeMatrix export; runVisionerGroundingBoundarySlice; 6/6 boundary probes aligned; zero unexpected mismatches
next: P02-B04-A05
