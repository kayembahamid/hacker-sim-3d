import { el, clear } from '../../engine/core/dom.js';
import { bus } from '../../engine/core/bus.js';
import { format } from '../../engine/core/clock.js';
import { icon } from '../../engine/ui/icons.js';

// The second monitor: the finance team's ops board, left open all day. It is
// dressing with a job to do: the countdown to the 19:00 cut off is always in
// the corner of Sam's eye, which is exactly the pressure the attackers lean on.
// It reads the ERP's payment queue, so approving or holding a payment shows here.
const money = (n) => `£${Number(n).toLocaleString('en-GB')}`;

export class OpsBoard {
  constructor({ screen, store, product }) {
    this.screen = screen;
    this.store = store;
    this.product = product;
  }

  mount() {
    this.screen.root.classList.add('ops-board');
    bus.on('world:changed', () => this.render());
    bus.on('clock:changed', () => this.render());
    this.render();
    return this;
  }

  render() {
    const w = this.store.get();
    if (!w.office) { this.screen.root.replaceChildren(); this.key = null; return; }
    const erp = w.office.erp;
    const mins = w.clock.minutes;
    const left = Math.max(0, this.product.clock.end - mins);
    const key = JSON.stringify([mins, erp.payments, erp.changes.map((c) => c.status), w.office.endpoint.alerts.length]);
    if (key === this.key) return;
    this.key = key;
    const root = this.screen.root;
    clear(root);
    const total = erp.payments.filter((p) => p.status !== 'held').reduce((a, p) => a + p.amount, 0);
    const pending = erp.changes.filter((c) => /awaiting|pending/.test(c.status)).length;
    root.append(
      el('header', { class: 'ob-head' }, [
        el('span', { class: 'ob-brand' }, [el('b', { text: 'VELTRIX' }), el('small', { text: 'Finance ops' })]),
        el('span', { class: 'ob-clock mono', text: format(mins) })
      ]),
      el('div', { class: 'ob-grid' }, [
        el('section', { class: `ob-card ob-countdown ${left <= 30 ? 'is-close' : ''}` }, [
          el('small', { text: 'Payment run closes' }),
          el('b', { class: 'mono', text: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` }),
          el('span', { text: '19:00 tonight. Anything over £10,000 needs Dan’s approval.' })
        ]),
        el('section', { class: 'ob-card' }, [
          el('small', { text: 'In tonight’s run' }),
          el('b', { class: 'mono', text: money(total) }),
          el('span', { text: `${erp.payments.length} payments · ${erp.payments.filter((p) => p.status === 'held').length} held` })
        ]),
        el('section', { class: 'ob-card' }, [
          el('small', { text: 'Bank detail changes' }),
          el('b', { class: 'mono', text: String(pending) }),
          el('span', { text: pending ? 'Waiting for a decision' : 'Nothing waiting' })
        ]),
        el('section', { class: 'ob-card ob-wide' }, [
          el('small', { text: 'Queue' }),
          el('table', { class: 'ob-table' }, [
            el('tbody', {}, erp.payments.map((p) => el('tr', { class: `is-${p.status}` }, [
              el('td', { class: 'mono', text: p.id }), el('td', { text: p.vendorName }), el('td', { class: 'mono', text: money(p.amount) }), el('td', { text: p.status })
            ])))
          ])
        ]),
        el('section', { class: 'ob-card ob-wide ob-notice' }, [icon('shield'), el('span', { text: 'Money moving? Call back on the number you already had, never the one in the email.' })])
      ])
    );
  }
}
