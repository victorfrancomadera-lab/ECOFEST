/*
 * Servidor del Medidor del Pacto: sirve la página y lee facturas con IA.
 * Sin dependencias fuera del SDK de Anthropic. En Railway: `npm start`, puerto en PORT.
 * La lectura con IA solo se activa si existe la variable ANTHROPIC_API_KEY.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Anthropic } = require('@anthropic-ai/sdk');
const { leerFactura, ErrorLectura } = require('./lector.js');

const RAIZ = __dirname;
const PUERTO = Number(process.env.PORT) || 3000;
const MAX_CUERPO = 12 * 1024 * 1024; // un PDF de 8 MB pesa unos 11 MB en base64
const LECTURAS_POR_HORA = 20; // por dirección IP, para que nadie gaste la clave de la API

// Solo se sirven la página y sus carpetas públicas; el código del servidor y las pruebas no.
const CARPETAS_PUBLICAS = ['css', 'js', 'img'];
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp'
};

const cliente = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
const lecturas = new Map();

function responderJson(res, estado, cuerpo) {
  res.writeHead(estado, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
}

// El proxy de Railway agrega la IP real al final de X-Forwarded-For; las primeras las puede inventar el cliente.
function ipDe(req) {
  const reenviada = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
  return reenviada || req.socket.remoteAddress || 'desconocida';
}

function permitirLectura(ip) {
  const hace1h = Date.now() - 3600 * 1000;
  if (lecturas.size > 10000) lecturas.clear(); // tope de memoria: en el peor caso se reinician los conteos
  const recientes = (lecturas.get(ip) || []).filter(function (t) { return t > hace1h; });
  if (recientes.length >= LECTURAS_POR_HORA) return false;
  recientes.push(Date.now());
  lecturas.set(ip, recientes);
  return true;
}

function leerCuerpo(req) {
  return new Promise(function (resolver, rechazar) {
    let total = 0;
    const partes = [];
    req.on('data', function (parte) {
      total += parte.length;
      if (total > MAX_CUERPO) {
        rechazar(new ErrorLectura('El archivo es muy pesado: use uno de menos de 8 MB.', 413));
        req.destroy();
        return;
      }
      partes.push(parte);
    });
    req.on('end', function () { resolver(Buffer.concat(partes).toString('utf8')); });
    req.on('error', rechazar);
  });
}

async function atenderLectura(req, res) {
  if (!cliente) return responderJson(res, 503, { error: 'La lectura con IA no está activada en este servidor.' });
  if (!permitirLectura(ipDe(req))) {
    return responderJson(res, 429, { error: 'Ya hizo muchas lecturas en la última hora. Intente más tarde o escriba los datos.' });
  }
  try {
    const cuerpo = JSON.parse(await leerCuerpo(req));
    if (!cuerpo || typeof cuerpo.datos !== 'string' || !cuerpo.datos) throw new ErrorLectura('No llegó ningún archivo.', 400);
    const resultado = await leerFactura(cliente, { tipo: cuerpo.tipo, datos: cuerpo.datos });
    responderJson(res, 200, resultado);
  } catch (e) {
    if (e instanceof ErrorLectura) return responderJson(res, e.estado, { error: e.message });
    if (e instanceof SyntaxError) return responderJson(res, 400, { error: 'La solicitud no es válida.' });
    if (e instanceof Anthropic.RateLimitError) return responderJson(res, 503, { error: 'El servicio de lectura está ocupado. Intente en un minuto.' });
    if (e instanceof Anthropic.AuthenticationError) {
      console.error('Lectura de factura: la clave de la API no es válida.');
      return responderJson(res, 503, { error: 'La lectura con IA no está disponible ahora.' });
    }
    if (e instanceof Anthropic.APIConnectionError) return responderJson(res, 502, { error: 'No hubo conexión con el servicio de lectura. Intente de nuevo.' });
    if (e instanceof Anthropic.APIError) {
      console.error('Lectura de factura: error de la API', e.status);
      return responderJson(res, 502, { error: 'El servicio de lectura falló. Intente de nuevo o escriba los datos.' });
    }
    console.error('Lectura de factura: error inesperado', e);
    responderJson(res, 500, { error: 'Algo falló al leer la factura.' });
  }
}

function servirArchivo(req, res) {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Dirección no válida');
  }
  const relativa = ruta === '/' ? 'index.html' : ruta.replace(/^\/+/, '');
  const completa = path.resolve(RAIZ, relativa);
  const primera = relativa.split('/')[0];
  const publica = relativa === 'index.html' || (CARPETAS_PUBLICAS.indexOf(primera) >= 0 && relativa.indexOf('/') > 0);
  if (!publica || !completa.startsWith(RAIZ + path.sep)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('No encontrado');
  }
  fs.readFile(completa, function (err, contenido) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No encontrado');
    }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(completa).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': relativa === 'index.html' ? 'no-cache' : 'public, max-age=300'
    });
    res.end(req.method === 'HEAD' ? undefined : contenido);
  });
}

const servidor = http.createServer(function (req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ruta = new URL(req.url, 'http://x').pathname;
  if (ruta === '/api/estado' && req.method === 'GET') return responderJson(res, 200, { lecturaConIA: Boolean(cliente) });
  if (ruta === '/api/leer-factura') {
    if (req.method !== 'POST') return responderJson(res, 405, { error: 'Use POST.' });
    return atenderLectura(req, res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return responderJson(res, 405, { error: 'Método no permitido.' });
  servirArchivo(req, res);
});

if (require.main === module) {
  servidor.listen(PUERTO, function () {
    console.log('Medidor del Pacto en el puerto ' + PUERTO + (cliente ? ' · lectura con IA activa' : ' · lectura con IA apagada (falta ANTHROPIC_API_KEY)'));
  });
}

module.exports = servidor;
