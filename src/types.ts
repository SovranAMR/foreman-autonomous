/**
 * FOREMAN — Core Type System
 *
 * Bu dosya Foreman'ın temel veri yapılarını tanımlar.
 * Her tip ARCHITECTURE.md ile tutarlıdır.
 * Her ekleme bir thought dosyasına karşılık gelir.
 */

// ─── LAYER (Katman) ───────────────────────────────────────────
// t_001

/**
 * Foreman'ın 4 düşünce katmanı.
 *
 * - visioner:    Ruh, yön, estetik. "Bu NEDEN var?"
 * - strategist:  Parçalama, planlama. "Bu NASIL organize edilir?"
 * - researcher:  Bilgi toplama. "Başkaları NE yaptı?"
 * - worker:      Uygulama + taktik muhakeme. "BURADA ne yapmalıyım?"
 */
export type Layer = "visioner" | "strategist" | "researcher" | "worker";

/**
 * Her katmanın çalışma kuralları.
 * Runtime'da override edilebilir — model isimleri default.
 */
export interface LayerConfig {
  /** Katman kimliği */
  readonly layer: Layer;

  /** Tercih edilen LLM modeli (runtime'da override edilebilir) */
  defaultModel: string;

  /** Bir zincirde maksimum düşünce sayısı */
  maxThoughtsPerChain: number;

  /** Bu katmanda araştırma zorunlu mu */
  requiresResearch: boolean;

  /** Bu katmanda doğrulama zorunlu mu */
  requiresVerification: boolean;

  /** Bu katman üst katmanı durdurabilir mi (BLOCK sinyali) */
  canBlockParent: boolean;
}

/**
 * Varsayılan katman konfigürasyonları.
 * ARCHITECTURE.md'deki LAYER_CONFIGS ile birebir tutarlı.
 */
export const DEFAULT_LAYER_CONFIGS: Readonly<Record<Layer, LayerConfig>> = {
  visioner: {
    layer: "visioner",
    defaultModel: "claude-opus",
    maxThoughtsPerChain: 50,
    requiresResearch: true,
    requiresVerification: true,
    canBlockParent: false, // en üst katman
  },
  strategist: {
    layer: "strategist",
    defaultModel: "claude-opus",
    maxThoughtsPerChain: 30,
    requiresResearch: true,
    requiresVerification: true,
    canBlockParent: true,
  },
  researcher: {
    layer: "researcher",
    defaultModel: "gpt-4o",
    maxThoughtsPerChain: 20,
    requiresResearch: true, // zaten araştırma katmanı
    requiresVerification: false,
    canBlockParent: true,
  },
  worker: {
    layer: "worker",
    defaultModel: "claude-sonnet",
    maxThoughtsPerChain: 15,
    requiresResearch: false, // taktik düşünce, derin araştırma yok
    requiresVerification: true, // build/test zorunlu
    canBlockParent: true,
  },
} as const;

// ─── THOUGHT STATUS ───────────────────────────────────────────
// t_002

/**
 * Bir düşüncenin yaşam döngüsü.
 *
 * Akış: pending → thinking → [researching] → executing → verifying → done
 * Her noktadan → blocked mümkün.
 * done → reverted mümkün (geri alma).
 *
 * "researching" opsiyonel — araştırma gerekmeyen düşünceler atlayabilir.
 */
export type ThoughtStatus =
  | "pending"      // oluşturuldu, başlamadı
  | "thinking"     // muhakeme yapılıyor
  | "researching"  // araştırma yapılıyor
  | "executing"    // karar verildi, uygulanıyor
  | "verifying"    // uygulama bitti, doğrulanıyor
  | "done"         // tamamlandı
  | "blocked"      // devam edilemiyor
  | "reverted";    // yapılan iş geri alındı

/**
 * Doğrulama yöntemi.
 * Her düşüncenin output'u bu yöntemlerden biriyle doğrulanır.
 */
export type VerificationMethod =
  | "build"        // `build` komutu çalışıyor mu
  | "test"         // testler geçiyor mu
  | "metric"       // FPS, lighthouse, bundle size vb.
  | "screenshot"   // görsel doğrulama
  | "logic";       // mantıksal tutarlılık (LLM self-check)

// ─── THOUGHT ──────────────────────────────────────────────────
// t_003

/**
 * Sistemin atom birimi. Her vizyon, strateji, araştırma ve kod parçası
 * bir Thought olarak doğar, muhakeme edilir, uygulanır, doğrulanır.
 *
 * Bir Thought asla muhakemesiz tamamlanamaz.
 * Bir Thought asla output'suz "done" olamaz.
 */
export interface Thought {
  /** Benzersiz kimlik: "t_001", "t_002", ... */
  readonly id: string;

  /** Hangi zincire ait: "chain_001_types" */
  readonly chainId: string;

  /** Hangi katmanda çalışıyor */
  readonly layer: Layer;

  // ── Input ──

  /** Bu düşüncenin sorusu / görevi */
  readonly input: string;

  /**
   * Bağımlı olduğu referanslar.
   * Format: "t_001" (thought), "file:src/x.ts" (dosya), "url:..." (web)
   */
  readonly contextRefs: readonly string[];

  // ── Muhakeme (ZORUNLU) ──

  /**
   * Bu kararı NEDEN veriyorum.
   * Runtime'da boş string kabul edilmez — enforce edilir.
   */
  reasoning: string;

  // ── Araştırma (opsiyonel) ──

  /** Bu düşünce araştırma gerektiriyor mu */
  needsResearch: boolean;

  /** Araştırma sorgusu (needsResearch=true ise doldurulur) */
  researchQuery?: string;

  /** Araştırma bulguları */
  researchFindings?: string;

  // ── Output ──

  /**
   * Bu düşüncenin cevabı / sonucu.
   * "done" durumunda boş olamaz — enforce edilir.
   */
  output: string;

  /** 0-1 arası güven skoru. Düşükse üst katman bilgilendirilir. */
  confidence: number;

  // ── Doğrulama ──

  /** Doğrulama gerekli mi */
  needsVerification: boolean;

  /** Doğrulama yöntemi */
  verificationMethod?: VerificationMethod;

  /** Doğrulama sonucu */
  verified?: boolean;

  /** Doğrulama başarısızlık sebebi */
  verificationFailure?: string;

  // ── Akış ──

  /** Mevcut durum */
  status: ThoughtStatus;

  /** Sonraki thought id (zincir bağlantısı) */
  next?: string;

  /** Neden durdu (status=blocked ise) */
  blockedReason?: string;

  /**
   * İşçi düşünme protokolü.
   * Sadece layer="worker" thought'larında doldurulur.
   * Runtime'da worker thought'u bu olmadan "done" olamaz.
   */
  workerProtocol?: WorkerProtocol;

  // ── Meta ──

  /** Oluşturulma zamanı (ISO 8601) */
  readonly createdAt: string;

  /** Tamamlanma zamanı (ISO 8601) */
  completedAt?: string;

  /** Harcanan token (rate limit bütçe takibi için) */
  tokenCost?: number;

  /** Kullanılan LLM modeli */
  model?: string;
}

// ─── CHAIN ────────────────────────────────────────────────────
// t_004

/**
 * Chain durumu. Thought status'undan daha basit —
 * chain bireysel thought'ların agregasyonu.
 */
export type ChainStatus =
  | "active"       // çalışıyor, thought'lar işleniyor
  | "paused"       // duraklatıldı (insan müdahalesi veya bekleme)
  | "completed"    // tüm thought'lar done
  | "blocked";     // bir thought blocked, chain durdu

/**
 * Düşünce zinciri. Aynı amaca yönelik thought'ların sıralı dizisi.
 *
 * Chain'ler hiyerarşik olabilir — bir stratejist chain'i
 * birden fazla worker alt-chain'i doğurabilir (fraktal decomposition).
 */
export interface Chain {
  /** Benzersiz kimlik: "chain_001_types" */
  readonly id: string;

  /** İnsan-okunabilir isim: "Tip Sistemi" */
  readonly name: string;

  /** Bu zincirin amacı — tek cümle */
  readonly goal: string;

  /** Dominant katman */
  readonly layer: Layer;

  /**
   * Üst zincir id'si.
   * Fraktal decomposition: stratejist bloğu atomize edince
   * alt chain oluşturur, parent'ı stratejist chain'i olur.
   */
  readonly parentChainId?: string;

  /**
   * Thought id listesi (sıralı).
   * Thought nesnelerinin kendisi değil, sadece id referansları.
   * Lazy loading — ihtiyaç olunca dosyadan yüklenir.
   */
  thoughts: string[];

  /** Mevcut durum */
  status: ChainStatus;

  /**
   * Önceki zincirlerin ve bu zincirin birikmiş özeti.
   * Context compression — uzun zincirlerde token tasarrufu.
   * Yeni thought'lar bu özeti bağlam olarak kullanır.
   */
  contextSummary: string;

  /** Oluşturulma zamanı (ISO 8601) */
  readonly createdAt: string;

  /** Tamamlanma zamanı (ISO 8601) */
  completedAt?: string;
}

// ─── SYSTEM STATE ─────────────────────────────────────────────
// t_005

/**
 * Foreman'ın global durumu.
 * Sistem her an TEK BİR durumda — iç içe geçme yok.
 */
export type SystemState =
  | "idle"             // hiçbir şey yapmıyor
  | "visioning"        // vizyon oluşturuluyor (vizyoner çalışıyor)
  | "decomposing"      // parçalanıyor (stratejist çalışıyor)
  | "researching"      // araştırılıyor (araştırmacı çalışıyor)
  | "executing"        // atom yapılıyor (işçi çalışıyor)
  | "verifying"        // kontrol ediliyor
  | "reflecting"       // geri bakılıyor (tutarlılık kontrolü)
  | "blocked"          // problem var, devam edilemiyor
  | "awaiting_human"   // insan onayı bekliyor
  | "complete";        // tüm iş bitti

/**
 * Geçerli state geçişleri.
 * Burada tanımlanmayan bir geçiş runtime'da REJECT edilir.
 *
 * Dead state yok — her state'in en az bir çıkışı var.
 * "complete" sadece "idle"a dönebilir (yeni iş için).
 */
export const VALID_TRANSITIONS: Readonly<Record<SystemState, readonly SystemState[]>> = {
  idle:            ["visioning"],
  visioning:       ["decomposing", "blocked"],
  decomposing:     ["researching", "executing", "blocked"],
  researching:     ["decomposing", "executing", "blocked"],
  executing:       ["verifying", "blocked"],
  verifying:       ["executing", "reflecting", "blocked", "complete"],
  reflecting:      ["executing", "decomposing", "visioning", "blocked"],
  blocked:         ["decomposing", "visioning", "awaiting_human"],
  awaiting_human:  ["executing", "decomposing", "visioning", "idle"],
  complete:        ["idle"],
} as const;

// ─── WORKER PROTOCOL ──────────────────────────────────────────
// t_006

/**
 * İşçinin her atom için zorunlu düşünme adımları.
 *
 * Bu protokol, işçinin körlemesine kod yazmasını engeller.
 * Her adım string — runtime'da boş string REJECT edilir.
 *
 * Akış:
 *   ÖNCE:  read → context → impact → decide → predict
 *   YAPMA: execute
 *   SONRA: verify → report
 */
export interface WorkerProtocol {
  // ── Yapmadan ÖNCE ──

  /** Hedef dosyayı oku, ilgili satırları bul */
  step1_read: string;

  /** Mevcut kodu anla — ne var, ne yok, ne bağlı */
  step2_context: string;

  /** Bu değişiklik neyi etkiler? Yan etki var mı? */
  step3_impact: string;

  /** Tam olarak ne yazacağım, nereye yazacağım */
  step4_decide: string;

  /** Bu değişiklikten sonra ekran/davranış nasıl olacak */
  step5_predict: string;

  // ── Yapma ──

  /** Uygulanan değişikliğin özeti */
  step6_execute: string;

  // ── Yaptıktan SONRA ──

  /** Build çalışıyor mu? Beklentim karşılandı mı? */
  step7_verify: string;

  /** Ne yaptım, ne değişti, beklenmedik şey var mı */
  step8_report: string;
}

// ─── RATE LIMITING ────────────────────────────────────────────
// t_007

/**
 * Model rotasyonu — tek provider'a yüklenmemek için.
 * 429 gelince fallback listesinden sonraki modele geçer.
 */
export interface ModelRotation {
  /** Ana model */
  primary: string;

  /** Yedek modeller (sıralı) */
  fallback: readonly string[];

  /** 429 gelince otomatik rotate et */
  rotateOn429: boolean;
}

/**
 * Token bütçesi — kontrolsüz harcamayı engeller.
 * Aşılınca thought "blocked" olur, sebep: "budget_exceeded".
 */
export interface TokenBudget {
  /** Tek bir düşüncenin max token harcaması */
  perThought: number;

  /** Tek bir zincirin max token harcaması */
  perChain: number;

  /** Tüm session'ın max token harcaması */
  perSession: number;
}

/**
 * Rate limit konfigürasyonu.
 * Throttle + model rotasyonu + token bütçesi.
 */
export interface RateLimitConfig {
  /** Çağrılar arası minimum bekleme (ms) */
  minDelayBetweenCalls: number;

  /** Dakikada max çağrı sayısı (burst koruması) */
  maxCallsPerMinute: number;

  /** Burst sonrası bekleme süresi (ms) */
  cooldownAfterBurst: number;

  /** 429 sonrası bekleme stratejisi */
  backoffStrategy: "exponential";

  /** Maksimum yeniden deneme sayısı */
  maxRetries: number;

  /** Model rotasyonu kuralları */
  modelRotation: ModelRotation;

  /** Token bütçesi */
  budget: TokenBudget;
}

// ─── PERSISTENCE / STATE ──────────────────────────────────────
// t_008

/**
 * Bir state geçişinin kaydı.
 * Audit trail — ne zaman, nereden nereye, neden.
 */
export interface StateTransition {
  /** Önceki durum */
  from: SystemState;

  /** Sonraki durum */
  to: SystemState;

  /** Geçiş sebebi */
  reason: string;

  /** Geçiş zamanı (ISO 8601) */
  at: string;

  /** İlgili thought id (varsa) */
  thoughtId?: string;

  /** İlgili chain id (varsa) */
  chainId?: string;
}

/**
 * Foreman'ın global runtime durumu.
 * state.json olarak persist edilir.
 * Her session'da ilk okunan, her geçişte güncellenen dosya.
 */
export interface ForemanState {
  /** Mevcut sistem durumu */
  currentState: SystemState;

  /** Aktif çalışan zincir (varsa) */
  activeChainId?: string;

  /** Aktif çalışan düşünce (varsa) */
  activeThoughtId?: string;

  /** Proje kök dizini */
  projectRoot: string;

  /** Proje adı */
  projectName: string;

  /** Son N geçiş (audit trail) */
  history: StateTransition[];

  /** Toplam harcanan token (session bazlı) */
  totalTokens: number;

  /** Session başlangıç zamanı */
  sessionStartedAt: string;

  /** Son güncelleme zamanı */
  lastUpdatedAt: string;
}

// ─── ENGINE TYPES ─────────────────────────────────────────────
// t_009

/**
 * Engine'e "düşün" komutu.
 */
export interface ThinkRequest {
  /** Ne hakkında düşün */
  input: string;

  /** Hangi katmanda düşün */
  layer: Layer;

  /** Bağlam referansları */
  contextRefs: string[];

  /** Bağlam metni (önceki düşüncelerden derlenen) */
  contextText?: string;

  /** Kısıtlamalar */
  constraints?: {
    maxTokens?: number;
    timeoutMs?: number;
    model?: string; // override default model
  };
}

/**
 * Engine'in düşünce output'u.
 */
export interface ThinkResult {
  /** Muhakeme (neden bu sonuca vardım) */
  reasoning: string;

  /** Sonuç */
  output: string;

  /** Güven skoru (0-1) */
  confidence: number;

  /** Araştırma gerekiyor mu */
  needsResearch: boolean;

  /** Araştırma sorgusu (needsResearch=true ise) */
  researchQuery?: string;

  /** Sonraki adım önerisi */
  suggestedNext?: string;

  /** Harcanan token */
  tokenCost: number;

  /** Kullanılan model */
  model: string;
}

/**
 * Araştırma sonucu.
 */
export interface ResearchResult {
  /** Araştırma sorgusu */
  query: string;

  /** Bulunan kaynaklar */
  sources: readonly ResearchSource[];

  /** Sentezlenmiş bulgular */
  findings: string;

  /** Ne kadar ilgili bulgu bulundu (0-1) */
  relevanceScore: number;

  /** Harcanan token */
  tokenCost: number;
}

/**
 * Tek bir araştırma kaynağı.
 */
export interface ResearchSource {
  /** Kaynak URL'i veya dosya yolu */
  ref: string;

  /** Kaynak başlığı */
  title: string;

  /** İlgili kısmın özeti */
  snippet: string;
}

/**
 * Kod uygulama sonucu.
 */
export interface ExecuteResult {
  /** Başarılı mı */
  success: boolean;

  /** Değişen dosyalar */
  filesChanged: readonly string[];

  /** Build geçti mi (null = build çalıştırılmadı) */
  buildPassed: boolean | null;

  /** Hata mesajı (success=false ise) */
  error?: string;

  /** Commit hash (commit atıldıysa) */
  commitHash?: string;
}
