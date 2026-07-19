# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B02
active_atom: P02-B02-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 110/1000
phase_progress: 10/100
block_progress: 0/10
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

P02-B02-A01 — Constraint ve non-goal çıkarımı: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P02-B01 block gate sealed; B02 baseline A01 next.
target: constraint/non-goal baseline fixture with measurable FAIL gaps and P02-B01 handoff entry.
hypothesis: sealed visioner intent block inventory provides stable source for constraint extraction baseline.
acceptance: baseline fixture loads; contract alignment probes pass; at least one documented FAIL gap.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-constraint.ts (new), src/fixtures/
rollback: P02-B02-A01 baseline fixture değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: baseline cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B01-A10
last_commit: 7931a29
tests: PASS — forge-p02-visioner-intent-block-gate.test.ts (6/6); forge-p02-visioner-intent*.test.ts (43/43); forge-pipeline-regression.integration.test.ts P02-B01-A10 (2/2)
evidence: runForgeVisionerIntentBlockGate, verifyForgeVisionerIntentBlockGate; block=PASS seals=10/10 handoff=PASS→P02-B02
next: P02-B02-A01
