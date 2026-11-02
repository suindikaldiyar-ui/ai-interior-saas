import type { TwinRole } from '@/types/catalog';

/**
 * ГОТОВЫЕ МОДЕЛИ ALDIK — реконструкции, которые уже построены и прошли приёмку в Studio (ТЗ 2026-11-02,
 * «REAL ACCOUNT 3D HARDWARE FIX»). Без three.
 *
 * Реестр 3D у каждой организации свой (`meta.twin` позиции + файл в Storage папки позиции): модели,
 * импортированные во временных организациях приёмки, в настоящий каталог не попадали. Здесь — те же
 * файлы (генераторы `scripts/twin-tandembox-asset.ts`, `scripts/twin-hinge-asset.ts` → `public/hardware-twins`)
 * с теми же ролями частей, монтажной точкой, источником и правом, что задавала приёмка; ставятся они тем
 * же путём, что ручной «Импорт CAD-фурнитуры» (`uploadTwin`: проверка габарита против изделия, sha256,
 * Storage, `meta.twin`) — и только по нажатию, со списком «что ляжет» до записи.
 *
 * Только артикулы, на которых модель проверена: аналогов и «похожих» здесь нет. Это визуальные
 * реконструкции по чертежам Blum, а не CAD производителя: присадка, раскрой и смета их не читают.
 */

export type ReadyTwin = {
  key: string;
  /** Артикул позиции каталога организации (`MFR-…`). */
  article: string;
  title: string;
  /** Файл в `public/` — тот же, что строит генератор. */
  url: string;
  fileName: string;
  /** Роли узлов файла — как у импорта приёмки. */
  roles: Record<string, TwinRole>;
  license: string;
  rightsNote: string;
};

const TB_LICENSE = 'собственная реконструкция ALDIK Studio по чертежу Blum (каталог 2024-2025, pdf 301 / печ. 297), не CAD производителя';
const TB_NOTE = 'геометрия построена ALDIK Studio: напечатаны 95,5 / 37,5 / 83,6 и позиции саморезов; форма профиля снята с чертежа масштабом';

export const READY_TWINS: ReadyTwin[] = [
  {
    key: 'tandembox-antaro-M-side-nl450',
    article: 'MFR-BLUM-378M4502SA',
    title: 'Царга TANDEMBOX antaro M, NL 450',
    url: '/hardware-twins/tandembox-antaro-M-side-nl450.glb',
    fileName: 'tandembox-antaro-M-side-nl450.glb',
    roles: { 'side-profile': 'moving' },
    license: TB_LICENSE,
    rightsNote: TB_NOTE,
  },
  {
    key: 'tandembox-antaro-runner-nl450',
    article: 'MFR-BLUM-576.4501M',
    title: 'Ходовая TANDEMBOX antaro, NL 450',
    url: '/hardware-twins/tandembox-antaro-runner-nl450.glb',
    fileName: 'tandembox-antaro-runner-nl450.glb',
    /* Каретка с роликами — между корпусным профилем и профилем царги (сечение pdf 301): половина хода. */
    roles: { 'cabinet-member': 'fixed', 'mount-screws': 'fixed', carriage: 'middle', rollers: 'middle' },
    license: TB_LICENSE,
    rightsNote: TB_NOTE,
  },
  {
    key: 'blum-clip-top-71B3550-175H3130',
    article: 'MFR-BLUM-71B3550',
    title: 'Петля CLIP top BLUMOTION 110°, накладная, с планкой 175H3130',
    url: '/hardware-twins/blum-clip-top-71B3550-175H3130.glb',
    fileName: 'blum-clip-top-71B3550-175H3130.glb',
    roles: {
      cup: 'moving',
      flange: 'moving',
      'cup-screws': 'moving',
      'cup-pins': 'moving',
      arm: 'fixed',
      'arm-head': 'fixed',
      damper: 'fixed',
      'mounting-plate': 'fixed',
      'plate-screws': 'fixed',
    },
    license:
      'собственная реконструкция ALDIK Studio по чертежам Blum (каталог 2024-2025, pdf 81 / печ. 77, pdf 154 / печ. 150, pdf 724 / печ. 720), не CAD производителя',
    rightsNote:
      'геометрия построена ALDIK Studio: напечатаны чашка, фланец, высота и длина плеча, планка и её отверстия; форма плеча и щёк шарнира снята с чертежа; оси звеньев — четырёхзвенник, подобранный под угол 110° и вхождение 12 мм',
  },
];

/** Готовая модель для артикула позиции; нет — `null` (модели нет, аналог не подставляется). */
export function readyTwinFor(article: string | null | undefined): ReadyTwin | null {
  return READY_TWINS.find((t) => t.article === article) ?? null;
}
