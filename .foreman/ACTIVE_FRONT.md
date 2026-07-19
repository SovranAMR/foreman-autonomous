# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B07
active_atom: P02-B07-A04
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 162/1000
phase_progress: 61/100
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

P02-B07-A04 — Alternative vision production slice: boundary and edge-case behavior.

objective: P02-B07-A03 production slice PASS; boundary completion next.
target: Complete boundary category edge cases for visioner alternative input and presence detection.
hypothesis: boundary probes align with contract after A03 recovery wiring.
acceptance: forge-p02-visioner-alternative boundary slice PASS (A04 tests when added).
commands: npx tsx --test src/forge-p02-visioner-alternative.test.ts
blast_radius: src/forge-p02-visioner-alternative*
rollback: P02-B07-A04 boundary değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: boundary requires orchestrator refactor beyond slice scope ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B07-A03
last_commit: pending
tests: PASS — forge-p02-visioner-alternative.test.ts (12/12); forge-p02-visioner-alternative-baseline.test.ts (3/3)
evidence: recoverVisionerAlternatives production slice; valt.structured_alternative_recovery gap closed; 23/23 probes aligned
next: P02-B07-A04
