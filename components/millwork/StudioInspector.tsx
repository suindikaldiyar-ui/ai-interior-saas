'use client';

import { moduleFronts } from '@/lib/millwork/applianceFront';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { rowOfModule, type RunRow } from '@/lib/millwork/selection';
import type { KnownState } from '@/types/survey';
import type { Run } from '@/types/millwork';

/**
 * ИНСПЕКТОР STUDIO — ЧТО ВЫБРАНО И ЕГО ЧИСЛА (STAGE 01A).
 *
 * Studio — это не второй конфигуратор, а то же рабочее место без мастера
 * шагов. Поэтому инспектор НИЧЕГО НЕ СЧИТАЕТ: место модуля, высоту и
 * глубину корпуса даёт `runPlaces` — та же функция, по которой модуль
 * стоит в 3D; фасад — `moduleFronts`, по которой режет раскрой и рисует
 * сцена. Своя арифметика здесь показала бы клиенту число, которого нет
 * ни в цеху, ни в смете.
 *
 * Правит инспектор тоже не сам: ширина — полем «Ширина, мм» ниже (та же
 * операция `set_width`, что у ручки в сцене и шва на схеме), модуль в
 * пустоту — карточкой библиотеки. Чего движок пока не умеет безопасно
 * выпустить в раскрой — высоты и глубины отдельного модуля, — того здесь
 * нет полем, а сказано словами.
 */

/** Стена, по которой идёт ряд: замер и его состояние. */
export type StudioWall = {
  /** Стена замера — её `wallId`, тот же, под которым пишутся правки ряда. */
  id: string;
  /** «Стена А», «Стена Б». */
  label: string;
  /** Длина стены по замеру, мм. */
  lengthMm: number;
  /** Замерено, принято по умолчанию или не замерено. */
  state: KnownState;
  /** Откуда взято допущение — словами. */
  basis?: string;
};

type Props = {
  run: Run;
  wall: StudioWall;
  selectedId: string | null;
  gap: { fromMm: number; widthMm: number; row: RunRow } | null;
};

const ROW_TITLE: Record<RunRow, string> = {
  base: 'нижний ряд',
  upper: 'верхний ряд',
  mezzanine: 'антресоль',
  storage: 'кладовка над колонной',
};

const STATE_TITLE: Record<KnownState, string> = {
  measured: 'замерено',
  assumed: 'принято по умолчанию',
  unknown: 'не замерено',
};

/** Створки и ящики словами: «2 створки», «3 ящика», «без фасада». */
function frontWords(leaves: number, drawers: number): string {
  if (drawers > 0) return `${drawers} ${plural(drawers, 'ящик', 'ящика', 'ящиков')}`;
  if (leaves > 0) return `${leaves} ${plural(leaves, 'створка', 'створки', 'створок')}`;
  return 'без фасада';
}

function plural(n: number, one: string, few: string, many: string): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return many;
  const last = n % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export default function StudioInspector({ run, wall, selectedId, gap }: Props) {
  const place = selectedId ? (runPlaces(run).find((p) => p.unit.id === selectedId) ?? null) : null;
  const unit = place?.unit ?? null;
  const heightMm = place ? Math.round(place.heightM * 1000) : null;
  const depthMm = place ? Math.round(place.depthM * 1000) : null;
  const fronts = unit && heightMm ? moduleFronts(unit, heightMm) : null;
  const row = unit ? (rowOfModule(run, unit.id)?.row ?? null) : null;

  return (
    <div className="mb-4 rounded-[var(--r-panel)] bg-surface-2 px-4 py-3" data-studio-inspector>
      {/*
        * СТЕНА — ВСЕГДА ПЕРВОЙ СТРОКОЙ.
        *
        * Замерщик ставит мебель на конкретную стену квартиры, и её номер
        * в замере (`wallId`) — то, по чему правка потом найдёт свою стену.
        * Если ряд короче стены (угол занял её начало), сказано обоими
        * числами: стена и то, что от неё осталось ряду.
        */}
      <p
        className="text-[13px] leading-snug"
        data-studio-wall={wall.id}
        data-wall-length={wall.lengthMm}
        data-run-length={run.lengthMm}
        data-wall-state={wall.state}
      >
        <span className="font-medium">{wall.label}</span>
        <span className="mw-num text-graphiteMw"> · {wall.id} · </span>
        <span className="mw-num">{wall.lengthMm} мм</span>
        <span className={wall.state === 'measured' ? 'text-graphiteMw' : 'text-tape'}>
          {' '}
          · {STATE_TITLE[wall.state]}
          {wall.state === 'assumed' && wall.basis ? ` (${wall.basis})` : ''}
        </span>
        {run.lengthMm !== wall.lengthMm && (
          <span className="mw-num text-graphiteMw"> · ряду осталось {run.lengthMm} мм</span>
        )}
      </p>

      {unit && place && heightMm !== null && depthMm !== null && fronts ? (
        <dl
          className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]"
          data-inspector-module={unit.id}
          data-inspector-wall={wall.id}
          data-inspector-offset={unit.offsetMm}
          data-inspector-width={unit.widthMm}
          data-inspector-height={heightMm}
          data-inspector-depth={depthMm}
          data-inspector-leaves={fronts.leaves.length}
          data-inspector-drawers={fronts.drawers.length}
        >
          <dt className="text-graphiteMw">Модуль</dt>
          <dd className="mw-num">
            {unit.label} · <span className="text-graphiteMw">ИД</span> {unit.id}
          </dd>
          <dt className="text-graphiteMw">Ряд</dt>
          <dd>{row ? ROW_TITLE[row] : '—'}</dd>
          <dt className="text-graphiteMw">От начала ряда</dt>
          <dd className="mw-num">{unit.offsetMm} мм</dd>
          <dt className="text-graphiteMw">Ширина</dt>
          <dd className="mw-num">{unit.widthMm} мм</dd>
          <dt className="text-graphiteMw">Высота корпуса</dt>
          <dd className="mw-num">{heightMm} мм</dd>
          <dt className="text-graphiteMw">Глубина</dt>
          <dd className="mw-num">{depthMm} мм</dd>
          <dt className="text-graphiteMw">Фасад</dt>
          <dd>{frontWords(fronts.leaves.length, fronts.drawers.length)}</dd>
          <dd className="col-span-2 mt-1 text-[12px] leading-snug text-graphiteMw">
            Ширину правят полем «Ширина, мм» ниже или ручкой на схеме. Высоту и глубину задают
            отметки объекта (вкладка «Размеры»): у отдельного модуля они пока не правятся —
            иначе раскрой и смета разошлись бы с тем, что нарисовано.
          </dd>
        </dl>
      ) : gap ? (
        <p
          className="mt-2 text-[13px] leading-snug"
          data-inspector-gap={gap.fromMm}
          data-gap-width={gap.widthMm}
        >
          Пустое место · {ROW_TITLE[gap.row]}:{' '}
          <span className="mw-num">
            {gap.fromMm}…{gap.fromMm + gap.widthMm} мм ({gap.widthMm} мм)
          </span>
          . Ниже — что сюда встаёт: нажмите карточку, модуль встанет с начала этого места.
        </p>
      ) : (
        <p className="mt-2 text-[13px] leading-snug text-graphiteMw" data-inspector-empty>
          Нажмите на пустое место стены — ниже появятся модули, которые туда встают. Нажмите на
          модуль — здесь его размеры.
        </p>
      )}
    </div>
  );
}
