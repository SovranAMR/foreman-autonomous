# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P02
active_block: P02-B04
active_atom: P02-B04-A01
phase_file: .foreman/phases/P02_VISIONER.md
program_progress: 129/1000
phase_progress: 29/100
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

P02-B04-A01 — Repo ve kullanıcı bağlamı grounding: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P02-B03 block gate sealed; B04 baseline measurement next.
target: Measure repo/user context grounding baseline from sealed P02-B03 synthesis block gate artifacts.
hypothesis: Sealed synthesis handoff provides stable anchor for B04 baseline without scope creep.
acceptance: baseline fixture loads, probes run with documented gaps, contract alignment validated.
commands: npx tsx --test src/forge-p02-*.test.ts
blast_radius: src/forge-p02-visioner-grounding.ts, src/forge-p02-visioner-grounding.probe.ts
rollback: P02-B04-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P02_VISIONER.md Son Kanıt bölümü.
fallback: slice cannot anchor without scope creep ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P02-B03-A10
last_commit: 7a1c984
tests: PASS — forge-p02-visioner-synthesis-block-gate.test.ts (6/6); forge-p02-visioner-synthesis*.test.ts (40/40); forge-p02-*.test.ts (129/129)
evidence: runVisionerSynthesisBlockGate passed=true handoffValid=true regression=PASS guard=PASS handoff→P02-B04 entry=P02-B04-A01; harnessVersion=1.0.0-a10
next: P02-B04-A01
