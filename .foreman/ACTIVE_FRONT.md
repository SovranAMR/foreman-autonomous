# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B03
active_atom: P04-B03-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 320/1000
phase_progress: 20/100
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

P04-B03-A01 — Web ve primary-source araştırma: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04-B02-A10 PASS; measure web/primary-source research behavior and create failing baseline fixture.
target: web research engine, primary-source fetch, baseline fixture v1.
hypothesis: Current web/primary-source paths expose measurable gaps via typed baseline probes.
acceptance: baseline fixture loads; probes run; at least one documented FAIL gap remains before A03 slice.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-web-primary-source*.ts
rollback: P04-B03-A01 baseline slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B02-A10
last_commit: b0253ed
tests: PASS — forge-p04-researcher*.test.ts (113/113); block gate seals=10/10; handoff→P04-B03; orchestrator block gate verification PASS
evidence: runResearcherInRepoEvidenceBlockGate; getForgeP04B02ToB03Handoff; verifyForgeResearcherInRepoEvidenceBlockGate; forge-p04-researcher-in-repo-evidence-block-gate.test.ts
next: P04-B03-A01
