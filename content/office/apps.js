import { callsApp } from '../../engine/os/phone/apps/calls.js';
import { messagesApp } from '../../engine/os/phone/apps/messages.js';
import { makeChatApp } from '../../engine/os/phone/apps/chat.js';
import { makePhoneBrowser } from '../../engine/os/phone/apps/browserApp.js';
import { makeAuthenticatorApp } from '../../engine/os/phone/apps/authenticator.js';
import { makePhoneSettings } from '../../engine/os/phone/apps/settings.js';
import { makeMailApp } from '../../engine/os/desktop/apps/mail.js';
import { makeFilesApp } from '../../engine/os/desktop/apps/files.js';
import { makeVaultApp } from '../../engine/os/desktop/apps/vault.js';
import { makeDesktopBrowser, makeNotesApp } from '../../engine/os/desktop/apps/basic.js';
import { makeErpApp } from './apps/erp.js';
import { makeTerminalApp } from './apps/terminal.js';
import { makeSecurityApp } from './apps/security.js';
import { makeHelpdeskApp, makeCalendarApp } from './apps/helpdesk.js';
import { makeInspectorApp } from './apps/inspector.js';
import { makeAssistantApp, makeAgentApp } from './apps/ai.js';
import { makeDocsApp, makeSheetApp } from './apps/documents.js';
import { makeHrApp, makeVideoApp } from './apps/people.js';
import { makeShareApp, makeVpnApp, makeEndpointApp } from './apps/cloud.js';
import { makeGitApp, makeApiApp } from './apps/dev.js';
import { makeTeamChatApp } from './apps/chat.js';
import { makeBankApp, makeMobileMailApp } from './apps/mobile.js';

// Which apps Sam's phone and computer have. Mail, the browser, Files, Vault
// and the phone apps are the engine's; the rest are the office's own.
const BOOKMARKS = [
  { label: 'Veltrix sign in', url: 'https://sso.veltrix-logistics.com/' },
  { label: 'Intranet', url: 'https://intranet.veltrix-logistics.com/' },
  { label: 'Harbour Bank Business', url: 'https://business.harbourbank.co.uk/' },
  { label: 'Filebridge', url: 'https://filebridge.io/' },
  { label: 'Seekly', url: 'https://seekly.search/' }
];

export function phoneApps({ store, sites, vars, product }) {
  return [
    callsApp,
    messagesApp,
    makeChatApp({ name: 'Chat', colour: 'linear-gradient(160deg,#6c7cff,#4453d6)' }),
    makeMobileMailApp({ name: 'Mail' }),
    makeAuthenticatorApp({ name: 'Authenticator' }),
    makeBankApp({ name: 'Harbour Bank' }),
    makePhoneBrowser({ store, sites, vars, product, bookmarks: BOOKMARKS }),
    makePhoneSettings({ rows: [] })
  ];
}

export function desktopApps() {
  return [
    makeMailApp({ title: 'Mail', account: 's.rivera@veltrix-logistics.com', reportLabel: 'Report phishing', showExternal: true }),
    makeDesktopBrowser({ title: 'Browser', bookmarks: BOOKMARKS }),
    makeTeamChatApp({ title: 'Chat' }),
    makeErpApp(),
    makeHelpdeskApp(),
    makeFilesApp({ title: 'Files' }),
    makeVaultApp({ title: 'Vault', suggestions: [] }),
    makeAssistantApp(),
    makeTerminalApp(),
    makeSecurityApp(),
    makeCalendarApp(),
    makeInspectorApp(),
    makeAgentApp(),
    makeHrApp(),
    makeVideoApp(),
    makeDocsApp(),
    makeSheetApp(),
    makeShareApp(),
    makeVpnApp(),
    makeEndpointApp(),
    makeGitApp(),
    makeApiApp(),
    makeNotesApp({ title: 'Notes', notes: [{ title: 'Late shift', lines: ['Payment run list to Dan by 18:30', 'Callback procedure for ANY bank change', 'Marta back Monday'], sign: 'Sam' }] })
  ];
}
