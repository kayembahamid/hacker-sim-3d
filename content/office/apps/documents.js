import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { icon } from '../../../engine/ui/icons.js';
import { changed, btn, empty, badge, head, office } from './kit.js';

// The document editor and the spreadsheet. Documents come from the world
// (world.office.docs and world.office.sheets), opened from Files.
//
// Two lessons live here. A document can carry text nobody sees (white on
// white, one point type) that an AI assistant reads as an instruction: "Show
// hidden text" reveals it. And a macro enabled file opens harmlessly with its
// macros switched off, then asks you to switch them on: that one button is
// the attack.
//
// Events: doc:opened { id }, doc:hiddenShown { id, hasHidden },
// doc:macroEnabled { id }, sheet:opened { id }, sheet:macroEnabled { id }.
function macroBar(ctx, kind, id, file, onEnable) {
  return el('div', { class: 'dc-macro' }, [
    icon('warning'),
    el('span', {}, [el('b', { text: 'Security warning ' }), 'Macros have been disabled. This file came from the internet.']),
    btn('Enable content', onEnable, { warn: true }),
    btn('Keep disabled', () => ctx.setExtra(kind, { [`kept-${id}`]: true }))
  ]);
}

export function makeDocsApp() {
  const app = {
    id: 'docs', title: 'Documents', icon: 'doc', colour: 'linear-gradient(160deg,#5b8def,#2f5bc4)', w: 860, h: 640, pinned: false,
    mount(ctx, params = {}) { const node = el('div', { class: 'ox-app app-docs' }); app.open(ctx, params); app.update(ctx, node, params); return node; },
    open(ctx, params) {
      const id = params.file || params.doc;
      if (id && ctx.extra('docs').open !== id) { ctx.setExtra('docs', { open: id }); bus.emit('doc:opened', { id }); }
    },
    update(ctx, node, params = {}) {
      if (params.file && ctx.extra('docs').open !== params.file) app.open(ctx, params);
      const x = ctx.extra('docs');
      const docs = ctx.world.office.docs || {};
      const doc = docs[x.open];
      if (!changed(node, [doc, x])) return;
      if (!doc) { node.append(head('Documents', 'Open a document from Files'), empty('No document open.')); return; }
      const showHidden = !!x[`hidden-${x.open}`];
      node.append(
        head(doc.title, doc.meta || '', [
          btn(showHidden ? 'Hide formatting marks' : 'Show hidden text', () => {
            ctx.setExtra('docs', { [`hidden-${x.open}`]: !showHidden });
            if (!showHidden) bus.emit('doc:hiddenShown', { id: x.open, hasHidden: (doc.pages || []).some((p) => p.hidden && p.hidden.length) });
          }, { ic: 'eye' })
        ]),
        doc.macros && !doc.macrosOn && !x[`kept-${x.open}`] ? macroBar(ctx, 'docs', x.open, doc, () => {
          office(ctx, (o) => { o.docs[x.open].macrosOn = true; }, 'doc-macro');
          bus.emit('doc:macroEnabled', { id: x.open });
        }) : null,
        el('div', { class: 'dc-pages' }, (doc.pages || []).map((p, i) => el('article', { class: 'dc-page' }, [
          ...(p.lines || []).map((l) => (typeof l === 'string' ? el('p', { text: l }) : el(l.h ? 'h3' : 'p', { class: l.cls || '', text: l.h || l.text }))),
          ...(p.hidden || []).map((l) => el('p', { class: `dc-hidden ${showHidden ? 'is-shown' : ''}`, 'aria-hidden': showHidden ? null : 'true', text: l })),
          el('small', { class: 'dc-pnum', text: `Page ${i + 1}` })
        ])))
      );
    }
  };
  return app;
}

export function makeSheetApp() {
  const app = {
    id: 'sheet', title: 'Spreadsheet', icon: 'sheet', colour: 'linear-gradient(160deg,#3fbf74,#1d8a4d)', w: 900, h: 600, pinned: false,
    mount(ctx, params = {}) { const node = el('div', { class: 'ox-app app-sheet' }); app.update(ctx, node, params); return node; },
    update(ctx, node, params = {}) {
      if (params.file && ctx.extra('sheet').open !== params.file) { ctx.setExtra('sheet', { open: params.file }); bus.emit('sheet:opened', { id: params.file }); return; }
      const x = ctx.extra('sheet');
      const sh = (ctx.world.office.sheets || {})[x.open];
      if (!changed(node, [sh, x])) return;
      if (!sh) { node.append(head('Spreadsheet', 'Open a spreadsheet from Files'), empty('No spreadsheet open.')); return; }
      const cols = sh.rows[0] ? sh.rows[0].length : 0;
      node.append(
        head(sh.title, sh.meta || '', sh.macros ? [badge('Contains macros', 'warn')] : []),
        sh.macros && !sh.macrosOn && !x[`kept-${x.open}`] ? macroBar(ctx, 'sheet', x.open, sh, () => {
          office(ctx, (o) => { o.sheets[x.open].macrosOn = true; }, 'sheet-macro');
          bus.emit('sheet:macroEnabled', { id: x.open });
        }) : null,
        sh.banner ? el('div', { class: 'sh-banner' }, [icon('info'), el('span', { text: sh.banner })]) : null,
        el('div', { class: 'sh-grid-wrap' }, [el('table', { class: 'sh-grid' }, [
          el('thead', {}, [el('tr', {}, [el('th', { text: '' }), ...Array.from({ length: cols }, (_, i) => el('th', { text: String.fromCharCode(65 + i) }))])]),
          el('tbody', {}, sh.rows.map((r, i) => el('tr', {}, [el('th', { text: String(i + 1) }), ...r.map((c) => el('td', { class: /^[£\d.,-]+$/.test(String(c)) ? 'is-num' : '', text: String(c) }))])))
        ])])
      );
    }
  };
  return app;
}
