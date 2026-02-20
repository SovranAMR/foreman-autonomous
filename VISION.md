# FOREMAN — Vision Document

## Tek Cümle
Foreman, AI agent'ları disiplinize eden bir orkestratör — her görevi atomik düşüncelere parçalar, her düşünceden önce araştırır ve muhakeme eder, her düşünceden sonra doğrular.

## Problem
Mevcut AI agent'lar (Claude Code, Cursor, Devin, Copilot) şu sorunlardan muzdarip:

1. **Disiplinsizlik**: "Hero yap" deyince 18 commit atıyor, 15'i gereksiz opacity tweakı
2. **Araştırmasızlık**: Best practice araştırmadan dalıyor, sonra "kasıyor" denince geri alıyor
3. **Vizyon körlüğü**: "Şov level" deyince "daha fazla efekt" anlıyor, vizyonu yorumlayamıyor
4. **Context kaybı**: Uzun session'larda ne yaptığını unutuyor, tekrar ediyor
5. **Muhakemesizlik**: Her satırı düşünmeden yazıyor, yan etkileri göremiyor

## Çözüm
4 katmanlı düşünce mimarisi:

| Katman | Rol | Sorusu |
|--------|-----|--------|
| Vizyoner | Ruh, yön, estetik | "Bu NEDEN var?" |
| Stratejist | Parçalama, planlama | "Bu NASIL organize edilir?" |
| Araştırmacı | Bilgi toplama, analiz | "Başkaları NE yaptı?" |
| İşçi | Uygulama + taktik muhakeme | "BURADA ne yapmalıyım?" |

## Temel İlkeler

### 1. Atomik Düşünce Birimi
Sistemin en küçük birimi tek bir DÜŞÜNCE:
```
1 input → muhakeme → 1 output
```
Her şey — vizyon, strateji, araştırma, kod — düşünce zincirleriyle inşa edilir.

### 2. Araştırma Önce
Hiçbir düşünce, gerekli bilgi toplanmadan tamamlanmaz. "Tahmin et ve yap" yasak.

### 3. Muhakeme Zorunlu
Her düşüncede reasoning alanı var. Boş bırakılamaz. İşçi bile "neden bu satırı yazıyorum" sorusuna cevap verir.

### 4. Doğrulama Sonra
Her düşüncenin output'u doğrulanır. Build, metric, screenshot, veya mantıksal tutarlılık.

### 5. Bidirectional Akış
Alt katman üst katmanı değiştirebilir. İşçi "bu yapılamaz" derse Stratejist replan yapar. Stratejist "vizyon tutarsız" derse Vizyoner revize eder.

### 6. State Her Zaman Biliniyor
Sistem her an tek bir durumda. Neredeyiz, ne düşünüyoruz, sıradaki ne — her zaman net.

### 7. Disiplin > Hız
Hızlı ama yanlış yapmaktansa yavaş ama doğru yapmak. Acele etmek yasak.

## Ne DEĞİLDİR

- Sohbet botu değil — konuşmaz, iş yapar
- Otomasyon scripti değil — düşünür, körlemesine çalışmaz
- Proje yönetim aracı değil — Jira/Linear alternatifi değil
- IDE eklentisi değil — bağımsız çalışır

## Başarı Kriteri
Foreman'a "Eyricediş için şov level hero yap" dediğinde:
1. Önce "şov level" ne demek araştırır (referanslar, örnekler)
2. Vizyonu oluşturur (estetik kararlar, gerekçeli)
3. Kaba parçalar (5-8 blok)
4. Her bloğu araştırıp atomize eder (3-6 atom per blok)
5. Her atomu muhakemeyle yapar (read → context → impact → decide → do → verify)
6. Her 5 atomda geri bakar (tutarlılık kontrolü)
7. Sonuç: %80+ vizyon karşılama, 60fps, build clean
