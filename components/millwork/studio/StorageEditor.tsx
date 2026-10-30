'use client';

import { useMemo, useState } from 'react';
import { runPlaces } from '@/lib/millwork/cabinetBoxes';
import { fridgeStorageOf, mezzanineBaseOf } from '@/lib/millwork/fill';
import { frontOf, frontTitle } from '@/lib/millwork/frontMaterial';
import { FRIDGE_MEZZANINE_MIN_MM } from '@/lib/millwork/modules';
import { OPENING_TITLE } from '@/lib/millwork/opening';
import { ceilingOverSpanMm } from '@/lib/millwork/ceiling';
import { ceilingGapOf } from '@/lib/millwork/shop';
import type { MillworkOp, Module, Run } from '@/types/millwork';

/**
 * КЛАДОВКА НАД ХОЛОДИЛЬНИКОМ — СВОЯ ВЫСОТА И ГЛУБИНА (ЭТАП 4, часть 2).
 *
 * Высоту и глубину этой кладовки задать было нельзя: высота шла остатком над
 * колонной, глубина — общей отметкой антресоли объекта, а инспектор говорил,
 * что у отдельного модуля они не правятся. Здесь — два поля и числа той же
 * раскладки (`runPlaces`, `fridgeStorageOf`), по которой кладовку рисует
 * сцена и режет цех. Встанет ли — отвечает движок (`set_storage`) вхолостую
 * на каждое число, и его слова видны ДО нажатия. Своей арифметики нет.
 */
type Props = {
  unit: Module;
  run: Run;
  onOps: (ops: MillworkOp[], onRefusal: (text: string | null) => void) => void;
  /** Те же операции вхолостую: ответ движка до нажатия. */
  preview: (ops: MillworkOp[]) => Run;
};

const num = (text: string): number | undefined => {
  const value = Number(text.replace(',', '.').trim());
  return text.trim() && Number.isFinite(value) ? Math.round(value) : undefined;
};

export default function StorageEditor({ unit, run, onOps, preview }: Props) {
  const storageUnit =
    unit.section === 'mezzanine' && mezzanineBaseOf(unit, run)?.appliance === 'fridge'
      ? unit
      : unit.appliance === 'fridge'
        ? (run.upperSegments
            .flatMap((segment) => segment.modules)
            .find((m) => m.section === 'mezzanine' && mezzanineBaseOf(m, run)?.id === unit.id) ?? null)
        : null;
  const column = storageUnit ? mezzanineBaseOf(storageUnit, run) : unit.appliance === 'fridge' ? unit : null;
  const storage = column ? fridgeStorageOf(column, run) : null;
  const place = storageUnit ? runPlaces(run).find((p) => p.unit.id === storageUnit.id) ?? null : null;
  const heightNow = place ? Math.round(place.heightM * 1000) : null;
  const depthNow = place ? Math.round(place.depthM * 1000) : null;
  const bottomNow = place ? Math.round(place.y * 1000) : null;

  const [height, setHeight] = useState(String(heightNow ?? ''));
  const [depth, setDepth] = useState(String(depthNow ?? ''));
  const [notice, setNotice] = useState<string | null>(null);

  const op = useMemo((): MillworkOp | null => {
    if (!column) return null;
    const h = num(height);
    const d = num(depth);
    const change: MillworkOp = { op: 'set_storage', moduleId: column.id };
    if (h !== undefined && h !== heightNow) change.heightMm = h;
    if (d !== undefined && d !== depthNow) change.depthMm = d;
    return change.heightMm !== undefined || change.depthMm !== undefined ? change : null;
  }, [column, height, depth, heightNow, depthNow]);

  const refusal = useMemo(() => (op ? (preview([op]).warnings[0] ?? null) : null), [op, preview]);

  if (!column || !storage) return null;

  const gap = ceilingGapOf(run.production);
  const own = column.storageOver;
  /* До НАСТОЯЩЕГО потолка над колонной: верх зоны ниже его на монтажный зазор цеха. */
  const realCeiling = ceilingOverSpanMm(column.offsetMm, column.offsetMm + column.widthMm, run.beams ?? [], run.ceilingHeightMm);
  const toCeiling = heightNow !== null && bottomNow !== null ? Math.max(0, realCeiling - (bottomNow + heightNow)) : null;
  const hinge = storageUnit?.fill?.hinge;
  /*
   * Вентиляция встроенного холодильника выходит под крышу колонны, а кладовка
   * её закрывает. Моделей холодильников с правилами монтажа в фактах нет —
   * зазор не выдумываем, а называем.
   */
  const ventWords = column.builtIn
    ? 'Вентиляция холодильника под кладовкой не рассчитана: модели холодильника с правилами монтажа нет — зазор над колонной цех задаёт сам.'
    : 'Над отдельностоящим холодильником зазор на вентиляцию не рассчитан: модели с правилами монтажа нет.';

  return (
    <section
      className="mw-panel grid gap-2"
      data-storage-editor
      data-storage-id={storageUnit?.id ?? ''}
      data-storage-column={column.id}
      data-storage-height={heightNow ?? ''}
      data-storage-depth={depthNow ?? ''}
      data-storage-bottom={bottomNow ?? ''}
      data-storage-gap={toCeiling ?? ''}
      data-storage-removed={storage.removed ? '1' : '0'}
    >
      <p className="text-[15px] font-medium">Кладовка над холодильником</p>
      {storageUnit && place && heightNow !== null && depthNow !== null && bottomNow !== null ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-graphiteMw">Ширина</dt>
          <dd className="mw-num">{storageUnit.widthMm} мм · = колонна «{column.label}», меняется шириной холодильника</dd>
          <dt className="text-graphiteMw">Низ · верх от пола</dt>
          <dd className="mw-num" data-storage-span>
            {bottomNow} · {bottomNow + heightNow} мм
          </dd>
          <dt className="text-graphiteMw">До потолка</dt>
          <dd className="mw-num">
            {toCeiling} мм{' '}
            <span className="text-graphiteMw">
              (потолок над колонной {realCeiling} мм
              {gap.gapMm > 0 ? `, из них монтажный зазор цеха ${gap.gapMm} мм${gap.confirmed ? '' : ' — не подтверждено цехом'}` : ''})
            </span>
          </dd>
          <dt className="text-graphiteMw">Корпус</dt>
          <dd>{storageUnit.carcassItemId ? `позиция каталога ${storageUnit.carcassItemId}` : 'корпус кухни'}</dd>
          <dt className="text-graphiteMw">Фасад</dt>
          <dd>{frontTitle(frontOf(storageUnit))}</dd>
          <dt className="text-graphiteMw">Открывание</dt>
          <dd>{hinge ? OPENING_TITLE[hinge] : '—'}</dd>
        </dl>
      ) : storage.removed ? (
        <p className="text-[13px] leading-snug" data-storage-gone>
          Кладовка убрана: над холодильником {Math.max(0, storage.roomMm)} мм до потолка пусто. Холодильник и колонна те же;
          своя высота и глубина вернутся вместе с кладовкой.
        </p>
      ) : (
        <p className="text-[13px] leading-snug text-alert" data-storage-missing>
          Над колонной {Math.max(0, storage.roomMm)} мм до потолка: кладовка ниже {FRIDGE_MEZZANINE_MIN_MM} мм не встаёт.
        </p>
      )}
      {storage.removed ? null : (
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['height', 'Высота кладовки, мм', height, setHeight],
            ['depth', 'Глубина кладовки, мм', depth, setDepth],
          ] as const
        ).map(([key, label, value, set]) => (
          <label key={key} className="grid gap-1 text-[13px]">
            <span className="text-graphiteMw">{label}</span>
            <input
              inputMode="numeric"
              data-storage-field={key}
              value={value}
              onChange={(event) => {
                set(event.target.value);
                setNotice(null);
              }}
              className="mw-field"
            />
          </label>
        ))}
      </div>
      )}
      <p className="text-[13px] leading-snug text-graphiteMw">
        Глубина не меняет высоту, высота не меняет холодильник: колонну задаёт прибор. Выше кладовка станет, только
        если ввести настоящую высоту холодильника. Над колонной сейчас {Math.max(0, storage.roomMm)} мм; глубина колонны{' '}
        {storage.columnDepthMm} мм.
      </p>
      {refusal ? (
        <p className="text-[13px] leading-snug text-alert" data-storage-refusal>
          {refusal}
        </p>
      ) : null}
      {notice ? (
        <p className="text-[13px] leading-snug text-alert" data-storage-notice>
          {notice}
        </p>
      ) : null}
      <p className="text-[12px] leading-snug text-graphiteMw" data-storage-vent>
        {ventWords}
      </p>
      <div className="flex flex-wrap gap-1">
        {storage.removed ? (
          <button
            type="button"
            data-storage-action="restore"
            onClick={() => onOps([{ op: 'set_storage', moduleId: column.id, removed: false }], setNotice)}
            className="mw-btn mw-btn-primary"
          >
            Восстановить кладовку
          </button>
        ) : (
          <button
            type="button"
            data-storage-action="set"
            disabled={!op || Boolean(refusal)}
            onClick={() => op && onOps([op], setNotice)}
            className="mw-btn mw-btn-primary disabled:opacity-40"
          >
            Применить
          </button>
        )}
        {storageUnit && !storage.removed ? (
          <button
            type="button"
            data-storage-action="remove"
            onClick={() => onOps([{ op: 'set_storage', moduleId: column.id, removed: true }], setNotice)}
            className="mw-btn"
          >
            Убрать кладовку
          </button>
        ) : null}
        {own && !storage.removed && (own.heightMm !== undefined || own.depthMm !== undefined) ? (
          <button
            type="button"
            data-storage-action="reset"
            onClick={() => onOps([{ op: 'set_storage', moduleId: column.id, heightMm: null, depthMm: null }], setNotice)}
            className="mw-btn"
          >
            По месту и по цеху
          </button>
        ) : null}
      </div>
    </section>
  );
}
