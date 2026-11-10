'use strict';
/**
 * Definición única de cada endpoint: una sola declaración crea la ruta de Express y su
 * documentación OpenAPI con los mismos esquemas. Además aplica, en este orden:
 *   límite de peticiones → autenticación/permiso → CSRF → lectura del cuerpo → validación
 *   de entrada (Zod) → controlador → validación estricta de la salida (fuera de producción).
 * Si un controlador devuelve un campo no documentado (p. ej. un hash), las pruebas fallan.
 */
const express = require('express');
const config = require('../../../config');
const { registry, routes, errorResponses } = require('./openapi');
const { ValidationError, UnauthorizedError, ForbiddenError } = require('../../../domain/errors');
const { verifyCsrf } = require('../middleware/csrf');

const UNSAFE = new Set(['post', 'put', 'patch', 'delete']);

function zodDetails(error, prefix) {
  return error.issues.map((i) => ({ campo: [prefix, ...i.path].filter(Boolean).join('.'), mensaje: i.message }));
}

function authMiddleware(auth) {
  return (req, res, next) => {
    if (auth === 'public') return next();
    if (auth === 'pending') {
      if (req.session?.pending?.userId && req.session.pending.expiresAt > Date.now()) return next();
      return next(new UnauthorizedError('Inicie sesión de nuevo.', 'LOGIN_REQUIRED'));
    }
    if (!req.actor) return next(new UnauthorizedError());
    if (!req.actor.permisos.has('dashboard.access')) return next(new ForbiddenError());
    if (auth !== 'authenticated' && !req.actor.permisos.has(auth)) {
      const err = new ForbiddenError();
      err.permiso = auth;
      return next(err);
    }
    next();
  };
}

function validator(request = {}) {
  return (req, res, next) => {
    const valid = {};
    for (const part of ['params', 'query', 'body']) {
      const schema = request[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) return next(new ValidationError(undefined, zodDetails(result.error, part === 'body' ? '' : part)));
      valid[part] = result.data;
    }
    req.valid = valid;
    next();
  };
}

function describeAuth(auth) {
  if (auth === 'public') return '**Acceso:** público.';
  if (auth === 'pending') return '**Acceso:** sesión con el primer factor (contraseña) verificado y el segundo factor pendiente.';
  if (auth === 'authenticated') return '**Acceso:** usuario autenticado con segundo factor (cualquier rol del panel).';
  return `**Acceso:** usuario autenticado con el permiso \`${auth}\`.`;
}

function createApi(prefix = '/api/v1') {
  const router = express.Router();

  function route(spec, handler) {
    const method = spec.method.toLowerCase();
    const expressPath = spec.path.replace(prefix, '').replace(/{(\w+)}/g, ':$1') || '/';
    const unsafe = UNSAFE.has(method);
    const successCode = spec.status || (method === 'post' ? 201 : 200);
    const success = spec.responses?.[successCode];

    const chain = [];
    if (spec.rateLimit) chain.push(spec.rateLimit);
    chain.push(authMiddleware(spec.auth));
    if (unsafe) chain.push(verifyCsrf);
    if (spec.upload) chain.push(spec.upload.middleware);
    else if (unsafe) chain.push(express.json({ limit: spec.bodyLimit || '100kb', strict: true }));
    chain.push(validator(spec.request));
    chain.push(async (req, res, next) => {
      try {
        const result = await handler(req, res, next);
        if (res.headersSent || spec.fileResponse) return; // las descargas gestionan su propia respuesta
        if (successCode === 204 || result === undefined) return res.status(204).end();
        const body = result.meta ? { data: result.data, meta: result.meta } : { data: result.data };
        if (!config.isProd && success?.schema) {
          const check = success.schema.safeParse(body);
          if (!check.success) throw new Error(`Respuesta fuera de contrato en ${spec.method} ${spec.path}: ${JSON.stringify(check.error.issues.slice(0, 3))}`);
        }
        res.status(successCode).json(body);
      } catch (err) {
        next(err);
      }
    });
    router[method](expressPath, ...chain);

    // --- Documentación OpenAPI generada desde la misma definición ---
    const errors = new Set(spec.errors || []);
    if (spec.auth !== 'public') {
      errors.add(401);
      errors.add(403);
    }
    if (unsafe) errors.add(403);
    if (spec.request?.body || spec.request?.query || spec.upload) errors.add(422);
    if (spec.rateLimit) errors.add(429);
    if (spec.upload) errors.add(413);
    if (spec.request?.params) errors.add(404);

    const request = {};
    if (spec.request?.params) request.params = spec.request.params;
    if (spec.request?.query) request.query = spec.request.query;
    if (spec.upload) request.body = { required: true, content: { 'multipart/form-data': { schema: spec.upload.schema } } };
    else if (spec.request?.body) request.body = { required: true, content: { 'application/json': { schema: spec.request.body } } };

    const security = spec.auth === 'public' && !unsafe ? [] : [{ sessionCookie: [], ...(unsafe ? { csrfToken: [] } : {}) }];
    const responses = { ...errorResponses([...errors].sort()) };
    responses[successCode] = success?.schema
      ? { description: success.description, content: { 'application/json': { schema: success.schema } } }
      : { description: success?.description || 'Operación exitosa, sin contenido.' };
    if (spec.fileResponse)
      responses[successCode] = {
        description: spec.fileResponse,
        content: { [spec.fileMime || 'application/octet-stream']: { schema: { type: 'string', format: 'binary' } } },
      };

    registry.registerPath({
      method,
      path: spec.path,
      tags: spec.tags,
      summary: spec.summary,
      description: [spec.description, describeAuth(spec.auth), unsafe ? '**CSRF:** requiere la cabecera `X-CSRF-Token`.' : ''].filter(Boolean).join('\n\n'),
      security,
      request,
      responses,
      ...(typeof spec.auth === 'string' && spec.auth.includes('.') ? { 'x-permiso': spec.auth } : {}),
    });
    routes.push({ method, path: spec.path, expressPath: prefix + expressPath, auth: spec.auth });
  }

  return { router, route };
}

/** Resultado de un listado paginado en el formato estándar { data, meta }. */
function paged(result, mapItem) {
  return {
    data: result.items.map(mapItem),
    meta: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)) },
  };
}

module.exports = { createApi, paged };
