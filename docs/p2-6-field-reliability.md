
# P2.6 — Gerçek PDF corpus, Chromium kota/kurtarma ve fiziksel Android

## Durum ve kabul ayrımı
- **P2.6-A: Otomatik CI**: Gerçek Chromium IndexedDB kota baskısı (CDP quota override), başarısız PDF yazma/backup restore, önceki PDF'nin SHA-256'sı, yer imleri ve metadata revizyonunun korunması, reload ve başarılı yeniden deneme.
- **P2.6-B: Yerel corpus**: Kullanıcı tarafından lisans/izin kontrolü yapılmış, SHA-256'ları kilitlenmiş gerçek PDF dosyalarını çevrimdışı doğrulayan komut ve Chromium E2E protokolü. Bu depoda gerçek dosya **bulunmaz**; manifest sağlanmadan gerçek corpus kabulü geçilmiş sayılmaz.
- **P2.6-C: Fiziksel Android**: ADB üzerinden PSS/boş RAM örnekleri ve cihazda manuel sekme sonlandırma/kurtarma protokolü. CI'da fiziksel cihaz olmadığı için **bekleyen saha doğrulamasıdır**.

## A. Chromium IndexedDB kota/kurtarma

`e2e/p2-6-quota.spec.mjs`, Chromium DevTools Protocol `Storage.overrideQuotaForOrigin` ile origin disk kotasını sınırlar. Bu, transaction yapay olarak hata fırlatmak yerine tarayıcının kendi kota mekanizmasını çalıştırır; yine de fiziksel disk doldurma veya işletim sistemi OOM testi değildir.

1. Geçerli 7 sayfalık PDF ve sayfa 3 yer imi aynı IndexedDB revizyonunda kaydedilir.
2. PDF'nin gerçek SHA-256'sı ve metadata revizyonu ölçülür.
3. CDP kota override aktifken 4 MiB yeni Blob ile `writeWorkspaceAndPdf` veya `restoreWorkspaceBackup` denenir. İşlemin reddedilmesi zorunludur.
4. Transaction reddedildikten sonra PDF SHA, PDF ismi, yer imi ve revizyon birebir korunmalıdır.
5. Sayfa reload sonrası aynı 7 sayfalık PDF'yi açmalıdır.
6. Kota override'ı kaldırılır. Geçerli 9 sayfalık dosyayla sonraki gerçek write işlemi başarılıdır; revizyon +1 olur, reload'da 9 sayfa açılır.

Test verileri tarayıcı bağlamına özeldir. Snapshot'lar `test-results/stress/p2-6-quota-{write,restore}.json` içine yalnız metadata/hash olarak yazılır.

**Not:** CDP'de kota kaldırma `Storage.overrideQuotaForOrigin({origin})` çağrısıyla yapılır. Desteklenmeyen Chromium sürümünde test atlanmaz, hata olarak görünür.

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
- Gerçek lisanslı corpus ve fiziksel Android oturumu henüz sağlanmadı; kabul kayıtları gelmeden P2.6-B/C tamamlandı denemez.
- Cihaz telemetrisi gerçek kullanıcı PDF'leriyle birleştirilmeden önce mahremiyet ve izin doğrulaması gerektirir.
