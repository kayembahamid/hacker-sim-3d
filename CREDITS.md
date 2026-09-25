# Credits

Everything in Hacker’s Notes 3D: Night Shift at Veltrix is either released under CC0 (public domain) or made for this project. There are no real brands, logos, people or companies anywhere in it. This file is written by `tools/credits.mjs` from `tools/sources.json`: edit those, then run `npm run credits`.

## 3D models

From [Poly Haven](https://polyhaven.com), under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Each one was reduced and repainted with the room's baked lighting before shipping.

| Model | Used for | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| Metal Office Desk | The desk and its return, and the empty desk across the aisle. | Ulan Cabanilla | [polyhaven.com/a/metal_office_desk](https://polyhaven.com/a/metal_office_desk) | CC0 1.0 |
| Pachira Aquatica 01 | The tall plant in the corner by the window. | Rob Tuytel, Rico Cilliers | [polyhaven.com/a/pachira_aquatica_01](https://polyhaven.com/a/pachira_aquatica_01) | CC0 1.0 |
| Potted Plant 02 | The plant on the desk across the aisle. | Rico Cilliers | [polyhaven.com/a/potted_plant_02](https://polyhaven.com/a/potted_plant_02) | CC0 1.0 |
| Potted Plant 04 | The little plant on the desk. | James Ray Cock | [polyhaven.com/a/potted_plant_04](https://polyhaven.com/a/potted_plant_04) | CC0 1.0 |
| Stationery Supplies | The pen pot on the desk. | Mateusz Sadek | [polyhaven.com/a/stationery_supplies](https://polyhaven.com/a/stationery_supplies) | CC0 1.0 |
| Desk Lamp Arm 01 | The desk lamp. | Yann Kervran, Kuutti Siitonen | [polyhaven.com/a/desk_lamp_arm_01](https://polyhaven.com/a/desk_lamp_arm_01) | CC0 1.0 |
| Security Camera 01 | The camera watching the door. | Alexander Otterbeck, Yann Kervran | [polyhaven.com/a/security_camera_01](https://polyhaven.com/a/security_camera_01) | CC0 1.0 |
| Fire Alarm | The call point by the door. | Slinc | [polyhaven.com/a/fire_alarm](https://polyhaven.com/a/fire_alarm) | CC0 1.0 |
| Wet Floor Sign 01 | The cleaners have been in. | Fran Calvente | [polyhaven.com/a/WetFloorSign_01](https://polyhaven.com/a/WetFloorSign_01) | CC0 1.0 |
| Clipboard | Delivery notes on the desk across the aisle. | ProgrammerOnCoffee | [polyhaven.com/a/clipboard](https://polyhaven.com/a/clipboard) | CC0 1.0 |

## Surface textures

From [Poly Haven](https://polyhaven.com), under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). They were used at bake time only: the shipped textures are the baked result.

| Texture | Used for | Author | Source | Licence |
| --- | --- | --- | --- | --- |
| Smooth Concrete Floor | The polished concrete floor. | Dimitrios Savva | [polyhaven.com/a/smooth_concrete_floor](https://polyhaven.com/a/smooth_concrete_floor) | CC0 1.0 |
| Hessian 380 | The carpet under the desks, under a flat colour. | colormass, Rico Cilliers | [polyhaven.com/a/hessian_380](https://polyhaven.com/a/hessian_380) | CC0 1.0 |
| Painted Plaster Wall | Wall paint texture, under a flat colour. | Amal Kumar | [polyhaven.com/a/painted_plaster_wall](https://polyhaven.com/a/painted_plaster_wall) | CC0 1.0 |
| Concrete Wall 006 | The bare concrete wall round the window. | Dario Barresi, Charlotte Baglioni | [polyhaven.com/a/concrete_wall_006](https://polyhaven.com/a/concrete_wall_006) | CC0 1.0 |
| Jersey Melange | The office chair fabric. | colormass, Rico Cilliers | [polyhaven.com/a/jersey_melange](https://polyhaven.com/a/jersey_melange) | CC0 1.0 |
| Wool Boucle | The desk divider pinboard. | colormass, Rico Cilliers | [polyhaven.com/a/wool_boucle](https://polyhaven.com/a/wool_boucle) | CC0 1.0 |

## Made for this project

| What | How |
| --- | --- |
| The office itself: walls, window wall, door, carpet, the desk pedestal, office chairs, divider, printer cabinet | Modelled in code in tools/blender/scenes/office.py |
| The interactive objects: the two monitors, keyboard and mouse, mobile phone and its stand, desk phone, sticky note, printer, shredder, USB stick, badge and lanyard, door intercom, desk drawer, whiteboard, mug and headphones | Modelled in code in tools/blender/scenes/office.py |
| Printed and drawn art: the whiteboard, the sticky note, the Veltrix sign and badge, the printed bank change form, the USB label, the security poster, the intercom camera still and the vendor master file | Drawn as SVG in tools/art.mjs |
| The baked lighting in every texture | Rendered with Blender Cycles by tools/blender/bake.py |
| All interface icons | Drawn as inline SVG in engine/ui/icons.js |
| All sounds: room tone, keyboard, printer, shredder, phone, desk phone, intercom | Synthesised in the browser with the Web Audio API (engine/core/audio.js). There are no audio files. |
| Phone call voices | The player’s own browser speech, using only voices that run on the device, and only when sound is on. Every line is captioned. Nothing is recorded or sent anywhere. |

## Fonts

Self hosted from the [Fontsource](https://fontsource.org) packages, so no font service is ever contacted.

| Font | Licence |
| --- | --- |
| Chakra Petch (500, 600, 700) | SIL Open Font License 1.1 |
| Inter (400, 500, 600, 700) | SIL Open Font License 1.1 |
| JetBrains Mono (400, 500) | SIL Open Font License 1.1 |

## Code in the game

| Library | Version | Licence |
| --- | --- | --- |
| [three.js](https://threejs.org) | 0.186.0 | MIT |
| [Basis Universal](https://github.com/BinomialLLC/basis_universal) transcoder (ships with three.js) | | Apache 2.0 |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) decoder (ships with three.js) | | MIT |

## Tools used to build it

Not shipped, used on the way.

| Tool | Licence |
| --- | --- |
| [Blender](https://www.blender.org) and Cycles, for modelling and baking | GPL (the output is not covered) |
| [Vite](https://vite.dev) 6.4.3 | MIT |
| [glTF Transform](https://gltf-transform.dev) ^4.5.0 | MIT |
| [KTX-Software](https://github.com/KhronosGroup/KTX-Software) (`ktx create`) | Apache 2.0 |
| [sharp](https://sharp.pixelplumbing.com) ^0.35.4 | Apache 2.0 |
| [Playwright](https://playwright.dev) 1.63.0 | Apache 2.0 |
