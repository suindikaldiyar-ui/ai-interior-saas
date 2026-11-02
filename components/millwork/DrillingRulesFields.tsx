'use client';

import { DRILLING_RANGES_MM, type DrillingSettings } from '@/types/catalog';

/**
 * ПРАВИЛА ПРИСАДКИ ЦЕХА — ОДНА ФОРМА (FINAL MASTER STAGE, фаза 6) на «Документы → Присадка» и
 * «/admin/production». Что даёт паспорт производителя (Ø и глубина чашки, TB, межосевые), здесь не правится;
 * здесь — решения цеха. Пусто — отверстие не ставится, умолчаний нет. Любая правка снимает «Цех подтвердил»:
 * галочку ставит только человек.
 */
export default function DrillingRulesFields({ rules, onRules }: { rules: DrillingSettings; onRules: (next: DrillingSettings) => void }) {
  const setNum = (key: 'hingeEdgeMm' | 'handleHoleMm' | 'minRemainMm', raw: string) => {
    const n = raw === '' ? null : Number(raw.replace(',', '.'));
    onRules({ ...rules, [key]: n === null || Number.isFinite(n) ? n : rules[key], confirmed: false });
  };
  const range = (key: keyof typeof DRILLING_RANGES_MM) => `${DRILLING_RANGES_MM[key][0]}…${DRILLING_RANGES_MM[key][1]} мм`;
  return (
    <>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-[13px]">
        От края фасада до оси крайней чашки, мм ({range('hingeEdgeMm')})
        <input className="mw-field" inputMode="decimal" value={rules.hingeEdgeMm ?? ''} onChange={(e) => setNum('hingeEdgeMm', e.target.value)} data-drill-rule="hingeEdgeMm" />
      </label>
      <label className="grid gap-1 text-[13px]">
        Отверстие под винт ручки (насквозь), Ø мм ({range('handleHoleMm')})
        <input className="mw-field" inputMode="decimal" value={rules.handleHoleMm ?? ''} onChange={(e) => setNum('handleHoleMm', e.target.value)} data-drill-rule="handleHoleMm" />
      </label>
      <label className="grid gap-1 text-[13px]">
        Минимальный остаток под глухим отверстием, мм ({range('minRemainMm')})
        <input className="mw-field" inputMode="decimal" value={rules.minRemainMm ?? ''} onChange={(e) => setNum('minRemainMm', e.target.value)} data-drill-rule="minRemainMm" />
      </label>
      <label className="grid gap-1 text-[13px]">
        Число петель: «до высоты фасада, мм = петель», через запятую
        <input
          className="mw-field"
          defaultValue={rules.hingeCount.map((r) => `${r.upToMm}=${r.hinges}`).join(', ')}
          onBlur={(e) => {
            const rows = e.target.value
              .split(',')
              .map((s) => s.trim().split('=').map((x) => Number(x.trim())))
              .filter(([a, b]) => Number.isFinite(a) && Number.isInteger(b) && a > 0 && b > 0)
              .map(([upToMm, hinges]) => ({ upToMm, hinges }))
              .sort((a, b) => a.upToMm - b.upToMm);
            onRules({ ...rules, hingeCount: rows, confirmed: false });
          }}
          data-drill-rule="hingeCount"
        />
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={rules.plateOnCupAxis} onChange={(e) => onRules({ ...rules, plateOnCupAxis: e.target.checked, confirmed: false })} data-drill-rule="plateOnCupAxis" />
        Ось монтажной планки — на высоте оси чашки
      </label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={rules.handlePlaceConfirmed} onChange={(e) => onRules({ ...rules, handlePlaceConfirmed: e.target.checked, confirmed: false })} data-drill-rule="handlePlaceConfirmed" />
        Место ручки на фасаде — как в сцене (правило продукта)
      </label>
      <label className="grid gap-1 text-[13px]">
        Полкодержатели: оси от передней / задней кромки, мм
        <span className="flex gap-2">
          {(['frontMm', 'backMm'] as const).map((k) => (
            <input
              key={k}
              className="mw-field"
              inputMode="decimal"
              value={rules.shelfSupport?.[k] ?? ''}
              onChange={(e) => {
                const v = Number(e.target.value.replace(',', '.'));
                const cur = rules.shelfSupport ?? { frontMm: NaN, backMm: NaN };
                const next = { ...cur, [k]: v };
                onRules({ ...rules, shelfSupport: Number.isFinite(next.frontMm) && Number.isFinite(next.backMm) ? next : null, confirmed: false });
              }}
              data-drill-rule={`shelf-${k}`}
            />
          ))}
        </span>
      </label>
      <label className="grid gap-1 text-[13px]">
        Конфирмат: Ø в пласти / Ø в торце / глубина в торце / от передней / от задней, мм
        <input
          className="mw-field"
          defaultValue={rules.confirmat ? [rules.confirmat.faceDiameterMm, rules.confirmat.edgeDiameterMm, rules.confirmat.edgeDepthMm, rules.confirmat.fromFrontMm, rules.confirmat.fromBackMm].join(' / ') : ''}
          onBlur={(e) => {
            const n = e.target.value.split('/').map((x) => Number(x.trim().replace(',', '.')));
            const ok = n.length === 5 && n.every((x) => Number.isFinite(x) && x > 0);
            onRules({
              ...rules,
              confirmat: ok ? { faceDiameterMm: n[0], edgeDiameterMm: n[1], edgeDepthMm: n[2], fromFrontMm: n[3], fromBackMm: n[4] } : null,
              confirmed: false,
            });
          }}
          data-drill-rule="confirmat"
        />
      </label>
    </div>
    <label className="mt-3 flex items-center gap-2 text-[15px]">
      <input type="checkbox" checked={rules.confirmed} onChange={(e) => onRules({ ...rules, confirmed: e.target.checked })} data-drill-rule="confirmed" />
      Цех подтвердил эти правила
    </label>
    </>
  );
}
