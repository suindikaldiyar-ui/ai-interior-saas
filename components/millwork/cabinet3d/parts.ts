'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * ОБЩИЕ ГЕОМЕТРИЯ И МАТЕРИАЛЫ.
 *
 * Ряд 3200 мм — это семь модулей, около шестидесяти мешей плюс ящики.
 * Каждая полка со своей `BoxGeometry` и своим материалом превратила бы
 * сцену в сотню объектов: планшет замерщика этого не заслужил.
 *
 * Поэтому геометрия одна — единичный куб, который масштабируется, — а
 * материалов на всю сцену пять: корпус, фасад, столешница, техника, металл.
 */

export type CabinetParts = {
  box: THREE.BoxGeometry;
  cylinder: THREE.CylinderGeometry;
  carcass: THREE.MeshStandardMaterial;
  front: THREE.MeshStandardMaterial;
  counter: THREE.MeshStandardMaterial;
  appliance: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  /** Невидимый материал зон касания. */
  hit: THREE.MeshBasicMaterial;
};

export type CabinetPalette = {
  facade: string;
  carcass: string;
  counter: string;
};

export function useCabinetParts(palette: CabinetPalette): CabinetParts {
  return useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);

    return {
      box,
      cylinder,
      carcass: new THREE.MeshStandardMaterial({
        color: palette.carcass,
        roughness: 0.72,
        metalness: 0.02,
      }),
      front: new THREE.MeshStandardMaterial({
        color: palette.facade,
        roughness: 0.42,
        metalness: 0.04,
      }),
      counter: new THREE.MeshStandardMaterial({
        color: palette.counter,
        roughness: 0.3,
        metalness: 0.05,
      }),
      appliance: new THREE.MeshStandardMaterial({
        color: '#2A2C2E',
        roughness: 0.34,
        metalness: 0.5,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: '#9AA0A6',
        roughness: 0.28,
        metalness: 0.85,
      }),
      // Зоны касания невидимы, но должны ловить луч: `visible: false` его
      // не пропускает, поэтому материал прозрачный, а не выключенный.
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    };
  }, [palette.carcass, palette.facade, palette.counter]);
}
