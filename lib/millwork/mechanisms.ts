import type { HardwareDrillingSpec, HardwareMeta } from '@/types/catalog';

/**
 * КЛАССЫ МЕХАНИЗМОВ (PROFESSIONAL HARDWARE, ЭТАП 2) — ИЗ ЗАПИСИ ПРОИЗВОДИТЕЛЯ.
 *
 * Класс не назначается руками и не хранится: он выводится из того, что
 * записал свод фактов (`hardware-facts.mjs`) — подвид, вид изделия в начале
 * исполнения (`ball_bearing_partial_extension_groove_mount`, `lift_hl_top`…),
 * вид хода и название производителя. Названия и артикулы остаются как у
 * производителя; класс — только ответ на вопрос «как это движется и где
 * стоит», чтобы разные механизмы не считались взаимозаменяемыми: складной
 * HF и поворотный HK — оба «подъёмники», но фасад у первого из двух частей.
 *
 * Читаются только поля, которые есть и в лёгкой записи Studio
 * (`HARDWARE_LIGHT_FIELDS`): класс карточки и класс полного паспорта одни.
 */

export type MechanismSystem = 'LIFT_SYSTEM' | 'RUNNER_SYSTEM' | 'STORAGE_SYSTEM' | 'HINGE_SYSTEM' | 'HANDLE_SYSTEM';

export type MechanismType =
  /* LIFT_SYSTEM */
  | 'bifold'
  | 'parallel'
  | 'stay_lift'
  | 'up_and_over'
  /** Откидной вниз (нижний газовый амортизатор): в перечне ТЗ такого вида нет — назван своим. */
  | 'flap_down'
  /* RUNNER_SYSTEM: как стоит направляющая; выдвижение — отдельным признаком */
  | 'concealed'
  | 'ball_bearing'
  | 'drawer_box'
  /** Монтаж не назван в записи — тип по выдвижению, как требует ТЗ. */
  | 'full_extension'
  | 'partial_extension'
  /* STORAGE_SYSTEM */
  | 'cargo'
  | 'pantograph'
  | 'dish_dryer'
  | 'pull_down_storage'
  /* HINGE_SYSTEM */
  | 'concealed_hinge'
  | 'wide_angle'
  | 'special_application'
  /* HANDLE_SYSTEM */
  | 'bar'
  | 'profile'
  | 'integrated'
  | 'push_to_open'
  /** Кнопка: в перечне ТЗ (bar, long, profile, integrated, push_to_open) её нет — названа своим видом. */
  | 'knob';

/** Выдвижение направляющей — словами производителя в записи. */
export type RunnerExtension = 'full_extension' | 'partial_extension' | 'over_extension';

/** Само изделие, деталь системы или принадлежность к нему. */
export type MechanismRole = 'mechanism' | 'component' | 'accessory';

/** Чем движется — общее слово для сцены и карточки, без чисел, которых нет в паспорте. */
export type MechanismMotion =
  | 'fold'
  | 'parallel_lift'
  | 'swing_over'
  | 'swing_up'
  | 'swing_down'
  | 'translate'
  | 'lower'
  | 'rotate'
  | 'none';

export type MechanismRecord = {
  manufacturer: string;
  /** Серия как напечатана; нет её в записи — `null`. */
  family: string | null;
  model: string;
  article: string;
  system: MechanismSystem;
  role: MechanismRole;
  /** У принадлежности вида нет. */
  type: MechanismType | null;
  /** Только у направляющих; не названо производителем — `null`. */
  extension: RunnerExtension | null;
  /** Открывание без ручки (Push to open, TIP-ON) — признак, а не другой механизм. */
  pushToOpen: boolean;
  installationMm: Record<string, number> | null;
  mounting: HardwareDrillingSpec[];
  compatibleCabinetMm: Record<string, [number, number]> | null;
  loadKg: number | null;
  motion: { kind: MechanismMotion; angleDeg: number | null; strokeMm: number | null };
  material: string | null;
  finish: string | null;
  /** CAD производителя в продукте нет ни у одной позиции — и сказано почему. */
  cad: null;
  cadWhy: string;
  source: { file: string | null; url: string | null; pdfPage: number | null; printedPage: string | null; checkedAt: string | null };
  verification: NonNullable<HardwareMeta['engineeringStatus']> | 'NOT_STATED';
  /** Чего нет в источнике для выпуска — словами записи; противоречие источника — первой строкой. */
  constraints: string[];
  /** Откуда класс: какое поле записи и что в нём. */
  basis: string;
};

/** Позиция не механизм ни одного из пяти классов — и почему. */
export type NotMechanism = { system: null; why: string };

type Classified = { system: MechanismSystem; role: MechanismRole; type: MechanismType | null; motion: MechanismMotion; basis: string };

/** Вид изделия: первое слово исполнения, как его записал свод фактов. */
export function variantToken(hardware: Pick<HardwareMeta, 'variant' | 'subcategory'>): string {
  const head = (hardware.variant ?? '').split(' · ')[0].trim();
  return head || hardware.subcategory || '';
}

const LIFT_STAY = new Set([
  'lift_hk_top',
  'lift_hk_top_tip_on',
  'lift_hk_s',
  'lift_hk_s_tip_on',
  'lift_hk_xs',
  'lift_hk_xs_tip_on',
  'lift_hki',
  'lift_hki_tip_on',
]);

/** Подвид подъёмника → вид хода. Слова — из каталога Blum 2024-2025 (с. 15, 24, 36, 42, 48). */
const BLUM_LIFT_WORDS: Record<string, string> = {
  lift_hf_top: '«складной подъемный механизм» — фасад «при открывании складывается посередине» (каталог Blum, с. 24)',
  lift_hl_top: '«вертикальный подъемный механизм» — фасад «поднимается вверх параллельно корпусу» (каталог Blum, с. 42)',
  lift_hs_top: '«откидной подъемный механизм» — фасад «откидывается над корпусом» (каталог Blum, с. 36)',
  lift_hk: '«поворотный подъемный механизм» (каталог Blum, с. 15, 48)',
  lift_hki: '«интегрированный подъемный механизм» (каталог Blum, с. 15)',
};

function extensionOf(text: string): RunnerExtension | null {
  if (/over_extension|сверхполн/i.test(text)) return 'over_extension';
  if (/partial_extension|частичн\S* выдвиж|неполн\S* выдвиж/i.test(text)) return 'partial_extension';
  if (/full_extension|полн\S* выдвиж/i.test(text)) return 'full_extension';
  return null;
}

function classify(hardware: HardwareMeta, text: string): Classified | NotMechanism {
  const category = hardware.category;
  const sub = hardware.subcategory ?? '';
  const token = variantToken(hardware);
  const move = hardware.movementType ?? 'none';

  /* ── Подъёмники ── */
  if (category === 'lift') {
    if (sub === 'lift_hf_top' || sub === 'bifold_lift')
      return {
        system: 'LIFT_SYSTEM',
        role: 'mechanism',
        type: 'bifold',
        motion: 'fold',
        basis: sub === 'lift_hf_top' ? `подвид ${sub}: ${BLUM_LIFT_WORDS.lift_hf_top}` : `подвид ${sub}, ход ${move}: складной (FREE FOLD — по каталогу КОМПАКТ, сайт не прочитан)`,
      };
    if (sub === 'lift_hl_top') return { system: 'LIFT_SYSTEM', role: 'mechanism', type: 'parallel', motion: 'parallel_lift', basis: `подвид ${sub}: ${BLUM_LIFT_WORDS.lift_hl_top}` };
    if (sub === 'lift_hs_top') return { system: 'LIFT_SYSTEM', role: 'mechanism', type: 'up_and_over', motion: 'swing_over', basis: `подвид ${sub}: ${BLUM_LIFT_WORDS.lift_hs_top}` };
    if (LIFT_STAY.has(sub))
      return {
        system: 'LIFT_SYSTEM',
        role: 'mechanism',
        type: 'stay_lift',
        motion: 'swing_up',
        basis: `подвид ${sub}: ${sub.startsWith('lift_hki') ? BLUM_LIFT_WORDS.lift_hki : BLUM_LIFT_WORDS.lift_hk}`,
      };
    if (sub === 'flap_lift')
      return {
        system: 'LIFT_SYSTEM',
        role: 'mechanism',
        type: 'stay_lift',
        motion: 'swing_up',
        basis: `подвид ${sub}, ход ${move}: подъёмник с углом открывания (описание каталога КОМПАКТ; техническая страница Häfele не прочитана — 403)`,
      };
    if (sub === 'vertical_lift')
      return { system: 'LIFT_SYSTEM', role: 'mechanism', type: 'parallel', motion: 'parallel_lift', basis: `подвид ${sub}: вертикальный подъёмник (как записан в своде фактов)` };
    if (sub === 'gas_strut')
      return move === 'lower'
        ? { system: 'LIFT_SYSTEM', role: 'component', type: 'flap_down', motion: 'swing_down', basis: `газовый амортизатор, ход ${move}: фасад откидывается вниз` }
        : { system: 'LIFT_SYSTEM', role: 'component', type: 'stay_lift', motion: 'swing_up', basis: `газовый амортизатор, ход ${move}: фасад поднимается поворотом` };
    if (token === 'push_to_open')
      return { system: 'HANDLE_SYSTEM', role: 'mechanism', type: 'push_to_open', motion: 'none', basis: `вид ${token}: открывание нажатием (TIP-ON для подъёмника)` };
    if (sub === 'lift_accessory' || sub === 'bifold_middle_hinge')
      return { system: 'LIFT_SYSTEM', role: 'accessory', type: null, motion: 'none', basis: `подвид ${sub}, вид ${token}: принадлежность подъёмника` };
    return { system: null, why: `подъёмник подвида «${sub || 'не указан'}» — вид хода в записи не назван` };
  }

  /* ── Направляющие и системы ящиков ── */
  if (category === 'slide' || category === 'drawer_system' || sub === 'waste_pullout_runner' || sub === 'waste_pullout_drawer_side') {
    const extension = extensionOf(`${token} ${text}`);
    if (sub === 'runner_accessory') return { system: 'RUNNER_SYSTEM', role: 'accessory', type: null, motion: 'none', basis: `подвид ${sub}, вид ${token}: принадлежность направляющей` };
    if (category === 'drawer_system' || sub === 'system_runner' || sub === 'waste_pullout_runner' || sub === 'waste_pullout_drawer_side') {
      const runner = /runner/.test(sub);
      return {
        system: 'RUNNER_SYSTEM',
        role: runner ? 'mechanism' : 'component',
        type: 'drawer_box',
        motion: runner ? 'translate' : 'none',
        basis: `подвид ${sub}: ${runner ? 'направляющая системы ящика' : 'деталь системы ящика'} (${hardware.series ?? 'серия не указана'})`,
      };
    }
    if (sub === 'undermount') return { system: 'RUNNER_SYSTEM', role: 'mechanism', type: 'concealed', motion: 'translate', basis: `подвид ${sub}, вид ${token}: скрытого монтажа` };
    if (/ball_bearing/.test(token) || /шарик/i.test(text))
      return { system: 'RUNNER_SYSTEM', role: 'mechanism', type: 'ball_bearing', motion: 'translate', basis: `вид ${token}: шариковая${/шарик/i.test(text) ? ' (так названа производителем)' : ''}` };
    if (extension === 'partial_extension')
      return { system: 'RUNNER_SYSTEM', role: 'mechanism', type: 'partial_extension', motion: 'translate', basis: `вид ${token}: монтаж не назван — по выдвижению («частичного»)` };
    if (extension)
      return {
        system: 'RUNNER_SYSTEM',
        role: 'mechanism',
        type: 'full_extension',
        motion: 'translate',
        basis: `вид ${token}: монтаж не назван — по выдвижению («${extension === 'over_extension' ? 'сверхполного' : 'полного'}»)`,
      };
    return { system: null, why: `направляющая «${token || sub}»: ни монтаж, ни выдвижение в записи не названы` };
  }

  /* ── Петли ── */
  if (category === 'hinge') {
    if (sub === 'mounting_plate' || sub === 'hinge_accessory') return { system: 'HINGE_SYSTEM', role: 'accessory', type: null, motion: 'none', basis: `подвид ${sub}, вид ${token}: принадлежность петли` };
    if (/^wide_angle/.test(token) || (hardware.openingAngleDeg ?? 0) >= 155)
      return { system: 'HINGE_SYSTEM', role: 'mechanism', type: 'wide_angle', motion: 'rotate', basis: `вид ${token}${hardware.openingAngleDeg ? `, угол ${hardware.openingAngleDeg}°` : ''}: широкоугольная` };
    if (sub === 'special') return { system: 'HINGE_SYSTEM', role: 'mechanism', type: 'special_application', motion: 'rotate', basis: `подвид special, вид ${token}: петля особого применения` };
    if (sub === 'overlay' || sub === 'half_overlay' || sub === 'inset')
      return { system: 'HINGE_SYSTEM', role: 'mechanism', type: 'concealed_hinge', motion: 'rotate', basis: `подвид ${sub}, вид ${token}: петля под чашку` };
    return { system: null, why: `петля подвида «${sub || 'не указан'}» — конструкция в записи не названа` };
  }

  /* ── Ручки ── */
  if (category === 'handle') {
    if (sub === 'profile_accessory' || sub === 'profile_end_cap') return { system: 'HANDLE_SYSTEM', role: 'accessory', type: null, motion: 'none', basis: `подвид ${sub}: принадлежность профиля` };
    const map: Record<string, MechanismType> = { bar_handle: 'bar', knob: 'knob', flush_handle: 'integrated', edge_handle: 'profile', profile_handle: 'profile' };
    const type = map[sub];
    if (type) return { system: 'HANDLE_SYSTEM', role: 'mechanism', type, motion: 'none', basis: `подвид ${sub}` };
    return { system: null, why: `ручка подвида «${sub || 'не указан'}» — вид в записи не назван` };
  }

  /* ── Наполнение: карго, пантограф, сушилка, опускаемая полка ── */
  if (sub === 'cargo' || sub === 'tall_cargo' || sub === 'bottle')
    return { system: 'STORAGE_SYSTEM', role: 'mechanism', type: 'cargo', motion: 'translate', basis: `подвид ${sub}, вид ${token}: выдвижное карго` };
  if (sub === 'pantograph') return { system: 'STORAGE_SYSTEM', role: 'mechanism', type: 'pantograph', motion: 'lower', basis: `подвид ${sub}, ход ${move}` };
  if (sub === 'pantograph_spacer') return { system: 'STORAGE_SYSTEM', role: 'accessory', type: null, motion: 'none', basis: `подвид ${sub}: принадлежность пантографа` };
  if (sub === 'dish_dryer')
    return { system: 'STORAGE_SYSTEM', role: 'mechanism', type: 'dish_dryer', motion: move === 'slide_out' ? 'translate' : 'none', basis: `подвид ${sub}, ход ${move}` };
  if (sub === 'pull_down_shelf') return { system: 'STORAGE_SYSTEM', role: 'mechanism', type: 'pull_down_storage', motion: 'lower', basis: `подвид ${sub}, ход ${move}: опускаемая полка` };

  return { system: null, why: `${hardware.category} · ${sub || 'подвид не указан'}: в пяти классах ТЗ (подъёмники, направляющие, наполнение, петли, ручки) такого вида нет` };
}

/** Почему CAD нет — по производителю, из аудита официальных источников 2026-10-21 и 2026-10-29. */
function cadWhyOf(manufacturer: string): string {
  if (/blum/i.test(manufacturer)) return 'CAD Blum — только в закрытом портале e-services: не получен';
  if (/hettich/i.test(manufacturer)) return 'CAD Hettich публичный, но условия запрещают изменение модели: не загружался';
  if (/h[aä]fele/i.test(manufacturer)) return 'сайт Häfele недоступен (403): CAD не получен';
  return 'CAD производителя нет';
}

/**
 * КЛАСС МЕХАНИЗМА ПОЗИЦИИ — запись по полям ТЗ или «не механизм» с причиной.
 *
 * `name` — название позиции каталога (как у `HardwareItem`): в нём свод
 * фактов пишет и серию, и выдвижение.
 */
export function mechanismOf(item: { name?: string; hardware: HardwareMeta }): MechanismRecord | NotMechanism {
  const hw = item.hardware;
  const text = [item.name, hw.officialName, hw.variant, hw.series].filter(Boolean).join(' ');
  const cls = classify(hw, text);
  if (cls.system === null) return cls;
  const runner = cls.system === 'RUNNER_SYSTEM';
  const source = hw.source;
  const constraints = [
    ...(hw.engineeringStatus === 'CONFLICT' ? ['источник противоречит сам себе — числа не применяются'] : []),
    ...(hw.missing ?? []),
  ];
  return {
    manufacturer: hw.manufacturer ?? hw.brand ?? 'не указан',
    family: hw.series ?? null,
    model: hw.officialName ?? item.name ?? hw.model ?? '',
    article: hw.manufacturerArticle ?? '',
    system: cls.system,
    role: cls.role,
    type: cls.type,
    extension: runner ? extensionOf(`${variantToken(hw)} ${text}`) : null,
    pushToOpen: hw.movementType === 'push_open' || /push_to_open|push to open|tip-on/i.test(`${variantToken(hw)} ${text}`),
    installationMm: hw.dimensionsMm ?? null,
    mounting: hw.drilling ?? [],
    compatibleCabinetMm: hw.ranges ?? null,
    loadKg: hw.loadCapacityKg ?? null,
    motion: { kind: cls.motion, angleDeg: hw.openingAngleDeg ?? null, strokeMm: hw.strokeMm ?? null },
    material: hw.material ?? null,
    finish: hw.finish ?? null,
    cad: null,
    cadWhy: cadWhyOf(hw.manufacturer ?? hw.brand ?? ''),
    source: {
      file: source?.file ?? null,
      url: source?.url ?? null,
      pdfPage: source?.pdfPage ?? null,
      printedPage: source?.printedPage ?? null,
      checkedAt: source?.checkedAt ?? null,
    },
    verification: hw.engineeringStatus ?? 'NOT_STATED',
    constraints,
    basis: cls.basis,
  };
}

export function isMechanism(value: MechanismRecord | NotMechanism): value is MechanismRecord {
  return value.system !== null;
}

/** Слова класса для карточки: «Подъёмник · складной». */
export const SYSTEM_TITLE: Record<MechanismSystem, string> = {
  LIFT_SYSTEM: 'Подъёмник',
  RUNNER_SYSTEM: 'Направляющая',
  STORAGE_SYSTEM: 'Наполнение',
  HINGE_SYSTEM: 'Петля',
  HANDLE_SYSTEM: 'Ручка',
};

export const TYPE_TITLE: Record<MechanismType, string> = {
  bifold: 'складной (фасад из двух частей)',
  parallel: 'вертикальный (фасад вверх параллельно корпусу)',
  stay_lift: 'поворотный (фасад вверх поворотом)',
  up_and_over: 'откидной (фасад над корпусом)',
  flap_down: 'откидной вниз',
  concealed: 'скрытого монтажа',
  ball_bearing: 'шариковая',
  drawer_box: 'система ящика',
  full_extension: 'полного выдвижения',
  partial_extension: 'частичного выдвижения',
  cargo: 'карго',
  pantograph: 'пантограф',
  dish_dryer: 'сушилка',
  pull_down_storage: 'опускаемая полка',
  concealed_hinge: 'под чашку',
  wide_angle: 'широкоугольная',
  special_application: 'особого применения',
  bar: 'скоба',
  profile: 'профиль',
  integrated: 'врезная',
  push_to_open: 'открывание нажатием',
  knob: 'кнопка',
};

const EXTENSION_TITLE: Record<RunnerExtension, string> = {
  full_extension: 'полное выдвижение',
  partial_extension: 'частичное выдвижение',
  over_extension: 'сверхполное выдвижение',
};

/** Одна строка класса для карточки и сцены: «Направляющая · шариковая · частичное выдвижение». */
export function mechanismWords(record: MechanismRecord): string {
  const parts = [SYSTEM_TITLE[record.system]];
  if (record.type === 'full_extension' && record.extension === 'over_extension') parts.push('сверхполного выдвижения');
  else if (record.type) parts.push(TYPE_TITLE[record.type]);
  if (record.role === 'accessory') parts.push('принадлежность');
  if (record.role === 'component') parts.push('деталь системы');
  if (record.extension && record.type !== 'full_extension' && record.type !== 'partial_extension') parts.push(EXTENSION_TITLE[record.extension]);
  if (record.pushToOpen && record.type !== 'push_to_open') parts.push('открывание нажатием');
  return parts.join(' · ');
}

/**
 * ВЗАИМОЗАМЕНЯЕМЫ ЛИ ДВЕ ПОЗИЦИИ ПО ХОДУ — один класс, один вид и одна роль.
 * Разный вид — разный механизм, даже если оба называются «подъёмник».
 */
export function sameMechanism(a: MechanismRecord | NotMechanism, b: MechanismRecord | NotMechanism): boolean {
  if (!isMechanism(a) || !isMechanism(b)) return false;
  return a.system === b.system && a.type === b.type && a.role === b.role && a.extension === b.extension;
}
