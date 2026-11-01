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
- `e2e/p2-8-reference.spec.mjs` üretim derlemesinde Playwright Chromium; 50% zoom × density2 ile 64×64, gerçek canvas RGBA ve tüm bağımsız kaynak RGB referansını karşılaştırır.
- `scripts/verify-p2-8-reference.mjs` iki codec × 3 sayfa × 4096 piksellik kanıt kapısı.
- `playwright.reference.config.mjs` HMR kullanılmadan, production preview; diğer P2.6/2.7 kanıtları silinmez.
- `validate.yml` PR başına otomatik; dış ağdan belge indirmez, gerçek üçüncü taraf ICC profilini veya kullanıcı PDF'sini depoya koymaz.

## Karşılaştırma yöntemi
- RGB kanalları 8-bit **sRGB görüntüleme uzayında** karşılaştırılır. 16-bit kaynak JPEG2000 8-bit hedefe dönüştürüldüğünden bit-derinliği kaybı beklenir.
- Karşılaştırma **görüntü kaynak çözünürlüğünde birebir** yapılır; canvas genişliği/yüksekliği 64×64 değilse testin geçmesi yasaktır. Kontrol edilen piksel sayısı 4.096'dır; yalnızca 4 renk merkezi kontrol edilmez.
- Tahammül sınırları açıkça tanımlıdır ve tanılama JSON'unda ölçülür. JPEG2000 ve LittleCMS/qcms renk motorları farklı yuvarlama/işleme yapabileceğinden mutlak byte eşitliği başlangıç varsayımı değildir.
- Kişisel belge veya ekran görüntüsü test kanıtlarına dahil edilmez; yalnız metadata/hash/hata metrikleri arşivlenir.

## JBIG2 genişletme
P2.7'de başarıyla doğrulanan MMR, custom arithmetic ve halftone'a ek olarak `symbol refine`, `stripe`, `symbol Huffman` ve `10bpp halftone` gibi bit akışları için Mozilla PDF.js pinned upstream kaynaklarını Poppler referansı ile karşılaştırma hedeflenmektedir. Üçüncü taraf dosyaları PR'da saklanmaz; hash ve lisans atfı zorunludur. Pixel-parity koşusu ayrı manuel işte tutulur.

## Sınırlar
Bu profil **bilerek hazırlanmış test CLUT'udur**, FOGRA veya gerçek baskı proofing profili değildir. Bir örneğin geçmesi tüm ICC render intent/black-point compensation/overprint davranışını kanıtlamaz. Tek 16-bit J2K örneği JPEG2000 lossy, 16-bit RGB/alpha veya ICC JPX alt profillerini bütünüyle kapsamaz. JBIG2 bağımsız renderer referansı bulunan her varyant ayrı ayrı raporlanmalıdır. Fiziksel Android ve 300/600 DPI gerçek sayfa corpus'u açık konulardır.
