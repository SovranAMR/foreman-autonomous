# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A04
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 132/1000
phase_progress: 32/100
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

P02-B04-A04 — Repo ve kullanıcı bağlamı grounding: boundary ve edge-case davranışlarını tamamla.

objective: P02-B04-A03 production slice sealed; boundary slice next.
target: Complete boundary category edge-case behavior for visioner grounding input assessment.
hypothesis: A03 recoverVisionerGrounding provides stable recovery baseline for A04 boundary probes.
acceptance: boundary probes PASS, zero unexpected mismatches, documented edge cases wired.
commands: npx tsx --test src/forge-p02-visioner-grounding*.test.ts
blast_radius: src/forge-p02-visioner-grounding.ts
rollback: P02-B04-A04 boundary slice değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: boundary slice requires orchestrator seam change ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B04-A03
last_commit: pending
tests: PASS — forge-p02-visioner-grounding.test.ts (10/10); forge-p02-visioner-grounding-baseline.test.ts (3/3)
evidence: recoverVisionerGrounding export; vgrd.structured_grounding_recovery PASS; 23/23 probes aligned; zero gaps
next: P02-B04-A04
