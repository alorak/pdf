# P2.9 — ICC v4, gerçek FOGRA/SWOP, 16-bit RGB JPEG2000, fiziksel Android

Bu doküman gerçek testlerden gelen değerler eklendikçe güncellenir. Başarılı koşu olmadan bir biçim doğrulanmış sayılmaz.

## Otonom/orijinal corpus

- **ICC v4.3 RGB:** LittleCMS2 ile üretilmiş D65, sRGB primaries, gamma=1.0 RGB profili. `/ICCBased` `/N 3` ile PDF'e gömülü; profil 600 bayt ve özgün. LittleCMS2'dan bağımsız üretilen renk örneği referansı ile tam 4096 piksel sRGB testi. Normal RGB fallback'e kıyasla güçlü negatif kontrol.
- **16-bit RGB JPEG2000:** OpenCV/OpenJPEG 2.5.3 ile kayıpsız olarak sıkıştırılmış 64×64 3 bileşenli JPEG2000 JP2; J2K SIZ marker'da üç bileşenin `Ssiz=15` (unsigned 16-bit). `/Filter /JPXDecode` ile PDF'e yerleştirilir. Kaynak 16-bit RGB köşe renklerinden orijinal referans.
- Tam piksel kıyaslayıcı `scripts/p2-8-pixel-diff.mjs` yeniden kullanılır: 64×64 native sRGB8, DPR1, production Vite preview. Bu, baskı ölçümü veya cihaz ICC kalibrasyon sertifikası değildir.

## Gerçek baskı profilleri

- **FOGRA51 PSOcoated_v3.icc:** Avrupa Renk Girişimi/Heidelberg. ICC kayıt bilgisi: https://registry.color.org/profile-registry/PSOcoated_v3. ECI, kullanıma ve PDF'e gömmeye izin verir; izinsiz dağıtım/satış/değişiklik kısıtlıdır.
- **SWOP2006_Coated3v2.icc:** Idealliance/X-Rite. ICC kayıt bilgisi: https://registry.color.org/profile-registry/SWOP2006_Coated3v2. Kullanım/gömme/paylaşma izinli, değiştirme/satış kısıtlıdır.
- Testler CI sırasında resmî ICC Registry'den indirilip hash ve ICC header doğrulaması ile geçici dosyada tutulur; PDF/ICC referans baytları repo ve artefact'a eklenmez. ICC v4 özelliği bu baskı profillerinin ICC versiyonu ile karıştırılmamalıdır.

## Android saha protokolü

- Gerçek Android donanımı/Chrome olmadan bellek baskısı, LMK/OOM veya sekme geri-yükleme testi **tamamlandı olarak ilan edilmez**.
- ADB üzerinden yalnızca önceden izin verilmiş snapshot aşamalarında `dumpsys meminfo`, `/proc/meminfo` ve `/proc/pressure/memory` toplanır; seri numarası, URL veya kullanıcı PDF içeriği kayıt edilmez.
- Tipik aşamalar: `baseline`, `large-open`, `navigate`, `workspace`, `reopen`. ADB snapshot sonuçları JSON üzerinden kontrol edilir; p95 PSS veya sistem bellek baskısı cihaz/sürüm bazında karşılaştırılır.

## Kabul statüsü

Bu PR'ın normal CI ve gerçek profil manuel kabul koşuları tamamlandıktan sonra, burada hash/MAE/geçiş durumları belirtilecektir.
