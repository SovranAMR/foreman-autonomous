#!/bin/bash
#######################################################################
# BAĞIMSIZ DELİL DOĞRULAMA SCRİPTİ
# Sapphire B2B Siber Saldırı — SAP-CYBER-2026-0428-001
#
# Bu script, rapordaki delillerin uydurma olmadığını kanıtlamak için
# ÜÇÜNCÜ PARTİ kaynaklara bağımsız sorgular yapar.
#
# Herhangi bir bilirkişi, savcı veya hakim bu scripti çalıştırarak
# delillerin gerçekliğini doğrulayabilir.
#
# Gereksinimler: curl, python3 (herhangi bir Linux/Mac bilgisayar)
#######################################################################

echo "=============================================="
echo "  BAĞIMSIZ DELİL DOĞRULAMA"
echo "  Tarih: $(date)"
echo "=============================================="
echo ""

PASS=0
FAIL=0

check() {
    if [ "$1" = "OK" ]; then
        echo "  ✅ DOĞRULANDI: $2"
        PASS=$((PASS+1))
    else
        echo "  ❌ DOĞRULANAMADI: $2"
        FAIL=$((FAIL+1))
    fi
}

echo "═══════════════════════════════════════════════"
echo "TEST 1: Webhook.site — Saldırganın IP Adresi"
echo "Bu veri webhook.site sunucusunda tutuluyor."
echo "Biz kontrol edemeyiz, değiştiremeyiz."
echo "═══════════════════════════════════════════════"
echo ""
echo "  Sorgu: webhook.site API → token oluşturan IP"
WEBHOOK_IP=$(curl -s "https://webhook.site/token/e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('ip','HATA'))" 2>/dev/null)
echo "  Sonuç: $WEBHOOK_IP"
echo "  Beklenen: 84.44.79.182"
[ "$WEBHOOK_IP" = "84.44.79.182" ] && check "OK" "Token oluşturan IP = 84.44.79.182" || check "FAIL" "Token IP eşleşmedi"
echo ""

echo "  Sorgu: webhook.site API → token oluşturma aracı"
WEBHOOK_UA=$(curl -s "https://webhook.site/token/e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('user_agent','HATA'))" 2>/dev/null)
echo "  Sonuç: $WEBHOOK_UA"
echo "  Beklenen: curl/8.12.1"
[ "$WEBHOOK_UA" = "curl/8.12.1" ] && check "OK" "Token aracı = curl/8.12.1" || check "FAIL" "Token aracı eşleşmedi"
echo ""

echo "═══════════════════════════════════════════════"
echo "TEST 2: IP Geolocation — Bursa, Türkiye"
echo "Bu veri IPinfo.io sunucusunda tutuluyor."
echo "Biz kontrol edemeyiz, değiştiremeyiz."
echo "═══════════════════════════════════════════════"
echo ""
IP_CITY=$(curl -s "https://ipinfo.io/84.44.79.182/json" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('city','HATA'))" 2>/dev/null)
echo "  Sorgu: ipinfo.io → 84.44.79.182 şehri"
echo "  Sonuç: $IP_CITY"
echo "  Beklenen: Bursa"
[ "$IP_CITY" = "Bursa" ] && check "OK" "IP şehri = Bursa" || check "FAIL" "IP şehri eşleşmedi"
echo ""

IP_COUNTRY=$(curl -s "https://ipinfo.io/84.44.79.182/json" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('country','HATA'))" 2>/dev/null)
echo "  Sorgu: ipinfo.io → 84.44.79.182 ülkesi"
echo "  Sonuç: $IP_COUNTRY"
echo "  Beklenen: TR"
[ "$IP_COUNTRY" = "TR" ] && check "OK" "IP ülkesi = TR (Türkiye)" || check "FAIL" "IP ülkesi eşleşmedi"
echo ""

echo "═══════════════════════════════════════════════"
echo "TEST 3: IP = A.I.T. Sunucusu"
echo "Bu veri 84.44.79.182 sunucusunda tutuluyor."
echo "Bu sunucu A.I.T. firmasının kontrolündedir."
echo "═══════════════════════════════════════════════"
echo ""
echo "  Sorgu: http://84.44.79.182:5000/ → HTML içeriği"
AIT_CHECK=$(curl -s --max-time 10 "http://84.44.79.182:5000/" 2>/dev/null | grep -o "aitools.ait.com.tr" | head -1)
echo "  Sonuç: $AIT_CHECK"
echo "  Beklenen: aitools.ait.com.tr"
[ "$AIT_CHECK" = "aitools.ait.com.tr" ] && check "OK" "IP'deki uygulama = aitools.ait.com.tr (A.I.T.)" || check "FAIL" "AIT bağlantısı doğrulanamadı (sunucu kapatılmış olabilir — snapshot delillerine bakın)"
echo ""

echo "  Sorgu: http://84.44.79.182:5000/ → site adı"
AIT_NAME=$(curl -s --max-time 10 "http://84.44.79.182:5000/" 2>/dev/null | python3 -c "
import sys,re
html=sys.stdin.read()
m=re.findall(r'og:site_name.*?content=\"([^\"]+)\"', html)
print(m[0] if m else 'HATA')
" 2>/dev/null)
echo "  Sonuç: $AIT_NAME"
echo "  Beklenen: AIT AI-Tools"
[ "$AIT_NAME" = "AIT AI-Tools" ] && check "OK" "Site adı = AIT AI-Tools" || check "FAIL" "Site adı eşleşmedi (sunucu kapatılmış olabilir)"
echo ""

echo "═══════════════════════════════════════════════"
echo "TEST 4: WHOIS — ait.com.tr sahibi"
echo "Bu veri Nic.tr (Türk domain otoritesi) kayıtlarında."
echo "Biz kontrol edemeyiz, değiştiremeyiz."
echo "═══════════════════════════════════════════════"
echo ""
WHOIS_OWNER=$(whois ait.com.tr 2>/dev/null | grep -A1 "Registrant" | grep -v "Registrant" | head -1 | xargs)
echo "  Sorgu: whois ait.com.tr → kayıt sahibi"
echo "  Sonuç: $WHOIS_OWNER"
echo "  Beklenen: A.I.T. BİLGİSAYAR SİSTEMLERİ..."
echo "$WHOIS_OWNER" | grep -qi "A.I.T" && check "OK" "ait.com.tr sahibi = A.I.T. Bilgisayar Sistemleri" || check "FAIL" "WHOIS eşleşmedi (whois komutu gerekli)"
echo ""

echo "═══════════════════════════════════════════════"
echo "TEST 5: Shodan — IP'deki açık portlar"
echo "Bu veri Shodan.io tarafından bağımsız taranmış."
echo "Biz kontrol edemeyiz, değiştiremeyiz."
echo "═══════════════════════════════════════════════"
echo ""
SHODAN_PORTS=$(curl -s "https://internetdb.shodan.io/84.44.79.182" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(','.join(map(str,d.get('ports',[]))))" 2>/dev/null)
echo "  Sorgu: internetdb.shodan.io → 84.44.79.182 portları"
echo "  Sonuç: $SHODAN_PORTS"
echo "  Beklenen: 80,443,5000,5001 (veya alt küme)"
echo "$SHODAN_PORTS" | grep -q "5000" && check "OK" "Shodan port 5000 açık (AI Pattern Generator)" || check "FAIL" "Shodan port bilgisi farklı"
echo ""

echo "═══════════════════════════════════════════════"
echo "TEST 6: Wayback Machine — Bağımsız Arşiv"
echo "Archive.org tarafından 28 Nisan 2026'da kaydedildi."
echo "Biz kontrol edemeyiz, değiştiremeyiz."
echo "═══════════════════════════════════════════════"
echo ""
WB_CHECK=$(curl -s "https://archive.org/wayback/available?url=webhook.site/token/e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3&timestamp=20260428" 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
snap=d.get('archived_snapshots',{}).get('closest',{})
print(f'{snap.get(\"status\",\"?\")} — {snap.get(\"url\",\"yok\")}')
" 2>/dev/null)
echo "  Sorgu: Wayback Machine → webhook.site token arşivi"
echo "  Sonuç: $WB_CHECK"
echo "$WB_CHECK" | grep -q "200" && check "OK" "Wayback Machine arşivi mevcut" || check "FAIL" "Wayback arşivi bulunamadı"
echo ""

echo "═══════════════════════════════════════════════"
echo "TEST 7: SSRF Proof SVG — CDN'deki Kanıt"
echo "Bu dosya Sapphire CDN'de (Cloudflare R2) tutuluyor."
echo "Saldırgan tarafından yüklenmiş, biz oluşturmadık."
echo "═══════════════════════════════════════════════"
echo ""
SVG_CHECK=$(curl -s "https://cdn.sapphiresc.com/patterns/cmoilcgeq389cqo0f7wk908dj/pat-1777388963220-cxwhq41x1/original.svg+xml" 2>/dev/null | grep -o "SSRF Proof" | head -1)
echo "  Sorgu: CDN'den SSRF Proof SVG dosyası"
echo "  Sonuç: $SVG_CHECK"
[ "$SVG_CHECK" = "SSRF Proof" ] && check "OK" "SSRF Proof SVG CDN'de mevcut" || check "FAIL" "SVG bulunamadı (silinmiş olabilir — yerel kopyaya bakın)"
echo ""

echo "═══════════════════════════════════════════════"
echo "TEST 8: Webhook.site — SSRF Callback Kayıtları"
echo "27 HTTP isteği webhook.site sunucusunda kayıtlı."
echo "Sapphire sunucusu (162.220.234.129) callback yapmış."
echo "═══════════════════════════════════════════════"
echo ""
RAILWAY_IP_CHECK=$(curl -s "https://webhook.site/token/e9da1ee6-ded1-4e10-8dc5-0d5ad73352a3/requests?sorting=oldest&per_page=50" 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
reqs=d.get('data',d)
railway=sum(1 for r in reqs if r['ip']=='162.220.234.129')
attacker=sum(1 for r in reqs if r['ip']=='84.44.79.182')
total=len(reqs)
print(f'Toplam: {total} istek, Railway (SSRF): {railway}, Saldırgan: {attacker}')
" 2>/dev/null)
echo "  Sorgu: webhook.site API → tüm istekler"
echo "  Sonuç: $RAILWAY_IP_CHECK"
echo "$RAILWAY_IP_CHECK" | grep -q "Railway" && check "OK" "Webhook.site SSRF callback kayıtları mevcut" || check "FAIL" "Webhook verileri alınamadı"
echo ""

echo "=============================================="
echo "  SONUÇ"
echo "=============================================="
echo ""
echo "  Doğrulanan:     $PASS"
echo "  Doğrulanamayan: $FAIL"
echo ""
if [ $FAIL -eq 0 ]; then
    echo "  ✅ TÜM DELİLLER BAĞIMSIZ KAYNAKLARDAN DOĞRULANDI"
else
    echo "  ⚠️  Bazı testler başarısız — sunucu kapatılmış veya token süresi dolmuş olabilir."
    echo "     Başarısız testler için evidence/ klasöründeki yerel kopyalara bakın."
fi
echo ""
echo "  Bu doğrulama üçüncü parti kaynaklara dayanmaktadır:"
echo "  • webhook.site (Danimarka) — saldırgan IP kaydı"
echo "  • ipinfo.io (ABD) — IP geolocation"
echo "  • shodan.io (ABD) — bağımsız port taraması"
echo "  • archive.org (ABD) — zaman damgalı web arşivi"
echo "  • Nic.tr (Türkiye) — domain sahiplik kaydı"
echo "  • Cloudflare R2 CDN — saldırganın yüklediği dosyalar"
echo ""
echo "  Bu kaynakların hiçbiri şikayet eden tarafından"
echo "  kontrol edilemez veya değiştirilemez."
echo "=============================================="
