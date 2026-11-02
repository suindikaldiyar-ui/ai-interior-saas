import type { HardwareItem } from '@/types/catalog';
import type { Module } from '@/types/millwork';
import { installedItem } from './fittings';
import { mechanismOf } from './mechanisms';
import { aventosPose, aventosOf, type AventosModel } from './aventos';
import { rotate } from './hingeLinkage';

/**
 * КИНЕМАТИКА ПОДЪЁМНИКА (HW-07) — ОДНА ПОЗА НА СЦЕНУ И ПРОВЕРКУ ХОДА.
 *
 * Вид хода — класс механизма позиции на месте модуля (`mechanismOf`), а не
 * буквы подвида. Поза — в осях створки: ось — верхняя кромка фасада на
 * передней плоскости корпуса, полотно в закрытом положении висит вниз.
 *
 *   swing_up       поворот вверх вокруг верхней кромки (Blum HK, DTC SQ / SE);
 *   parallel_lift  фасад поднимается вертикально на свою высоту и чуть
 *                  вперёд — встаёт над крышей корпуса (Blum HL, DTC SK);
 *   swing_over     сначала вверх на свою высоту, потом заваливается назад
 *                  над крышей (Blum HS);
 *   fold           складной из двух фасадов (Blum HF, DTC ST) — у модуля
 *                  в раскрое одна створка, второго фасада нет: ход не
 *                  строится и это сказано словами (`liftWords`).
 *
 * Числа хода — по рисункам каталогов (подъём на высоту фасада, наклон 90°);
 * вынос вперёд у параллельного — на толщину фасада, условно (в паспортах
 * он зависит от рычагов и корпуса). Статус — VISUAL_RECONSTRUCTION.
 */

export type LiftMotion = 'swing_up' | 'parallel_lift' | 'swing_over' | 'fold';

/** Вид хода подъёмника на месте модуля; позиции нет — поворот вверх, как было. */
export function liftMotionOf(unit: Module, hardware?: Map<string, HardwareItem>): LiftMotion | null {
  const item = hardware ? installedItem(unit, 'lift', hardware) : null;
  if (!item) return null;
  const cls = mechanismOf(item);
  if (cls.system !== 'LIFT_SYSTEM') return null;
  if (cls.motion.kind === 'parallel_lift') return 'parallel_lift';
  if (cls.motion.kind === 'swing_over') return 'swing_over';
  if (cls.motion.kind === 'fold') return 'fold';
  if (cls.motion.kind === 'swing_up') return 'swing_up';
  return null;
}

export const LIFT_WORDS: Record<LiftMotion, string> = {
  swing_up: 'фасад поворачивается вверх вокруг верхней кромки',
  parallel_lift: 'фасад поднимается вертикально над корпусом, оставаясь вертикальным',
  swing_over: 'фасад поднимается и заваливается назад над крышей корпуса',
  fold: 'складной подъёмник: нужен фасад из двух частей — у модуля одна створка, ход не построен',
};

export type LiftPose = {
  /** Поворот вокруг оси створки (X), радианы: минус — полотно уходит вперёд-вверх, наружу. */
  angle: number;
  /** Сдвиг полотна ДО поворота (в осях створки), метры. */
  liftY: number;
  liftZ: number;
};

/**
 * МЕХАНИЗМ ПОДЪЁМНИКА НА ФАСАДЕ (AVENTOS HK top, HS top, HL top — `aventosOf`): модель и верх фасада
 * над низом крыши, мм (оси механизма). Нет модели — ход прежний, условный (`liftPose` по виду хода).
 */
/* `limitDeg` — ограничитель угла (задача B): фасад открывается до него, а не до паспортного угла. */
export type LiftMechanism = { model: AventosModel; frontTopMm: number; limitDeg?: number };

/** Модель механизма на месте модуля: позиция подъёмника и, у HL top, высота корпуса (комплект рычагов). */
export function liftModelOf(unit: Module, hardware: Map<string, HardwareItem> | undefined, cabinetHeightMm: number): AventosModel | null {
  const item = hardware ? installedItem(unit, 'lift', hardware) : null;
  return item ? aventosOf(item, cabinetHeightMm) : null;
}

/**
 * Поза при доле хода `u` ∈ [0, 1]. Точка полотна `p` (оси створки) уходит в
 * `Rx(angle) · (p + (0, liftY, liftZ))` — так её ставит сцена (внешняя группа
 * поворачивает, внутренняя сдвигает) и так её меряет `leafPoses`.
 *
 * С МЕХАНИЗМОМ (`mech`) поза — поза модели (`aventosPose`): фасад — шатун механизма, а не
 * поворот у кромки. Ось створки — верхняя кромка тыла фасада; в осях механизма это (0, верх фасада).
 */
export function liftPose(motion: LiftMotion | null, u: number, heightM: number, thicknessM: number, mech?: LiftMechanism | null): LiftPose {
  const s = Math.max(0, Math.min(1, u));
  if (mech) {
    /* Ограничитель (задача B): ход кончается на его угле — одна поза на сцену, ход у угла и приёмку. */
    const stop = mech.limitDeg && mech.model.openDeg > 0 ? Math.min(1, mech.limitDeg / mech.model.openDeg) : 1;
    const pose = aventosPose(mech.model, Math.min(s, stop));
    /* Куда ушла ось створки (мм механизма) → сдвиг до поворота в осях створки (метры). */
    const o: [number, number] = [0, mech.frontTopMm];
    const r = rotate(o, pose.theta);
    const d: [number, number] = [(r[0] + pose.shift[0] - o[0]) / 1000, (r[1] + pose.shift[1] - o[1]) / 1000];
    const t = rotate(d, -pose.theta);
    return { angle: -pose.theta, liftY: t[1], liftZ: t[0] };
  }
  if (motion === 'parallel_lift') return { angle: 0, liftY: heightM * s, liftZ: thicknessM * s };
  if (motion === 'swing_over') {
    const up = Math.min(1, s / 0.5);
    const tilt = Math.max(0, (s - 0.5) / 0.5);
    /* Поднятое полотно (над осью) заваливается назад, над крышей: тот же знак, что у поворота вверх. */
    return { angle: (-Math.PI / 2) * tilt, liftY: heightM * up, liftZ: 0 };
  }
  /* swing_up, fold (ход не строится — полотно поворачивается, как без механизма) и без позиции. */
  return { angle: (-Math.PI / 2) * s, liftY: 0, liftZ: 0 };
}

/** Точка полотна в осях створки → в оси модуля (`origin` — ось створки в модуле). */
export function liftPlace(origin: [number, number, number], pose: LiftPose, p: [number, number, number]): [number, number, number] {
  const y = p[1] + pose.liftY;
  const z = p[2] + pose.liftZ;
  const c = Math.cos(pose.angle);
  const sn = Math.sin(pose.angle);
  return [origin[0] + p[0], origin[1] + y * c - z * sn, origin[2] + y * sn + z * c];
}
