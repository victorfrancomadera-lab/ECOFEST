/*
 * Lectura de facturas de energía con IA (Claude).
 * Recibe una foto o un PDF y devuelve los datos del registro ya normalizados.
 * Lo usa server.js; está separado para poder probarlo con un cliente falso.
 */
'use strict';

const Meta = require('./js/meta.js');

const MODELO = 'claude-opus-5-5';

const TEXTO_O_NULO = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const NUMERO_O_NULO = { anyOf: [{ type: 'number' }, { type: 'null' }] };

// Formato fijo de la respuesta: el modelo no puede devolver otra forma.
const ESQUEMA = {
  type: 'object',
  properties: {
    es_factura_de_energia: { type: 'boolean' },
    numero_factura: TEXTO_O_NULO,
    fecha_lectura_anterior: TEXTO_O_NULO,
    fecha_lectura_actual: TEXTO_O_NULO,
    dias_consumo: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    consumo_kwh: NUMERO_O_NULO,
    meta_diaria_kwh: NUMERO_O_NULO,
    tarifa_kwh: NUMERO_O_NULO,
    observaciones: { type: 'string' }
  },
  required: ['es_factura_de_energia', 'numero_factura', 'fecha_lectura_anterior', 'fecha_lectura_actual',
    'dias_consumo', 'consumo_kwh', 'meta_diaria_kwh', 'tarifa_kwh', 'observaciones'],
  additionalProperties: false
};

const INSTRUCCIONES = `Usted lee facturas de energía eléctrica de Colombia (sobre todo de Air-e, en la Costa Caribe) para un tablero que compara el consumo de cada empresa contra su meta de la Resolución CREG 101 120 de 2026.

Extraiga estos datos tal como aparecen en la factura:
- numero_factura: el número de la factura o documento de pago (en Air-e, el número de 10 dígitos junto a la referencia de pago, distinto del NIC y del NIU).
- fecha_lectura_anterior y fecha_lectura_actual: las fechas de lectura del medidor que delimitan el consumo facturado. Escríbalas como AAAA-MM-DD. Las facturas colombianas usan día/mes/año.
- dias_consumo: los días de consumo que indica la factura.
- consumo_kwh: el consumo de energía activa del periodo, en kWh (la cantidad de "Consumo activa", o la diferencia entre la lectura actual y la anterior por el factor del medidor).
- meta_diaria_kwh: la meta de consumo en kWh por día, si la factura la trae. Si la trae como meta del periodo y no por día, divida por los días de consumo. Si no aparece ninguna meta, use null: no la calcule a partir del historial.
- tarifa_kwh: la tarifa unitaria de "Consumo activa" en pesos por kWh, antes de subsidios y contribuciones.

Las cifras colombianas usan punto para los miles y coma para los decimales: "1.139" es mil ciento treinta y nueve, y "773,5230" es setecientos setenta y tres con cinco mil doscientas treinta diezmilésimas. Devuelva números sin separador de miles y con punto decimal.

Si un dato no aparece o no se lee con seguridad, use null en lugar de adivinarlo. Si el documento no es una factura de energía, marque es_factura_de_energia como false. En observaciones, en una o dos frases en español, anote lo que la persona debería revisar (por ejemplo, un dato borroso o que la factura no trae la meta); si no hay nada que anotar, deje una cadena vacía.`;

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const TIPOS_ACEPTADOS = TIPOS_IMAGEN.concat(['application/pdf']);

class ErrorLectura extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

function esFecha(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
}
function sumarDia(fecha) {
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function positivo(n) {
  return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
}

/*
 * Pasa la respuesta del modelo a los campos del formulario.
 * El app cuenta el día de inicio y el de lectura, así que el inicio del periodo
 * es el día siguiente a la lectura anterior: así los días coinciden con la factura.
 */
function normalizar(c) {
  if (!c.es_factura_de_energia) throw new ErrorLectura('Esto no parece una factura de energía. Pruebe con otra foto o con el PDF.', 422);
  const avisos = [];
  const fin = esFecha(c.fecha_lectura_actual) ? c.fecha_lectura_actual : null;
  const inicio = esFecha(c.fecha_lectura_anterior) ? sumarDia(c.fecha_lectura_anterior) : null;
  if (inicio && fin) {
    const dias = Meta.diasEntre(inicio, fin);
    if (!(dias > 0)) avisos.push('Las fechas de lectura no se leyeron bien: revíselas.');
    else if (c.dias_consumo && c.dias_consumo !== dias) {
      avisos.push('La factura dice ' + c.dias_consumo + ' días de consumo y las fechas dan ' + dias + ': revise las fechas.');
    }
  } else {
    avisos.push('No se leyeron las dos fechas de lectura: escríbalas a mano.');
  }
  const datos = {
    factura: c.numero_factura ? String(c.numero_factura).trim() : '',
    inicio: inicio,
    fin: fin,
    ciclo: fin ? fin.slice(0, 7) : null,
    consumoKwh: positivo(c.consumo_kwh),
    metaDiaria: positivo(c.meta_diaria_kwh),
    tarifaKwh: positivo(c.tarifa_kwh)
  };
  if (!datos.consumoKwh) avisos.push('No se leyó el consumo en kWh: escríbalo a mano.');
  if (!datos.metaDiaria) avisos.push('La factura no trae la meta diaria: calcúlela abajo con sus 12 facturas anteriores.');
  if (c.observaciones && c.observaciones.trim()) avisos.push(c.observaciones.trim());
  return { datos: datos, avisos: avisos };
}

async function leerFactura(cliente, archivo) {
  if (TIPOS_ACEPTADOS.indexOf(archivo.tipo) < 0) {
    throw new ErrorLectura('Use una foto (JPG o PNG) o el PDF de la factura.', 415);
  }
  const bloque = archivo.tipo === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: archivo.datos } }
    : { type: 'image', source: { type: 'base64', media_type: archivo.tipo, data: archivo.datos } };
  // fallbacks "default": si el modelo rechaza la solicitud, el servidor la repite con el modelo de respaldo recomendado.
  const respuesta = await cliente.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
    system: INSTRUCCIONES,
    messages: [{ role: 'user', content: [bloque, { type: 'text', text: 'Extraiga los datos de esta factura.' }] }]
  });
  if (respuesta.stop_reason === 'refusal') throw new ErrorLectura('No se pudo leer esta factura. Escriba los datos a mano.', 422);
  if (respuesta.stop_reason === 'max_tokens') throw new ErrorLectura('La lectura quedó incompleta. Intente de nuevo.', 502);
  const texto = respuesta.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  let crudo;
  try {
    crudo = JSON.parse(texto);
  } catch (e) {
    throw new ErrorLectura('La lectura no vino en el formato esperado. Intente de nuevo.', 502);
  }
  return normalizar(crudo);
}

module.exports = { leerFactura, normalizar, ErrorLectura, ESQUEMA, MODELO, TIPOS_ACEPTADOS };
