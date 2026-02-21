# Foreman

AI agent orkestratör — atomik düşünce zincirleriyle vizyon, araştırma ve taktik muhakeme.

## Kurulum

```bash
curl -fsSL https://raw.githubusercontent.com/SovranAMR/foreman/main/install.sh | bash
```

Kurulum sonrası:
```bash
source ~/.bashrc   # veya terminali yeniden aç
foreman setup      # API key'lerini ayarla
```

### Gereksinimler
- Node.js 20+
- npm

## Hızlı Başlangıç

```bash
# 1. API key'lerini ayarla
foreman setup

# 2. Yeni proje oluştur
mkdir my-project && cd my-project
foreman init "My Project"

# 3. Görev çalıştır
foreman run "Build a premium hero section for dental clinic"
```

## 4 Katman

| Katman | Rol | Sorusu |
|--------|-----|--------|
| 🔮 **Vizyoner** | Ruh, yön, estetik | "Bu NEDEN var?" |
| 🧩 **Stratejist** | Parçalama, planlama | "Bu NASIL organize edilir?" |
| 🔍 **Araştırmacı** | Bilgi toplama | "Başkaları NE yaptı?" |
| ⚡ **İşçi** | Uygulama + taktik muhakeme | "BURADA ne yapmalıyım?" |

## Pipeline

```
Görev → 🔮 Vizyon → 🧩 Parçalama → Her blok için:
  🔍 Araştırma → 🧩 Atomize → Her atom için:
    ⚡ Uygulama → 🔬 Doğrulama
  🪞 Yansıma (her 5 atomda)
```

## İşçi Protokolü

İşçi körlemesine kod yazmaz. 8 adımlık zorunlu protokol:

1. **READ** — Hedef dosyayı oku
2. **CONTEXT** — Mevcut kodu anla
3. **IMPACT** — Yan etkileri değerlendir
4. **DECIDE** — Ne yazacağına karar ver
5. **PREDICT** — Sonucu hayal et
6. **EXECUTE** — Kodu yaz
7. **VERIFY** — Doğrula
8. **REPORT** — Raporla

## Komutlar

```
foreman setup       API key kurulumu (interaktif)
foreman init <name> Yeni proje oluştur
foreman run <task>  Görev çalıştır (tam pipeline)
foreman status      Proje durumunu göster
foreman thoughts    Düşünce listesi
foreman chains      Zincir listesi
foreman history     State geçiş logları
foreman providers   Provider durumu
foreman doctor      Sistem sağlık kontrolü
```

## Test

```bash
npm test
# 66 test, 0 fail
```

## Kaldırma

```bash
bash ~/.foreman/repo/uninstall.sh
```

## Lisans

MIT
