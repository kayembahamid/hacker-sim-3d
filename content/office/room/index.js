// The Veltrix office, as the game sees it. Geometry, light and positions all
// live in the baked file (tools/blender/scenes/office.py); this only says which
// baked objects are interactive, what they are called, and which way the
// camera looks at each one.
//
// pose.dir points from the object back towards the camera (three.js axes:
// x right, y up, z out of the back wall towards you). fill is how much of the
// view the object takes up; clip cuts away furniture between camera and object.
export const room = {
  url: 'assets/room/office.glb',
  overview: { dir: [1, 1.02, 1.06], fill: 0.95, fillPortrait: 0.99 },
  // The office gets later: a little cooler and dimmer by 19:00.
  lateTint: [0.94, 0.95, 0.99],
  sky: { dusk: '#d9825a', zenith: '#18285c', night: '#070d24', skyline: true },
  screens: {
    computer: { pxWidth: 1280, fit: 0.92, clip: 0.55 },
    second: { pxWidth: 1280, fit: 0.9, clip: 0.55 },
    phone: { pxWidth: 390, fit: 0.9, clip: 0.3 },
    deskphone: { pxWidth: 320, fit: 0.72, clip: 0.3 }
  },
  objects: {
    computer: { label: 'Computer', hint: 'Mail, the browser, the ERP, the terminal and twenty more.', icon: 'browser' },
    phone: { label: 'Mobile phone', hint: 'Calls, texts, the authenticator, your bank.', icon: 'phone' },
    deskphone: { label: 'Desk phone', hint: 'Extension 4471. Call back on numbers you already trust.', icon: 'deskphone' },
    drawer: { label: 'Desk drawer', hint: 'The vendor master file, with verified numbers.', icon: 'drawer', pose: { dir: [0.2, 0.35, 1], fill: 0.5, clip: 0.6 } },
    notebook: { label: 'Notebook', hint: 'Numbers you checked yourself.', icon: 'note', pose: { dir: [0.08, 1, 0.5], fill: 0.4, clip: 0.4 } },
    sticky: { label: 'Sticky note', hint: 'Under the keyboard.', icon: 'sticky', pose: { dir: [0.1, 1, 0.45], fill: 0.36, clip: 0.4 } },
    usb: { label: 'USB stick', hint: 'Found in the car park.', icon: 'usb', pose: { dir: [0.18, 1, 0.5], fill: 0.3, clip: 0.4 } },
    badge: { label: 'Badge', hint: 'Your pass for the lobby door.', icon: 'badge', pose: { dir: [0.2, 1, 0.4], fill: 0.38, clip: 0.4 } },
    printer: { label: 'Printer', hint: 'The shared printer. Check the tray.', icon: 'printer', pose: { dir: [0.35, 0.45, 1], fill: 0.6 } },
    shredder: { label: 'Shredder', hint: 'Sensitive paper goes in here.', icon: 'shredder', pose: { dir: [0.3, 0.55, 1], fill: 0.55 } },
    whiteboard: { label: 'Whiteboard', hint: 'What would a stranger learn from it?', icon: 'whiteboard', pose: { dir: [1, 0.08, 0.12], fill: 0.86 } },
    intercom: { label: 'Door intercom', hint: 'The lobby door, after hours.', icon: 'intercom', pose: { dir: [1, 0.12, 0.18], fill: 0.42 } }
  }
};
