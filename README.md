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

No necesita instalar nada. Abra `index.html` en el navegador.

Pruebas del cálculo (Node 18 o superior):

```
node --test
```

## Datos

Solo datos de muestra: 16 empresas ficticias de Barranquilla con facturas de septiembre y octubre de 2026 (`js/datos-muestra.js`). No hay datos personales. No se conecta a Air-e ni a la Cámara. Lo que se registra queda en el navegador (localStorage).

## Lo que le falta

- Leer la factura con foto (OCR) en lugar de digitar.
- Calcular el bono o recargo en pesos cuando se publiquen las tarifas.
- Servidor con usuarios y validación de la factura por la Cámara, para que el ranking sea oficial.
- Conexión con la app EcoFriends (Línea 2) y la priorización de visitas (Línea 3): una empresa en recargo debería subir en la lista de visitas técnicas.

## Estructura

```
index.html            Interfaz (4 vistas)
css/styles.css        Estilos
js/meta.js            Motor de cálculo (puro, probado)
js/app.js             Lógica de la interfaz
js/datos-muestra.js   Facturas de ejemplo
tests/meta.test.js    Pruebas
docs/pitch.md         Guion de 3 minutos
```

## Equipo

- [Nombre] · [contacto] · ¿Seguiría trabajando en la solución? [sí/no]
- [Nombre] · [contacto] · ¿Seguiría trabajando en la solución? [sí/no]

Licencia MIT.
