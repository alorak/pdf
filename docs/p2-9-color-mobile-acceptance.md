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

## Kabul statüsü — gerçek ölçümler

[PR standart CI #41328775166](https://github.com/alorak/pdf/actions/runs/41328775166) hem `validate` hem `browser-e2e` olarak başarılı.

| Örnek | PDF SHA-256 | Referans SHA-256 | Karşılaştırılan piksel | MAE / maks RGB kanal hatası |
|---|---|---|---:|---|
| 16-bit RGB JPEG2000/JPX | `071b7e9f1a705047fae87d1cdb8f9ab706e5f556f905b4da3696e9aa01d92c6f` | `ab0ab8056c481496a1bf3886886fb69e3b82c2d6a07334be5500173bbf1b990a` | 4096 | **0 / 0** |
| ICC v4.3 RGB | `08c4134af89d5c97a01fcec62a60eafbd16927b8f9db57818149a90d3fe324c1` | `cadd6bc67df099ec9c1773273d6eeefc2958eb5ee41441fc2cf2a2519f65720f` | 4096 | **0 / 0** |

İki testte de gerçek `openjpeg.wasm`/`qcms_bg.wasm` çözücüsü HTTP 200 ve bağımsız tam-piksel karşılaştırma başarılıdır. Bu özel test görüntülerinde tam eşleşme olması, gerçek cihaz baskı renklerinin tümünde bit eşitliği anlamına gelmez.

### Fiziksel Android saha adımları

Cihazda Android SDK Platform Tools (adb) USB/Wi-Fi hata ayıklama için yetkili olmalı; gerçek Chrome kurulu olmalı. Kendi kontrolünüzdeki ve izinli 25–100 MiB test PDF'siyle:

```bash
npm run android:snapshot -- baseline
# Chrome'da test PDF'si aç (gerçek cihazda)
npm run android:snapshot -- large-open
# 1, orta ve son sayfalara atla; yakınlaştır ve küçük resimleri gez
npm run android:snapshot -- navigate
# 20 çalışma alanına geçiş ve geri dön
npm run android:snapshot -- workspace
# Chrome'u manuel olarak kapat/aç; aynı PDF'yi tekrar görüntüle
P2_ANDROID_TAB_RELOADED=false P2_ANDROID_UI_RESPONSIVE=true npm run android:snapshot -- reopen
npm run android:snapshot -- report
```

İsteğe bağlı `P2_ANDROID_SERIAL` yalnız yerel adb seçimi içindir, rapora **yazılmaz**. Her snapshot'ta `/proc/meminfo`, Chrome `dumpsys meminfo` ve izin varsa `/proc/pressure/memory` alanları sayısal ve sınırlı biçimde kaydedilir. Gerçek Android emülatörü saha testi yerine geçmez; emülatör raporunu kabul etmeyen kontrol vardır. Sistem bellek erişimi veya Chrome PSS eksikse sayı **null** olarak kalır. Kullanıcının ekrandaki yeniden yükleme gözlemi ADB ile otomatik ispatlanmış sayılmaz. Cihaz ve kayıt yokken hiçbir Android PSS/LMK verisi uydurulmaz.

### Gerçek FOGRA/SWOP profil testi

`P2.9 one-off official FOGRA51/SWOP profile acceptance` manuel/test işinde iki profili yalnız `registry.color.org` kaynağından alır, CMYK ICC header / hash doğrular, LittleCMS2 referansına göre 64×64 tam-piksel RGB farkı ölçer. Profil dosyası ya da PDF içeren ikili artefact tutulmaz. ICC Registry'deki FOGRA51 dağıtım kısıtı nedeniyle otomatik genel PR testlerine dosya eklenmez.

**İki gerçek baskı profili de doğrulandı.** [ICC Registry tam kabul koşusu #41329644206](https://github.com/alorak/pdf/actions/runs/41329644206) — tüm adımlar başarılı, yalnız sayısal JSON kanıt arşivlendi.

| Resmî ICC profil | Bağlı renk standardı | SHA-256 (profil) | ICC biçim sürümü | 4096 piksel MAE (0–255) | Maksimum RGB kanal farkı |
|---|---|---|---:|---:|---:|
| `PSOcoated_v3.icc` | FOGRA51 | `c30ad2c01e8f93135ec7682c535e0a81bc2d177c301e196376c5f5838b5c8e86` | 2 | 0,5833 | 2 |
| `SWOP2006_Coated3v2.icc` | CGATS TR003 / SWOP | `27dc90dbeb399b76c0f91a6b387fe30c38939f034d2500712f3c43094be15e3b` | 2 | 0,9167 | 4 |

**Sürüm ayrımı:** PSOcoated_v3 adı yeni profil ailesini ifade eder; dosyanın ICC biçim sürümü **v2**. SWOP2006 da ICC v2. ICC **v4 biçimi** yukarıdaki özgün testte ayrıca doğrulanmıştır.

Profillerin tam boyutları sırasıyla 2.195.228 ve 2.747.952 bayttır. Her ikisi `https://registry.color.org/profile-registry/profiles/` üzerinden hash kilidiyle indirilmiştir. Referans görüntü SHA-256: FOGRA51 `ec660533dd293ff33340519fe4fdd5ed2f1176fb598450d05a57271f6785d830`; SWOP2006 `4b966666ae36e4ab3971b1d7267aa922efc6a681d56e39432a3078542169ff82`.

**Lisans:** ECI/Heidelberg FOGRA51 profilinde kullanım ve PDF'e gömme izinli, izinsiz yeniden dağıtım kısıtlıdır. Idealliance/X-Rite SWOP2006 kullanım/gömme/paylaşma izni verir, değiştirme ve satış kısıtlıdır. PDF veya ICC profil baytları repoya/CI artefact'ına konmamıştır. Testler yalnız indirilen gerçek profil, özgün CMYK örnekleri ve LittleCMS2 referansıyla sınırlıdır; cihaz kalibrasyonu veya prova baskı sertifikası değildir.

### Manuel yeniden çalıştırma

GitHub Actions → **P2.9 manual official FOGRA51/SWOP full-pixel parity** → *Run workflow*. Bu `workflow_dispatch` işi standart PR CI'ında indirme maliyeti yaratmaz ve iki resmî ICC profiline karşı 4096 RGB pikselin tamamını karşılaştırır.

**Android saha durumu:** Yetkilendirilmiş fiziksel Android/ADB oturumu henüz sağlanmadığı için **PSS, RSS, PSI ve LMK/OOM sahada ölçülmedi**. Yukarıdaki komutlar ve offline testler hazırdır; gerçek cihazla ölçüm gerekir.
