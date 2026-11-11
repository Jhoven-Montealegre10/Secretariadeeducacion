# Calidad de código y cobertura de pruebas

Configuración gratuita: SonarQube for IDE en VS Code, ESLint, TypeScript y cobertura con c8.
La extensión SonarQube for IDE 6.3.0 se instaló en este equipo. c8 se instala con `npm ci`
en otros equipos porque figura como dependencia de desarrollo del proyecto.

`package.json` limita las versiones de `glob` y `minimatch` que utiliza c8 mediante `overrides`,
para incorporar las correcciones de seguridad que sus dependencias aún no solicitan directamente.
Al actualizar c8, revise si estos ajustes siguen siendo necesarios y ejecute `npm.cmd run quality`.

## 1. Ejecutar desde la terminal

Abra una terminal en la carpeta del proyecto. En PowerShell de Windows puede usar
`npm.cmd` para evitar restricciones del script `npm.ps1`.

```powershell
# Ejecutar las pruebas automatizadas
npm.cmd test

# Ejecutar las pruebas y generar el reporte de cobertura
npm.cmd run test:coverage

# Abrir el reporte en el navegador predeterminado de Windows
Start-Process .\coverage\index.html

# Comprobar código, tipos, pruebas, cobertura, contrato API y dependencias
npm.cmd run quality
```

En Linux y macOS use `npm` en lugar de `npm.cmd`. El lanzador de pruebas configura
`NODE_ENV=test` y enumera los archivos sin depender del shell.

También puede ejecutar las comprobaciones por separado:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run openapi:check
npm.cmd audit
```

`quality` se detiene si una comprobación falla. La cobertura se mide y se informa;
todavía no se exige un porcentaje mínimo. Una cobertura alta no garantiza ausencia de errores.

## 2. Consultar SonarQube en VS Code

1. Si VS Code solicita recargar la ventana después de instalar la extensión, acepte.
2. Abra un archivo JavaScript, por ejemplo `src/application/authService.js`.
3. Pulse `Ctrl+Shift+P` y busque **Analyze Current File with SonarQube**.
4. Abra **Ver > Problemas** (`Ctrl+Shift+M`) para consultar los avisos. Pulse un aviso para ir a su ubicación.
5. Para revisar el funcionamiento de la extensión, busque **Show SonarQube for IDE Output** en la paleta de comandos.

La extensión permite análisis local sin cuenta ni servidor SonarQube. La distribución
instalada incluye su propio runtime Java. Su instalación no requiere cambiar el Java 8 del sistema.
SonarQube for IDE muestra avisos de análisis estático; no ejecuta estas pruebas ni muestra este reporte de cobertura.

Para instalar la misma extensión en otro equipo con VS Code:

```powershell
code --install-extension SonarSource.sonarlint-vscode
```

Desde **Terminal > Ejecutar tarea** también están disponibles **Pruebas**, **Pruebas con cobertura**
y **Calidad completa**. Las recomendaciones y tareas se guardan en `.vscode/`.

## 3. Leer el reporte

`coverage/index.html` permite entrar por carpeta y archivo para ver las líneas ejecutadas y las pendientes.

| Medida | Significado |
|---|---|
| Líneas / sentencias | Código ejecutado por la suite |
| Funciones | Funciones que se invocaron |
| Ramas | Alternativas de condiciones que se recorrieron |

La configuración `.c8rc.json` incluye `src/**/*.js`, `app.js` y `server.js`, también cuando no se ejecutan.
Esta es cobertura del backend; no incluye JavaScript del navegador en `public/`, plantillas EJS ni las pruebas E2E.
La suite actual combina pruebas de servicios, seguridad e integración HTTP; no todas son pruebas unitarias aisladas.

Archivos generados:

- `coverage/index.html`: reporte visual local.
- `coverage/lcov.info`: formato para importar en un servidor SonarQube si se instala más adelante.
- `coverage/coverage-summary.json`: métricas en JSON.

La carpeta `coverage/` se excluye de Git, ESLint y Prettier. Los reportes contienen código fuente y deben
mantenerse dentro del entorno de desarrollo. Cada ejecución de cobertura reemplaza el reporte anterior.

## 4. Primera medición

Con Node.js 24.14.1 y c8 12.0.0: 94,80 % de líneas, 87,15 % de funciones y 81,23 % de ramas.
Las pruebas usan datos ficticios, SQLite en memoria y carpetas temporales.

Para elegir mejoras, revise primero las ramas sin probar en autenticación, autorización y gestión de archivos.
Después amplíe los flujos de documentos y controladores web. Revise las sugerencias de SonarQube antes de
aplicarlas: algunas requieren contexto y no conviene corregirlas automáticamente en bloque.

Referencias: [SonarQube for IDE](https://docs.sonarsource.com/sonarqube-for-vs-code),
[c8](https://github.com/bcoe/c8).
