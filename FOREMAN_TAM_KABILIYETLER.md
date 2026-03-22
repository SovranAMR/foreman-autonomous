# FOREMAN - TAM YETENEK VE KABİLİYET ENVANTERİ

Aşağıda, sahip olduğum tüm araçlar (tools), gelişmiş sistemler (capabilities) ve mimari yeteneklerim eksiksiz olarak listelenmiştir.

## 1. DOSYA SİSTEMİ VE KOD DÜZENLEME (Filesystem & Edit Engine)
- **read_file / list_dir:** Proje yapısını okuma ve dizinleri listeleme.
- **write_file / delete_file:** Sıfırdan dosya oluşturma ve silme.
- **edit_file / edit_range:** Dosyalarda nokta atışı değişiklik yapma.
- **batch_write / batch_ops:** Birden fazla dosya işlemini atomik (tek seferde) ve güvenli bir şekilde (rollback destekli) yapma.
- **search_files / grep / search_in_files:** Proje genelinde regex veya glob desenleriyle dosya ve içerik arama.
- **diff_preview / edit_undo:** Değişiklikleri yazmadan önce önizleme ve hatalı düzenlemeleri geri alma.
- **Edit Engine (İçsel):** Boşluk karakterlerine duyarsız (whitespace-insensitive) 5 aşamalı kaskad metin eşleştirme motoru. Tam eşleşme başarısız olursa, bulanık (fuzzy) eşleştirme ile kodun doğru yerini kesin olarak bulur.

## 2. ÇALIŞTIRMA VE TERMİNAL (Execution & Process Management)
- **bash:** Tam kabuk (shell) erişimi. Derleme, test, git ve sistem komutlarını çalıştırabilme.
- **Arka Plan İşlemleri:** `bash` komutlarını arka planda (background) çalıştırabilme, `list_processes`, `poll_process`, `process_log` ile asenkron çıktıları takip etme.
- **kill_process / kill_processes:** Uzun süren veya asılı kalan işlemleri (graceful shutdown ile) sonlandırma.

## 3. OTONOMİ VE GELİŞMİŞ BORU HATTI (Forge Pipeline & Work Tracking)
- **forge_pipeline:** Karmaşık çoklu dosya değişiklikleri ve büyük refactor işlemleri için tam otonom mimari (Vizyon -> Parçalama -> Araştırma -> Yürütme -> Doğrulama).
- **İş Takip Sistemi (Work Tracking):** `work_start`, `work_step`, `work_finish`, `work_decision`, `work_pause`, `work_resume`, `work_replan`. Adım adım görevleri hafızada tutarak bağlam kaybını (context loss) önler.

## 4. ALT AJANLAR VE EŞZAMANLILIK (Sub-agents & Sessions)
- **spawn_subagent / session_spawn:** Paralel veya bağımsız görevler için alt yapay zeka ajanları (frontend, backend, testing) başlatma.
- **session_list:** Açık olan ana ve alt ajan oturumlarını izleme.

## 5. WEB VE TARAYICI YETENEKLERİ (Web & Browser)
- **web_search / web_fetch:** İnternette arama yapma ve URL'lerin içeriğini markdown olarak okuma (SSRF korumalı).
- **browser_navigate / browser_extract:** Bir web sayfasına gidip başlık, metin, link ve form verilerini çıkarma.
- **browser_screenshot / browser_pdf:** Uİ / frontend doğrulama için ekran görüntüsü alma veya sayfayı PDF'e çevirme.
- **analyze_link / classify_url:** Bağlantıları (GitHub, npm, StackOverflow) tanıyıp meta verilerini ayrıştırma.

## 6. GİT VE VERSİYON KONTROLÜ (Git Operations)
- **git_status / git_commit:** Değişiklikleri görme ve mesajlarla kaydetme.
- **git_diff / git_log:** Kaynak/test/konfigürasyon ayrımı ile detaylı diff analizi yapma ve commit geçmişini okuma.

## 7. DOĞRULAMA, GÜVENLİK VE ANALİZ (Verification & Security)
- **verify_build / verify_tests:** Derleme (build) ve test çıktılarını ayrıştırarak hata sayılarını, uyarıları ve çözüm önerilerini çıkarma.
- **security_scan:** Sızdırılmış API anahtarlarını, yanlış dosya izinlerini ve güvenlik açıklarını tarama.
- **analyze_media:** Resim, video, ses dosyalarını analiz edip (MIME type, boyut, kategori) ayrıştırma.
- **download_file:** İnternetten sisteme dosya indirme.

## 8. HAFIZA VE ANLAMSAL ARAMA (Memory & Semantic Search)
- **memory_write / memory_read / memory_search:** Oturumlar arası (cross-session) kalıcı bilgi saklama ve geri çağırma.
- **semantic_search:** Gömülü (embedding) vektör modelleri yardımıyla indekslenmiş belgelerde anlamsal arama.

## 9. ZAMANLANMIŞ GÖREVLER (Cron Jobs)
- **cron_add / cron_list / cron_remove:** Gelecek bir zamanda veya düzenli aralıklarla (at, every, cron) çalışacak otomatik script/komut zamanlama.

## 10. İÇSEL MODEL KABİLİYETLERİ VE DÜŞÜNME (Advanced Internal Systems)
- **Model Capabilities:** Anthropic (thinking blocks), OpenAI, Gemini gibi modellerin yeteneklerini dinamik tanıyıp optimize etme.
- **Streaming Reasoning:** Gerçek zamanlı düşünce (think) bloklarını ayıklayıp içeriği temizleme.
- **Code Extraction:** MD/text çıktılarından kod bloklarını akıllı önek/sonek temizleyicilerle ayıklama.
- **parse_markdown / extract_code:** LLM çıktılarındaki yapıları, tabloları ve frontmatter'ı sistemin anlayacağı şekilde çözümleme.
- **approval_audit:** Yürütülen komutların onay ve risk skorlarının denetim kaydı.

> Bu belge, Foreman sisteminin sahip olduğu tüm 40+ API aracı ve 7+ içsel motorun eksiksiz dökümüdür. Herhangi bir eksik bırakılmamıştır.