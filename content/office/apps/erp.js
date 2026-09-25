import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { icon } from '../../../engine/ui/icons.js';
import { changed, btn, tabs, kv, empty, badge, money, head, office } from './kit.js';

// Finance, the ERP. Three things matter tonight: the payment run queue, the
// bank detail change requests (with their verification record), and the
// vendor records the requests should be checked against.
//
// A bank detail change is only safe when it has been verified on a channel the
// requester does not control: a call back on the number in the vendor file.
// The ERP records that tick box, which is what the scenarios look at.
//
// Events: erp:opened, erp:changeViewed { id, genuine }, erp:changeApproved
// { id, genuine, verified }, erp:changeRejected { id, genuine },
// erp:vendorViewed { id }, erp:paymentReleased { id, bypass, genuine },
// erp:paymentHeld { id }, erp:approvalRequested { id, genuine }.
export function makeErpApp() {
  const app = {
    id: 'erp', title: 'Finance', icon: 'money', colour: 'linear-gradient(160deg,#2fbf8f,#157a5c)', w: 1080, h: 640, pinned: true,
    badge: (world) => world.office && world.office.erp.changes.filter((c) => /awaiting|pending/.test(c.status)).length,
    mount(ctx) { const node = el('div', { class: 'ox-app app-erp' }); bus.emit('erp:opened', {}); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('erp');
      const erp = ctx.world.office.erp;
      if (!changed(node, [erp, x])) return;
      const tab = x.tab || 'changes';
      node.append(
        head('Finance', 'Veltrix Logistics · AP · s.rivera', [badge(`Run closes 19:00`, 'warn')]),
        tabs(ctx, 'erp', [['changes', 'Bank detail changes', 'bank'], ['run', 'Payment run', 'money'], ['vendors', 'Vendors', 'users']], tab),
        el('div', { class: 'ox-page' }, [tab === 'run' ? run(ctx, erp) : tab === 'vendors' ? vendors(ctx, erp, x) : changes(ctx, erp, x)])
      );
    }
  };

  function changes(ctx, erp, x) {
    const list = erp.changes;
    if (!list.length) return empty('No bank detail changes waiting.');
    const open = list.find((c) => c.id === x.open) || null;
    return el('div', { class: 'ox-split' }, [
      el('ul', { class: 'ox-list' }, list.map((c) => el('li', {}, [el('button', {
        class: `ox-row ${open && open.id === c.id ? 'is-on' : ''}`, type: 'button', dataset: { change: c.id },
        onclick: () => { ctx.setExtra('erp', { open: c.id, tick: false }); bus.emit('erp:changeViewed', { id: c.id, genuine: !!c.genuine }); }
      }, [
        el('span', { class: 'ox-row-main' }, [el('b', { text: `${c.id} · ${c.vendorName}` }), el('small', { text: `${c.from} · ${c.received}` })]),
        badge(c.status, /approved/.test(c.status) ? 'good' : /rejected/.test(c.status) ? 'bad' : 'warn')
      ])]))),
      open ? changeDetail(ctx, erp, open, x) : el('div', { class: 'ox-detail is-empty' }, [icon('bank'), el('p', { text: 'Pick a request to see what it changes.' })])
    ]);
  }

  function changeDetail(ctx, erp, c, x) {
    const vendor = erp.vendors.find((v) => v.id === c.vendor) || {};
    const decided = !/awaiting|pending/.test(c.status);
    const v = c.verification || {};
    return el('div', { class: 'ox-detail' }, [
      el('h3', { text: `${c.vendorName}: new bank details` }),
      el('div', { class: 'ox-compare' }, [
        el('div', {}, [el('small', { text: 'On file (verified)' }), kv('Bank', vendor.bank || ''), kv('Sort code', vendor.sort || '', { mono: true }), kv('Account', vendor.account || '', { mono: true }), kv('Contact', `${vendor.contact || ''} · ${vendor.phone || ''}`)]),
        el('div', {}, [el('small', { text: 'Requested' }), kv('Bank', c.newBank), kv('Sort code', c.sort, { mono: true }), kv('Account', c.account, { mono: true }), kv('Requested by', c.from, { warn: !c.genuine && !!c.fromWarn })])
      ]),
      el('div', { class: `ox-verify ${v.done ? 'is-done' : ''}` }, [
        el('b', { text: 'Verification' }),
        v.done ? el('p', {}, [icon('check'), ` Called back by ${v.by} on ${v.number}. ${v.note || ''}`]) : el('p', { text: 'Not verified yet. Call the vendor back on the number in the vendor master file, never on a number from the request.' })
      ]),
      decided ? el('p', { class: 'ox-decided', text: `Decision: ${c.status}.` }) : el('div', { class: 'ox-actions' }, [
        v.done ? null : el('label', { class: 'ox-check' }, [
          el('input', { type: 'checkbox', checked: x.tick ? '' : null, onchange: (ev) => ctx.setExtra('erp', { tick: ev.target.checked }) }),
          el('span', { text: 'I called the vendor back on the number in the vendor file and they confirmed this change.' })
        ]),
        btn('Reject change', () => decide(ctx, c, 'rejected', x), { warn: true, ic: 'close' }),
        btn(c.genuine && v.done ? 'Approve as second approver' : 'Approve change', () => decide(ctx, c, 'approved', x), { primary: true, ic: 'check' })
      ].filter(Boolean))
    ]);
  }

  function decide(ctx, c, verdict, x) {
    office(ctx, (o) => { const t = o.erp.changes.find((q) => q.id === c.id); if (t) t.status = verdict; }, 'erp-decide');
    const verified = !!((c.verification && c.verification.done) || x.tick);
    bus.emit(verdict === 'approved' ? 'erp:changeApproved' : 'erp:changeRejected', { id: c.id, genuine: !!c.genuine, verified, vendor: c.vendor });
    ctx.toast({ app: 'erp', title: `Change ${verdict}`, body: `${c.id} · ${c.vendorName}` });
  }

  function run(ctx, erp) {
    return el('div', {}, [
      el('p', { class: 'ox-note', text: 'Payments over £10,000 need Dan Whitlock’s approval before release. Urgent payments do not skip the queue.' }),
      el('table', { class: 'ox-table' }, [
        el('thead', {}, [el('tr', {}, ['Payment', 'Vendor', 'Amount', 'Status', ''].map((h) => el('th', { text: h })))]),
        el('tbody', {}, erp.payments.map((p) => el('tr', { class: `is-${p.status}`, dataset: { payment: p.id } }, [
          el('td', { class: 'mono', text: p.id }),
          el('td', {}, [el('b', { text: p.vendorName }), p.note ? el('small', { class: 'ox-row-note', text: p.note }) : null].filter(Boolean)),
          el('td', { class: 'mono', text: money(p.amount) }),
          el('td', {}, [badge(p.status, p.status === 'released' ? 'good' : p.status === 'held' ? 'bad' : '')]),
          el('td', { class: 'ox-cell-actions' }, p.status === 'queued' || p.status === 'urgent' ? [
            p.amount > 10000 && !p.approved ? btn('Send to Dan for approval', () => {
              office(ctx, (o) => { const t = o.erp.payments.find((q) => q.id === p.id); if (t) t.status = 'awaiting approval'; }, 'erp-approval');
              bus.emit('erp:approvalRequested', { id: p.id, genuine: p.genuine !== false });
            }) : null,
            btn(p.amount > 10000 && !p.approved ? 'Release now, skip approval' : 'Release', () => {
              office(ctx, (o) => { const t = o.erp.payments.find((q) => q.id === p.id); if (t) t.status = 'released'; }, 'erp-release');
              bus.emit('erp:paymentReleased', { id: p.id, bypass: p.amount > 10000 && !p.approved, genuine: p.genuine !== false, urgent: !!p.urgent });
            }, { warn: p.amount > 10000 && !p.approved }),
            btn('Hold', () => {
              office(ctx, (o) => { const t = o.erp.payments.find((q) => q.id === p.id); if (t) t.status = 'held'; }, 'erp-hold');
              bus.emit('erp:paymentHeld', { id: p.id, genuine: p.genuine !== false });
            })
          ].filter(Boolean) : [])
        ])))
      ])
    ]);
  }

  function vendors(ctx, erp, x) {
    const open = erp.vendors.find((v) => v.id === x.vendor);
    return el('div', { class: 'ox-split' }, [
      el('ul', { class: 'ox-list' }, erp.vendors.map((v) => el('li', {}, [el('button', {
        class: `ox-row ${open && open.id === v.id ? 'is-on' : ''}`, type: 'button',
        onclick: () => { ctx.setExtra('erp', { vendor: v.id }); bus.emit('erp:vendorViewed', { id: v.id }); }
      }, [el('span', { class: 'ox-row-main' }, [el('b', { text: v.name }), el('small', { text: `${v.vid} · since ${v.since}` })])])]))),
      open ? el('div', { class: 'ox-detail' }, [
        el('h3', { text: open.name }),
        kv('Vendor ID', open.vid, { mono: true }), kv('Bank', open.bank), kv('Sort code', open.sort, { mono: true }), kv('Account', open.account, { mono: true }),
        kv('Contact', open.contact), kv('Verified phone', open.phone, { mono: true }),
        el('p', { class: 'ox-note', text: 'The phone number here was verified when the account was opened. It is the number to call back on. The paper copy is in the desk drawer.' })
      ]) : el('div', { class: 'ox-detail is-empty' }, [icon('users'), el('p', { text: 'Pick a vendor.' })])
    ]);
  }

  return app;
}
