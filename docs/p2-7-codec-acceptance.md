# P2.7 — JPEG2000/JPX, JBIG2 ve DeviceCMYK görüntü doğruluğu

## Temel ayrım

- **JPX/JPEG2000**: `/Filter /JPXDecode`; 64×64 gerçek, lossless OpenJPEG 2.5.4 kod akışı içeren orijinal dört renkli resim.
- **CMYK**: `/ColorSpace /DeviceCMYK` + gerçek 4 kanallı, `/FlateDecode` ile sıkıştırılmış raster; bu **CMYK testidir ama ICCBased/proofing testi değildir**.
- **JBIG2**: `/Filter /JBIG2Decode` içeren, SerenityOS/Nico Weber kaynaklı BSD-2-Clause testlerinden Mozilla PDF.js test deposuna aktarılan dosyalar. Kaynak/kod akışı lisans ve hash ile doğrulanmalı.

### Neden formatı adlandırmak yetmez?

Önceki Flate/RGB dosyasını `.jp2` veya `.jbig2` diye yeniden adlandırmak decoder'ı işletmez. Yeni test, JPX kod akışının `FF4F FF51` imzalarını, CMYK resmin 4 kanallı gerçek bytes/paletini, JBIG2'nin `/JBIG2Decode` filtresini bağımsız doğrular.

PDF.js `getOperatorList()` görüntü boyama komutlarını doğrular ancak görüntünün **doğru renklerle çizildiğini** tek başına kanıtlamaz. Bu nedenle production Chromium E2E testinde dört renk ayrı ayrı canvas üzerinden örneklenir.

## Kalıcı CI

- `scripts/p2-7-codec-fixtures.mjs`: orijinal, tekrarlanabilir 3 sayfalık JPEG2000 ve CMYK test PDF'lerini bellekte üretir; PDF'ler repoya konmaz.
- `tests/p2-7-codec-fixtures.test.mjs`: veri imzası, çözülmüş CMYK ham raster, xref/operatör, metin katmanı yokluğu, deterministik SHA.
- `e2e/p2-7-codec.spec.mjs`: gerçek PDF yükleme, 1/2/3 sayfalarda palet doğruluğu, WASM asset HTTP 200, JS/render hata kontrolü.
- `playwright.codec.config.mjs`: Vite production build+preview; dev sunucu HMR reload'u test sonucu olarak yanlış yorumlanmaz.
- `scripts/verify-p2-7-codecs.mjs`: eksik rapor, eksik renk, decoder HTTP hatası, SHA biçim hatası varsa kabulü reddeder.
- `.github/workflows/validate.yml`: her PR'da production build sonrası JPX ve CMYK browser testlerini çalıştırır.

## JBIG2 test kaynağı

PDF.js upstream test kaynakları: https://github.com/mozilla/pdf.js/tree/master/test/pdfs ; ilgili JBIG2 bit akışlarının orijinali SerenityOS: https://github.com/SerenityOS/serenity/tree/master/Tests/LibGfx/test-inputs/jbig2 . Orijinal test örneklerinin yazarı Nico Weber BSD-2-Clause kullanımına izin vermiştir: https://github.com/mozilla/pdf.js/issues/20529 . Dosyaların içinde kullanılan özel format özellikleri (MMR, arithmetic/generic, halftone) ayrı raporlanır.

JBIG2 örnekleri sabit upstream commit, Git blob SHA-1 ve **SHA-256** ile doğrulanır. İndirme ve render testleri yalnız isteğe bağlı `.github/workflows/p2-7-jbig2-acceptance.yml` GitHub Actions işinde çalışır; sürekli CI için ağ bağımlılığı yoktur. Gerçek `/JBIG2Decode` filtresi ve siyah/beyaz canvas piksel örnekleri şarttır.

## Sınırlar

JPEG2000/JPX çözücüsünün RGB lossless akışı, tüm JPEG2000 progression/lossy/16-bit/alpha profillerini kapsamaz. `/DeviceCMYK` tek başına ICC renk kalibrasyonunu veya baskı proofing'i garanti etmez. JBIG2 başarıları seçilen bit akışlarıyla sınırlıdır. Decoder içeriği için kullanıcı dosyaları veya üçüncü taraf belgeler sunucuya yüklenmez. Fiziksel Android GPU/OS bellek baskısı kapsam dışındadır.

## Kabul sonuçları — 1 Kasım 2026

**Durum: 5/5 temel codec senaryosu başarılı.**

- [Standart CI #41314866202](https://github.com/alorak/pdf/actions/runs/41314866202): `validate` ve `browser-e2e` başarılı.
- [Gerçek JBIG2 5 senaryo kabulü #41314866247](https://github.com/alorak/pdf/actions/runs/41314866247): `P2_7_CODEC_ACCEPTANCE_PASSED` başarılı.
- Chromium production preview'da bağımsız PDF açma, page navigation ve RGBA canvas palet testleri; ayrıca OpenJPEG/JBIG2 ve renk yönetimi statik kaynaklarından HTTP 200 yanıtları.

| Biçim | Sayfalar | PDF bayt | SHA-256 | Pixel doğrulaması |
|---|---:|---:|---|---|
| Gerçek JPX/JPEG2000 kod akışı | 3 | 1578 | `e6659ccf18c8f103a6a12ccf5c1457a7103a24a0ef33dbc043dd73ac07f2d18b` | R/G/B/beyaz, 3 sayfada |
| DeviceCMYK / Flate | 3 | 1082 | `920765795a3d4c413b46eb8668faede7c26479cacf1a0807170c717133b972f7` | Cyan/magenta/sarı/siyah, 3 sayfada |
| JBIG2 MMR | 1 | 1122 | `32b70aeb63ca60f60c25c2d797b8f5af16043d66dce1bcb0b0f08a78acee95ed` | Gerçek siyah-beyaz |
| JBIG2 arithmetic/custom AT | 1 | 1051 | `9be6eb11af2e4078eb209cbf680bb415960f2275f7e120660d22e7edc09e2ede` | Gerçek siyah-beyaz |
| JBIG2 halftone | 1 | 1287 | `c276d6cbc7d0709af448b532232c9f8b92424859974b38feaef0d8983bd6d7c0` | Gerçek siyah-beyaz |

JBIG2 upstream: Mozilla PDF.js test/pdfs, commit `0a4153349dc473ba950fc17941c5ca7eda43c1de`; git blob hash'leri sırasıyla `b7099a499822fff95d90b9bdc006157242a1b912`, `b18bc21793a85179c445db8ef42a33a5ee2b4407`, `b05df7f1c590d3819382dbef7fa73857bb26d59e`. Örneklerin orijinal akışları için Nico Weber / SerenityOS BSD-2-Clause kaynak atfı yukarıdadır. Kaynak PDF'ler depoda tutulmaz.

### Nasıl tekrar edilir?

```bash
npm ci
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
npm test
npm run build
node scripts/check-pages.mjs
npm run test:codec:browser
node scripts/verify-p2-7-codecs.mjs
```

JBIG2 kabulü: GitHub Actions → **P2.7 manual genuine JBIG2 codec acceptance** → *Run workflow*. Bu manuel iş sabit Git commit ve SHA-256'larla üç örnek PDF'yi indirir, **beş senaryoyu** yeniden çalıştırır ve yalnız küçük JSON sonuçları arşivler.

### Ölçümün sınırı

Üç JBIG2 varyantı ve tek lossless RGB JPX kod akışı tüm JBIG2/JPEG2000 standardı değildir. CMYK renk örneklemesi gerçek ICC baskı eşlemesini veya cihaz kalibrasyonunu ispatlamaz. Testler tüm piksel matrisi için altın referans görsel karşılaştırması yapmaz; dört palet rengi veya siyah-beyaz alanların bulunmasını doğrular. Düşük RAM ve mobil GPU kontrolü ayrı kalır.
