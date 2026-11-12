/** Sliders por ubicación: crear, asignar, ordenar diapositivas, activar/desactivar y eliminar. */
import { get, post, patch, put, del } from '../api.js';
import {
  h,
  mount,
  field,
  input,
  checkbox,
  table,
  loading,
  empty,
  errorBox,
  toast,
  errorMessage,
  confirmDialog,
  modal,
  badge,
  busy,
  formatDate,
} from '../ui.js';
import { pickMedia } from './media.js';

const LUGARES = [
  ['inicio', 'Inicio'],
  ['pagina:secretaria', 'La Secretaría (Sobre nosotros)'],
  ['pagina:contacto', 'Contacto'],
];

function sliderForm(ctx, s, onSaved) {
  const nombre = input({ name: 'nombre', value: s?.nombre || '', maxlength: 80 });
  const ubicacion = input({ name: 'ubicacion', value: s?.ubicacion || 'inicio', list: 'ubicaciones', maxlength: 90 });
  const activo = checkbox('Activo (visible en el sitio)', s ? s.activo : true);
  const dl = h(
    'datalist',
    { id: 'ubicaciones' },
    LUGARES.map(([v, l]) => h('option', { value: v }, l)),
  );
  const save = h('button', { type: 'button', class: 'btn btn--primary' }, 'Guardar');
  const m = modal({
    title: s ? 'Editar slider' : 'Nuevo slider',
    content: h(
      'div',
      { class: 'form' },
      field('Nombre', nombre, { required: true }),
      field('Ubicación', ubicacion, {
        required: true,
        help: 'Use "inicio" o "pagina:<dirección>", p. ej. pagina:secretaria, pagina:contacto o cualquier otra página.',
      }),
      dl,
      activo,
    ),
    actions: [save],
  });
  save.addEventListener('click', () =>
    busy(save, async () => {
      const body = {
        nombre: nombre.value,
        ubicacion: ubicacion.value.trim(),
        activo: activo.querySelector('input').checked,
        ...(s ? { version: s.version } : {}),
      };
      try {
        const { data } = s ? await patch(`/sliders/${s.id}`, body) : await post('/sliders', body);
        m.close();
        toast('Slider guardado.');
        onSaved(data);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    }),
  );
}

function slideForm(ctx, slider, slide, onSaved) {
  let medioId = slide?.medioId || null;
  const preview = h('div', { class: 'thumbs' });
  const drawImg = async () => {
    if (!medioId) return mount(preview, h('span', { class: 'muted' }, 'Sin imagen'));
    const { data: m } = await get(`/medios/${medioId}`);
    mount(preview, h('img', { src: m.miniaturaUrl || m.url, alt: m.textoAlternativo || m.nombreVisible, class: 'thumb' }));
  };
  drawImg();
  const f = {
    titulo: input({ value: slide?.titulo || '', maxlength: 120 }),
    texto: input({ value: slide?.texto || '', maxlength: 300 }),
    enlace: input({ value: slide?.enlace || '', maxlength: 500, placeholder: '/noticias o https://…' }),
    textoEnlace: input({ value: slide?.textoEnlace || '', maxlength: 40 }),
  };
  const activa = checkbox('Diapositiva activa', slide ? slide.activa : true);
  const save = h('button', { type: 'button', class: 'btn btn--primary' }, 'Guardar');
  const m = modal({
    title: slide ? 'Editar diapositiva' : 'Nueva diapositiva',
    wide: true,
    actions: [save],
    content: h(
      'div',
      { class: 'form' },
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'label' }, 'Imagen *'),
        preview,
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--outline-blue',
            onclick: async () => {
              const c = await pickMedia(ctx, { tipo: 'imagen' });
              if (c) {
                medioId = c[0].id;
                drawImg();
              }
            },
          },
          slide ? 'Reemplazar imagen' : 'Elegir imagen',
        ),
      ),
      h(
        'div',
        { class: 'grid grid--2' },
        field('Título (opcional)', f.titulo),
        field('Texto (opcional)', f.texto),
        field('Enlace (opcional)', f.enlace),
        field('Texto del botón', f.textoEnlace),
      ),
      activa,
    ),
  });
  save.addEventListener('click', () =>
    busy(save, async () => {
      if (!medioId) {
        toast('Elija una imagen.', 'error');
        return;
      }
      const body = {
        medioId,
        titulo: f.titulo.value,
        texto: f.texto.value,
        enlace: f.enlace.value,
        textoEnlace: f.textoEnlace.value,
        activa: activa.querySelector('input').checked,
        version: slider.version,
      };
      try {
        const { data } = slide ? await patch(`/sliders/${slider.id}/diapositivas/${slide.id}`, body) : await post(`/sliders/${slider.id}/diapositivas`, body);
        m.close();
        toast('Diapositiva guardada.');
        onSaved(data);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    }),
  );
}

async function detail(main, ctx, id) {
  const canEdit = ctx.can('sliders.update');
  async function draw(s) {
    const slides = s.diapositivas;
    const reorder = async (i, delta) => {
      const ids = slides.map((d) => d.id);
      [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]];
      try {
        await draw((await put(`/sliders/${s.id}/orden`, { orden: ids, version: s.version })).data);
      } catch (e) {
        toast(errorMessage(e), 'error');
      }
    };
    const thumbs = await Promise.all(
      slides.map((d) =>
        d.medioId
          ? get(`/medios/${d.medioId}`)
              .then((r) => r.data)
              .catch(() => null)
          : null,
      ),
    );
    mount(
      main,
      h('p', {}, h('a', { href: '/admin/sliders', 'data-link': true }, '← Sliders')),
      h(
        'div',
        { class: 'page-head' },
        h('h1', {}, s.nombre),
        canEdit ? h('button', { type: 'button', class: 'btn btn--outline-blue', onclick: () => sliderForm(ctx, s, draw) }, 'Editar datos') : null,
      ),
      h('p', {}, 'Ubicación: ', h('code', {}, s.ubicacion), ' · ', s.activo ? badge('Activo', 'green') : badge('Inactivo', 'yellow')),
      canEdit ? h('button', { type: 'button', class: 'btn btn--primary', onclick: () => slideForm(ctx, s, null, draw) }, '+ Agregar diapositiva') : null,
      slides.length
        ? h(
            'ol',
            { class: 'slides' },
            slides.map((d, i) =>
              h(
                'li',
                { class: 'slide-row' },
                thumbs[i]
                  ? h('img', { src: thumbs[i].miniaturaUrl || thumbs[i].url, alt: thumbs[i].textoAlternativo || '', class: 'thumb' })
                  : h('span', { class: 'field-error' }, 'Imagen no disponible'),
                h(
                  'div',
                  {},
                  h('strong', {}, d.titulo || '(sin título)'),
                  h('p', { class: 'muted' }, d.texto),
                  d.activa ? badge('Activa', 'green') : badge('Inactiva', 'yellow'),
                ),
                h(
                  'div',
                  { class: 'block__tools' },
                  canEdit ? h('button', { type: 'button', 'aria-label': 'Subir', disabled: i === 0, onclick: () => reorder(i, -1) }, '↑') : null,
                  canEdit ? h('button', { type: 'button', 'aria-label': 'Bajar', disabled: i === slides.length - 1, onclick: () => reorder(i, 1) }, '↓') : null,
                  canEdit ? h('button', { type: 'button', onclick: () => slideForm(ctx, s, d, draw) }, 'Editar') : null,
                  canEdit
                    ? h(
                        'button',
                        {
                          type: 'button',
                          onclick: async () => {
                            try {
                              await draw((await patch(`/sliders/${s.id}/diapositivas/${d.id}`, { activa: !d.activa, version: s.version })).data);
                            } catch (e) {
                              toast(errorMessage(e), 'error');
                            }
                          },
                        },
                        d.activa ? 'Desactivar' : 'Activar',
                      )
                    : null,
                  ctx.can('sliders.delete')
                    ? h(
                        'button',
                        {
                          type: 'button',
                          class: 'link-danger',
                          onclick: async () => {
                            if (
                              !(await confirmDialog({
                                title: 'Eliminar diapositiva',
                                message: '¿Eliminar definitivamente esta diapositiva? La imagen sigue en la biblioteca.',
                              }))
                            )
                              return;
                            try {
                              await draw((await del(`/sliders/${s.id}/diapositivas/${d.id}`, { version: s.version })).data);
                              toast('Diapositiva eliminada.');
                            } catch (e) {
                              toast(errorMessage(e), 'error');
                            }
                          },
                        },
                        'Eliminar',
                      )
                    : null,
                ),
              ),
            ),
          )
        : empty('Este slider aún no tiene diapositivas.'),
      ctx.can('sliders.delete')
        ? h(
            'p',
            { class: 'mt-40' },
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn--danger',
                onclick: async () => {
                  if (!(await confirmDialog({ title: 'Eliminar slider', message: `¿Eliminar definitivamente "${s.nombre}" y sus diapositivas?` }))) return;
                  try {
                    await del(`/sliders/${s.id}`);
                    toast('Slider eliminado.');
                    ctx.navigate('/admin/sliders');
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                  }
                },
              },
              'Eliminar slider',
            ),
          )
        : null,
    );
  }
  draw((await get(`/sliders/${id}`)).data);
}

export async function render(main, ctx, [id]) {
  if (id) return detail(main, ctx, id);
  const box = h('div', {}, loading());
  mount(
    main,
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Sliders'),
      ctx.can('sliders.create')
        ? h(
            'button',
            { type: 'button', class: 'btn btn--primary', onclick: () => sliderForm(ctx, null, (s) => ctx.navigate(`/admin/sliders/${s.id}`)) },
            '+ Nuevo slider',
          )
        : null,
    ),
    box,
  );
  try {
    const { data } = await get('/sliders');
    mount(
      box,
      data.length
        ? table(
            [
              { label: 'Nombre', render: (s) => h('a', { href: `/admin/sliders/${s.id}`, 'data-link': true }, s.nombre) },
              { label: 'Ubicación', render: (s) => h('code', {}, s.ubicacion) },
              { label: 'Diapositivas', render: (s) => String(s.totalDiapositivas) },
              { label: 'Estado', render: (s) => (s.activo ? badge('Activo', 'green') : badge('Inactivo', 'yellow')) },
              { label: 'Actualizado', render: (s) => formatDate(s.actualizadoEn) },
            ],
            data,
          )
        : empty('No hay sliders. Cree uno para Inicio, La Secretaría o Contacto.'),
    );
  } catch (e) {
    mount(box, errorBox(e));
  }
}
