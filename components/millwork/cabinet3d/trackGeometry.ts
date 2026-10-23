'use client';

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRACK_MODEL } from '@/lib/millwork/lighting';

/**
 * ТРЕК ЧЁРНЫЙ 780 · 3 СПОТА — ПАРАМЕТРИЧЕСКАЯ СЕТКА (V3D-02).
 *
 * Не коробки: шинопровод — скруглённый профиль, корпус спота — тело
 * вращения со скошенным тыльным торцом и ободком, внутри — светлый
 * отражатель и светящаяся линза. Размеры — `TRACK_MODEL`: подтверждённые
 * фото (780, Ø56 × 85, высота 120–180) и условные, названные там же.
 * Это ВИЗУАЛЬНАЯ РЕКОНСТРУКЦИЯ, а не CAD производителя.
 *
 * Сетки — одни на вкладку: десяток треков не множит геометрию.
 *
 * Оси головки — те же, что у `trackPose`: начало в шарнире у тыльного торца,
 * корпус уходит по −Y (лицевой торец на −85 мм).
 */

const MM = 1000;

export type TrackGeometries = {
  /** Шинопровод вдоль X, верх на y = 0 (потолок). */
  rail: THREE.BufferGeometry;
  /** Ввод питания у торца шинопровода — условно. */
  feed: THREE.BufferGeometry;
  /** Адаптер под шинопроводом. */
  adapter: THREE.BufferGeometry;
  /** Стойка: от адаптера до шарнира. */
  stem: THREE.BufferGeometry;
  /** Шарнир у тыльного торца корпуса. */
  knuckle: THREE.BufferGeometry;
  /** Корпус: тыльный скос, цилиндр, ободок — тело вращения с острыми рёбрами. */
  body: THREE.BufferGeometry;
  /** Отражатель внутри ободка. */
  reflector: THREE.BufferGeometry;
  /** Светящаяся линза на дне отражателя. */
  lens: THREE.BufferGeometry;
  /** Кольцо выделения. */
  ring: THREE.BufferGeometry;
};

let cache: TrackGeometries | null = null;

/** Тело вращения из двух точек профиля: своя полоса — свои нормали, ребро острое. */
const band = (a: [number, number], b: [number, number], segments = 48) =>
  new THREE.LatheGeometry([new THREE.Vector2(a[0], a[1]), new THREE.Vector2(b[0], b[1])], segments);

export function trackGeometries(): TrackGeometries {
  if (cache) return cache;
  const r = TRACK_MODEL.headDiameterMm / 2 / MM;
  const L = TRACK_MODEL.headLengthMm / MM;
  const chamfer = 0.004;
  const rim = 0.0028;
  const bezel = 0.006;
  const reflectorDepth = TRACK_MODEL.reflectorDepthMm / MM;

  /*
   * Корпус: тыльный диск, скос, цилиндр, лицевой ободок, внутренняя стенка
   * ободка. Нормаль полосы — (dy, −dx) по ходу точек (`LatheGeometry`),
   * поэтому порядок точек выбран так, чтобы грань смотрела наружу: тыл — вверх,
   * цилиндр — от оси, ободок — вниз, стенка ободка и отражатель — к оси.
   */
  const body = mergeGeometries([
    band([r - chamfer, 0], [0, 0]),
    band([r, -chamfer], [r - chamfer, 0]),
    band([r, -L], [r, -chamfer]),
    band([r - rim, -L], [r, -L]),
    band([r - rim, -L + bezel], [r - rim, -L]),
  ]);
  /* Отражатель: конус от источника к ободку, лицом к выходу луча. */
  const reflector = band([0.009, -L + bezel + reflectorDepth], [r - rim, -L + bezel]);
  const lens = new THREE.CircleGeometry(0.009, 32);
  /* Линза смотрит по −Y: круг из плоскости XY кладётся нормалью вниз. */
  lens.rotateX(Math.PI / 2);
  lens.translate(0, -L + bezel + reflectorDepth - 0.0005, 0);

  const rail = new RoundedBoxGeometry(
    TRACK_MODEL.lengthMm / MM,
    TRACK_MODEL.railHeightMm / MM,
    TRACK_MODEL.railWidthMm / MM,
    3,
    0.003,
  );
  rail.translate(0, -TRACK_MODEL.railHeightMm / MM / 2, 0);

  const feed = new RoundedBoxGeometry(0.034, 0.02, 0.026, 2, 0.003);
  feed.translate(0, -0.01, 0);

  const [ax, ay, az] = TRACK_MODEL.adapterMm;
  const adapter = new RoundedBoxGeometry(ax / MM, ay / MM, az / MM, 2, 0.0025);
  adapter.translate(0, -ay / MM / 2, 0);

  const stem = new THREE.CylinderGeometry(
    TRACK_MODEL.stemDiameterMm / 2 / MM,
    TRACK_MODEL.stemDiameterMm / 2 / MM,
    TRACK_MODEL.stemMm / MM,
    20,
  );
  stem.translate(0, -TRACK_MODEL.stemMm / MM / 2, 0);

  const knuckle = new THREE.SphereGeometry(0.0085, 24, 16);
  const ring = new THREE.TorusGeometry(r + 0.006, 0.0018, 8, 48);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, -L / 2, 0);

  cache = { rail, feed, adapter, stem, knuckle, body, reflector, lens, ring };
  return cache;
}

/** Треугольников в одной головке — для замера нагрузки. */
export function headTriangles(): number {
  const g = trackGeometries();
  const tri = (geometry: THREE.BufferGeometry) =>
    geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
  return Math.round(tri(g.adapter) + tri(g.stem) + tri(g.knuckle) + tri(g.body) + tri(g.reflector) + tri(g.lens));
}
