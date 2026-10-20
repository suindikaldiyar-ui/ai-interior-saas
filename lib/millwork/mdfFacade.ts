import type { FrontRelief, FrontSpec, MillworkOp, ReliefKind, Run } from '@/types/millwork';
import { RELIEF_BASES, frontOf, leafFrontOf, leafTitle } from './frontMaterial';
import { reliefLeafRefusal, reliefKindDef, type ReliefLeaf } from './facadeRelief';
import { NO_MILLING_ID, type MillingItem } from './milling';
import { hasFacade } from './applianceFront';
import { allModules } from './layout';
import { openablePartIds, runBoxes } from './cabinetBoxes';
import { shopOf } from './shop';

/**
 * МДФ-ФАСАД: ТИП, ПОКРЫТИЕ И ПАРАМЕТРЫ — ОПЕРАЦИЯМИ НАД ФАСАДОМ (P3D-MDF).
 *
 * Панель «МДФ фасады» не пишет в ряд сама: она собирает операции движка —
 * `set_front` для шкафа и всех фасадов, `set_leaf_front` для одной двери, —
 * и их применяет тот же `applyOps`, что и любую правку. Поэтому выбор
 * переживает пересборку, сохранение и перезагрузку и проходит те же
 * правила технологии (`frontConflict`) и проверку параметров.
 *
 * Правило одно: меняется ТОЛЬКО то, что выбрали. Тип рисунка не трогает
 * цвет, покрытие не трогает рисунок, правка двери не трогает соседнюю
 * створку и корпус.
 */

/** Покрытие крашеного МДФ: поверхность сцены, глянец/мат для чертежа и база. */
export type MdfCoating = 'supermatte' | 'matte' | 'satin' | 'gloss' | 'veneer';

/**
 * ПОКРЫТИЯ — ПОВЕРХНОСТИ ТАБЛИЦЫ `finishes` КАТАЛОГА (одно место чисел).
 *
 * Шероховатость и лак каждой берутся из файла каталога
 * (`materialFinishes`): суперматовый — Soft-touch 0.9 без лака, матовый
 * 0.8, полуматовый 0.45 с тонким лаком, глянцевый 0.15 с лаком 0.8. Своих
 * чисел у панели нет. Шпон — шпон по МДФ под полуматовым лаком.
 */
export const MDF_COATINGS: { key: MdfCoating; title: string; surface: string; finish: FrontSpec['finish']; base: FrontSpec['base'] }[] = [
  { key: 'supermatte', title: 'Суперматовый', surface: 'touch_sense', finish: 'matte', base: 'mdf_enamel' },
  { key: 'matte', title: 'Матовый', surface: 'matte', finish: 'matte', base: 'mdf_enamel' },
  { key: 'satin', title: 'Полуматовый', surface: 'satin', finish: 'matte', base: 'mdf_enamel' },
  { key: 'gloss', title: 'Глянцевый', surface: 'gloss', finish: 'gloss', base: 'mdf_enamel' },
  { key: 'veneer', title: 'Шпон', surface: 'satin', finish: 'matte', base: 'veneer_solid' },
];

/** Какое покрытие у фасада сейчас — по базе и поверхности; чужое — `null`. */
export function coatingOf(spec: FrontSpec): MdfCoating | null {
  if (spec.base === 'veneer_solid') return 'veneer';
  if (spec.base !== 'mdf_enamel' && spec.base !== 'mdf_film') return null;
  return MDF_COATINGS.find((c) => c.key !== 'veneer' && c.surface === spec.surface)?.key ?? (spec.finish === 'gloss' ? 'gloss' : 'matte');
}

/** Что меняется: рисунок, покрытие или модель каталога. Пустое поле — не трогать. */
export type FacadePatch = {
  /** Рисунок фасада; `null` — снять рисунок (ровный фасад). */
  relief?: FrontRelief | null;
  coating?: MdfCoating;
  /** Модель каталога (KIRA): её рисунок и ссылка на позицию. */
  model?: MillingItem;
};

export type FacadeTarget = 'fronts' | 'module' | 'leaf';

/**
 * ФАСАД ПОСЛЕ ПРАВКИ — из текущего, меняется только выбранное.
 *
 * Рисунок фрезеруют по МДФ и по цельной плите (`frontConflict`): если база
 * не та, она становится «МДФ в эмали», и это возвращается словами
 * (`note`) — человек выбирал рисунок, а не материал. Артикул чужой базы
 * (декор ЛДСП) при этом снимается: эмалью он не бывает; цвет остаётся тем,
 * что видно, пока не выбран RAL.
 */
export function facadeSpec(current: FrontSpec, patch: FacadePatch): { spec: FrontSpec; note: string | null } {
  let spec: FrontSpec = { ...current };
  let note: string | null = null;

  if (patch.coating) {
    const coating = MDF_COATINGS.find((c) => c.key === patch.coating)!;
    const baseChanges = spec.base !== coating.base && !(coating.base === 'mdf_enamel' && spec.base === 'mdf_film');
    spec = {
      ...spec,
      base: baseChanges ? coating.base : spec.base,
      surface: coating.surface,
      finish: coating.finish,
    };
    if (baseChanges) {
      /* Артикул прежней базы этой базой не бывает: декор ЛДСП не красят эмалью. */
      delete spec.itemId;
      note = `Фасад теперь «${coating.title}»: позиция прежнего материала снята — цвет выберите во вкладке «Эмаль RAL».`;
    }
  }

  if (patch.model) {
    const relief = patch.model.milling.relief;
    if (relief) spec = { ...spec, relief: { ...relief }, millingId: patch.model.id };
  } else if (patch.relief === null) {
    const { relief: _relief, ...rest } = spec;
    void _relief;
    /* Ровный фасад без рисунка: фрезеровка ряда снова наследуется, как у прочих. */
    spec = { ...rest };
    if (spec.millingId === NO_MILLING_ID) delete spec.millingId;
  } else if (patch.relief) {
    /*
     * СВОЙ РИСУНОК, А НЕ МОДЕЛЬ КАТАЛОГА. `none` закрывает наследование
     * фрезеровки ряда — иначе поверх рифления лёг бы «Модерн» полосы.
     * Модель с другими параметрами — уже не эта модель: заказать у
     * производителя «СЛ 3 с рамкой 80» нельзя, поэтому ссылка на позицию
     * снимается, и это сказано словами.
     */
    const was = spec.relief?.model;
    const { model: _model, ...own } = patch.relief;
    void _model;
    spec = { ...spec, relief: own, millingId: NO_MILLING_ID };
    if (was) note = `Параметры изменены — это уже не модель ${was}, а свой рисунок (VISUAL_ONLY).`;
  }

  if (spec.relief) {
    if (!RELIEF_BASES.includes(spec.base)) {
      spec = { ...spec, base: 'mdf_enamel', finish: spec.finish === 'textured' ? 'matte' : spec.finish };
      delete spec.itemId;
      if (spec.surface && !['touch_sense', 'matte', 'satin', 'gloss', 'high_gloss'].includes(spec.surface)) delete spec.surface;
      note = 'Рисунок фрезеруют по МДФ: фасад теперь «МДФ в эмали», позиция прежнего материала снята — цвет выберите во вкладке «Эмаль RAL».';
    }
    if (spec.construct !== 'solid') spec = { ...spec, construct: 'solid' };
  }
  return { spec, note };
}

export type FacadePlan = { ops: MillworkOp[]; note: string | null } | { refusal: string };

/**
 * ОПЕРАЦИИ ПРАВКИ ДЛЯ ОДНОГО РЯДА.
 *
 *   fronts  `set_front` каждому модулю с фасадом — свои фасады створок
 *           остаются (их выбирали отдельно, и панель это называет);
 *   module  `set_front` выбранному модулю;
 *   leaf    `set_leaf_front` выбранной створке.
 */
export function facadeOps(
  target: FacadeTarget,
  patch: FacadePatch,
  run: Run,
  moduleId: string | null,
  leaf: string | null,
): FacadePlan {
  let note: string | null = null;
  const plan = (current: FrontSpec) => {
    const next = facadeSpec(current, patch);
    note = note ?? next.note;
    return next.spec;
  };

  if (target === 'fronts') {
    const ops: MillworkOp[] = allModules(run)
      .filter((unit) => hasFacade(unit))
      .map((unit) => ({ op: 'set_front' as const, moduleId: unit.id, front: plan(frontOf(unit)) }));
    if (ops.length === 0) return { refusal: 'На этой стене фасадов нет.' };
    return { ops, note };
  }

  const unit = moduleId ? allModules(run).find((item) => item.id === moduleId) : undefined;
  if (!unit) return { refusal: 'Выберите шкаф в сцене или на схеме — фасад ляжет на него.' };
  if (!hasFacade(unit)) return { refusal: `«${unit.label}»: фасада нет — рисунку лечь не на что.` };

  if (target === 'module') {
    return { ops: [{ op: 'set_front', moduleId: unit.id, front: plan(frontOf(unit)) }], note };
  }
  if (!leaf) return { refusal: 'Выберите дверь: нажмите на неё в сцене или в списке дверей шкафа.' };
  return { ops: [{ op: 'set_leaf_front', moduleId: unit.id, leaf, front: plan(leafFrontOf(unit, leaf)) }], note };
}

/* ─────────────────────────  двери шкафа  ───────────────────────── */

/**
 * ДВЕРИ И ЯЩИКИ МОДУЛЯ — тот же список, что «Открыть всё» (`openablePartIds`):
 * что открывается в сцене, то и выбирается. У Г-образного пара — одна деталь.
 */
export function moduleLeaves(run: Run, moduleId: string): { leaf: string; title: string }[] {
  const prefix = `${moduleId}:`;
  return openablePartIds(run)
    .filter((id) => id.startsWith(prefix))
    .map((id) => id.slice(prefix.length))
    .map((leaf) => ({ leaf, title: leafTitle(leaf) }));
}

/**
 * ГАБАРИТ ФАСАДА КАЖДОЙ ДЕТАЛИ — по коробкам сцены (`runBoxes`), а не
 * своей формулой: та же коробка, на место которой встаёт сетка рисунка.
 * Ключ — идентификатор сцены (`<модуль>:door:0`).
 */
export function leafFrontSizes(run: Run): Map<string, ReliefLeaf> {
  const production = shopOf(run.production);
  const out = new Map<string, ReliefLeaf>();
  for (const box of runBoxes(run, { thicknessMm: production.carcassMm, frontThicknessMm: production.frontMm, gapMm: production.frontGapMm })) {
    if (box.material !== 'front' || !box.part || out.has(box.part)) continue;
    const [sx, sy, sz] = box.scale;
    out.set(
      box.part,
      box.face === '-x'
        ? { widthMm: sz * 1000, heightMm: sy * 1000, thicknessMm: sx * 1000 }
        : { widthMm: sx * 1000, heightMm: sy * 1000, thicknessMm: sz * 1000 },
    );
  }
  return out;
}

/**
 * ГДЕ РИСУНОК НЕ ВСТАЛ — словами, по деталям цели. Ящик 140 мм рамку не
 * вместит: такой фасад остаётся гладким, и это сказано, а не ужато молча.
 */
export function reliefMisfits(run: Run, unitIds: string[] | null): string[] {
  const sizes = leafFrontSizes(run);
  const out: string[] = [];
  for (const unit of allModules(run)) {
    if (unitIds && !unitIds.includes(unit.id)) continue;
    for (const { leaf, title } of moduleLeaves(run, unit.id)) {
      const relief = leafFrontOf(unit, leaf).relief;
      const size = sizes.get(`${unit.id}:${leaf}`);
      if (!relief || !size) continue;
      const said = reliefLeafRefusal(relief, size);
      if (said) out.push(`«${unit.label}», ${title.toLowerCase()}: ${said} Фасад гладкий.`);
    }
  }
  return out;
}

/** Тип рисунка — подпись для строки состава: «Рифлёный (E)». */
export function reliefTitle(kind: ReliefKind): string {
  const def = reliefKindDef(kind);
  return `${def.title} (${def.letter})`;
}

