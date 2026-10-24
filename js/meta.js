/*
 * Motor de cálculo: consumo contra meta (Resolución CREG 101 120 de 2026).
 * Funciones puras, sin DOM, para que cualquiera pueda recalcular y auditar.
 * Funciona en el navegador (window.Meta) y en Node (require).
 */
(function (root) {
  'use strict';

  var LIMITE_AHORRO = 90;   // menos de 90 % de la meta → ahorro (bono)
  var LIMITE_RECARGO = 110; // más de 110 % de la meta → recargo

  var TAMANOS = ['Micro', 'Pequeña', 'Mediana', 'Grande'];

  function redondear(n, dec) {
    var f = Math.pow(10, dec);
    return Math.round(n * f) / f;
  }

  function mediana(valores) {
    if (!valores.length) return NaN;
    var v = valores.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  // Días del ciclo, contando el día de inicio y el de lectura.
  function diasEntre(inicio, fin) {
    var a = Date.parse(inicio + 'T00:00:00Z');
    var b = Date.parse(fin + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return NaN;
    return Math.round((b - a) / 86400000) + 1;
  }

  /*
   * Meta = mediana del consumo diario de los 12 meses anteriores.
   * Con facturas solo se conoce el promedio diario de cada ciclo
   * (kWh / días), así que se toma la mediana de esos 12 promedios.
   */
  function calcularMeta(historial) {
    var diarios = historial
      .filter(function (h) { return h.kwh > 0 && h.dias > 0; })
      .map(function (h) { return h.kwh / h.dias; });
    return {
      metaDiaria: redondear(mediana(diarios), 2),
      ciclosUsados: diarios.length,
      completo: diarios.length >= 12
    };
  }

  function zonaDe(porcentaje) {
    if (porcentaje < LIMITE_AHORRO) return 'ahorro';
    if (porcentaje > LIMITE_RECARGO) return 'recargo';
    return 'segura';
  }

  function validar(r) {
    var errores = [];
    var alertas = [];
    if (!r.empresa || !String(r.empresa).trim()) errores.push('Falta el nombre de la empresa.');
    if (TAMANOS.indexOf(r.tamano) < 0) errores.push('Escoja el tamaño de la empresa.');
    if (!(r.consumoKwh > 0)) errores.push('El consumo del ciclo debe ser mayor que cero.');
    if (!(r.metaDiaria > 0)) errores.push('La meta diaria debe ser mayor que cero.');
    var dias = diasEntre(r.inicio, r.fin);
    if (!(dias > 0)) errores.push('Revise las fechas del ciclo.');
    else if (dias < 20 || dias > 40) alertas.push('El ciclo tiene ' + dias + ' días; lo normal es entre 28 y 33.');
    if (!errores.length) {
      var pct = (r.consumoKwh / dias) / r.metaDiaria * 100;
      if (pct < 40 || pct > 250) {
        alertas.push('El consumo quedó en ' + Math.round(pct) + ' % de la meta. Puede ser un error de digitación: compárelo con la factura.');
      }
    }
    return { valido: errores.length === 0, errores: errores, alertas: alertas };
  }

  function evaluar(r) {
    var dias = diasEntre(r.inicio, r.fin);
    var consumoDiario = r.consumoKwh / dias;
    var metaCiclo = r.metaDiaria * dias;
    var porcentaje = consumoDiario / r.metaDiaria * 100;
    return {
      dias: dias,
      consumoDiario: redondear(consumoDiario, 2),
      metaCiclo: redondear(metaCiclo, 1),
      porcentaje: redondear(porcentaje, 1),
      ahorroPct: redondear(100 - porcentaje, 1),
      ahorroKwh: redondear(metaCiclo - r.consumoKwh, 1),
      zona: zonaDe(porcentaje)
    };
  }

  /*
   * Ranking de un ciclo, separado por tamaño.
   * Orden: menor % de la meta primero (más ahorro); empate → más kWh ahorrados.
   * Si una empresa tiene varios registros del mismo ciclo, cuenta el último.
   */
  function ranking(registros, ciclo) {
    var ultimo = {};
    registros.forEach(function (r) {
      if (r.ciclo !== ciclo || !validar(r).valido) return;
      var previo = ultimo[r.empresa];
      if (!previo || (r.creado || '') >= (previo.creado || '')) ultimo[r.empresa] = r;
    });
    var grupos = {};
    TAMANOS.forEach(function (t) { grupos[t] = []; });
    Object.keys(ultimo).forEach(function (k) {
      var r = ultimo[k];
      grupos[r.tamano].push(Object.assign({}, r, { resultado: evaluar(r) }));
    });
    TAMANOS.forEach(function (t) {
      grupos[t].sort(function (a, b) {
        return a.resultado.porcentaje - b.resultado.porcentaje ||
          b.resultado.ahorroKwh - a.resultado.ahorroKwh;
      });
      grupos[t].forEach(function (r, i) { r.puesto = i + 1; });
    });
    return grupos;
  }

  /*
   * Valor en pesos de un ciclo. Es un ESTIMADO: la regla oficial del bono y del recargo
   * en pesos aún no está publicada, así que sus porcentajes son parámetros que fija la Cámara.
   * - Diferencia: (meta del ciclo − consumo) × tarifa. Positiva = lo que dejó de gastar.
   * - Bono: kWh por debajo de la meta × tarifa × % de bono, solo en zona de ahorro.
   * - Recargo: kWh por encima del 110 % de la meta × tarifa × % de recargo, solo en zona de recargo.
   * Sin tarifa devuelve null.
   */
  function valorEnPesos(r, parametros) {
    var tarifa = Number(r.tarifaKwh);
    if (!(tarifa > 0)) return null;
    var res = evaluar(r);
    var p = parametros || {};
    var pctBono = Number(p.pctBono) > 0 ? Number(p.pctBono) : 0;
    var pctRecargo = Number(p.pctRecargo) > 0 ? Number(p.pctRecargo) : 0;
    var metaCiclo = r.metaDiaria * res.dias;
    var kwhDiferencia = metaCiclo - r.consumoKwh;
    var kwhSobreRecargo = Math.max(0, r.consumoKwh - metaCiclo * LIMITE_RECARGO / 100);
    return {
      tarifa: tarifa,
      kwhDiferencia: redondear(kwhDiferencia, 1),
      valorDiferencia: Math.round(kwhDiferencia * tarifa),
      bono: res.zona === 'ahorro' && pctBono ? Math.round(kwhDiferencia * tarifa * pctBono / 100) : 0,
      recargo: res.zona === 'recargo' && pctRecargo ? Math.round(kwhSobreRecargo * tarifa * pctRecargo / 100) : 0,
      kwhSobreRecargo: redondear(kwhSobreRecargo, 1),
      conParametros: pctBono > 0 && pctRecargo > 0
    };
  }

  /*
   * Proyección del ciclo en curso a partir de una lectura parcial del medidor.
   * Al ritmo actual, ¿en qué % de la meta cierra? Y cuánto puede gastar por día
   * el resto del ciclo para cerrar en ahorro (debajo de 90 %) o sin recargo (hasta 110 %).
   */
  function proyectarCiclo(metaDiaria, kwhHastaHoy, diasTranscurridos, diasCiclo) {
    if (!(metaDiaria > 0) || !(kwhHastaHoy >= 0) || !(diasTranscurridos > 0) || !(diasCiclo >= diasTranscurridos)) return null;
    var diario = kwhHastaHoy / diasTranscurridos;
    var porcentaje = diario / metaDiaria * 100;
    var restantes = diasCiclo - diasTranscurridos;
    function maximoDiario(limite) {
      if (!restantes) return null;
      return redondear(Math.max(0, (metaDiaria * diasCiclo * limite / 100 - kwhHastaHoy) / restantes), 1);
    }
    return {
      consumoDiario: redondear(diario, 2),
      porcentaje: redondear(porcentaje, 1),
      zona: zonaDe(porcentaje),
      kwhAlCierre: redondear(diario * diasCiclo, 1),
      diasRestantes: restantes,
      maxDiarioAhorro: maximoDiario(LIMITE_AHORRO),
      maxDiarioSinRecargo: maximoDiario(LIMITE_RECARGO)
    };
  }

  var Meta = {
    LIMITE_AHORRO: LIMITE_AHORRO,
    LIMITE_RECARGO: LIMITE_RECARGO,
    TAMANOS: TAMANOS,
    mediana: mediana,
    diasEntre: diasEntre,
    calcularMeta: calcularMeta,
    zonaDe: zonaDe,
    validar: validar,
    evaluar: evaluar,
    ranking: ranking,
    valorEnPesos: valorEnPesos,
    proyectarCiclo: proyectarCiclo
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Meta;
  else root.Meta = Meta;
})(typeof window !== 'undefined' ? window : this);
