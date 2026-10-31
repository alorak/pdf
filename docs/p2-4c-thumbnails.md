# P2.4-C — Thumbnail DOM sanallaştırma

## Problem

P2.4-A/B sonunda 5.000 sayfalık PDF ana görüntüleyicisinde 3 sayfa kabuğu tutuluyordu ancak tüm küçük resim DOM'u oluşturuluyordu. 31.10.2026 doğrulanmış önceki baseline: 56.032 DOM düğümü, ilk sayfa 1.063 ms, arama 2.122 ms (farklı CI koşuları doğrudan SLA sayılmaz).

## Uygulama

- 300 ve üzeri thumbnail kaydında soldaki dikey veya alttaki yatay liste **viewport + overscan** şeklinde sanallaştırılır; ekran dışındaki thumbnail düğümleri ve canvas'ları serbest bırakılır.
- Gerçek kaydırma uzunluğu, `thumb-entry` eleman boyutları ve flex gap'i hesaba katan önce/sonra spacer'larla korunur.
- `src/thumbnail-window.js` pencere aralıklarının doğruluğunu bağımsız test eder.
- Yer imleri modunda liste az sayıda kayıt içeriyorsa yalnızca seçili yer imleri oluşturulur; 300+ kayıtlı yer imi için aynı pencereleme uygulanır.
- Bookmark sayfa atlama, fiziksel sayfa numarası, sidebar altta/solda, dokunmatik ve drag/drop olayları mevcut mantıksal sayfa kimliğini kullanır.
- Sayfa birleştirme ve sıralama işlemlerinde yalnızca görünür düğümler için olay dinleyicileri oluşturulur; diğer sayfaların metadata kayıtları değişmez.
- 5.000 sayfa gece koşusunda `thumbnailEntries <= 80` kabul kapısı ve eksiksiz kanıt kontrolü uygulanır.

## Sınırlar

- P2.4-C, **yatay ve dikey ana PDF akışı** için mantıksal sayfa ofsetleri ve pencereleme uygular. Yatay modun tam sayfa sayısı, kaydırma genişliği ve son sayfa gerçek canvas kabulü test edilir.
- Yalnızca yer imleri görünümünde 300 veya üzeri kayıt varsa ana sayfalar da seçili yer imi sırasına göre sanallaştırılır. 300 altı için sayfalar doğrudan oluşturulur.
- Gerçek cihazda 100 MB+ görüntü ağırlıklı PDF dosyaları P2.5 kapsamındadır.

## Kabul kaydı

CI sonucu ve 100/1.000/5.000 sayfa metrikleri doğrulandıktan sonra doldurulacaktır. Sonucu doğrulamadan P2.4-C tamamlandı ilan edilmez.
