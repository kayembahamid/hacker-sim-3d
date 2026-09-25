import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { audio } from '../../../core/audio.js';
import { icon } from '../../../ui/icons.js';

// Phone settings: the privacy switches that matter (location, location in
// photos, who can see your account), two step sign in, and the screen lock.
// The first PIN is the one on the sticky note; changing it is part of the
// lesson, and nothing about the new one leaves this page.
export function makePhoneSettings({ rows = [] } = {}) {
  const app = {
    id: 'settings', name: 'Settings', icon: 'settings', colour: 'linear-gradient(160deg,#8e97a8,#545d6f)',
    mount(ctx) { const node = el('div', { class: 'app app-settings' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      clear(node);
      const v = ctx.view('settings');
      node.append(v.page === 'pin' ? pinPage(ctx, v) : main(ctx));
    }
  };

  function toggle(ctx, key, label, desc) {
    const st = ctx.world.phone.settings;
    return el('label', { class: 'switch-row' }, [
      el('span', {}, [el('b', { text: label }), desc ? el('small', { text: desc }) : null]),
      el('input', { type: 'checkbox', role: 'switch', checked: st[key] ? '' : null, onchange: (ev) => {
        const value = ev.target.checked;
        ctx.store.update((s) => { s.phone.settings[key] = value; }, 'phone-setting');
        bus.emit('settings:changed', { device: 'phone', key, value });
        audio.play('click');
      } })
    ]);
  }

  function main(ctx) {
    return el('div', { class: 'st-page' }, [
      el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: 'Settings' })]),
      el('h3', { class: 'st-group', text: 'Privacy' }),
      toggle(ctx, 'location', 'Location services', 'Lets apps know where the phone is.'),
      toggle(ctx, 'locationTagging', 'Save location in photos', 'Every photo remembers where it was taken.'),
      ...rows.map((r) => toggle(ctx, r.key, r.label, r.desc)),
      el('h3', { class: 'st-group', text: 'Security' }),
      el('button', { class: 'st-link', type: 'button', onclick: () => ctx.setView('settings', { page: 'pin', entry: '', step: 'new' }) }, [
        icon('lock'), el('span', {}, [el('b', { text: 'Change screen lock PIN' }), el('small', { text: ctx.world.flags.pinChanged ? 'Changed tonight' : 'Still the one on the sticky note' })]), icon('forward')
      ])
    ]);
  }

  function pinPage(ctx, v) {
    const entry = v.entry || '';
    const press = (d) => {
      const next = (entry + d).slice(0, 4);
      audio.play('tap');
      if (next.length < 4) { ctx.setView('settings', { entry: next }); return; }
      if (v.step === 'new') {
        const weak = /^(\d)\1{3}$/.test(next) || ['1234', '0000', '2048', '4321', '1111', '2580'].includes(next);
        if (weak) { ctx.setView('settings', { entry: '', error: 'That one is too easy to guess. Pick four digits nobody would guess.' }); return; }
        ctx.setView('settings', { step: 'confirm', first: next, entry: '', error: '' });
        return;
      }
      if (next !== v.first) { ctx.setView('settings', { step: 'new', entry: '', error: 'Those did not match. Start again.' }); return; }
      ctx.store.update((s) => {
        s.phone.pin = next;
        s.flags.pinChanged = true;
        s.phone.view.settings = { page: null };
      }, 'pin-changed');
      audio.play('good');
      bus.emit('pin:changed', {});
    };
    return el('div', { class: 'st-pin' }, [
      el('header', { class: 'ct-head' }, [
        el('button', { class: 'app-back', type: 'button', 'aria-label': 'Back', onclick: () => ctx.setView('settings', { page: null }) }, [icon('back')]),
        el('div', { class: 'ct-head-main' }, [el('b', { text: 'Screen lock PIN' })])
      ]),
      el('p', { class: 'st-pin-q', text: v.step === 'confirm' ? 'Type it again' : 'Type a new 4 digit PIN' }),
      el('div', { class: 'ph-dots' }, [0, 1, 2, 3].map((i) => el('span', { class: `ph-dot ${i < entry.length ? 'is-on' : ''}` }))),
      v.error ? el('p', { class: 'st-error', text: v.error }) : null,
      el('div', { class: 'ph-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((d) => {
        if (d === '') return el('span');
        if (d === 'del') return el('button', { class: 'ph-key ph-key-del', type: 'button', 'aria-label': 'Delete', onclick: () => ctx.setView('settings', { entry: entry.slice(0, -1) }) }, [icon('back')]);
        return el('button', { class: 'ph-key', type: 'button', onclick: () => press(d) }, [el('b', { text: d })]);
      }))
    ]);
  }

  return app;
}
