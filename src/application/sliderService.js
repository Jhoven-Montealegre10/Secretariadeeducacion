'use strict';
/**
 * Sliders por ubicación ('inicio' o 'pagina:<slug>') con diapositivas ordenadas.
 * Editar y agregar exige sliders.update; eliminar (slider o diapositiva) exige sliders.delete.
 */
const { authorize } = require('./authorization');
const { ConflictError, NotFoundError, ValidationError } = require('../domain/errors');

// eslint-disable-next-line security/detect-unsafe-regex -- grupos sin ambigüedad (ver SLUG_RE)
const UBICACION_RE = /^(inicio|pagina:[a-z0-9]+(?:-[a-z0-9]+)*)$/;

function createSliderService({ sliderRepository, mediaService, audit, transaction }) {
  function requireSlider(id) {
    const s = sliderRepository.findById(id);
    if (!s) throw new NotFoundError('El slider no existe.');
    return s;
  }

  function requireSlide(sliderId, slideId) {
    const d = sliderRepository.findSlide(sliderId, slideId);
    if (!d) throw new NotFoundError('La diapositiva no existe en este slider.');
    return d;
  }

  function validateLocation(ubicacion, exceptId) {
    if (!UBICACION_RE.test(ubicacion))
      throw new ValidationError('Ubicación no válida. Use "inicio" o "pagina:<direccion>".', [{ campo: 'ubicacion', mensaje: 'Formato inválido' }]);
    if (sliderRepository.locationExists(ubicacion, exceptId))
      throw new ConflictError('Ya existe un slider en esa ubicación.', [{ campo: 'ubicacion', mensaje: 'Ocupada' }]);
  }

  /** Recalcula si cada imagen del slider está publicada (slider activo y diapositiva activa). */
  function syncSliderUsages(sliderId) {
    const slider = sliderRepository.findById(sliderId);
    for (const d of slider.diapositivas) mediaService.syncUsages('diapositiva', d.id, [d.medioId], !!slider.activo && !!d.activa);
  }

  return {
    UBICACION_RE,

    list(actor) {
      authorize(actor, 'sliders.read');
      return sliderRepository.list();
    },

    get(actor, id) {
      authorize(actor, 'sliders.read');
      return requireSlider(id);
    },

    create(actor, { nombre, ubicacion, activo = true }, ip) {
      authorize(actor, 'sliders.create');
      validateLocation(ubicacion, 0);
      const id = transaction(() => {
        const newId = sliderRepository.create({ nombre: nombre.trim(), ubicacion, activo }, actor.id);
        audit.record({ actor, accion: 'slider_crear', recurso: 'slider', recursoId: newId, detalle: ubicacion, ip });
        return newId;
      });
      return sliderRepository.findById(id);
    },

    update(actor, id, changes, ip) {
      authorize(actor, 'sliders.update');
      const s = requireSlider(id);
      const data = { nombre: (changes.nombre ?? s.nombre).trim(), ubicacion: changes.ubicacion ?? s.ubicacion, activo: changes.activo ?? !!s.activo };
      if (data.ubicacion !== s.ubicacion) validateLocation(data.ubicacion, id);
      transaction(() => {
        sliderRepository.update(id, data, actor.id);
        syncSliderUsages(id);
        audit.record({
          actor,
          accion: 'slider_actualizar',
          recurso: 'slider',
          recursoId: id,
          detalle: `${data.ubicacion}${data.activo ? '' : ' (inactivo)'}`,
          ip,
        });
      });
      return sliderRepository.findById(id);
    },

    remove(actor, id, ip) {
      authorize(actor, 'sliders.delete');
      const s = requireSlider(id);
      transaction(() => {
        for (const slideId of sliderRepository.slideIdsOf(id)) mediaService.clearUsages('diapositiva', slideId);
        sliderRepository.delete(id);
        audit.record({ actor, accion: 'slider_eliminar', recurso: 'slider', recursoId: id, detalle: s.ubicacion, ip });
      });
    },

    addSlide(actor, sliderId, input, ip) {
      authorize(actor, 'sliders.update');
      requireSlider(sliderId);
      mediaService.assertUsable([input.medioId], 'imagen');
      transaction(() => {
        const slideId = sliderRepository.createSlide(sliderId, input);
        syncSliderUsages(sliderId);
        audit.record({ actor, accion: 'diapositiva_crear', recurso: 'slider', recursoId: sliderId, detalle: `diapositiva ${slideId}`, ip });
      });
      return sliderRepository.findById(sliderId);
    },

    updateSlide(actor, sliderId, slideId, input, ip) {
      authorize(actor, 'sliders.update');
      const current = requireSlide(sliderId, slideId);
      const data = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
      mediaService.assertUsable([data.medioId], 'imagen');
      transaction(() => {
        sliderRepository.updateSlide(sliderId, slideId, data);
        syncSliderUsages(sliderId);
        audit.record({ actor, accion: 'diapositiva_actualizar', recurso: 'slider', recursoId: sliderId, detalle: `diapositiva ${slideId}`, ip });
      });
      return sliderRepository.findById(sliderId);
    },

    reorder(actor, sliderId, ids, ip) {
      authorize(actor, 'sliders.update');
      const current = sliderRepository.slideIdsOf(sliderId);
      requireSlider(sliderId);
      if (ids.length !== current.length || !ids.every((id) => current.includes(id))) {
        throw new ValidationError('El orden debe incluir exactamente todas las diapositivas del slider.');
      }
      transaction(() => {
        sliderRepository.reorder(sliderId, ids);
        audit.record({ actor, accion: 'diapositivas_ordenar', recurso: 'slider', recursoId: sliderId, ip });
      });
      return sliderRepository.findById(sliderId);
    },

    removeSlide(actor, sliderId, slideId, ip) {
      authorize(actor, 'sliders.delete');
      requireSlide(sliderId, slideId);
      transaction(() => {
        mediaService.clearUsages('diapositiva', slideId);
        sliderRepository.deleteSlide(sliderId, slideId);
        audit.record({ actor, accion: 'diapositiva_eliminar', recurso: 'slider', recursoId: sliderId, detalle: `diapositiva ${slideId}`, ip });
      });
      return sliderRepository.findById(sliderId);
    },

    /** Sitio y API públicos: slider activo con diapositivas activas y su imagen. */
    getPublic(ubicacion) {
      if (!UBICACION_RE.test(String(ubicacion))) return null;
      const s = sliderRepository.findActiveByLocation(ubicacion);
      if (!s || !s.diapositivas.length) return null;
      const medios = new Map(mediaService.findByIds(s.diapositivas.map((d) => d.medioId)).map((m) => [m.id, m]));
      s.diapositivas = s.diapositivas.filter((d) => medios.has(d.medioId)).map((d) => ({ ...d, medio: medios.get(d.medioId) }));
      return s.diapositivas.length ? s : null;
    },
  };
}

module.exports = { createSliderService, UBICACION_RE };
