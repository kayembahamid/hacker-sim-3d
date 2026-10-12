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
  'oauth:revoked': { device: 'desktop', app: 'security', sel: ['[data-oauth="{id}"] .tb-btn', '.ox-card.is-bad[data-oauth] .tb-btn', '.ox-tab[data-tab="apps"]'], label: ['Remove the app\u2019s access', 'Remove the app\u2019s access', 'Open the Connected apps tab'] },
  'api:tokenRevoked': { device: 'desktop', app: 'api', sel: ['.ox-card .tb-btn.warn'], label: ['Revoke the token'] },
  'agent:blocked': { device: 'desktop', app: 'agent', sel: ['.ag-action .tb-btn.warn', '.ox-tab:first-child'], label: ['Press Block', 'Open Waiting for approval'] },
  'assistant:asked': { device: 'desktop', app: 'assistant', sel: ['[data-prompt="{id}"]', '[data-prompt]'], label: ['Ask this', 'Ask the assistant'] },
  'file:deleted': { device: 'desktop', app: 'files', sel: ['.fl-actions .tb-btn:last-child', '.fl-tr:not(.fl-th)'], label: ['Press Delete', 'Pick the file'] },
  'share:linkChanged': { device: 'desktop', app: 'share', sel: ['[data-share="{id}"] .ox-actions .tb-btn:last-child:not([disabled])', '.ox-card.is-bad[data-share] .ox-actions .tb-btn:last-child:not([disabled])'], label: ['Stop sharing', 'Stop sharing'] },
  'vpn:connected': { device: 'desktop', app: 'vpn', sel: ['.app-vpn .tb-btn.primary'], label: ['Press Connect'] },
  'case:action': { device: 'desktop', app: 'cases', sel: ['.cs-opt.is-on[data-good="0"]', '.cs-opt[role="checkbox"][data-good="1"]:not(.is-on)', '.cs-section:not(:has(.cs-opt.is-on[data-good="1"])) .cs-opt[role="radio"][data-good="1"]', '.cs-act.primary:not([disabled])', '[data-case="{case}"]'], label: ['Untick this one', 'Pick this', 'Pick this', 'Send it', 'Open the request'] },
  'push:denied': { device: 'phone', app: null, sel: ['.sheet-deny'], label: ['Tap No, it is not me'] },
  // calls, messages and mail on the phone and the computer
  'call:declined': { device: 'phone', app: null, sel: ['.call-decline'], label: ['Tap Decline'] },
  'call:ended': { device: 'phone', app: null, sel: ['.call-end'], label: ['Hang up'] },
  'call:finished': { device: 'phone', app: null, sel: ['.call-end'], label: ['Hang up'] },
  'deskphone:ended': { device: 'deskphone', sel: ['.dp-call-view .dp-end'], label: ['Hang up'] },
  'deskphone:missed': { device: 'deskphone', sel: ['.dp-call-view.is-ringing .dp-end'], label: ['Decline'] },
  'message:blocked': { device: 'phone', app: 'messages', sel: ['.ms-tools .tool-btn:nth-child(2)', '.ms-row[data-thread="{threadId}"]', '.ms-row.is-unread'], label: ['Tap Block', 'Open the text first', 'Open the text first'] },
  'message:deleted': { device: 'phone', app: 'messages', sel: ['.ms-tools .tool-btn:nth-child(3)', '.ms-row[data-thread="{threadId}"]', '.ms-row.is-unread'], label: ['Tap Delete', 'Open the text first', 'Open the text first'] },
  'mail:opened': { device: 'desktop', app: 'mail', sel: ['.ml-row[data-mail="{id}"]', '.ml-row.is-unread'], label: ['Open this email', 'Open the new email'] },
  // the scary pop up page: close it, never press its buttons
  'browser:tabClosed': { device: 'desktop', app: 'browser', sel: ['.br-tab.is-on .br-tab-x'], label: ['Close this tab'] },
  'app:closed': { device: 'desktop', sel: ['.dk-app-{app} .dk-close', '.dk-close'], label: ['Close the window', 'Close the window'] },
  // security settings, the network, and meetings
  'method:changed': { device: 'desktop', app: 'security', sel: ['[data-method="{id}"][data-on="0"] .tb-btn', '.ox-tab[data-tab="methods"]'], label: ['Turn it on', 'Open Sign in methods'] },
  'network:disconnected': { device: 'desktop', app: 'network', sel: ['.nw-all'], label: ['Disconnect from every network'] },
  'video:reported': { device: 'desktop', app: 'video', sel: ['.vc-report', '.vc-join'], label: ['Report this meeting', 'Join with camera off'] },
  'video:left': { device: 'desktop', app: 'video', sel: ['.vc-leave', '.vc-join'], label: ['Leave the meeting', 'Join with camera off'] },
  'recovery:removed': { device: 'desktop', app: 'security', sel: ['[data-recovery="{id}"] .tb-btn', '.ox-tab[data-tab="recovery"]'], label: ['Remove it', 'Open the Recovery tab'] },
  'vault:strengthened': { device: 'desktop', app: 'vault', sel: ['.vt-main > .vt-list .vt-row[data-host="{host}"] .tb-btn', '.vt-import .tb-btn.primary'], label: ['Make it strong', 'Move it into Vault first'] },
  'desktop:locked': { device: 'desktop', sel: ['.dk-lockbtn'], label: ['Lock the computer'] },
  'deskphone:connected': { device: 'deskphone', sel: ['.dp-btn.dp-call:not([disabled])', '.dp-row', '.dp-tab:nth-child(2)'], label: ['Press Call', 'Pick who to ring', 'Open the Directory'] }
};
