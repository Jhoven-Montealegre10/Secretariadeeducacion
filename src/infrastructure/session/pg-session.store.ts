/**
 * Almacén de sesiones en PostgreSQL. El navegador solo recibe un ID firmado; los datos viven
 * en el servidor y se comparten entre instancias.
 *  - La clave guardada es un HMAC del ID (si alguien leyera la tabla no podría usar las sesiones).
 *  - Se guarda el usuario de cada sesión para poder revocarlas todas a la vez.
 *  - Las sesiones vencidas se borran periódicamente (una instancia a la vez).
 */
import session from 'express-session';
import { Db, LOCKS } from '../database/db.service';
import { CryptoService } from '../security/crypto.service';

type Callback = (err?: unknown, value?: session.SessionData | null) => void;

export class PgSessionStore extends session.Store {
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly db: Db,
    private readonly crypto: CryptoService,
    private readonly ttlMs: number,
  ) {
    super();
    this.timer = setInterval(() => void this.purge().catch(() => undefined), 15 * 60 * 1000);
    this.timer.unref();
  }

  close(): void {
    clearInterval(this.timer);
  }

  private key(sid: string): string {
    return this.crypto.tokenHash(`session:${sid}`);
  }

  private expiresAt(sess: session.SessionData | undefined): Date {
    const expires = sess?.cookie?.expires;
    return expires ? new Date(expires) : new Date(Date.now() + this.ttlMs);
  }

  async purge(): Promise<number> {
    return this.db.transaction(async () => {
      if (!(await this.db.tryAdvisoryXactLock(LOCKS.SESSION_PURGE))) return 0;
      return this.db.run('DELETE FROM sesiones WHERE expira <= now()');
    });
  }

  override get(sid: string, cb: Callback): void {
    this.db
      .one<{ data: session.SessionData }>('SELECT data FROM sesiones WHERE sid = $1 AND expira > now()', [this.key(sid)])
      .then((row) => cb(null, row ? row.data : null))
      .catch((err: unknown) => cb(err));
  }

  override set(sid: string, sess: session.SessionData, cb?: (err?: unknown) => void): void {
    const userId = sess?.auth?.userId ?? sess?.pending?.userId ?? null;
    this.db
      .run(
        `INSERT INTO sesiones (sid, data, expira, usuario_id) VALUES ($1, $2::jsonb, $3, $4)
         ON CONFLICT (sid) DO UPDATE SET data = EXCLUDED.data, expira = EXCLUDED.expira, usuario_id = EXCLUDED.usuario_id`,
        [this.key(sid), JSON.stringify(sess), this.expiresAt(sess), userId],
      )
      .then(() => cb?.())
      .catch((err: unknown) => cb?.(err));
  }

  override destroy(sid: string, cb?: (err?: unknown) => void): void {
    this.db
      .run('DELETE FROM sesiones WHERE sid = $1', [this.key(sid)])
      .then(() => cb?.())
      .catch((err: unknown) => cb?.(err));
  }

  override touch(sid: string, sess: session.SessionData, cb?: () => void): void {
    this.db
      .run('UPDATE sesiones SET expira = $1 WHERE sid = $2', [this.expiresAt(sess), this.key(sid)])
      .then(() => cb?.())
      .catch(() => cb?.());
  }
}
