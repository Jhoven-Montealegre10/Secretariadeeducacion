# ADR 0005 — Una declaración por ruta: validación Zod, permisos y OpenAPI juntos

- **Estado:** aceptada
- **Contexto:** la versión 3 generaba OpenAPI desde los mismos esquemas Zod que validaban (zod-to-openapi). `nestjs-zod`
  no es compatible con NestJS 12.
- **Decisión:** decorador propio `@Endpoint(método, ruta, spec)` que registra la ruta en Nest, el permiso, el límite,
  CSRF, la validación de entrada y salida y los decoradores de `@nestjs/swagger` con esquemas generados por
  `z.toJSONSchema` (nativo de Zod 4, objetivo OpenAPI 3.0). Un guard global rechaza rutas sin declaración.
  En no-producción el interceptor valida cada respuesta contra su esquema estricto.
- **Consecuencias:** + imposible documentar una cosa e implementar otra (pruebas de contrato); + denegación por defecto.
  − OpenAPI 3.0 en lugar de 3.1 (el formato que genera `@nestjs/swagger`).
