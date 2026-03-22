# FOREMAN OTONOM YAPAY ZEKA MİMARİSİ VE KABİLİYET LİSTESİ

Foreman, sıradan bir sohbet botu değil, doğrudan dosya sistemine (Filesystem), komut satırına (Shell/Bash) ve git repositorilerine tam yetkiyle erişebilen, **otonom çalışan bir mühendislik platformudur**.

## 🚀 1. Çekirdek Otonom Sistemler (İçsel Modüller)

### 1.1. Forge Pipeline (orchestrator.ts)
En büyük ve en kapsamlı sistemim. Sadece küçük düzeltmeler yapmak yerine, karmaşık, çok dosyalı veya sıfırdan oluşturulacak projeleri tamamen otonom yürütür:
- **Visioner (Görüş):** İstenen işi analiz edip detaylı bir mimari plan (vizyon) çıkarır.
- **Strategist (Strateji):** Bu vizyonu mantıksal işlem adımlarına (Blocks/Atoms) böler.
- **Researcher (Araştırma):** Proje dosyalarını tarayıp gerekli bağlamı (context) toplar.
- **Worker (Uygulayıcı):** Her bir atomu (iş adımını) tek tek uygular, test eder ve hataları düzeltir.
- *Otomatik Rollback:* İşlem sırasında bir hata çözülemezse değişiklikleri otomatik geri alır.

### 1.2. Edit Engine (edit-engine.ts)
Dosyalardaki değişiklikleri hatasız yapmak için geliştirilmiş **Boşluklara Duyarsız Arama Motoru**.
- 5 kademeli şelale modeli kullanır: Birebir Eşleşme → Trim → Boşluk Normalizasyonu → Satır Bazlı Bulanık Eşleşme (Fuzzy Match) → En İyi Eşleşme.
- Bu sayede kodlar arasındaki girinti/boşluk (indentation) farklılıkları nedeniyle düzenlemelerin başarısız olmasını engeller.

### 1.3. Model Capabilities (model-capabilities.ts)
Çalıştığım dil modelinin (LLM) sınırlarını ve yeteneklerini algılar (Örn: Anthropic vs OpenAI vs Gemini). 
- Hangi modelin *Reasoning* (Düşünme) yeteneğine sahip olduğunu bilir.
- Hangi modelin *FIM (Fill-in-the-Middle)* veya görsel (Image) işleme yeteneğini desteklediğini tespit edip ona göre davranır.

### 1.4. Streaming Reasoning (streaming-reasoning.ts)
Yanıtlarken kurduğum mantıksal bağları (Düşünce Zinciri - `<think>`) gerçek zamanlı olarak ayıklar. Siz sadece net sonucu ve yapılan işi görürsünüz, arka plandaki karmaşık karar mekanizmaları temizlenerek konsantre bir iletişim sağlanır.

### 1.5. Code Extraction (code-extraction.ts)
Dışarıdan gelen yanıtları veya benim ürettiğim kodları parse eden sistem:
- **SurroundingsRemover:** Akıllı kırpma motoru. Kod bloklarının başındaki/sonundaki gereksiz kısımları atar.
- **SEARCH/REPLACE parsing:** Diff veya eski/yeni değiştirme mantığını algılayıp doğrudan uygular.

---

## 🛠️ 2. Aktif Araç ve Yetenek Envanteri (Tool Definitions)

Her biri doğrudan sistemi etkileyen fonksiyonlar listesidir:

### Dosya ve Sistem Yönetimi
- **read_file / write_file:** Dosyaları okuma ve sıfırdan yazma.
- **edit_file / edit_range:** Dosyalarda spesifik metin bloğunu arayıp, güvenli şekilde değiştirme.
- **search_files / grep:** Proje genelinde dosya veya kod/metin arama (regex destekli).
- **list_dir / delete_file:** Dizin listeleme, dosya/klasör silme.
- **batch_write / batch_ops:** Birden fazla dosya üzerinde eşzamanlı atomik işlem (Biri patlarsa hepsi iptal olur).

### Komut Çalıştırma ve Doğrulama
- **bash:** Her türlü shell komutunu çalıştırma (npm run, docker, python, cd, ls vb.). İşlemleri arka planda çalıştırma yeteneği.
- **verify_build / verify_tests:** Derleme (Build) veya Test çıktılarını analiz edip, spesifik hataları ayıklayarak otonom çözüm üretme.
- **security_scan:** Gizli anahtar sızıntısı, dosya izinleri gibi güvenlik açıklarını arama.

### Süreç (Process) ve Otomasyon Yönetimi
- **list_processes / poll_process:** Arka planda başlattığım asenkron işlemlerin durumunu ve çıktılarını takip etme.
- **process_log / kill_process:** İlgili işlem kayıtlarını okuma ve gerekirse sonlandırma (graceful shutdown).
- **cron_add / cron_list:** Zamanlanmış görevler ekleme (Belirli periyotlarda bir komutu çalıştırma).

### Versiyon Kontrol (Git) Yönetimi
- **git_status / git_diff:** Hangi dosyaların değiştiğini veya staged olduğunu analiz etme.
- **git_commit / git_log:** Değişiklikleri anlamlı mesajlarla paketleyip commitleme, geçmişi inceleme.

### Web ve Ağ Yetenekleri
- **web_search / web_fetch:** İnternette (Brave Search) araştırma yapıp, web sitelerinin metinlerini okuma.
- **analyze_link / classify_url:** Verilen URL'nin tipini anlayıp (GitHub PR, NPM paketi vb.) ilgili veriyi çekme.
- **browser_navigate / browser_extract:** Başsız tarayıcı (headless browser) ile bir sayfaya gidip içeriğini ayrıştırma.
- **browser_screenshot / browser_pdf:** Geliştirdiğim web projelerinin ekran görüntüsünü alma veya sayfaları PDF'e çevirme.

### Görev Takibi ve Bellek
- **work_start / work_step / work_finish:** Uzun soluklu görevlerde context kaybetmemek için iş adımlarını belleğe yazıp adım adım takip etme.
- **memory_read / memory_write:** Önemli sistem kararlarını veya kullanıcı tercihlerini seanslar arası kalıcı belleğe (Persistent Memory) kaydetme.
- **session_spawn / spawn_subagent:** Farklı işlemler için alt-ajanlar yaratıp paralel iş yaptırma.
