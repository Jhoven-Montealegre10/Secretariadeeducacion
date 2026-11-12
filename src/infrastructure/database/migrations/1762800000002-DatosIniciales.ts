import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos iniciales para una instalación NUEVA: roles del sistema con sus permisos y las cinco
 * páginas institucionales como bloques editables. Los datos se copian aquí (no se importan del
 * código) para que la migración sea inmutable. Al importar desde SQLite, la herramienta de
 * migración reemplaza estos datos por los de la base original.
 */
const PERMISOS_ADMIN = [
  'dashboard.access',
  'users.read',
  'users.create',
  'users.update',
  'users.delete',
  'roles.read',
  'roles.create',
  'roles.update',
  'roles.delete',
  'stats.read',
  'audit.read',
  'system.read',
  'media.read',
  'media.upload',
  'media.update',
  'media.delete',
  'pages.read',
  'pages.create',
  'pages.update',
  'pages.publish',
  'pages.delete',
  'news.read',
  'news.create',
  'news.update',
  'news.publish',
  'news.delete',
  'sliders.read',
  'sliders.create',
  'sliders.update',
  'sliders.delete',
  'documents.read',
  'documents.create',
  'documents.delete',
  'pqrsd.read',
  'pqrsd.respond',
];
const PERMISOS_EDITOR = [
  'dashboard.access',
  'media.read',
  'media.upload',
  'media.update',
  'pages.read',
  'pages.create',
  'pages.update',
  'pages.publish',
  'news.read',
  'news.create',
  'news.update',
  'news.publish',
  'sliders.read',
  'sliders.create',
  'sliders.update',
  'documents.read',
  'documents.create',
];
const PAGINAS: Array<{ slug: string; titulo: string; resumen: string; bloques: unknown[] }> = [
  {
    slug: 'secretaria',
    titulo: 'La Secretaría',
    resumen: 'Conozca quiénes somos, nuestra razón de ser y cómo estamos organizados para servirle.',
    bloques: [
      {
        tipo: 'seccion',
        titulo: '',
        antetitulo: '',
        ancla: 'mision',
        fondo: 'blanco',
      },
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
          {
            titulo: 'Nuestra misión',
            texto:
              'Garantizar a la población del municipio de Ibagué el derecho a una educación de calidad, incluyente y pertinente en los niveles de preescolar, básica y media, mediante la administración eficiente de los recursos del sector, el acompañamiento a las instituciones educativas y el trabajo articulado con la comunidad educativa.',
            enlace: '',
            textoEnlace: '',
            etiqueta: 'Misión',
            ancla: '',
          },
          {
            titulo: 'Nuestra visión',
            texto:
              'Ser reconocida como una entidad territorial certificada líder en la gestión educativa, que contribuye a la formación de ciudadanos íntegros, competentes y comprometidos con el desarrollo sostenible, la paz y la equidad de Ibagué y la región.',
            enlace: '',
            textoEnlace: '',
            etiqueta: 'Visión',
            ancla: '',
          },
        ],
      },
      {
        tipo: 'seccion',
        titulo: 'Objetivos y funciones',
        antetitulo: 'Marco legal',
        ancla: 'funciones',
        fondo: 'gris',
      },
      {
        tipo: 'texto',
        html: '<p>Ibagué es una entidad territorial certificada en educación. De acuerdo con el artículo 7 de la Ley 715 de 2001, le corresponde:</p><ul><li>Dirigir, planificar y prestar el servicio educativo en los niveles de preescolar, básica y media, en condiciones de equidad, eficiencia y calidad.</li><li>Administrar y distribuir entre los establecimientos educativos los recursos financieros provenientes del Sistema General de Participaciones destinados a la prestación del servicio.</li><li>Administrar las instituciones educativas y el personal docente, directivo docente y administrativo.</li><li>Distribuir las plantas de personal entre las instituciones educativas, atendiendo los parámetros técnicos establecidos.</li><li>Ejercer la inspección, vigilancia y supervisión de la educación en su jurisdicción.</li><li>Prestar asistencia técnica y administrativa a las instituciones educativas.</li><li>Mantener la cobertura actual y propender a su ampliación.</li><li>Evaluar el desempeño de rectores, directores y docentes, y organizar la prestación del servicio educativo en su jurisdicción.</li><li>Suministrar la información al Ministerio de Educación Nacional en las condiciones requeridas.</li></ul>',
      },
      {
        tipo: 'seccion',
        titulo: 'Organigrama',
        antetitulo: 'Estructura',
        ancla: 'organigrama',
        fondo: 'blanco',
      },
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          {
            titulo: 'Despacho del Secretario(a) de Educación',
            texto: 'Dirección general de la política educativa municipal.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Dirección de Cobertura',
            texto: 'Matrícula, acceso y permanencia escolar.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Dirección de Calidad Educativa',
            texto: 'Mejoramiento, evaluación y formación.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Dirección Administrativa y Financiera',
            texto: 'Talento humano, nómina, presupuesto e infraestructura.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
        ],
      },
      {
        tipo: 'texto',
        html: '<p>Estructura de referencia. Verificar contra el acto administrativo vigente.</p>',
      },
      {
        tipo: 'seccion',
        titulo: 'Dependencias',
        antetitulo: 'Directorio',
        ancla: 'dependencias',
        fondo: 'gris',
      },
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
      {
        tipo: 'seccion',
        titulo: 'Sistema de gestión',
        antetitulo: 'Calidad',
        ancla: 'sistema-gestion',
        fondo: 'blanco',
      },
      {
        tipo: 'texto',
        html: '<p>La Secretaría trabaja bajo el modelo de procesos definido por el Ministerio de Educación Nacional para las secretarías de educación certificadas y el Modelo Integrado de Planeación y Gestión (MIPG).</p>',
      },
      {
        tipo: 'tarjetas',
        columnas: 4,
        estilo: 'tarjeta',
        items: [
          {
            titulo: 'Procesos estratégicos',
            texto: 'Planeación, direccionamiento y evaluación.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Procesos misionales',
            texto: 'Cobertura, calidad e inspección y vigilancia.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Procesos de apoyo',
            texto: 'Talento humano, financiera, jurídica, atención al ciudadano.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Evaluación',
            texto: 'Control interno y mejora continua.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
        ],
      },
    ],
  },
  {
    slug: 'tramites',
    titulo: 'Trámites y servicios',
    resumen: 'Consulte requisitos, canales y tiempos de respuesta. Muchos trámites se pueden hacer en línea.',
    bloques: [
      {
        tipo: 'seccion',
        titulo: '',
        antetitulo: '',
        ancla: '',
        fondo: 'blanco',
      },
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
          {
            titulo: 'Solicitud de cupo para estudiantes nuevos',
            html: '<p>Para niñas, niños y jóvenes que desean ingresar por primera vez al sistema educativo oficial de Ibagué.</p><ul><li>Documento de identidad del estudiante (registro civil o tarjeta de identidad).</li><li>Documento de identidad del acudiente.</li><li>Certificado de estudios del último grado cursado (si aplica).</li><li>Carné de vacunas para preescolar.</li></ul><p><strong>Canal:</strong> directamente en la institución educativa o mediante solicitud en línea, según el cronograma de matrícula vigente.</p>',
            ancla: '',
            abierto: true,
          },
          {
            titulo: 'Traslado de estudiantes entre instituciones oficiales',
            html: '<p>Se solicita ante la institución de destino o en línea, sujeto a disponibilidad de cupos.</p>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: 'Renovación de matrícula',
            html: '<p>Los estudiantes antiguos renuevan su matrícula directamente en la institución educativa en las fechas fijadas por la Secretaría.</p>',
            ancla: '',
            abierto: false,
          },
        ],
      },
      {
        tipo: 'acordeon',
        titulo: 'Docentes y directivos docentes',
        ancla: 'docentes',
        intro: '',
        items: [
          {
            titulo: 'Certificado laboral y de tiempo de servicio',
            html: '<p>Los docentes activos pueden descargar o solicitar el certificado laboral desde <strong>Humano en Línea</strong>. Para certificados con funciones o de personal retirado, la solicitud se radica en línea.</p>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: 'Certificado de salarios (formato CETIL / bonos pensionales)',
            html: '<p>Se solicita en línea adjuntando copia del documento de identidad y el periodo a certificar.</p>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: 'Novedades de nómina, permisos, licencias y traslados',
            html: '<p>Se radican en línea con los soportes requeridos según el tipo de novedad.</p>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: 'Ascenso o reubicación en el escalafón docente',
            html: '<p>Aplica para docentes de los Decretos 2277 de 1979 y 1278 de 2002, según la normativa y las convocatorias vigentes.</p>',
            ancla: '',
            abierto: false,
          },
        ],
      },
      {
        tipo: 'acordeon',
        titulo: 'Fondo de Prestaciones Económicas',
        ancla: 'prestaciones',
        intro: '<p><strong>Horario de atención:</strong> lunes, miércoles y jueves de 7:30 a.m. a 3:30 p.m. Martes y viernes no hay atención al público.</p>',
        items: [
          {
            titulo: 'Cesantías parciales y definitivas',
            html: '<p>Solicitudes de docentes afiliados al FOMAG para compra, construcción o mejora de vivienda, estudios, o retiro definitivo.</p>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: 'Pensiones y reconocimientos prestacionales',
            html: '<p>Pensión de jubilación, invalidez, sobrevivientes, auxilios e indemnizaciones del magisterio.</p>',
            ancla: '',
            abierto: false,
          },
        ],
      },
      {
        tipo: 'acordeon',
        titulo: 'Establecimientos educativos',
        ancla: 'establecimientos',
        intro: '',
        items: [
          {
            titulo: 'Licencia de funcionamiento para establecimientos privados',
            html: '<p>Requisito para que un establecimiento educativo privado preste el servicio de educación formal en Ibagué.</p>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: 'Reconocimiento oficial y aprobación de estudios',
            html: '<p>Trámite para ampliación de niveles, cambio de sede, de propietario o de nombre de un establecimiento.</p>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: 'Instituciones de educación para el trabajo y el desarrollo humano',
            html: '<p>Licencia de funcionamiento y registro de programas.</p>',
            ancla: '',
            abierto: false,
          },
        ],
      },
      {
        tipo: 'acordeon',
        titulo: 'Certificados y legalizaciones',
        ancla: 'certificados',
        intro: '',
        items: [
          {
            titulo: 'Legalización de documentos académicos para el exterior',
            html: '<p>Autenticación de firmas de rectores y directores en certificados y diplomas para trámites de apostilla.</p>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: 'Certificados de estudio de instituciones cerradas',
            html: '<p>La Secretaría custodia los archivos de establecimientos clausurados y expide los certificados correspondientes.</p>',
            ancla: '',
            abierto: false,
          },
        ],
      },
      {
        tipo: 'seccion',
        titulo: 'Sistemas de información',
        antetitulo: 'Plataformas',
        ancla: 'sistemas',
        fondo: 'gris',
      },
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          {
            titulo: 'PQRSD en línea',
            texto: 'Radique solicitudes y consulte el estado de su trámite.',
            enlace: '/atencion#pqrsd',
            textoEnlace: 'Radicar en línea',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Humano en Línea',
            texto: 'Certificados laborales, desprendibles de nómina y datos personales. Enlace próximamente.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'SIMAT',
            texto: 'Sistema Integrado de Matrícula (uso de instituciones educativas).',
            enlace: 'https://www.sistemamatriculas.gov.co/',
            textoEnlace: 'Ingresar a SIMAT',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Sistema Maestro',
            texto: 'Vacantes definitivas y temporales para docentes.',
            enlace: 'https://sistemamaestro.mineducacion.gov.co/',
            textoEnlace: 'Ingresar',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'FOMAG',
            texto: 'Servicios del Fondo Nacional de Prestaciones Sociales del Magisterio.',
            enlace: 'https://www.fomag.gov.co/',
            textoEnlace: 'Ingresar',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'SECOP',
            texto: 'Consulta de procesos de contratación pública.',
            enlace: 'https://www.colombiacompra.gov.co/',
            textoEnlace: 'Ingresar',
            etiqueta: '',
            ancla: '',
          },
        ],
      },
    ],
  },
  {
    slug: 'comunidad',
    titulo: 'Comunidad educativa',
    resumen: 'Información y servicios para estudiantes, familias, docentes, directivos e instituciones.',
    bloques: [
      {
        tipo: 'seccion',
        titulo: 'Lo que necesita saber',
        antetitulo: 'Estudiantes y familias',
        ancla: 'estudiantes',
        fondo: 'blanco',
      },
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          {
            titulo: 'Matrícula y cupos',
            texto: 'Cronograma, requisitos y canales para inscribirse en un colegio oficial.',
            enlace: '/tramites#matricula',
            textoEnlace: 'Ver trámite',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Alimentación escolar (PAE)',
            texto: 'Complemento alimentario para estudiantes de instituciones oficiales.',
            enlace: '#programas',
            textoEnlace: 'Más información',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Transporte escolar',
            texto: 'Apoyo de movilidad para estudiantes, con prioridad en la zona rural.',
            enlace: '#programas',
            textoEnlace: 'Más información',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Educación inclusiva',
            texto: 'Atención a estudiantes con discapacidad, talentos excepcionales y población vulnerable.',
            enlace: '#programas',
            textoEnlace: 'Más información',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Educación para adultos',
            texto: 'Programas de alfabetización y validación de la básica y la media.',
            enlace: '#programas',
            textoEnlace: 'Más información',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Pruebas Saber',
            texto: 'Resultados y preparación para las evaluaciones del ICFES.',
            enlace: 'https://www.icfes.gov.co/',
            textoEnlace: 'Ir al ICFES',
            etiqueta: '',
            ancla: '',
          },
        ],
      },
      {
        tipo: 'seccion',
        titulo: 'Servicios para el magisterio',
        antetitulo: 'Docentes y directivos docentes',
        ancla: 'docentes',
        fondo: 'gris',
      },
      {
        tipo: 'tarjetas',
        columnas: 4,
        estilo: 'servicio',
        items: [
          {
            titulo: 'Certificados',
            texto: 'Laborales, de salarios y de tiempo de servicio.',
            enlace: '/tramites#docentes',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Prestaciones',
            texto: 'Cesantías, pensiones y FOMAG.',
            enlace: '/tramites#prestaciones',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Escalafón',
            texto: 'Ascensos, reubicación y evaluación.',
            enlace: '/tramites#docentes',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
          {
            titulo: 'Circulares',
            texto: 'Directrices y comunicados oficiales.',
            enlace: '/normatividad#circulares',
            textoEnlace: '',
            etiqueta: '',
            ancla: '',
          },
        ],
      },
      {
        tipo: 'seccion',
        titulo: 'Programas y proyectos',
        antetitulo: 'Proyectos',
        ancla: 'programas',
        fondo: 'blanco',
      },
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          {
            titulo: 'Programa de Alimentación Escolar',
            texto: 'Contribuye al acceso y la permanencia escolar mediante complementos alimentarios.',
            enlace: '',
            textoEnlace: '',
            etiqueta: 'Bienestar',
            ancla: '',
          },
          {
            titulo: 'Transporte escolar',
            texto: 'Garantiza la movilidad de estudiantes que viven lejos de su institución.',
            enlace: '',
            textoEnlace: '',
            etiqueta: 'Cobertura',
            ancla: '',
          },
          {
            titulo: 'Formación docente',
            texto: 'Actualización pedagógica, bilingüismo y competencias digitales para maestros.',
            enlace: '',
            textoEnlace: '',
            etiqueta: 'Calidad',
            ancla: '',
          },
          {
            titulo: 'Jornada única',
            texto: 'Más tiempo escolar para fortalecer los aprendizajes.',
            enlace: '',
            textoEnlace: '',
            etiqueta: 'Calidad',
            ancla: '',
          },
          {
            titulo: 'Ambientes de aprendizaje',
            texto: 'Mejoramiento y dotación de sedes educativas urbanas y rurales.',
            enlace: '',
            textoEnlace: '',
            etiqueta: 'Infraestructura',
            ancla: '',
          },
          {
            titulo: 'Convivencia escolar',
            texto: 'Ruta de atención integral y comités de convivencia (Ley 1620 de 2013).',
            enlace: '',
            textoEnlace: '',
            etiqueta: 'Convivencia',
            ancla: '',
          },
        ],
      },
      {
        tipo: 'seccion',
        titulo: 'Instituciones educativas oficiales',
        antetitulo: 'Directorio',
        ancla: 'instituciones',
        fondo: 'gris',
      },
      {
        tipo: 'directorioInstituciones',
      },
    ],
  },
  {
    slug: 'transparencia',
    titulo: 'Transparencia y acceso a la información pública',
    resumen: 'Información publicada en cumplimiento de la Ley 1712 de 2014 y la Resolución 1519 de 2020 de MinTIC.',
    bloques: [
      {
        tipo: 'seccion',
        titulo: '',
        antetitulo: '',
        ancla: '',
        fondo: 'blanco',
      },
      {
        tipo: 'acordeon',
        titulo: '',
        ancla: '',
        intro: '',
        items: [
          {
            titulo: '1. Información de la entidad',
            html: '<ul><li><a href="/secretaria#mision">Misión y visión</a></li><li><a href="/secretaria#funciones">Funciones y deberes</a></li><li><a href="/secretaria#organigrama">Estructura orgánica – organigrama</a></li><li><a href="/secretaria#dependencias">Directorio de dependencias</a></li><li><a href="/contacto">Ubicación, horarios y canales de atención</a></li></ul>',
            ancla: '',
            abierto: true,
          },
          {
            titulo: '2. Normativa',
            html: '<ul><li><a href="/normatividad#circulares">Circulares</a></li><li><a href="/normatividad#resoluciones">Resoluciones</a></li><li><a href="/normatividad#decretos">Decretos y acuerdos</a></li><li><a href="/normatividad#nacional">Normatividad nacional</a></li></ul>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: '3. Contratación',
            html: '<ul><li>Plan Anual de Adquisiciones</li><li><a href="https://www.colombiacompra.gov.co/">Procesos de contratación en SECOP</a></li><li>Ejecución de contratos</li></ul>',
            ancla: 'contratacion',
            abierto: false,
          },
          {
            titulo: '4. Planeación, presupuesto e informes',
            html: '<ul><li>Presupuesto general asignado y ejecución presupuestal</li><li>Plan de acción</li><li>Plan de Desarrollo Municipal – componente educativo</li><li>Plan Territorial de Formación Docente</li><li>Plan Anticorrupción y de Atención al Ciudadano</li></ul>',
            ancla: 'planeacion',
            abierto: false,
          },
          {
            titulo: '5. Informes de gestión, evaluación y auditoría',
            html: '<ul><li>Informes de gestión</li><li>Informes de control interno</li><li>Rendición de cuentas</li><li>Informes de PQRSD</li></ul>',
            ancla: 'informes',
            abierto: false,
          },
          {
            titulo: '6. Trámites',
            html: '<ul><li><a href="/tramites">Trámites y servicios</a></li></ul>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: '7. Participa',
            html: '<ul><li>Participación ciudadana en la gestión</li><li>Consultas y proyectos normativos para comentarios</li></ul>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: '8. Datos abiertos',
            html: '<ul><li>Instrumentos de gestión de la información pública</li><li><a href="https://www.datos.gov.co/">Portal de datos abiertos de Colombia</a></li></ul>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: '9. Información para la población',
            html: '<ul><li><a href="/comunidad#estudiantes">Estudiantes y familias</a></li><li><a href="/comunidad#programas">Programas y proyectos</a></li></ul>',
            ancla: '',
            abierto: false,
          },
          {
            titulo: '10. Obligación de reporte de información específica',
            html: '<ul><li>Reportes a entes de control y al Ministerio de Educación Nacional</li></ul>',
            ancla: '',
            abierto: false,
          },
        ],
      },
      {
        tipo: 'seccion',
        titulo: '',
        antetitulo: '',
        ancla: '',
        fondo: 'gris',
      },
      {
        tipo: 'tarjetas',
        columnas: 3,
        estilo: 'tarjeta',
        items: [
          {
            titulo: 'Política de tratamiento de datos personales',
            texto:
              'Los datos personales recolectados se tratan conforme a la Ley 1581 de 2012 y sus decretos reglamentarios, únicamente para atender las solicitudes de los ciudadanos. Las estadísticas del sitio no usan cookies ni guardan direcciones IP.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: 'datos-personales',
          },
          {
            titulo: 'Términos y condiciones de uso',
            texto: 'El contenido de este portal es de carácter informativo. Los documentos oficiales prevalecen sobre cualquier resumen publicado en el sitio.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: 'terminos',
          },
          {
            titulo: 'Accesibilidad',
            texto:
              'El sitio sigue las pautas WCAG 2.1 nivel AA y la NTC 5854: navegación por teclado, alto contraste, ajuste de tamaño de letra y diseño adaptable a celulares.',
            enlace: '',
            textoEnlace: '',
            etiqueta: '',
            ancla: 'accesibilidad',
          },
        ],
      },
    ],
  },
  {
    slug: 'contacto',
    titulo: 'Contacto',
    resumen: 'Visítenos, llámenos o escríbanos.',
    bloques: [
      {
        tipo: 'seccion',
        titulo: '',
        antetitulo: '',
        ancla: '',
        fondo: 'blanco',
      },
      {
        tipo: 'datosContacto',
        mostrarMapa: true,
      },
    ],
  },
];

export class DatosIniciales1762800000002 implements MigrationInterface {
  name = 'DatosIniciales1762800000002';

  public async up(q: QueryRunner): Promise<void> {
    const [admin] = await q.query(
      `INSERT INTO portal.roles (slug, nombre, descripcion, sistema) VALUES ('administrador', 'Administrador', 'Acceso total. Rol del sistema: sus permisos no se pueden modificar.', true) RETURNING id`,
    );
    const [editor] = await q.query(
      `INSERT INTO portal.roles (slug, nombre, descripcion, sistema) VALUES ('editor', 'Editor', 'Gestiona contenidos y multimedia. No elimina definitivamente ni administra usuarios.', true) RETURNING id`,
    );
    await q.query('INSERT INTO portal.rol_permisos (rol_id, permiso) SELECT $1, unnest($2::text[])', [admin.id, PERMISOS_ADMIN]);
    await q.query('INSERT INTO portal.rol_permisos (rol_id, permiso) SELECT $1, unnest($2::text[])', [editor.id, PERMISOS_EDITOR]);
    for (const p of PAGINAS) {
      await q.query(
        `INSERT INTO portal.paginas (slug, titulo, resumen, bloques, estado, sistema, publicada_en) VALUES ($1, $2, $3, $4::jsonb, 'publicada', true, now())`,
        [p.slug, p.titulo, p.resumen, JSON.stringify(p.bloques)],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM portal.paginas WHERE sistema`);
    await q.query(`DELETE FROM portal.roles WHERE slug IN ('administrador', 'editor')`);
  }
}
