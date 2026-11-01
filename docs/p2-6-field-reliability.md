
# P2.6 — Gerçek PDF corpus, Chromium kota/kurtarma ve fiziksel Android

## Durum ve kabul ayrımı
- **P2.6-A: Otomatik CI (geçti)**: CDP kota override *gözlemi* ve bağımsız gerçek IndexedDB native abort işlemleri; PDF SHA-256, yer imi, metadata revizyonu, cold reload ve sonraki geçerli yazma/restore korunumu. **Gerçek kota reddi bu CI ortamında oluşmadı.**
- **P2.6-B: Açık lisanslı gerçek PDF corpus (5/5 geçti)**: NASA NACA, GovInfo ve üç CC0 örneği için PDF.js+Chromium doğrulaması başarılı. [Kapsam ve kanıt](p2-6-public-corpus-acceptance.md). Daha geniş formatlar beklemektedir.
- **P2.6-C: Fiziksel Android**: ADB üzerinden PSS/boş RAM örnekleri ve cihazda manuel sekme sonlandırma/kurtarma protokolü. CI'da fiziksel cihaz olmadığı için **bekleyen saha doğrulamasıdır**.

## A. Chromium IndexedDB kota gözlemi ve deterministik işlem abort

`e2e/p2-6-quota.spec.mjs` iki **ayrı kanıt** üretir:

1. **Kota gözlemi (CDP):** `Storage.overrideQuotaForOrigin` ile sınır azaltılır, ayrı bir geçici IndexedDB PDF kaydı kullanılarak kota motorunun yazımı reddedip reddetmediği ölçülür. `quotaProbe.enforced` hem `true` hem `false` olabilir. Override aktif olduğu halde yazımın reddedilmemesi, gerçek kota uygulamasının doğrulanmadığı anlamına gelir. Geçici kayıt varsa silinir. **Kota gerçekten uygulanmadığında bunu başarılı kota reddi olarak raporlamıyoruz.**
2. **Gerçek tarayıcı transaction abort:** `IDBObjectStore.put` sonrasında aynı `readwrite` transaction içinde yerel `IDBTransaction.abort()` çağrılır. Bu, mock edilmiş `put` istisnası değil, Chrome'un gerçek transaction rollback mekanizmasıdır. Hem `writeWorkspaceAndPdf` hem `restoreWorkspaceBackup` aynı senaryoyu çalıştırır.
3. İlk PDF'nin SHA-256'sı, adı, sayfa 3 yer imi ve metadata revizyonu redden önce ve sonra eşit olmalıdır. Sayfa yeniden yüklendiğinde 7 sayfa korunmalıdır.
4. Abort enjeksiyonu kaldırıldıktan sonra **hem write hem restore** geçerli yeni 9 sayfalık PDF ile başarıyla tamamlanmalı, revizyon +1 olmalı, reload'da yeni PDF açılmalıdır.
5. `scripts/verify-p2-6-quota.mjs`, iki ayrı JSON raporunun bütünlüğünü kontrol eder.

Bu otomatik test **gerçek fiziksel disk dolmasını, Chrome'un tüm kota politikalarını veya Android OOM'u kanıtlamaz**. CDP kota reddi doğrulanmadığı için bu başlık ayrıca açık kalır. Kotayı resetlemek için `Storage.overrideQuotaForOrigin({origin})` kullanılır.

## B. Gerçek PDF corpus — elle sağlanır, ağdan indirilmez

İzinli ve kişisel bilgi içermeyen PDF dosyalarını yerel klasöre yerleştir. **Depoya PDF, tarama veya lisanssız örnek commit etme.** JSON manifest örneği:

```json
{
  "version": 1,
  "cases": [
    {
      "id": "cc0-scan-300dpi",
      "file": "files/scan.pdf",
      "sha256": "REPLACE_WITH_REAL_64_CHAR_LOWERCASE_SHA256",
      "rightsConfirmed": true,
      "rightsBasis": "CC0 by publisher; verified YYYY-MM-DD",
      "text": "none",
      "minImagePages": 1
    },
    {
      "id": "owned-mixed-document",
      "file": "files/mixed.pdf",
      "sha256": "REPLACE_WITH_REAL_64_CHAR_LOWERCASE_SHA256",
      "rightsConfirmed": true,
      "rightsBasis": "Self-created nonpersonal test fixture",
      "text": "present",
      "minImagePages": 1
    }
  ]
}
```

`text`: `none` (örneklenmiş sayfalarda OCR yok), `present` (en az bir örneklenmiş sayfada metin var), `either` (farketmez). `minImagePages` yalnızca **ilk/orta/son** sayfalarda bulunan görüntü operatörlerinin asgari sayısıdır (0–3). En fazla 40 PDF ve dosya başına 600 MiB; path traversal, symlink ile klasör dışına çıkma, izin onayı ve SHA uyuşmazlığı kesinlikle reddedilir. Script **gerçek dosyaların kendisini, metin parçalarını, görüntülerini veya mutlak dosya yollarını** çıktı raporuna koymaz.

```bash
npm ci
# local files/scan.pdf dosyasının SHA'sını hesapla ve manifest'e yaz
sha256sum files/scan.pdf
P2_REAL_CORPUS_MANIFEST=/path/to/manifest.json npm run test:corpus
# Chromium gerçek raster çizim ve uzak sayfaya atlama
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
npm run build
node scripts/check-pages.mjs
P2_REAL_CORPUS_MANIFEST=/path/to/manifest.json npm run test:corpus:browser
```

**Örneklerin kapsaması:** 300/600 DPI taranmış JPEG, JPEG2000/JPX, JBIG2, CCITT, CMYK, karma yazı+görüntü, farklı orientasyon ve 100–500 MiB dosyalar. Her kategori için ayrıca hakları doğrulanmış bir gerçek örnek gerekir. Bu kod herhangi bir kaynağın lisansını veya belge içeriğinin kişisel verilerden arındırıldığını **otomatik kanıtlayamaz**; `rightsConfirmed` kullanıcı teyididir.

## C. Fiziksel Android ölçüm prosedürü

Bu aşama yalnız **sahip olunan/izinli** cihazda uygulanır. USB debugging açık, `adb` kurulu ve cihazla bağlantı onaylı olmalıdır.

1. **Önce:** Chrome'da ayrı test profili/sekmesi ile uygulamayı aç. `node scripts/p2-6-android-snapshot.mjs before` çalıştır. RAM/Android/Chrome sürümünü not et.
2. **Saha testi:** 25 MiB ve 100 MiB raster PDF'leri sırayla aç; ilk/orta/son sayfaya git, scroll, zoom, yatay/dikey, thumbnail ve workspace kaydetme eylemlerini dene. PDF'nin SHA'sı ve yer imi sayfasını kullanıcı tarafından hazırlanan kabul kaydına yaz.
3. **Yüklüyken:** `node scripts/p2-6-android-snapshot.mjs after` çalıştır. Sekme yeniden yüklenirse yer imleri/PDF alanları hâlâ doğru mu kontrol et.
4. **Sekme sonlandırma:** Kullanıcı kendi cihazında Android görev yöneticisiyle Chrome'u kapatıp tekrar açar. **ADB scripti `am force-stop`/veri silme işlemi yapmaz.** `node scripts/p2-6-android-snapshot.mjs reopen` çalıştır.
5. 3–5 defa tekrarla; her turda açılış, sayfalar, veri bütünlüğü, sekme yeniden açma ve hata/takılma olaylarını kaydet. Aynı dosya ve cihaz koşullarıyla p50/p95 ölç.
6. Test raporlarını cihazdan **seri numarası, PDF içeriği, tarama görüntüsü, hesap verisi veya URL** eklemeden paylaş.

`P2_ANDROID_SERIAL` çevre değişkeni isteğe bağlıdır; ADB cihaz seçimini yapar ama rapora seri numarası yazılmaz. Script yalnız read-only `getprop`, `/proc/meminfo`, `dumpsys meminfo com.android.chrome` okur. `chromePssMiB` alanı Android sürümüne göre `null` olabilir ve ölçülen PSS yalnız Chrome paketine aittir, PDF'nin inkremental maliyeti değildir.

## Kalan sınırlamalar
- GitHub-hosted Chromium'ta kota override, **gerçek fiziksel disk dolması veya Android OOM killer** testi değildir.
- Beş belgeli açık lisanslı corpus testi geçti; daha geniş format çeşitliliği ve fiziksel Android oturumu henüz doğrulanmadı.
- Cihaz telemetrisi gerçek kullanıcı PDF'leriyle birleştirilmeden önce mahremiyet ve izin doğrulaması gerektirir.

## Kabul kaydı — 31 Ekim 2026

- PR: [#37](https://github.com/alorak/pdf/pull/37)
- Otomatik kabul: [GitHub Actions #41223973463](https://github.com/alorak/pdf/actions/runs/41223973463) — `validate` ve `browser-e2e` başarılı.
- `P2_6_NATIVE_ABORT_PASSED`: **write** ve **restore** senaryoları başarılı.
- `P2_6_ATOMIC_RECOVERY_PASSED`: SHA-256, yer imi ve revizyon kanıtları eksiksiz.
- Eski 7 sayfalık dosyanın SHA-256'sı: `5883dcf75590b5fbca9f43ae3a20d75c45773fe6087b70823c41c831f92552c9`; iki abort senaryosunda aynı kaldı.
- Başlangıç revizyonu: `2`; abort sonrası aynı, geçerli yeniden deneme sonrası `3`.
- CDP kota override: 262.144 byte; `quotaProbe.enforced=false` — **gerçek kota reddi oluşmadı**, yalnızca native abort doğrulandı.

| Bileşen | Durum |
|---|---|
| P2.6-A native transaction rollback, cold reload, sonraki yazma/restore | **Geçti** |
| P2.6-A CDP quota override bildirimi | **Doğrulandı** |
| P2.6-A gerçek kota aşımı nedeniyle yazmanın reddi | **Doğrulanmadı** |
| P2.6-B beş belgeli gerçek PDF corpus | **5/5 başarılı**, format çeşitliliği sınırlı |
| P2.6-C fiziksel Android düşük-RAM ve sekme yeniden açma | **Beklemede: cihaz testi gerekli** |

Otomatik testte PDF ve çalışma alanı verileri GitHub'a taşınmaz; yalnızca fixture'ların hash ve metadata test raporları arşivlenir. Gerçek belge corpus'u ve fiziksel cihaz sonuçları elde edilmeden bütün P2.6 aşaması için genel **tamamlandı** iddiasında bulunulmaz.
