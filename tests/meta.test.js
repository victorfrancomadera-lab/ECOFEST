const test = require('node:test');
const assert = require('node:assert');
const Meta = require('../js/meta.js');

const base = { empresa: 'Prueba', tamano: 'Micro', inicio: '2026-09-01', fin: '2026-09-30', metaDiaria: 100 };

test('días del ciclo cuentan inicio y lectura', () => {
  assert.strictEqual(Meta.diasEntre('2026-09-01', '2026-09-30'), 30);
  assert.strictEqual(Meta.diasEntre('2026-10-01', '2026-10-20'), 20);
});

test('zonas en los límites exactos de la CREG', () => {
  assert.strictEqual(Meta.zonaDe(89.9), 'ahorro');
  assert.strictEqual(Meta.zonaDe(90), 'segura');
  assert.strictEqual(Meta.zonaDe(110), 'segura');
  assert.strictEqual(Meta.zonaDe(110.1), 'recargo');
});

test('evaluar compara por día, no por mes', () => {
  const r = Meta.evaluar({ ...base, consumoKwh: 2550 }); // 85 kWh/día sobre meta 100
  assert.strictEqual(r.dias, 30);
  assert.strictEqual(r.porcentaje, 85);
  assert.strictEqual(r.zona, 'ahorro');
  assert.strictEqual(r.ahorroKwh, 450);
  const corto = Meta.evaluar({ ...base, fin: '2026-09-20', consumoKwh: 2300 }); // 115 kWh/día
  assert.strictEqual(corto.porcentaje, 115);
  assert.strictEqual(corto.zona, 'recargo');
});

test('meta = mediana de los promedios diarios', () => {
  const h = [[3000, 30], [3100, 31], [2900, 29], [6000, 30]].map(([kwh, dias]) => ({ kwh, dias }));
  const m = Meta.calcularMeta(h);
  assert.strictEqual(m.metaDiaria, 100); // 100,100,100,200 → mediana 100
  assert.strictEqual(m.completo, false);
});

test('validar rechaza datos imposibles y alerta los sospechosos', () => {
  assert.strictEqual(Meta.validar({ ...base, consumoKwh: 0 }).valido, false);
  assert.strictEqual(Meta.validar({ ...base, consumoKwh: 3000, tamano: 'X' }).valido, false);
  const sosp = Meta.validar({ ...base, consumoKwh: 30000 });
  assert.strictEqual(sosp.valido, true);
  assert.strictEqual(sosp.alertas.length, 1);
});

test('ranking separa por tamaño, ordena por % y usa el último registro', () => {
  const regs = [
    { ...base, empresa: 'A', ciclo: '2026-09', consumoKwh: 2700, creado: '1' },
    { ...base, empresa: 'B', ciclo: '2026-09', consumoKwh: 2400, creado: '1' },
    { ...base, empresa: 'A', ciclo: '2026-09', consumoKwh: 2100, creado: '2' }, // corrige a A
    { ...base, empresa: 'C', tamano: 'Grande', ciclo: '2026-09', consumoKwh: 3600, creado: '1' },
    { ...base, empresa: 'D', ciclo: '2026-10', consumoKwh: 100, creado: '1' },
  ];
  const g = Meta.ranking(regs, '2026-09');
  assert.deepStrictEqual(g.Micro.map(r => r.empresa), ['A', 'B']);
  assert.strictEqual(g.Micro[0].resultado.porcentaje, 70);
  assert.deepStrictEqual(g.Grande.map(r => r.puesto), [1]);
  assert.strictEqual(g.Pequeña.length, 0);
});

test('valor en pesos: diferencia, bono y recargo con parámetros', () => {
  // 85 kWh/día sobre meta 100 en 30 días: 450 kWh por debajo de la meta.
  const ahorro = Meta.valorEnPesos({ ...base, consumoKwh: 2550, tarifaKwh: 800 }, { pctBono: 10, pctRecargo: 20 });
  assert.strictEqual(ahorro.kwhDiferencia, 450);
  assert.strictEqual(ahorro.valorDiferencia, 360000);
  assert.strictEqual(ahorro.bono, 36000);
  assert.strictEqual(ahorro.recargo, 0);
  // 120 kWh/día: 3600 kWh contra 3300 del 110 % → 300 kWh sobre el límite.
  const recargo = Meta.valorEnPesos({ ...base, consumoKwh: 3600, tarifaKwh: 800 }, { pctBono: 10, pctRecargo: 20 });
  assert.strictEqual(recargo.kwhSobreRecargo, 300);
  assert.strictEqual(recargo.recargo, 48000);
  assert.strictEqual(recargo.bono, 0);
  assert.strictEqual(recargo.valorDiferencia, -480000);
  // Zona segura: ni bono ni recargo.
  const segura = Meta.valorEnPesos({ ...base, consumoKwh: 3000, tarifaKwh: 800 }, { pctBono: 10, pctRecargo: 20 });
  assert.strictEqual(segura.bono + segura.recargo, 0);
});

test('valor en pesos: sin tarifa no hay valor; sin porcentajes no hay bono', () => {
  assert.strictEqual(Meta.valorEnPesos({ ...base, consumoKwh: 2550 }), null);
  const v = Meta.valorEnPesos({ ...base, consumoKwh: 2550, tarifaKwh: 800 });
  assert.strictEqual(v.bono, 0);
  assert.strictEqual(v.conParametros, false);
  assert.strictEqual(v.valorDiferencia, 360000);
});

test('proyección del ciclo en curso y máximos diarios', () => {
  // Meta 100 kWh/día, ciclo de 30 días; en 10 días lleva 950 kWh (95 kWh/día).
  const p = Meta.proyectarCiclo(100, 950, 10, 30);
  assert.strictEqual(p.porcentaje, 95);
  assert.strictEqual(p.zona, 'segura');
  assert.strictEqual(p.kwhAlCierre, 2850);
  assert.strictEqual(p.diasRestantes, 20);
  assert.strictEqual(p.maxDiarioAhorro, 87.5);   // (2700 − 950) / 20
  assert.strictEqual(p.maxDiarioSinRecargo, 117.5); // (3300 − 950) / 20
  // Si ya se pasó del tope, el máximo es cero, no negativo.
  assert.strictEqual(Meta.proyectarCiclo(100, 2800, 25, 30).maxDiarioAhorro, 0);
  // Datos imposibles.
  assert.strictEqual(Meta.proyectarCiclo(100, 500, 0, 30), null);
  assert.strictEqual(Meta.proyectarCiclo(100, 500, 31, 30), null);
});
