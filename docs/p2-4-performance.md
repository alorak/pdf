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

## Doğrulanmış P2.4-A/B kabulü (31 Ekim 2026)

**Başarılı tam CI:** [P2.4 full acceptance #41218323277](https://github.com/alorak/pdf/actions/runs/41218323277)
**Commit:** `5f3166445df8f23ebfc7c240cb1d9f8335d79481`
**Artifact:** `p2-4-full-baseline-41218323277` (8 dosya, 30 gün saklama).
**Ortam:** GitHub-hosted Linux, Node 24.22.1, Chromium 141.0.7390.37, 1365×900.
**Gate:** `P2_3_ACCEPTANCE_PASSED`; 3 model PDF.js profili, 3 kapasite profili, 3 arama profili ve 1.900 bağlantılı sayfa, model/JSONL/Markdown tutarlılığı doğrulandı.

| 5.000 sayfa ölçümü | P2.3 | P2.4 (doğrulanmış) |
|---|---:|---:|
| İlk gerçek canvas render süresi | 1641,2 ms | **1063,2 ms** |
| Son sayfayı gerçek canvas ile çizme | 1396,0 ms | **140,7 ms** |
| Tüm belge metin araması | 13358,0 ms | **2121,5 ms** |
| DOM node sayısı (kapasite testi) | 65997 | **56032** |
| Bağlı ana sayfa kabuğu | 5000 | **3** |
| Arama sonrası JS heap | 29,6 MiB | 38,4 MiB |

Bu rakamlar tek bir CI koşusundan gelir; donanım/browser sürümü sabit olsa bile istatistiksel performans garantisi değildir. Arama önbelleği tekrar eden sorguları hızlandırmak için RAM tüketimini artırır; yukarıdaki heap artışı bu ödünleşimin bir göstergesidir. Gerçekçi regresyon eşikleri için 3–5 tekrarlı baseline gereklidir.

Önceki aynı kodun ilk tam ölçüm koşusunda 5.000 sayfa araması 1995,3 ms, ilk sayfa 882 ms idi; son kabul tablosunda bütün kanıtları geçen koşunun değerleri esas alınmıştır.

**Sınırlar:** Büyük belge için ana sayfa penceresi dikey/tüm sayfalar moduyla sınırlıdır; thumbnail DOM'u, yatay görünüm ve bookmark-only listesi hâlâ sanallaştırılmamıştır. 5.000 sayfalık deterministik test ~1,74 MB metin ağırlıklıdır; görüntü ağırlıklı büyük PDF'leri temsil etmez.

## Sonraki adım

P2.4-C: Thumbnail listesinin sanallaştırılması ve yatay/bookmark modlarının ölçülmesi. P2.5: görüntü/tarama ağırlıklı büyük PDF fixture'ları. Bu belge P2.4-C henüz yapılmadıysa P2.4'ü tüm modlarda bitmiş olarak tanımlamaz.
