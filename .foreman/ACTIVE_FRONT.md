# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B04
active_atom: P04-B04-A01
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 330/1000
phase_progress: 30/100
block_progress: 10/10
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

P04-B04-A01 — Benchmark ve prior-art analizi: mevcut davranışı ölç ve failing baseline fixture'ını oluştur.

objective: P04-B03-A10 PASS; block gate sealed; B04 baseline entry.
target: loadResearcherBenchmarkPriorArtBaseline, validateResearcherBenchmarkPriorArtBaseline.
hypothesis: Benchmark/prior-art block starts from sealed web primary-source handoff artifacts.
acceptance: failing baseline fixture; contract alignment gate; P04-B03 block gate handoff valid.
commands: npx tsx --test src/forge-p04-researcher-benchmark-prior-art*baseline*.test.ts
blast_radius: src/forge-p04-researcher-benchmark-prior-art*.ts
rollback: P04-B04-A01 baseline değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B03-A10
last_commit: 59f39b1
tests: PASS — forge-p04-researcher-web-primary-source-block-gate.test.ts (7/7); seals=10/10; handoff→P04-B04; orchestrator verifyForgeResearcherWebPrimarySourceBlockGate
evidence: runResearcherWebPrimarySourceBlockGate; getForgeP04B03BlockGate; getForgeP04B03ToB04Handoff; forge-p04-researcher-web-primary-source-block-gate.test.ts
next: P04-B04-A01
