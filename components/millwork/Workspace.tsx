'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInteriorStore } from '@/store/useInteriorStore';
import dynamic from 'next/dynamic';
import ThemeToggle from '@/components/ThemeToggle';
import BeforeAfter from './BeforeAfter';
import CommandBar from './CommandBar';
import DrawingSheet from './DrawingSheet';
import VariantStrip, { type VariantPreview } from './VariantStrip';
import FrontMaterialPicker from './FrontMaterialPicker';
import OpeningPicker from './OpeningPicker';
import RunSchematic from './RunSchematic';
import { hasFacade } from '@/lib/millwork/applianceFront';
import { frontOf } from '@/lib/millwork/frontMaterial';
import { paletteFromCatalog } from '@/lib/millwork/palette';
import { buildComposition } from '@/lib/millwork/composition';
import { compositionOf, mergeEstimates, wallLabel } from '@/lib/millwork/walls';
import { openingAssumptions } from '@/lib/millwork/warnings';
import { CORNER, CORNER_SIZE_MM } from '@/lib/millwork/modules';

/** Решение угла: модуль 900×900 или фальш-панель. */
type CornerSolution = 'corner_module' | 'false_panel';
import { compressPhoto } from '@/lib/photo';
import FrontSwatchCards from './FrontSwatchCards';
import {
  RUN_DESIGNS,
  designAvailability,
  designOps,
  designSummary,
} from '@/lib/millwork/designs';
import { applyVariant } from '@/lib/millwork/moduleVariants';
import { moduleCarcassHeightMm } from '@/lib/millwork/fill';
import type { DrawingMode } from './ElevationDrawing';
import EstimateSheet from './EstimateSheet';
import MaterialsStep from './MaterialsStep';
import PanelList from './PanelList';
import RenderPanel from './RenderPanel';
import { DEMO_QUOTA_HINT, DEMO_QUOTA_SPENT } from '@/lib/plan';
import ArrangementCards from './ArrangementCards';
import RunEditor, { type CompositionPatch } from './RunEditor';
import SolutionGallery from './SolutionGallery';
import StepBar, { type StepKey } from './StepBar';
import SurveyPanel from './SurveyPanel';
import SurveySheet from './SurveySheet';
import TemplatePicker from './TemplatePicker';
import type { RateTable } from '@/lib/millwork/estimate';
import { applyOps } from '@/lib/millwork/ops';
import { buildEstimate } from '@/lib/millwork/estimate';
import {
  MODULE_VARIANTS,
  currentVariant,
  variantsForModule,
} from '@/lib/millwork/moduleVariants';
import { allModules } from '@/lib/millwork/layout';
import { buildRun } from '@/lib/millwork/layout';
import { manualAnchorCost, widthOverflowMm } from '@/lib/millwork/invariants';
import {
  APPLIANCE_SLOTS,
  MAX_WIDTH,
  MIN_WIDTH,
  moduleAppliances,
} from '@/lib/millwork/modules';
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
  CompositionKind,
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

/*
 * Техническая аксонометрия — то, что видит замерщик на виде «3D».
 *
 * Она заменила интерьерную сцену В ИНТЕРФЕЙСЕ, но не в продукте: старая
 * `KitchenScene` осталась смонтированной за экраном, потому что именно она
 * регистрирует захват кадра (`registerCapture` внутри `RoomCanvas`) и даёт
 * clay-проход для промпта визуализации. Вырви её — генерация перестанет
 * работать, а узнается это только на первой отрисовке у клиента.
 */

const CatalogLoader = dynamic(() => import('@/components/CatalogLoader'), { ssr: false });

/** Чем смотреть результат. Чертёж плотный намеренно — это документ. */
type ResultView = 'facade' | 'panels';

const STEP_HINT: Record<StepKey, string> = {
  survey: 'Меряем по низу стены, у пола: вверху стены новостройки кривые.',
  template: 'Выберите типовое решение — длина подставится из замера.',
  studio:
    'Нажмите на модуль в сцене: справа его варианты и материал, внизу — сумма. ' +
    'Всё пересчитывается на месте.',
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
  /**
   * Демонстрационный доступ организации (`plan='demo'`).
   *
   * Живая отрисовка у неё выключена НА СЕРВЕРЕ (`lib/aiAccess.ts`); здесь
   * мы только не показываем кнопку, которая всё равно ответит отказом.
   * Одно без другого не работает: спрятанная кнопка — не защита, а
   * работающая кнопка с красной строкой — плохая демонстрация.
   */
  demoPlan?: boolean;
  /**
   * Единственная визуализация демо-режима уже потрачена.
   *
   * Приходит с сервера, посчитанная по строкам `ai_generations`. Это
   * ПОДСКАЗКА, а не защита: отказывает роут (`lib/aiAccess.ts`), здесь мы
   * только не даём человеку нажать кнопку, которая ответит отказом.
   */
  demoRenderSpent?: boolean;
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
  /** Компания: логотип и телефон уходят в штамп чертежа. */
  company?: { name?: string; phone?: string; logoUrl?: string | null };
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
  /** Жёлтая строка под сценой: правку не отменяем, но о последствии говорим. */
  const [sceneNotice, setSceneNotice] = useState<string | null>(null);

  /*
   * КАКОЙ ВИД ПОКАЗАН И СПРЯТАНА ЛИ ПАНЕЛЬ.
   *
   * Панель уезжает в 3D и возвращается кнопкой. Два поля, а не одно:
   * «показан 3D» — факт вида, «панель спрятана» — решение человека, и
   * вернув её однажды, он не должен возвращать её на каждом переключении.
   */
  const [schematicView, setSchematicView] = useState<'front' | 'plan' | 'scene'>('front');
  const [panelHidden, setPanelHidden] = useState(true);
  const wideScene = schematicView === 'scene' && panelHidden;

  /*
   * Первый шаг — тот, где работа ещё не сделана: незавершённый замер ведёт
   * на замер, невыбранный шаблон — на шаблон, всё остальное — на состав.
   */
  const startSurvey = props.initialState?.survey ?? props.survey ?? null;
  const [step, setStep] = useState<StepKey>(
    startSurvey && !startSurvey.finishedAt
      ? 'survey'
      : (props.initialState?.templateId ?? props.templateId)
        ? 'studio'
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
  /*
   * Ракурс скрытой сцены зафиксирован: её больше никто не смотрит, она
   * только снимает clay-кадр. Переключатель точек съёмки жил при
   * интерьерном виде и вместе с ним ушёл.
   */
  const sceneView: SceneView = DEFAULT_SCENE_VIEW;
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [renderAngle, setRenderAngle] = useState<RunAngle>('front');

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

  /**
   * Снимок перед выбором решения.
   *
   * Замерщик перебирает решения при клиенте и должен иметь возможность
   * вернуться к тому, что понравилось. Живёт до следующего выбора: это
   * «отменить последнее», а не история правок.
   */
  const [previous, setPrevious] = useState<{
    templateId: string | null;
    name: string;
    composition: CompositionPatch;
    manualAnchors: NonNullable<RunRequirements['manualAnchors']>;
    editedRuns: Partial<Record<VariantKey, Run>>;
    /**
     * Режим сборки на момент снимка.
     *
     * Без него «вернуть» возвращало состав, но не путь: человек собирал
     * ряд руками двадцать минут, уходил в готовое решение, нажимал
     * «вернуть» — и получал шаблон с чужой раскладкой.
     */
    freeMode: boolean;
    /** Сколько модулей было собрано руками: это и есть цена ухода. */
    freeModules: number;
  } | null>(null);

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
    applianceTypes: props.initialState?.requirements?.applianceTypes,
    upperToCeiling: props.initialState?.requirements?.options?.upperToCeiling,
  });

  const [templateId, setTemplateId] = useState<string | null>(
    props.initialState?.templateId ?? props.templateId ?? null,
  );

  /*
   * СВОБОДНАЯ СБОРКА.
   *
   * Шаблон остаётся быстрым стартом, но перестаёт быть единственным путём:
   * мебельщик спрашивает «сможешь сделать мой дизайн», и ответ на это —
   * пустая стена, которую он наполняет сам. Признак живёт рядом с
   * `templateId` и исключает его: либо готовое решение, либо своё.
   */
  /*
   * ФОРМА ГАРНИТУРА И АКТИВНАЯ СТЕНА.
   *
   * Угловая кухня — половина заказов, и до сих пор руками её было не
   * собрать: рабочее место знало ровно один ряд. Теперь форма выбирается
   * здесь, а стены переключаются: работа идёт по одной, но обе видны на
   * схеме — соседняя контуром, чтобы было видно, где угол.
   *
   * Раскладку по-прежнему считает `buildRun`, правки идут через
   * `applyOps`. Второго пути записи не появляется.
   */
  const [shape, setShape] = useState<CompositionKind>(
    props.initialState?.shape ?? 'linear',
  );
  const [wallIndex, setWallIndex] = useState(0);
  const [cornerSolution, setCornerSolution] = useState<CornerSolution>(
    props.initialState?.cornerSolution ?? 'false_panel',
  );
  /**
   * Правки соседних стен: у стены А для этого есть `editedRuns`.
   *
   * Восстанавливаются из сохранённого состояния, как и всё остальное:
   * объект обязан открыться ровно таким, каким его закрыли (ловушка 42).
   * Ключи в базе строковые — JSON других не знает.
   */
  const [editedWalls, setEditedWalls] = useState<Record<number, Run>>(() => {
    const saved = props.initialState?.wallRuns ?? {};
    const out: Record<number, Run> = {};
    for (const [key, run] of Object.entries(saved)) {
      const index = Number(key);
      if (Number.isInteger(index) && index > 0) out[index] = run;
    }
    return out;
  });

  const [freeMode, setFreeMode] = useState(
    props.initialState?.requirements?.mode === 'free',
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
   * КВОТА ПОТРАЧЕНА — по факту, а не по счётчику.
   *
   * С сервера приходит состояние на момент открытия; успешная отрисовка
   * прямо сейчас добавляется к нему, иначе кнопка осталась бы рабочей до
   * перезагрузки. Считаем именно КАРТИНКУ: упавшая попытка квоту не жжёт,
   * и запрещать после неё было бы враньём.
   */
  const demoSpent =
    Boolean(props.demoPlan) &&
    (Boolean(props.demoRenderSpent) || renderVariants.some((v) => v.status === 'done'));
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
      applianceWalls: composition.applianceWalls ?? base.applianceWalls,
      applianceSizes: composition.applianceSizes ?? base.applianceSizes,
      applianceTypes: composition.applianceTypes ?? base.applianceTypes,
      manualAnchors: {},
      options: {
        ...base.options,
        upperToCeiling: composition.upperToCeiling ?? base.options.upperToCeiling,
      },
      /*
       * ВЫСОТА ВЕРХНЕГО РЯДА ЗАПЕРТА ВСЕГДА.
       *
       * Замок ставился только тогда, когда человек трогал переключатель
       * руками. Пришла опция из шаблона или из умолчаний — стратегия
       * комплектации молча возвращала своё: `optimal` ставит
       * `upperToCeiling: false`, и переключатель показывал «до потолка»,
       * а между шкафами и потолком оставалось 530 мм.
       *
       * Значение в `options` — это ответ, кто бы его ни дал. Стратегии
       * незачем спорить с видимым переключателем (ловушка 108).
       */
      lockedOptions: ['upperToCeiling'],
    } as RunRequirements;
  }, [template, props.requirements, composition]);

  const requirements = useMemo(() => {
    const base = template
      ? requirementsFromTemplate(template, props.requirements.options)
      : props.requirements;

    /*
     * В свободной сборке техника НЕ подставляется: стена пустая, и всё,
     * что на ней появится, ставит человек. Иначе «собрать самому» начиналось
     * бы с чужого холодильника.
     */
    const next: RunRequirements = {
      ...base,
      mode: freeMode ? 'free' : 'template',
      ...(freeMode ? { appliances: composition.appliances ?? [], sections: [] } : {}),
      appliances: composition.appliances ?? base.appliances,
      sections: composition.sections ?? base.sections,
      doorSystem: composition.doorSystem ?? base.doorSystem,
      tallSide: composition.tallSide ?? base.tallSide,
      columnTop: composition.columnTop ?? base.columnTop,
      fridgeType: composition.fridgeType ?? base.fridgeType,
      glassDisplay: composition.glassDisplay ?? base.glassDisplay,
      /*
       * Прибор принадлежит КУХНЕ: и стена, на которой он стоит, и его
       * габариты живут в составе композиции, а не в ряду. Иначе перенос
       * на другую стену терял бы введённые размеры — прибор переезжал
       * бы паспортным, а не тем, что замерили.
       */
      applianceWalls: composition.applianceWalls ?? base.applianceWalls,
      applianceSizes: composition.applianceSizes ?? base.applianceSizes,
      applianceTypes: composition.applianceTypes ?? base.applianceTypes,
      options: {
        ...base.options,
        upperToCeiling: composition.upperToCeiling ?? base.options.upperToCeiling,
      },
      /*
       * Выбор человека сильнее стратегии комплектации: иначе «до потолка»
       * нажимается, а верхний ряд остаётся стандартным — стратегия
       * `optimal` перекрывает эту опцию своей.
       */
      /*
       * ВЫСОТА ВЕРХНЕГО РЯДА ЗАПЕРТА ВСЕГДА.
       *
       * Замок ставился только тогда, когда человек трогал переключатель
       * руками. Пришла опция из шаблона или из умолчаний — стратегия
       * комплектации молча возвращала своё: `optimal` ставит
       * `upperToCeiling: false`, и переключатель показывал «до потолка»,
       * а между шкафами и потолком оставалось 530 мм.
       *
       * Значение в `options` — это ответ, кто бы его ни дал. Стратегии
       * незачем спорить с видимым переключателем (ловушка 108).
       */
      lockedOptions: ['upperToCeiling'],
    };

    return Object.keys(manualAnchors).length > 0 ? { ...next, manualAnchors } : next;
  }, [template, props.requirements, manualAnchors, composition, freeMode]);

  /**
   * ДЛИНА РАБОЧЕЙ СТЕНЫ — ОТДЕЛЬНО ОТ СОСТАВА.
   *
   * Её даёт замер, и приборы на неё не влияют. Считаем её раньше всего
   * остального: от неё зависят и список стен, и раздача приборов по
   * стенам, а они, в свою очередь, нужны для сборки самой стены А.
   * Без этого получается круг: состав ждёт длину, длина ждёт состав.
   */
  const runLengthMm = useMemo(() => {
    if (!resolution) return props.lengthMm;
    const seed = workspaceInput({
      title: props.title,
      zone: props.zone,
      measurement: resolution.measurement,
      requirements: props.requirements,
      rates: props.rates,
      wallId: resolution.runWallId,
      cornerAt: props.cornerAt ?? null,
    });
    return seed.lengthMm > 0 ? seed.lengthMm : props.lengthMm;
  }, [resolution, props]);

  /** Стены композиции: рабочая плюс соседние из замера. */
  const walls = useMemo(() => {
    const measured = (survey?.walls ?? [])
      .map((wall) => ({
        id: wall.id,
        lengthMm: wall.lengthMm.state === 'unknown' ? 0 : Math.round(wall.lengthMm.value),
        openings: [] as typeof props.openings,
      }))
      .filter((wall) => wall.lengthMm > 0);

    const first = { id: 'a', lengthMm: runLengthMm, openings: props.openings };
    const rest = measured.filter((wall) => wall.lengthMm !== runLengthMm);
    const fallback = Math.round((props.roomDepthM ?? 0) * 1000);

    const list = [first, ...rest];
    while (list.length < 3 && fallback > 0) {
      list.push({ id: `w${list.length}`, lengthMm: fallback, openings: [] });
    }
    return list;
  }, [survey, runLengthMm, props.openings, props.roomDepthM]);

  /** Высота потолка: нужна и композиции, и сборке стены А. */
  const ceilingMm = useMemo(
    () => resolution?.measurement?.ceilingHeightMm ?? props.ceilingHeightMm,
    [resolution, props.ceilingHeightMm],
  );

  /**
   * КОМПОЗИЦИЯ СЧИТАЕТСЯ ДО СБОРКИ СТЕНЫ А.
   *
   * Она и раздаёт приборы по стенам: холодильник один, и стоит он на
   * одной стене. Рабочее место раньше собирало стену А своими
   * средствами — из ПОЛНОГО набора требований, — и холодильник
   * появлялся дважды: на стене А и на той, куда его отдала раздача.
   * Удалить его можно было только вместе с тем, что стоит на главной.
   *
   * Раздача ОДНА и живёт в композиции. Считать её здесь второй раз —
   * это ровно тот класс ошибки, от которого продукт лечится уже
   * одиннадцатый раз: два расчёта одной величины расходятся молча.
   */
  const layout = useMemo(() => {
    if (shape === 'linear') return null;
    try {
      return buildComposition({
        id: 'ws',
        kind: shape,
        requirements: { ...requirements, cornerSolution },
        ceilingHeightMm: ceilingMm,
        walls,
        comms: props.comms,
      });
    } catch {
      return null;
    }
  }, [shape, requirements, cornerSolution, ceilingMm, walls, props.comms]);

  /** Требования СТЕНЫ А: её доля приборов из композиции, а не весь набор. */
  const wallRequirements = useMemo(
    () =>
      layout ? { ...requirements, appliances: layout.segments[0].appliances } : requirements,
    [layout, requirements],
  );

  const input = useMemo(() => {
    if (!resolution) {
      return {
        title: props.title,
        zone: props.zone,
        measuredBy: props.measuredBy,
        measuredAt: props.measuredAt,
        lengthMm: props.lengthMm,
        ceilingHeightMm: props.ceilingHeightMm,
        requirements: wallRequirements,
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
      requirements: wallRequirements,
      rates: props.rates,
      wallId: resolution.runWallId,
      cornerAt: props.cornerAt ?? null,
    });

    // Пока стены не введены, ряд брать неоткуда — держим габарит из пропсов.
    return seed.lengthMm > 0 ? seed : { ...seed, lengthMm: props.lengthMm };
  }, [resolution, wallRequirements, props]);

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

  /*
   * СТЕНЫ ДЛЯ КОМПОЗИЦИИ.
   *
   * Первая — рабочая стена ряда, она уже посчитана. Остальные берутся из
   * замера по кругу: длина соседней стены это факт обмера, а не догадка.
   * Замера нет — берём глубину помещения, ту же, из которой строится 3D.
   */


  /**
   * Композиция: та же, что собирает шаблон, и тем же кодом.
   *
   * Разваливается на исключении — угол по одной стене не собрать, и это
   * честнее пустого результата. Ловим и говорим словами.
   */


  const active = variants.find((v) => v.key === variantKey) ?? variants[0];

  /*
   * АКТИВНЫЙ РЯД — ТОТ, ЧЬЯ СТЕНА ВЫБРАНА.
   *
   * Стена А это `active.run`: на ней держится всё, что уже работает —
   * комплектации, компоновки, сохранение. Соседние стены живут своими
   * рядами и правятся ТЕМИ ЖЕ операциями.
   */
  const segments = useMemo(() => {
    if (!layout) return [active.run];
    return layout.segments.map((segment, i) =>
      i === 0 ? active.run : (editedWalls[i] ?? segment.run),
    );
  }, [layout, active.run, editedWalls]);

  const wall = Math.min(wallIndex, segments.length - 1);
  const activeRun = segments[wall] ?? active.run;
  /** Соседний ряд: на схеме он идёт контуром, чтобы был виден угол. */
  const neighbourRun = layout ? (segments[wall === 0 ? 1 : wall - 1] ?? null) : null;

  /**
   * СМЕТА ВСЕГО ОБЪЕКТА, А НЕ ОДНОЙ СТЕНЫ.
   *
   * Складываются сметы рядов — по ключу статьи, тем же, по которому они
   * группируются в пять групп. Второй расчёт угловой кухни разошёлся бы
   * с первым на первой же правке ставок.
   */
  /**
   * ОТПЕЧАТОК ОБЪЕКТА — ОТ КОМПОЗИЦИИ, А НЕ ОТ ОДНОЙ СТЕНЫ.
   *
   * Главное правило продукта: чертёж, смета, раскрой и рендер сверяются
   * ОДНИМ числом. Пока угловая кухня несла отпечаток стены А, правка на
   * стене Б его не меняла — смета и лист могли разъехаться молча.
   *
   * У прямой кухни это по-прежнему отпечаток ряда: один ряд — одно
   * число, и отпечатки сохранённых объектов не едут.
   */
  const objectFingerprint = useMemo(() => {
    if (!layout) return active.run.fingerprint;
    return compositionOf(layout, segments).fingerprint;
  }, [layout, segments, active.run.fingerprint]);

  /*
   * ЧТО В СМЕТЕ ПОСЧИТАНО УМОЛЧАНИЕМ.
   *
   * Направление открывания у верхних фасадов раньше выводилось из ряда:
   * каждый получал газлифт, хотя никто его не выбирал. Теперь умолчание —
   * петли, и оно названо вслух РЯДОМ С СУММОЙ: цена этого умолчания
   * именно там и видна.
   */
  const estimateAssumptions = useMemo(
    () => segments.flatMap((run) => openingAssumptions(run)).map((w) => w.message),
    [segments],
  );

  const estimate = useMemo(() => {
    if (!layout) return active.estimate;
    return mergeEstimates(
      segments.map((run, i) =>
        i === 0
          ? active.estimate
          : buildEstimate(
              run,
              variantKey,
              input.rates,
              disabled[variantKey],
              undefined,
              props.production,
            ),
      ),
    );
  }, [layout, segments, active.estimate, variantKey, input.rates, disabled, props.production]);

  /*
   * Смета объекта несёт отпечаток ОБЪЕКТА. Иначе она подписана числом
   * одной стены, а посчитана по всем — ровно то расхождение, от которого
   * отпечаток и защищает.
   */
  const objectEstimate = useMemo(
    () => (layout ? { ...estimate, fingerprint: objectFingerprint } : estimate),
    [estimate, layout, objectFingerprint],
  );

  /**
   * РЯДЫ ДЛЯ СЦЕНЫ: УГОЛ СОБИРАЕТСЯ ЗДЕСЬ, А НЕ В СЦЕНЕ.
   *
   * Сцена не считает раскладку — она её показывает. Каждый ряд
   * по-прежнему собран `buildRun` вдоль своей стены от нуля; здесь
   * только поворот вокруг угла и смещение на то, что угол занял.
   *
   * Ряд Б развёрнут на 90° и начинается ТАМ, ГДЕ КОНЧАЕТСЯ занятое
   * первым: при фальш-панели это глубина ряда плюс панель, при угловом
   * модуле — 900 мм. Те же числа, что урезали его полезную длину, иначе
   * ряды в сцене разъедутся с тем, что посчитала смета.
   */
  const sceneRows = useMemo(() => {
    const depthM = zoneProfile(zone).depthMm / 1000;
    if (!layout) return segments.map((run) => ({ run }));

    const lostM =
      cornerSolution === 'corner_module' ? CORNER_SIZE_MM / 1000 : depthM + CORNER.falsePanelMm / 1000;

    return segments.map((run, i) => {
      if (i === 0) return { run };

      /*
       * Каждый следующий ряд поворачивается ещё на 90° и стартует от
       * дальнего края предыдущего. Для П-образной это даёт две стойки
       * и перемычку между ними.
       */
      const prev = segments[i - 1];
      const prevLenM = prev.lengthMm / 1000;

      return {
        run,
        placement: {
          xM: i === 1 ? prevLenM / 2 : -prevLenM / 2,
          zM: i === 1 ? -lostM : -lostM,
          rotationYDeg: i === 1 ? -90 : 90,
        },
      };
    });
  }, [layout, segments, cornerSolution, zone]);

  const issues = useMemo(
    () => validateRun(activeRun, props.comms),
    [activeRun, props.comms],
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
    // Правку приняли — прошлый отказ больше не про эту мебель.
    setMoveNotice(null);

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
  /**
   * ПЕРЕНОС МОДУЛЯ ВДОЛЬ РЯДА — свободная сборка.
   *
   * Идёт через `applyOps`, как и всё остальное в свободной сборке: второй
   * путь записи развёл бы отпечаток, а с ним чертёж, смету, раскрой и 3D.
   * Отказ — не исключение, а строка: соседи не раздвигаются, поэтому
   * упереться в стоящий рядом модуль это нормальный ход событий, а не
   * поломка.
   */
  /**
   * ГОТОВЫЙ ДИЗАЙН НА ВЕСЬ РЯД.
   *
   * Один тап кладёт фасады низа и верха, столешницу и ручки. Идёт теми же
   * операциями, что и поштучная правка, поэтому после дизайна замерщик
   * правит модуль за модулем, и его правка сильнее: она применяется
   * позже и переписывает то, что положил дизайн.
   */
  const applyDesign = (designId: string) => {
    const design = RUN_DESIGNS.find((d) => d.id === designId);
    if (!design) return;

    const availability = designAvailability(design, input.rates);
    if (!availability.available) {
      setMoveNotice(availability.reason);
      return;
    }

    const uppers = active.run.upperSegments
      .flatMap((segment) => segment.modules)
      .map((unit) => unit.id);

    const next = applyOps({
      run: active.run,
      requirements,
      ops: designOps(design, uppers),
      openings: props.openings,
      roomDepthMm: Math.round((props.roomDepthM ?? 0) * 1000),
    });

    dirty.current = true;
    setEditedRuns((prev) => ({ ...prev, [active.key]: next }));
    setMoveNotice(
      next.warnings[0] ??
        `Дизайн «${design.name}» применён ко всему ряду. Отдельный модуль можно поменять — правка сильнее дизайна.`,
    );
  };

  const moveModule = (moduleId: string, offsetMm: number) => {
    const next = applyOps({
      run: active.run,
      requirements,
      ops: [{ op: 'move_module', moduleId, offsetMm }],
      openings: props.openings,
      roomDepthMm: Math.round((props.roomDepthM ?? 0) * 1000),
    });

    if (next.warnings.length > 0) {
      setMoveNotice(next.warnings[0]);
      return;
    }

    setMoveNotice(null);
    dirty.current = true;
    setEditedRuns((prev) => ({ ...prev, [active.key]: next }));
    // Идентификатор выводится из позиции: подвинули — модуль стал другим id.
    setSelectedId(
      next.modules.find((m) => m.offsetMm === Math.round(offsetMm / 50) * 50)?.id ?? null,
    );
  };

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
  /** Как называется выбранный модуль: подпись над лентой превью. */
  const selectedLabel = useMemo(() => {
    if (!selectedId) return null;
    const unit = allModules(active.run).find((m) => m.id === selectedId);
    return unit ? `${unit.label} ${unit.widthMm} мм` : null;
  }, [selectedId, active.run]);

  /**
   * ПАЛИТРА ЭТОЙ ОРГАНИЗАЦИИ.
   *
   * Каталог уже лежит в сторе — тот же, из которого берутся ставки и
   * текстуры. Второго источника цветов нет: список в коде показывал бы
   * клиенту декоры, которых компания не продаёт.
   */
  const catalog = useInteriorStore((s) => s.catalog);
  const palette = useMemo(() => paletteFromCatalog(catalog), [catalog]);

  /** Выделенный модуль целиком: материал показывается по нему. */
  /*
   * ВЫДЕЛЕННЫЙ МОДУЛЬ ИЩЕТСЯ В ВЫБРАННОЙ СТЕНЕ, А НЕ В ПЕРВОЙ.
   *
   * Искали в `active.run` — это всегда стена А. Модуль стены Б
   * выделялся на схеме, но панель под ним оставалась пустой: материал,
   * открывание, ручка и перенос прибора были недоступны на всех стенах,
   * кроме главной. Тот же шов, из-за которого дублировалась техника.
   */
  const selectedUnit = useMemo(
    () => (selectedId ? allModules(activeRun).find((m) => m.id === selectedId) ?? null : null),
    [selectedId, activeRun],
  );

  const variantOptions = useMemo<VariantPreview[]>(() => {
    if (!selectedId) return [];

    // Варианты места — тоже у ВЫБРАННОЙ стены, а не у первой.
    const unit = allModules(activeRun).find((m) => m.id === selectedId);
    if (!unit) return [];

    const specs = variantsForModule(unit, activeRun, zone);
    // Один вариант — это не выбор, а надпись. Меню не показываем вовсе.
    if (specs.length < 2) return [];

    const now = currentVariant(unit);
    const base = buildEstimate(active.run, variantKey, input.rates, disabled[variantKey], undefined, props.production).total;

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
            buildEstimate(next, variantKey, input.rates, disabled[variantKey], undefined, props.production)
              .total - base,
          );
        } catch {
          // Вариант, который не собирается, просто идёт без цены.
          deltaKzt = 0;
        }
      }

      /*
       * Карточка рисует НАСТОЯЩИЙ модуль с применённым вариантом — тем же
       * кодом, что и большой чертёж. Заготовленная иконка разошлась бы
       * с чертежом на первой же правке.
       */
      return {
        kind: spec.kind,
        title: spec.title,
        hint: spec.hint,
        unit: applyVariant(unit, spec.kind),
        heightMm: moduleCarcassHeightMm(unit, active.run),
        deltaKzt,
        active: spec.kind === now,
      };
    });
  }, [selectedId, active.run, zone, requirements, input.rates, input.openings, disabled, variantKey]);

  /**
   * ПЕРЕНОС ПРИБОРА НА ДРУГУЮ СТЕНУ.
   *
   * Одна правка состава кухни, а не удаление и добавление: прибор
   * принадлежит кухне. Вместе с ним переезжают введённые габариты —
   * иначе замерщик мерил бы холодильник дважды.
   */
  const moveApplianceToWall = useCallback(
    (appliance: ApplianceKind, toWall: number) => {
      const unit = allModules(activeRun).find((m) =>
        moduleAppliances(m).includes(appliance),
      );

      changeComposition({
        applianceWalls: { ...(composition.applianceWalls ?? {}), [appliance]: toWall },
        applianceSizes: unit?.applianceSizes?.[appliance]
          ? {
              ...(composition.applianceSizes ?? {}),
              [appliance]: unit.applianceSizes[appliance],
            }
          : composition.applianceSizes,
      });

      setMoveNotice(
        `${APPLIANCE_SLOTS[appliance].title} переехал на ${wallLabel(toWall).toLowerCase()}. ` +
          'Размеры прибора переехали вместе с ним.',
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeRun, composition],
  );

  const runOps = useCallback(
    (ops: MillworkOp[]) => {
      if (ops.length === 0) return;

      /*
       * УДАЛЁННЫЙ ПРИБОР УХОДИТ С КУХНИ ЦЕЛИКОМ.
       *
       * Он принадлежит композиции, а не ряду: убрать его с одной стены и
       * оставить на другой — это не удаление, а переезд, которого никто
       * не просил.
       */
      const removedAppliances = ops.flatMap((op) => {
        if (op.op !== 'remove_module') return [];
        const unit = allModules(activeRun).find((m) => m.id === op.moduleId);
        return unit ? moduleAppliances(unit) : [];
      });

      if (removedAppliances.length > 0 && layout) {
        changeComposition({
          appliances: requirements.appliances.filter(
            (item) => !removedAppliances.includes(item),
          ),
        });
        setMoveNotice(
          `${removedAppliances.map((a) => APPLIANCE_SLOTS[a].title).join(', ')}: ` +
            'убран со всей кухни — прибор один на все стены.',
        );
        return;
      }
      const before = new Map(activeRun.modules.map((m) => [m.id, m.widthMm]));
      const next = applyOps({
        run: activeRun,
        requirements,
        ops,
        openings: props.openings,
        roomDepthMm: Math.round((props.roomDepthM ?? 0) * 1000),
      });
      dirty.current = true;
      /*
       * Правка уходит в ТУ стену, которая выбрана. Операция одна и та
       * же — меняется только, чей ряд она правит.
       */
      if (wall === 0) setEditedRuns((prev) => ({ ...prev, [active.key]: next }));
      else setEditedWalls((prev) => ({ ...prev, [wall]: next }));

      /*
       * ДОБАВЛЕННЫЙ МОДУЛЬ СРАЗУ ВЫДЕЛЕН.
       *
       * «+» ставит МЕСТО, а чем оно будет — карго, ящиками, витриной —
       * показывает лента вариантов выбранного модуля, отфильтрованная по
       * зоне и ширине. Без выделения человек ставит модуль и не видит, из
       * чего теперь выбирать: два шага вместо одного жеста.
       *
       * Индекс считается от операции, а не поиском «нового id»: `reindex`
       * выводит идентификаторы из позиции, и после вставки их меняет сразу
       * несколько модулей.
       */
      /*
       * ВЫДЕЛЕНИЕ ПЕРЕЖИВАЕТ ПЕРЕБОР МАТЕРИАЛОВ.
       *
       * Клиент на встрече щёлкает фасады подряд: ЛДСП, эмаль, глянец,
       * филёнка. Снятое выделение убирало панель материала после ПЕРВОГО
       * нажатия — дальше нажимать было не на что. Правка начинки ведёт
       * себя так же (`chooseVariant`), и материал не должен отличаться.
       *
       * Габарит и позицию такие операции не меняют, поэтому и
       * идентификатор модуля остаётся прежним.
       */
      const keepsSelection = ops.every(
        (op) =>
          op.op === 'set_front' ||
          op.op === 'set_variant' ||
          op.op === 'set_section' ||
          /*
           * Направление перебирают подряд при клиенте: «а если вверх? а
           * если петли справа?». Снятое выделение убирает панель после
           * первого же нажатия — дальше нажимать не на что (ловушка 249).
           */
          op.op === 'set_opening',
      );
      if (keepsSelection) {
        setSelectedId(selectedId);
        flash(next.modules.filter((m) => before.get(m.id) !== m.widthMm).map((m) => m.id));
        return;
      }

      const added = ops.length === 1 && ops[0].op === 'add_module' ? ops[0] : null;
      if (added) {
        const at = added.afterModuleId
          ? active.run.modules.findIndex((m) => m.id === added.afterModuleId)
          : active.run.modules.length - 1;
        setSelectedId(next.modules[at + 1]?.id ?? null);
      } else {
        setSelectedId(null);
      }
      flash(
        next.modules
          .filter((m) => before.get(m.id) !== m.widthMm)
          .map((m) => m.id),
      );
    },
    [active, activeRun, wall, requirements, props.openings, props.roomDepthM, flash, selectedId],
  );

  /**
   * ВЫБОР ГОТОВОГО РЕШЕНИЯ.
   *
   * Решение — это набор секций и опций, а НЕ своя раскладка: ширины
   * по-прежнему считает `buildRun` по длине стены. Иначе макет на карточке
   * разошёлся бы с чертежом после выбора.
   *
   * Ручная расстановка и варианты модулей сбрасываются: в новом решении
   * на этих местах стоит другая мебель. Говорим об этом словами — молча
   * потерянная правка читается как поломка.
   */
  const pickSolution = (template: RunTemplate) => {
    const hadManual = Object.keys(manualAnchors).length > 0;
    const hadEdits = Object.keys(editedRuns).length > 0;

    setPrevious({
      templateId,
      name: template.name,
      composition,
      manualAnchors,
      editedRuns,
      freeMode,
      freeModules: freeMode ? active.run.modules.length : 0,
    });

    dirty.current = true;
    setTemplateId(template.id);
    setComposition({});
    setManualAnchors({});
    setEditedRuns({});
    setSelectedId(null);

    const notes = [
      `Решение «${template.name}» собрано на стене ${input.lengthMm} мм.`,
      hadManual ? 'Ручная расстановка сброшена — это другое решение, а не правка текущего.' : null,
      hadEdits ? 'Варианты модулей сброшены: на этих местах теперь другая мебель.' : null,
    ].filter(Boolean);

    setMoveNotice(notes.join(' '));
  };

  /**
   * СВОЁ РЕШЕНИЕ КОМПАНИИ.
   *
   * Сохраняется НАБОР — техника, секции, двери, опции, — а не собранный
   * ряд: на другой стене решение обязано собраться заново по её длине.
   * Диапазон длин берём от текущей стены с запасом в обе стороны:
   * «наша базовая на 2700» должна предлагаться и на 2600, и на 3000.
   */
  const saveOwnSolution = async (name: string) => {
    const template = {
      id: `own-${Date.now().toString(36)}`,
      name,
      hint: 'Решение компании',
      zone,
      layout: 'linear' as const,
      minLengthMm: Math.max(600, Math.round(input.lengthMm * 0.8)),
      maxLengthMm: Math.round(input.lengthMm * 1.25),
      appliances: requirements.appliances,
      sections: requirements.sections,
      doorSystem: requirements.doorSystem,
      tallSide: requirements.tallSide,
      options: requirements.options,
    };

    try {
      const res = await fetch('/api/orgs/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      });
      const data = await res.json().catch(() => ({}));

      /*
       * Список решений приезжает с сервера при открытии объекта, поэтому
       * своё появится в галерее со следующего захода. Говорим об этом
       * прямо, а не делаем вид, что оно уже там.
       */
      setMoveNotice(
        res.ok
          ? `Решение «${name}» сохранено. В галерее оно появится при следующем открытии объекта, первым и с пометкой «ваше».`
          : (data.error ?? 'Решение не сохранилось.'),
      );
    } catch {
      setMoveNotice('Сети нет — решение не сохранилось.');
    }
  };

  /** Вернуть то, что было до последнего выбора решения. */
  const undoSolution = () => {
    if (!previous) return;

    dirty.current = true;
    setTemplateId(previous.templateId);
    setFreeMode(previous.freeMode);
    setComposition(previous.composition);
    setManualAnchors(previous.manualAnchors);
    setEditedRuns(previous.editedRuns);
    setSelectedId(null);
    setMoveNotice(
      previous.freeModules > 0
        ? `Вернули ряд, собранный руками: ${previous.freeModules} модулей.`
        : 'Вернули то, что было до выбора решения.',
    );
    setPrevious(null);
  };

  /**
   * ШИРИНА ТЯНЕТСЯ В СЦЕНЕ.
   *
   * Шаг 50 мм: пальцем миллиметр не поставить, а цех считает пятёрками.
   *
   * Инвариант «ряд не длиннее стены» проверяется ДО применения и правку
   * отклоняет — иначе `rebalance` тихо ужмёт соседей, и клиент увидит не
   * тот состав, который заказывал. А вот нарушение правила НАЧИНКИ —
   * карго шире четырёхсот, стекло шире девятисот — только предупреждение:
   * ширину заказчик выбрал сам, и отменять её за него нельзя.
   */
  const dragWidth = useCallback(
    (moduleId: string, widthMm: number) => {
      const unit = allModules(active.run).find((m) => m.id === moduleId);
      if (!unit) return;

      const wanted = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widthMm));
      if (wanted === unit.widthMm) return;

      const over = widthOverflowMm(active.run, moduleId, wanted, MIN_WIDTH);
      if (over > 0) {
        setSceneNotice(`Не помещается: ряд вышел бы за стену на ${over} мм.`);
        return;
      }

      const spec = MODULE_VARIANTS[currentVariant(unit)];
      setSceneNotice(
        !spec.anyWidth && (wanted < spec.minWidthMm || wanted > spec.maxWidthMm)
          ? `${spec.title} шириной ${wanted} мм не бывает: механизм рассчитан ` +
              `на ${spec.minWidthMm}–${spec.maxWidthMm} мм. Ширину оставили — ` +
              'решать вам, но в цехе это переделка.'
          : null,
      );

      runOps([{ op: 'set_width', moduleId, widthMm: wanted }]);
      // Выделение переживает правку: замерщик тянет ширину подряд.
      setSelectedId(moduleId);
    },
    [active.run, runOps],
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
        /*
         * Форма, решение угла и ряды соседних стен. Без них угловая
         * кухня открывалась бы прямой, а работа замерщика по второй
         * стене пропадала бы молча.
         */
        shape,
        cornerSolution,
        wallRuns: Object.fromEntries(
          Object.entries(editedWalls).map(([index, run]) => [String(index), run]),
        ),
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
    // Соседние стены сохраняются наравне с рабочей: без них угловая
    // кухня открылась бы прямой.
    editedWalls,
    shape,
    cornerSolution,
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

  /**
   * СЦЕНА ЖИВЁТ ТОЛЬКО РАДИ КАДРА.
   *
   * Из интерфейса три.js убран целиком: рабочий экран рисует вектор, и
   * он рассказывает о мебели всё, что решается на встрече. Но снимает
   * clay-кадр для визуализации именно эта сцена — `RoomCanvas` внутри
   * регистрирует `captureScene`, — а без кадра нет ни сравнения
   * «до и после», ни генерации.
   *
   * Поэтому она смонтирована ВСЕГДА и всегда за экраном. `display:none`
   * не годится: канвас нулевого размера не рисуется, и захват снял бы
   * пустоту. `frameloop="demand"` означает, что кадров она не рисует,
   * пока их не попросят: в обычной работе нагрузки нет.
   */
  const sceneSlot = (
    <KitchenScene
      run={active.run}
      ceilingHeightMm={props.ceilingHeightMm}
      roomDepthM={props.roomDepthM}
      hidden
      interactive
      production={props.production}
      view={sceneView}
      selectedModuleId={selectedId}
      onSelectModule={setSelectedId}
      onWidth={dragWidth}
      onMoveModule={freeMode ? moveModule : undefined}
      onItemId={setKitchenItemId}
    />
  );

  const steps = [
    ...(survey
      ? [{ key: 'survey' as StepKey, title: 'Замер', done: Boolean(survey.finishedAt) }]
      : []),
    { key: 'template' as StepKey, title: 'Решение', done: Boolean(templateId) },
    { key: 'studio' as StepKey, title: 'Конфигуратор', done: Boolean(templateId) },
    { key: 'result' as StepKey, title: 'Результат', done: false },
  ];

  const order = steps.map((s) => s.key);
  const index = Math.max(0, order.indexOf(step));
  const goNext = () => setStep(order[Math.min(order.length - 1, index + 1)]);
  const goBack = () => setStep(order[Math.max(0, index - 1)]);

  const nextLabel =
    step === 'survey'
      ? 'К решениям'
      : step === 'template'
        ? 'В конфигуратор'
        : step === 'studio'
          ? 'К результату'
          : 'Отправить клиенту';

  const nextDisabled =
    (step === 'template' && !templateId && !freeMode) || (step === 'result' && (blocked || !props.projectId));

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
            {/*
              * СОБРАТЬ САМОМУ — рядом с галереей, а не вместо неё.
              *
              * Готовое решение закрывает девять случаев из десяти, и
              * убирать его нельзя. Но десятый — это мебельщик со своим
              * дизайном, и до сих пор ему было нечего ответить.
              */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-free-mode
                /*
                 * Это ДЕЙСТВИЕ, а не переключатель, и `aria-pressed` тут
                 * не просто лишний: `aria-pressed` на этом экране означает
                 * «карточка решения», и приёмка отбирает карточки именно
                 * по нему. Кнопка с тем же признаком встала первой в
                 * список решений — и «выбрать первое решение» выбирало
                 * пустую стену.
                 */
                data-active={freeMode ? '1' : undefined}
                onClick={() => {
                  dirty.current = true;
                  setFreeMode(true);
                  setTemplateId(null);
                  setEditedRuns({});
                  setComposition({});
                  setStep('studio');
                }}
                className={`mw-btn ${freeMode ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
              >
                Собрать самому
              </button>
              <span className="text-[13px] leading-snug text-graphiteMw">
                Пустая стена {input.lengthMm} мм: добавляйте модули сами.
                Готовое решение ниже — быстрый старт.
              </span>

              {/*
                * Отказ и предупреждение живут рядом с тем, на что нажали.
                * Раньше эта строка стояла только на шаге состава — уход
                * в шаблон СООБЩАЛ о замене ряда туда, где сообщение уже
                * никто не видит.
                */}
              {previous?.freeMode && previous.freeModules > 0 && (
                <button
                  type="button"
                  data-undo-free
                  onClick={undoSolution}
                  className="mw-btn mw-btn-ghost ml-auto"
                >
                  Вернуть собранный ряд
                </button>
              )}
            </div>

            {moveNotice && (
              <p className="mb-4 rounded-[var(--r-control)] bg-navy px-4 py-3 text-[13px] leading-snug text-graphiteMw">
                {moveNotice}
              </p>
            )}

            <TemplatePicker
              lengthMm={input.lengthMm}
              zone={zone}
              orgTemplates={props.orgTemplates}
              selectedId={templateId}
              onSelect={(t: RunTemplate) => {
                /*
                 * СОБРАННЫЙ РУКАМИ РЯД НЕ ИСЧЕЗАЕТ МОЛЧА.
                 *
                 * Человек собирал его двадцать минут, а готовое решение
                 * считает раскладку заново — от ручной сборки не остаётся
                 * ничего. Один клик не должен стоить этой работы, поэтому
                 * снимок кладётся ДО замены, а рядом встаёт «вернуть».
                 */
                if (freeMode && active.run.modules.length > 0) {
                  setPrevious({
                    templateId,
                    name: t.name,
                    composition,
                    manualAnchors,
                    editedRuns,
                    freeMode: true,
                    freeModules: active.run.modules.length,
                  });
                  setMoveNotice(
                    `Ряд, собранный руками (${active.run.modules.length} модулей), ` +
                      `заменён решением «${t.name}». Вернуть — кнопкой на шаге «Шаблон».`,
                  );
                }

                dirty.current = true;
                setFreeMode(false);
                setTemplateId(t.id);
                // Правки предыдущего состава к новому шаблону не относятся.
                setEditedRuns({});
                setComposition({});
                setStep('studio');
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

        {/*
          * ОДИН РАБОЧИЙ ЭКРАН.
          *
          * «Состав» и «Материалы» были разными шагами, и замерщик не видел,
          * что меняется, пока не перейдёт дальше, — а клиент сидит рядом и
          * ждёт. Теперь слева сцена, справа панель: нажал на модуль —
          * справа его варианты и материал, выбрал — сцена поменялась
          * тут же, сумма внизу пересчиталась.
          *
          * Чертёж сюда НЕ переехал: он для цеха, и живёт на «Результате».
          */}
        {step === 'studio' && (
          /*
            * 3D ЗАНИМАЕТ ВЕСЬ ЭКРАН.
            *
            * В 3D мебель смотрят, а не правят списком: панель рядом
            * отнимала треть ширины, и гарнитур выходил мелким. На схеме и
            * плане панель остаётся — там работают с составом.
            *
            * Панель не размонтируется, а прячется: её состояние (выбранный
            * модуль, открытые карточки) обязано пережить переключение вида.
            */
          <div
            className={
              wideScene
                ? 'grid gap-4'
                : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]'
            }
            data-studio
            data-wide-scene={wideScene ? '1' : '0'}
          >
            {/*
              * СЦЕНА ВИДНА ЦЕЛИКОМ И СРАЗУ.
              *
              * `sticky` держит её на месте, пока прокручивается панель:
              * клиент смотрит на мебель, а не на то, как замерщик листает
              * список. Высота от вьюпорта, чтобы на планшете сцена не
              * съедала экран и не уезжала под сгиб.
              */}
            <div
              className="lg:sticky lg:top-4 lg:self-start"
              data-studio-scene
            >

              {/*
                * ВЫСОТА СЦЕНЫ — ОТ СВОБОДНОГО МЕСТА, А НЕ ДОЛЯ ВЬЮПОРТА.
                *
                * Над сценой шапка со шагами, под ней подвал с суммой; обе
                * полосы фиксированной высоты. `68vh` при 900 px экрана
                * давал 612 px при доступных 601 — сцена уезжала под подвал
                * ровно на те 11 px, из-за которых её приходится
                * прокручивать. Вычитаем полосы, а не подбираем долю.
                */}
              {/*
                * Полосы над и под сценой стали тоньше (подвал в одну
                * строку, ракурсы уехали на сцену) — значит и вычитать
                * надо меньше. Доля вьюпорта тут по-прежнему ни при чём:
                * считаем от того, что действительно занято.
                */}
              <div className="h-[52vh] min-h-[260px] lg:h-[calc(100vh-248px)]">
                <RunSchematic
                  onViewChange={setSchematicView}
                  /*
                   * Панель прячется и возвращается ОДНОЙ кнопкой, и стоит
                   * она в полосе сцены: своей строкой она отнимала у сцены
                   * полсотни пикселей — ровно тех, из-за которых мебель
                   * уезжала под подвал.
                   */
                  panelHidden={panelHidden}
                  onTogglePanel={() => setPanelHidden((on) => !on)}
                  run={activeRun}
                  sceneRows={sceneRows}
                  production={props.production}
                  roomWidthM={Math.max(input.lengthMm / 1000, 2)}
                  roomDepthM={props.roomDepthM}
                  facadeColor={
                    frontOf(
                      activeRun.modules.find((unit) => hasFacade(unit)) ?? activeRun.modules[0] ?? {},
                    ).colorHex
                  }
                  neighbour={neighbourRun}
                  neighbourLabel={
                    layout ? wallLabel(wall === 0 ? 1 : wall - 1) : undefined
                  }
                  comms={props.comms}
                  selectedModuleId={selectedId}
                  onSelect={setSelectedId}
                  onMoveModule={freeMode ? moveModule : undefined}
                  changedIds={changedIds}
                />
              </div>

              {sceneNotice && (
                <p className="mt-2 rounded-[var(--r-control)] bg-tape/15 px-3 py-2 text-[13px] leading-snug text-tape">
                  {sceneNotice}
                </p>
              )}
            </div>

            {/* ── Панель выбора ── */}
            <div className={`min-w-0 ${wideScene ? 'hidden' : ''}`} data-studio-panel>
              {/*
                * ФОРМА ГАРНИТУРА И СТЕНЫ.
                *
                * «В чертеже только прямой» — сказал мебельщик, который
                * делает угловые постоянно. Форма выбирается здесь, стены
                * переключаются рядом: работа идёт по одной, но соседняя
                * видна на схеме контуром — иначе не понять, где угол.
                */}
              <div className="mb-4" data-shape>
                <p className="mw-label mb-1">Форма</p>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ['linear', 'Прямая'],
                      ['corner_l', 'Угловая'],
                      ['u_shape', 'П-образная'],
                    ] as [CompositionKind, string][]
                  ).map(([kind, title]) => (
                    <button
                      key={kind}
                      type="button"
                      data-shape-kind={kind}
                      aria-pressed={shape === kind}
                      onClick={() => {
                        dirty.current = true;
                        setShape(kind);
                        setWallIndex(0);
                        setSelectedId(null);
                      }}
                      className={`mw-btn ${shape === kind ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                    >
                      {title}
                    </button>
                  ))}
                </div>

                {shape !== 'linear' && !layout && (
                  <p className="mt-1 text-[13px] leading-snug text-alert">
                    Для этой формы нужны замеры соседних стен: угол по одной
                    стене не собрать — вторая половина была бы выдуманной.
                  </p>
                )}

                {layout && (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1" data-walls>
                      {layout.segments.map((segment, i) => (
                        <button
                          key={segment.id}
                          type="button"
                          data-wall={i}
                          aria-pressed={wall === i}
                          onClick={() => {
                            setWallIndex(i);
                            setSelectedId(null);
                          }}
                          className={`mw-btn ${wall === i ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                        >
                          {wallLabel(i)} · {segment.run.lengthMm}
                        </button>
                      ))}
                    </div>

                    {/*
                      * РЕШЕНИЕ УГЛА — ЭТО ДЕНЬГИ И ДОСТУП.
                      *
                      * Угловой модуль 900×900 даёт доступ в угол и стоит
                      * корпуса с каруселью; фальш-панель 100 мм отдаёт
                      * угол под мёртвую зону и стоит панели с угловыми
                      * петлями. Второй ряд при этом теряет РАЗНОЕ место —
                      * 900 против глубины ряда, — поэтому и состав, и
                      * сумма меняются вместе с решением.
                      */}
                    <div className="mt-2" data-corner>
                      <p className="mw-label mb-1">Угол</p>
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            ['false_panel', 'Фальш-панель 100 мм', 'угол мёртвый, петли 175°, зазор 12 мм'],
                            ['corner_module', 'Угловой модуль 900', 'карусель, доступ в угол, дороже'],
                          ] as [CornerSolution, string, string][]
                        ).map(([solution, title, hint]) => (
                          <button
                            key={solution}
                            type="button"
                            data-corner-solution={solution}
                            aria-pressed={cornerSolution === solution}
                            title={hint}
                            onClick={() => {
                              dirty.current = true;
                              setCornerSolution(solution);
                              setEditedWalls({});
                              setSelectedId(null);
                            }}
                            className={`mw-btn ${cornerSolution === solution ? 'mw-btn-primary' : 'mw-btn-ghost'}`}
                          >
                            {title}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-[13px] leading-snug text-graphiteMw">
                        {cornerSolution === 'false_panel'
                          ? `Угол отдан под мёртвую зону: ${wallLabel(1)} короче стены на глубину ряда и панель.`
                          : `Карусель в углу: ${wallLabel(1)} короче стены на 900 мм — столько занимает угловой модуль.`}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/*
                * ФОТО ПОМЕЩЕНИЯ — ПЕРВЫМ БЛОКОМ.
                *
                * Это обязательный шаг продажи, а не настройка: без снимка
                * нет сравнения «до и после» и нет визуализации — клиент
                * видит настроение вместо своей квартиры. Внизу панели его
                * приходилось искать прокруткой при клиенте, а значит его
                * не делали.
                *
                * Как только фото есть, блок сворачивается в строку: место
                * наверху дорогое, и держать там готовое дело незачем.
                */}
              <div className="mb-4" data-photo-first>
                {roomPhoto ? (
                  <button
                    type="button"
                    onClick={() => setZoom(roomPhoto)}
                    className="mw-btn mw-btn-ghost !h-auto w-full !justify-start gap-3 !p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={roomPhoto}
                      alt="Помещение клиента"
                      className="h-12 w-16 rounded-[6px] object-cover"
                    />
                    <span className="text-[13px] leading-snug text-graphiteMw">
                      Фото помещения есть — клиент увидит свою квартиру
                    </span>
                  </button>
                ) : (
                  <div className="rounded-[var(--r-control)] bg-alert/10 p-3">
                    <p className="mb-2 text-[13px] leading-snug text-alert">
                      Без фото помещения клиент увидит настроение, а не свою
                      квартиру: сравнения «до и после» не будет.
                    </p>
                    <label className="mw-btn mw-btn-primary inline-flex cursor-pointer">
                      Добавить фото помещения
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          // Сжатие идёт НА КЛИЕНТЕ: 4–12 МБ с телефона не
                          // должны уезжать ни в Storage, ни в модель.
                          const compressed = await compressPhoto(file);
                          dirty.current = true;
                          setRoomPhoto(compressed.dataUrl);
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

              {/*
                * Варианты выбранного модуля — ПЕРВЫМИ.
                *
                * Это то, ради чего в сцену и нажимают: миниатюра, название,
                * разница в цене. Без выделения лента сама говорит, что
                * делать, и не занимает место молча.
                */}
              <VariantStrip
                options={variantOptions}
                onPick={chooseVariant}
                moduleLabel={selectedLabel}
                pickPrompt="Нажмите на модуль в сцене, чтобы поменять его начинку."
              />

              {/*
                * ПАНЕЛЬ МАТЕРИАЛА — ДЛЯ ВСЕГО, ЧТО ЗАКРЫТО ФАСАДОМ.
                *
                * Условие было `!selectedUnit.appliance`: выделяешь мойку
                * или колонну — панель не появляется вовсе, нажать некуда,
                * и модуль остаётся прежнего цвета. Раскрой и смета к тому
                * моменту фасад у него уже видели; расходилась ровно эта
                * ветка — вторая копия правила «прибор ли это».
                */}
              {selectedUnit && hasFacade(selectedUnit) && (
                <div className="mt-3">
                  {/*
                    * Сначала ОБРАЗЦЫ — клиент выбирает материал глазами, как
                    * в салоне. Атрибуты (конструкция, фактура) идут ниже:
                    * ими уточняют выбранное, а не начинают выбор.
                    */}
                  <p className="mw-label mb-2">Материал фасада · {selectedUnit.label}</p>
                  <FrontSwatchCards unit={selectedUnit} onOps={runOps} />

                  <div className="mt-3">
                    <FrontMaterialPicker
                      unit={selectedUnit}
                      onOps={runOps}
                      onRefuse={setSceneNotice}
                      palette={palette}
                    />
                  </div>

                  {/*
                    * ПРИБОР ПЕРЕЕЗЖАЕТ НА ДРУГУЮ СТЕНУ ОДНОЙ КНОПКОЙ.
                    *
                    * Он принадлежит кухне, а не ряду: удалять его на одной
                    * стене и добавлять на другой — это два действия там,
                    * где человек делает одно, и половина настроек по
                    * дороге теряется.
                    */}
                  {layout && moduleAppliances(selectedUnit).length > 0 && (
                    <div className="mt-3" data-appliance-move>
                      <p className="mw-label mb-2">
                        Прибор стоит на {wallLabel(wall).toLowerCase()}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {layout.segments.map((segment, i) =>
                          i === wall ? null : (
                            <button
                              key={segment.id}
                              type="button"
                              data-move-appliance={i}
                              onClick={() =>
                                moveApplianceToWall(moduleAppliances(selectedUnit)[0], i)
                              }
                              className="mw-btn mw-btn-ghost"
                            >
                              Перенести на {wallLabel(i).toLowerCase()}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {/*
                    * Направление открывания стоит рядом с материалом: это
                    * такой же выбор про ЭТОТ фасад, и спрашивают о нём в
                    * тот же момент разговора.
                    */}
                  <div className="mt-3">
                    <OpeningPicker
                      unit={selectedUnit}
                      run={activeRun}
                      onOps={runOps}
                      onRefuse={setSceneNotice}
                    />
                  </div>
                </div>
              )}

              {moveNotice && (
                <p className="mt-3 rounded-[var(--r-control)] bg-navy px-4 py-3 text-[13px] leading-snug text-graphiteMw">
                  {moveNotice}
                </p>
              )}

              <div className="mt-4">
                <RunEditor
                  run={activeRun}
                  zone={zone}
                  selectedModuleId={selectedId}
                  onSelect={setSelectedId}
                  onOps={runOps}
                  requirements={requirements}
                  onComposition={changeComposition}
                  freeMode={freeMode}
                />
              </div>

              {/*
                * ГОТОВЫЕ ДИЗАЙНЫ.
                *
                * Один тап кладёт материал на весь ряд. Недоступные не
                * прячутся: замерщик должен знать, чего не хватает в
                * каталоге, — иначе он идёт спрашивать нас.
                */}
              <div className="mt-4" data-designs>
                <p className="mw-label mb-2">Готовые дизайны</p>
                <div className="flex flex-wrap gap-1">
                  {RUN_DESIGNS.map((design) => {
                    const availability = designAvailability(design, input.rates);
                    return (
                      <button
                        key={design.id}
                        type="button"
                        data-design={design.id}
                        data-available={availability.available ? '1' : '0'}
                        title={
                          availability.available
                            ? designSummary(design)
                            : availability.reason
                        }
                        onClick={() => applyDesign(design.id)}
                        className={`mw-btn ${availability.available ? 'mw-btn-ghost' : 'mw-btn-ghost opacity-50'}`}
                      >
                        {design.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/*
                * Компоновки и материалы объекта — ниже состава: их трогают
                * реже, чем варианты модуля, а место наверху дороже.
                */}
              {arrangements.length > 1 && (
                <div className="mt-4">
                  <ArrangementCards
                    arrangements={arrangements}
                    activeKey={
                      arrangements.find(
                        (a) => a.run.fingerprint === active.run.fingerprint,
                      )?.key ?? null
                    }
                    onSelect={chooseArrangement}
                  />
                </div>
              )}

              <div className="mt-4">
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
                />
              </div>

              <div className="mt-4">
                <CommandBar onSubmit={sendCommand} busy={busy} lastReply={reply} />
              </div>
            </div>
          </div>
        )}

        {step === 'result' && (
          <>
            {/*
              * Сравнение — главный экран продажи, а не иллюстрация к чертежу.
              * Клиент смотрит на свою квартиру с кухней; чертёж, план и смета
              * нужны потом и живут ниже.
              *
              * В ПЕЧАТЬ ОНО НЕ ИДЁТ. Документ — это лист: сравнение занимало
              * первую страницу целиком, и чертёж уезжал на вторую, хотя
              * помещался на одну.
              */}
            <div className="print:hidden">
            <BeforeAfter
              photo={roomPhoto}
              render={activeRender}
              title="Ваша кухня"
              heightClass="h-[70vh] min-h-[320px]"
              onAddPhoto={() => setStep('studio')}
              onOpen={setZoom}
              emptyAction={
                /* Кнопка прямо в пустой половине: под сравнением её не видно
                   без прокрутки, и рендер выглядит неработающим. */
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void render.render()}
                    disabled={render.busy || demoSpent}
                    className="mw-btn mw-btn-lg mw-btn-primary text-[17px]"
                  >
                    {render.busy ? 'Снимаем кадр…' : 'Отрисовать кухню'}
                  </button>
                  {/* Цена клика названа ДО нажатия, а не после отказа. */}
                  {props.demoPlan && (
                    <p className="max-w-[34ch] text-center text-[13px] leading-snug text-graphiteMw">
                      {demoSpent ? DEMO_QUOTA_SPENT : DEMO_QUOTA_HINT}
                    </p>
                  )}
                </div>
              }
            />

            </div>

            <div className="mt-5 print:hidden">
              <RenderPanel
                demoPlan={props.demoPlan}
                demoSpent={demoSpent}
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
                /*
                  * «План» отдельной вкладкой больше нет: он лежит на том же
                  * листе, что фасад и разрезы. Отдельный экран под один вид
                  * заставлял держать в голове то, что должно быть перед
                  * глазами.
                  */
                /*
                  * Вкладки «3D» больше нет: три.js ушёл из интерфейса
                  * целиком. Схему клиент смотрит в конфигураторе, а здесь
                  * лежат документы для цеха — лист и детализировка.
                  */
                [
                  ['facade', 'Чертёж'],
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

            {/*
              * СТАРАЯ СЦЕНА ОСТАЁТСЯ — ЗА ЭКРАНОМ И НАВСЕГДА.
              *
              * Из интерфейса замерщика она ушла: интерьерная кухня со светом
              * и тенями отвечала на вопрос «как это будет выглядеть», а на
              * встрече спрашивают «как это устроено». Но снимает clay-кадр
              * для визуализации именно она — `RoomCanvas` внутри неё
              * регистрирует `captureScene`. Поэтому сцена смонтирована
              * ВСЕГДА, независимо от выбранного вида.
              *
              * `display:none` по-прежнему не годится: канвас нулевого
              * размера не рисуется, и захват снял бы пустоту.
              */}


            {/* Техническая аксонометрия: только изделие, без комнаты. */}
            {/*
              * ГАЛЕРЕЯ РЯДОМ С ЧЕРТЕЖОМ, а не на отдельном шаге: клиент
              * спрашивает «а по-другому можно?» именно здесь, глядя на
              * чертёж, и ответ должен быть в одно нажатие.
              */}
            {resultView === 'facade' && (
              <div className="mt-4">
                <SolutionGallery
                  zone={zone}
                  lengthMm={input.lengthMm}
                  ceilingHeightMm={input.ceilingHeightMm}
                  openings={input.openings}
                  comms={input.comms}
                  rates={input.rates}
                  options={requirements.options}
                  variantKey={variantKey}
                  disabledKeys={disabled[variantKey]}
                  orgTemplates={props.orgTemplates}
                  currentFingerprint={active.run.fingerprint}
                  currentTotal={active.estimate.total}
                  onPick={pickSolution}
                  onUndo={undoSolution}
                  undoLabel={previous?.name ?? null}
                  onSaveOwn={props.projectId ? saveOwnSolution : undefined}
                />
              </div>
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

            {/*
              * ЛЕНТА ПРЕВЬЮ РЯДОМ С ЧЕРТЕЖОМ. Меню названий внутри чертежа
              * закрывало мебель и требовало читать, а не смотреть; лента
              * под листом уезжала бы за экран — на листе шесть видов.
              * Карточки — настоящие мини-чертежи, и лента не закрывается
              * после выбора: замерщик перебирает их подряд при клиенте.
              */}
            {resultView === 'facade' && (
              <div className="mt-4 print:hidden">
                <VariantStrip
                  options={variantOptions}
                  onPick={chooseVariant}
                  moduleLabel={selectedLabel}
                  pickPrompt="Нажмите на модуль на чертеже, чтобы поменять его начинку."
                />
              </div>
            )}

            <div
              className={
                resultView === 'panels' ? 'mt-4 hidden print:block' : 'mt-4'
              }
            >
              {/*
                * ЛИСТ, А НЕ ОДИН ВИД: фасад, оба разреза и план сразу,
                * у каждого своя подпись и свой масштаб. Фасад остаётся
                * живым — полки тянутся, техника переносится, варианты
                * выбираются прямо на нём.
                */}
              <DrawingSheet
                title={props.title}
                zone={props.zone}
                measuredBy={props.measuredBy}
                measuredAt={props.measuredAt}
                variantTitle={active.title}
                pending={resolution?.stats.pending.map((p) => p.where) ?? []}
                notes={survey?.clientNotes}
                run={active.run}
                comms={input.comms}
                issues={issues}
                production={props.production}
                client={props.clientName}
                company={props.company}
                /*
                 * Угловая кухня уходит в цех ЦЕЛИКОМ: развёртка каждой
                 * стены со своими размерами плюс общий план, где виден
                 * угол. Половина кухни на листе — это половина заказа.
                 */
                otherRuns={
                  layout
                    ? layout.segments
                        .slice(1)
                        .map((segment, i) => ({
                          label: wallLabel(i + 1),
                          run: segments[i + 1] ?? segment.run,
                        }))
                    : []
                }
                elevation={{
                  assumedTotal,
                  selectedModuleId: selectedId,
                  onSelect: setSelectedId,
                  changedIds,
                  mode: drawingMode,
                  onFillChange: changeFill,
                  /*
                   * Отказ идёт в ту же строку, что и отклонённый перенос
                   * прибора: это одно и то же событие для замерщика —
                   * «правку не приняли, и вот почему».
                   */
                  onFillReject: setMoveNotice,
                  /*
                   * В раскладке по шаблону двигают ПРИБОР (ручная позиция,
                   * ряд пересобирается), в свободной сборке — МОДУЛЬ по
                   * месту. Оба сразу невозможны: жест один, и он должен
                   * означать одно.
                   */
                  onMoveAppliance: freeMode ? undefined : moveAppliance,
                  onMoveModule: freeMode ? moveModule : undefined,
                }}
              />

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
                    // Предупреждение ведёт на лист: план теперь там же.
                    if (step === 'result') setResultView('facade');
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

      {/*
        * СЦЕНА ЗА ЭКРАНОМ — НА ВСЕХ ШАГАХ СРАЗУ.
        *
        * Раньше она монтировалась внутри «Результата», и до него её не
        * существовало вовсе. Теперь съёмка кадра возможна с любого шага,
        * а главное — сцена не пересоздаётся при переходах: контекст
        * WebGL поднимается один раз за сеанс.
        */}
      <div
        className="mw-scene-hidden fixed left-[-3000px] top-0 h-[220px] w-[340px] opacity-0"
        aria-hidden
      >
        {sceneSlot}
      </div>

      {/* ── Низ экрана: зона большого пальца ── */}
      <footer className="border-t border-navyLine/60 bg-navyDeep px-4 pb-4 pt-3 print:hidden">
        {blockingWarnings.length > 0 && (
          <p className="mb-3 rounded-[var(--r-control)] bg-alert/15 px-4 py-3 text-[15px] leading-snug text-alert">
            {blockingWarnings[0].message}
            {blockingWarnings.length > 1 && ` И ещё ${blockingWarnings.length - 1}.`}
          </p>
        )}

        {/*
          * ПОДВАЛ В ОДНУ СТРОКУ.
          *
          * Сумма и кнопки стояли друг под другом и занимали 137 px из
          * 820 на планшете — сцена не дотягивала до шести десятых
          * экрана. Вместе они читаются так же: сумма слева, действие
          * справа; на узком экране строка честно переносится.
          */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[220px] flex-1">
          <EstimateSheet
            estimate={objectEstimate}
            /* Комплектация одна, поэтому строка итога называет ЗОНУ:
               «Ваша кухня» в спальне читается как чужой проект. */
            variantTitle={SINGLE_VARIANT ? zoneProfile(zone).yours : active.title}
            disabledKeys={disabled[active.key]}
            onToggle={toggleLine}
            open={estimateOpen}
            onOpenChange={setEstimateOpen}
            preliminary={preliminary}
            assumptions={estimateAssumptions}
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
