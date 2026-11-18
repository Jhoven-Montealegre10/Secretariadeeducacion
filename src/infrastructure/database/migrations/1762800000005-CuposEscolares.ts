import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Página "Trámites", sección "Sistemas de información": reemplaza la tarjeta "Humano en Línea" (sin enlace)
 * por "Cupos escolares", con enlace a la plataforma de inscripción de cupos de la Alcaldía de Ibagué.
 * Solo cambia la tarjeta si sigue existiendo con su título original (no pisa ediciones hechas en el panel).
 */
const ANTERIOR = {
  titulo: 'Humano en Línea',
  texto: 'Certificados laborales, desprendibles de nómina y datos personales. Enlace próximamente.',
  enlace: '',
  textoEnlace: '',
  etiqueta: '',
  ancla: '',
};

const NUEVA = {
  titulo: 'Cupos escolares',
  texto: 'Solicite o consulte el cupo escolar en los colegios oficiales de Ibagué.',
  enlace: 'https://www.cupoescolaribague.gov.co/#/tramites/educacion/inicio',
  textoEnlace: 'Solicitar cupo',
  etiqueta: '',
  ancla: '',
};

type Tarjeta = { titulo?: unknown };
type Bloque = { tipo?: unknown; items?: Tarjeta[] };

async function reemplazar(q: QueryRunner, desde: string, hacia: typeof NUEVA): Promise<void> {
  const filas = (await q.query(`SELECT id, bloques FROM "portal"."paginas" WHERE slug = 'tramites'`)) as Array<{
    id: number;
    bloques: Bloque[];
  }>;
  for (const { id, bloques } of filas) {
    let cambio = false;
    const nuevos = bloques.map((b) => {
      if (b.tipo !== 'tarjetas' || !Array.isArray(b.items)) return b;
      return {
        ...b,
        items: b.items.map((t) => {
          if (t.titulo !== desde) return t;
          cambio = true;
          return { ...hacia };
        }),
      };
    });
    if (cambio) {
      await q.query(`UPDATE "portal"."paginas" SET bloques = $1::jsonb WHERE id = $2`, [JSON.stringify(nuevos), id]);
    }
  }
}

export class CuposEscolares1762800000005 implements MigrationInterface {
  name = 'CuposEscolares1762800000005';

  public async up(q: QueryRunner): Promise<void> {
    await reemplazar(q, ANTERIOR.titulo, NUEVA);
  }

  public async down(q: QueryRunner): Promise<void> {
    await reemplazar(q, NUEVA.titulo, ANTERIOR);
  }
}
