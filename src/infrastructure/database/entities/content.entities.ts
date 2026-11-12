/** Multimedia, noticias, páginas, sliders, normatividad, instituciones y PQRSD. */
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt, UpdatedAt } from './common';
import { UsuarioEntity } from './identity.entities';

@Entity('medios')
@Index('ix_medios_nombre_trgm', { synchronize: false })
@Index('ix_medios_tipo_fecha', ['tipo', 'creadoEn'])
@Index('ix_medios_miniatura', ['miniatura'])
@Check('ck_medios_tipo', `tipo IN ('imagen','audio')`)
@Check('ck_medios_visibilidad', `visibilidad IN ('publica','privada')`)
export class MedioEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Column('text') tipo!: 'imagen' | 'audio';
  @Column('text') mime!: string;
  @Column('text') extension!: string;
  @Index('ux_medios_archivo', { unique: true }) @Column('text') archivo!: string;
  @Column('text', { nullable: true }) miniatura!: string | null;
  @Column('text', { name: 'nombre_visible' }) nombreVisible!: string;
  @Column('text', { name: 'nombre_original' }) nombreOriginal!: string;
  @Column('integer') tamano!: number;
  @Column('integer', { nullable: true }) ancho!: number | null;
  @Column('integer', { nullable: true }) alto!: number | null;
  @Column('text', { name: 'texto_alternativo', default: '' }) textoAlternativo!: string;
  @Column('text', { default: '' }) descripcion!: string;
  @Column('text', { default: 'privada' }) visibilidad!: 'publica' | 'privada';
  @Column('integer', { name: 'subido_por', nullable: true }) subidoPor!: number | null;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'subido_por' }) subidoPorUsuario?: UsuarioEntity;
  @Column('integer', { name: 'actualizado_por', nullable: true }) actualizadoPor!: number | null;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'actualizado_por' }) actualizadoPorUsuario?: UsuarioEntity;
  @Column('integer', { default: 1 }) version!: number;
  @CreatedAt() creadoEn!: Date;
  @UpdatedAt() actualizadoEn!: Date;
}

@Entity('medios_usos')
@Index('ix_medios_usos_publicado', { synchronize: false })
@Index('ix_medios_usos_entidad', ['entidad', 'entidadId'])
@Check('ck_medios_usos_entidad', `entidad IN ('pagina','noticia','diapositiva')`)
export class MedioUsoEntity {
  @PrimaryColumn('integer', { name: 'medio_id' }) medioId!: number;
  @ManyToOne(() => MedioEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'medio_id' }) medio?: MedioEntity;
  @PrimaryColumn('text') entidad!: 'pagina' | 'noticia' | 'diapositiva';
  @PrimaryColumn('integer', { name: 'entidad_id' }) entidadId!: number;
  @Column('boolean', { default: false }) publicado!: boolean;
}

@Entity('noticias')
@Index('ix_noticias_titulo_trgm', { synchronize: false })
@Index('ix_noticias_resumen_trgm', { synchronize: false })
@Index('ix_noticias_imagen', { synchronize: false })
@Index('ix_noticias_estado_fecha', ['estado', 'fechaPublicacion', 'id'])
@Check('ck_noticias_estado', `estado IN ('borrador','publicada')`)
export class NoticiaEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Index('ux_noticias_slug', { unique: true }) @Column('text') slug!: string;
  @Column('text') titulo!: string;
  @Column('text') resumen!: string;
  @Column('text') contenido!: string;
  @Column('text') categoria!: string;
  @Column('text', { default: 'borrador' }) estado!: 'borrador' | 'publicada';
  @Column('date', { name: 'fecha_publicacion' }) fechaPublicacion!: string;
  @Column('integer', { name: 'imagen_id', nullable: true }) imagenId!: number | null;
  @ManyToOne(() => MedioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'imagen_id' }) imagen?: MedioEntity;
  @Column('integer', { name: 'creado_por', nullable: true }) creadoPor!: number | null;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'creado_por' }) creadoPorUsuario?: UsuarioEntity;
  @Column('integer', { name: 'actualizado_por', nullable: true }) actualizadoPor!: number | null;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'actualizado_por' }) actualizadoPorUsuario?: UsuarioEntity;
  @Column('integer', { default: 1 }) version!: number;
  @CreatedAt() creadoEn!: Date;
  @UpdatedAt() actualizadoEn!: Date;
}

@Entity('noticia_fotos')
@Index('ix_noticia_fotos_medio', { synchronize: false })
export class NoticiaFotoEntity {
  @PrimaryColumn('integer', { name: 'noticia_id' }) noticiaId!: number;
  @ManyToOne(() => NoticiaEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'noticia_id' }) noticia?: NoticiaEntity;
  @PrimaryColumn('integer', { name: 'medio_id' }) medioId!: number;
  @ManyToOne(() => MedioEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'medio_id' }) medio?: MedioEntity;
  @Column('integer', { default: 0 }) orden!: number;
}

@Entity('paginas')
@Index('ix_paginas_titulo_trgm', { synchronize: false })
@Index('ix_paginas_estado', ['estado'])
@Check('ck_paginas_estado', `estado IN ('borrador','publicada')`)
export class PaginaEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Index('ux_paginas_slug', { unique: true }) @Column('text') slug!: string;
  @Column('text') titulo!: string;
  @Column('text', { default: '' }) resumen!: string;
  @Column('jsonb', { default: () => `'[]'` }) bloques!: Array<Record<string, unknown>>;
  @Column('text', { default: 'borrador' }) estado!: 'borrador' | 'publicada';
  @Column('boolean', { default: false }) sistema!: boolean;
  @Column('integer', { name: 'creado_por', nullable: true }) creadoPor!: number | null;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'creado_por' }) creadoPorUsuario?: UsuarioEntity;
  @Column('integer', { name: 'actualizado_por', nullable: true }) actualizadoPor!: number | null;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'actualizado_por' }) actualizadoPorUsuario?: UsuarioEntity;
  @Column('timestamptz', { name: 'publicada_en', nullable: true }) publicadaEn!: Date | null;
  @Column('integer', { default: 1 }) version!: number;
  @CreatedAt() creadoEn!: Date;
  @UpdatedAt() actualizadoEn!: Date;
}

@Entity('sliders')
export class SliderEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Column('text') nombre!: string;
  @Index('ux_sliders_ubicacion', { unique: true }) @Column('text') ubicacion!: string;
  @Column('boolean', { default: true }) activo!: boolean;
  @Column('integer', { name: 'creado_por', nullable: true }) creadoPor!: number | null;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'creado_por' }) creadoPorUsuario?: UsuarioEntity;
  @Column('integer', { name: 'actualizado_por', nullable: true }) actualizadoPor!: number | null;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'actualizado_por' }) actualizadoPorUsuario?: UsuarioEntity;
  @Column('integer', { default: 1 }) version!: number;
  @CreatedAt() creadoEn!: Date;
  @UpdatedAt() actualizadoEn!: Date;
}

@Entity('diapositivas')
@Index('ix_diapositivas_medio', { synchronize: false })
@Index('ix_diapositivas_slider_orden', ['sliderId', 'orden'])
export class DiapositivaEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Column('integer', { name: 'slider_id' }) sliderId!: number;
  @ManyToOne(() => SliderEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'slider_id' }) slider?: SliderEntity;
  @Column('integer', { name: 'medio_id', nullable: true }) medioId!: number | null;
  @ManyToOne(() => MedioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'medio_id' }) medio?: MedioEntity;
  @Column('text', { default: '' }) titulo!: string;
  @Column('text', { default: '' }) texto!: string;
  @Column('text', { default: '' }) enlace!: string;
  @Column('text', { name: 'texto_enlace', default: '' }) textoEnlace!: string;
  @Column('integer', { default: 0 }) orden!: number;
  @Column('boolean', { default: true }) activa!: boolean;
  @CreatedAt() creadoEn!: Date;
  @UpdatedAt() actualizadoEn!: Date;
}

@Entity('documentos')
@Index('ix_documentos_tipo', ['tipo', 'anio', 'fecha'])
@Check('ck_documentos_tipo', `tipo IN ('circular','resolucion','decreto','acuerdo')`)
export class DocumentoEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Column('text') tipo!: 'circular' | 'resolucion' | 'decreto' | 'acuerdo';
  @Column('text') numero!: string;
  @Column('integer') anio!: number;
  @Column('date') fecha!: string;
  @Column('text') asunto!: string;
  @Index('ux_documentos_archivo', { unique: true }) @Column('text') archivo!: string;
  @Column('text', { name: 'nombre_original' }) nombreOriginal!: string;
  @Column('integer') tamano!: number;
  @Column('integer', { name: 'autor_id', nullable: true }) autorId!: number | null;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'SET NULL' }) @JoinColumn({ name: 'autor_id' }) autor?: UsuarioEntity;
  @CreatedAt() creadoEn!: Date;
}

@Entity('instituciones')
@Check('ck_instituciones_zona', `zona IN ('Urbana','Rural')`)
export class InstitucionEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Index('ux_instituciones_nombre', { unique: true }) @Column('text') nombre!: string;
  @Column('text') zona!: 'Urbana' | 'Rural';
}

/** Datos personales cifrados (columnas *_enc); documento_hash es un índice ciego HMAC. */
@Entity('pqrsd')
@Index('ix_pqrsd_estado', ['estado'])
@Check('ck_pqrsd_estado', `estado IN ('Radicada','En trámite','Respondida','Cerrada')`)
export class PqrsdEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Index('ux_pqrsd_radicado', { unique: true }) @Column('text') radicado!: string;
  @Column('text') tipo!: string;
  @Column('text', { default: 'Radicada' }) estado!: string;
  @Column('text', { name: 'tipo_documento' }) tipoDocumento!: string;
  @Column('text', { name: 'documento_hash' }) documentoHash!: string;
  @Column('text', { name: 'documento_enc' }) documentoEnc!: string;
  @Column('text', { name: 'nombre_enc' }) nombreEnc!: string;
  @Column('text', { name: 'email_enc' }) emailEnc!: string;
  @Column('text', { name: 'telefono_enc', nullable: true }) telefonoEnc!: string | null;
  @Column('text', { name: 'asunto_enc' }) asuntoEnc!: string;
  @Column('text', { name: 'mensaje_enc' }) mensajeEnc!: string;
  @Column('text', { name: 'respuesta_enc', nullable: true }) respuestaEnc!: string | null;
  @CreatedAt() creadoEn!: Date;
  @UpdatedAt() actualizadoEn!: Date;
}

/** Analítica mínima: sin IP ni User-Agent; visitante = HMAC con sal diaria descartable. */
@Entity('visitas')
@Index('ix_visitas_fecha', ['fecha'])
@Index('ix_visitas_fecha_ruta', ['fecha', 'ruta'])
@Check('ck_visitas_fuente', `fuente IN ('directo','buscador','redes_sociales','otro_sitio','interno','campana')`)
@Check('ck_visitas_dispositivo', `dispositivo IN ('escritorio','movil','tablet','otro')`)
export class VisitaEntity {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'BY DEFAULT' }) id!: string;
  @Column('date') fecha!: string;
  @Column('text') ruta!: string;
  @Column('text') visitante!: string;
  @Column('text') fuente!: string;
  @Column('text', { name: 'referente_dominio', nullable: true }) referenteDominio!: string | null;
  @Column('text') dispositivo!: string;
  @Column('text', { nullable: true }) pais!: string | null;
}

@Entity('sales_estadisticas')
export class SalEstadisticaEntity {
  @PrimaryColumn('date') fecha!: string;
  @Column('text') sal!: string;
}
