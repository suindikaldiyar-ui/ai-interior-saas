'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebug } from '@/lib/debug';
import { useInteriorStore } from '@/store/useInteriorStore';
import dynamic from 'next/dynamic';
import ThemeToggle from '@/components/ThemeToggle';
import BeforeAfter from './BeforeAfter';
import CommandBar from './CommandBar';
import DrawingSheet from './DrawingSheet';
import ElevationDrawing, {
  type DrawingMode,
  type VariantOption,
} from './ElevationDrawing';
import EstimateSheet from './EstimateSheet';
import MaterialsStep from './MaterialsStep';
import PanelList from './PanelList';
import PlanDrawing from './PlanDrawing';
import RenderPanel from './RenderPanel';
import ArrangementCards from './ArrangementCards';
import RunEditor, { type CompositionPatch } from './RunEditor';
import StepBar, { type StepKey } from './StepBar';
import { openablePartIds } from './cabinet3d/Cabinet3D';
import SurveyPanel from './SurveyPanel';
import SurveySheet from './SurveySheet';
import TemplatePicker from './TemplatePicker';
import type { RateTable } from '@/lib/millwork/estimate';
import { applyOps } from '@/lib/millwork/ops';
import { buildEstimate } from '@/lib/millwork/estimate';
import { currentVariant, variantsForModule } from '@/lib/millwork/moduleVariants';
import { allModules } from '@/lib/millwork/layout';
import { buildRun } from '@/lib/millwork/layout';
import { manualAnchorCost } from '@/lib/millwork/invariants';
import { APPLIANCE_SLOTS } from '@/lib/millwork/modules';
import { composeVariants, workspaceInput } from '@/lib/millwork/workspace';
import {
  MAIN_VARIANT,
  SINGLE_VARIANT,
  buildArrangements,
  type Arrangement,
} from '@/lib/millwork/variants';
import { zoneProfile } from '@/lib/millwork/zones';
import { validateRun } from '@/lib/millwork/validate';
import {
  collectWarnings,
  groupWarnings,
  hasBlocking,
  splitWarnings,
} from '@/lib/millwork/warnings';
import {
  DEFAULT_RENDER_STYLE,
  isRenderStyle,
  useMillworkRender,
} from '@/lib/millwork/render';
import {
  requirementsFromTemplate,
  suggestTemplate,
  templateById,
  type RunTemplate,
} from '@/lib/millwork/templates';
import type { ProductionSettings } from '@/types/catalog';
import {
  DEFAULT_SCENE_VIEW,
  SCENE_VIEW_LABEL,
  type SceneView,
} from '@/lib/cameraFraming';
import type { RunAngle } from '@/types/render';
import {
  isEstimatePreliminary,
  resolveSurvey,
  type Survey,
} from '@/types/survey';
import { shareUrl, whatsappLink, type MillworkState } from '@/lib/projects';
import { runFingerprint } from '@/lib/millwork/fingerprint';
import type {
  ApplianceKind,
  CommPoint,
  MillworkOp,
  ModuleVariantKind,
  Module,
  ModuleFill,
  Opening,
  Run,
  RunRequirements,
  VariantKey,
} from '@/types/millwork';

/**
 * Рабочее место замерщика: один экран — одна задача.
 *
 * Шесть вкладок, лента модулей, панель сметы, двадцать предупреждений и
 * командная строка одновременно — это экран, который невозможно объяснить
 * за пять минут. Вместо них последовательность:
 *
 *   Замер → Шаблон → Состав → Материалы → Результат
 *
 * Внизу всегда одна главная кнопка «Дальше» и одна вторичная «Назад»,
 * итог сметы — строкой, а таблица открывается тапом.
 */

/*
 * Сцену подключаем динамически: она тянет three.js, а конфигуратор обязан
 * открываться быстро — замерщик стоит с планшетом в чужой квартире.
 */
const KitchenScene = dynamic(() => import('./KitchenScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[13px] text-graphiteMw">
      Собираем сцену…
    </div>
  ),
});

const CatalogLoader = dynamic(() => import('@/components/CatalogLoader'), { ssr: false });

/** Чем смотреть результат. Чертёж плотный намеренно — это документ. */
type ResultView = 'facade' | 'plan' | 'scene' | 'panels';

const STEP_HINT: Record<StepKey, string> = {
  survey: 'Меряем по низу стены, у пола: вверху стены новостройки кривые.',
  template: 'Выберите типовое решение — длина подставится из замера.',
  compose: 'Правьте состав голосом или руками: чертёж и смета пересчитаются сразу.',
  materials: 'Фото помещения и артикул каталога нужны, чтобы клиент узнал свою квартиру.',
  result: 'Тяните шторку: слева квартира клиента, справа его кухня.',
};

export type WorkspaceProps = {
  title: string;
  zone: string;
  measuredBy: string;
  measuredAt: string;
  lengthMm: number;
  ceilingHeightMm: number;
  requirements: RunRequirements;
  openings: Opening[];
  comms: CommPoint[];
  rates: RateTable;
  cornerAt?: 'start' | 'end' | null;
  /** Глубина помещения для 3D: вторая стена замера. */
  roomDepthM?: number;
  /** Объект в базе. Без него конфигуратор работает как витрина, без сохранения. */
  projectId?: string | null;
  shareToken?: string | null;
  clientName?: string;
  /** Состояние, с которым объект закрыли в прошлый раз. */
  initialState?: MillworkState | null;
  /** Ставки каталога не заполнены — считать смету нечем. */
  ratesMissing?: boolean;
  /** Фотография помещения клиента: основа рендера. */
  roomPhoto?: string | null;
  /**
   * Планировка ЖК, по которой собран объект. С ней работают две вещи:
   * честная строка «размеры из библиотеки» и кнопка «Сохранить как готовый
   * проект» — из этого объекта получается витрина для сотен одинаковых
   * квартир.
   */
  floorPlanId?: string | null;
  /** Откуда взяты размеры. Замерщик и клиент читают это до подписи. */
  libraryNote?: string | null;
  /** Готовая конфигурация: демонстрация не открывается пустым экраном. */
  templateId?: string | null;
  /** Типовые решения компании из настроек. */
  orgTemplates?: RunTemplate[];
  /** Настройки цеха: толщины и зазоры, от них зависит детализировка. */
  production?: ProductionSettings;
  /**
   * Замер объекта. Пока он не завершён, конфигуратор открывается на панели
   * «Замер»: замерщик вносит размер и сразу видит, что там встанет.
   */
  survey?: Survey | null;
  /**
   * Замер завершён на странице без объекта в базе: страница сама решает,
   * что делать дальше — создать объект и перейти к нему.
   */
  onSurveyFinish?: (survey: Survey) => void;
  /** Замер правится и снаружи: страница держит его у себя. */
  onSurveyChange?: (survey: Survey) => void;
};

/** Пауза после последнего изменения перед записью в базу. */
const AUTOSAVE_DELAY_MS = 2000;

export default function Workspace(props: WorkspaceProps) {
  /*
   * Комплектация одна (см. SINGLE_VARIANT). Ключ остаётся: он держит
   * снятые галочки сметы, стиль рендера и сохранённое состояние объекта,
   * а вернуть три бюджета — это флаг, а не переписывание.
   */
  const [variantKey] = useState<VariantKey>(
    props.initialState?.selectedVariant ?? MAIN_VARIANT,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Технические подписи включаются адресом ?debug=1, см. lib/debug.ts
  const debug = useDebug();

  /*
   * Первый шаг — тот, где работа ещё не сделана: незавершённый замер ведёт
   * на замер, невыбранный шаблон — на шаблон, всё остальное — на состав.
   */
  const startSurvey = props.initialState?.survey ?? props.survey ?? null;
  const [step, setStep] = useState<StepKey>(
    startSurvey && !startSurvey.finishedAt
      ? 'survey'
      : (props.initialState?.templateId ?? props.templateId)
        ? 'compose'
        : 'template',
  );
  const [resultView, setResultView] = useState<ResultView>('facade');
  /*
   * Эскиз в двух видах: «с фасадами» показывают клиенту, «внутри» —
   * цеху и тому же клиенту, когда он спрашивает, куда встанут кастрюли.
   */
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('fronts');
  /*
   * Ракурс сцены. По умолчанию три четверти: фронтальный вид плоский, из
   * него не видно ни глубины, ни свеса столешницы, а мебель продаётся
   * именно объёмом.
   */
  const [sceneView, setSceneView] = useState<SceneView>(DEFAULT_SCENE_VIEW);
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [renderAngle, setRenderAngle] = useState<RunAngle>('front');
  /*
   * Стиль выбирает человек, а не таблица комплектаций: бюджет и вкус —
   * разные вещи. Выбор живёт в состоянии объекта и переживает закрытие.
   */
  const openParts = useInteriorStore((s) => s.openParts);
  const cutaway = useInteriorStore((s) => s.cutaway);
  const setOpenParts = useInteriorStore((s) => s.setOpenParts);
  const closeAllParts = useInteriorStore((s) => s.closeAllParts);
  const setCutaway = useInteriorStore((s) => s.setCutaway);

  const [renderStyle, setRenderStyle] = useState<string>(
    isRenderStyle(props.initialState?.renderStyle)
      ? (props.initialState?.renderStyle as string)
      : DEFAULT_RENDER_STYLE,
  );
  /*
   * Позиции техники, заданные замерщиком руками. Живут в состоянии объекта
   * вместе с требованиями, поэтому переживают пересчёт и сохранение.
   */
  const [manualAnchors, setManualAnchors] = useState<
    NonNullable<RunRequirements['manualAnchors']>
  >(
    props.initialState?.requirements?.manualAnchors ?? {},
  );
  /** Почему последняя правка не применилась. */
  const [moveNotice, setMoveNotice] = useState<string | null>(null);

  /*
   * Правки состава поверх шаблона: техника, колонна, встройка, витрина и
   * высота верхнего ряда. Шаблон задаёт умолчания, а замерщик правит их
   * при клиенте — и правка обязана пережить пересчёт и закрытие объекта.
   */
  const [composition, setComposition] = useState<CompositionPatch>({
    appliances: props.initialState?.requirements?.appliances,
    sections: props.initialState?.requirements?.sections,
    doorSystem: props.initialState?.requirements?.doorSystem,
    columnTop: props.initialState?.requirements?.columnTop,
    fridgeType: props.initialState?.requirements?.fridgeType,
    glassDisplay: props.initialState?.requirements?.glassDisplay,
    upperToCeiling: props.initialState?.requirements?.options?.upperToCeiling,
  });

  const [templateId, setTemplateId] = useState<string | null>(
    props.initialState?.templateId ?? props.templateId ?? null,
  );
  const [disabled, setDisabled] = useState<Record<VariantKey, string[]>>({
    basic: props.initialState?.disabled?.basic ?? [],
    optimal: props.initialState?.disabled?.optimal ?? [],
    premium: props.initialState?.disabled?.premium ?? [],
  });
  const [editedRuns, setEditedRuns] = useState<Partial<Record<VariantKey, Run>>>(
    props.initialState?.runs ?? {},
  );
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error' | 'offline'
  >(
    props.initialState?.savedAt ? 'saved' : 'idle',
  );
  const [share, setShare] = useState<{ url: string; wa: string } | null>(null);
  /** Что ответил сервер на «Сохранить как готовый проект». */
  const [readyNotice, setReadyNotice] = useState<string | null>(null);
  const [kitchenItemId, setKitchenItemId] = useState<string | null>(null);
  // Снимок можно добавить и позже, прямо из вкладки рендера.
  const [roomPhoto, setRoomPhoto] = useState<string | null>(props.roomPhoto ?? null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [survey, setSurvey] = useState<Survey | null>(
    props.initialState?.survey ?? props.survey ?? null,
  );
  const [showSheet, setShowSheet] = useState(false);
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const [warningAt, setWarningAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Объект без сохранённого состояния пишется сразу: клиенту могут отправить
  // ссылку, не тронув ни одного модуля.
  const dirty = useRef(Boolean(props.projectId) && !props.initialState?.savedAt);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [changedIds, setChangedIds] = useState<string[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Замер — источник правды, если он есть. Конфигуратор не пересчитывает
   * его заново: `resolveSurvey` один раз переводит замер в числа и помечает
   * каждое допущение, чтобы оно осталось видимым до самой сметы.
   */
  const resolution = useMemo(() => (survey ? resolveSurvey(survey) : null), [survey]);

  /*
   * Шаблон задаёт СОСТАВ ТЕХНИКИ и сторону колонн, а раскладку по-прежнему
   * считает buildRun по длине из замера. Своей разбивки у шаблона нет —
   * иначе чертёж и смета разошлись бы.
   */
  const template = templateById(templateId, props.orgTemplates ?? []);
  // Шаблоны своей зоны: кухонные решения в спальне предлагать нечего.
  const zone = props.requirements.zone ?? 'kitchen';
  const suggested = useMemo(
    () => suggestTemplate(props.lengthMm, zone),
    [props.lengthMm, zone],
  );

  /*
   * Рендер выбранной комплектации: он же правая половина сравнения.
   * Пока его нет, шторка честно показывает, что нажать.
   */
  const renderVariants = useInteriorStore((s) => s.renderVariants);
  const activeRender =
    renderVariants.find((v) => v.styleId === renderStyle)?.image ?? null;
  /*
   * ОСНОВА ДЛЯ КОМПОНОВОК: состав без того, чем компоновки друг от друга
   * отличаются, — без стороны пеналов и без ручных позиций.
   *
   * Иначе карточки едут вслед за выбранным вариантом: выбрал «холодильник
   * справа» — и «как считает расчёт» пересобирается с пеналами справа,
   * становится тем же самым рядом и схлопывается с ним. Выбор перестаёт
   * быть выбором, а подсветка выбранной карточки — врать.
   */
  const arrangementBase = useMemo(() => {
    const base = template
      ? requirementsFromTemplate(template, props.requirements.options)
      : props.requirements;

    return {
      ...base,
      appliances: composition.appliances ?? base.appliances,
      sections: composition.sections ?? base.sections,
      doorSystem: composition.doorSystem ?? base.doorSystem,
      columnTop: composition.columnTop ?? base.columnTop,
      fridgeType: composition.fridgeType ?? base.fridgeType,
      glassDisplay: composition.glassDisplay ?? base.glassDisplay,
      manualAnchors: {},
      options: {
        ...base.options,
        upperToCeiling: composition.upperToCeiling ?? base.options.upperToCeiling,
      },
      lockedOptions: composition.upperToCeiling === undefined ? undefined : ['upperToCeiling'],
    } as RunRequirements;
  }, [template, props.requirements, composition]);

  const requirements = useMemo(() => {
    const base = template
      ? requirementsFromTemplate(template, props.requirements.options)
      : props.requirements;

    const next: RunRequirements = {
      ...base,
      appliances: composition.appliances ?? base.appliances,
      sections: composition.sections ?? base.sections,
      doorSystem: composition.doorSystem ?? base.doorSystem,
      tallSide: composition.tallSide ?? base.tallSide,
      columnTop: composition.columnTop ?? base.columnTop,
      fridgeType: composition.fridgeType ?? base.fridgeType,
      glassDisplay: composition.glassDisplay ?? base.glassDisplay,
      options: {
        ...base.options,
        upperToCeiling: composition.upperToCeiling ?? base.options.upperToCeiling,
      },
      /*
       * Выбор человека сильнее стратегии комплектации: иначе «до потолка»
       * нажимается, а верхний ряд остаётся стандартным — стратегия
       * `optimal` перекрывает эту опцию своей.
       */
      lockedOptions: composition.upperToCeiling === undefined ? undefined : ['upperToCeiling'],
    };

    return Object.keys(manualAnchors).length > 0 ? { ...next, manualAnchors } : next;
  }, [template, props.requirements, manualAnchors, composition]);

  const input = useMemo(() => {
    if (!resolution) {
      return {
        title: props.title,
        zone: props.zone,
        measuredBy: props.measuredBy,
        measuredAt: props.measuredAt,
        lengthMm: props.lengthMm,
        ceilingHeightMm: props.ceilingHeightMm,
        requirements,
        openings: props.openings,
        comms: props.comms,
        rates: props.rates,
        cornerAt: props.cornerAt ?? null,
        roomDepthM: props.roomDepthM ?? 3.2,
      };
    }

    const seed = workspaceInput({
      title: props.title,
      zone: props.zone,
      measurement: resolution.measurement,
      requirements,
      rates: props.rates,
      wallId: resolution.runWallId,
      cornerAt: props.cornerAt ?? null,
    });

    // Пока стены не введены, ряд брать неоткуда — держим габарит из пропсов.
    return seed.lengthMm > 0 ? seed : { ...seed, lengthMm: props.lengthMm };
  }, [resolution, requirements, props]);

  /*
   * Компоновки: две-три расстановки ОДНОЙ кухни из одного замера. Считаются
   * от требований без ручных позиций — иначе карточки поплыли бы вслед за
   * выбранным вариантом и перестали быть выбором.
   */
  const arrangements = useMemo(() => {
    if (zone !== 'kitchen') return [];
    try {
      return buildArrangements({
        lengthMm: input.lengthMm,
        ceilingHeightMm: input.ceilingHeightMm,
        requirements: arrangementBase,
        openings: input.openings,
        comms: input.comms,
        rates: input.rates,
        cornerAt: input.cornerAt,
        disabledKeys: disabled[variantKey],
      });
    } catch {
      // Компоновки — подсказка, а не расчёт: их отсутствие ничего не ломает.
      return [];
    }
  }, [zone, input, arrangementBase, disabled, variantKey]);

  /*
   * Три варианта — одна раскладка в трёх комплектациях, плюс правки
   * замерщика поверх выбранного. Тем же кодом собирается кабинет клиента.
   */
  const variants = useMemo(
    () => composeVariants(input, disabled, editedRuns),
    [input, disabled, editedRuns],
  );

  /*
   * Отрисовка одна на экран: кнопка стоит и в пустой половине сравнения,
   * и у карточки. Два состояния дали бы две кнопки с разным мнением о том,
   * рисуем мы сейчас или нет.
   */
  const render = useMillworkRender({
    variants,
    roomPhoto,
    angle: renderAngle,
    projectId: props.projectId,
    styleId: renderStyle,
  });

  const active = variants.find((v) => v.key === variantKey) ?? variants[0];
  const issues = useMemo(
    () => validateRun(active.run, props.comms),
    [active.run, props.comms],
  );

  const flash = useCallback((ids: string[]) => {
    setChangedIds(ids);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setChangedIds([]), 420);
  }, []);

  /**
   * Правка наполнения модуля.
   *
   * Идёт тем же путём, что и правка состава: результат ложится в
   * `editedRuns`, попадает в автосохранение и меняет отпечаток — чертёж,
   * смета и рендер обязаны увидеть одну и ту же мебель.
   */
  const changeFill = (moduleId: string, fill: ModuleFill) => {
    const patch = (list: Module[]) =>
      list.map((unit) => (unit.id === moduleId ? { ...unit, fill } : unit));

    const next: Run = {
      ...active.run,
      modules: patch(active.run.modules),
      upperSegments: active.run.upperSegments.map((segment) => ({
        ...segment,
        modules: patch(segment.modules),
      })),
    };

    dirty.current = true;
    setEditedRuns((prev) => ({
      ...prev,
      [variantKey]: { ...next, fingerprint: runFingerprint(next) },
    }));
  };

  /**
   * Перенос прибора на новое место.
   *
   * Проверка идёт ДО применения: если после переноса какой-то прибор
   * перестаёт помещаться, правку не применяем и говорим, чего не хватает.
   * Молча выбросить посудомойку нельзя — клиент увидел бы не тот состав,
   * который заказывал.
   */
  const moveAppliance = (appliance: ApplianceKind, centerMm: number) => {
    const next = { ...manualAnchors, [appliance]: centerMm };

    let candidate: Run;
    try {
      candidate = buildRun({
        lengthMm: input.lengthMm,
        ceilingHeightMm: input.ceilingHeightMm,
        requirements: { ...requirements, manualAnchors: next },
        openings: input.openings,
        comms: input.comms,
        cornerAt: input.cornerAt,
      });
    } catch {
      setMoveNotice('Сюда прибор не встаёт: ряд не сходится с длиной стены.');
      return;
    }

    const { dropped, missingMm } = manualAnchorCost(active.run, candidate);
    if (dropped.length > 0) {
      const titles = dropped
        .map((a) => APPLIANCE_SLOTS[a as ApplianceKind]?.title ?? a)
        .join(', ');
      setMoveNotice(
        `Не переношу: на этом месте не остаётся места под ${titles} — не хватает ${missingMm} мм.`,
      );
      return;
    }

    setMoveNotice(null);
    dirty.current = true;
    // Ручная расстановка отменяет прежние правки состава: ряд пересобран.
    setEditedRuns({});
    setManualAnchors(next);
  };

  /**
   * Правка состава: техника, колонна, встройка, витрина, верхний ряд.
   *
   * Ряд пересобирается целиком через `buildRun`, поэтому прежние правки
   * модулей к нему уже не относятся: они ссылались на модули, которых
   * больше нет. Ручную расстановку это не трогает — прибор, поставленный
   * замерщиком, остаётся на своём месте.
   */
  const changeComposition = (patch: CompositionPatch) => {
    dirty.current = true;
    setMoveNotice(null);
    setEditedRuns({});
    setSelectedId(null);
    setComposition((prev) => ({ ...prev, ...patch }));
  };

  /**
   * Выбор компоновки.
   *
   * Вариант — это ДРУГИЕ ТРЕБОВАНИЯ, а не своя раскладка: ряд собирается
   * заново тем же `buildRun`. Поэтому прежние правки модулей к нему уже
   * не относятся, а ручная расстановка сбрасывается — и об этом говорится
   * прямо, иначе замерщик решит, что его правка пропала сама.
   */
  const chooseArrangement = (arrangement: Arrangement) => {
    const hadManual = Object.keys(manualAnchors).length > 0;
    const next = arrangement.requirements.manualAnchors ?? {};

    // Вариант может добавить прибор — например, микроволновку в колонну.
    const added = arrangement.requirements.appliances.filter(
      (a) => !requirements.appliances.includes(a),
    );

    dirty.current = true;
    setEditedRuns({});
    setSelectedId(null);
    setManualAnchors(next);
    setComposition((prev) => ({
      ...prev,
      appliances: arrangement.requirements.appliances,
      tallSide: arrangement.requirements.tallSide,
    }));

    /*
     * Говорим вслух и про сброс, и про добавленный прибор. Иначе замерщик
     * видит, что его правка исчезла, а карточка, на которую он нажал,
     * пропала из списка, — и решает, что инструмент сломался.
     */
    const notes = [
      hadManual && Object.keys(next).length === 0
        ? 'Ручная расстановка сброшена — вариант собран заново.'
        : null,
      added.length > 0
        ? `${added
            .map((a) => APPLIANCE_SLOTS[a].title)
            .join(', ')} добавлен${added.length > 1 ? 'ы' : 'а'} в состав — теперь этот прибор есть во всех вариантах.`
        : null,
    ].filter(Boolean);

    setMoveNotice(notes.length > 0 ? notes.join(' ') : null);
  };

  const resetAnchors = () => {
    dirty.current = true;
    setEditedRuns({});
    setManualAnchors({});
    setMoveNotice(null);
  };

  /**
   * ВАРИАНТЫ ВЫБРАННОГО МЕСТА И РАЗНИЦА В ЦЕНЕ.
   *
   * Разницу считаем настоящим пересчётом: применяем вариант тем же
   * `applyOps` и считаем ту же смету. Прикинуть «плюс механизм» по
   * прайсу было бы дешевле, но тогда цифра на чертеже разошлась бы
   * с итогом внизу экрана — а клиент видит обе.
   */
  const variantOptions = useMemo<VariantOption[]>(() => {
    if (!selectedId) return [];

    const unit = allModules(active.run).find((m) => m.id === selectedId);
    if (!unit) return [];

    const specs = variantsForModule(unit, active.run, zone);
    // Один вариант — это не выбор, а надпись. Меню не показываем вовсе.
    if (specs.length < 2) return [];

    const now = currentVariant(unit);
    const base = buildEstimate(active.run, variantKey, input.rates, disabled[variantKey]).total;

    return specs.map((spec) => {
      let deltaKzt = 0;

      if (spec.kind !== now) {
        try {
          const next = applyOps({
            run: active.run,
            requirements,
            ops: [{ op: 'set_variant', moduleId: unit.id, variant: spec.kind }],
            openings: input.openings,
          });
          deltaKzt = Math.round(
            buildEstimate(next, variantKey, input.rates, disabled[variantKey]).total - base,
          );
        } catch {
          // Вариант, который не собирается, просто идёт без цены.
          deltaKzt = 0;
        }
      }

      return {
        kind: spec.kind,
        title: spec.title,
        hint: spec.hint,
        deltaKzt,
        active: spec.kind === now,
      };
    });
  }, [selectedId, active.run, zone, requirements, input.rates, input.openings, disabled, variantKey]);

  const runOps = useCallback(
    (ops: MillworkOp[]) => {
      if (ops.length === 0) return;
      const before = new Map(active.run.modules.map((m) => [m.id, m.widthMm]));
      const next = applyOps({
        run: active.run,
        requirements,
        ops,
        openings: props.openings,
      });
      dirty.current = true;
      setEditedRuns((prev) => ({ ...prev, [active.key]: next }));
      setSelectedId(null);
      flash(
        next.modules
          .filter((m) => before.get(m.id) !== m.widthMm)
          .map((m) => m.id),
      );
    },
    [active, requirements, props.openings, flash],
  );

  /**
   * Выбор варианта идёт тем же путём, что и любая правка состава, но
   * ВЫДЕЛЕНИЕ ОСТАЁТСЯ: замерщик при клиенте перебирает варианты подряд —
   * «а если стекло? а если подъёмник?». Ширина от варианта не меняется,
   * значит и идентификатор модуля тот же, и меню остаётся открытым.
   */
  const chooseVariant = (kind: ModuleVariantKind) => {
    if (!selectedId) return;
    const keep = selectedId;
    runOps([{ op: 'set_variant', moduleId: keep, variant: kind }]);
    setSelectedId(keep);
  };

  const sendCommand = useCallback(
    async (text: string) => {
      setBusy(true);
      setReply(null);
      try {
        const res = await fetch('/api/ai/millwork', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            run: active.run,
            // Зона решает, что вообще бывает в составе: и в промпте,
            // и в разборе ответа модели.
            requirements,
          }),
        });
        const data = await res.json();
        setReply(typeof data.reply === 'string' ? data.reply : null);
        if (Array.isArray(data.ops) && data.ops.length > 0) runOps(data.ops);
      } catch {
        setReply('Сервер не ответил. Правьте состав вручную.');
      } finally {
        setBusy(false);
      }
    },
    [active.run, requirements, runOps],
  );

  const toggleLine = (key: string) => {
    dirty.current = true;
    setDisabled((prev) => {
      const current = prev[variantKey];
      return {
        ...prev,
        [variantKey]: current.includes(key)
          ? current.filter((k) => k !== key)
          : [...current, key],
      };
    });
  };

  /*
   * Один список, отсортированный по последствиям, и не больше двух строк
   * на экране: десяток предупреждений превращается в фон, который не читает
   * никто. Остальные — под «ещё N», каждое кликабельно и ведёт на план.
   */
  const warnings = useMemo(
    () =>
      collectWarnings({
        issues,
        run: active.run,
        openings: input.openings,
        comms: input.comms,
        stats: resolution?.stats ?? null,
        // Как только замерщик взял расстановку в свои руки, расхождение
        // с водой становится предупреждением, а не запретом: он видел
        // вывод своими глазами.
        manualSink: Object.keys(manualAnchors).length > 0,
        hoodRequested: requirements.appliances.includes('hood'),
      }),
    [issues, active.run, input.openings, input.comms, resolution, manualAnchors, requirements],
  );

  /*
   * Ряд построен по стене, длину которой не мерили? Тогда общий размер
   * на чертеже идёт пунктиром — отраслевая норма для размеров из допущений.
   */
  const runWallLength = survey?.walls.find((w) => w.id === resolution?.runWallId)?.lengthMm;
  const assumedTotal = runWallLength ? runWallLength.state !== 'measured' : false;

  /*
   * Блокирующие живут отдельной красной полосой над главной кнопкой:
   * в общем списке они тонут среди уточнений. Остальные схлопываются
   * по повторам, и на экране их не больше трёх.
   */
  const blockingWarnings = warnings.filter((w) => w.severity === 'blocking');
  const softWarnings = groupWarnings(warnings.filter((w) => w.severity === 'clarify'));
  const { shown: shownSoft, hidden: hiddenSoft } = splitWarnings(softWarnings);
  const blocked = hasBlocking(warnings);
  const preliminary = resolution ? isEstimatePreliminary(resolution.stats) : false;

  /*
   * Автосохранение через паузу после последнего изменения. Замерщик правит
   * состав при клиенте и не должен помнить про кнопку «сохранить»; писать же
   * на каждый клик — это запрос в базу на каждое нажатие.
   */
  useEffect(() => {
    if (!props.projectId || !dirty.current) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');

    saveTimer.current = setTimeout(async () => {
      const state: MillworkState = {
        survey: survey ?? undefined,
        templateId,
        requirements,
        runs: editedRuns,
        selectedVariant: variantKey,
        renderStyle,
        disabled,
        priceSnapshot: active.estimate.priceSnapshot,
        savedAt: new Date().toISOString(),
      };

      /*
       * Сначала на диск браузера, только потом на сервер. В новостройке
       * интернета часто нет вовсе, и замер, потерянный из-за отсутствия
       * связи, — это второй выезд на объект.
       */
      const payload = { projectId: props.projectId, millwork: state, total: active.estimate.total };
      try {
        localStorage.setItem(`millwork:${props.projectId}`, JSON.stringify(payload));
      } catch {
        /* приватный режим или переполнение — не повод падать */
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSaveState('offline');
        return;
      }

      try {
        const res = await fetch('/api/projects/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setSaveState(res.ok ? 'saved' : 'error');
        if (res.ok) dirty.current = false;
      } catch {
        // Сеть отвалилась в момент отправки — это тоже «ждём связи».
        setSaveState('offline');
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    editedRuns,
    disabled,
    variantKey,
    renderStyle,
    active.estimate,
    survey,
    templateId,
    requirements,
    props.projectId,
  ]);

  /*
   * Связь вернулась — отправляем то, что лежит на планшете. Замерщик об этом
   * не думает: он в квартире, а не в системном трее.
   */
  useEffect(() => {
    const flush = async () => {
      if (!props.projectId) return;
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(`millwork:${props.projectId}`);
      } catch {
        return;
      }
      if (!raw) return;

      setSaveState('saving');
      try {
        const res = await fetch('/api/projects/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: raw,
        });
        if (res.ok) {
          dirty.current = false;
          setSaveState('saved');
        } else {
          setSaveState('error');
        }
      } catch {
        setSaveState('offline');
      }
    };

    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
  }, [props.projectId]);

  const publish = useCallback(async () => {
    if (!props.projectId) return;
    const origin = window.location.origin;

    /*
     * Картинка выбранной комплектации уезжает в Storage: без неё клиент
     * по ссылке увидит чертёж и смету, но не увидит свою кухню рядом
     * с фотографией своей квартиры.
     */
    if (activeRender?.startsWith('data:')) {
      await fetch('/api/projects/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: props.projectId,
          styleId: renderStyle,
          image: activeRender,
        }),
      }).catch(() => undefined);
    }

    await fetch('/api/projects/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: props.projectId, status: 'sent' }),
    });

    if (props.shareToken) {
      const url = shareUrl(origin, props.shareToken);
      setShare({ url, wa: whatsappLink(url, props.clientName ?? '') });
      await navigator.clipboard?.writeText(url).catch(() => undefined);
    }
  }, [props.projectId, props.shareToken, props.clientName, activeRender, renderStyle]);

  /**
   * «Сохранить как готовый проект».
   *
   * Уходит ряд ЦЕЛИКОМ со снимком цен: на публичной странице планировки
   * клиент увидит ту же сумму и через полгода, когда каталог переоценят.
   * Больше трёх на зону сервер не примет — то же правило, что у компоновок.
   */
  const saveAsReady = useCallback(async () => {
    if (!props.floorPlanId) return;
    setReadyNotice(null);

    try {
      const res = await fetch('/api/complexes/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorPlanId: props.floorPlanId,
          zone,
          title: `${zoneProfile(zone).title} ${active.run.lengthMm} мм`,
          run: active.run,
          priceSnapshot: active.estimate.priceSnapshot,
          total: active.estimate.total,
        }),
      });
      const data = await res.json().catch(() => ({}));

      setReadyNotice(
        res.ok
          ? 'Готовый проект сохранён — он появится на странице этой планировки.'
          : (data.error ?? 'Проект не сохранился.'),
      );
    } catch {
      setReadyNotice('Сети нет — попробуйте ещё раз.');
    }
  }, [props.floorPlanId, zone, active]);

  const saveLabel =
    saveState === 'saving'
      ? 'Сохраняем…'
      : saveState === 'saved'
        ? 'Сохранено'
        : saveState === 'offline'
          ? 'Нет сети — сохранено на планшете'
          : saveState === 'error'
            ? 'Не сохранилось'
            : '';

  /* ── Шаги ── */

  const steps = [
    ...(survey
      ? [{ key: 'survey' as StepKey, title: 'Замер', done: Boolean(survey.finishedAt) }]
      : []),
    { key: 'template' as StepKey, title: 'Шаблон', done: Boolean(templateId) },
    { key: 'compose' as StepKey, title: 'Состав', done: Boolean(templateId) },
    { key: 'materials' as StepKey, title: 'Материалы', done: Boolean(roomPhoto) },
    { key: 'result' as StepKey, title: 'Результат', done: false },
  ];

  const order = steps.map((s) => s.key);
  const index = Math.max(0, order.indexOf(step));
  const goNext = () => setStep(order[Math.min(order.length - 1, index + 1)]);
  const goBack = () => setStep(order[Math.max(0, index - 1)]);

  const nextLabel =
    step === 'survey'
      ? 'К шаблону'
      : step === 'template'
        ? 'К составу'
        : step === 'compose'
          ? 'К материалам'
          : step === 'materials'
            ? 'Показать результат'
            : 'Отправить клиенту';

  const nextDisabled =
    (step === 'template' && !templateId) || (step === 'result' && (blocked || !props.projectId));

  const onNext = () => {
    if (step === 'result') {
      void publish();
      return;
    }
    goNext();
  };

  return (
    <div className="mw-root flex h-screen flex-col overflow-hidden">
      {/* ── Шапка: имя объекта и состояние сохранения, больше ничего ── */}
      <header className="flex items-center gap-3 px-4 py-3 print:hidden">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-medium leading-tight">{props.title}</p>
          <p className="mw-num truncate text-[13px] text-graphiteMw">
            {props.zone} · {props.measuredBy || 'замерщик'} · {props.measuredAt || '—'}
          </p>
        </div>

        <ThemeToggle className="ml-auto" />

        <a
          href="/demo"
          target="_blank"
          rel="noopener noreferrer"
          className="mw-btn mw-btn-ghost hidden sm:inline-flex"
        >
          Показать пример
        </a>

        {props.projectId && saveLabel && (
          <span
            className={`text-[13px] ${
              saveState === 'error'
                ? 'text-alert'
                : saveState === 'offline'
                  ? 'text-tape'
                  : 'text-graphiteMw'
            }`}
          >
            {saveLabel}
          </span>
        )}
      </header>

      <div className="print:hidden">
        <StepBar steps={steps} active={step} onSelect={setStep} />
      </div>

      {props.ratesMissing && (
        <p className="mx-4 mb-2 rounded-[var(--r-control)] bg-navy px-4 py-3 text-[15px] leading-snug text-tape print:hidden">
          Заполните цены каталога, чтобы считать смету.{' '}
          <a href="/admin/catalog" className="text-cyanBright underline">
            Перейти в каталог →
          </a>
        </p>
      )}

      {share && (
        <div className="mx-4 mb-2 flex flex-wrap items-center gap-3 rounded-[var(--r-control)] bg-navy px-4 py-3 print:hidden">
          <span className="text-[15px]">Ссылка скопирована:</span>
          <code className="mw-num text-[13px] text-cyan">{share.url}</code>
          <a
            href={share.wa}
            target="_blank"
            rel="noopener noreferrer"
            className="mw-btn mw-btn-ghost"
          >
            Отправить в WhatsApp
          </a>
          <button
            type="button"
            onClick={() => setShare(null)}
            className="ml-auto text-[13px] text-graphiteMw underline"
          >
            Скрыть
          </button>
        </div>
      )}

      {/* ── Один экран — одна задача ── */}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <p className="mb-4 text-[13px] leading-snug text-graphiteMw print:hidden">
          {STEP_HINT[step]}
        </p>

        {step === 'survey' &&
          survey &&
          (showSheet ? (
            <SurveySheet
              survey={survey}
              title={props.title}
              zone={props.zone}
              onBack={() => setShowSheet(false)}
              onRemeasure={() => setShowSheet(false)}
              onContinue={() => {
                const finished = { ...survey, finishedAt: new Date().toISOString() };
                dirty.current = true;
                setSurvey(finished);
                setShowSheet(false);
                setStep('template');
                props.onSurveyFinish?.(finished);
              }}
            />
          ) : (
            <SurveyPanel
              survey={survey}
              highlightAtMm={warningAt}
              onChange={(next) => {
                dirty.current = true;
                setSurvey(next);
                props.onSurveyChange?.(next);
              }}
              onFinish={() => setShowSheet(true)}
            />
          ))}

        {step === 'template' && (
          <>
            <TemplatePicker
              lengthMm={input.lengthMm}
              zone={zone}
              orgTemplates={props.orgTemplates}
              selectedId={templateId}
              onSelect={(t: RunTemplate) => {
                dirty.current = true;
                setTemplateId(t.id);
                // Правки предыдущего состава к новому шаблону не относятся.
                setEditedRuns({});
                setComposition({});
                setStep('compose');
              }}
            />
            {!templateId && suggested && (
              <p className="mt-4 text-[13px] text-graphiteMw">
                Для ряда {input.lengthMm} мм обычно берут «{suggested.name}».
              </p>
            )}
          </>
        )}

        {/*
          * Размеры из библиотеки: сказать об этом надо раньше, чем замерщик
          * покажет экран клиенту. Строка висит на всех шагах — не только там,
          * где её удобно поставить.
          */}
        {props.libraryNote && (
          <p className="mb-4 rounded-[var(--r-control)] bg-navy px-4 py-3 text-[13px] leading-snug text-tape print:hidden">
            {props.libraryNote}. Сверьте на месте: подставленные величины
            помечены как допущения, смета по ним предварительная.
          </p>
        )}

        {step === 'compose' && (
          <>
            {arrangements.length > 1 && (
              <div className="mb-4">
                <ArrangementCards
                  arrangements={arrangements}
                  /*
                    * Активна та карточка, чей ряд сейчас на экране. Сверяем
                    * отпечатком: правил состав руками — не активна ни одна,
                    * и это честно.
                    */
                  activeKey={
                    arrangements.find((a) => a.run.fingerprint === active.run.fingerprint)?.key ??
                    null
                  }
                  onSelect={chooseArrangement}
                />
              </div>
            )}

            <RunEditor
              run={active.run}
              zone={zone}
              selectedModuleId={selectedId}
              onSelect={setSelectedId}
              onOps={runOps}
              requirements={requirements}
              onComposition={changeComposition}
            />
            {moveNotice && (
              <p className="mt-3 rounded-[var(--r-control)] bg-navy px-4 py-3 text-[13px] leading-snug text-graphiteMw">
                {moveNotice}
              </p>
            )}

            <div className="mt-4">
              <CommandBar onSubmit={sendCommand} busy={busy} lastReply={reply} />
            </div>
          </>
        )}

        {step === 'materials' && (
          <>
            <CatalogLoader />
            <MaterialsStep
              zone={zone}
              kitchenItemId={kitchenItemId}
              roomPhoto={roomPhoto}
              onPhotoChange={(next) => {
                dirty.current = true;
                setRoomPhoto(next);
              }}
              angle={renderAngle}
              onAngleChange={setRenderAngle}
              onOpenPhoto={setZoom}
            />
          </>
        )}

        {step === 'result' && (
          <>
            {/*
              * Сравнение — главный экран продажи, а не иллюстрация к чертежу.
              * Клиент смотрит на свою квартиру с кухней; чертёж, план и смета
              * нужны потом и живут ниже.
              */}
            <BeforeAfter
              photo={roomPhoto}
              render={activeRender}
              title="Ваша кухня"
              heightClass="h-[70vh] min-h-[320px]"
              onAddPhoto={() => setStep('materials')}
              onOpen={setZoom}
              emptyAction={
                /* Кнопка прямо в пустой половине: под сравнением её не видно
                   без прокрутки, и рендер выглядит неработающим. */
                <button
                  type="button"
                  onClick={() => void render.render()}
                  disabled={render.busy}
                  className="mw-btn mw-btn-lg mw-btn-primary text-[17px]"
                >
                  {render.busy ? 'Снимаем кадр…' : 'Отрисовать кухню'}
                </button>
              }
            />

            <div className="mt-5">
              <RenderPanel
                variants={variants}
                roomPhoto={roomPhoto}
                onOpen={setZoom}
                styleId={renderStyle}
                onStyleChange={(id) => {
                  dirty.current = true;
                  setRenderStyle(id);
                }}
                busy={render.busy}
                error={render.error}
                onRender={() => void render.render()}
                onRerender={(variant) => void render.rerender(variant)}
              />
            </div>

            {/* Ниже — документы: чертёж, план и техническая сцена. */}
            <div className="mt-6 flex flex-wrap gap-2 print:hidden">
              {(
                [
                  ['facade', 'Чертёж'],
                  ['plan', 'План'],
                  ['scene', '3D'],
                  ['panels', 'Детализировка'],
                ] as [ResultView, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setResultView(key)}
                  aria-pressed={resultView === key}
                  className={`mw-btn ${resultView === key ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                >
                  {label}
                </button>
              ))}
              {/*
                * Из этого объекта получается витрина для сотен одинаковых
                * квартир: тот же ряд, та же цена, публичная страница.
                */}
              {props.floorPlanId && (
                <button
                  type="button"
                  onClick={() => void saveAsReady()}
                  className="mw-btn mw-btn-ghost"
                >
                  Сохранить как готовый проект
                </button>
              )}

              <button
                type="button"
                onClick={() => window.print()}
                className="mw-btn mw-btn-ghost ml-auto"
              >
                Печать чертежа
              </button>
            </div>

            {/*
              * Сцена нужна ещё и для захвата кадра, поэтому она смонтирована
              * всегда: на виде «3D» — во всю высоту, иначе уезжает за экран.
              * `display:none` не годится — канвас нулевого размера не рисуется.
              */}
            <CatalogLoader />
            <div
              className={
                resultView === 'scene'
                  ? 'mt-4 h-[460px] overflow-hidden rounded-[var(--r-panel)] bg-navyDeep print:hidden'
                  : 'mw-scene-hidden fixed left-[-3000px] top-0 h-[220px] w-[340px] opacity-0'
              }
              aria-hidden={resultView !== 'scene'}
            >
              <KitchenScene
                run={active.run}
                ceilingHeightMm={props.ceilingHeightMm}
                roomDepthM={props.roomDepthM}
                hidden={resultView !== 'scene'}
                interactive
                production={props.production}
                view={sceneView}
                onItemId={setKitchenItemId}
              />
            </div>
            {resultView === 'scene' && (
              <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => setOpenParts(openablePartIds(active.run))}
                  className="mw-btn mw-btn-primary"
                >
                  Открыть всё
                </button>
                <button
                  type="button"
                  onClick={closeAllParts}
                  disabled={openParts.length === 0}
                  className="mw-btn mw-btn-ghost"
                >
                  Закрыть всё
                </button>

                {/* Разрез убирает фасады совсем: наполнение видно целиком. */}
                {(
                  [
                    [false, 'Только фасады'],
                    [true, 'Разрез'],
                  ] as [boolean, string][]
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setCutaway(value)}
                    aria-pressed={cutaway === value}
                    className={`mw-btn ${cutaway === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    {label}
                  </button>
                ))}

                {/* Ракурс: фронтальный вид плоский, объём даёт «три четверти». */}
                {(Object.keys(SCENE_VIEW_LABEL) as SceneView[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSceneView(value)}
                    aria-pressed={sceneView === value}
                    className={`mw-btn ${sceneView === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    {SCENE_VIEW_LABEL[value]}
                  </button>
                ))}

                <p className="w-full text-[13px] leading-snug text-graphiteMw">
                  Нажмите на ящик или дверцу — откроется.
                </p>
              </div>
            )}

            {resultView === 'scene' && (
              <p className="mt-2 text-[13px] leading-snug text-graphiteMw">
                Гарнитур собран из тех же {active.run.modules.length} модулей, что
                чертёж и смета.
                {/* Отпечаток — сверка для нас, а не разговор с клиентом. */}
                {debug && ` Отпечаток ${active.run.fingerprint}.`}
              </p>
            )}

            {/* Эскиз в двух видах: фасады клиенту, разрез цеху. */}
            {resultView === 'facade' && (
              <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                {(
                  [
                    ['fronts', 'С фасадами'],
                    ['inside', 'Внутри'],
                  ] as [DrawingMode, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDrawingMode(value)}
                    aria-pressed={drawingMode === value}
                    className={`mw-btn ${drawingMode === value ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                  >
                    {label}
                  </button>
                ))}
                {drawingMode === 'inside' ? (
                  <p className="self-center text-[13px] leading-snug text-graphiteMw">
                    Полку тяните мышью, двойной клик добавляет и убирает её.
                  </p>
                ) : (
                  <p className="self-center text-[13px] leading-snug text-graphiteMw">
                    Технику можно перетащить: тяните модуль вдоль ряда.
                  </p>
                )}

                {/* Кнопка видна, только когда есть что возвращать. */}
                {Object.keys(manualAnchors).length > 0 && (
                  <button type="button" onClick={resetAnchors} className="mw-btn mw-btn-ghost">
                    Вернуть автоматическую расстановку
                  </button>
                )}
              </div>
            )}

            {moveNotice && (
              <p className="mt-3 rounded-[var(--r-control)] bg-alert/15 px-4 py-3 text-[13px] leading-snug text-alert print:hidden">
                {moveNotice}
              </p>
            )}

            {readyNotice && (
              <p className="mt-3 rounded-[var(--r-control)] bg-navy px-4 py-3 text-[13px] leading-snug text-graphiteMw print:hidden">
                {readyNotice}
              </p>
            )}

            {/* Детализировка — лист для цеха, а не для клиента. */}
            {resultView === 'panels' && (
              <div className="mt-4">
                <PanelList
                  run={active.run}
                  title={props.title}
                  zone={props.zone}
                  measuredBy={props.measuredBy}
                  measuredAt={props.measuredAt}
                  production={props.production}
                />
              </div>
            )}

            <div
              className={
                resultView === 'scene' || resultView === 'panels'
                  ? 'mt-4 hidden print:block'
                  : 'mt-4'
              }
            >
              <DrawingSheet
                title={props.title}
                zone={props.zone}
                measuredBy={props.measuredBy}
                measuredAt={props.measuredAt}
                variantTitle={active.title}
                pending={resolution?.stats.pending.map((p) => p.where) ?? []}
                notes={survey?.clientNotes}
              >
                {resultView !== 'plan' ? (
                  <ElevationDrawing
                    run={active.run}
                    assumedTotal={assumedTotal}
                    selectedModuleId={selectedId}
                    onSelect={setSelectedId}
                    changedIds={changedIds}
                    mode={drawingMode}
                    onFillChange={changeFill}
                    onMoveAppliance={moveAppliance}
                    variants={variantOptions}
                    onVariant={chooseVariant}
                  />
                ) : (
                  <PlanDrawing
                    run={active.run}
                    comms={input.comms}
                    issues={issues}
                    selectedModuleId={selectedId}
                    onSelect={setSelectedId}
                  />
                )}
              </DrawingSheet>
            </div>
          </>
        )}

        {/* ── Предупреждения: не больше двух, повторы схлопнуты ── */}
        {softWarnings.length > 0 && (
          <ul className="mt-5 grid gap-2 print:hidden">
            {(showAllWarnings ? softWarnings : shownSoft).map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (w.moduleId) setSelectedId(w.moduleId);
                    setWarningAt(w.atMm ?? null);
                    if (step === 'result') setResultView('plan');
                  }}
                  className="w-full rounded-[var(--r-control)] bg-navy px-4 py-3 text-left text-[13px] leading-snug text-graphiteMw"
                >
                  <span className="mr-2 text-tape">●</span>
                  {w.message}
                </button>
              </li>
            ))}
            {hiddenSoft > 0 && !showAllWarnings && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAllWarnings(true)}
                  className="text-[13px] text-graphiteMw underline"
                >
                  ещё {hiddenSoft}
                </button>
              </li>
            )}
          </ul>
        )}
      </main>

      {/* ── Низ экрана: зона большого пальца ── */}
      <footer className="border-t border-navyLine/60 bg-navyDeep px-4 pb-4 pt-3 print:hidden">
        {blockingWarnings.length > 0 && (
          <p className="mb-3 rounded-[var(--r-control)] bg-alert/15 px-4 py-3 text-[15px] leading-snug text-alert">
            {blockingWarnings[0].message}
            {blockingWarnings.length > 1 && ` И ещё ${blockingWarnings.length - 1}.`}
          </p>
        )}

        <div className="mb-3">
          <EstimateSheet
            estimate={active.estimate}
            /* Комплектация одна, поэтому строка итога называет ЗОНУ:
               «Ваша кухня» в спальне читается как чужой проект. */
            variantTitle={SINGLE_VARIANT ? zoneProfile(zone).yours : active.title}
            disabledKeys={disabled[active.key]}
            onToggle={toggleLine}
            open={estimateOpen}
            onOpenChange={setEstimateOpen}
            preliminary={preliminary}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={index === 0}
            className="mw-btn mw-btn-lg mw-btn-ghost"
          >
            Назад
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            title={
              step === 'result' && blocked
                ? 'Сначала разберитесь с красным расхождением — на объекте это переделка'
                : undefined
            }
            className="mw-btn mw-btn-lg mw-btn-primary flex-1"
          >
            {nextLabel}
          </button>
        </div>
      </footer>

      {zoom && (
        <button
          type="button"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-navyDeep/95 p-4 print:hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      )}
    </div>
  );
}
