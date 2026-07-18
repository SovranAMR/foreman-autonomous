# FOREMAN CURSOR AUTOMATION — FORGE-1000 OTONOM TUR

Bu otomasyon Kimi model yükseltme otomasyonu değildir. Ana görev Foreman'ın yapılış
amacı doğrultusunda Forge Pipeline'ı 10 phase / 100 block / 1.000 atom boyunca geliştirmektir.

## Her tur zorunlu okuma sırası

1. .foreman/MISSION.md
2. .foreman/MASTER_PLAN.md
3. .foreman/DECOMPOSITION_CONTRACT.md
4. .foreman/ACTIVE_FRONT.md
5. ACTIVE_FRONT içindeki phase_file
6. STATE.md, VISION.md, ARCHITECTURE.md, AGENTS.md
7. Aktif atomla ilgili gerçek kaynak ve testler

## Başlangıç

- git status --short ve git branch --show-current çalıştır.
- Kullanıcı değişikliklerini ayır ve koru.
- Tek seferlik K3 bootstrap gerekiyorsa bir bounded değişiklik ve testle bitir; programı
  bunun etrafında yeniden planlama.
- Sonra yalnız active_atom üzerinde çalış.

## Bir tur

1. Aktif atomun target ve mevcut kodunu oku.
2. ACTIVE_FRONT giriş kontratını gerçek bulgularla düzelt.
3. En küçük üretim/test dilimini uygula.
4. Hedefli testi çalıştır.
5. Etkilenen regression testlerini çalıştır.
6. Diff ve evidence'i doğrula.
7. Phase dosyasında yalnız o atomu PASS veya kanıtlı NO-GO yap.
8. ACTIVE_FRONT progress ve sıradaki tek atomu güncelle.
9. Yalnız tur kapsamındaki dosyaları commit et ve main'e normal push yap.
10. Kısa sonuç bırak; force-push, otomatik reset veya kullanıcı değişikliği silme.

## Git disiplini

- Hedef branch main.
- Her atom tek kapsamlı commit olmalı.
- Push öncesi origin/main ile non-destructive sync yap.
- Conflict varsa tahmin ederek ezme; BLOCKED olarak raporla.
- Empty/docs-only/status-only commit atma.
- Force-push yapma.

## Kalite disiplini

- Test geçmeden PASS yok.
- Reviewer boş/bozuk cevap verdi diye otomatik PASS yok.
- Tool çağrısı gerçek sonucu olmadan başarılı sayılamaz.
- Benchmark hard-code, leakage veya test gevşetme yok.
- Secret, token, kişisel veri veya canlı API response commit etme.
- Host sistem/ağ ayarlarına dokunma.
- Aynı yaklaşım üç kez NO-GO olursa fallback/replan uygula.

## Gate davranışı

Her block sonunda block suite; her phase sonunda tam npm test, typecheck ve ilgili
sealed/chaos eval çalıştır. Phase ancak 10 block gate PASS olduğunda ilerler. P10
tamamlanmadan WORLD-BEST sonucu iddia etme.
