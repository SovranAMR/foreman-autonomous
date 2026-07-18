# FOREMAN ACTIVE FRONT — TEK GÜNCEL İŞ EMRİ

active_front: kimi-k3-provider-migration
front_status: READY
progress_token: K3-0-bootstrap
next_atom: K3-1-request-contract
fallback_atom: K3-1-contract-tests-first
parallel_front: NONE
max_attempts_per_atom: 3
stage_exit_policy: TESTED_VERTICAL_SLICE_ONLY
no_go_policy: RECORD_EVIDENCE_AND_CHANGE_APPROACH
updated_at: 2026-07-18

## Amaç

Foreman'ın Telegram ve genel agent sohbet yolunda kullanılan ana Kimi modelini
`kimi-k2.6` yerine `kimi-k3` yap. K2.6 uyumluluğunu kontrollü fallback/arka-plan yolu
olarak koru; ana yolun sessizce K2.6'ya dönmesine izin verme.

## Resmi K3 sözleşmesi

- API model kimliği: `kimi-k3`.
- K3 her zaman reasoning kullanır.
- Üst seviye `reasoning_effort: "max"` kullanılır.
- K3 isteğine K2.x'e ait `thinking` alanı gönderilmez.
- Sabit sampling alanlarını K3 isteğine elle gönderme; resmi rehber bunların omit edilmesini ister.
- Çok turlu/tool-call akışında API'nin döndürdüğü assistant mesajının gerekli alanları,
  özellikle `reasoning_content`, sonraki isteğe eksiksiz taşınır.
- K3 context penceresi 1M'dir; mevcut bağlam limiti tabloları ve korumaları buna göre incelenir.

## Atom sırası

1. **K3-1-request-contract**
   - `src/kimi-provider.ts` içinde K3 modelini tanıt.
   - K3 ve K2.x için ayrı, test edilebilir request-parameter politikası kur.
   - `generate`, `streamChat` ve `streamChatWithTools` yollarının aynı doğru politikayı
     kullandığını kanıtlayan test ekle.

2. **K3-2-tool-history**
   - Tool-call döngüsünde K3 assistant mesajını gerekli reasoning/tool alanlarıyla koru.
   - Birden fazla tool turunu sahte API yanıtlarıyla test et.

3. **K3-3-gateway-routing**
   - `MessagingGateway` Kimi ana modelini `kimi-k3` yap.
   - `/models` ve `/model` komutlarını aktif provider'a göre çalıştır; Kimi kullanırken
     Antigravity listesini göstermesin.
   - Arka-plan consciousness/heartbeat hızlı yolu maliyet gerekçesiyle
     `kimi-k2.6-instant` kalabilir; bu karar açıkça test edilip belgelenir.

4. **K3-4-system-wide-config**
   - `kimi-k2.6` hard-code noktalarını tara.
   - Ana katman varsayılanları, fallback zinciri, context window ve maliyet tablolarını
     amaçlarına göre düzelt; kör global replace yapma.

5. **K3-5-regression-and-docs**
   - İlgili hedefli testleri ve ardından tam `npm test` paketini çalıştır.
   - `STATE.md`, `AGENTS.md` ve gerekli kullanıcı belgelerini gerçek davranışla eşitle.
   - Canlı API testi yalnız anahtar ortamda mevcutsa küçük bir smoke olarak çalışır;
     anahtar veya yanıt içeriği log/commit edilmez.

## Kabul kapıları

- [ ] K3 istek gövdesinde `model: "kimi-k3"` ve `reasoning_effort: "max"` var.
- [ ] K3 istek gövdesinde `thinking` ve elle gönderilen sabit sampling alanları yok.
- [ ] K2.6/K2.6-instant mevcut doğru sözleşmeyle çalışmaya devam ediyor.
- [ ] Çok adımlı K3 tool-call geçmişi `reasoning_content` kaybetmiyor.
- [ ] Telegram ana sohbet yolu varsayılan olarak K3 kullanıyor.
- [ ] `/models` ve `/model` Kimi provider model listesini doğru gösterip seçiyor.
- [ ] Arka-plan model tercihi açık ve testli; ana modelle karıştırılmıyor.
- [ ] Context ve fiyat bilgileri güncel model kimlikleriyle tutarlı.
- [ ] Hedefli testler PASS.
- [ ] Tam `npm test` PASS.
- [ ] Belgeler gerçek kod davranışıyla tutarlı.

## İlerleme sayılmaz

- Yalnız `kimi-k2.6` metnini `kimi-k3` ile değiştirmek.
- Test olmadan model geçişi iddia etmek.
- API hatasında ana yolu sessizce eski modele sabitlemek.
- Yalnız doküman/status güncellemek.
- Aynı failing atomu üçten fazla tekrarlamak.

## Tur sonu kayıt formatı

Her başarılı tur bu dosyada `progress_token`, `next_atom`, `front_status` ve aşağıdaki
kısa kanıt kaydını günceller:

```text
last_atom: <atom>
last_commit: <sha veya PENDING>
tests: <çalıştırılan komut + sonuç>
evidence: <değişen gerçek davranış>
next: <tek atom>
```
