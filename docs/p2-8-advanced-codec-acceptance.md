# P2.8 — ICCBased CMYK, 16-bit JPEG2000 ve piksel referans testi

## Amaç ve kanıt seviyeleri

- **ICC-CMYK:** Dört kanallı gerçek PDF `/ICCBased` renk uzayı, `/N 4`, `/Alternate /DeviceCMYK` ve PDF içine gömülü özgün ICC v2 A2B0 LUT profili. Haricî/telifli ICC dosyası depolanmaz.
- **16-bit JPEG2000:** 64×64 gerçek kayıpsız J2K bit akışı, `/JPXDecode`, `/BitsPerComponent 16`, tek kanallı dört gri ton (0, 21845, 43690, 65535). 8-bit JPEG'i yeniden adlandırma değildir.
- **Golden görüntü:** Fixture'ın PDF kodundan bağımsız oluşturulan 64×64 RGB ham referans raster. Referans için SHA-256 kanıtı. Profilin dört renk sonucu LittleCMS 2.19 ile bağımsız olarak doğrulanmıştır.
- **Tam piksel testi:** Chromium production build/preview, DPR=1 ve %100 zoom ile her sayfada 64×64 canvas ve **her pikselin 3 RGB kanalı ve alfa kanalı** karşılaştırılır. 4096 piksel x 3 sayfa x 2 örnek = 24.576 piksel ve 73.728 RGB karşılaştırması; tolerans 12/255 kanaldır ve sıfır mismatched pixel gerekir.
- **JBIG2:** P2.7'deki üç upstream gerçek kod akışına ek refinement, symbol refinement, kombinasyon ve grid varyantları. Gerçek kaynak PDF'lerinin Git commit/hash kilidi ve Chromium tarayıcıdaki siyah/beyaz raster kontrolü sürdürülür. Bağımsız JBIG2 golden tam piksel doğrulaması ayrıca kanıt gerektirir.

## Test komutları

```bash
npm ci
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
npm test
npm run build
node scripts/check-pages.mjs
npm run test:codec:golden
node scripts/verify-p2-8-golden.mjs
```

Kalıcı PR CI yalnız özgün, offline 16-bit JPX ve ICC-CMYK testlerini çalıştırır. JBIG2 dış kaynak doğrulaması ayrı manuel workflow'da tutulur; kaynak PDF'ler depoya/artefact'a girmez.

## Sınırlar

- Bu ICC profili gerçek ticari baskı profili değil, bu test için oluşturulmuş **geçerli dört kanallı LUT profili**. ICC v4, farklı rendering intent, spot colors ve gerçek SWOP/FOGRA baskı cihazlarını temsil etmez.
- Tek lossless grayscale 16-bit JPX akışı tüm JPEG2000 profilleri (RGB 16-bit, alpha, lossy, progression modes, 16-bit CMYK) değildir.
- Kanallarda ±12/255 toleranslı piksel karşılaştırması yapılır; bitwise özdeşlik iddia edilmez. Fiziksel Android donanımı ve düşük RAM kapsam dışıdır.
- Kaynak ve referans hash değerleri ile sonuçlar ancak CI doğrulaması sonrasında bu belgeye kabul kanıtı olarak eklenir.
