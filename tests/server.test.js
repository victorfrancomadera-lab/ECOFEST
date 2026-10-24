const test = require('node:test');
const assert = require('node:assert');

// Sin clave: la lectura con IA queda apagada y la página se sigue sirviendo.
delete process.env.ANTHROPIC_API_KEY;
const servidor = require('../server.js');

test('el servidor sirve la página y protege lo que no es público', async (t) => {
  await new Promise(r => servidor.listen(0, r));
  t.after(() => servidor.close());
  const base = 'http://127.0.0.1:' + servidor.address().port;

  const inicio = await fetch(base + '/');
  assert.strictEqual(inicio.status, 200);
  assert.match(await inicio.text(), /Medidor del Pacto/);
  assert.strictEqual((await fetch(base + '/js/meta.js')).headers.get('content-type'), 'text/javascript; charset=utf-8');

  for (const ruta of ['/server.js', '/package.json', '/tests/meta.test.js', '/js/../server.js', '/%2e%2e/etc/passwd']) {
    assert.strictEqual((await fetch(base + ruta)).status, 404, ruta);
  }

  // Una dirección mal codificada no tumba el servidor.
  assert.strictEqual((await fetch(base + '/%E0%A4%A')).status, 400);
  assert.strictEqual((await fetch(base + '/')).status, 200);

  assert.deepStrictEqual(await (await fetch(base + '/api/estado')).json(), { lecturaConIA: false });
  const lectura = await fetch(base + '/api/leer-factura', { method: 'POST', body: '{}' });
  assert.strictEqual(lectura.status, 503);
  assert.strictEqual((await fetch(base + '/api/leer-factura')).status, 405);
});
