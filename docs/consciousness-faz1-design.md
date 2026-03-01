# Foreman Consciousness — Faz 1: Heartbeat & Proactive Agency

## Amaç
Foreman'ı "sadece mesaj gelince düşünen" bir bot olmaktan çıkarıp,
**sürekli çalışan, izleyen, düşünen ve gerektiğinde kendiliğinden haber veren** bir varlığa dönüştürmek.

---

## Mimari Bileşenler

### 1. `ConsciousnessLoop` (Ana Döngü)
- Node.js'de sürekli çalışan async loop
- Configurable interval (default: 5 dakika)
- Her tick'te tüm "sense" modüllerini çalıştırır
- Sonuçları değerlendirir → aksiyon alır veya sessiz kalır

```
┌─────────────────────────────────────────┐
│           ConsciousnessLoop             │
│                                         │
│  ┌──────┐  ┌──────┐  ┌──────┐          │
│  │Sense │→ │Think │→ │Act   │          │
│  │      │  │      │  │      │          │
│  │System│  │Eval  │  │Notify│          │
│  │Git   │  │Prio  │  │Fix   │          │
│  │Tests │  │Decide│  │Log   │          │
│  └──────┘  └──────┘  └──────┘          │
│                                         │
│  Memory ←──────────────────→ Telegram   │
└─────────────────────────────────────────┘
```

### 2. `SenseModule` (Algılama Katmanı)
Her tick'te çalışan sensörler:

| Sensör | Ne Yapar | Örnek Çıktı |
|--------|----------|-------------|
| `SystemSense` | CPU, RAM, disk, uptime | `{ disk_usage: 92%, cpu_load: 0.3 }` |
| `ServiceSense` | Kritik servislerin durumu | `{ openclaw: "down", gateway: "up" }` |
| `GitSense` | Uncommitted changes, stale branches | `{ dirty_files: 3, last_commit: "2h ago" }` |
| `TestSense` | Test suite durumu | `{ failing: 2, passing: 45 }` |
| `LogSense` | Error logları tarama | `{ new_errors: ["OOM at 14:32"] }` |

### 3. `ThinkEngine` (Değerlendirme Katmanı)
- Sensör çıktılarını alır
- Öncelik puanı hesaplar (0-100)
- Karar verir: **notify** / **auto-fix** / **ignore**

Kurallar:
- Disk > 90% → notify (priority: 90)
- Servis down → auto-restart + notify (priority: 95)
- Test fail → notify (priority: 60)
- Stale uncommitted > 24h → remind (priority: 30)
- Her şey normal → sessiz kal (priority: 0)

**Spam koruması:**
- Aynı olay için min 1 saat cooldown
- Günlük max 10 proaktif mesaj
- Gece 00:00-08:00 arası sessiz mod (configurable)

### 4. `ActModule` (Eylem Katmanı)
- `notifyOwner(message)` → Telegram'dan mesaj at
- `autoFix(action)` → Otomatik düzelt (servis restart vb.)
- `logThought(thought)` → Memory'ye yaz

### 5. `ConsciousnessMemory` (Bilinç Hafızası)
- Her tick'in özeti kaydedilir
- Son 24 saatin "düşünce akışı" tutulur
- Pattern detection: "Bu servis 3. kez düştü" gibi

---

## Dosya Yapısı

```
src/consciousness/
├── index.ts              # ConsciousnessLoop — ana döngü
├── sense/
│   ├── system.ts         # CPU, RAM, disk
│   ├── service.ts        # Servis izleme
│   ├── git.ts            # Git durumu
│   ├── test.ts           # Test suite durumu
│   └── log.ts            # Log analizi
├── think.ts              # ThinkEngine — değerlendirme & karar
├── act.ts                # ActModule — eylem & bildirim
├── memory.ts             # ConsciousnessMemory — düşünce hafızası
├── config.ts             # Ayarlar (interval, quiet hours, limits)
└── consciousness.test.ts # Testler
```

---

## Entegrasyon

- `MessagingGateway` başlarken `ConsciousnessLoop.start()` çağrılır
- Loop, gateway'in `sendProactiveMessage()` metodunu kullanır
- Mevcut `memory_write`/`memory_read` sistemiyle entegre

---

## Kapsam Dışı (Faz 2-3)
- Inner monologue (LLM ile kendi kendine düşünme)
- Memory graph (ilişkisel hafıza)
- Dream state (boşta iken kod analizi)
- Öz-gelişim döngüsü

---

## Başarı Kriterleri
1. ✅ Disk dolduğunda bana haber verir
2. ✅ OpenClaw/gateway düşünce otomatik restart + bildirim
3. ✅ Spam yapmaz (cooldown + günlük limit)
4. ✅ Gece rahatsız etmez
5. ✅ Tüm düşünceler memory'de loglanır
6. ✅ %100 test coverage
