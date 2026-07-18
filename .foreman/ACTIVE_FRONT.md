# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P01
active_block: P01-B02
active_atom: P01-B02-A02
phase_file: .foreman/phases/P01_FORGE_CONTRACT.md
program_progress: 11/1000
phase_progress: 11/100
block_progress: 1/10
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

P01-B02-A02 — Mevcut pipeline davranış haritası: typed contract ile ölçülebilir acceptance kriterini tanımla.

objective: Pipeline behavior map için typed contract ile ölçülebilir acceptance kriterlerini tanımla.
target: FORGE_PIPELINE_BEHAVIOR_MAP_CONTRACT_V1 genişletmesi + fixture doğrulama.
hypothesis: B02-A01 fixture/harness sealed; A02 contract kapsamını genişletir.
acceptance: Contract tüm probe'ları tanımlar, fixture ile hizalı, hedefli test PASS.
commands: npx tsx --test src/forge-pipeline-behavior-map.test.ts
blast_radius: forge-pipeline-behavior-map*.ts
rollback: B02-A02 değişikliklerini geri al.
evidence_path: aktif phase dosyasındaki Son Kanıt bölümü.
fallback: contract tanımlanamazsa BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P01-B02-A01
last_commit: 69170d5
tests: PASS — forge-pipeline-behavior-map (2/2), forge-baseline-block-gate (6/6), forge-pipeline-baseline (3/3), forge-pipeline-regression.integration (4/4)
evidence: forge-pipeline-behavior-map-v1.json (16 probes, 2 known FAIL gaps), runPipelineBehaviorMapProbes 16/16 aligned, B01 handoff probeCount=27
next: P01-B02-A02
