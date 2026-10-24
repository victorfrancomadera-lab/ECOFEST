/* Interfaz: tablero, registro, ranking. El cálculo vive en meta.js. */
(function () {
  'use strict';

  var CLAVE = 'medidor-pacto-v1';
  var ESCALA_MAX = 150; // la barra va de 0 % a 150 % de la meta
  var NOMBRE_ZONA = { ahorro: 'Ahorro · bono', segura: 'Zona segura', recargo: 'Recargo' };
  var CONSEJO = {
    ahorro: 'Va en ahorro: recibe bono en la factura. Mantenga lo que está haciendo y súbalo al Muro del Pacto.',
    segura: 'Está en zona segura: no paga extra. Le falta poco para el bono: suba el aire a 24 °C y apague equipos al cerrar.',
    recargo: 'Se pasó de la meta: va a pagar recargo. Pida una visita técnica y revise primero aires acondicionados y refrigeración.'
  };
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var registros = cargar();
  var $ = function (s) { return document.querySelector(s); };

  function cargar() {
    try {
      var guardado = JSON.parse(localStorage.getItem(CLAVE));
      if (Array.isArray(guardado) && guardado.length) return guardado;
    } catch (e) { /* sin almacenamiento: se usan los datos de muestra */ }
    return window.DATOS_MUESTRA.slice();
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(registros)); } catch (e) { /* modo privado */ }
  }

  function num(n, dec) {
    return Number(n).toLocaleString('es-CO', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nombreCiclo(c) {
    var p = String(c).split('-');
    return (MESES[Number(p[1]) - 1] || c) + ' ' + p[0];
  }
  function empresas() {
    var vistos = {};
    registros.forEach(function (r) { vistos[r.empresa] = true; });
    return Object.keys(vistos).sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }
  function ciclos() {
    var vistos = {};
    registros.forEach(function (r) { vistos[r.ciclo] = true; });
    return Object.keys(vistos).sort().reverse();
  }

  /* ---------- Navegación ---------- */
  function mostrar(vista) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.setAttribute('aria-selected', String(t.dataset.vista === vista));
    });
    document.querySelectorAll('.vista').forEach(function (v) {
      v.hidden = v.id !== 'vista-' + vista;
    });
    if (vista === 'tablero') pintarTablero();
    if (vista === 'ranking') pintarRanking();
    if (vista === 'registrar') pintarDatalist();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () { mostrar(t.dataset.vista); });
  });

  /* ---------- Tablero ---------- */
  function pintarSelectorEmpresa(seleccion) {
    var sel = $('#sel-empresa');
    var actual = seleccion || sel.value;
    sel.innerHTML = empresas().map(function (e) {
      return '<option' + (e === actual ? ' selected' : '') + '>' + esc(e) + '</option>';
    }).join('');
  }

  function barra(pct) {
    var pos = Math.min(Math.max(pct, 0), ESCALA_MAX) / ESCALA_MAX * 100;
    return '<div class="barra-wrap">' +
      '<span class="marca" style="left:60%;transform:translateX(-100%);padding-right:4px">90 %</span>' +
      '<span class="marca" style="left:73.333%;transform:none;padding-left:4px">110 %</span>' +
      '<div class="barra" role="img" aria-label="Gastó ' + num(pct, 1) + ' % de la meta">' +
      '<div class="b-ahorro"></div><div class="b-segura"></div><div class="b-recargo"></div></div>' +
      '<div class="aguja" style="left:' + pos + '%"></div>' +
      '<div class="escala"><span>0 %</span><span>150 % o más</span></div>' +
      '</div>';
  }

  function tarjetaCiclo(r) {
    var res = Meta.evaluar(r);
    var grupo = Meta.ranking(registros, r.ciclo)[r.tamano] || [];
    var mio = grupo.filter(function (g) { return g.empresa === r.empresa; })[0];
    var ahorroTxt = res.ahorroKwh >= 0
      ? '<b>' + num(res.ahorroKwh) + ' kWh</b><span>ahorrados frente a la meta</span>'
      : '<b>' + num(-res.ahorroKwh) + ' kWh</b><span>por encima de la meta</span>';
    return '<article class="tarjeta">' +
      '<div class="ciclo-head"><span class="ciclo-titulo">Ciclo ' + esc(nombreCiclo(r.ciclo)) + ' · ' + res.dias + ' días</span>' +
      '<span class="chip ' + res.zona + '">' + NOMBRE_ZONA[res.zona] + '</span></div>' +
      '<div class="resultado">' +
      '<div><div class="pct">' + num(res.porcentaje, 1) + '<small> % de la meta</small></div></div>' +
      barra(res.porcentaje) +
      '</div>' +
      '<div class="datos">' +
      '<div class="dato"><b>' + num(res.consumoDiario, 1) + '</b><span>kWh/día consumidos</span></div>' +
      '<div class="dato"><b>' + num(r.metaDiaria, 1) + '</b><span>kWh/día de meta</span></div>' +
      '<div class="dato">' + ahorroTxt + '</div>' +
      '<div class="dato"><b>' + num(r.consumoKwh) + '</b><span>kWh en la factura</span></div>' +
      '</div>' +
      (mio ? '<p class="posicion">Puesto <b>' + mio.puesto + ' de ' + grupo.length + '</b> entre empresas de tamaño ' + esc(r.tamano.toLowerCase()) + ' este ciclo.</p>' : '') +
      '<div class="consejo">' + CONSEJO[res.zona] + '</div>' +
      '<details class="traza"><summary>Ver el cálculo</summary><p><code>(' + num(r.consumoKwh) + ' kWh ÷ ' + res.dias + ' días) ÷ ' +
      num(r.metaDiaria, 2) + ' kWh/día × 100 = ' + num(res.porcentaje, 1) + ' %</code></p>' +
      '<p>Factura ' + esc(r.factura || 'sin número') + ' · periodo ' + esc(r.inicio) + ' a ' + esc(r.fin) +
      (r.muestra ? ' · dato de muestra' : '') + '</p></details>' +
      '</article>';
  }

  function pintarTablero(seleccion) {
    pintarSelectorEmpresa(seleccion);
    var emp = $('#sel-empresa').value;
    var suyos = registros.filter(function (r) { return r.empresa === emp; })
      .sort(function (a, b) { return a.ciclo < b.ciclo ? 1 : -1; });
    $('#tablero').innerHTML = suyos.length
      ? '<div class="ciclos">' + suyos.map(tarjetaCiclo).join('') + '</div>'
      : '<p class="vacio">Esta empresa aún no tiene ciclos registrados.</p>';
  }
  $('#sel-empresa').addEventListener('change', function () { pintarTablero(); });

  /* ---------- Registro ---------- */
  var form = $('#form-registro');

  function pintarDatalist() {
    $('#lista-empresas').innerHTML = empresas().map(function (e) { return '<option value="' + esc(e) + '">'; }).join('');
  }

  function leerForm() {
    var d = new FormData(form);
    return {
      empresa: String(d.get('empresa') || '').trim(),
      nit: String(d.get('nit') || '').trim(),
      tamano: d.get('tamano'),
      sector: d.get('sector'),
      factura: String(d.get('factura') || '').trim(),
      ciclo: d.get('ciclo'),
      inicio: d.get('inicio'),
      fin: d.get('fin'),
      consumoKwh: parseFloat(d.get('consumoKwh')),
      metaDiaria: parseFloat(d.get('metaDiaria'))
    };
  }

  function lista(items, clase) {
    return items.length ? '<ul class="mensajes ' + clase + '">' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : '';
  }

  function vistaPrevia(mostrarErrores) {
    var r = leerForm();
    var v = Meta.validar(r);
    var html = '';
    if (v.valido) {
      var res = Meta.evaluar(r);
      html = '<div class="tarjeta"><span class="ciclo-titulo">Resultado</span>' +
        '<div class="resultado"><div><div class="pct">' + num(res.porcentaje, 1) + '<small> % de la meta</small></div>' +
        '<span class="chip ' + res.zona + '">' + NOMBRE_ZONA[res.zona] + '</span></div>' + barra(res.porcentaje) + '</div></div>';
    }
    html += lista(v.alertas, 'alerta');
    if (mostrarErrores) html += lista(v.errores, 'err');
    $('#vista-previa').innerHTML = html;
    return v;
  }
  form.addEventListener('input', function () { vistaPrevia(false); });

  // Si la empresa ya existe, se rellenan sus datos fijos.
  form.empresa.addEventListener('change', function () {
    var previo = registros.filter(function (r) { return r.empresa === form.empresa.value.trim(); }).pop();
    if (!previo) return;
    form.nit.value = previo.nit || '';
    form.tamano.value = previo.tamano;
    form.sector.value = previo.sector;
    form.metaDiaria.value = previo.metaDiaria;
    vistaPrevia(false);
  });

  // El mes del ciclo se deduce de la fecha de lectura.
  form.fin.addEventListener('change', function () {
    if (form.fin.value && !form.ciclo.value) form.ciclo.value = form.fin.value.slice(0, 7);
  });

  $('#btn-calcular-meta').addEventListener('click', function () {
    var filas = $('#historial').value.split(/\n+/).map(function (l) {
      var p = l.split(/[,;\t ]+/).filter(Boolean).map(function (x) { return parseFloat(x.replace(',', '.')); });
      return { kwh: p[0], dias: p[1] };
    });
    var m = Meta.calcularMeta(filas);
    if (!m.ciclosUsados) {
      $('#res-meta').textContent = 'No encontré facturas válidas. Escriba una por línea: kWh, días.';
      return;
    }
    form.metaDiaria.value = m.metaDiaria;
    $('#res-meta').textContent = 'Meta: ' + num(m.metaDiaria, 2) + ' kWh/día con ' + m.ciclosUsados + ' facturas' +
      (m.completo ? '.' : '. Ojo: la regla pide 12 meses; con menos es una estimación.');
    vistaPrevia(false);
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var v = vistaPrevia(true);
    if (!v.valido) return;
    var r = leerForm();
    r.id = 'r' + Date.now();
    r.creado = new Date().toISOString();
    registros.push(r);
    guardar();
    form.reset();
    $('#vista-previa').innerHTML = '';
    $('#res-meta').textContent = '';
    mostrar('tablero');
    pintarTablero(r.empresa);
  });

  /* ---------- Ranking ---------- */
  function pintarSelectorCiclo() {
    var sel = $('#sel-ciclo');
    var actual = sel.value;
    sel.innerHTML = ciclos().map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === actual ? ' selected' : '') + '>' + esc(nombreCiclo(c)) + '</option>';
    }).join('');
  }

  function pintarRanking() {
    pintarSelectorCiclo();
    var ciclo = $('#sel-ciclo').value;
    var grupos = Meta.ranking(registros, ciclo);
    var todos = [];
    Meta.TAMANOS.forEach(function (t) { todos = todos.concat(grupos[t]); });

    var ahorro = 0, zonas = { ahorro: 0, segura: 0, recargo: 0 };
    todos.forEach(function (r) {
      ahorro += r.resultado.ahorroKwh;
      zonas[r.resultado.zona]++;
    });
    $('#resumen-ciudad').innerHTML =
      '<div class="kpi"><b>' + todos.length + '</b><span>empresas medidas</span></div>' +
      '<div class="kpi"><b>' + num(ahorro) + '</b><span>kWh ' + (ahorro >= 0 ? 'ahorrados' : 'por encima') + ' frente a las metas</span></div>' +
      '<div class="kpi"><b>' + zonas.ahorro + '</b><span>en ahorro (bono)</span></div>' +
      '<div class="kpi"><b>' + zonas.recargo + '</b><span>en recargo</span></div>';

    $('#ranking').innerHTML = Meta.TAMANOS.map(function (t) {
      var g = grupos[t];
      var filas = g.map(function (r) {
        return '<tr class="' + (r.puesto === 1 ? 'top1' : '') + '">' +
          '<td class="puesto">' + r.puesto + '</td>' +
          '<td><button class="btn-link" data-empresa="' + esc(r.empresa) + '">' + esc(r.empresa) + '</button></td>' +
          '<td class="num">' + num(r.resultado.porcentaje, 1) + ' %</td>' +
          '<td class="num">' + num(r.resultado.ahorroKwh) + '</td>' +
          '<td><span class="chip ' + r.resultado.zona + '">' + NOMBRE_ZONA[r.resultado.zona] + '</span></td></tr>';
      }).join('');
      return '<section class="tarjeta"><h3>' + t + '</h3>' +
        (g.length
          ? '<div class="tabla-wrap"><table><thead><tr><th>#</th><th>Empresa</th><th class="num">% meta</th><th class="num">kWh ahorrados</th><th>Zona</th></tr></thead><tbody>' + filas + '</tbody></table></div>'
          : '<p class="vacio">Sin empresas de este tamaño en el ciclo.</p>') +
        '</section>';
    }).join('');
  }
  $('#sel-ciclo').addEventListener('change', pintarRanking);
  $('#ranking').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-empresa]');
    if (!b) return;
    mostrar('tablero');
    pintarTablero(b.dataset.empresa);
  });

  // CSV con entradas y resultados, para recalcular en una hoja de cálculo.
  $('#btn-csv').addEventListener('click', function () {
    var ciclo = $('#sel-ciclo').value;
    var grupos = Meta.ranking(registros, ciclo);
    var cab = ['ciclo', 'tamano', 'puesto', 'empresa', 'nit', 'sector', 'factura', 'inicio', 'fin', 'dias',
      'consumo_kwh', 'meta_kwh_dia', 'consumo_kwh_dia', 'pct_meta', 'ahorro_kwh', 'zona', 'dato_de_muestra'];
    var lineas = [cab.join(';')];
    Meta.TAMANOS.forEach(function (t) {
      grupos[t].forEach(function (r) {
        var x = r.resultado;
        lineas.push([r.ciclo, r.tamano, r.puesto, r.empresa, r.nit, r.sector, r.factura, r.inicio, r.fin, x.dias,
          r.consumoKwh, r.metaDiaria, x.consumoDiario, x.porcentaje, x.ahorroKwh, x.zona, r.muestra ? 'si' : 'no']
          .map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'));
      });
    });
    var blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ranking-' + ciclo + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  mostrar('tablero');
})();
