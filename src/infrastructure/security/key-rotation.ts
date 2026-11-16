/**
 * Rotación de la clave de datos: volver a cifrar con la clave vigente y saber qué datos dependen de cada clave.
 * Lo usa la herramienta `npm run secrets` (y sus pruebas). Trabaja por lotes, en transacciones cortas y con
 * control optimista (solo actualiza la fila si no cambió mientras tanto): se puede ejecutar con el portal en
 * servicio y repetir sin riesgo.
 */
import type { Db } from '../database/db.service';
import type { CryptoService } from './crypto.service';

/** Columnas cifradas de la PQRSD (datos personales). */
const PQRSD_ENC = ['documento_enc', 'nombre_enc', 'email_enc', 'telefono_enc', 'asunto_enc', 'mensaje_enc', 'respuesta_enc'] as const;

export interface ReencryptResult {
  usuariosMfa: number;
  pqrsd: number;
}

export interface KeyUsage {
  /** Datos cifrados por clave (identificador → filas); 'v1' = formato anterior sin identificador. */
  cifrado: Record<string, number>;
  /** Eventos de auditoría firmados por clave; 'sin-clave' = anteriores a la rotación. */
  auditoria: Record<string, number>;
  /** Códigos de recuperación sin usar, por fecha de creación (para decidir si una clave puede retirarse). */
  codigosRecuperacionSinUsar: Array<{ creadoEn: string }>;
}

/** Vuelve a cifrar con la clave vigente todo dato cifrado con otra clave (o en el formato anterior). */
export async function reencryptAll(db: Db, crypto: CryptoService, batch = 200): Promise<ReencryptResult> {
  const prefix = `v2:${crypto.currentKeyId}:%`;
  const result: ReencryptResult = { usuariosMfa: 0, pqrsd: 0 };

  for (;;) {
    const rows = await db.query(
      'SELECT id, mfa_secreto_enc FROM usuarios WHERE mfa_secreto_enc IS NOT NULL AND mfa_secreto_enc NOT LIKE $1 ORDER BY id LIMIT $2',
      [prefix, batch],
    );
    if (!rows.length) break;
    await db.transaction(async () => {
      for (const r of rows) {
        const plain = crypto.decrypt(r.mfa_secreto_enc as string);
        // No cambia auth_version: el secreto es el mismo, solo cambia la clave que lo protege.
        result.usuariosMfa += await db.run('UPDATE usuarios SET mfa_secreto_enc = $1 WHERE id = $2 AND mfa_secreto_enc = $3', [
          crypto.encrypt(plain),
          r.id,
          r.mfa_secreto_enc,
        ]);
      }
    });
  }

  const notCurrent = PQRSD_ENC.map((c) => `(${c} IS NOT NULL AND ${c} NOT LIKE $1)`).join(' OR ');
  for (;;) {
    const rows = await db.query(`SELECT id, ${PQRSD_ENC.join(', ')} FROM pqrsd WHERE ${notCurrent} ORDER BY id LIMIT $2`, [prefix, batch]);
    if (!rows.length) break;
    await db.transaction(async () => {
      for (const r of rows) {
        const plain = Object.fromEntries(PQRSD_ENC.map((c) => [c, r[c] ? crypto.decrypt(r[c] as string) : null]));
        const values = PQRSD_ENC.map((c) => (plain[c] === null ? null : crypto.encrypt(plain[c])));
        const sets = PQRSD_ENC.map((c, i) => `${c} = $${i + 1}`).join(', ');
        const guard = PQRSD_ENC.map((c, i) => `${c} IS NOT DISTINCT FROM $${PQRSD_ENC.length + 3 + i}`).join(' AND ');
        // El índice ciego del documento se recalcula con la clave vigente (la consulta ciudadana lo usa).
        result.pqrsd += await db.run(`UPDATE pqrsd SET ${sets}, documento_hash = $${PQRSD_ENC.length + 1} WHERE id = $${PQRSD_ENC.length + 2} AND ${guard}`, [
          ...values,
          crypto.blindIndex(String(plain.documento_enc ?? '')),
          r.id,
          ...PQRSD_ENC.map((c) => r[c]),
        ]);
      }
    });
  }
  return result;
}

/** Qué datos dependen de cada clave. Una clave solo puede retirarse cuando ya no cifra ningún dato. */
export async function keyUsage(db: Db, crypto: CryptoService): Promise<KeyUsage> {
  const cifrado: Record<string, number> = {};
  const count = (payload: string | null) => {
    if (!payload) return;
    const id = crypto.keyIdOf(payload) ?? 'v1';
    cifrado[id] = (cifrado[id] ?? 0) + 1;
  };
  for (const r of await db.query('SELECT mfa_secreto_enc FROM usuarios WHERE mfa_secreto_enc IS NOT NULL')) count(r.mfa_secreto_enc as string);
  for (const r of await db.query(`SELECT ${PQRSD_ENC.join(', ')} FROM pqrsd`)) for (const c of PQRSD_ENC) count((r[c] as string | null) ?? null);
  const auditoria: Record<string, number> = {};
  for (const r of await db.query("SELECT coalesce(clave_id, 'sin-clave') AS k, count(*)::int AS n FROM auditoria_eventos GROUP BY 1")) {
    auditoria[r.k as string] = Number(r.n);
  }
  const codigos = await db.query(
    'SELECT to_char(creado_en AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS"Z"\') AS c FROM codigos_recuperacion WHERE usado_en IS NULL',
  );
  return { cifrado, auditoria, codigosRecuperacionSinUsar: codigos.map((r) => ({ creadoEn: r.c as string })) };
}
