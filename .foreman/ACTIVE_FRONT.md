# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

program: FOREMAN-FORGE-1000
front_status: READY
active_phase: P04
active_block: P04-B02
active_atom: P04-B02-A05
phase_file: .foreman/phases/P04_RESEARCHER.md
program_progress: 314/1000
phase_progress: 14/100
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

P04-B02-A05 — Repo içi kanıt toplama: failure, recovery ve NO-GO yollarını uygula.

objective: P04-B02-A04 PASS; implement failure, recovery and NO-GO paths for in-repo evidence collection.
target: failure_path, recovery_path, nogo_path probe matrix validation.
hypothesis: Failure/recovery slice gate isolates error paths with zero unexpected mismatches.
acceptance: failure/recovery/NO-GO probes PASS; slice matrix valid with zero unexpected mismatches.
commands: npx tsx --test src/forge-p04-researcher*.test.ts
blast_radius: src/forge-p04-researcher-*.ts
rollback: P04-B02-A05 failure/recovery slice değişikliklerini geri al.
evidence_path: .foreman/phases/P04_RESEARCHER.md Son Kanıt bölümü.
fallback: Slice blocked ise BLOCKED raporla.

## Tur sonunda zorunlu kayıt

last_atom: P04-B02-A04
last_commit: pending
tests: PASS — forge-p04-researcher*.test.ts (77/77); boundary 6 probes; expectedFail=0; harnessVersion=1.0.0-a04
evidence: assessInRepoEvidenceInputBoundary; runResearcherInRepoEvidenceBoundarySlice; validateResearcherInRepoEvidenceBoundaryProbeMatrix; boundary slice PASS
next: P04-B02-A05
