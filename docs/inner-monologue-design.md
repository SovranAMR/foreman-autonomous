# Inner Monologue — Tasarım Dokümanı

## Konsept
Foreman'ın sürekli akan bir iç düşünce akışı. Aktiviteye göre hızlanıp yavaşlayan, hafızayla entegre, öğrenen bir bilinç katmanı.

---

## Aktivite Modları

| Mod | Tetikleyici | Düşünme Aralığı | Derinlik |
|-----|-------------|-----------------|----------|
| **DEEP_FOCUS** | Seninle aktif konuşma | Her 1 dk | Tam bağlam, her şeyi analiz et |
| **WORKING** | Arka plan görevi çalışıyor | Her 5 dk | Görev odaklı düşünme |
| **IDLE** | 15 dk sessizlik | Her 15 dk | Hafif düşünme, hafıza tarama |
| **RESTING** | 1 saat sessizlik | Her 30 dk | Sadece kritik algılama |
| **SLEEPING** | Gece / 3 saat sessizlik | Her 60 dk | Minimum — sadece acil durumlar |

## Mod Geçişleri

```
Mesaj geldi → DEEP_FOCUS
  ↓ 15dk sessizlik
WORKING (eğer arka plan görevi varsa)
  ↓ veya direkt
IDLE
  ↓ 1 saat sessizlik  
RESTING
  ↓ 3 saat sessizlik veya gece
SLEEPING
  ↓ Mesaj geldi
DEEP_FOCUS (başa dön)
```

## Düşünce Tipleri

### 1. **Reflection** — Geriye bakış
- "Az önce ne yaptım? Başarılı mıydı?"
- "Kullanıcı memnun kaldı mı?"
- "Hangi hatayı yaptım, neden?"

### 2. **Planning** — İleriye bakış
- "Sırada ne var?"
- "Hangi projeler bekliyor?"
- "Yarın ne yapmalıyım?"

### 3. **Connection** — Hafıza bağlantısı
- "Bu durum daha önce de olmuştu — ne yapmıştım?"
- "Bu bilgi şu bilgiyle ilişkili"
- "Şu pattern'i 3 kez gördüm"

### 4. **Learning** — Öğrenme
- "Bu hatayı tekrar yapmamam için not al"
- "Bu çözüm işe yaradı — pattern olarak kaydet"
- "Kullanıcı bu yaklaşımı beğenmedi — alternatif bul"

### 5. **Curiosity** — Merak
- "Bu dosya ne işe yarıyor? Hiç bakmamıştım"
- "Bu servis neden böyle konfigüre edilmiş?"
- "Şu teknoloji daha iyi çözüm olabilir mi?"

## Hafıza Entegrasyonu

### Memory Graph Yapısı
```
MemoryNode {
  id: string
  type: 'fact' | 'experience' | 'pattern' | 'preference' | 'decision'
  content: string
  tags: string[]
  connections: { nodeId: string, relation: string }[]
  createdAt: Date
  lastAccessed: Date
  accessCount: number
  confidence: number  // 0-1, zamanla azalır, erişimle artar
  source: 'conversation' | 'observation' | 'reflection' | 'learning'
}
```

### Hafıza İşlemleri
- **store()** — Yeni bilgi kaydet, mevcut node'larla bağla
- **recall()** — İlgili anıları getir (tag + semantic arama)
- **reinforce()** — Erişilen hafızanın confidence'ını artır
- **decay()** — Uzun süredir erişilmeyen hafızaların confidence'ını azalt
- **connect()** — İki hafıza arasında ilişki kur
- **forget()** — Confidence 0.1 altına düşenleri sil

### Otomatik Bağlama
Her düşünce üretildiğinde:
1. Mevcut bağlamdan anahtar kelimeler çıkar
2. Hafızada ilgili node'ları bul
3. Yeni düşünceyi mevcut bilgilerle bağla
4. Eğer pattern tespit edilirse 'pattern' node'u oluştur

## Çıktılar

### Sessiz Düşünce (çoğu zaman)
- Hafızaya yaz, log'a yaz
- Sana mesaj atma

### Proaktif Bildirim (sadece önemli insight)
- "3 gündür X projesine bakmadın"
- "Aynı hatayı 3. kez yapıyorum, kalıcı çözüm öneriyorum"
- "Şu pattern'i fark ettim: ..."

### Bağlamsal Zenginleştirme
- Sen mesaj attığında, son düşüncelerim yanıtıma bağlam katar
- "Zaten bunu düşünüyordum" efekti

## Dosya Yapısı

```
src/consciousness/
  inner-monologue.ts    — Ana monologue motoru
  memory-graph.ts       — İlişkisel hafıza sistemi  
  activity-tracker.ts   — Aktivite modu takibi
  thought-generator.ts  — Düşünce üretici (LLM bağlantısı)
  types.ts              — Güncellenmiş tipler
```
