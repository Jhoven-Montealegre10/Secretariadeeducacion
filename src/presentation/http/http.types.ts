/** Tipos compartidos por la capa HTTP (petición enriquecida y datos de sesión del servidor). */
import type { Request, Response } from 'express';
import type { Actor } from '../../domain/permissions';

declare module 'express-session' {
  interface SessionData {
    /** Sesión completa: contraseña + segundo factor verificados. */
    auth?: { userId: number; authVersion: number; loginAt: number };
    /** Primer factor verificado, segundo pendiente. */
    pending?: { userId: number; authVersion: number; siguientePaso: 'mfa' | 'configurar_mfa'; expiresAt: number; intentos: number };
    /** Secreto TOTP en configuración (solo en el servidor, nunca en el navegador). */
    mfaSetup?: { secret: string; expiresAt: number };
    csrf?: string;
    reauthAt?: number;
    ultimoRadicado?: string;
  }
}

export interface ValidInput {
  params?: unknown;
  query?: unknown;
  body?: unknown;
}

export interface UploadedFiles {
  file?: Express.Multer.File;
  files?: Express.Multer.File[];
}

export type AppRequest = Request & {
  id: string;
  actor: Actor | null;
  valid: ValidInput;
  /** Ruta normalizada (patrón, sin parámetros) para métricas. */
  routePattern?: string;
} & UploadedFiles;

export type AppResponse = Response;
