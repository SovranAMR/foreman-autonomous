# FOREMAN FORGE MASTER PLAN — 10 / 100 / 1000

program_id: FOREMAN-FORGE-1000
program_status: ACTIVE
phases: 10
blocks: 100
atoms: 1000
active_phase: P01
claim_level: INTERNAL-BASELINE

## Program amacı

Foreman'ın dört katmanlı düşünce mimarisini ve Forge Pipeline yürütme çekirdeğini,
ölçülebilir biçimde dünya sınıfı agent sistemine dönüştürmek. Her phase 10 block, her
block 10 atomdur. Atomların tam listesi phase dosyalarında versioned olarak tutulur.

## Dış kanıt aileleri

- Gerçek yazılım mühendisliği: SWE-bench ailesi.
- Uzun terminal işleri: Terminal-Bench güncel resmi sürümü.
- Tool ve politika güvenilirliği: tau-bench ailesi ve pass-k.
- Genel araştırma/tool yeteneği: GAIA.
- Uzun computer-use: OSWorld güncel sürümü.
- Foreman'a özel: crash, quota, bozuk stream, dirty worktree, rollback ve resume chaos.

Bir skor tek başına yeterli değildir; başarı oranı, pass-k, süre, maliyet, token, adım
sayısı, güvenlik olayı ve tekrar üretilebilirlik birlikte raporlanır.

## Phase sırası

### P01 — Forge Contract, Baseline ve Formal Çekirdek

- P01-B01: Mission ve acceptance contract
- P01-B02: Mevcut pipeline davranış haritası
- P01-B03: Formal state machine
- P01-B04: Typed phase/event schema
- P01-B05: Pipeline invariant engine
- P01-B06: Benchmark ve eval harness
- P01-B07: Reproducible fixture sistemi
- P01-B08: Evidence ve artifact şeması
- P01-B09: Orchestrator seam ve modülerleşme
- P01-B10: Entegre Forge baseline gate

### P02 — Vizyoner — Neden, Amaç ve Ürün Yönü

- P02-B01: Intent ve görev anlamlandırma
- P02-B02: Constraint ve non-goal çıkarımı
- P02-B03: Ürün vizyonu sentezi
- P02-B04: Repo ve kullanıcı bağlamı grounding
- P02-B05: Research trigger belirleme
- P02-B06: Uncertainty ve clarification policy
- P02-B07: Alternatif vizyon üretimi
- P02-B08: Vizyon scoring ve trade-off
- P02-B09: Kullanıcı approval ve steering
- P02-B10: Vizyoner phase gate

### P03 — Stratejist — Planlama ve Fraktal Decomposition

- P03-B01: Hedef decomposition
- P03-B02: Block üretim kontratı
- P03-B03: Atomization ve atom boyutu
- P03-B04: Dependency DAG
- P03-B05: Risk ve reversibility planı
- P03-B06: Kaynak ve budget planı
- P03-B07: Parallel execution wave planı
- P03-B08: Replan ve plan repair
- P03-B09: Plan provenance ve drift
- P03-B10: Stratejist phase gate

### P04 — Araştırmacı — Kanıt, Kaynak ve Deney

- P04-B01: Research question decomposition
- P04-B02: Repo içi kanıt toplama
- P04-B03: Web ve primary-source araştırma
- P04-B04: Benchmark ve prior-art analizi
- P04-B05: Citation ve provenance graph
- P04-B06: Contradiction ve freshness çözümü
- P04-B07: Risk ve trade-off araştırması
- P04-B08: Spike ve falsification deneyi
- P04-B09: Research-to-worker handoff
- P04-B10: Araştırmacı phase gate

### P05 — İşçi — Deterministik Tool ve Execution Kernel

- P05-B01: Typed tool interface ve dispatch
- P05-B02: Filesystem okuma ve grounding
- P05-B03: Cerrahi edit engine
- P05-B04: Shell ve process lifecycle
- P05-B05: Git ve worktree transaction
- P05-B06: Browser, web ve computer tools
- P05-B07: Atomic multi-file batch
- P05-B08: Tool loop ve reasoning transcript
- P05-B09: Timeout, cancellation ve backpressure
- P05-B10: Execution phase gate

### P06 — Doğrulama, Reviewer ve Gerçeklik Kapısı

- P06-B01: Acceptance criterion extraction
- P06-B02: Değişikliğe göre test seçimi
- P06-B03: Build, typecheck ve static analysis
- P06-B04: Behavioral ve contract verification
- P06-B05: Visual ve browser verification
- P06-B06: Performance ve resource regression
- P06-B07: Ground truth ve hallucination firewall
- P06-B08: Independent reviewer tribunal
- P06-B09: False-PASS, flaky ve adversarial QA
- P06-B10: Verification phase gate

### P07 — State, Recovery ve Güvenilirlik

- P07-B01: Durable state persistence
- P07-B02: Phase, block ve atom checkpoint
- P07-B03: Transactional rollback
- P07-B04: Error taxonomy ve retry
- P07-B05: Crash-resume determinism
- P07-B06: Idempotency ve duplicate-effect koruması
- P07-B07: Rate limit, quota ve provider fallback
- P07-B08: Transcript ve partial-output repair
- P07-B09: Chaos ve resilience suite
- P07-B10: Reliability phase gate

### P08 — Context, Memory ve Öğrenme

- P08-B01: Model capability ve context-window registry
- P08-B02: Relevance ve progressive compaction
- P08-B03: Repo index ve code graph
- P08-B04: Short-term session memory
- P08-B05: Long-term durable memory
- P08-B06: Identity ve user preference memory
- P08-B07: Cross-chain ve cross-project transfer
- P08-B08: Outcome'dan öğrenme ve self-improvement
- P08-B09: Forgetting, correction ve contamination
- P08-B10: Cognition phase gate

### P09 — Multi-Agent, Uzun Ufuk ve Ölçek

- P09-B01: Agent role ve capability registry
- P09-B02: Delegation ve subagent lifecycle
- P09-B03: Scheduler ve event-driven tasks
- P09-B04: Concurrency ve parallel waves
- P09-B05: Distributed worker ve worktree pool
- P09-B06: Agent communication ve conflict resolution
- P09-B07: Long-horizon mission control
- P09-B08: Human approval, interrupt ve collaboration
- P09-B09: Cost, latency ve adaptive model routing
- P09-B10: Autonomy phase gate

### P10 — Ürün, Güvenlik, Benchmark ve Frontier Release

- P10-B01: Observability, trace ve deterministic replay
- P10-B02: Security, sandbox ve secret governance
- P10-B03: Telegram, WhatsApp, CLI ve web UX
- P10-B04: Setup, config, deployment ve upgrade
- P10-B05: SWE-bench evaluation
- P10-B06: Terminal-Bench evaluation
- P10-B07: Tau-bench ve GAIA evaluation
- P10-B08: OSWorld ve computer-use evaluation
- P10-B09: pass-k, cost ve public scorecard
- P10-B10: World-class release ve improvement flywheel

## Program gate

- 10 phase gate PASS.
- 100 block için versioned evidence.
- 1.000 atom terminal durumda ve kritik blocker yok.
- Forge invariant ve chaos suite PASS.
- Dış benchmark sonuçları sealed ve yeniden üretilebilir.
- Kalite artışı maliyet/güvenlik regresyonuyla satın alınmamış.
- Sonuç iddiası gerçek rank ve confidence interval ile sınırlı.
