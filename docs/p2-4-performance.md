# P2.4 — Büyük PDF pencereleme ve arama maliyeti

## Problem ve önceki baseline

P2.3 Chromium 141, Node 24, 1365×900 ortamında metin ağırlıklı 5.000 sayfalık PDF:
- ~65.997 DOM düğümü, ilk sayfa render'ı ~1,64 sn.
- Tam metin taraması ~13,36 sn.
- Son sayfaya atlama ~1,40 sn (gerçek canvas oluşturulması beklenerek).

## Uygulama

### P2.4-A — Ana sayfa penceresi

300 ve üzeri sayfada, **dikey + tüm sayfalar** modunda mantıksal sayfa geometrisi (boyut ve gap) korunurken yalnızca görüntü alanı + 1.300 px overscan'deki sayfa kabukları DOM'da oluşturulur. Ön ve arka boşluk alanları tam kaydırma yüksekliğini korur. Sayfa numarası, son sayfaya gitme, zoom, vurgular, yer imleri ve son okuma konumu mantıksal sayfa numarasıyla çalışır. Fiziksel sayfa canvas'ları da zaten mevcut sınırlı cache mekanizmasında tutulur.

- Sayfa elemanları ihtiyaç oldukça yaratılır; uzaklaşan elemanlar ve text/canvas katmanları bırakılır.
- `src/page-window.js` ofsetleri, aralık hesabını ve spacer yüksekliğini bağımsız test eder.
- Yatay akış ve yer-imi-only sayfa görünümü şimdilik önceki davranışı korur. Bu modlarda DOM hâlâ tüm gösterilen sayfaları içerebilir; kapsama sınırı açıkça bellidir.
- Küçük resim listesi de henüz sanallaştırılmamıştır. P2.4-A özellikle ana sayfa DOM'unu sınırlar.

### P2.4-B — Tam metin arama

`src/pdf-search.js` sayfaları sekizerli eşzamanlı bounded batch ile tarar, sonuçları her zaman fiziksel sayfa sırasına göre sunar. 24 MiB ile sınırlı **yalnızca RAM'de** PDF metin önbelleği aynı belgede sonraki aramaları yeniden PDF.js parse yapmadan yanıtlar. Belge kapandığında/değiştiğinde cache temizlenir; yeni sorgu/eski belge token iptali korunur. Arama ekranı yeniden çizme işlemi 180 ms'lik ilerleme eşiğiyle azaltılır.

## Kabul kriterleri

- `npm test`: sanal aralık geometrisi, zoom/gap, çok sayfalı eşzamanlı sıralı arama, cache, cancellation testleri.
- PR Chromium smoke: 1.000 sayfa, ilk/orta/son sayfa canvas, bookmark-only görünümü ve metin araması; DOM'da <=80 sayfa kabuğu.
- Gecelik full: 100/1000/5000 sayfa kapasite ve arama testleri, `scripts/verify-p2-3.mjs` ile model ve artifact kanıtı.
- Doğru sayfa/metin sonuçları ve canvas limitleri korunur; mevcut P0/P1 testlerinde regresyon yok.
- Ölçümler önceki P2.3 ile aynı browser/sunucu koşullarında alınır; hedef hızla değil doğrulukla kabul edilir.

## Sonraki adım

P2.4-C: Thumbnail listesinin sanallaştırılması ve yatay/bookmark modlarının ölçülmesi. P2.5: görüntü/tarama ağırlıklı büyük PDF fixture'ları. Bu belge P2.4-C henüz yapılmadıysa P2.4'ü tüm modlarda bitmiş olarak tanımlamaz.
