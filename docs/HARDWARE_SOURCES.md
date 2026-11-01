# Реестр источников фурнитуры

Собран `scripts/hardware-sources.mjs` 2026-10-31. Таблица генерируется — руками не править.

Каждое число записи выписано с изображения страницы источника; чего нет на странице — `null` и строка «чего нет».
Изображения, чертежи и 3D производителей в продукт не идут: права не подтверждены (NOT_VERIFIED). Цены из каталогов не выписываются.

| Источник | Производитель | Вид | Страниц | Записей | Статусы | Свидетельства |
|---|---|---|---|---|---|---|
| `MANUFACTURER_CATALOGS/BLUM/raw/Каталог и техническое руководство 2024-2025 ru.pdf` | Blum | PDF | 758 | 318 | VERIFIED 285 · PARTIAL 30 · MISSING_DATA 2 · CONFLICT 1 | 22 файл(ов) |
| `MANUFACTURER_CATALOGS/HETTICH/raw/TA_KSP_ROW_2018_ru_RU.pdf` | Hettich | PDF | 2122 | 290 | PARTIAL 109 · VERIFIED 146 · CONFLICT 35 | 22 файл(ов) |
| `MANUFACTURER_CATALOGS/HAFELE/raw/КОМПАКТ 2025 (optimized).pdf` | Häfele | PDF | 176 | 532 | PARTIAL 401 · VERIFIED 19 · CONFLICT 108 · NOT_READABLE 4 | 35 файл(ов) |
| `MANUFACTURER_CATALOGS/HAFELE/raw/Большой каталог HAFELE. Мебельная фурнитура. Дизайн.pdf` | Häfele | PDF | 687 | 63 | VERIFIED 20 · CONFLICT 1 · PARTIAL 42 | 6 файл(ов); не выписывался: на этом этапе факты Häfele взяты из КОМПАКТ 2025 (1199 записей слоя 60); Большой каталог — следующий заход по ручкам и крепежу |
| `MANUFACTURER_CATALOGS/BOYARD/raw/Каталог функциональной фурнитуры BOYARD 2024.pdf` | BOYARD | PDF | 352 | 832 | PARTIAL 351 · VERIFIED 341 · MISSING_DATA 56 · CONFLICT 84 | 48 файл(ов) |
| `MANUFACTURER_CATALOGS/BOYARD/raw/Каталог лицевой фурнитуры BOYARD 2024.pdf` | BOYARD | PDF | 300 | 1806 | VERIFIED 1554 · PARTIAL 217 · CONFLICT 35 | 7 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/AXERA_RU.pdf` | DTC | PDF | 35 | 111 | PARTIAL 111 | 4 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/AXERA_X_RU.pdf` | DTC | PDF | 43 | 105 | PARTIAL 100 · CONFLICT 5 | 4 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/Pivot_Star.pdf` | DTC | PDF | 16 | 76 | PARTIAL 60 · CONFLICT 16 | 3 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/Stylish.pdf` | DTC | PDF | 18 | 106 | CONFLICT 35 · PARTIAL 71 | 3 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/Top_Stay.pdf` | DTC | PDF | 20 | 183 | PARTIAL 36 · VERIFIED 104 · CONFLICT 43 | 4 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/GFJ-K....HQJ900.pdf` | DTC | PDF | 1 | 3 | PARTIAL 3 | 1 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/GFL....KHQL.pdf` | DTC | PDF | 1 | 8 | PARTIAL 8 | 1 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/HQ....B01.pdf` | DTC | PDF | 1 | 21 | PARTIAL 17 · CONFLICT 1 · MISSING_DATA 3 | 2 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/HQ....T01.pdf` | DTC | PDF | 1 | 8 | CONFLICT 8 | 1 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/HQ....Z01.pdf` | DTC | PDF | 1 | 9 | PARTIAL 6 · MISSING_DATA 3 | 1 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/Брючница.pdf` | DTC | PDF | 2 | 5 | PARTIAL 5 | 1 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/Обувница_выдвижная.pdf` | DTC | PDF | 2 | 3 | PARTIAL 3 | 1 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/Обувница_на_10_полок.pdf` | DTC | PDF | 4 | 4 | PARTIAL 2 · MISSING_DATA 2 | 1 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/Зеркало.pdf` | DTC | PDF | 2 | 6 | CONFLICT 4 · PARTIAL 2 | 1 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/Ящики.pdf` | DTC | PDF | 2 | 9 | PARTIAL 9 | 1 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/TBM_11_25.zip` | DTC, Firmax, Alphalux (библиотека ТБМ) | библиотека БАЗИС | — | 627 | MISSING_DATA 76 · PARTIAL 551 | 3 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/Гардеробные системы COKA.zip` | Unihopper (серия COKA), библиотека МФ-Комплект | библиотека БАЗИС | — | 12 | MISSING_DATA 1 · PARTIAL 11 | 2 файл(ов) |
| `CATALOG_STAGING/HARDWARE_2026_10_30/MF Посудосушители Var3e.zip` | МФ-Комплект (производитель изделия не назван) | библиотека БАЗИС | — | 7 | PARTIAL 7 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/01_hinge/БАЗИС BOYARD - МЕБЕЛЬНЫЕ ПЕТЛИ (13-05-2026).zip` | BOYARD | библиотека БАЗИС | — | 100 | MISSING_DATA 100 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/02_ball_bearing_runner/БАЗИС BOYARD - ШАРИКОВЫЕ НАПРАВЛЯЮЩИЕ (13-05-2026).zip` | BOYARD | библиотека БАЗИС | — | 25 | MISSING_DATA 25 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/03_hidden_runner/БАЗИС BOYARD - НАПРАВЛЯЩИЕ СКРЫТОГО МОНТАЖА БИСЛАЙД (13-05-2026).zip` | BOYARD | библиотека БАЗИС | — | 67 | MISSING_DATA 67 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/04_drawer_system/БАЗИС BOYARD - СИСТЕМЫ ВЫДВИЖЕНИЯ СТАРТ (13-05-2026).zip` | BOYARD | библиотека БАЗИС | — | 202 | MISSING_DATA 202 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/05_pullout_basket/БАЗИС BOYARD - ВЫДВИЖНЫЕ КОРЗИНЫ (13-05-2026).zip` | BOYARD | библиотека БАЗИС | — | 30 | MISSING_DATA 30 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/06_dish_dryer/БАЗИС BOYARD - СУШКИ ДЛЯ ПОСУДЫ (27-06-2026).zip` | BOYARD | библиотека БАЗИС | — | 40 | MISSING_DATA 40 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/07_lift_mechanism/БАЗИС BOYARD - ГАЗОВЫЕ ЛИФТЫ (13-05-2026).zip` | BOYARD | библиотека БАЗИС | — | 33 | MISSING_DATA 33 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/08_handle_universal_formats/3ds Max КАСТОМНЫЕ РУЧКИ-СКОБЫ CUSTOMIZE - BOYARD (08-03-2025).zip` | BOYARD | библиотека БАЗИС | — | 0 | — | 0 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/09_handle_basis/БАЗИС BOYARD - РУЧКИ ПРОФИЛЬНЫЕ - BOYARD (13-05-2026).zip` | BOYARD | библиотека БАЗИС | — | 84 | MISSING_DATA 84 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/10_shelf_support/БАЗИС BOYARD - ПОЛКОДЕРЖАТЕЛИ - BOYARD (13-05-2026).zip` | BOYARD | библиотека БАЗИС | — | 36 | MISSING_DATA 36 | 1 файл(ов) |
| `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/11_leg/БАЗИС BOYARD - ОПОРЫ - BOYARD (13-05-2026).zip` | BOYARD | библиотека БАЗИС | — | 54 | MISSING_DATA 54 | 1 файл(ов) |

Итого источников 35, записей 5815.

## SHA-256

- `MANUFACTURER_CATALOGS/BLUM/raw/Каталог и техническое руководство 2024-2025 ru.pdf` — 527391645 Б, `79f421ffd13a785914fa902c54a47e1cbde13035502e127706b800cb61a7822f`
- `MANUFACTURER_CATALOGS/HETTICH/raw/TA_KSP_ROW_2018_ru_RU.pdf` — 387942734 Б, `5ee393ca0d7a47b483477267d5da0ae272711da515fb02550db0613e61f79d30`
- `MANUFACTURER_CATALOGS/HAFELE/raw/КОМПАКТ 2025 (optimized).pdf` — 58280366 Б, `34f3e03d7e059b15ca8a5da56b13b4da9ef9ab6181e842966aeb0acd0adb1fc3`
- `MANUFACTURER_CATALOGS/HAFELE/raw/Большой каталог HAFELE. Мебельная фурнитура. Дизайн.pdf` — 100156743 Б, `1045437465ecc06a5fa84e56224be83b0f12250cae72afc49134a672b68f7937`
- `MANUFACTURER_CATALOGS/BOYARD/raw/Каталог функциональной фурнитуры BOYARD 2024.pdf` — 49937318 Б, `6c00dc31abacdede5d572af5a81a3206220b9a8a64fab8f35ee5ef741fdba719`
- `MANUFACTURER_CATALOGS/BOYARD/raw/Каталог лицевой фурнитуры BOYARD 2024.pdf` — 47396983 Б, `d080336296acbe6640e8aec4fdc005f23ca40ae7b904adef80a8d686ba596f6c`
- `CATALOG_STAGING/HARDWARE_2026_10_30/AXERA_RU.pdf` — 20881072 Б, `ed2365cd36f0d378e077bfd9d22be8e38d275df67c9eadb0e26d109954a71dad`
- `CATALOG_STAGING/HARDWARE_2026_10_30/AXERA_X_RU.pdf` — 34491461 Б, `4b3065fb8aec5e872721a31029bf4a72b8a6caf6e579aff195660ebeda8f2e28`
- `CATALOG_STAGING/HARDWARE_2026_10_30/Pivot_Star.pdf` — 40801367 Б, `d563487a89db6ca36908ad5d5a35012b2e907d918a1aab0c960de8a342ac1104`
- `CATALOG_STAGING/HARDWARE_2026_10_30/Stylish.pdf` — 44740863 Б, `e7c8975a14d53b5fc3c3c6b605a35b284564eac7b3d513a8166bd5813245f4a2`
- `CATALOG_STAGING/HARDWARE_2026_10_30/Top_Stay.pdf` — 196662251 Б, `89cb3b1dcba3dde82bb8fad1e8bd737f6518e04e13be125e5039182f9bfb5211`
- `CATALOG_STAGING/HARDWARE_2026_10_30/GFJ-K....HQJ900.pdf` — 3502338 Б, `cc9c1e57989b5e7fa4e9c8c98fb1b150079a2ddaaccd5262809744f91677398e`
- `CATALOG_STAGING/HARDWARE_2026_10_30/GFL....KHQL.pdf` — 4373996 Б, `d8ae836a7a68e3da8e2b9164beb843ac11a504d21d4626e39cb9a28c36863fbb`
- `CATALOG_STAGING/HARDWARE_2026_10_30/HQ....B01.pdf` — 4294679 Б, `c8c84b235d019202e7da19daa46a5d2e174b75e0e7b815d6ffbfc334a1ba4c3f`
- `CATALOG_STAGING/HARDWARE_2026_10_30/HQ....T01.pdf` — 4074842 Б, `d1cd3ac95ba8d1a198650641097a22c6ec020151a5125c0ff8e6976444961488`
- `CATALOG_STAGING/HARDWARE_2026_10_30/HQ....Z01.pdf` — 3201712 Б, `21874e1f14f21733f98b80553d00d91e39ad0de03892a16351cea072f89abfdb`
- `CATALOG_STAGING/HARDWARE_2026_10_30/Брючница.pdf` — 4698059 Б, `c51b2dfeae820c63480e2a68d60a2bd2d3bad2288bff30b3a55073d1ef8d219a`
- `CATALOG_STAGING/HARDWARE_2026_10_30/Обувница_выдвижная.pdf` — 4023874 Б, `7c43bbde390fe4e719f9f9480065e323978f898b8994164cce2350f05cf15a7a`
- `CATALOG_STAGING/HARDWARE_2026_10_30/Обувница_на_10_полок.pdf` — 6452608 Б, `f43fde37ce9f62ce76c59fc6c55dc9fd604ababff674c2595dc267ecd340913c`
- `CATALOG_STAGING/HARDWARE_2026_10_30/Зеркало.pdf` — 4132748 Б, `a265bfbbd06280b556e8073be6909f3ab2a4f842ca0e20deb97298c7a065233a`
- `CATALOG_STAGING/HARDWARE_2026_10_30/Ящики.pdf` — 4025988 Б, `11fb4650f2f7a8e81952c43a5de3deb3318f473c357f9b4bcf1ad559ad7c4d08`
- `CATALOG_STAGING/HARDWARE_2026_10_30/TBM_11_25.zip` — 94750912 Б, `6e69ccefc97d6b735dfd20ac728b224e19980c2100c5be83b67075dc7b71d55f`
- `CATALOG_STAGING/HARDWARE_2026_10_30/Гардеробные системы COKA.zip` — 1257890 Б, `f14ec23f82025dc4ea9aed011d8e801929a74b55ee0a9c3dca803fb693f6ac1d`
- `CATALOG_STAGING/HARDWARE_2026_10_30/MF Посудосушители Var3e.zip` — 680219 Б, `c17680cdd781b31c62a38dc98185889b1651c7fa0df2a1fb4d39ccc6f8db7ef2`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/01_hinge/БАЗИС BOYARD - МЕБЕЛЬНЫЕ ПЕТЛИ (13-05-2026).zip` — 10329403 Б, `3490d568ba3fd8e9048c8ece5a25fa2df67d892374f2732508ccf3e343aeb545`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/02_ball_bearing_runner/БАЗИС BOYARD - ШАРИКОВЫЕ НАПРАВЛЯЮЩИЕ (13-05-2026).zip` — 522433 Б, `d18e2de5d95087b239db8266f56d4b386be02b429d5340e78c9fe65799a13e8d`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/03_hidden_runner/БАЗИС BOYARD - НАПРАВЛЯЩИЕ СКРЫТОГО МОНТАЖА БИСЛАЙД (13-05-2026).zip` — 12183844 Б, `a691bf1249c6d758c3335d3b704596f309564e4f74b77c271e7f0c88a37a4f08`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/04_drawer_system/БАЗИС BOYARD - СИСТЕМЫ ВЫДВИЖЕНИЯ СТАРТ (13-05-2026).zip` — 79321664 Б, `767e64a789dbc625a42bab7c54208ebee65c9af10f0f9e2344c34a9c92ed3a1d`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/05_pullout_basket/БАЗИС BOYARD - ВЫДВИЖНЫЕ КОРЗИНЫ (13-05-2026).zip` — 48921978 Б, `7809a81cb9114e60cb6849a07882ebed7bf10c0fdea09ee65d390db9ec3a5064`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/06_dish_dryer/БАЗИС BOYARD - СУШКИ ДЛЯ ПОСУДЫ (27-06-2026).zip` — 42131089 Б, `47f208b008e6dedd75f36ae70969fb8f88eda789f4bff6d92d4f3d9948a8d95f`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/07_lift_mechanism/БАЗИС BOYARD - ГАЗОВЫЕ ЛИФТЫ (13-05-2026).zip` — 4498137 Б, `e4727d4c6a95740ac0d9321075024ff7b24a7aa0080f601cc5d198d49d04db52`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/08_handle_universal_formats/3ds Max КАСТОМНЫЕ РУЧКИ-СКОБЫ CUSTOMIZE - BOYARD (08-03-2025).zip` — 39945086 Б, `0e27023279a0869add5fc46a634f6f48e6afe586a18fe21170cf37f1125ee777`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/09_handle_basis/БАЗИС BOYARD - РУЧКИ ПРОФИЛЬНЫЕ - BOYARD (13-05-2026).zip` — 855234 Б, `d2f38c09373dc7781620f4a17a6acea4351335edf64005d8b810ac3716fb2f99`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/10_shelf_support/БАЗИС BOYARD - ПОЛКОДЕРЖАТЕЛИ - BOYARD (13-05-2026).zip` — 1308040 Б, `59df10fa83e3efd576ad40a5bec74a5cc2e7f2b4d9f731adad96c457ab9ba445`
- `CATALOG_STAGING/04_IMPORTED_CAD_ASSETS/BOYARD/raw_downloads/11_leg/БАЗИС BOYARD - ОПОРЫ - BOYARD (13-05-2026).zip` — 3841235 Б, `97fed49c01cdde27551338f9e1a6a3ddea16ee1c18c429b3139d123b8a0110b8`
