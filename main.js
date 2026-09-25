// Self hosted fonts, the same families as hacker.hamcodes.com. Nothing is
// fetched from a font service: the sim makes no third party requests.
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

import './styles/theme-hacker.css';
import './styles/engine.css';
import './styles/os.css';
import './content/office/office.css';

import { Engine } from './engine/app.js';
import { product } from './content/office/product.js';
import { room } from './content/office/room/index.js';
import { sites } from './content/office/sites/index.js';
import { ALL_SCENARIOS } from './content/office/scenarios/index.js';
import { phoneApps, desktopApps } from './content/office/apps.js';
import { installOffice, officeTrace } from './content/office/actions.js';

// The office's own timeline labels, read by the scenario runner.
product.trace = officeTrace;

const engine = new Engine({
  root: document.getElementById('app'),
  product, room, sites, scenarios: ALL_SCENARIOS, phoneApps, desktopApps,
  extras: { mountScreens: installOffice }
});
engine.boot();

// Handy in the console and in the Playwright tests.
window.sim = engine;
