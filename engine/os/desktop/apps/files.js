import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { audio } from '../../../core/audio.js';
import { icon } from '../../../ui/icons.js';

// Files. Names are always shown in full, extensions and all, because the
// trick being taught is the double extension: Blockfall_ModMenu.pdf.exe is an
// application wearing a PDF's name. The icon is whatever the file claims to
// be; Properties tells the truth, including where it came from.
//
// file: { id, name, folder, size, icon, type, from, motw, signed, danger,
//         modified, note }
const ICON_FOR = { pdf: 'doc', image: 'image', doc: 'doc', sheet: 'sheet', zip: 'files', app: 'terminal', html: 'globe', iso: 'files', script: 'code', text: 'doc', video: 'video' };

export function makeFilesApp({ title = 'Files', folders = ['Downloads', 'Documents', 'Desktop'], canReport = false, canScan = false } = {}) {
  const app = {
    id: 'files', title, icon: 'files', colour: 'linear-gradient(160deg,#ffd166,#e2a22f)', w: 940, h: 560, pinned: true,
    mount(ctx) { const node = el('div', { class: 'app-files' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const key = JSON.stringify([ctx.world.desktop.files, ctx.extra('files')]);
      if (node.dataset.key === key) return;
      node.dataset.key = key;
      clear(node);
      const x = ctx.extra('files');
      const folder = x.folder || folders[0];
      const files = ctx.world.desktop.files.filter((f) => (f.folder || 'Downloads') === folder && !f.deleted);
      const sel = ctx.world.desktop.files.find((f) => f.id === x.selected);
      node.append(
        el('nav', { class: 'fl-side' }, folders.map((f) => el('button', {
          class: `fl-folder ${f === folder ? 'is-on' : ''}`, type: 'button', onclick: () => ctx.setExtra('files', { folder: f, selected: null, props: false })
        }, [icon(f === 'Downloads' ? 'download' : 'files'), f]))),
        el('div', { class: 'fl-main' }, [
          el('div', { class: 'fl-path mono', text: `This PC › ${folder}` }),
          el('div', { class: 'fl-table', role: 'table' }, [
            el('div', { class: 'fl-tr fl-th', role: 'row' }, ['Name', 'Type', 'Size', 'Where it came from'].map((h) => el('span', { role: 'columnheader', text: h }))),
            ...files.map((f) => row(ctx, f, x)),
            files.length ? null : el('p', { class: 'app-empty', text: 'This folder is empty.' })
          ])
        ]),
        sel && !sel.deleted ? details(ctx, sel, x) : el('aside', { class: 'fl-details is-empty' }, [icon('file'), el('p', { text: 'Select a file to see its details.' })])
      );
    }
  };

  function row(ctx, f, x) {
    return el('button', {
      class: `fl-tr ${x.selected === f.id ? 'is-on' : ''}`, type: 'button', role: 'row', dataset: { file: f.id },
      onclick: () => { ctx.setExtra('files', { selected: f.id, props: false }); bus.emit('file:selected', { id: f.id, name: f.name }); },
      ondblclick: () => openFile(ctx, f),
      oncontextmenu: (ev) => ctx.menu(ev, [
        { label: 'Open', icon: 'external', run: () => openFile(ctx, f) },
        { label: 'Properties', icon: 'info', run: () => showProps(ctx, f) },
        canScan ? { label: 'Scan with Endpoint Security', icon: 'shield', run: () => scan(ctx, f) } : null,
        '-',
        canReport ? { label: 'Report to IT', icon: 'flag', run: () => report(ctx, f) } : null,
        { label: 'Delete', icon: 'bin', run: () => remove(ctx, f) }
      ].filter(Boolean))
    }, [
      el('span', { class: 'fl-name' }, [el('span', { class: `fl-ico fl-ico-${f.icon || 'text'}` }, [icon(ICON_FOR[f.icon] || 'file')]), el('span', { class: 'mono', text: f.name })]),
      el('span', { text: f.type || '' }),
      el('span', { text: f.size || '' }),
      el('span', { class: 'fl-from', text: f.from || '' })
    ]);
  }

  function details(ctx, f, x) {
    return el('aside', { class: 'fl-details' }, [
      el('span', { class: `fl-ico big fl-ico-${f.icon || 'text'}` }, [icon(ICON_FOR[f.icon] || 'file')]),
      el('h3', { class: 'mono fl-dname', text: f.name }),
      el('p', { class: 'muted', text: f.type || '' }),
      x.props ? props(f) : null,
      el('div', { class: 'fl-actions' }, [
        el('button', { class: 'tb-btn', type: 'button', onclick: () => openFile(ctx, f) }, [icon('external'), 'Open']),
        el('button', { class: `tb-btn ${x.props ? 'is-on' : ''}`, type: 'button', onclick: () => showProps(ctx, f) }, [icon('info'), 'Properties']),
        canScan ? el('button', { class: 'tb-btn', type: 'button', onclick: () => scan(ctx, f) }, [icon('shield'), 'Scan']) : null,
        canReport ? el('button', { class: 'tb-btn warn', type: 'button', onclick: () => report(ctx, f) }, [icon('flag'), 'Report']) : null,
        el('button', { class: 'tb-btn', type: 'button', onclick: () => remove(ctx, f) }, [icon('bin'), 'Delete'])
      ]),
      f.scanned ? el('p', { class: `fl-scan ${f.danger ? 'is-bad' : 'is-ok'}`, text: f.scanResult || (f.danger ? 'Threat found.' : 'No threats found.') }) : null
    ]);
  }

  function props(f) {
    return el('div', { class: 'fl-props' }, [
      el('div', { class: 'kv' }, [el('span', { text: 'Full name' }), el('b', { class: 'mono', text: f.name })]),
      el('div', { class: 'kv' }, [el('span', { text: 'Type of file' }), el('b', { text: f.trueType || f.type })]),
      el('div', { class: 'kv' }, [el('span', { text: 'Size' }), el('b', { text: f.size || '' })]),
      el('div', { class: 'kv' }, [el('span', { text: 'Came from' }), el('b', { class: 'mono', text: f.from || 'this computer' })]),
      el('div', { class: 'kv' }, [el('span', { text: 'Publisher' }), el('b', { text: f.signed ? f.signed : 'Unknown publisher, not signed' })]),
      f.motw ? el('p', { class: 'fl-motw' }, [icon('warning'), 'This file came from another computer and might be blocked to help protect this computer.']) : null,
      f.note ? el('p', { class: 'ml-note', text: f.note }) : null
    ]);
  }

  function showProps(ctx, f) {
    ctx.setExtra('files', { selected: f.id, props: true });
    bus.emit('file:properties', { id: f.id, name: f.name, danger: !!f.danger });
  }

  function openFile(ctx, f) {
    audio.play('click');
    bus.emit('file:opened', { id: f.id, name: f.name, danger: !!f.danger, genuine: !f.danger });
    if (!f.danger && f.opens) ctx.open(f.opens, { file: f.id });
  }

  function remove(ctx, f) {
    ctx.store.update((s) => { const x = s.desktop.files.find((q) => q.id === f.id); if (x) x.deleted = true; }, 'file-delete');
    bus.emit('file:deleted', { id: f.id, name: f.name, danger: !!f.danger });
    audio.play('click');
  }

  function report(ctx, f) {
    ctx.store.update((s) => { const x = s.desktop.files.find((q) => q.id === f.id); if (x) x.reported = true; }, 'file-report');
    bus.emit('file:reported', { id: f.id, name: f.name, danger: !!f.danger });
    ctx.toast({ app: 'files', title: 'Reported', body: `${f.name} was sent to the security team.` });
  }

  function scan(ctx, f) {
    ctx.store.update((s) => { const x = s.desktop.files.find((q) => q.id === f.id); if (x) x.scanned = true; }, 'file-scan');
    bus.emit('file:scanned', { id: f.id, name: f.name, danger: !!f.danger });
  }

  return app;
}
