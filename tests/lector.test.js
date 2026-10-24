const test = require('node:test');
const assert = require('node:assert');
const { leerFactura, normalizar, ErrorLectura } = require('../lector.js');

// Respuesta como la daría el modelo para una factura de Air-e (datos inventados).
const lecturaAire = {
  es_factura_de_energia: true,
  numero_factura: '8000000001',
  fecha_lectura_anterior: '2025-09-19',
  fecha_lectura_actual: '2025-10-21',
  dias_consumo: 32,
  consumo_kwh: 128,
  meta_diaria_kwh: null,
  tarifa_kwh: 773.523,
  observaciones: ''
};

function clienteFalso(respuesta) {
  const llamadas = [];
  return {
    llamadas: llamadas,
    beta: { messages: { create: async function (params) { llamadas.push(params); return respuesta; } } }
  };
}
function respuestaTexto(obj, stop) {
  return { stop_reason: stop || 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

test('normaliza una factura de Air-e: el inicio es el día después de la lectura anterior', () => {
  const { datos, avisos } = normalizar(lecturaAire);
  assert.strictEqual(datos.inicio, '2025-09-20');
  assert.strictEqual(datos.fin, '2025-10-21');
  assert.strictEqual(datos.ciclo, '2025-10');
  assert.strictEqual(datos.consumoKwh, 128);
  assert.strictEqual(datos.tarifaKwh, 773.523);
  assert.strictEqual(datos.metaDiaria, null);
  assert.ok(avisos.some(a => a.includes('no trae la meta')));
  assert.ok(!avisos.some(a => a.includes('días de consumo')), 'los 32 días coinciden con las fechas');
});

test('avisa cuando los días de la factura no coinciden con las fechas', () => {
  const { avisos } = normalizar({ ...lecturaAire, dias_consumo: 30 });
  assert.ok(avisos.some(a => a.includes('30 días')));
});

test('rechaza documentos que no son facturas de energía', () => {
  assert.throws(() => normalizar({ ...lecturaAire, es_factura_de_energia: false }), ErrorLectura);
});

test('descarta fechas mal formadas y números no positivos', () => {
  const { datos, avisos } = normalizar({ ...lecturaAire, fecha_lectura_actual: '21/10/2025', consumo_kwh: -5 });
  assert.strictEqual(datos.fin, null);
  assert.strictEqual(datos.consumoKwh, null);
  assert.ok(avisos.length >= 2);
});

test('arma la solicitud con PDF, esquema JSON y respaldo ante rechazos', async () => {
  const cliente = clienteFalso(respuestaTexto(lecturaAire));
  const r = await leerFactura(cliente, { tipo: 'application/pdf', datos: 'JVBERi0=' });
  assert.strictEqual(r.datos.factura, '8000000001');
  const p = cliente.llamadas[0];
  assert.strictEqual(p.model, 'claude-opus-5-5');
  assert.strictEqual(p.fallbacks, 'default');
  assert.deepStrictEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.strictEqual(p.output_config.format.type, 'json_schema');
  assert.strictEqual(p.messages[0].content[0].type, 'document');
});

test('manda las fotos como imagen y rechaza tipos no admitidos', async () => {
  const cliente = clienteFalso(respuestaTexto(lecturaAire));
  await leerFactura(cliente, { tipo: 'image/jpeg', datos: '/9j/' });
  assert.strictEqual(cliente.llamadas[0].messages[0].content[0].type, 'image');
  await assert.rejects(leerFactura(cliente, { tipo: 'image/heic', datos: 'x' }), e => e.estado === 415);
});

test('un rechazo del modelo o una respuesta cortada no llegan al formulario', async () => {
  await assert.rejects(leerFactura(clienteFalso({ stop_reason: 'refusal', content: [] }), { tipo: 'image/png', datos: 'x' }), e => e.estado === 422);
  await assert.rejects(leerFactura(clienteFalso(respuestaTexto(lecturaAire, 'max_tokens')), { tipo: 'image/png', datos: 'x' }), e => e.estado === 502);
  await assert.rejects(leerFactura(clienteFalso({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'no es json' }] }), { tipo: 'image/png', datos: 'x' }), e => e.estado === 502);
});
