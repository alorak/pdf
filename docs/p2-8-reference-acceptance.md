# P2.8 — ICCBased CMYK, 16-bit JPEG2000 ve bağımsız piksel referansı

## Kapsam
- Gerçek **16-bit unsigned grayscale JPEG2000** (`/JPXDecode`, JPEG2000 SIZ: precision=16), lossless OpenJPEG 2.5.4.
- Orijinal **ICC v2 CMYK output profile** (`/ICCBased /N 4`, 4 giriş kanalından XYZ PCS'ye 3×3×3×3 CLUT); gerçek dört kanallı `FlateDecode` raster.
- Her PDF'nin 1/2/3 sayfalarında 64×64=**4.096 kaynak pikseli** bağımsız referansla karşılaştırma.
- Bağımsız referans: 16-bit J2K için özgün 16-bit kaynak piksel dizisinden 8-bit sRGB grayscale; ICC için LittleCMS2→sRGB dönüştürülmüş özgün 8×8 renk yamasının 64×64 tam matrisi.
- **Olumsuz kontrol:** ICC profilinin C ve M dönüşüm eşlemesi kasıtlı olarak farklıdır. Basit DeviceCMYK fallback kullanılırsa beklenen görüntüden ortalama >45 RGB kanal farkı oluşur; boş/sadece açılmış PDF kabul edilemez.

## Dosyalar
- `scripts/p2-8-advanced-fixtures.mjs` orijinal 16-bit J2K, 744B ICC CLUT, sıkıştırılmış CMYK raster ve bağımsız altın referans.
- `scripts/p2-8-pixel-diff.mjs` tam piksel karşılaştırması: MAE, RMSE, en büyük tek-kanal sapması, bozuk piksel yüzdesi, alpha kontrolü.
- `tests/p2-8-advanced-codecs.test.mjs` kod akışı imzaları, ICC kanal sayısı/sınıfı, PDF operatörleri ve sahte DeviceCMYK fallback'e karşı olumsuz kontrol.
- `e2e/p2-8-reference.spec.mjs` üretim derlemesinde Playwright Chromium; 100% zoom × DPR1 ile 64×64, gerçek canvas RGBA ve tüm bağımsız kaynak RGB referansını karşılaştırır.
- `scripts/verify-p2-8-reference.mjs` iki codec × 3 sayfa × 4096 piksellik kanıt kapısı.
- `playwright.reference.config.mjs` HMR kullanılmadan, production preview; diğer P2.6/2.7 kanıtları silinmez.
- `validate.yml` PR başına otomatik; dış ağdan belge indirmez, gerçek üçüncü taraf ICC profilini veya kullanıcı PDF'sini depoya koymaz.

## Karşılaştırma yöntemi
- RGB kanalları 8-bit **sRGB görüntüleme uzayında** karşılaştırılır. 16-bit kaynak JPEG2000 8-bit hedefe dönüştürüldüğünden bit-derinliği kaybı beklenir.
- Karşılaştırma **görüntü kaynak çözünürlüğünde birebir** yapılır; canvas genişliği/yüksekliği 64×64 değilse testin geçmesi yasaktır. Kontrol edilen piksel sayısı 4.096'dır; yalnızca 4 renk merkezi kontrol edilmez.
- Tahammül sınırları açıkça tanımlıdır ve tanılama JSON'unda ölçülür. JPEG2000 ve LittleCMS/qcms renk motorları farklı yuvarlama/işleme yapabileceğinden mutlak byte eşitliği başlangıç varsayımı değildir.
- Kişisel belge veya ekran görüntüsü test kanıtlarına dahil edilmez; yalnız metadata/hash/hata metrikleri arşivlenir.

## JBIG2 genişletme — 4/4 geçti

Kaynak: Mozilla PDF.js test PDF sarmalayıcıları, immutable commit `0a4153349dc473ba950fc17941c5ca7eda43c1de`; özgün Nico Weber / SerenityOS BSD-2-Clause JBIG2 test akışları. Yalnızca izin/onay ve SHA-256 doğrulaması sonrası indirilen örnekler; PDF ve PPM referans görselleri CI artefact'ına eklenmez.

**Bağımsız referans:** Poppler `pdftoppm -r 72` ile render edilen ilk sayfanın tüm 399×400 = **159.600 pikseli**, Chromium/PDF.js tarafından %100 ölçek/DPR1 ile render edilen tüm piksellerle **1:1** eşleştirilir. 32×32 grid ayrıca regresyon metriği olarak korunur; başarı için her pikseli kapsayan karşılaştırma zorunludur. Gri tonlama MAE ve foreground F1 hesaplanır.

| JBIG2 varyantı | SHA-256 | Tam piksel MAE (255 üzerinden) | F1 |
|---|---|---:|---:|
| Symbol refinement | `5e2ae6875ea8d0f1d2aecfaeff6aeac6acb8ff76eadef42e5f0fa7fc76c818b0` | 1,1091 | 0,9677 |
| Stripe | `b1e3c558a34537aeace4334cbcea6c42f82f4b815c8232df462ee8956e6faf82` | 1,1091 | 0,9677 |
| Symbol Huffman | `af8f3c70dbe1c0f0da090c829cea6da5015ed9978dd13fd2d0b9b44ac715db2b` | 1,1428 | 0,9668 |
| Halftone 10bpp | `8a4577a1cdbdf342e2a61e18a239423452355c13733075af76fcd008f12eac5f` | 1,1091 | 0,9677 |

**Kanıt:** [P2.8 full-pixel JBIG2 #41327204240](https://github.com/alorak/pdf/actions/runs/41327204240) — 4/4 başarı. Bütün testlerde alfa hatası 0, beklenmeyen JavaScript/render hatası 0.

## ICC ve JPEG2000 tam-piksel kabul sonuçları

**Kanıt:** [PR standart CI #41327204172](https://github.com/alorak/pdf/actions/runs/41327204172) — `validate` ve `browser-e2e` başarılı.

| Biçim | Referans SHA-256 | Her bir sayfada karşılaştırılan piksel | MAE / kanal | Maksimum kanal hatası |
|---|---|---:|---:|---:|
| 16-bit lossless JPEG2000 | `02537441b1729381b0e56c0aa11432908fc422df2e637ba4807d65a620593ceb` | 4096 | 0,2522 | 1 |
| ICCBased CMYK | `63223e0ebb77c7a124cc38350283015049e9d0cf16f42136bc99ec0de80c4d82` | 4096 | 2,2969 | 16 |

Her iki PDF'de de 3 sayfa test edildi. ICC dönüşümü özel test profilinde DeviceCMYK fallback'den kasıtlı olarak farklıdır; negatif kontrol normal CMYK varsayımının yanlış pozitif oluşturmasını önler. Kaynak ve referanslar SHA-256 ile sabittir; fiziksel baskı renk doğruluğu sertifikası değildir.

## Tekrar çalıştırma

```bash
npm ci
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
npm run build
node scripts/check-pages.mjs
npm run test:reference:browser
node scripts/verify-p2-8-reference.mjs
```

JBIG2 harici Poppler testleri varsayılan CI'da **otomatik değildir**; GitHub Actions → `P2.8 manual extended JBIG2 Poppler reference parity` workflow'uyla kullanıcı istediğinde çalıştırılır. Bu test upstream PDF'leri sabit revizyon/hash ile doğrular ve referans görselleri yalnız geçici koşu ortamında oluşturur.

## Sınırlar
Bu profil **bilerek hazırlanmış test CLUT'udur**, FOGRA veya gerçek baskı proofing profili değildir. Bir örneğin geçmesi tüm ICC render intent/black-point compensation/overprint davranışını kanıtlamaz. Tek 16-bit J2K örneği JPEG2000 lossy, 16-bit RGB/alpha veya ICC JPX alt profillerini bütünüyle kapsamaz. JBIG2 bağımsız renderer referansı bulunan her varyant ayrı ayrı raporlanmalıdır. Fiziksel Android ve 300/600 DPI gerçek sayfa corpus'u açık konulardır.
