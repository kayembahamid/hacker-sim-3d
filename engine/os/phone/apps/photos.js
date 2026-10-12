import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { audio } from '../../../core/audio.js';
import { icon } from '../../../ui/icons.js';

// The camera roll. A photo carries more than the picture: Info shows the
// hidden data (when, which phone, and where, down to the street), and Edit
// lets you cover the details in the picture that give away more than you
// meant to (a school badge, a house number, a street sign).
//
// photo: { id, title, src, at, meta: { device, place, address, gps },
//          locationOn, details: [{ id, label, x, y, w, h, fixed }] }
// x, y, w, h are percentages of the image.
export const photosApp = {
  id: 'photos',
  name: 'Photos',
  icon: 'image',
  colour: 'linear-gradient(160deg,#ffcf5c,#f08a3c)',

  mount(ctx) { const node = el('div', { class: 'app app-photos' }); this.update(ctx, node); return node; },

  update(ctx, node) {
    clear(node);
    const v = ctx.view('photos');
    const photo = ctx.world.phone.photos.find((p) => p.id === v.photo);
    node.append(photo ? viewer(ctx, photo, v) : grid(ctx));
  }
};

const asset = (src) => `${import.meta.env.BASE_URL}${src}`;

function grid(ctx) {
  const photos = ctx.world.phone.photos;
  return el('div', { class: 'pt-grid-wrap' }, [
    el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: 'Photos' })]),
    photos.length ? el('div', { class: 'pt-grid' }, photos.map((p) => el('button', {
      class: 'pt-tile', type: 'button', 'aria-label': p.title, dataset: { photo: p.id },
      onclick: () => { ctx.setView('photos', { photo: p.id, info: false, edit: false }); bus.emit('photo:opened', { photoId: p.id }); }
    }, [el('img', { src: asset(p.src), alt: '' })]))) : el('p', { class: 'app-empty', text: 'No photos yet.' })
  ]);
}

function viewer(ctx, photo, v) {
  const setPhoto = (fn, reason, event, payload) => {
    ctx.store.update((s) => { const p = s.phone.photos.find((x) => x.id === photo.id); if (p) fn(p); }, reason);
    if (event) bus.emit(event, { photoId: photo.id, ...payload });
  };
  const frame = el('div', { class: `pt-frame ${v.edit ? 'is-editing' : ''}` }, [
    el('img', { src: asset(photo.src), alt: photo.alt || photo.title }),
    ...(photo.details || []).map((d) => el('button', {
      class: `pt-detail ${d.fixed ? 'is-fixed' : ''}`, type: 'button', dataset: { detail: d.id },
      style: { left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%` },
      'aria-label': d.fixed ? `${d.label}, hidden` : `Hide: ${d.label}`,
      tabindex: v.edit ? '0' : '-1',
      onclick: () => {
        if (!v.edit || d.fixed) return;
        audio.play('click');
        setPhoto((p) => { const x = p.details.find((q) => q.id === d.id); if (x) x.fixed = true; }, 'photo-fix', 'photo:detailFixed', { detail: d.id, label: d.label });
      }
    }, [v.edit && !d.fixed ? el('span', { class: 'pt-detail-tag', text: 'tap to hide' }) : null]))
  ]);

  const info = v.info ? el('div', { class: 'pt-info' }, [
    el('div', { class: 'kv' }, [el('span', { text: 'Taken' }), el('b', { text: photo.at || '' })]),
    el('div', { class: 'kv' }, [el('span', { text: 'Camera' }), el('b', { text: photo.meta.device })]),
    photo.locationOn ? el('div', { class: 'kv' }, [el('span', { text: 'Location' }), el('b', { text: photo.meta.address })]) : el('div', { class: 'kv' }, [el('span', { text: 'Location' }), el('b', { text: 'Removed' })]),
    photo.locationOn ? el('div', { class: 'kv' }, [el('span', { text: 'GPS' }), el('b', { class: 'mono', text: photo.meta.gps })]) : null,
    photo.locationOn ? el('div', { class: 'pt-map' }, [icon('places'), el('span', { text: photo.meta.place })]) : null,
    photo.locationOn ? el('button', { class: 'tool-btn warn', type: 'button', onclick: () => setPhoto((p) => { p.locationOn = false; }, 'photo-loc', 'photo:locationRemoved') }, [icon('places'), 'Remove location from this photo']) : null
  ]) : null;

  return el('div', { class: 'pt-viewer', dataset: { photo: photo.id } }, [
    el('header', { class: 'ct-head' }, [
      el('button', { class: 'app-back', type: 'button', 'aria-label': 'All photos', onclick: () => ctx.setView('photos', { photo: null }) }, [icon('back')]),
      el('div', { class: 'ct-head-main' }, [el('b', { text: photo.title }), el('small', { text: photo.at || '' })])
    ]),
    frame,
    el('div', { class: 'pt-tools' }, [
      el('button', { class: `pill ${v.info ? 'is-on' : ''}`, type: 'button', dataset: { tool: 'info' }, onclick: () => { ctx.setView('photos', { info: !v.info }); if (!v.info) bus.emit('photo:info', { photoId: photo.id }); } }, [icon('info'), 'Info']),
      el('button', { class: `pill ${v.edit ? 'is-on' : ''}`, type: 'button', dataset: { tool: 'edit' }, onclick: () => { ctx.setView('photos', { edit: !v.edit }); if (!v.edit) bus.emit('photo:edit', { photoId: photo.id }); } }, [icon('eye'), v.edit ? 'Done' : 'Edit']),
      el('button', { class: 'pill', type: 'button', dataset: { tool: 'share' }, onclick: () => { ctx.open('social', { compose: true, photo: photo.id }); bus.emit('photo:share', { photoId: photo.id }); } }, [icon('upload'), 'Share'])
    ]),
    v.edit ? el('p', { class: 'pt-hint', text: 'Tap anything in the picture that tells a stranger more than you want them to know.' }) : null,
    info
  ]);
}
