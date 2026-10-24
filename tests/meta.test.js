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
