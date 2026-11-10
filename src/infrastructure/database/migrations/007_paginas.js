'use strict';
/**
 * Módulo de páginas. Las páginas institucionales que antes estaban escritas en plantillas
 * se cargan aquí como bloques editables, con el mismo contenido y diseño.
 * Las marcadas como `sistema` no se pueden eliminar (forman parte del menú principal).
 */
const card = (titulo, texto, enlace = '', textoEnlace = '', extra = {}) => ({ titulo, texto, enlace, textoEnlace, etiqueta: '', ancla: '', ...extra });
const item = (titulo, html, extra = {}) => ({ titulo, html, ancla: '', abierto: false, ...extra });
const seccion = (titulo, antetitulo, ancla, fondo = 'blanco') => ({ tipo: 'seccion', titulo, antetitulo, ancla, fondo });
const lista = (...items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

const PAGINAS = [
  {
    slug: 'secretaria',
    titulo: 'La Secretaría',
    resumen: 'Conozca quiénes somos, nuestra razón de ser y cómo estamos organizados para servirle.',
    bloques: [
      seccion('', '', 'mision'),
      {
        tipo: 'aviso',
        estilo: 'advertencia',
        html: '<p>Texto provisional: reemplazar por la misión y la visión oficiales publicadas en el portal anterior.</p>',
      },
      {
        tipo: 'tarjetas',
        columnas: 2,
        estilo: 'tarjeta',
        items: [
          card(
            'Nuestra misión',
            'Garantizar a la población del municipio de Ibagué el derecho a una educación de calidad, incluyente y pertinente en los niveles de preescolar, básica y media, mediante la administración eficiente de los recursos del sector, el acompañamiento a las instituciones educativas y el trabajo articulado con la comunidad educativa.',
            '',
            '',
            { etiqueta: 'Misión' },
          ),
          card(
            'Nuestra visión',
            'Ser reconocida como una entidad territorial certificada líder en la gestión educativa, que contribuye a la formación de ciudadanos íntegros, competentes y comprometidos con el desarrollo sostenible, la paz y la equidad de Ibagué y la región.',
            '',
            '',
            { etiqueta: 'Visión' },
          ),
        ],
      },
      seccion('Objetivos y funciones', 'Marco legal', 'funciones', 'gris'),
      {
        tipo: 'texto',
        html:
          '<p>Ibagué es una entidad territorial certificada en educación. De acuerdo con el artículo 7 de la Ley 715 de 2001, le corresponde:</p>' +
          lista(
            'Dirigir, planificar y prestar el servicio educativo en los niveles de preescolar, básica y media, en condiciones de equidad, eficiencia y calidad.',
            'Administrar y distribuir entre los establecimientos educativos los recursos financieros provenientes del Sistema General de Participaciones destinados a la prestación del servicio.',
            'Administrar las instituciones educativas y el personal docente, directivo docente y administrativo.',
            'Distribuir las plantas de personal entre las instituciones educativas, atendiendo los parámetros técnicos establecidos.',
            'Ejercer la inspección, vigilancia y supervisión de la educación en su jurisdicción.',
            'Prestar asistencia técnica y administrativa a las instituciones educativas.',
            'Mantener la cobertura actual y propender a su ampliación.',
            'Evaluar el desempeño de rectores, directores y docentes, y organizar la prestación del servicio educativo en su jurisdicción.',
            'Suministrar la información al Ministerio de Educación Nacional en las condiciones requeridas.',
          ),
      },
      seccion('Organigrama', 'Estructura', 'organigrama'),
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          card('Despacho del Secretario(a) de Educación', 'Dirección general de la política educativa municipal.'),
          card('Dirección de Cobertura', 'Matrícula, acceso y permanencia escolar.'),
          card('Dirección de Calidad Educativa', 'Mejoramiento, evaluación y formación.'),
          card('Dirección Administrativa y Financiera', 'Talento humano, nómina, presupuesto e infraestructura.'),
        ],
      },
      { tipo: 'texto', html: '<p>Estructura de referencia. Verificar contra el acto administrativo vigente.</p>' },
      seccion('Dependencias', 'Directorio', 'dependencias', 'gris'),
      {
        tipo: 'tabla',
        encabezados: ['Dependencia', 'Temas que atiende', 'Contacto'],
        filas: [
          ['Despacho', 'Dirección general de la política educativa municipal', 'educacion@ibague.gov.co'],
          ['Cobertura educativa', 'Matrículas, cupos, traslados, SIMAT, alimentación y transporte escolar', '(608) 262 3256'],
          ['Calidad educativa', 'PEI, planes de mejoramiento, formación docente, pruebas Saber', '(608) 262 3256'],
          ['Talento humano', 'Nómina, novedades, certificados laborales, escalafón, carrera docente', '(608) 262 3256'],
          ['Fondo de Prestaciones Económicas', 'Cesantías, pensiones y demás prestaciones del magisterio', '(608) 262 3256'],
          ['Inspección y vigilancia', 'Licencias de funcionamiento, costos educativos, quejas sobre establecimientos', '(608) 262 3256'],
          ['Planeación educativa', 'Estadísticas, proyectos, infraestructura educativa', '(608) 262 3256'],
          ['Atención al ciudadano', 'Radicación y seguimiento de PQRSD', 'Ver Atención al ciudadano'],
        ],
      },
      seccion('Sistema de gestión', 'Calidad', 'sistema-gestion'),
      {
        tipo: 'texto',
        html: '<p>La Secretaría trabaja bajo el modelo de procesos definido por el Ministerio de Educación Nacional para las secretarías de educación certificadas y el Modelo Integrado de Planeación y Gestión (MIPG).</p>',
      },
      {
        tipo: 'tarjetas',
        columnas: 4,
        estilo: 'tarjeta',
        items: [
          card('Procesos estratégicos', 'Planeación, direccionamiento y evaluación.'),
          card('Procesos misionales', 'Cobertura, calidad e inspección y vigilancia.'),
          card('Procesos de apoyo', 'Talento humano, financiera, jurídica, atención al ciudadano.'),
          card('Evaluación', 'Control interno y mejora continua.'),
        ],
      },
    ],
  },
  {
    slug: 'tramites',
    titulo: 'Trámites y servicios',
    resumen: 'Consulte requisitos, canales y tiempos de respuesta. Muchos trámites se pueden hacer en línea.',
    bloques: [
      seccion('', '', ''),
      {
        tipo: 'aviso',
        estilo: 'informacion',
        html: '<p>Los trámites de la Secretaría también están inscritos en el Sistema Único de Información de Trámites (SUIT) y se pueden consultar en <a href="https://www.gov.co/">GOV.CO</a>.</p>',
      },
      {
        tipo: 'acordeon',
        titulo: 'Matrícula y cupos',
        ancla: 'matricula',
        intro: '',
        items: [
          item(
            'Solicitud de cupo para estudiantes nuevos',
            '<p>Para niñas, niños y jóvenes que desean ingresar por primera vez al sistema educativo oficial de Ibagué.</p>' +
              lista(
                'Documento de identidad del estudiante (registro civil o tarjeta de identidad).',
                'Documento de identidad del acudiente.',
                'Certificado de estudios del último grado cursado (si aplica).',
                'Carné de vacunas para preescolar.',
              ) +
              '<p><strong>Canal:</strong> directamente en la institución educativa o mediante solicitud en línea, según el cronograma de matrícula vigente.</p>',
            { abierto: true },
          ),
          item(
            'Traslado de estudiantes entre instituciones oficiales',
            '<p>Se solicita ante la institución de destino o en línea, sujeto a disponibilidad de cupos.</p>',
          ),
          item(
            'Renovación de matrícula',
            '<p>Los estudiantes antiguos renuevan su matrícula directamente en la institución educativa en las fechas fijadas por la Secretaría.</p>',
          ),
        ],
      },
      {
        tipo: 'acordeon',
        titulo: 'Docentes y directivos docentes',
        ancla: 'docentes',
        intro: '',
        items: [
          item(
            'Certificado laboral y de tiempo de servicio',
            '<p>Los docentes activos pueden descargar o solicitar el certificado laboral desde <strong>Humano en Línea</strong>. Para certificados con funciones o de personal retirado, la solicitud se radica en línea.</p>',
          ),
          item(
            'Certificado de salarios (formato CETIL / bonos pensionales)',
            '<p>Se solicita en línea adjuntando copia del documento de identidad y el periodo a certificar.</p>',
          ),
          item('Novedades de nómina, permisos, licencias y traslados', '<p>Se radican en línea con los soportes requeridos según el tipo de novedad.</p>'),
          item(
            'Ascenso o reubicación en el escalafón docente',
            '<p>Aplica para docentes de los Decretos 2277 de 1979 y 1278 de 2002, según la normativa y las convocatorias vigentes.</p>',
          ),
        ],
      },
      {
        tipo: 'acordeon',
        titulo: 'Fondo de Prestaciones Económicas',
        ancla: 'prestaciones',
        intro: '<p><strong>Horario de atención:</strong> lunes, miércoles y jueves de 7:30 a.m. a 3:30 p.m. Martes y viernes no hay atención al público.</p>',
        items: [
          item(
            'Cesantías parciales y definitivas',
            '<p>Solicitudes de docentes afiliados al FOMAG para compra, construcción o mejora de vivienda, estudios, o retiro definitivo.</p>',
          ),
          item(
            'Pensiones y reconocimientos prestacionales',
            '<p>Pensión de jubilación, invalidez, sobrevivientes, auxilios e indemnizaciones del magisterio.</p>',
          ),
        ],
      },
      {
        tipo: 'acordeon',
        titulo: 'Establecimientos educativos',
        ancla: 'establecimientos',
        intro: '',
        items: [
          item(
            'Licencia de funcionamiento para establecimientos privados',
            '<p>Requisito para que un establecimiento educativo privado preste el servicio de educación formal en Ibagué.</p>',
          ),
          item(
            'Reconocimiento oficial y aprobación de estudios',
            '<p>Trámite para ampliación de niveles, cambio de sede, de propietario o de nombre de un establecimiento.</p>',
          ),
          item('Instituciones de educación para el trabajo y el desarrollo humano', '<p>Licencia de funcionamiento y registro de programas.</p>'),
        ],
      },
      {
        tipo: 'acordeon',
        titulo: 'Certificados y legalizaciones',
        ancla: 'certificados',
        intro: '',
        items: [
          item(
            'Legalización de documentos académicos para el exterior',
            '<p>Autenticación de firmas de rectores y directores en certificados y diplomas para trámites de apostilla.</p>',
          ),
          item(
            'Certificados de estudio de instituciones cerradas',
            '<p>La Secretaría custodia los archivos de establecimientos clausurados y expide los certificados correspondientes.</p>',
          ),
        ],
      },
      seccion('Sistemas de información', 'Plataformas', 'sistemas', 'gris'),
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          card('PQRSD en línea', 'Radique solicitudes y consulte el estado de su trámite.', '/atencion#pqrsd', 'Radicar en línea'),
          card('Humano en Línea', 'Certificados laborales, desprendibles de nómina y datos personales. Enlace próximamente.'),
          card('SIMAT', 'Sistema Integrado de Matrícula (uso de instituciones educativas).', 'https://www.sistemamatriculas.gov.co/', 'Ingresar a SIMAT'),
          card('Sistema Maestro', 'Vacantes definitivas y temporales para docentes.', 'https://sistemamaestro.mineducacion.gov.co/', 'Ingresar'),
          card('FOMAG', 'Servicios del Fondo Nacional de Prestaciones Sociales del Magisterio.', 'https://www.fomag.gov.co/', 'Ingresar'),
          card('SECOP', 'Consulta de procesos de contratación pública.', 'https://www.colombiacompra.gov.co/', 'Ingresar'),
        ],
      },
    ],
  },
  {
    slug: 'comunidad',
    titulo: 'Comunidad educativa',
    resumen: 'Información y servicios para estudiantes, familias, docentes, directivos e instituciones.',
    bloques: [
      seccion('Lo que necesita saber', 'Estudiantes y familias', 'estudiantes'),
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          card('Matrícula y cupos', 'Cronograma, requisitos y canales para inscribirse en un colegio oficial.', '/tramites#matricula', 'Ver trámite'),
          card('Alimentación escolar (PAE)', 'Complemento alimentario para estudiantes de instituciones oficiales.', '#programas', 'Más información'),
          card('Transporte escolar', 'Apoyo de movilidad para estudiantes, con prioridad en la zona rural.', '#programas', 'Más información'),
          card(
            'Educación inclusiva',
            'Atención a estudiantes con discapacidad, talentos excepcionales y población vulnerable.',
            '#programas',
            'Más información',
          ),
          card('Educación para adultos', 'Programas de alfabetización y validación de la básica y la media.', '#programas', 'Más información'),
          card('Pruebas Saber', 'Resultados y preparación para las evaluaciones del ICFES.', 'https://www.icfes.gov.co/', 'Ir al ICFES'),
        ],
      },
      seccion('Servicios para el magisterio', 'Docentes y directivos docentes', 'docentes', 'gris'),
      {
        tipo: 'tarjetas',
        columnas: 4,
        estilo: 'servicio',
        items: [
          card('Certificados', 'Laborales, de salarios y de tiempo de servicio.', '/tramites#docentes'),
          card('Prestaciones', 'Cesantías, pensiones y FOMAG.', '/tramites#prestaciones'),
          card('Escalafón', 'Ascensos, reubicación y evaluación.', '/tramites#docentes'),
          card('Circulares', 'Directrices y comunicados oficiales.', '/normatividad#circulares'),
        ],
      },
      seccion('Programas y proyectos', 'Proyectos', 'programas'),
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          card('Programa de Alimentación Escolar', 'Contribuye al acceso y la permanencia escolar mediante complementos alimentarios.', '', '', {
            etiqueta: 'Bienestar',
          }),
          card('Transporte escolar', 'Garantiza la movilidad de estudiantes que viven lejos de su institución.', '', '', { etiqueta: 'Cobertura' }),
          card('Formación docente', 'Actualización pedagógica, bilingüismo y competencias digitales para maestros.', '', '', { etiqueta: 'Calidad' }),
          card('Jornada única', 'Más tiempo escolar para fortalecer los aprendizajes.', '', '', { etiqueta: 'Calidad' }),
          card('Ambientes de aprendizaje', 'Mejoramiento y dotación de sedes educativas urbanas y rurales.', '', '', { etiqueta: 'Infraestructura' }),
          card('Convivencia escolar', 'Ruta de atención integral y comités de convivencia (Ley 1620 de 2013).', '', '', { etiqueta: 'Convivencia' }),
        ],
      },
      seccion('Instituciones educativas oficiales', 'Directorio', 'instituciones', 'gris'),
      { tipo: 'directorioInstituciones' },
    ],
  },
  {
    slug: 'transparencia',
    titulo: 'Transparencia y acceso a la información pública',
    resumen: 'Información publicada en cumplimiento de la Ley 1712 de 2014 y la Resolución 1519 de 2020 de MinTIC.',
    bloques: [
      seccion('', '', ''),
      {
        tipo: 'acordeon',
        titulo: '',
        ancla: '',
        intro: '',
        items: [
          item(
            '1. Información de la entidad',
            lista(
              '<a href="/secretaria#mision">Misión y visión</a>',
              '<a href="/secretaria#funciones">Funciones y deberes</a>',
              '<a href="/secretaria#organigrama">Estructura orgánica – organigrama</a>',
              '<a href="/secretaria#dependencias">Directorio de dependencias</a>',
              '<a href="/contacto">Ubicación, horarios y canales de atención</a>',
            ),
            { abierto: true },
          ),
          item(
            '2. Normativa',
            lista(
              '<a href="/normatividad#circulares">Circulares</a>',
              '<a href="/normatividad#resoluciones">Resoluciones</a>',
              '<a href="/normatividad#decretos">Decretos y acuerdos</a>',
              '<a href="/normatividad#nacional">Normatividad nacional</a>',
            ),
          ),
          item(
            '3. Contratación',
            lista(
              'Plan Anual de Adquisiciones',
              '<a href="https://www.colombiacompra.gov.co/">Procesos de contratación en SECOP</a>',
              'Ejecución de contratos',
            ),
            { ancla: 'contratacion' },
          ),
          item(
            '4. Planeación, presupuesto e informes',
            lista(
              'Presupuesto general asignado y ejecución presupuestal',
              'Plan de acción',
              'Plan de Desarrollo Municipal – componente educativo',
              'Plan Territorial de Formación Docente',
              'Plan Anticorrupción y de Atención al Ciudadano',
            ),
            { ancla: 'planeacion' },
          ),
          item(
            '5. Informes de gestión, evaluación y auditoría',
            lista('Informes de gestión', 'Informes de control interno', 'Rendición de cuentas', 'Informes de PQRSD'),
            { ancla: 'informes' },
          ),
          item('6. Trámites', lista('<a href="/tramites">Trámites y servicios</a>')),
          item('7. Participa', lista('Participación ciudadana en la gestión', 'Consultas y proyectos normativos para comentarios')),
          item(
            '8. Datos abiertos',
            lista('Instrumentos de gestión de la información pública', '<a href="https://www.datos.gov.co/">Portal de datos abiertos de Colombia</a>'),
          ),
          item(
            '9. Información para la población',
            lista('<a href="/comunidad#estudiantes">Estudiantes y familias</a>', '<a href="/comunidad#programas">Programas y proyectos</a>'),
          ),
          item('10. Obligación de reporte de información específica', lista('Reportes a entes de control y al Ministerio de Educación Nacional')),
        ],
      },
      seccion('', '', '', 'gris'),
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          card(
            'Política de tratamiento de datos personales',
            'Los datos personales recolectados se tratan conforme a la Ley 1581 de 2012 y sus decretos reglamentarios, únicamente para atender las solicitudes de los ciudadanos. Las estadísticas del sitio no usan cookies ni guardan direcciones IP.',
            '',
            '',
            { ancla: 'datos-personales' },
          ),
          card(
            'Términos y condiciones de uso',
            'El contenido de este portal es de carácter informativo. Los documentos oficiales prevalecen sobre cualquier resumen publicado en el sitio.',
            '',
            '',
            { ancla: 'terminos' },
          ),
          card(
            'Accesibilidad',
            'El sitio sigue las pautas WCAG 2.1 nivel AA y la NTC 5854: navegación por teclado, alto contraste, ajuste de tamaño de letra y diseño adaptable a celulares.',
            '',
            '',
            { ancla: 'accesibilidad' },
          ),
        ],
      },
    ],
  },
  {
    slug: 'contacto',
    titulo: 'Contacto',
    resumen: 'Visítenos, llámenos o escríbanos.',
    bloques: [seccion('', '', ''), { tipo: 'datosContacto', mostrarMapa: true }],
  },
];

module.exports = {
  PAGINAS,
  up(db) {
    db.exec(`
      CREATE TABLE paginas (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL,
        resumen TEXT NOT NULL DEFAULT '',
        bloques TEXT NOT NULL DEFAULT '[]',
        estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicada')),
        sistema INTEGER NOT NULL DEFAULT 0,
        creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        publicada_en TEXT,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const ins = db.prepare(
      `INSERT INTO paginas (slug, titulo, resumen, bloques, estado, sistema, publicada_en) VALUES (?, ?, ?, ?, 'publicada', 1, datetime('now'))`,
    );
    for (const p of PAGINAS) ins.run(p.slug, p.titulo, p.resumen, JSON.stringify(p.bloques));
  },
};
