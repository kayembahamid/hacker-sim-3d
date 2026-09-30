// For the walkthrough's pointer (engine/ui/pointer.js): which control raises
// which event, so that any step waiting for that event can show the player
// exactly what to press, without every scenario spelling it out.
//
// Each entry: { device, app, sel: [candidates in order], label: [one per
// candidate] }. The first candidate on screen wins, so an early candidate is
// the last click (Report phishing) and a later one gets the player there (open
// the email). {id} and {case} style holes are filled from the rule's own match.
export const coachPoints = {
  'mail:reported': { device: 'desktop', app: 'mail', sel: ['.ml-toolbar .tb-btn.warn', '.ml-row.is-unread', '.ml-row'], label: ['Press Report phishing', 'Open the email', 'Open the email'] },
  'message:reported': { device: 'phone', app: 'messages', sel: ['.ms-tools .tool-btn.warn', '.ms-row.is-unread', '.ms-row'], label: ['Tap Report spam', 'Open the text', 'Open the text'] },
  'chat:reported': { device: 'desktop', app: 'teamchat', sel: ['.tc-head .tb-btn.warn', '.tc-row.is-unread', '.tc-row'], label: ['Press Report', 'Open the conversation', 'Open the conversation'] },
  'erp:changeRejected': { device: 'desktop', app: 'erp', sel: ['.ox-detail .ox-actions .tb-btn.warn', '[data-change="{id}"]', '.ox-tab:first-child'], label: ['Press Reject change', 'Open this request', 'Open Bank detail changes'] },
  'erp:paymentHeld': { device: 'desktop', app: 'erp', sel: ['[data-payment="{id}"] .ox-cell-actions .tb-btn:last-child', '.ox-tab:nth-child(2)'], label: ['Press Hold', 'Open the Payment run tab'] },
  'erp:approvalRequested': { device: 'desktop', app: 'erp', sel: ['[data-payment="{id}"] .ox-cell-actions .tb-btn:first-child', '.ox-tab:nth-child(2)'], label: ['Send to Dan for approval', 'Open the Payment run tab'] },
  'hr:changeRejected': { device: 'desktop', app: 'hr', sel: ['.ox-detail .ox-actions .tb-btn.warn', '[data-hrchange="{id}"]'], label: ['Press Reject', 'Open this request'] },
  'ticket:raised': { device: 'desktop', app: 'helpdesk', sel: ['.hd-form .tb-btn.primary', '.hd-choice[data-about]:not(.is-on)', '.hd-choice[data-cat="{category}"]', '.hd-choice[data-cat]', '.ox-tab:first-child'], label: ['Submit the ticket', 'Say what it is about', 'Pick what happened', 'Pick what happened', 'Raise a ticket'] },
  'password:changed': { device: 'desktop', app: 'security', sel: ['.ox-detail .tb-btn.primary', '.ox-tab:nth-child(4)'], label: ['Press Change password now', 'Open the Password tab'] },
  'mailrule:removed': { device: 'desktop', app: 'security', sel: ['[data-rule] .tb-btn.warn', '.ox-tab:nth-child(6)'], label: ['Delete the hidden rule', 'Open the Mailbox rules tab'] },
  'oauth:revoked': { device: 'desktop', app: 'security', sel: ['.ox-card .tb-btn.warn', '.ox-tab:nth-child(7)'], label: ['Remove the app\u2019s access', 'Open the Connected apps tab'] },
  'api:tokenRevoked': { device: 'desktop', app: 'api', sel: ['.ox-card .tb-btn.warn'], label: ['Revoke the token'] },
  'agent:blocked': { device: 'desktop', app: 'agent', sel: ['.ag-action .tb-btn.warn', '.ox-tab:first-child'], label: ['Press Block', 'Open Waiting for approval'] },
  'assistant:asked': { device: 'desktop', app: 'assistant', sel: ['[data-prompt="{id}"]'], label: ['Ask this'] },
  'file:deleted': { device: 'desktop', app: 'files', sel: ['.fl-actions .tb-btn:last-child', '.fl-tr:not(.fl-th)'], label: ['Press Delete', 'Pick the file'] },
  'share:linkChanged': { device: 'desktop', app: 'share', sel: ['[data-share] .ox-actions .tb-btn:last-child'], label: ['Stop sharing'] },
  'vpn:connected': { device: 'desktop', app: 'vpn', sel: ['.app-vpn .tb-btn.primary'], label: ['Press Connect'] },
  'case:action': { device: 'desktop', app: 'cases', sel: ['.cs-act.primary:not([disabled])', '.cs-section:not(:has(.cs-opt.is-on)) .cs-options', '[data-case="{case}"]'], label: ['Send it', 'Answer each question', 'Open the request'] },
  'push:denied': { device: 'phone', app: null, sel: ['.sheet-deny'], label: ['Tap No, it is not me'] },
  'deskphone:connected': { device: 'deskphone', sel: ['.dp-btn.dp-call:not([disabled])', '.dp-row', '.dp-tab:nth-child(2)'], label: ['Press Call', 'Pick who to ring', 'Open the Directory'] }
};
