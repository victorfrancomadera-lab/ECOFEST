# Medidor del Pacto

**Hackathon Barranquilla No Se Apaga · Línea 1: Medir y competir**

El tablero que sigue a cada empresa contra su meta de consumo de energía y arma el ranking de la Cámara de Comercio, separado por tamaño.

## Qué resuelve

Durante El Niño, la Resolución CREG 101 120 de 2026 le fija a cada usuario una meta: la mediana de su consumo diario en los 12 meses anteriores. Cada ciclo se compara lo consumido contra esa meta:

| % de la meta | Zona | Qué pasa |
|---|---|---|
| menos de 90 % | Ahorro | Bono en la factura |
| 90 % a 110 % | Zona segura | Nada extra |
| más de 110 % | Recargo | Paga extra |

Ya existen la calculadora y el checklist de ahorro. Faltaba con qué **seguir y probar** el ahorro. Eso hace esta herramienta.

## Cómo la usa una empresa

1. **Registrar factura**: copia cinco datos de la factura (fechas del periodo, consumo en kWh, meta diaria y número de factura). Si la factura no trae la meta, la calcula con sus 12 facturas anteriores.
2. **Mi empresa**: ve qué porcentaje de la meta gastó, en qué zona quedó, cuántos kWh ahorró, su puesto entre empresas de su tamaño y qué hacer.
3. **Ranking**: la Cámara ve el ranking por tamaño (micro, pequeña, mediana, grande), el total de kWh ahorrados y descarga un CSV para auditoría.

## Cómo se mide

```
% de la meta = (consumo del ciclo ÷ días del ciclo) ÷ meta diaria × 100
```

- Se compara **por día**, no por mes: ciclos de 20 y de 31 días se miden igual.
- El ranking ordena por % de la meta (menor es mejor), solo contra empresas del mismo tamaño. Empate: gana quien ahorró más kWh. Cuenta el último registro de cada empresa por ciclo.
- Controles: alerta si el ciclo dura menos de 20 o más de 40 días, o si el resultado queda por debajo de 40 % o por encima de 250 % (posible error de digitación). Cada registro guarda número de factura y periodo para cotejarlo.
- El CSV trae entradas y resultados: cualquiera lo recalcula en una hoja de cálculo.
- El motor de cálculo (`js/meta.js`) no depende de la interfaz y tiene pruebas.

## Correrlo

Sin instalar nada: abra `index.html` en el navegador. Funciona todo menos la lectura de la factura con IA.

Con el servidor (Node 20 o superior), que además lee facturas con foto o PDF:

```
npm install
ANTHROPIC_API_KEY=su-clave npm start     # http://localhost:3000
```

Sin `ANTHROPIC_API_KEY` el servidor arranca igual y el botón de leer la factura no aparece.

Pruebas (cálculo, lector de facturas y servidor):

```
npm test
```

### Publicarlo en Railway

Railway detecta el `package.json` y corre `npm start` en el puerto que asigna (`PORT`). Para activar la lectura con IA, agregue la variable `ANTHROPIC_API_KEY` en el servicio (Variables). Cada lectura llama una vez a la API de Anthropic con el modelo `claude-opus-5-5` y tiene costo; el servidor limita a 20 lecturas por hora por dirección IP.

### Leer la factura con IA

`server.js` recibe la foto (reducida a JPEG en el navegador) o el PDF y `lector.js` le pide a Claude los datos en un formato JSON fijo: número de factura, fechas de lectura, días, consumo, meta y tarifa. El inicio del periodo es el día siguiente a la lectura anterior, para que los días coincidan con la factura. Si la factura no trae la meta, se avisa y se calcula con las 12 facturas anteriores. La persona revisa los campos llenados antes de guardar. El sitio no guarda el archivo.

## Datos

Solo datos de muestra: 16 empresas ficticias de Barranquilla con facturas de septiembre y octubre de 2026 (`js/datos-muestra.js`). No hay datos personales. No se conecta a Air-e ni a la Cámara. Lo que se registra queda en el navegador (localStorage).

## Lo que le falta

- Reemplazar los porcentajes estimados del bono y el recargo por la regla oficial cuando se publique.
- Servidor con usuarios y validación de la factura por la Cámara, para que el ranking sea oficial.
- Conexión con la app EcoFriends (Línea 2) y la priorización de visitas (Línea 3): una empresa en recargo debería subir en la lista de visitas técnicas.

## Estructura

```
index.html            Interfaz (4 vistas)
css/styles.css        Estilos
js/meta.js            Motor de cálculo (puro, probado): % de la meta, ranking, valor en pesos, proyección
js/app.js             Lógica de la interfaz
js/datos-muestra.js   Facturas de ejemplo
server.js             Servidor: sirve la página y la ruta /api/leer-factura
lector.js             Lectura de facturas con Claude (formato JSON fijo)
tests/                Pruebas del cálculo, del lector y del servidor
docs/pitch.md         Guion de 3 minutos
```

## Equipo

- [Nombre] · [contacto] · ¿Seguiría trabajando en la solución? [sí/no]
- [Nombre] · [contacto] · ¿Seguiría trabajando en la solución? [sí/no]

Licencia MIT.
