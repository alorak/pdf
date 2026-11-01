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

Temel kabulde kaynak ve SHA doğrulaması yapılmadan JBIG2 başarısı ilan edilmez. JBIG2 sample'ları için bağımsız testler `P2_7_JBIG2_FILES` ile manifest üzerinden yapılır; örneklerin hepsi için siyah ve beyaz raster örneklemeye dayanan başarım aranır.

## Sınırlar

JPEG2000/JPX çözücüsünün RGB lossless akışı, tüm JPEG2000 progression/lossy/16-bit/alpha profillerini kapsamaz. `/DeviceCMYK` tek başına ICC renk kalibrasyonunu veya baskı proofing'i garanti etmez. JBIG2 başarıları seçilen bit akışlarıyla sınırlıdır. Decoder içeriği için kullanıcı dosyaları veya üçüncü taraf belgeler sunucuya yüklenmez. Fiziksel Android GPU/OS bellek baskısı kapsam dışındadır.
