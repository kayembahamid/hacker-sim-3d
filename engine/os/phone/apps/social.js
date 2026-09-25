import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { audio } from '../../../core/audio.js';
import { icon } from '../../../ui/icons.js';

// A photo sharing app (Snaply in the Netizen sim). Posting is where the
// footprint happens: the composer shows who will see the post and whether the
// location goes with it, and it starts with location on and the audience set
// to public, because that is how these apps ship.
//
// Captions are picked from a short list rather than typed: nothing a child
// types is ever stored or sent anywhere.
export function makeSocialApp({ name = 'Snaply', colour = 'linear-gradient(160deg,#ff8a5c,#e0474a)', handle = '@me', captions = [], feed = [] } = {}) {
  const app = {
    id: 'social', name, icon: 'social', colour,
    mount(ctx) { const node = el('div', { class: 'app app-social' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      clear(node);
      const v = ctx.view('social');
      if (v.compose) { node.append(composer(ctx, v)); return; }
      node.append(v.tab === 'profile' ? profile(ctx) : feedView(ctx));
    }
  };

  const asset = (src) => `${import.meta.env.BASE_URL}${src}`;

  function nav(ctx, tab) {
    return el('nav', { class: 'seg' }, [['feed', 'Feed'], ['profile', 'Profile']].map(([id, label]) => el('button', {
      class: `seg-btn ${tab === id ? 'is-on' : ''}`, type: 'button', onclick: () => ctx.setView('social', { tab: id })
    }, [label])));
  }

  function feedView(ctx) {
    const posts = [...ctx.world.phone.social.posts.filter((p) => p.mine), ...feed];
    return el('div', { class: 'sc-feed' }, [
      el('header', { class: 'app-head' }, [
        el('h1', { class: 'app-title', text: name }),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'New post', onclick: () => ctx.setView('social', { compose: true }) }, [icon('plus')])
      ]),
      nav(ctx, 'feed'),
      el('div', { class: 'sc-posts' }, posts.map((p) => post(p)))
    ]);
  }

  function post(p) {
    return el('article', { class: 'sc-post' }, [
      el('div', { class: 'sc-post-head' }, [
        el('span', { class: 'ct-avatar sm', style: { background: p.colour || '#e0474a' }, text: (p.author || 'me')[0].toUpperCase() }),
        el('span', {}, [el('b', { text: p.author }), p.place ? el('small', { text: p.place }) : null]),
        p.audience ? el('span', { class: 'tag', text: p.audience }) : null
      ]),
      p.src ? el('img', { class: 'sc-img', src: asset(p.src), alt: '' }) : el('div', { class: 'sc-card-art', style: { background: p.art || '#2d3350' } }, [el('span', { text: p.artText || '' })]),
      el('p', { class: 'sc-caption' }, [el('b', { text: p.author }), ` ${p.caption || ''}`]),
      el('small', { class: 'sc-meta', text: `${p.likes || 0} likes · ${p.at || 'now'}` })
    ]);
  }

  function profile(ctx) {
    const st = ctx.world.phone.settings;
    const mine = ctx.world.phone.social.posts.filter((p) => p.mine);
    return el('div', { class: 'sc-profile' }, [
      el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: name })]),
      nav(ctx, 'profile'),
      el('div', { class: 'sc-me' }, [
        el('span', { class: 'ct-avatar lg', text: handle[1] ? handle[1].toUpperCase() : 'B' }),
        el('div', {}, [el('b', { text: handle }), el('small', { text: st.visibility === 'public' ? 'Public account: anyone can see your posts' : 'Private account: only people you approve' })])
      ]),
      el('label', { class: 'switch-row' }, [
        el('span', { text: 'Private account' }),
        el('input', { type: 'checkbox', role: 'switch', checked: st.visibility !== 'public' ? '' : null, onchange: (ev) => {
          const value = ev.target.checked ? 'private' : 'public';
          ctx.store.update((s) => { s.phone.settings.visibility = value; }, 'social-visibility');
          bus.emit('settings:changed', { key: 'visibility', value });
        } })
      ]),
      el('div', { class: 'sc-grid' }, mine.map((p) => el('img', { src: asset(p.src), alt: '' })))
    ]);
  }

  function composer(ctx, v) {
    const photos = ctx.world.phone.photos;
    const draft = { photo: v.photo || (photos[0] && photos[0].id), caption: v.caption ?? 0, location: v.location ?? ctx.world.phone.settings.locationTagging, audience: v.audience || 'Everyone' };
    const photo = photos.find((p) => p.id === draft.photo);
    const set = (patch) => ctx.setView('social', patch);
    return el('div', { class: 'sc-compose' }, [
      el('header', { class: 'ct-head' }, [
        el('button', { class: 'app-back', type: 'button', 'aria-label': 'Cancel', onclick: () => set({ compose: false }) }, [icon('close')]),
        el('div', { class: 'ct-head-main' }, [el('b', { text: 'New post' })])
      ]),
      photo ? el('img', { class: 'sc-preview', src: asset(photo.src), alt: '' }) : el('p', { class: 'app-empty', text: 'Pick a photo first.' }),
      photos.length > 1 ? el('div', { class: 'sc-pick' }, photos.map((p) => el('button', {
        class: `sc-thumb ${p.id === draft.photo ? 'is-on' : ''}`, type: 'button', 'aria-label': p.title, onclick: () => set({ photo: p.id })
      }, [el('img', { src: asset(p.src), alt: '' })]))) : null,
      el('div', { class: 'sc-field' }, [
        el('span', { class: 'sc-label', text: 'Caption' }),
        el('div', { class: 'sc-captions' }, captions.map((c, i) => el('button', {
          class: `chip ${i === draft.caption ? 'is-on' : ''}`, type: 'button', onclick: () => set({ caption: i })
        }, [c])))
      ]),
      el('label', { class: 'switch-row' }, [
        el('span', {}, [el('b', { text: 'Add location' }), el('small', { text: photo && photo.meta ? photo.meta.place : '' })]),
        el('input', { type: 'checkbox', role: 'switch', checked: draft.location ? '' : null, onchange: (ev) => set({ location: ev.target.checked }) })
      ]),
      el('div', { class: 'sc-field' }, [
        el('span', { class: 'sc-label', text: 'Who can see this' }),
        el('div', { class: 'sc-captions' }, ['Everyone', 'Followers', 'Close friends'].map((a) => el('button', {
          class: `chip ${a === draft.audience ? 'is-on' : ''}`, type: 'button', onclick: () => set({ audience: a })
        }, [a])))
      ]),
      el('button', { class: 'btn-block', type: 'button', disabled: photo ? null : '', onclick: () => {
        const details = (photo.details || []);
        const showingDetails = details.filter((d) => !d.fixed);
        const showing = showingDetails.map((d) => d.id);
        const showingLabels = showingDetails.map((d) => d.label.toLowerCase());
        const withLocation = draft.location && photo.locationOn;
        ctx.store.update((s) => {
          s.phone.social.posts.unshift({ id: `post-${Date.now()}`, mine: true, author: handle, src: photo.src, caption: captions[draft.caption], place: withLocation ? photo.meta.place : '', audience: draft.audience, likes: 0, at: 'just now' });
          s.phone.view.social = { tab: 'profile', compose: false };
        }, 'social-post');
        audio.play('message');
        bus.emit('social:posted', {
          photoId: photo.id, location: !!withLocation, audience: draft.audience,
          visibility: ctx.world.phone.settings.visibility, showing, showingCount: showing.length,
          showingText: showingLabels.length ? showingLabels.join(', ') : 'nothing',
          locationText: withLocation ? `the exact address it was taken at, ${photo.meta.address}` : 'no location',
          audienceWide: draft.audience === 'Everyone' && ctx.world.phone.settings.visibility === 'public',
          fixedCount: details.length - showing.length, safe: !withLocation && showing.length === 0
        });
      } }, [icon('upload'), 'Post'])
    ]);
  }

  return app;
}
