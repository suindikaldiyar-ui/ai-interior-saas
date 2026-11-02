import { DEFAULT_ALLOWANCES, type HardwareItem, type ProductionSettings } from '@/types/catalog';
import type { Module, Run } from '@/types/millwork';
import { moduleCarcassHeightMm, moduleDepthMm } from './fill';
import { bayEnvelope, bayLayout } from './bays';
import { fittingItemId, installedItem } from './fittings';
import { shopOf } from './shop';
import { runnerModelOf, type RunnerModel } from './runnerModel';
import {
  drawerBoxPlan,
  drawerBoxRulesOf,
  drawerProfileFor,
  systemInnerFrontPieces,
  type DrawerBoxPlan,
  type DrawerProfile,
} from './drawerBox';
import { drawerCellZones, drawerInnerZones } from './drawerGrid';

/**
 * КОМПЛЕКТ ЯЩИКА: НАПРАВЛЯЮЩАЯ + КОРОБ — ОДИН ОТВЕТ НА ЯЩИК (HARDWARE-01).
 *
 * У каждого ящика модуля — с фронтом на всю ширину (`fill.drawerHeights`)
 * или ящика отсека (R02A) — здесь ровно один ответ: короб рассчитан по
 * подтверждённому профилю (`box`) или ящик черновик и названо, чего не
 * хватает (`draft`). Раскрой режет короб отсюда, сцена рисует его
 * отсюда, присадка сверлит под направляющую отсюда, а замки выпуска
 * считают черновики отсюда — второй ветки «есть ли у ящика короб» нет.
 */

export type DrawerPlace = {
  /** Внутренний ящик за общим фасадом (A6): у него нет своего наружного фасада. */
  inner?: boolean;
  /** Ключ ящика — тот же, что у открывания в сцене: `<модуль>:drawer:<i>` или ИД ящика отсека. */
  key: string;
  bayId?: string;
  /** Проём ящика в свету и его левый край от левого края модуля, мм. */
  openingWidthMm: number;
  xFromMm: number;
  /** Зона ящика по высоте от дна корпуса, мм. */
  zoneFromMm: number;
  zoneToMm: number;
  /** Передняя плоскость короба по глубине: 0 — плоскость корпуса (накладной фасад), минус — за вкладным. */
  boxFrontZMm: number;
  usableDepthMm: number;
  overlay: boolean;
  slideItemId: string | null;
};

/**
 * ПЕРЕДНЯЯ ЧАСТЬ ВНУТРЕННЕГО ЯЩИКА СИСТЕМЫ (Blum TANDEMBOX antaro, печ. 298–299): позиции каталога
 * организации — передняя панель под раскрой, комплект держателей для высоты царги, ручка; место по высоте
 * — напечатанное у держателей (min 106 «с ручкой или без нее», 136 «с удобным доступом сверху»).
 */
export type InnerSystemFront = {
  panel: HardwareItem;
  holder: HardwareItem;
  handle: HardwareItem;
  /** Длина передней панели по раскрою: LW − вычет паспорта, мм. */
  panelLengthMm: number;
  panelDeductMm: number;
  spaceMinMm: number;
  spaceComfortMm: number | null;
};

export type DrawerKit =
  | { place: DrawerPlace; state: 'box'; profile: DrawerProfile; plan: DrawerBoxPlan; inner?: InnerSystemFront }
  /*
   * `profile` у черновика — когда профиль подтверждён и не хватает только ВЫСОТЫ зоны:
   * редактор фасадов по нему называет наименьшее место (`drawerZoneNeedMm`).
   */
  | { place: DrawerPlace; state: 'draft'; missing: string[]; profile?: DrawerProfile };

/**
 * СКОЛЬКО ЗОНЫ ПО ВЫСОТЕ НУЖНО КОРОБУ, мм — одна мера на черновик «короба не остаётся» и
 * на минимум места фасада в редакторе. У системы ящика царга покупная: её высоту не
 * подрезать — нужна царга плюс зазор снизу; у короба цеха — больше зазоров короба.
 */
export function drawerZoneNeedMm(profile: DrawerProfile): number {
  if (profile.system) return profile.system.sideHeightMm + (profile.gapBelowMm ?? 0);
  return profile.boxHeightGapMm;
}

/**
 * ТЫЛ ЗАДНЕЙ СТЕНКИ КОРОБА ОТ ПЕРЕДНЕЙ КРОМКИ КОРПУСА, мм — закрытый ящик. У
 * полного выдвижения с потерей 0 (Blum pdf 731) это и есть ход: задняя стенка
 * выдвинутого ящика встаёт на кромку корпуса.
 */
export function drawerRearFromFrontMm(kit: DrawerKit & { state: 'box' }): number | null {
  const back = kit.plan.pieces.find((piece) => piece.key === 'wall-back');
  return back ? -(kit.place.boxFrontZMm + back.z0) : null;
}

/** Направляющая ящика как механизм — с ходом по его коробу: одна функция на коробки сцены, ход у угла и приёмку. */
export function drawerRunnerOf(kit: DrawerKit, hardware?: Map<string, HardwareItem>): RunnerModel {
  const slide = kit.place.slideItemId ? hardware?.get(kit.place.slideItemId) : undefined;
  const rear = kit.state === 'box' ? drawerRearFromFrontMm(kit) : null;
  return runnerModelOf(slide ?? null, rear !== null ? { rearFromFrontMm: rear } : undefined);
}

/** Места ящиков модуля: классические сверху вниз, затем отсеки слева направо. */
export function drawerPlaces(unit: Module, run: Run, production: ProductionSettings = shopOf(run.production)): DrawerPlace[] {
  const out: DrawerPlace[] = [];
  const t = production.carcassMm;
  const allow = production.allowances ?? DEFAULT_ALLOWANCES;
  const fronts = unit.column ? [] : (unit.fill?.drawerHeights ?? []);
  if (fronts.length > 0) {
    const heightMm = moduleCarcassHeightMm(unit, run);
    const depthMm = moduleDepthMm(unit, run.zone, run.production);
    const slideItemId = fittingItemId(unit, 'slide');
    /* Ячейки (A4): у разделённого ряда проём столбца — между боковиной и перегородкой. */
    for (const zone of drawerCellZones(unit, heightMm, t)) {
      out.push({
        key: `${unit.id}:${zone.cell.leaf}`,
        openingWidthMm: zone.openingWidthMm,
        xFromMm: zone.xFromMm,
        zoneFromMm: zone.fromMm,
        zoneToMm: zone.toMm,
        boxFrontZMm: 0,
        usableDepthMm: depthMm - allow.shelfDepthMm,
        overlay: true,
        slideItemId,
      });
    }
  }
  /*
   * ВНУТРЕННИЕ ЯЩИКИ (A6): под верхом зоны своей ячейки, проём — проём ячейки, передняя плоскость
   * короба — плоскость корпуса (за наружным фасадом), направляющая — та же, что у модуля.
   */
  if (fronts.length > 0 && unit.fill?.drawerInners?.length) {
    const heightMm = moduleCarcassHeightMm(unit, run);
    const depthMm = moduleDepthMm(unit, run.zone, run.production);
    const slideItemId = fittingItemId(unit, 'slide');
    for (const zone of drawerInnerZones(unit, heightMm, t)) {
      out.push({
        key: `${unit.id}:${zone.leaf}`,
        inner: true,
        openingWidthMm: zone.openingWidthMm,
        xFromMm: zone.xFromMm,
        zoneFromMm: zone.fromMm,
        zoneToMm: zone.toMm,
        boxFrontZMm: 0,
        usableDepthMm: depthMm - allow.shelfDepthMm,
        overlay: true,
        slideItemId,
      });
    }
  }
  if (unit.fill?.bays?.length) {
    const layout = bayLayout(unit, bayEnvelope(unit, run, production));
    for (const bay of layout?.bays ?? []) {
      const stack = bay.drawerStack;
      if (!stack) continue;
      for (const drawer of stack.drawers) {
        out.push({
          key: drawer.id,
          bayId: bay.id,
          openingWidthMm: drawer.envelope.xToMm - drawer.envelope.xFromMm,
          xFromMm: drawer.envelope.xFromMm,
          zoneFromMm: drawer.slotFromMm,
          zoneToMm: drawer.slotToMm,
          boxFrontZMm: drawer.envelope.zToMm,
          usableDepthMm: stack.depthMm,
          overlay: false,
          slideItemId: stack.slideItemId,
        });
      }
    }
  }
  return out;
}

/**
 * КОМПЛЕКТЫ ЯЩИКОВ МОДУЛЯ.
 *
 * Без каталога фурнитуры (`hardware` пусто) и без правил короба цеха
 * короба нет ни у одного ящика — как до HARDWARE-01, и это черновик с
 * причиной. Зона, в которой после зазоров цеха короба не остаётся, —
 * тоже черновик с числом, а не короб нулевой высоты.
 */
export function moduleDrawerKits(
  unit: Module,
  run: Run,
  production: ProductionSettings = shopOf(run.production),
  hardware?: Map<string, HardwareItem>,
): DrawerKit[] {
  const rules = drawerBoxRulesOf(production.drawerBox);
  return drawerPlaces(unit, run, production).map((place): DrawerKit => {
    const verdict = drawerProfileFor({
      slide: place.slideItemId ? hardware?.get(place.slideItemId) : undefined,
      slideItemId: place.slideItemId,
      rules,
      openingWidthMm: place.openingWidthMm,
      usableDepthMm: place.usableDepthMm,
      overlay: place.overlay,
      /* Царги системы ящика (HW-04) — позиция на месте модуля. */
      drawerSide: hardware ? installedItem(unit, 'drawer_side', hardware, place.bayId) : null,
    });
    if (!verdict.ready) return { place, state: 'draft', missing: verdict.missing };
    /*
     * ВНУТРЕННИЙ ЯЩИК СИСТЕМЫ (Blum TANDEMBOX antaro, «Внутренний ящик – M», печ. 298–299): короб — те же
     * царги и ходовая, дно и задняя стенка по тем же формулам; спереди — передняя панель под раскрой
     * (LW − 132), держатели под высоту царги и ручка. Позиции — из каталога организации; чего нет — черновик
     * словами (что загрузить), а не короб без передней стенки за наружным фасадом.
     */
    if (place.inner && verdict.profile.system) return innerSystemKit(place, verdict.profile, hardware);
    const zoneH = place.zoneToMm - place.zoneFromMm;
    /*
     * ЦАРГА СИСТЕМЫ НЕ ПОДРЕЗАЕТСЯ (2026-11-02). План короба брал меньшее из высоты царги и
     * зоны: в низкой зоне металлическая царга 83,6 мм рисовалась и считалась ниже себя —
     * такой детали у производителя нет. Теперь это черновик с миллиметрами.
     */
    const sys = verdict.profile.system;
    if (sys && zoneH < drawerZoneNeedMm(verdict.profile)) {
      const need = drawerZoneNeedMm(verdict.profile);
      return {
        place,
        state: 'draft',
        profile: verdict.profile,
        missing: [
          `царге ${tenthWords(sys.sideHeightMm)} мм с зазором снизу ${tenthWords(verdict.profile.gapBelowMm ?? 0)} мм нужна зона ящика от ${tenthWords(need)} мм, а здесь ${tenthWords(zoneH)} мм — не хватает ${tenthWords(need - zoneH)} мм`,
        ],
      };
    }
    const plan = drawerBoxPlan(place.openingWidthMm, zoneH, verdict.profile);
    if (plan.heightMm <= 0) {
      return {
        place,
        state: 'draft',
        profile: verdict.profile,
        missing: [
          `зона ящика ${zoneH} мм, а зазоры короба цеха ${verdict.profile.boxHeightGapMm} мм — короба не остаётся`,
        ],
      };
    }
    return { place, state: 'box', profile: verdict.profile, plan };
  });
}

/** Позиция каталога организации по подвиду системы — той же серии, что царги; одна и та же при любом порядке. */
function systemPart(
  hardware: Map<string, HardwareItem> | undefined,
  subcategory: string,
  series: string | undefined,
  extra?: (item: HardwareItem) => boolean,
): HardwareItem | null {
  if (!hardware) return null;
  const found = Array.from(hardware.values())
    .filter((item) => item.hardware.category === 'drawer_system' && item.hardware.subcategory === subcategory)
    .filter((item) => !series || item.hardware.series === series)
    .filter((item) => (extra ? extra(item) : true))
    .sort((a, b) => a.article.localeCompare(b.article));
  return found[0] ?? null;
}

const LOAD_FACTS = '— загрузите сведения производителя: «Каталог» → «Фурнитура производителей» → «Загрузить»';

function innerSystemKit(place: DrawerPlace, profile: DrawerProfile, hardware?: Map<string, HardwareItem>): DrawerKit {
  const sys = profile.system!;
  const series = hardware?.get(sys.sideItemId)?.hardware.series;
  const of = series ? ` ${series}` : ' системы';
  const panel = systemPart(hardware, 'tandembox_inner_front_panel', series);
  const holder = systemPart(hardware, 'tandembox_inner_front_holder', series, (item) => Math.abs((item.hardware.dimensionsMm?.sideHeight ?? -1) - sys.sideHeightMm) < 0.05);
  const handle = systemPart(hardware, 'tandembox_inner_handle', series);
  const missing: string[] = [];
  if (!panel) missing.push(`в каталоге организации нет передней панели внутреннего ящика${of} (Blum Z31L1036A) ${LOAD_FACTS}`);
  if (!holder) missing.push(`в каталоге организации нет держателей передней панели внутреннего ящика для царги ${tenthWords(sys.sideHeightMm)} мм (для высоты M — Blum ZIF.71M0) ${LOAD_FACTS}`);
  if (!handle) missing.push(`в каталоге организации нет ручки внутреннего ящика${of} (Blum ZIF.80M5) ${LOAD_FACTS}`);
  if (!panel || !holder || !handle) return { place, state: 'draft', profile, missing };
  const dims = holder.hardware.dimensionsMm ?? {};
  const need = dims.innerSpaceMin;
  const deduct = panel.hardware.dimensionsMm?.frontPanelWidthDeduct;
  const raw = panel.hardware.dimensionsMm?.rawLength;
  if (!Number.isFinite(need)) missing.push(`у «${holder.name}» в каталоге нет необходимого места по высоте`);
  if (!Number.isFinite(deduct)) missing.push(`у «${panel.name}» в каталоге нет раскроя (вычета от внутренней ширины корпуса)`);
  if (missing.length > 0) return { place, state: 'draft', profile, missing };
  const zoneH = place.zoneToMm - place.zoneFromMm;
  const where = holder.hardware.source?.printedPage ? `, Blum, печ. ${holder.hardware.source.printedPage}` : '';
  if (zoneH < need!) {
    return {
      place,
      state: 'draft',
      profile,
      missing: [
        `внутреннему ящику с царгой ${tenthWords(sys.sideHeightMm)} мм нужно по высоте от ${tenthWords(need!)} мм (${holder.hardware.manufacturerArticle ?? holder.article}${where}: «мин. необходимое пространство для внутреннего ящика с ручкой или без нее»), а здесь ${tenthWords(zoneH)} мм — не хватает ${tenthWords(need! - zoneH)} мм`,
      ],
    };
  }
  const panelLengthMm = Math.round((place.openingWidthMm - deduct!) * 10) / 10;
  if (panelLengthMm <= 0 || (Number.isFinite(raw) && panelLengthMm > raw!)) {
    return {
      place,
      state: 'draft',
      profile,
      missing: [
        panelLengthMm <= 0
          ? `проём ${tenthWords(place.openingWidthMm)} мм: передняя панель по раскрою (LW − ${tenthWords(deduct!)} мм) не остаётся`
          : `передняя панель «${panel.name}» — ${tenthWords(raw!)} мм, а по раскрою нужна ${tenthWords(panelLengthMm)} мм (LW ${tenthWords(place.openingWidthMm)} − ${tenthWords(deduct!)}) — не хватает ${tenthWords(panelLengthMm - raw!)} мм`,
      ],
    };
  }
  const base = drawerBoxPlan(place.openingWidthMm, zoneH, profile);
  const plan = { ...base, pieces: [...base.pieces, ...systemInnerFrontPieces(base, place.openingWidthMm, panelLengthMm, zoneH)] };
  return {
    place,
    state: 'box',
    profile,
    plan,
    inner: {
      panel,
      holder,
      handle,
      panelLengthMm,
      panelDeductMm: deduct!,
      spaceMinMm: need!,
      spaceComfortMm: Number.isFinite(dims.innerSpaceComfort) ? dims.innerSpaceComfort! : null,
    },
  };
}

/**
 * ВНУТРЕННИЙ ЯЩИК СИСТЕМЫ СЛОВАМИ — что стоит спереди и хватает ли места: одни слова на редактор фасадов и
 * карточку комплекта. «С удобным доступом сверху» — напечатанное число, а не запрет: меньше — словами.
 */
export function innerSystemWords(kit: DrawerKit): string | null {
  if (kit.state !== 'box' || !kit.inner) return null;
  const f = kit.inner;
  const zoneH = kit.place.zoneToMm - kit.place.zoneFromMm;
  const art = (item: HardwareItem) => item.hardware.manufacturerArticle ?? item.article;
  const comfort =
    f.spaceComfortMm === null
      ? ''
      : zoneH >= f.spaceComfortMm
        ? `; доступ сверху удобный (от ${tenthWords(f.spaceComfortMm)} мм)`
        : `; удобного доступа сверху нет: для него нужно ${tenthWords(f.spaceComfortMm)} мм, здесь ${tenthWords(zoneH)}`;
  return (
    `передняя панель ${art(f.panel)} ${tenthWords(f.panelLengthMm)} мм (LW − ${tenthWords(f.panelDeductMm)}), держатели ${art(f.holder)}, ручка ${art(f.handle)}; ` +
    `место ${tenthWords(zoneH)} мм при min ${tenthWords(f.spaceMinMm)}${comfort}; высота и толщина панели не напечатаны — в 3D условно`
  );
}

function tenthWords(mm: number): string {
  return String(Math.round(mm * 10) / 10).replace('.', ',');
}

/** Сколько ящиков ряда — черновики и почему: для замков выпуска и экрана. */
export function drawerDrafts(
  runs: Run[],
  hardware?: Map<string, HardwareItem>,
  production?: ProductionSettings,
): { drawers: number; boxes: number; unconfirmed: number; reasons: string[]; unconfirmedWhy: string[] } {
  let drawers = 0;
  let boxes = 0;
  let unconfirmed = 0;
  const reasons = new Set<string>();
  /* Почему рассчитанный короб не выпускается (HW-04) — словами профиля, отдельно от причин черновиков. */
  const unconfirmedWhy = new Set<string>();
  for (const run of runs) {
    const shop = production ?? shopOf(run.production);
    for (const unit of [...run.modules, ...run.upperSegments.flatMap((segment) => segment.modules)]) {
      for (const kit of moduleDrawerKits(unit, run, shop, hardware)) {
        drawers += 1;
        if (kit.state === 'box') {
          boxes += 1;
          if (!kit.profile.confirmed) unconfirmed += 1;
          for (const why of kit.profile.releaseWhy ?? []) {
            reasons.add(why);
            unconfirmedWhy.add(why);
          }
        } else {
          for (const m of kit.missing) reasons.add(m);
        }
      }
    }
  }
  return { drawers, boxes, unconfirmed, reasons: Array.from(reasons), unconfirmedWhy: Array.from(unconfirmedWhy) };
}
