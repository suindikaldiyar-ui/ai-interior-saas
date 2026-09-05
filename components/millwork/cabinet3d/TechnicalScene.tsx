'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { edgeVertices, runModuleBoxes, type ModuleBoxes } from '@/lib/millwork/runBoxes';
import { DEFAULT_PRODUCTION, type ProductionSettings } from '@/types/catalog';
import type { Run } from '@/types/millwork';

/**
 * ТЕХНИЧЕСКАЯ АКСОНОМЕТРИЯ — ЖИВАЯ.
 *
 * Референс — вывод Базиса: проволочный каркас изделия и ничего больше. Ни
 * комнаты, ни стен, ни пола, ни света, ни теней. Мебельщик смотрит сюда за
 * конструкцией, а не за настроением: настроение показывает визуализация,
 * и путать их — значит не дать ни того, ни другого.
 *
 * Нутро видно насквозь: рёбра рисуются все, грани идут еле заметной
 * заливкой только чтобы читалась глубина. Полки, ящики и перегородки
 * оказываются видны сами собой — они те же коробки.
 *
 * Данные — `runModuleBoxes`, то есть те же `cabinetBoxes`, что кормят
 * печатную аксонометрию и старую сцену. Третьего набора геометрии в
 * продукте нет.
 */

type Props = {
  run: Run;
  production?: ProductionSettings;
  /** Выделение общее с чертежом: тот же `selectedModuleId`. */
  selectedModuleId?: string | null;
  onSelectModule?: (moduleId: string) => void;
  /** Фасады сняты — видно наполнение. */
  cutaway?: boolean;
};

/** Цвет рёбер и выделения: чёрная линейная графика, акцент — латунь. */
const EDGE_COLOR = '#1f1f1f';
const SELECTED_COLOR = '#c08b3e';

/** Тап короче этого и без смещения — это выбор, а не поворот камеры. */
const TAP_MS = 400;
const TAP_SLOP_PX = 8;

export default function TechnicalScene({
  run,
  production = DEFAULT_PRODUCTION,
  selectedModuleId,
  onSelectModule,
  cutaway = false,
}: Props) {
  const [home, setHome] = useState(0);

  const model = useMemo(
    () =>
      runModuleBoxes(run, {
        thicknessMm: production.carcassMm,
        frontMm: production.frontMm,
        gapMm: production.frontGapMm,
        cutaway,
      }),
    [run, production.carcassMm, production.frontMm, production.frontGapMm, cutaway],
  );

  const b = model.bounds;
  const center = useMemo(
    () =>
      new THREE.Vector3(
        (b.minX + b.maxX) / 2,
        (b.minY + b.maxY) / 2,
        (b.minZ + b.maxZ) / 2,
      ),
    [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ],
  );

  /** Отступ камеры от габарита: по нему считается и исходный ракурс. */
  const reach = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ) * 1.1 + 0.6;

  return (
    <div className="relative h-full w-full">
      <Canvas
        /*
         * ЛОВУШКА FRAMELOOP. Сцена рисуется ПО ТРЕБОВАНИЮ: мебель стоит на
         * месте, и гнать шестьдесят кадров в секунду по неподвижной картинке
         * значит греть планшет впустую. Но тогда КАЖДОЕ движение камеры
         * обязано само попросить кадр — иначе поворот «не работает» при
         * полностью верном коде. См. `DemandOrbit` ниже.
         */
        frameloop="demand"
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [reach, reach * 0.7, reach], fov: 35, near: 0.05, far: 100 }}
        // Ни комнаты, ни фона: изделие висит на цвете листа.
        style={{ background: 'transparent' }}
      >
        {/*
          * Свет только рассеянный. Направленный дал бы светотень, а это уже
          * визуализация: на техническом виде тень скрывает рёбра, ради
          * которых вид и смотрят.
          */}
        <ambientLight intensity={1} />

        <DemandOrbit center={center} reach={reach} home={home} />

        <RunEdges model={model} selectedModuleId={selectedModuleId ?? null} />
        <ModulePicker modules={model.modules} onSelect={onSelectModule} />
        <RunDimensions model={model} run={run} />
      </Canvas>

      <button
        type="button"
        onClick={() => setHome((n) => n + 1)}
        className="mw-btn mw-btn-ghost absolute right-3 top-3"
      >
        Исходный ракурс
      </button>
    </div>
  );
}

/* ─────────────────────────  Камера  ───────────────────────── */

/**
 * Орбита, которая умеет просить кадр.
 *
 * `OrbitControls` двигают камеру в своих обработчиках событий, вне цикла
 * R3F. При `frameloop="demand"` кадр после этого никто не рисует, и сцена
 * замирает — та же ловушка, что была с анимацией ящиков.
 *
 * Поэтому здесь два независимых механизма, и оба нужны:
 *   1. `onChange` просит кадр на каждое движение указателя;
 *   2. `useFrame` доводит инерцию затухания и просит следующий кадр, пока
 *      она не улеглась. Без него камера останавливалась бы рывком на
 *      последнем событии указателя.
 */
function DemandOrbit({
  center,
  reach,
  home,
}: {
  center: THREE.Vector3;
  reach: number;
  home: number;
}) {
  const controls = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const invalidate = useThree((state) => state.invalidate);
  const camera = useThree((state) => state.camera);

  // Возврат к исходному ракурсу: то же положение, что при открытии.
  useEffect(() => {
    camera.position.set(center.x + reach, center.y + reach * 0.7, center.z + reach);
    controls.current?.target.copy(center);
    controls.current?.update();
    invalidate();
  }, [home, center, reach, camera, invalidate]);

  useFrame(() => {
    // Возвращает true, пока затухание ещё двигает камеру.
    if (controls.current?.update()) invalidate();
  });

  return (
    <OrbitControls
      ref={controls}
      target={center}
      makeDefault
      enableDamping
      dampingFactor={0.15}
      minDistance={0.4}
      maxDistance={reach * 4}
      onChange={() => invalidate()}
      /*
       * ТАЧ: один палец вращает, два — приближают и двигают. Это то, чего
       * рука ждёт от объёмного вида; палец, который вместо поворота
       * панорамирует, читается как сломанный экран.
       */
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
  );
}

/* ─────────────────────────  Рёбра  ───────────────────────── */

/**
 * Все рёбра гарнитура ОДНИМ вызовом отрисовки.
 *
 * Отдельная `EdgesGeometry` на каждую коробку дала бы на ряде 5000 мм
 * больше сотни объектов и столько же вызовов — планшет перестал бы
 * поворачивать сцену плавно. Здесь вершины сложены в один буфер
 * (`edgeVertices`), и он пересобирается только при смене состава.
 *
 * Выделенный модуль — второй такой же буфер, но только из его коробок:
 * подсветка не перекрашивает общий, а рисуется поверх.
 */
function RunEdges({
  model,
  selectedModuleId,
}: {
  model: ReturnType<typeof runModuleBoxes>;
  selectedModuleId: string | null;
}) {
  const all = useMemo(
    () => edgeVertices([...model.modules.flatMap((m) => m.boxes), ...model.shared]),
    [model],
  );

  const picked = useMemo(() => {
    const found = model.modules.find((m) => m.moduleId === selectedModuleId);
    return found ? edgeVertices(found.boxes) : null;
  }, [model, selectedModuleId]);

  const faces = useMemo(
    () => [...model.modules.flatMap((m) => m.boxes), ...model.shared],
    [model],
  );

  return (
    <group>
      {/*
        * Грани — еле заметной заливкой. Без них проволока читается плоской
        * и передние рёбра не отличить от задних; с непрозрачной заливкой
        * пропадает нутро, ради которого вид и смотрят.
        */}
      <FaintFaces boxes={faces} />

      <Edges vertices={all} color={EDGE_COLOR} opacity={0.85} />
      {picked && <Edges vertices={picked} color={SELECTED_COLOR} opacity={1} />}
    </group>
  );
}

/** Один `LineSegments` на переданный буфер вершин. */
function Edges({
  vertices,
  color,
  opacity,
}: {
  vertices: Float32Array;
  color: string;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.computeBoundingSphere();
    return g;
  }, [vertices]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} renderOrder={2}>
      {/*
        * `linewidth` в WebGL почти везде игнорируется — задавать его
        * бессмысленно. Разницу между обычным и выделенным ребром держим
        * ЦВЕТОМ и порядком отрисовки, а не шириной, на которую нельзя
        * положиться ни в одном браузере.
        */}
      <lineBasicMaterial color={color} depthTest={false} transparent opacity={opacity} />
    </lineSegments>
  );
}

/** Полупрозрачные грани одним инстансным мешем: один вызов на весь ряд. */
function FaintFaces({ boxes }: { boxes: { position: [number, number, number]; scale: [number, number, number] }[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const node = mesh.current;
    if (!node) return;
    const m = new THREE.Matrix4();
    boxes.forEach((box, i) => {
      m.compose(
        new THREE.Vector3(...box.position),
        new THREE.Quaternion(),
        new THREE.Vector3(...box.scale),
      );
      node.setMatrixAt(i, m);
    });
    node.instanceMatrix.needsUpdate = true;
    // Без этого мебель пропадает при отсечении по камере, стоя в кадре.
    node.computeBoundingSphere();
  }, [boxes]);

  return (
    // Число экземпляров задаётся при создании буфера: сменился состав —
    // меш пересоздаётся через key, иначе буфер остаётся прежней длины.
    <instancedMesh key={boxes.length} ref={mesh} args={[undefined, undefined, boxes.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.14} depthWrite={false} />
    </instancedMesh>
  );
}

/* ─────────────────────────  Выбор модуля  ───────────────────────── */

/**
 * Невидимые габариты модулей — только для попадания пальцем.
 *
 * Кликать по рёбрам нельзя: линия толщиной в пиксель не ловится ни мышью,
 * ни тем более пальцем. Поэтому у каждого модуля есть своя невидимая
 * коробка по габариту — их полтора десятка, а не сотня деталей.
 *
 * `visible={false}` НЕ годится: невидимый меш перестаёт участвовать и в
 * трассировке луча. Гасим прозрачностью и `colorWrite`, чтобы коробки
 * ничего не рисовали, но продолжали ловить указатель.
 */
function ModulePicker({
  modules,
  onSelect,
}: {
  modules: ModuleBoxes[];
  onSelect?: (moduleId: string) => void;
}) {
  /*
   * ТАП ПРОТИВ ПОВОРОТА. Палец, который проехал по экрану, крутил камеру —
   * выбирать им модуль нельзя. Поэтому запоминаем, где и когда палец лёг,
   * и считаем выбором только короткое касание почти без смещения.
   *
   * `setPointerCapture` здесь не вызывается ВООБЩЕ: для эмулированного
   * указателя он бросает исключение и молча роняет обработчик, а планшет —
   * основной случай, а не редкий.
   */
  const down = useRef<{ x: number; y: number; at: number } | null>(null);

  return (
    <group>
      {modules.map((m) => (
        <mesh
          key={m.moduleId}
          position={[m.x + m.widthM / 2, m.y + m.heightM / 2, -m.depthM / 2]}
          onPointerDown={(event) => {
            down.current = { x: event.clientX, y: event.clientY, at: Date.now() };
          }}
          onPointerUp={(event) => {
            const start = down.current;
            down.current = null;
            if (!start || !onSelect) return;

            const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
            if (moved > TAP_SLOP_PX || Date.now() - start.at > TAP_MS) return;

            event.stopPropagation();
            onSelect(m.moduleId);
          }}
        >
          <boxGeometry args={[m.widthM, m.heightM, m.depthM]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ─────────────────────────  Размеры  ───────────────────────── */

/**
 * Ширина над каждым модулем, общая длина сверху, высота сбоку.
 *
 * Подписи — DOM через `Html`, а не текст в сцене. Причин две: они ВСЕГДА
 * читаются при любом повороте (в сцене текст пришлось бы разворачивать к
 * камере и он всё равно вставал бы вверх ногами), и они не тянут из сети
 * шрифт — сцена обязана работать в новостройке без интернета.
 */
function RunDimensions({
  model,
  run,
}: {
  model: ReturnType<typeof runModuleBoxes>;
  run: Run;
}) {
  const b = model.bounds;
  const top = b.maxY + 0.12;

  return (
    <group>
      {model.modules
        // Верхний ряд подписываем по его же верху, нижний — по своему.
        .map((m) => (
          <Html
            key={m.moduleId}
            position={[m.x + m.widthM / 2, m.y + m.heightM + 0.05, -m.depthM / 2]}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className="mw-num rounded bg-white/85 px-1 text-[10px] leading-tight text-black">
              {m.unit.widthMm}
            </span>
          </Html>
        ))}

      {/* Общая длина ряда — над всем. */}
      <Html
        position={[(b.minX + b.maxX) / 2, top, 0]}
        center
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <span className="mw-num rounded bg-black px-1.5 text-[11px] leading-tight text-white">
          {run.lengthMm}
        </span>
      </Html>

      {/* Высота — сбоку, у левого края. */}
      <Html
        position={[b.minX - 0.12, (b.minY + b.maxY) / 2, 0]}
        center
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <span className="mw-num rounded bg-white/85 px-1 text-[10px] leading-tight text-black">
          {Math.round((b.maxY - b.minY) * 1000)}
        </span>
      </Html>
    </group>
  );
}
