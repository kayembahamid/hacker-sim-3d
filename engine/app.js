import * as THREE from 'three';
import { bus } from './core/bus.js';
import { store, freshWorld } from './core/store.js';
import { Rng } from './core/rng.js';
import { createRenderers } from './core/renderer.js';
import { CameraRig, framePoints, boxCorners, objectPose } from './core/cameraRig.js';
import { Interaction } from './core/interaction.js';
import { Outliner } from './core/outline.js';
import { Hotspots } from './core/hotspots.js';
import { Screen3D } from './core/screen.js';
import { loadBakedRoom } from './core/bakedRoom.js';
import { makeSky } from './core/sky.js';
import { audio } from './core/audio.js';
import { hush } from './core/voice.js';
import { nightProgress, setClock, configureClock, format } from './core/clock.js';
import { configureStorage, save, load } from './core/storage.js';
import { el, clear, prefersReducedMotion } from './core/dom.js';

import { PhoneOS } from './os/phone/phoneOS.js';
import { DesktopOS } from './os/desktop/desktopOS.js';

import { ScenarioRunner } from './scenario/runner.js';
import { ActionLog } from './scenario/log.js';
import { Scoreboard } from './scenario/score.js';
import { runActions } from './scenario/actions.js';
import { pickScenarios } from './scenario/picker.js';

import { Shell } from './ui/shell.js';
import { Overlay } from './ui/overlay.js';
import { mountCaptions } from './ui/captions.js';
import { buildStartScreen } from './ui/startScreen.js';
import { buildDebrief } from './ui/debrief.js';
import { GameMenu } from './ui/menu.js';
import { CoachPointer } from './ui/pointer.js';

// The same query as the compact layout in engine.css: phones, phones held
// sideways, and tablets held upright. One rule, so the CSS and this cannot drift.
export const COMPACT_QUERY = '(max-width: 999px), (max-height: 559px)';

// The engine. The product (room, cast, apps, scenarios, sites, copy) is
// injected: Netizen passes the bedroom, Hacker's Notes passes the office, and
// the engine knows nothing about either.
export class Engine {
  constructor({ root, product, room, sites, scenarios, phoneApps, desktopApps, extras = {} }) {
    this.root = root;
    this.product = product;
    this.roomConfig = room;
    this.sites = sites;
    this.scenarios = scenarios;
    this.phoneAppDefs = phoneApps;
    this.desktopAppDefs = desktopApps;
    this.extras = extras;
    this.vars = {};
    this.screens = {};
    this.dirty = true;
    this.bus = bus;   // for the console and the tests
    configureStorage(product.storagePrefix || product.id);
    configureClock(product.clock);
  }

  async boot() {
    this.shell = new Shell({ root: this.root, product: this.product });
    this.buildStage();
    this.showLoading();
    // Marks for the performance check (tools and tests read them).
    performance.mark('boot:start');
    try {
      await this.loadRoom();
    } catch (err) {
      console.error(err);
      this.loadingFailed(err);
      return this;
    }
    performance.mark('boot:room');
    this.buildScreens();
    this.buildObjects();
    this.buildUi();
    performance.mark('boot:ui');
    // Compile every shader while the loading screen is still up. With
    // parallel compiling this does not block the page, and the first frame
    // then only has to draw.
    try { await this.webgl.compileAsync(this.scene, this.rig.camera); } catch (err) { console.warn(err); }
    performance.mark('boot:shaders');
    this.startLoop();
    this.hideLoading();
    this.showStart();
    this.outliner.buildWhenIdle();
    performance.mark('boot:ready');
    bus.emit('engine:ready', {});
    return this;
  }

  // ---------------------------------------------------------------- stage
  buildStage() {
    this.scene = new THREE.Scene();
    this.cssScene = new THREE.Scene();
    this.tilt = new THREE.Group();
    this.cssTilt = new THREE.Group();
    this.scene.add(this.tilt);
    this.cssScene.add(this.cssTilt);

    const layers = this.shell.layers;
    const { webgl, css, resize } = createRenderers(layers);
    this.webgl = webgl;
    this.css = css;
    this.resizeRenderers = resize;
    this.focusLayer = el('div', { class: 'focus-layer' });
    layers.append(this.focusLayer);

    this.rig = new CameraRig({ container: layers, tiltGroup: this.tilt });
    this.outliner = new Outliner(this.tilt, this.product.theme.accent);
    this.interaction = new Interaction({ container: layers, rig: this.rig, outliner: this.outliner });
    this.hotspots = new Hotspots({ container: layers, rig: this.rig, interaction: this.interaction });

    const onResize = () => {
      this.resizeRenderers();
      this.rig.resize();
      if (this.liveScreen) this.layoutLiveScreen();
      this.dirty = true;
    };
    window.addEventListener('resize', onResize);
    new ResizeObserver(onResize).observe(layers);
  }

  showLoading() {
    this.loadBar = el('i');
    this.loading = el('div', { class: 'loading', role: 'status', 'aria-live': 'polite' }, [
      el('div', { class: 'ld-card' }, [
        el('img', { src: `${import.meta.env.BASE_URL}${this.product.logo || 'logo.png'}`, alt: '', width: '48', height: '48' }),
        el('p', { class: 'ld-text', text: this.product.loadingText || 'Setting up the room' }),
        el('div', { class: 'ld-bar' }, [this.loadBar])
      ])
    ]);
    this.shell.stage.append(this.loading);
  }

  hideLoading() {
    this.loading.classList.add('is-done');
    setTimeout(() => this.loading.remove(), 600);
  }

  loadingFailed(err) {
    this.loading.querySelector('.ld-text').textContent = 'The room did not load. Check your connection and refresh the page.';
    this.loading.classList.add('is-error');
    bus.emit('engine:error', { message: String(err && err.message) });
  }

  async loadRoom() {
    const url = `${import.meta.env.BASE_URL}${this.roomConfig.url}`;
    this.room = await loadBakedRoom(url, {
      renderer: this.webgl,
      onProgress: (f) => { this.loadBar.style.width = `${Math.round(f * 100)}%`; }
    });
    this.tilt.add(this.room.root);
    this.roomMaterials = this.room.materials;
    this.tint = new THREE.Color(1, 1, 1);
    this.tintTarget = new THREE.Color(1, 1, 1);

    if (this.room.sky) this.sky = makeSky(this.room.sky, this.roomConfig.sky || {});

    const ov = this.roomConfig.overview;
    const corners = boxCorners(this.room.bounds);
    this.rig.registerPose('overview', (viewport) => framePoints(corners, {
      dir: new THREE.Vector3(...ov.dir), fill: viewport.aspect < 0.9 ? (ov.fillPortrait || 0.98) : (ov.fill || 0.92), viewport
    }));
    this.rig.flyTo('overview', { instant: true });
  }

  // ------------------------------------------------------------- screens
  buildScreens() {
    for (const [id, cfg] of Object.entries(this.roomConfig.screens)) {
      const mesh = this.room.screens.get(id);
      if (!mesh) { console.warn('[engine] no screen surface for', id); continue; }
      const screen = new Screen3D({ id, mesh, pxWidth: cfg.pxWidth, fit: cfg.fit || 0.9 });
      screen.mount(this.cssTilt, this.tilt);
      this.screens[id] = screen;
      // Leave room for the tools along the top and the Back button and
      // captions along the bottom, so they never sit on the device.
      this.rig.registerPose(id, (viewport) => {
        const top = 70;
        const bottom = 104;
        const room = Math.max(0.4, (viewport.h - top - bottom) / viewport.h);
        return screen.pose(viewport, {
          fill: viewport.aspect < 0.9 ? 0.96 : { w: 0.96, h: Math.min(screen.fit, room) },
          offset: viewport.aspect < 0.9 ? [0, 0] : [0, (bottom - top) / 2 / viewport.h],
          clip: cfg.clip || 0.5
        });
      });
    }

    const ctxBase = { store, sites: this.sites, vars: this.vars, product: this.product };
    if (this.screens.phone) {
      this.phoneOS = new PhoneOS({ screen: this.screens.phone, ...ctxBase, apps: this.phoneAppDefs(ctxBase) }).mount();
    }
    if (this.screens.computer) {
      this.desktopOS = new DesktopOS({ screen: this.screens.computer, ...ctxBase, apps: this.desktopAppDefs(ctxBase) }).mount();
    }
    if (this.extras.mountScreens) this.extras.mountScreens(this);

    bus.on('camera:flightStart', () => this.setLiveScreen(null));
    bus.on('camera:flightEnd', ({ pose }) => this.setLiveScreen(this.screens[pose] ? pose : null));
  }

  isMobile() { return window.matchMedia(COMPACT_QUERY).matches; }

  setLiveScreen(id) {
    for (const [key, screen] of Object.entries(this.screens)) {
      screen.setInteractive(key === id);
      if (key !== id && screen.focused) screen.blur();
    }
    this.liveScreen = id || null;
    this.focusLayer.classList.toggle('is-on', !!id);
    this.webgl.domElement.style.pointerEvents = id ? 'none' : 'auto';
    this.interaction.setEnabled(!id);
    this.shell.root.classList.toggle('device-open', !!id);
    this.shell.root.dataset.device = id || '';
    if (id) this.layoutLiveScreen();
    this.tintTarget.setScalar(id ? 0.42 : 1);
    this.dirty = true;
    bus.emit('device:live', { id });
  }

  layoutLiveScreen() {
    const id = this.liveScreen;
    const screen = this.screens[id];
    if (!screen) return;
    const w = this.focusLayer.clientWidth;
    const h = this.focusLayer.clientHeight;
    if (this.isMobile()) {
      // Phone first: on a small screen the device fills the stage, between
      // the tools at the top and the Back button at the bottom.
      const short = h < 560;   // a phone held sideways
      const top = short ? 50 : 58;
      // A finished step's Next button sits at the bottom: the device makes
      // room for it instead of lying underneath its own controls.
      const bottom = (short ? 50 : 64) + (this.shell.pendingNext ? (short ? 64 : 92) : 0);
      screen.fullscreen(this.focusLayer, { x: 0, y: top, w, h: Math.max(200, h - top - bottom) }, { stretch: id !== 'phone' });
    } else {
      screen.focus(this.focusLayer, this.rig.camera, w, h);
    }
    const os = id === 'phone' ? this.phoneOS : this.desktopOS;
    if (os && os.setScale) os.setScale(screen.k || 1);
  }

  // The focused screen is a flat overlay, so it is laid over the projected quad
  // again each frame while anything is still moving.
  trackLiveScreen() {
    if (!this.liveScreen || this.isMobile()) return;
    const screen = this.screens[this.liveScreen];
    if (!screen || !screen.focused) return;
    const { w, h } = this.rig.viewport();   // the focus layer covers the stage
    const rect = screen.projectRect(this.rig.camera, w, h);
    screen.place(rect.left, rect.top, rect.width / screen.pxWidth);
  }

  // ------------------------------------------------------------- objects
  buildObjects() {
    const defs = this.roomConfig.objects;
    for (const [id, cfg] of Object.entries(defs)) {
      const object3d = this.room.interactive.get(id);
      if (!object3d) { console.warn('[engine] no mesh for interactive object', id); continue; }
      this.interaction.register({
        id, object3d, label: cfg.label, hint: cfg.hint, icon: cfg.icon, hotspotIcon: cfg.icon,
        onActivate: () => this.onObjectActivated(id)
      });
      if (this.screens[id]) continue;   // devices fly to their screen pose
      this.rig.registerPose(id, (viewport) => objectPose(object3d, {
        dir: cfg.pose.dir, fill: viewport.aspect < 0.9 ? Math.min(0.95, (cfg.pose.fill || 0.7) * 1.25) : (cfg.pose.fill || 0.7),
        clip: cfg.pose.clip ?? 0.9, viewport
      }));
    }
    this.shell.setPlaces(this.interaction.list().map((d) => ({ id: d.id, label: d.label, hint: d.hint, icon: d.icon })), (id) => this.interaction.activate(id));
    bus.on('places:focus', ({ id }) => this.interaction.highlight(id));
    bus.on('interaction:availability', () => this.shell.renderPlaces());
    bus.on('room:vibrate', ({ object }) => this.vibrate(object || 'phone'));
    bus.on('room:back', () => this.backToRoom());
  }

  onObjectActivated(id) {
    if (this.screens[id]) return;
    const override = store.get().room.cards && store.get().room.cards[id];
    const card = override || (this.product.objectCards && this.product.objectCards[id]);
    bus.emit(card && card.event ? card.event : `${id}:inspected`, { object: id });
    if (!card) return;
    // Let the camera arrive before the card goes up, so the object is on screen
    // behind it.
    setTimeout(() => this.inspect(id, card), prefersReducedMotion() ? 0 : 900);
  }

  async inspect(id, card) {
    if (card.caption) bus.emit('caption', card.caption);
    if (card.effects) runActions(card.effects, this.actionCtx());
    const choice = await this.overlay.showCard({
      kicker: card.kicker || 'Up close', title: card.title, body: card.body,
      image: card.image ? `${import.meta.env.BASE_URL}${card.image}` : null, imageAlt: card.imageAlt,
      verdict: 'neutral', wide: !!card.image,
      choices: (card.choices || [{ id: 'close', label: 'Back to the room', primary: true }])
    });
    const picked = (card.choices || []).find((c) => c.id === choice);
    if (picked && picked.emit) bus.emit(picked.emit, { object: id, choice });
    if (picked && picked.effects) runActions(picked.effects, this.actionCtx());
    if (!picked || !picked.stay) this.backToRoom();
  }

  backToRoom() {
    if (this.overlay && this.overlay.open) return;
    if (this.rig.isOverview() && !this.rig.flight) return;
    hush();
    bus.emit('room:returned', { from: this.rig.currentPose });
    this.rig.toOverview();
  }

  vibrate(id) {
    const def = this.interaction.get(id);
    if (!def || prefersReducedMotion()) return;
    const obj = def.object3d;
    const base = obj.position.clone();
    const start = performance.now();
    const shake = () => {
      const t = performance.now() - start;
      if (t > 700) { obj.position.copy(base); this.dirty = true; return; }
      obj.position.set(base.x + Math.sin(t / 16) * 0.0035, base.y, base.z + Math.cos(t / 13) * 0.0025);
      this.dirty = true;
      requestAnimationFrame(shake);
    };
    shake();
  }

  // ------------------------------------------------------------------ ui
  buildUi() {
    this.overlay = new Overlay(this.shell.stage);
    mountCaptions(this.shell.captions);
    this.menu = new GameMenu({ engine: this, parent: this.shell.stage });
    this.pointer = new CoachPointer({ engine: this, store });
    // The Next button comes and goes, so a device open on a small screen is laid
    // out again each time (after the shell has shown or hidden it).
    for (const ev of ['stage:complete', 'coach:step', 'coach:next']) bus.on(ev, () => setTimeout(() => { if (this.liveScreen) this.layoutLiveScreen(); }, 0));
    this.screenRoot = el('div', { class: 'screen-root', hidden: true });
    this.shell.stage.append(this.screenRoot);
    const wake = () => audio.start();
    this.root.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    bus.on('menu:open', () => this.menu.open());
    // The walkthrough's "Take me there": fly the camera to the thing the current
    // step is about, and put its marker up so it is easy to spot on the way.
    bus.on('coach:goto', ({ target }) => {
      if (!target) return;
      this.hotspots.show(target);
      this.interaction.activate(target);
    });
    // The coach only offers the ride for something the player can actually reach.
    this.shell.canReach = (id) => { const d = this.interaction.get(id); return !!d && d.available !== false; };
  }

  actionCtx() {
    return {
      store, sites: this.sites, vars: this.vars, rig: this.rig, engine: this,
      interaction: this.interaction, hotspots: this.hotspots, shell: this.shell,
      overlay: this.overlay, desktop: this.desktopOS, phone: this.phoneOS,
      difficulty: this.mode, product: this.product
    };
  }

  // ---------------------------------------------------------------- flow
  // Links can ask for less than the whole evening:
  //   ?scenario=id        one scenario on its own (a single drill, the tests)
  //   ?scenarios=a,b,c    these, in this order
  //   ?track=name         every scenario on that track, in order
  // Without one, the product's run config deals the usual hand.
  selection() {
    const q = new URLSearchParams(window.location.search);
    const byId = (id) => this.scenarios.find((s) => s.id === id);
    const one = q.get('scenario');
    if (one && byId(one)) return { kind: 'one', list: [byId(one)] };
    const many = (q.get('scenarios') || '').split(',').map((s) => s.trim()).filter(Boolean).map(byId).filter(Boolean);
    if (many.length) return { kind: 'list', list: many };
    const track = (q.get('track') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (track) {
      const list = this.scenarios.filter((s) => [].concat(s.track || []).includes(track)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      if (list.length) return { kind: 'track', track, list };
    }
    return null;
  }

  // What the title card says: the evening, or the one drill (or track) the
  // link asked for.
  intro() {
    const sel = this.selection();
    if (!sel) return null;
    if (sel.kind === 'one') {
      const s = sel.list[0];
      return { kicker: `${this.product.drillKicker || 'Drill'} · ${s.kind || ''}`.replace(/ · $/, ''), title: s.title, lede: s.brief, role: s.role || null, minutes: s.minutes || null };
    }
    const names = this.product.tracks || {};
    const title = sel.kind === 'track' ? (names[sel.track] || sel.track.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())) : 'Your drills';
    return { kicker: `${this.product.drillKicker || 'Drill'} track · ${sel.list.length} drills`, title, lede: `${sel.list.length} short drills, back to back: ${sel.list.map((s) => s.title).join(', ')}.`, role: null };
  }

  showStart() {
    this.shell.root.classList.remove('is-debrief');
    clear(this.screenRoot);
    this.screenRoot.hidden = false;
    this.screenRoot.className = 'screen-root is-start';
    this.shell.root.classList.add('is-title');
    const intro = this.intro();
    if (intro) bus.emit('intro:shown', intro);
    this.screenRoot.append(buildStartScreen({
      product: this.product,
      intro,
      defaultMode: load('mode', this.product.defaultMode),
      lastRun: load('lastRun', null),
      // ?seed=words fills in the seed, so a teacher can give a whole class the
      // same evening. Only simple seed words are accepted.
      seed: (new URLSearchParams(window.location.search).get('seed') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || null,
      onStart: ({ seed, mode, sound }) => {
        audio.start();
        if (!sound && !audio.muted) audio.setMuted(true);
        if (sound && audio.muted) audio.setMuted(false);
        this.startRun(seed, mode);
      }
    }));
  }

  startRun(seed, mode) {
    save('mode', mode);
    this.seed = seed;
    this.mode = mode;
    this.shell.root.classList.remove('is-title', 'is-debrief');
    this.screenRoot.hidden = true;
    clear(this.screenRoot);
    this.shell.clearFeed();
    this.hotspots.clear();

    store.restore({ ...freshWorld(this.product), seed, difficulty: mode }, 'new-run');
    setClock(this.product.clock.start);
    for (const id of Object.keys(this.roomConfig.objects)) this.interaction.setAvailable(id, true);

    this.rng = new Rng(seed);
    this.log = new ActionLog();
    this.score = new Scoreboard();
    if (this.runner) this.runner.dispose();
    this.runner = new ScenarioRunner({
      store, sites: this.sites, rng: this.rng, log: this.log, score: this.score,
      overlay: this.overlay, actionCtx: this.actionCtx(), difficulty: mode, product: this.product
    });

    this.rig.toOverview({ instant: true });
    const chosen = this.selection();
    const list = chosen ? chosen.list : pickScenarios(this.scenarios, this.product.run, this.rng, mode);
    this.runList = list;
    this.runner.runEpisode(list).then(() => this.showDebrief());
    bus.emit('run:start', { seed, mode, scenarios: list.map((s) => s.id) });
  }

  showDebrief() {
    this.setLiveScreen(null);
    this.shell.root.classList.add('is-debrief');
    this.hotspots.clear();
    const totals = this.score.total();
    save('lastRun', { seed: this.seed, stars: totals.stars, maxStars: totals.maxStars, at: Date.now() });
    this.screenRoot.hidden = false;
    this.screenRoot.className = 'screen-root is-debrief';
    clear(this.screenRoot);
    const intro = this.intro();
    this.screenRoot.append(buildDebrief({
      product: intro ? { ...this.product, debriefKicker: intro.title, debriefTitle: intro.kicker.includes('track') ? 'Your track, replayed' : 'Your drill, replayed', newRunLabel: 'Play it again' } : this.product, log: this.log, score: this.score, seed: this.seed, mode: this.mode,
      links: this.product.links,
      onReplay: () => this.startRun(this.seed, this.mode),
      onNewRun: () => this.showStart(),
      onExport: this.product.exportResult ? () => this.product.exportResult(this) : null
    }));
    this.screenRoot.scrollTop = 0;
  }

  // ---------------------------------------------------------------- loop
  updateTint(dt) {
    const night = nightProgress();
    const late = this.roomConfig.lateTint || [0.93, 0.93, 0.98];
    const base = new THREE.Color(1 - (1 - late[0]) * night, 1 - (1 - late[1]) * night, 1 - (1 - late[2]) * night);
    const want = base.multiply(this.tintTarget);
    const k = 1 - Math.pow(0.002, dt);
    if (Math.abs(this.tint.r - want.r) + Math.abs(this.tint.g - want.g) + Math.abs(this.tint.b - want.b) > 0.002) {
      this.tint.lerp(want, k);
      for (const m of this.roomMaterials) m.color.copy(this.tint);
      this.dirty = true;
    }
  }

  startLoop() {
    let last = performance.now();
    let cssCamera = '';
    const frame = (time) => {
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      this.rig.update(dt);
      this.interaction.update();
      this.hotspots.update();
      this.outliner.update(this.rig.worldPerPixel());
      this.updateTint(dt);
      if (this.sky) { this.sky.update(nightProgress(), time / 1000); }
      if (this.rig.changed) this.trackLiveScreen();
      // The sky twinkles, so the room is redrawn every frame; it is a handful
      // of draw calls with no lighting, which even a cheap phone shrugs off.
      this.webgl.render(this.scene, this.rig.camera);
      // The CSS layer only needs redrawing when the camera or the tilt moved.
      const key = this.rig.camera.matrixWorld.elements.join(',') + this.tilt.rotation.x + this.tilt.rotation.y;
      if (key !== cssCamera || this.dirty) {
        this.cssTilt.rotation.copy(this.tilt.rotation);
        this.css.render(this.cssScene, this.rig.camera);
        cssCamera = key;
      }
      this.rig.changed = false;
      this.dirty = false;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
