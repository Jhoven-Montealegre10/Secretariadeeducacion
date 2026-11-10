'use strict';
/**
 * Biblioteca multimedia (imágenes y audio).
 *  - Valida el tipo real por contenido, la extensión y el tamaño; rechaza SVG y todo lo demás.
 *  - Las imágenes se re-codifican (elimina metadatos y contenido oculto) y se genera miniatura.
 *  - Nombre interno aleatorio separado del nombre visible editable.
 *  - Advierte cuando un archivo está en uso antes de reemplazarlo o eliminarlo.
 *  - Archivos privados por defecto: solo se sirven al público si se marcan públicos
 *    o si los usa un contenido publicado.
 */
const path = require('node:path');
const { authorize } = require('./authorization');
const { ConflictError, NotFoundError, ValidationError, PayloadTooLargeError } = require('../domain/errors');

function createMediaService({ mediaRepository, storage, fileTypeDetector, imageProcessor, malwareScanner, limits, audit, transaction }) {
  function requireMedia(id) {
    const m = mediaRepository.findById(id);
    if (!m) throw new NotFoundError('El archivo no existe.');
    return m;
  }

  /** Valida, analiza y guarda los bytes; devuelve los datos del archivo almacenado. */
  async function ingest(file) {
    const detected = fileTypeDetector.detectMedia(file.buffer, file.originalname);
    if (!detected) {
      throw new ValidationError(
        `"${path.basename(String(file.originalname)).slice(0, 80)}" no es un formato permitido (JPG, PNG, WebP, MP3, OGG o WAV) o su extensión no coincide con su contenido.`,
      );
    }
    const max = detected.tipo === 'imagen' ? limits.maxImageBytes : limits.maxAudioBytes;
    if (file.size > max) throw new PayloadTooLargeError(`El archivo supera el máximo de ${Math.round(max / 1048576)} MB para ${detected.tipo}.`);
    const scan = await malwareScanner.scan(file.buffer);
    if (!scan.limpio) throw new ValidationError('El archivo fue rechazado por el análisis antimalware.');

    let data = file.buffer;
    let thumbnail = null;
    let ancho = null;
    let alto = null;
    if (detected.tipo === 'imagen') {
      try {
        ({ data, thumbnail, ancho, alto } = await imageProcessor.process(file.buffer, detected.mime));
      } catch {
        throw new ValidationError('La imagen está dañada o no se pudo procesar.');
      }
    }
    const archivo = storage.save(storage.newName(detected.extension), data);
    const miniatura = thumbnail ? storage.save(storage.newName('webp', { thumbnail: true }), thumbnail) : null;
    return { ...detected, archivo, miniatura, ancho, alto, tamano: data.length, nombreOriginal: path.basename(String(file.originalname)).slice(0, 200) };
  }

  const discard = (stored) => {
    storage.remove(stored.archivo);
    if (stored.miniatura) storage.remove(stored.miniatura);
  };

  return {
    list(actor, filters) {
      authorize(actor, 'media.read');
      return mediaRepository.list(filters);
    },

    get(actor, id) {
      authorize(actor, 'media.read');
      const m = requireMedia(id);
      return { ...m, usos: mediaRepository.usagesOf(id) };
    },

    async upload(actor, files, meta = {}, ip) {
      authorize(actor, 'media.upload');
      if (!files?.length) throw new ValidationError('Adjunte al menos un archivo.', [{ campo: 'archivos', mensaje: 'Requerido' }]);
      if (files.length > limits.maxFilesPerRequest) throw new ValidationError(`Máximo ${limits.maxFilesPerRequest} archivos por envío.`);
      const stored = [];
      try {
        for (const f of files) stored.push(await ingest(f));
        return transaction(() =>
          stored.map((s) => {
            const nombreVisible = (files.length === 1 && meta.nombreVisible) || s.nombreOriginal.replace(/\.[^.]+$/, '').slice(0, 150) || 'archivo';
            const id = mediaRepository.create({
              ...s,
              nombreVisible,
              textoAlternativo: meta.textoAlternativo ?? '',
              descripcion: meta.descripcion ?? '',
              visibilidad: meta.visibilidad ?? 'privada',
              subidoPor: actor.id,
            });
            audit.record({ actor, accion: 'medio_subir', recurso: 'medio', recursoId: id, detalle: `${s.tipo} ${s.mime}`, ip });
            return mediaRepository.findById(id);
          }),
        );
      } catch (err) {
        stored.forEach(discard);
        throw err;
      }
    },

    update(actor, id, changes, ip) {
      authorize(actor, 'media.update');
      const m = requireMedia(id);
      if (changes.textoAlternativo !== undefined && m.tipo !== 'imagen' && changes.textoAlternativo) {
        throw new ValidationError('El texto alternativo solo aplica a imágenes.');
      }
      mediaRepository.update(id, changes, actor.id);
      audit.record({ actor, accion: 'medio_actualizar', recurso: 'medio', recursoId: id, ip });
      return { ...mediaRepository.findById(id), usos: mediaRepository.usagesOf(id) };
    },

    /** Reemplaza el contenido manteniendo el ID: todos los contenidos que lo usan se actualizan. */
    async replace(actor, id, file, { confirmar = false } = {}, ip) {
      authorize(actor, 'media.update');
      const m = requireMedia(id);
      const usos = mediaRepository.usagesOf(id);
      if (usos.length && !confirmar) throw new ConflictError(`El archivo se usa en ${usos.length} contenido(s). Confirme para reemplazarlo en todos.`, usos);
      const stored = await ingest(file);
      if (stored.tipo !== m.tipo) {
        discard(stored);
        throw new ValidationError(`Debe reemplazarse por otro archivo de tipo ${m.tipo}.`);
      }
      transaction(() => {
        mediaRepository.replaceFile(id, stored, actor.id);
        audit.record({ actor, accion: 'medio_reemplazar', recurso: 'medio', recursoId: id, detalle: `usos: ${usos.length}`, ip });
      });
      storage.remove(m.archivo);
      if (m.miniatura) storage.remove(m.miniatura);
      return { ...mediaRepository.findById(id), usos };
    },

    remove(actor, id, { confirmar = false } = {}, ip) {
      authorize(actor, 'media.delete');
      const m = requireMedia(id);
      const usos = mediaRepository.usagesOf(id);
      if (usos.length && !confirmar)
        throw new ConflictError(`El archivo se usa en ${usos.length} contenido(s). Si lo elimina, dejará de mostrarse allí.`, usos);
      transaction(() => {
        mediaRepository.delete(id);
        audit.record({
          actor,
          accion: 'medio_eliminar',
          recurso: 'medio',
          recursoId: id,
          detalle: `${m.nombreVisible.slice(0, 60)}; usos: ${usos.length}`,
          ip,
        });
      });
      storage.remove(m.archivo);
      if (m.miniatura) storage.remove(m.miniatura);
    },

    /** Archivo para el público: solo si es público o lo usa contenido publicado. */
    publicFile(name) {
      const m = mediaRepository.findByFile(name);
      if (!m || !mediaRepository.isPubliclyServable(m.id) || !storage.exists(name)) return null;
      return { path: storage.path(name), mime: name === m.miniatura ? 'image/webp' : m.mime };
    },

    /** Archivo para el panel (también privados), con permiso media.read. */
    privateFile(actor, id, { miniatura = false } = {}) {
      authorize(actor, 'media.read');
      const m = requireMedia(id);
      const name = miniatura && m.miniatura ? m.miniatura : m.archivo;
      if (!storage.exists(name)) throw new NotFoundError('El archivo no está disponible.');
      return { path: storage.path(name), mime: name === m.miniatura ? 'image/webp' : m.mime };
    },

    // --- Uso desde otros módulos (páginas, noticias, sliders) ---
    assertUsable(ids, tipo) {
      const unique = [...new Set(ids.filter(Boolean))];
      if (!unique.length) return;
      const found = mediaRepository.findByIds(unique);
      const missing = unique.filter((id) => !found.some((m) => m.id === id));
      if (missing.length) throw new ValidationError(`Archivos inexistentes en la biblioteca: ${missing.join(', ')}.`);
      const wrong = tipo ? found.filter((m) => m.tipo !== tipo) : [];
      if (wrong.length) throw new ValidationError(`Se esperaba un archivo de tipo ${tipo}.`);
    },

    syncUsages(entidad, entidadId, ids, publicado) {
      mediaRepository.setUsages(entidad, entidadId, [...new Set(ids.filter(Boolean))], publicado);
    },

    clearUsages(entidad, entidadId) {
      mediaRepository.clearUsages(entidad, entidadId);
    },

    findByIds(ids) {
      return mediaRepository.findByIds([...new Set(ids.filter(Boolean))]);
    },
  };
}

module.exports = { createMediaService };
