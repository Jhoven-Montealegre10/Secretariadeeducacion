/** Formularios públicos de PQRSD (radicación y consulta), validados con esquemas Zod. */
import { Controller, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { PqrsdService, TIPOS_IDENTIFICACION, TIPOS_PQRSD } from '../../application/citizen.services';
import type { AppRequest } from '../http/http.types';
import { WebRoute } from '../http/route-spec';
import { noStore } from '../http/security/headers';
import { save } from '../http/session/session.helpers';

function details(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ||= i.message;
  return out;
}

const fileSchema = z.object({
  tipo: z.enum(TIPOS_PQRSD as unknown as [string, ...string[]], { message: 'Seleccione un tipo de solicitud válido.' }),
  nombre: z.string().trim().min(3, 'Nombre completo debe tener al menos 3 caracteres.').max(120, 'Nombre completo admite máximo 120 caracteres.'),
  tipoDocumento: z.enum(TIPOS_IDENTIFICACION as unknown as [string, ...string[]], { message: 'Seleccione un tipo de documento válido.' }),
  documento: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,20}$/, 'Número de documento debe tener entre 4 y 20 letras o números, sin puntos ni espacios.'),
  email: z.string().trim().toLowerCase().email('Correo electrónico no es un correo válido.').max(254),
  telefono: z
    .string()
    .trim()
    .regex(/^$|^[0-9+()\s-]{7,20}$/, 'Teléfono no es válido.')
    .default(''),
  asunto: z.string().trim().min(5, 'Asunto debe tener al menos 5 caracteres.').max(150),
  mensaje: z.string().trim().min(20, 'Descripción debe tener al menos 20 caracteres.').max(5000),
  acepto: z.literal('on', { message: 'Debe aceptar la política de tratamiento de datos.' }),
});
const lookupSchema = z.object({
  radicado: z
    .string()
    .trim()
    .regex(/^SEM-\d{4}-\d{8}$/, 'Radicado debe tener el formato SEM-AAAA-00000000.'),
  documento: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,20}$/, 'Número de documento no es válido.'),
});

@Controller()
export class PqrsdWebController {
  constructor(private readonly pqrsd: PqrsdService) {}

  private render(res: Response, extra: Record<string, unknown> = {}, status = 200): void {
    noStore(res);
    res.status(status).render('pages/atencion', {
      title: 'Atención al ciudadano',
      nav: 'atencion',
      tipos: this.pqrsd.TIPOS,
      tiposDocumento: this.pqrsd.TIPOS_DOCUMENTO,
      form: {},
      errors: {},
      consulta: {},
      consultaErrors: {},
      resultado: null,
      ...extra,
    });
  }

  @WebRoute('get', '/atencion', { auth: 'public' })
  index(@Res() res: Response) {
    res.locals.trackView = '/atencion';
    this.render(res);
  }

  @WebRoute('post', '/atencion/pqrsd', { auth: 'public', rateLimit: 'pqrsd', status: 303 })
  async file(@Req() req: AppRequest, @Res() res: Response) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.sitio_web) return res.redirect(303, '/atencion'); // campo trampa anti-robots
    const input: Record<string, unknown> = { ...body, tipoDocumento: body.tipo_documento };
    const parsed = fileSchema.safeParse(input);
    if (!parsed.success) {
      const { documento: _omit, _csrf: _token, ...safe } = input; // nunca se devuelve el documento ni el token
      return this.render(res, { form: safe, errors: details(parsed.error) }, 422);
    }
    req.session.ultimoRadicado = await this.pqrsd.file(parsed.data);
    await save(req);
    res.redirect(303, '/atencion/pqrsd/confirmacion');
  }

  @WebRoute('get', '/atencion/pqrsd/confirmacion', { auth: 'public' })
  async confirmation(@Req() req: AppRequest, @Res() res: Response) {
    noStore(res);
    const radicado = req.session.ultimoRadicado;
    if (!radicado) return res.redirect('/atencion');
    delete req.session.ultimoRadicado;
    res.render('pages/pqrsd-confirmacion', { title: 'Solicitud radicada', nav: 'atencion', radicado });
  }

  @WebRoute('post', '/atencion/consulta', { auth: 'public', rateLimit: 'consulta', status: 200 })
  async lookup(@Req() req: AppRequest, @Res() res: Response) {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const parsed = lookupSchema.safeParse(body);
    if (!parsed.success)
      return this.render(res, { consulta: { radicado: String(body.radicado ?? '').slice(0, 20) }, consultaErrors: details(parsed.error) }, 422);
    const resultado = await this.pqrsd.lookup(parsed.data.radicado, parsed.data.documento);
    if (!resultado)
      return this.render(
        res,
        { consulta: { radicado: parsed.data.radicado }, consultaErrors: { general: 'No encontramos una solicitud con esos datos.' } },
        404,
      );
    this.render(res, { resultado });
  }
}
