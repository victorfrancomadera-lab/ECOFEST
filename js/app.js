/* Interfaz: tablero, registro, ranking. El cálculo vive en meta.js. */
(function () {
  'use strict';

  var CLAVE = 'medidor-pacto-v1';
  var ESCALA_MAX = 150; // la barra va de 0 % a 150 % de la meta
  var NOMBRE_ZONA = { ahorro: 'Ahorro<span class="largo"> · bono</span>', segura: '<span class="largo">Zona </span>segura', recargo: 'Recargo' };
  var CONSEJO = {
    ahorro: 'Va en ahorro: recibe bono en la factura. Mantenga lo que está haciendo y súbalo al Muro del Pacto.',
    segura: 'Está en zona segura: no paga extra. Para llegar al bono, suba el aire a 24 °C y apague equipos al cerrar.',
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

  /* ---------- Figuras 3D (CSS puro: ver "Motor 3D" en styles.css) ---------- */
  // Colores de cada cubo: frente, lado, tapa. Las versiones "suave" son para las demás empresas del podio.
  var CARAS = {
    ahorro: ['#06a258', '#037e42', '#3cd38a'],
    segura: ['#01b8c6', '#018893', '#5fe3ee'],
    recargo: ['#e06a60', '#b8473e', '#f2968e'],
    ahorroSuave: ['#8fd9b0', '#6cc496', '#bfebd3'],
    seguraSuave: ['#8fe0e7', '#64cbd4', '#c4f1f5'],
    recargoSuave: ['#f2b1ab', '#e0938c', '#f8d2ce'],
    palo: ['#e3f2ed', '#9dbdb4', '#ffffff'],
    paloOscuro: ['#0d2b25', '#0d2b25', '#0d2b25']
  };
  var CARAS_TEXTO = { ahorro: '#ffffff' };

  function cubo(x, y, w, h, d, c, retraso, contenido, texto) {
    return '<div class="crece" style="left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;animation-delay:' + (retraso || 0) + 's">' +
      caras(w, h, d, c, '', contenido, texto) + '</div>';
  }
  function caras(w, h, d, c, pos, contenido, texto) {
    return '<div class="cub" style="' + pos + '--w:' + w + 'px;--h:' + h + 'px;--d:' + d + 'px;--cf:' + c[0] + ';--cs:' + c[1] + ';--ct:' + c[2] +
      (texto ? ';--tx:' + texto : '') + '"><i class="f">' + (contenido || '') + '</i><i class="r"></i><i class="l"></i><i class="t"></i></div>';
  }
  // Marcador flotante: palo delgado con una esfera encima. x es el centro.
  function alfiler(x, y, alto, oscuro) {
    return '<div class="flota" style="left:' + (x - 20) + 'px;top:' + y + 'px;width:40px;height:' + (36 + alto) + 'px">' +
      caras(oscuro ? 4 : 8, alto, oscuro ? 4 : 8, oscuro ? CARAS.paloOscuro : CARAS.palo, 'left:' + (oscuro ? 18 : 16) + 'px;top:36px;') +
      '<span class="esfera ' + (oscuro ? 'verde' : 'blanca') + '"></span></div>';
  }
  function pctCorto(p) { return num(p, p % 1 === 0 ? 0 : 1); }
  function puntos(n) { n = Math.round(n * 10) / 10; return pctCorto(n) + (n === 1 ? ' punto' : ' puntos'); }

  // Escala 0–150 % como tres bloques; el marcador cae donde quedó la empresa.
  function escala3d(pct) {
    var p = Math.min(Math.max(pct, 0), ESCALA_MAX);
    var x = p <= 90 ? 24 + p / 90 * 324 : p <= 110 ? 354 + (p - 90) / 20 * 72 : 432 + (p - 110) / 40 * 144;
    return '<figure class="e3d" role="img" aria-label="Escala de zonas: ahorro hasta 90 %, segura de 90 a 110 %, recargo desde 110 %. Su empresa quedó en ' + num(pct, 1) + ' %.">' +
      '<div class="esc" style="width:600px;height:380px">' +
      '<div class="piso" style="left:-80px;top:-120px;width:760px;height:760px"></div>' +
      cubo(24, 220, 324, 40, 120, CARAS.ahorro, 0) +
      cubo(354, 220, 72, 40, 120, CARAS.segura, 0.15) +
      cubo(432, 220, 144, 40, 120, CARAS.recargo, 0.3) +
      alfiler(Math.round(x), 60, 124) +
      '</div></figure>';
  }

  function titular(res) {
    var p = res.porcentaje;
    if (res.zona === 'ahorro') {
      return ['Ganó el bono.', 'Está ' + puntos(90 - p) + ' por debajo del 90 %. Si llega a 90 %, pasa a zona segura y ya no recibe bono.'];
    }
    if (res.zona === 'segura') {
      return ['Sin recargo, sin bono.', 'Le faltan ' + puntos(p - 90) + ' para bajar del 90 % y ganar el bono.'];
    }
    return ['Va a pagar recargo.', 'Está ' + puntos(p - 110) + ' por encima del 110 % de su meta.'];
  }

  // El ciclo más reciente, en el escenario oscuro con la escala 3D.
  function escenarioCiclo(r) {
    var res = Meta.evaluar(r);
    var grupo = Meta.ranking(registros, r.ciclo)[r.tamano] || [];
    var mio = grupo.filter(function (g) { return g.empresa === r.empresa; })[0];
    var t = titular(res);
    var ahorroTxt = res.ahorroKwh >= 0
      ? '<b>' + num(res.ahorroKwh) + ' kWh</b><span>ahorrados frente a la meta</span>'
      : '<b>' + num(-res.ahorroKwh) + ' kWh</b><span>por encima de la meta</span>';
    return '<article class="escenario">' +
      '<span class="orbe verde" aria-hidden="true" style="width:110px;height:110px;right:-34px;bottom:34%"></span>' +
      '<span class="orbe cian" aria-hidden="true" style="width:48px;height:48px;left:47%;bottom:150px;animation-delay:-3s"></span>' +
      '<div class="escenario-cab"><span>Ciclo ' + esc(nombreCiclo(r.ciclo)) + ' · ' + res.dias + ' días</span>' +
      '<span class="chip ' + res.zona + '">' + NOMBRE_ZONA[res.zona] + '</span></div>' +
      '<div class="escenario-cuerpo"><div class="escenario-texto">' +
      '<div class="pct-3d ' + res.zona + '">' + pctCorto(res.porcentaje) + '%</div>' +
      '<h2 class="titular">' + t[0] + '</h2><p>' + t[1] + '</p><p>' + CONSEJO[res.zona] + '</p></div>' +
      escala3d(res.porcentaje) + '</div>' +
      '<div class="datos">' +
      '<div class="dato">' + ahorroTxt + '</div>' +
      '<div class="dato"><b>' + num(res.consumoDiario, 1) + ' / ' + num(r.metaDiaria, 1) + '</b><span>kWh al día, gasto contra meta</span></div>' +
      (mio ? '<div class="dato"><b>' + mio.puesto + '.º de ' + grupo.length + '</b><span>entre empresas de tamaño ' + esc(r.tamano.toLowerCase()) + '</span></div>' : '') +
      '<div class="dato"><b>' + num(r.consumoKwh) + '</b><span>kWh en la factura</span></div>' +
      '</div>' +
      '<details class="traza"><summary>Ver el cálculo</summary><p><code>(' + num(r.consumoKwh) + ' kWh ÷ ' + res.dias + ' días) ÷ ' +
      num(r.metaDiaria, 2) + ' kWh/día × 100 = ' + num(res.porcentaje, 1) + ' %</code></p>' +
      '<p>Factura ' + esc(r.factura || 'sin número') + ' · periodo ' + esc(r.inicio) + ' a ' + esc(r.fin) +
      (r.muestra ? ' · dato de muestra' : '') + '</p></details>' +
      '</article>';
  }

  // Barras 3D de los últimos ciclos de la empresa, con el plano del límite de 90 %.
  function grafica3d(suyos) {
    var serie = suyos.slice(0, 6).reverse();
    if (serie.length < 2) return '';
    var res = serie.map(function (r) { return Meta.evaluar(r); });
    var ancho = serie.length * 130 + 80;
    var barras = serie.map(function (r, i) {
      var h = Math.round(Math.min(res[i].porcentaje, ESCALA_MAX) * 2.2);
      return cubo(60 + i * 130, 340 - h, 90, h, 90, CARAS[res[i].zona], i * 0.15);
    }).join('');
    var primero = res[0].porcentaje, ultimo = res[res.length - 1].porcentaje;
    var verbo = ultimo < primero ? 'Bajó' : ultimo > primero ? 'Subió' : 'Se mantuvo';
    return '<section class="seccion-3d">' +
      '<div class="seccion-texto"><h2>' + verbo + ' de ' + pctCorto(primero) + ' % a ' + pctCorto(ultimo) + ' % en ' + serie.length + ' ciclos</h2>' +
      '<p>Cada barra es un ciclo; el plano punteado es el límite del 90 %. Por debajo de él, hay bono.</p>' +
      '<ul class="leyenda">' + serie.map(function (r, i) {
        return '<li><span class="cuadro ' + res[i].zona + '"></span>' + esc(nombreCiclo(r.ciclo)) + ' · ' + num(res[i].porcentaje, 1) + ' %</li>';
      }).join('') + '<li><span class="linea"></span>Límite del 90 %</li></ul></div>' +
      '<figure class="e3d" role="img" aria-label="Barras por ciclo: ' + serie.map(function (r, i) { return esc(nombreCiclo(r.ciclo)) + ' ' + num(res[i].porcentaje, 1) + ' %'; }).join(', ') + '.">' +
      '<div class="esc" style="width:' + ancho + 'px;height:380px">' +
      '<div class="piso claro" style="left:' + (ancho / 2 - 360) + 'px;top:-20px;width:720px;height:720px"></div>' +
      barras +
      '<div class="plano-limite" aria-hidden="true" style="left:30px;top:62px;width:' + (ancho - 60) + 'px;height:160px"></div>' +
      '</div></figure></section>';
  }

  // Podio 3D del grupo de tamaño: más alto = más lejos del 150 % = más ahorro.
  function podio3d(r) {
    var grupo = Meta.ranking(registros, r.ciclo)[r.tamano] || [];
    if (grupo.length < 2) return '';
    var lista = grupo.slice(0, 5);
    var mio = grupo.filter(function (g) { return g.empresa === r.empresa; })[0];
    if (mio && mio.puesto > 5) lista = grupo.slice(0, 4).concat([mio]);
    var ancho = lista.length * 130 + 60;
    var pilares = lista.map(function (g, i) {
      var yo = g.empresa === r.empresa;
      var z = g.resultado.zona;
      var h = Math.max(30, Math.round((ESCALA_MAX - Math.min(g.resultado.porcentaje, ESCALA_MAX)) * 3));
      return cubo(30 + i * 130, 330 - h, 100, h, 100, CARAS[yo ? z : z + 'Suave'], i * 0.1, g.puesto, yo ? CARAS_TEXTO[z] : '');
    }).join('');
    var miIndice = -1;
    lista.forEach(function (g, i) { if (g.empresa === r.empresa) miIndice = i; });
    var miAlto = miIndice < 0 ? 0 : Math.max(30, Math.round((ESCALA_MAX - Math.min(lista[miIndice].resultado.porcentaje, ESCALA_MAX)) * 3));
    var titulo = mio ? 'Puesto ' + mio.puesto + ' de ' + grupo.length + ' entre empresas de tamaño ' + esc(r.tamano.toLowerCase())
      : 'Ranking de empresas de tamaño ' + esc(r.tamano.toLowerCase());
    return '<section class="seccion-3d invertida">' +
      '<figure class="e3d" role="img" aria-label="Podio: ' + lista.map(function (g) { return g.puesto + ' ' + esc(g.empresa) + ' ' + num(g.resultado.porcentaje, 1) + ' %'; }).join(', ') + '.">' +
      '<div class="esc" style="width:' + ancho + 'px;height:400px">' +
      '<div class="piso claro" style="left:' + (ancho / 2 - 380) + 'px;top:-50px;width:760px;height:760px"></div>' +
      pilares +
      (miIndice >= 0 ? alfiler(80 + miIndice * 130, 330 - miAlto - 120, 70, true) : '') +
      '</div></figure>' +
      '<div class="seccion-texto"><h2>' + titulo + '</h2>' +
      '<ol class="podio-lista">' + lista.map(function (g) {
        var yo = g.empresa === r.empresa;
        return '<li' + (yo ? ' class="yo"' : '') + '><span>' + g.puesto + ' · ' + esc(g.empresa) + (yo ? ' (usted)' : '') + '</span><span>' + num(g.resultado.porcentaje, 1) + ' %</span></li>';
      }).join('') + '</ol>' +
      '<p>La altura de cada bloque es cuánto quedó la empresa por debajo del 150 % de su meta: más alto, más ahorro. Ciclo ' + esc(nombreCiclo(r.ciclo)) + '.</p></div>' +
      '</section>';
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
      ? escenarioCiclo(suyos[0]) + grafica3d(suyos) + podio3d(suyos[0]) +
        (suyos.length > 1 ? '<h2 class="subtitulo-ciclos">Ciclos anteriores</h2><div class="ciclos">' + suyos.slice(1).map(tarjetaCiclo).join('') + '</div>' : '')
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
  function armarCsv(ciclo) {
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
    return lineas.join('\r\n');
  }

  $('#btn-csv').addEventListener('click', function () {
    var ciclo = $('#sel-ciclo').value;
    var blob = new Blob(['\ufeff' + armarCsv(ciclo)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ranking-' + ciclo + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  $('#btn-copiar-csv').addEventListener('click', function () {
    var texto = armarCsv($('#sel-ciclo').value);
    var caja = $('#csv-texto');
    caja.value = texto;
    $('#csv-salida').hidden = false;
    var listo = function () { $('#csv-estado').textContent = 'CSV copiado. Péguelo en Excel o Google Sheets.'; };
    var manual = function () { caja.select(); $('#csv-estado').textContent = 'Seleccioné el CSV: cópielo con Ctrl+C.'; };
    try {
      navigator.clipboard.writeText(texto).then(listo, manual);
    } catch (e) { manual(); }
  });

  mostrar('tablero');
})();
