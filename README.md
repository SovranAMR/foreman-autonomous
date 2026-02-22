<div align="center">

<pre>
         *   .  *      *   .  *  
   .  *   \ | /   .  *   \ | /
 *    .-"""-+-"""-.  *  .-"""-+-"""-.
  .  /             \   /             \
 *  /_______________\ /_______________\
   |                 |                 |
   |     FOREMAN     |    THE FORGE    |
___|_________________|_________________|___
 \                                       /
  \     AI AGENT ORCHESTRATION LAYER    / 
   \___________________________________/  
    |                                 |   
    |    "Düşünmeden Kod Yazan,       |
    |     Çekiç Darbesini Iskalayan   |
    |     Demirciye Benzer."          |
    |_________________________________|   
</pre>

# ⚒️ FOREMAN 
**The Disciplined AI Orchestrator**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](#)
[![AI Driven](https://img.shields.io/badge/AI%20Driven-Black?style=for-the-badge&logo=openai&logoColor=white)](#)
[![Multi-Model](https://img.shields.io/badge/Multi--Model-Anthropic%20%7C%20Google%20%7C%20OpenAI-blueviolet?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](#)

*“Her büyük eser, örsün üzerinde sabırla şekillenen binlerce küçük ve isabetli darbenin sonucudur.”*

</div>

---

## 🔥 Vizyon: Neden Buradayız? (Teknik Olmayanlar İçin)

Günümüzün Yapay Zeka (AI) asistanları çok hızlı ama aynı zamanda **inanılmaz derecede disiplinsizler**. Bir iş verdiğinizde, araştırmadan, planlamadan ve yan etkilerini düşünmeden hemen kod yazmaya başlıyorlar. Sonuç? Kırık sistemler, gereksiz değişiklikler ve bağlamını (context) unutmuş yapay zekalar.

**Foreman işte bu kaosa son vermek için tasarlandı.**

Foreman'ı bir **Usta Demirci (Blacksmith)** olarak düşünün:
- Önce **Vizyon**'u anlar (Bu kılıç kimin için yapılıyor?).
- Sonra **Strateji** kurar (Hangi metali kullanmalıyım, ne kadar ısıtmalıyım?).
- Ardından **Araştırma** yapar (Bu çeliği işlemek için en iyi teknik nedir?).
- Ve en sonunda **İşçi** olarak çekiç darbelerini (kod) büyük bir hassasiyetle vurur.

Foreman ile yapay zeka sadece bir "kod yazıcı" olmaktan çıkar; **düşünen, araştıran, doğrulayan ve kendini düzelten** tam donanımlı bir dijital ustaya dönüşür.

---

## ⚙️ Mimarinin Kalbi: Mühendisler İçin Derinlemesine Bakış

Foreman, mevcut otonom AI asistanlarının (Devin, Claude Code, Cursor) en büyük zayıflığı olan "Düşünmeden Hareket Etme" (Zero-shot execution) problemini **4 Katmanlı Düşünce Mimarisi (4-Layer Cognitive Architecture)** ile çözer.

Sistemin en küçük yapıtaşı **Atomik Düşünce (Atomic Thought)** birimidir. Foreman hiçbir işlemi bir bütün olarak LLM'e yığmaz. Her görev, birbirine zincirlenmiş, doğrulanabilir düşünce bloklarına ayrılır.

### 🧠 4 Katmanlı Kognitif Mimari

| Katman | Sorduğu Soru | Görevi | Rolü |
| :--- | :--- | :--- | :--- |
| 👑 **Vizyoner** | *"Bu NEDEN var?"* | Projenin ruhunu, estetiğini ve nihai hedefini belirler. Sistemin yönünü çizer. | `google-antigravity/gemini-2.5-pro` (Öneri) |
| ♟️ **Stratejist** | *"Bu NASIL organize edilir?"* | Vizyonu parçalara ayırır. Planlar, önceliklendirir ve adımları belirler. | `anthropic/claude-3-7-sonnet` (Öneri) |
| 🔬 **Araştırmacı** | *"Başkaları NE yaptı?"* | Koda dokunmadan önce ortamı inceler. Dosyaları okur, best-practice'leri araştırır. | `openai/gpt-4o` (Öneri) |
| 🔨 **İşçi (Worker)** | *"BURADA ne yapmalıyım?"* | Taktiksel muhakeme ile kodu yazar, komutları çalıştırır ve test eder. | *Task spesifik modeller* |

> 💡 **Farkımız:** *Diğer sistemler size bir işi tek seferde (one-shot) yapmaya çalışır. Foreman ise her adımdan sonra `Doğrulama (Verification)` motorunu çalıştırır. Eğer işçi hata yaparsa, sistem geri alınır (rollback) ve stratejist yeni bir plan yapar.*

---

## 🛠️ Foreman'ın Çekiç Çantası (Yetenekler)

Foreman sadece bir prompt zinciri değildir. Gerçek dünyada çalışan tam donanımlı bir **Orkestratör Motorudur (Execution Engine)**.

- **Çoklu Arayüz (Omni-Channel):** Sadece CLI üzerinden değil; **WhatsApp** (Baileys) ve **Telegram** (Grammy) üzerinden de Foreman'a görev verebilir, kod yazdırabilirsiniz.
- **Kognitif Yönlendirme (Cognitive Router):** Görevin zorluğuna göre hangi LLM'in (Claude, GPT, Gemini) kullanılacağına otomatik karar verir. Bütçenizi ve zamanınızı korur.
- **Bellek ve Hafıza Yönetimi:** Uzun seanslarda context kaybı yaşamaz. Önemli kararları kalıcı hafızaya yazar.
- **Atomik Dosya Operasyonları (Batch File Engine):** 10 dosyayı aynı anda değiştirirken biri bile hata verirse, tüm işlemleri güvenle geri alır (ACID benzeri güvenlik).
- **Security Scanner & Verification Engine:** Kod yazıldıktan sonra anında güvenlik ve test doğrulaması yapar.

---

## 🚀 Kurulum ve Şov Zamanı

Kendi dijital demircinizi örsün başına geçirmek için:

```bash
# 1. Repoyu Klonlayın
git clone https://github.com/your-username/foreman.git
cd foreman

# 2. Bağımlılıkları Kurun
npm install

# 3. Ortam Değişkenlerini Ayarlayın
cp .env.example .env
# .env içine OPENAI_API_KEY, ANTHROPIC_API_KEY ve GEMINI_API_KEY ekleyin.

# 4. Sistemin Kalbini Ateşleyin
npm run build
```

### Örnek Kullanım

```bash
# Foreman'a vizyoner bir görev verin
foreman task "Sisteme Rate Limiter ekle ama bunu Redis ile yap ve mimarisi enterprise seviyede olsun."

# Veya sadece mevcut projeyi analiz etmesini isteyin
foreman analyze
```

*Not: Görevi verdiğinizde Foreman hemen kod yazmaz. Önce size bir plan (Vision & Strategy) sunar. Siz onayladığınızda çekiç örse inmeye başlar.*

---

## 🏗️ Mimari Tasarım (Arka Plan)

Foreman'ın alt yapısı TypeScript ile tamamen modüler olarak inşa edilmiştir:
- `src/engine.ts`: Sistemin kalbi, görevleri işleme motoru.
- `src/orchestrator.ts`: Katmanlar arası (Vizyoner -> İşçi) geçişleri yöneten orkestra şefi.
- `src/git-engine.ts` & `src/batch-file-engine.ts`: Disk ve Versiyon kontrolü sağlayan güvenli operasyon yöneticileri.

Tüm yapı `AGENTS.md` ve `ARCHITECTURE.md` dökümanlarında açıklanmıştır.

---

## 🤝 Ustalara Çağrı (Katkıda Bulunma)

Foreman henüz genç bir demirci. Daha güçlü çekiçler, daha dayanıklı örsler inşa etmek için usta yazılımcılara ihtiyacımız var. 
Projeyi fork'layın, PR gönderin veya issue açın. 

**Unutmayın:** *Geleceği sadece kod yazanlar değil, nasıl yazıldığını tasarlayanlar şekillendirecek.*

<br/>
<div align="center">
  <sub>Built with 🔥 by a passionate AI & Engineering team.</sub>
</div>