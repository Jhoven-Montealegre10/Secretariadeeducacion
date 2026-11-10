"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SalEstadisticaEntity = exports.VisitaEntity = exports.PqrsdEntity = exports.InstitucionEntity = exports.DocumentoEntity = exports.DiapositivaEntity = exports.SliderEntity = exports.PaginaEntity = exports.NoticiaFotoEntity = exports.NoticiaEntity = exports.MedioUsoEntity = exports.MedioEntity = void 0;
/** Multimedia, noticias, páginas, sliders, normatividad, instituciones y PQRSD. */
const typeorm_1 = require("typeorm");
const common_1 = require("./common");
const identity_entities_1 = require("./identity.entities");
let MedioEntity = class MedioEntity {
    id;
    tipo;
    mime;
    extension;
    archivo;
    miniatura;
    nombreVisible;
    nombreOriginal;
    tamano;
    ancho;
    alto;
    textoAlternativo;
    descripcion;
    visibilidad;
    subidoPor;
    subidoPorUsuario;
    actualizadoPor;
    actualizadoPorUsuario;
    version;
    creadoEn;
    actualizadoEn;
};
exports.MedioEntity = MedioEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], MedioEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], MedioEntity.prototype, "tipo", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], MedioEntity.prototype, "mime", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], MedioEntity.prototype, "extension", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_medios_archivo', { unique: true }),
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], MedioEntity.prototype, "archivo", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", Object)
], MedioEntity.prototype, "miniatura", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'nombre_visible' }),
    __metadata("design:type", String)
], MedioEntity.prototype, "nombreVisible", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'nombre_original' }),
    __metadata("design:type", String)
], MedioEntity.prototype, "nombreOriginal", void 0);
__decorate([
    (0, typeorm_1.Column)('integer'),
    __metadata("design:type", Number)
], MedioEntity.prototype, "tamano", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { nullable: true }),
    __metadata("design:type", Object)
], MedioEntity.prototype, "ancho", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { nullable: true }),
    __metadata("design:type", Object)
], MedioEntity.prototype, "alto", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'texto_alternativo', default: '' }),
    __metadata("design:type", String)
], MedioEntity.prototype, "textoAlternativo", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: '' }),
    __metadata("design:type", String)
], MedioEntity.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: 'privada' }),
    __metadata("design:type", String)
], MedioEntity.prototype, "visibilidad", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'subido_por', nullable: true }),
    __metadata("design:type", Object)
], MedioEntity.prototype, "subidoPor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => identity_entities_1.UsuarioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'subido_por' }),
    __metadata("design:type", identity_entities_1.UsuarioEntity)
], MedioEntity.prototype, "subidoPorUsuario", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'actualizado_por', nullable: true }),
    __metadata("design:type", Object)
], MedioEntity.prototype, "actualizadoPor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => identity_entities_1.UsuarioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'actualizado_por' }),
    __metadata("design:type", identity_entities_1.UsuarioEntity)
], MedioEntity.prototype, "actualizadoPorUsuario", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 1 }),
    __metadata("design:type", Number)
], MedioEntity.prototype, "version", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], MedioEntity.prototype, "creadoEn", void 0);
__decorate([
    (0, common_1.UpdatedAt)(),
    __metadata("design:type", Date)
], MedioEntity.prototype, "actualizadoEn", void 0);
exports.MedioEntity = MedioEntity = __decorate([
    (0, typeorm_1.Entity)('medios'),
    (0, typeorm_1.Index)('ix_medios_nombre_trgm', { synchronize: false }),
    (0, typeorm_1.Index)('ix_medios_tipo_fecha', ['tipo', 'creadoEn']),
    (0, typeorm_1.Index)('ix_medios_miniatura', ['miniatura']),
    (0, typeorm_1.Check)('ck_medios_tipo', `tipo IN ('imagen','audio')`),
    (0, typeorm_1.Check)('ck_medios_visibilidad', `visibilidad IN ('publica','privada')`)
], MedioEntity);
let MedioUsoEntity = class MedioUsoEntity {
    medioId;
    medio;
    entidad;
    entidadId;
    publicado;
};
exports.MedioUsoEntity = MedioUsoEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)('integer', { name: 'medio_id' }),
    __metadata("design:type", Number)
], MedioUsoEntity.prototype, "medioId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => MedioEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'medio_id' }),
    __metadata("design:type", MedioEntity)
], MedioUsoEntity.prototype, "medio", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)('text'),
    __metadata("design:type", String)
], MedioUsoEntity.prototype, "entidad", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)('integer', { name: 'entidad_id' }),
    __metadata("design:type", Number)
], MedioUsoEntity.prototype, "entidadId", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: false }),
    __metadata("design:type", Boolean)
], MedioUsoEntity.prototype, "publicado", void 0);
exports.MedioUsoEntity = MedioUsoEntity = __decorate([
    (0, typeorm_1.Entity)('medios_usos'),
    (0, typeorm_1.Index)('ix_medios_usos_publicado', { synchronize: false }),
    (0, typeorm_1.Index)('ix_medios_usos_entidad', ['entidad', 'entidadId']),
    (0, typeorm_1.Check)('ck_medios_usos_entidad', `entidad IN ('pagina','noticia','diapositiva')`)
], MedioUsoEntity);
let NoticiaEntity = class NoticiaEntity {
    id;
    slug;
    titulo;
    resumen;
    contenido;
    categoria;
    estado;
    fechaPublicacion;
    imagenId;
    imagen;
    creadoPor;
    creadoPorUsuario;
    actualizadoPor;
    actualizadoPorUsuario;
    version;
    creadoEn;
    actualizadoEn;
};
exports.NoticiaEntity = NoticiaEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], NoticiaEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_noticias_slug', { unique: true }),
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], NoticiaEntity.prototype, "slug", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], NoticiaEntity.prototype, "titulo", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], NoticiaEntity.prototype, "resumen", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], NoticiaEntity.prototype, "contenido", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], NoticiaEntity.prototype, "categoria", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: 'borrador' }),
    __metadata("design:type", String)
], NoticiaEntity.prototype, "estado", void 0);
__decorate([
    (0, typeorm_1.Column)('date', { name: 'fecha_publicacion' }),
    __metadata("design:type", String)
], NoticiaEntity.prototype, "fechaPublicacion", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'imagen_id', nullable: true }),
    __metadata("design:type", Object)
], NoticiaEntity.prototype, "imagenId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => MedioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'imagen_id' }),
    __metadata("design:type", MedioEntity)
], NoticiaEntity.prototype, "imagen", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'creado_por', nullable: true }),
    __metadata("design:type", Object)
], NoticiaEntity.prototype, "creadoPor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => identity_entities_1.UsuarioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'creado_por' }),
    __metadata("design:type", identity_entities_1.UsuarioEntity)
], NoticiaEntity.prototype, "creadoPorUsuario", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'actualizado_por', nullable: true }),
    __metadata("design:type", Object)
], NoticiaEntity.prototype, "actualizadoPor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => identity_entities_1.UsuarioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'actualizado_por' }),
    __metadata("design:type", identity_entities_1.UsuarioEntity)
], NoticiaEntity.prototype, "actualizadoPorUsuario", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 1 }),
    __metadata("design:type", Number)
], NoticiaEntity.prototype, "version", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], NoticiaEntity.prototype, "creadoEn", void 0);
__decorate([
    (0, common_1.UpdatedAt)(),
    __metadata("design:type", Date)
], NoticiaEntity.prototype, "actualizadoEn", void 0);
exports.NoticiaEntity = NoticiaEntity = __decorate([
    (0, typeorm_1.Entity)('noticias'),
    (0, typeorm_1.Index)('ix_noticias_titulo_trgm', { synchronize: false }),
    (0, typeorm_1.Index)('ix_noticias_resumen_trgm', { synchronize: false }),
    (0, typeorm_1.Index)('ix_noticias_imagen', { synchronize: false }),
    (0, typeorm_1.Index)('ix_noticias_estado_fecha', ['estado', 'fechaPublicacion', 'id']),
    (0, typeorm_1.Check)('ck_noticias_estado', `estado IN ('borrador','publicada')`)
], NoticiaEntity);
let NoticiaFotoEntity = class NoticiaFotoEntity {
    noticiaId;
    noticia;
    medioId;
    medio;
    orden;
};
exports.NoticiaFotoEntity = NoticiaFotoEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)('integer', { name: 'noticia_id' }),
    __metadata("design:type", Number)
], NoticiaFotoEntity.prototype, "noticiaId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => NoticiaEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'noticia_id' }),
    __metadata("design:type", NoticiaEntity)
], NoticiaFotoEntity.prototype, "noticia", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)('integer', { name: 'medio_id' }),
    __metadata("design:type", Number)
], NoticiaFotoEntity.prototype, "medioId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => MedioEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'medio_id' }),
    __metadata("design:type", MedioEntity)
], NoticiaFotoEntity.prototype, "medio", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 0 }),
    __metadata("design:type", Number)
], NoticiaFotoEntity.prototype, "orden", void 0);
exports.NoticiaFotoEntity = NoticiaFotoEntity = __decorate([
    (0, typeorm_1.Entity)('noticia_fotos'),
    (0, typeorm_1.Index)('ix_noticia_fotos_medio', { synchronize: false })
], NoticiaFotoEntity);
let PaginaEntity = class PaginaEntity {
    id;
    slug;
    titulo;
    resumen;
    bloques;
    estado;
    sistema;
    creadoPor;
    creadoPorUsuario;
    actualizadoPor;
    actualizadoPorUsuario;
    publicadaEn;
    version;
    creadoEn;
    actualizadoEn;
};
exports.PaginaEntity = PaginaEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], PaginaEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_paginas_slug', { unique: true }),
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], PaginaEntity.prototype, "slug", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], PaginaEntity.prototype, "titulo", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: '' }),
    __metadata("design:type", String)
], PaginaEntity.prototype, "resumen", void 0);
__decorate([
    (0, typeorm_1.Column)('jsonb', { default: () => `'[]'` }),
    __metadata("design:type", Array)
], PaginaEntity.prototype, "bloques", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: 'borrador' }),
    __metadata("design:type", String)
], PaginaEntity.prototype, "estado", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: false }),
    __metadata("design:type", Boolean)
], PaginaEntity.prototype, "sistema", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'creado_por', nullable: true }),
    __metadata("design:type", Object)
], PaginaEntity.prototype, "creadoPor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => identity_entities_1.UsuarioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'creado_por' }),
    __metadata("design:type", identity_entities_1.UsuarioEntity)
], PaginaEntity.prototype, "creadoPorUsuario", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'actualizado_por', nullable: true }),
    __metadata("design:type", Object)
], PaginaEntity.prototype, "actualizadoPor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => identity_entities_1.UsuarioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'actualizado_por' }),
    __metadata("design:type", identity_entities_1.UsuarioEntity)
], PaginaEntity.prototype, "actualizadoPorUsuario", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { name: 'publicada_en', nullable: true }),
    __metadata("design:type", Object)
], PaginaEntity.prototype, "publicadaEn", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 1 }),
    __metadata("design:type", Number)
], PaginaEntity.prototype, "version", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], PaginaEntity.prototype, "creadoEn", void 0);
__decorate([
    (0, common_1.UpdatedAt)(),
    __metadata("design:type", Date)
], PaginaEntity.prototype, "actualizadoEn", void 0);
exports.PaginaEntity = PaginaEntity = __decorate([
    (0, typeorm_1.Entity)('paginas'),
    (0, typeorm_1.Index)('ix_paginas_titulo_trgm', { synchronize: false }),
    (0, typeorm_1.Index)('ix_paginas_estado', ['estado']),
    (0, typeorm_1.Check)('ck_paginas_estado', `estado IN ('borrador','publicada')`)
], PaginaEntity);
let SliderEntity = class SliderEntity {
    id;
    nombre;
    ubicacion;
    activo;
    creadoPor;
    creadoPorUsuario;
    actualizadoPor;
    actualizadoPorUsuario;
    version;
    creadoEn;
    actualizadoEn;
};
exports.SliderEntity = SliderEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], SliderEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], SliderEntity.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_sliders_ubicacion', { unique: true }),
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], SliderEntity.prototype, "ubicacion", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: true }),
    __metadata("design:type", Boolean)
], SliderEntity.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'creado_por', nullable: true }),
    __metadata("design:type", Object)
], SliderEntity.prototype, "creadoPor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => identity_entities_1.UsuarioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'creado_por' }),
    __metadata("design:type", identity_entities_1.UsuarioEntity)
], SliderEntity.prototype, "creadoPorUsuario", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'actualizado_por', nullable: true }),
    __metadata("design:type", Object)
], SliderEntity.prototype, "actualizadoPor", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => identity_entities_1.UsuarioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'actualizado_por' }),
    __metadata("design:type", identity_entities_1.UsuarioEntity)
], SliderEntity.prototype, "actualizadoPorUsuario", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 1 }),
    __metadata("design:type", Number)
], SliderEntity.prototype, "version", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], SliderEntity.prototype, "creadoEn", void 0);
__decorate([
    (0, common_1.UpdatedAt)(),
    __metadata("design:type", Date)
], SliderEntity.prototype, "actualizadoEn", void 0);
exports.SliderEntity = SliderEntity = __decorate([
    (0, typeorm_1.Entity)('sliders')
], SliderEntity);
let DiapositivaEntity = class DiapositivaEntity {
    id;
    sliderId;
    slider;
    medioId;
    medio;
    titulo;
    texto;
    enlace;
    textoEnlace;
    orden;
    activa;
    creadoEn;
    actualizadoEn;
};
exports.DiapositivaEntity = DiapositivaEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], DiapositivaEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'slider_id' }),
    __metadata("design:type", Number)
], DiapositivaEntity.prototype, "sliderId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => SliderEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'slider_id' }),
    __metadata("design:type", SliderEntity)
], DiapositivaEntity.prototype, "slider", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'medio_id', nullable: true }),
    __metadata("design:type", Object)
], DiapositivaEntity.prototype, "medioId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => MedioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'medio_id' }),
    __metadata("design:type", MedioEntity)
], DiapositivaEntity.prototype, "medio", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: '' }),
    __metadata("design:type", String)
], DiapositivaEntity.prototype, "titulo", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: '' }),
    __metadata("design:type", String)
], DiapositivaEntity.prototype, "texto", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: '' }),
    __metadata("design:type", String)
], DiapositivaEntity.prototype, "enlace", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'texto_enlace', default: '' }),
    __metadata("design:type", String)
], DiapositivaEntity.prototype, "textoEnlace", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 0 }),
    __metadata("design:type", Number)
], DiapositivaEntity.prototype, "orden", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: true }),
    __metadata("design:type", Boolean)
], DiapositivaEntity.prototype, "activa", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], DiapositivaEntity.prototype, "creadoEn", void 0);
__decorate([
    (0, common_1.UpdatedAt)(),
    __metadata("design:type", Date)
], DiapositivaEntity.prototype, "actualizadoEn", void 0);
exports.DiapositivaEntity = DiapositivaEntity = __decorate([
    (0, typeorm_1.Entity)('diapositivas'),
    (0, typeorm_1.Index)('ix_diapositivas_medio', { synchronize: false }),
    (0, typeorm_1.Index)('ix_diapositivas_slider_orden', ['sliderId', 'orden'])
], DiapositivaEntity);
let DocumentoEntity = class DocumentoEntity {
    id;
    tipo;
    numero;
    anio;
    fecha;
    asunto;
    archivo;
    nombreOriginal;
    tamano;
    autorId;
    autor;
    creadoEn;
};
exports.DocumentoEntity = DocumentoEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], DocumentoEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], DocumentoEntity.prototype, "tipo", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], DocumentoEntity.prototype, "numero", void 0);
__decorate([
    (0, typeorm_1.Column)('integer'),
    __metadata("design:type", Number)
], DocumentoEntity.prototype, "anio", void 0);
__decorate([
    (0, typeorm_1.Column)('date'),
    __metadata("design:type", String)
], DocumentoEntity.prototype, "fecha", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], DocumentoEntity.prototype, "asunto", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_documentos_archivo', { unique: true }),
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], DocumentoEntity.prototype, "archivo", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'nombre_original' }),
    __metadata("design:type", String)
], DocumentoEntity.prototype, "nombreOriginal", void 0);
__decorate([
    (0, typeorm_1.Column)('integer'),
    __metadata("design:type", Number)
], DocumentoEntity.prototype, "tamano", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'autor_id', nullable: true }),
    __metadata("design:type", Object)
], DocumentoEntity.prototype, "autorId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => identity_entities_1.UsuarioEntity, { onDelete: 'SET NULL' }),
    (0, typeorm_1.JoinColumn)({ name: 'autor_id' }),
    __metadata("design:type", identity_entities_1.UsuarioEntity)
], DocumentoEntity.prototype, "autor", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], DocumentoEntity.prototype, "creadoEn", void 0);
exports.DocumentoEntity = DocumentoEntity = __decorate([
    (0, typeorm_1.Entity)('documentos'),
    (0, typeorm_1.Index)('ix_documentos_tipo', ['tipo', 'anio', 'fecha']),
    (0, typeorm_1.Check)('ck_documentos_tipo', `tipo IN ('circular','resolucion','decreto','acuerdo')`)
], DocumentoEntity);
let InstitucionEntity = class InstitucionEntity {
    id;
    nombre;
    zona;
};
exports.InstitucionEntity = InstitucionEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], InstitucionEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_instituciones_nombre', { unique: true }),
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], InstitucionEntity.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], InstitucionEntity.prototype, "zona", void 0);
exports.InstitucionEntity = InstitucionEntity = __decorate([
    (0, typeorm_1.Entity)('instituciones'),
    (0, typeorm_1.Check)('ck_instituciones_zona', `zona IN ('Urbana','Rural')`)
], InstitucionEntity);
/** Datos personales cifrados (columnas *_enc); documento_hash es un índice ciego HMAC. */
let PqrsdEntity = class PqrsdEntity {
    id;
    radicado;
    tipo;
    estado;
    tipoDocumento;
    documentoHash;
    documentoEnc;
    nombreEnc;
    emailEnc;
    telefonoEnc;
    asuntoEnc;
    mensajeEnc;
    respuestaEnc;
    creadoEn;
    actualizadoEn;
};
exports.PqrsdEntity = PqrsdEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], PqrsdEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_pqrsd_radicado', { unique: true }),
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "radicado", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "tipo", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: 'Radicada' }),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "estado", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'tipo_documento' }),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "tipoDocumento", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'documento_hash' }),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "documentoHash", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'documento_enc' }),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "documentoEnc", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'nombre_enc' }),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "nombreEnc", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'email_enc' }),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "emailEnc", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'telefono_enc', nullable: true }),
    __metadata("design:type", Object)
], PqrsdEntity.prototype, "telefonoEnc", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'asunto_enc' }),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "asuntoEnc", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'mensaje_enc' }),
    __metadata("design:type", String)
], PqrsdEntity.prototype, "mensajeEnc", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'respuesta_enc', nullable: true }),
    __metadata("design:type", Object)
], PqrsdEntity.prototype, "respuestaEnc", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], PqrsdEntity.prototype, "creadoEn", void 0);
__decorate([
    (0, common_1.UpdatedAt)(),
    __metadata("design:type", Date)
], PqrsdEntity.prototype, "actualizadoEn", void 0);
exports.PqrsdEntity = PqrsdEntity = __decorate([
    (0, typeorm_1.Entity)('pqrsd'),
    (0, typeorm_1.Index)('ix_pqrsd_estado', ['estado']),
    (0, typeorm_1.Check)('ck_pqrsd_estado', `estado IN ('Radicada','En trámite','Respondida','Cerrada')`)
], PqrsdEntity);
/** Analítica mínima: sin IP ni User-Agent; visitante = HMAC con sal diaria descartable. */
let VisitaEntity = class VisitaEntity {
    id;
    fecha;
    ruta;
    visitante;
    fuente;
    referenteDominio;
    dispositivo;
    pais;
};
exports.VisitaEntity = VisitaEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { type: 'bigint', generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", String)
], VisitaEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('date'),
    __metadata("design:type", String)
], VisitaEntity.prototype, "fecha", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], VisitaEntity.prototype, "ruta", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], VisitaEntity.prototype, "visitante", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], VisitaEntity.prototype, "fuente", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'referente_dominio', nullable: true }),
    __metadata("design:type", Object)
], VisitaEntity.prototype, "referenteDominio", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], VisitaEntity.prototype, "dispositivo", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", Object)
], VisitaEntity.prototype, "pais", void 0);
exports.VisitaEntity = VisitaEntity = __decorate([
    (0, typeorm_1.Entity)('visitas'),
    (0, typeorm_1.Index)('ix_visitas_fecha', ['fecha']),
    (0, typeorm_1.Index)('ix_visitas_fecha_ruta', ['fecha', 'ruta']),
    (0, typeorm_1.Check)('ck_visitas_fuente', `fuente IN ('directo','buscador','redes_sociales','otro_sitio','interno','campana')`),
    (0, typeorm_1.Check)('ck_visitas_dispositivo', `dispositivo IN ('escritorio','movil','tablet','otro')`)
], VisitaEntity);
let SalEstadisticaEntity = class SalEstadisticaEntity {
    fecha;
    sal;
};
exports.SalEstadisticaEntity = SalEstadisticaEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)('date'),
    __metadata("design:type", String)
], SalEstadisticaEntity.prototype, "fecha", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], SalEstadisticaEntity.prototype, "sal", void 0);
exports.SalEstadisticaEntity = SalEstadisticaEntity = __decorate([
    (0, typeorm_1.Entity)('sales_estadisticas')
], SalEstadisticaEntity);
//# sourceMappingURL=content.entities.js.map