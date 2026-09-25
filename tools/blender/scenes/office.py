"""
Veltrix Logistics, third floor, 16:30 on a Thursday in late September.

An open plan corner of a freight company's finance floor, after most people
have gone home. Built in code so it can be rebuilt, rebaked and reviewed like
any other source file. Furniture and props that a stock library carries come
from Poly Haven (CC0); everything else (monitors, phones, printer, shredder,
intercom, whiteboard, badge, USB stick, chairs, the room) is modelled here.

Layout, looking in from the front right like the game camera does:

    back wall (+Y):  bare concrete with the Veltrix sign, the printer and the
                     shredder | a long city window | Sam's desk under it
    left wall (-X):  the whiteboard, the door intercom, the office door, the
                     exit sign, a security camera up in the corner
    right side:      the desk's return, with the badge and headphones on it
    front:           an empty desk across the aisle, the cleaners' wet floor
                     sign by the door

Lighting is the ceiling panels on (cool office white), the desk lamp on
(warm), both monitors glowing, and the city outside the window.
"""
import math
import os

import bpy
from mathutils import Vector, Euler, Matrix

import hb
from hb import (DEG, box, cylinder, sphere, torus, plane, soft, color, textured, paint, hexrgb,
                import_model, put, fit, tag, emissive, glass, image_material, area_light,
                spot_light, world_color, dollhouse_camera, remove_material_faces, retint)

ART = os.path.join(hb.CACHE, 'art')

W, D, H = 6.2, 4.8, 2.9          # interior width, depth, height
X0, X1 = -W / 2, W / 2
Y0, Y1 = -D / 2, D / 2
T = 0.14                          # wall thickness
LIP = 0.06                        # floor overhang at the open front and right

# The window band in the back wall, and the concrete wall to its left.
WX0, WX1, WZ0, WZ1 = -1.2, 2.95, 0.62, 2.62
MULLIONS = (0.2, 1.6)

DESK_Z = 0.788                    # top of the metal desks
DESK = (1.05, Y1 - 0.5)           # Sam's desk, centre
RETURN = (2.525, 1.4)             # the return, turned to face the chair

BAKE = {
    'shell': 2048,
    'furniture': 2048,
    'decor': 2048,
    'ix_computer': 1024,
    'ix_phone': 512,
    'ix_deskphone': 512,
    'ix_sticky': 256,
    'ix_printer': 1024,
    'ix_shredder': 512,
    'ix_usb': 256,
    'ix_badge': 512,
    'ix_intercom': 512,
    'ix_drawer': 512,
    'ix_whiteboard': 1024,
    'ix_notebook': 512,
}


def rgb(h):
    return hexrgb(h)


def place(parts, x, y, z=0.0, rz=0.0, **tags):
    """Place a group of parts built around the origin as one: turn it about
    Z by rz degrees, move it to (x, y, z), and tag every part."""
    rot = Euler((0, 0, rz * DEG))
    for p in parts:
        off = p.location.copy()
        off.rotate(rot)
        p.location = Vector((x, y, z)) + off
        e = p.rotation_euler
        p.rotation_euler = (e[0], e[1], e[2] + rz * DEG)
        tag(p, **tags)
    return parts


# ------------------------------------------------------------------ materials
def materials():
    M = {}
    M['wall'] = paint('wall', rgb('#e4e7e9'), 'painted_plaster_wall', amount=0.22, tile=1.8, rough=0.92)
    M['wall_left'] = paint('wall_left', rgb('#d7dde2'), 'painted_plaster_wall', amount=0.22, tile=1.8, rough=0.92)
    M['concrete'] = textured('concrete', 'concrete_wall_006', tile=2.2, val=1.25, sat=0.6, rough=0.9, normal=0.3)
    M['floor'] = textured('floor', 'smooth_concrete_floor', tile=2.6, val=1.05, sat=0.25, rough=0.35, normal=0.2)
    M['carpet'] = paint('carpet', rgb('#39424d'), 'hessian_380', amount=0.4, tile=0.6, rough=0.98)
    M['carpet_edge'] = paint('carpet_edge', rgb('#2c333b'), rough=0.95)
    M['slab'] = paint('slab', rgb('#1a2124'), rough=0.9)
    M['trim'] = paint('trim', rgb('#f2f3f4'), rough=0.5)
    M['alu'] = paint('aluminium', rgb('#3a4148'), rough=0.35, metal=0.7)
    M['alu_light'] = paint('aluminium_light', rgb('#c7ccd1'), rough=0.3, metal=0.8)
    M['door'] = paint('door', rgb('#cfc7b8'), rough=0.45)
    M['steel'] = paint('steel', rgb('#b8bec5'), rough=0.25, metal=0.9)
    M['black'] = paint('black_plastic', rgb('#1b1f23'), rough=0.45)
    M['graphite'] = paint('graphite', rgb('#343a41'), rough=0.5)
    M['plastic_light'] = paint('plastic_light', rgb('#e7e9ec'), rough=0.45)
    M['plastic_grey'] = paint('plastic_grey', rgb('#9ea6ad'), rough=0.5)
    M['chair'] = paint('chair_fabric', rgb('#2a3036'), 'jersey_melange', amount=0.45, tile=0.3, rough=0.9)
    M['chair_teal'] = paint('chair_fabric_teal', rgb('#1f5c56'), 'jersey_melange', amount=0.45, tile=0.3, rough=0.9)
    M['pinboard'] = paint('pinboard', rgb('#4f6a6b'), 'wool_boucle', amount=0.5, tile=0.4, rough=0.95)
    M['keycap'] = paint('keycap', rgb('#2c3136'), rough=0.5)
    M['keycap_light'] = paint('keycap_light', rgb('#dfe3e6'), rough=0.5)
    M['paper'] = paint('paper', rgb('#f5f4ee'), rough=0.9)
    M['mug'] = paint('mug', rgb('#f2f2ef'), rough=0.3)
    M['mug_band'] = paint('mug_band', rgb('#24c28a'), rough=0.3)
    M['coffee'] = paint('coffee', rgb('#3b2415'), rough=0.2)
    M['lanyard'] = paint('lanyard', rgb('#1f8f6a'), rough=0.7)
    M['usb'] = paint('usb_body', rgb('#111417'), rough=0.35)
    M['usb_metal'] = paint('usb_metal', rgb('#c9ced3'), rough=0.2, metal=0.9)
    M['bin'] = paint('bin_mesh', rgb('#2a2f35'), rough=0.5, metal=0.4)
    M['led_green'] = emissive('led_green', rgb('#4fe08a'), 6.0)
    M['led_blue'] = emissive('led_blue', rgb('#6fb6ff'), 5.0)
    M['led_amber'] = emissive('led_amber', rgb('#ffb547'), 6.0)
    M['screen_glow'] = emissive('screen_glow', rgb('#c6d8ff'), 2.4)
    M['screen_off'] = paint('screen_off', rgb('#0c1014'), rough=0.12)
    M['phone_glow'] = emissive('phone_glow', rgb('#cfe0ff'), 1.2)
    M['deskphone_glow'] = emissive('deskphone_glow', rgb('#d8f5e8'), 0.8)
    M['intercom_glow'] = emissive('intercom_glow', rgb('#9fd8c0'), 1.6)
    M['sky'] = emissive('night_sky', rgb('#1b2a52'), 0.9)
    M['city'] = emissive('city_lights', rgb('#ffcf8a'), 3.0)
    M['glass'] = glass('window_glass')
    M['whiteboard'] = image_material('whiteboard', os.path.join(ART, 'whiteboard.png'), rough=0.25)
    M['sticky'] = image_material('sticky_marta', os.path.join(ART, 'sticky_marta.png'), rough=0.9)
    M['badge'] = image_material('badge', os.path.join(ART, 'badge.png'), rough=0.4)
    M['form'] = image_material('form_bank', os.path.join(ART, 'form_bank.png'), rough=0.9)
    M['usb_label'] = image_material('usb_label', os.path.join(ART, 'usb_label.png'), rough=0.8)
    M['sign'] = image_material('veltrix_sign', os.path.join(ART, 'veltrix_sign.png'), rough=0.5)
    M['poster'] = image_material('poster_callback', os.path.join(ART, 'poster_callback.png'), rough=0.6)
    M['exit'] = image_material('exit_sign', os.path.join(ART, 'exit_sign.png'), rough=0.4, emit=2.5)
    M['mousepad'] = image_material('mousepad_office', os.path.join(ART, 'mousepad_office.png'), rough=0.9)
    return M


# ---------------------------------------------------------------------- shell
def shell(M):
    g = 'shell'
    tag(box('slab', (W + T + LIP, D + T + LIP, 0.2), ((X0 - T + X1 + LIP) / 2, (Y0 - LIP + Y1 + T) / 2, -0.13), M['slab'], bevel=0.01), bake=g)
    tag(box('floor', (W + LIP, D + LIP, 0.03), ((X0 + X1 + LIP) / 2, (Y0 - LIP + Y1) / 2, -0.015), M['floor'], bevel=0.003), bake=g)
    # Carpet tiles under the desks; bare polished concrete by the door.
    cx0, cx1, cy0, cy1 = -2.55, X1 + LIP, -1.75, Y1
    tag(box('carpet', (cx1 - cx0, cy1 - cy0, 0.012), ((cx0 + cx1) / 2, (cy0 + cy1) / 2, 0.006), M['carpet'], bevel=0.002), bake=g)
    tag(box('carpet_trim', (0.03, cy1 - cy0, 0.014), (cx0 - 0.015, (cy0 + cy1) / 2, 0.007), M['carpet_edge'], bevel=0.002), bake=g)
    tag(box('carpet_trim_f', (cx1 - cx0 + 0.03, 0.03, 0.014), ((cx0 + cx1) / 2 - 0.015, cy0 - 0.015, 0.007), M['carpet_edge'], bevel=0.002), bake=g)

    yb = Y1 + T / 2
    xl, xr = X0 - T, X1 + LIP
    zb = -0.03
    # Back wall: bare concrete to the left of the window, plaster below and
    # above it, a column at the right hand end.
    tag(box('wall_back_concrete', (WX0 - xl, T, H - zb), ((xl + WX0) / 2, yb, (zb + H) / 2), M['concrete'], bevel=0.004), bake=g)
    tag(box('wall_back_r', (xr - WX1, T, H - zb), ((WX1 + xr) / 2, yb, (zb + H) / 2), M['wall'], bevel=0.004), bake=g)
    tag(box('wall_back_b', (WX1 - WX0, T, WZ0 - zb), ((WX0 + WX1) / 2, yb, (zb + WZ0) / 2), M['wall'], bevel=0.0), bake=g)
    tag(box('wall_back_t', (WX1 - WX0, T, H - WZ1), ((WX0 + WX1) / 2, yb, (WZ1 + H) / 2), M['wall'], bevel=0.0), bake=g)
    # Left wall.
    tag(box('wall_left', (T, D + LIP, H - zb), (X0 - T / 2, (Y0 - LIP + Y1) / 2, (zb + H) / 2), M['wall_left'], bevel=0.004), bake=g)
    # Skirting.
    tag(box('skirt_back', (WX1 - X0, 0.014, 0.07), ((X0 + WX1) / 2, Y1 - 0.007, 0.035), M['graphite'], bevel=0.002), bake=g)
    tag(box('skirt_left', (0.014, D, 0.07), (X0 + 0.007, (Y0 + Y1) / 2, 0.035), M['graphite'], bevel=0.002), bake=g)

    # The walls and ceiling you never see: they close the room for the bake.
    for name, size, loc in (
        ('hide_front', (W + 2 * T + LIP, T, H + 0.2), ((X0 + X1) / 2, Y0 - LIP - T / 2, H / 2)),
        ('hide_right', (T, D + 2 * T + LIP, H + 0.2), (X1 + LIP + T / 2, (Y0 + Y1) / 2, H / 2)),
        ('hide_ceiling', (W + 2 * T + LIP, D + 2 * T + LIP, T), ((X0 + X1) / 2, (Y0 + Y1) / 2, H + T / 2)),
    ):
        o = box(name, size, loc, M['wall'], bevel=0)
        o.visible_camera = False
        tag(o, export=False)


def window(M):
    g = 'shell'
    yf = Y1 + T / 2
    fw = 0.06
    cx, wz = (WX0 + WX1) / 2, (WZ0 + WZ1) / 2
    ww, wh = WX1 - WX0, WZ1 - WZ0
    parts = [
        box('win_head', (ww + fw, T + 0.02, fw), (cx, yf - 0.01, WZ1 + fw / 2), M['alu'], bevel=0.004),
        box('win_sill_frame', (ww + fw, T + 0.02, fw), (cx, yf - 0.01, WZ0 - fw / 2), M['alu'], bevel=0.004),
        box('win_l', (fw, T + 0.02, wh), (WX0 - fw / 2 + 0.03, yf - 0.01, wz), M['alu'], bevel=0.004),
        box('win_r', (fw, T + 0.02, wh), (WX1 + fw / 2 - 0.03, yf - 0.01, wz), M['alu'], bevel=0.004),
        box('win_sill', (ww + 0.1, 0.2, 0.03), (cx, Y1 - 0.08, WZ0 - fw - 0.015), M['trim'], bevel=0.005),
    ]
    for i, mx in enumerate(MULLIONS):
        parts.append(box(f'win_mullion_{i}', (0.05, 0.08, wh), (mx, yf, wz), M['alu'], bevel=0.003))
    parts.append(box('win_transom', (ww, 0.06, 0.04), (cx, yf, WZ0 + 0.46), M['alu'], bevel=0.003))
    for p in parts:
        tag(p, bake=g)

    # The glass the game paints the night sky on. Shipped, not baked.
    sky = plane('window_sky', ww, wh, (cx, yf + 0.02, wz), M['glass'])
    tag(sky, export=True, sky=True)
    # Outside, for the bake only: the city at night, lighting the room.
    out = plane('outside_sky', 7, 4, (cx, Y1 + 1.8, 1.6), M['sky'])
    out.visible_camera = False
    tag(out, export=False)


def door(M):
    g = 'furniture'
    x = X0 + 0.022
    yc, dw, dh = -1.5, 0.92, 2.1
    parts = [box('door_leaf', (0.045, dw, dh), (x, yc, dh / 2), M['door'], bevel=0.005)]
    # A narrow vision panel, the way office doors have them.
    parts.append(box('door_vision', (0.05, 0.12, 0.9), (x, yc + 0.22, 1.35), paint('door_glass', rgb('#27323a'), rough=0.1), bevel=0.004))
    fw = 0.06
    parts += [
        box('door_frame_top', (0.04, dw + 2 * fw, fw), (X0 + 0.02, yc, dh + fw / 2), M['alu'], bevel=0.004),
        box('door_frame_l', (0.04, fw, dh), (X0 + 0.02, yc - dw / 2 - fw / 2, dh / 2), M['alu'], bevel=0.004),
        box('door_frame_r', (0.04, fw, dh), (X0 + 0.02, yc + dw / 2 + fw / 2, dh / 2), M['alu'], bevel=0.004),
    ]
    hy = yc - dw / 2 + 0.1
    parts += [
        cylinder('door_rose', 0.03, 0.012, (x + 0.028, hy, 1.02), M['steel'], rot=(0, 90 * DEG, 0), verts=20),
        box('door_lever', (0.02, 0.14, 0.02), (x + 0.055, hy + 0.06, 1.02), M['steel'], bevel=0.006),
        box('door_push_plate', (0.004, 0.1, 0.3), (x + 0.025, hy, 1.35), M['steel'], bevel=0.002),
    ]
    for p in parts:
        tag(p, bake=g)
    # Exit sign above the door, lit.
    tag(box('exit_box', (0.08, 0.36, 0.15), (X0 + 0.06, yc, dh + 0.26), M['plastic_light'], bevel=0.006), bake='decor')
    ex = plane('exit_face', 0.34, 0.13, (X0 + 0.101, yc, dh + 0.26), M['exit'], rot=(0, 0, 90 * DEG))
    tag(ex, bake='decor')


def intercom(M):
    g = 'ix_intercom'
    x, y, z = X0 + 0.02, -0.72, 1.36
    parts = [
        box('intercom_body', (0.04, 0.14, 0.24), (x + 0.02, y, z), M['plastic_light'], bevel=0.008),
        box('intercom_screen_bezel', (0.012, 0.11, 0.085), (x + 0.042, y, z + 0.055), M['black'], bevel=0.003),
        plane('intercom_screen', 0.1, 0.075, (x + 0.0485, y, z + 0.055), M['intercom_glow'], rot=(0, 0, 90 * DEG)),
        cylinder('intercom_button', 0.018, 0.012, (x + 0.045, y, z - 0.05), M['steel'], rot=(0, 90 * DEG, 0), verts=20),
        box('intercom_led', (0.006, 0.012, 0.006), (x + 0.044, y + 0.045, z - 0.05), M['led_green'], bevel=0),
    ]
    for i in range(4):
        parts.append(box('intercom_grille', (0.004, 0.07, 0.004), (x + 0.042, y, z - 0.005 - i * 0.012), M['graphite'], bevel=0))
    for p in parts:
        tag(p, bake=g, ix='intercom')


def whiteboard(M):
    g = 'ix_whiteboard'
    x, yc, zc, w, h = X0 + 0.02, 0.9, 1.5, 1.7, 1.06
    parts = [
        box('wb_back', (0.02, w, h), (x + 0.01, yc, zc), M['alu_light'], bevel=0.004),
        plane('wb_face', w - 0.04, h - 0.04, (x + 0.021, yc, zc), M['whiteboard'], rot=(0, 0, 90 * DEG)),
        box('wb_tray', (0.07, w - 0.2, 0.02), (x + 0.045, yc, zc - h / 2 - 0.01), M['alu_light'], bevel=0.004),
    ]
    for i, (col, dy) in enumerate((('#1d4fb8', -0.3), ('#d12e2e', -0.18), ('#178a4c', -0.06), ('#202428', 0.05))):
        parts.append(cylinder(f'wb_marker_{i}', 0.009, 0.13, (x + 0.05, yc + dy, zc - h / 2 + 0.01), paint(f'marker_{i}', rgb(col), rough=0.4), rot=(90 * DEG, 0, 0), verts=12))
    parts.append(box('wb_eraser', (0.05, 0.12, 0.035), (x + 0.05, yc + 0.25, zc - h / 2 + 0.02), M['black'], bevel=0.006))
    for p in parts:
        tag(p, bake=g, ix='whiteboard')


def back_wall_decor(M):
    # The Veltrix sign on the bare concrete, and the security poster.
    sign = plane('veltrix_sign', 1.1, 0.275, (-2.2, Y1 - 0.014, 2.2), M['sign'])
    tag(sign, bake='decor')
    tag(box('sign_back', (1.12, 0.01, 0.29), (-2.2, Y1 - 0.005, 2.2), M['graphite'], bevel=0.002), bake='decor')
    poster = plane('poster_callback', 0.42, 0.594, (-1.62, Y1 - 0.016, 1.45), M['poster'])
    tag(poster, bake='decor')
    tag(box('poster_frame', (0.45, 0.01, 0.624), (-1.62, Y1 - 0.005, 1.45), M['alu'], bevel=0.003), bake='decor')
    # Fire alarm call point and the camera watching the door.
    fa = import_model('fire_alarm', name='fire_alarm')
    fit(fa, height=0.12)
    put(fa, X0 + 0.02, -2.12, 1.38, rz=90)
    tag(fa, bake='decor')
    cam = import_model('security_camera_01', name='security_camera', decimate=0.3)
    remove_material_faces(cam, 'glass')
    fit(cam, depth=0.36)
    put(cam, X0 + 0.14, 2.05, 2.5, rz=180)
    tag(cam, bake='decor')


# ------------------------------------------------------------------ furniture
def import_desk(name, pos, rz, split=None):
    """The Poly Haven metal desk, placed. With split, that one drawer comes
    out as its own object, still exactly in place, so it can be the
    interactive desk drawer."""
    path = hb.sources()['models']['metal_office_desk']
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.parent is not None:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    meshes = [o for o in new if o.type == 'MESH']
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    for m in meshes:
        if m.data.uv_layers:
            m.data.uv_layers[0].name = 'UVMap'
    part = [o for o in meshes if split and o.name.startswith(split)]
    rest = [o for o in meshes if o not in part]
    objs = [hb.join(rest, name)] + ([hb.join(part, name + '_drawer')] if part else [])
    for o in objs:
        o['uv_src'] = 'UVMap'
        hb.apply(o)
    # One pivot for both: the bottom centre of the desk.
    bb = [objs[0].matrix_world @ Vector(c) for c in objs[0].bound_box]
    pivot = Vector(((min(v.x for v in bb) + max(v.x for v in bb)) / 2, (min(v.y for v in bb) + max(v.y for v in bb)) / 2, min(v.z for v in bb)))
    for o in objs:
        o.data.transform(Matrix.Translation(o.location - pivot))
        o.location = Vector((0, 0, 0))
        o.location = Vector((pos[0], pos[1], 0))
        o.rotation_euler = (0, 0, rz * DEG)
    return objs


def desks(M):
    desk, drawer = import_desk('desk_main', DESK, 0, split='metal_office_desk_drawer_04')
    tag(desk, bake='furniture')
    tag(drawer, bake='ix_drawer', ix='drawer')
    (ret,) = import_desk('desk_return', RETURN, -90)
    tag(ret, bake='furniture')
    (other,) = import_desk('desk_other', (-1.1, -0.45), 0)
    tag(other, bake='furniture')
    # The divider along the back of the desk across the aisle, and what is
    # pinned to it.
    tag(box('divider', (2.0, 0.035, 0.52), (-1.1, 0.04, DESK_Z + 0.26), M['pinboard'], bevel=0.01), bake='furniture')
    tag(box('divider_cap', (2.02, 0.045, 0.02), (-1.1, 0.04, DESK_Z + 0.53), M['alu'], bevel=0.004), bake='furniture')
    for i, (px, pz, rz) in enumerate(((-1.75, 1.12, 3), (-1.42, 1.08, -4), (-0.6, 1.14, 2))):
        tag(plane(f'pinned_{i}', 0.16, 0.22, (px, 0.02, pz), M['paper'], rot=(0, rz * DEG, 0)), bake='furniture')


def chairs(M):
    def chair(name, x, y, rz, fabric):
        parts = [soft(box(f'{name}_seat', (0.5, 0.48, 0.08), (0, 0.02, 0.48), fabric, bevel=0), level=1, bevel=0.03, segments=3)]
        back = soft(box(f'{name}_back', (0.46, 0.06, 0.58), (0, -0.25, 0.9), fabric, bevel=0), level=1, bevel=0.028, segments=3)
        back.rotation_euler = (-8 * DEG, 0, 0)
        parts.append(back)
        parts.append(box(f'{name}_spine', (0.06, 0.04, 0.3), (0, -0.27, 0.58), M['black'], bevel=0.008))
        for side in (-1, 1):
            parts.append(box(f'{name}_arm_post', (0.035, 0.035, 0.2), (side * 0.26, -0.02, 0.6), M['black'], bevel=0.006))
            parts.append(soft(box(f'{name}_arm_pad', (0.06, 0.24, 0.03), (side * 0.26, 0.0, 0.71), M['black'], bevel=0), level=1, bevel=0.01, segments=2))
        parts.append(cylinder(f'{name}_lift', 0.025, 0.3, (0, 0, 0.29), M['steel']))
        parts.append(cylinder(f'{name}_hub', 0.045, 0.05, (0, 0, 0.11), M['black']))
        for i in range(5):
            a = i / 5 * 2 * math.pi
            leg = box(f'{name}_leg', (0.045, 0.3, 0.03), (math.sin(a) * 0.15, math.cos(a) * 0.15, 0.08), M['black'], bevel=0.008)
            leg.rotation_euler = (0, 0, -a)
            parts.append(leg)
            parts.append(sphere(f'{name}_wheel', 0.028, (math.sin(a) * 0.29, math.cos(a) * 0.29, 0.03), M['black'], scale=(1, 0.7, 1)))
        place(parts, x, y, 0, rz, bake='furniture')

    chair('chair_sam', 1.55, 0.72, 200, M['chair'])
    chair('chair_other', -1.05, -1.28, -6, M['chair_teal'])


def printer_corner(M):
    # A low cabinet under the shared printer, against the bare concrete.
    cx, cy = -2.52, Y1 - 0.3
    tag(box('print_cabinet', (0.9, 0.5, 0.7), (cx, cy, 0.35), M['plastic_light'], bevel=0.008), bake='furniture')
    for i, dx in enumerate((-0.22, 0.22)):
        tag(box(f'print_cab_door_{i}', (0.42, 0.012, 0.62), (cx + dx, cy - 0.255, 0.36), M['plastic_light'], bevel=0.004), bake='furniture')
        tag(box(f'print_cab_pull_{i}', (0.012, 0.012, 0.12), (cx + dx + (0.16 if i == 0 else -0.16), cy - 0.265, 0.45), M['steel'], bevel=0.003), bake='furniture')

    g = 'ix_printer'
    z = 0.7
    parts = [
        box('printer_base', (0.56, 0.46, 0.2), (cx, cy + 0.02, z + 0.1), M['plastic_light'], bevel=0.01),
        box('printer_tray_1', (0.5, 0.012, 0.07), (cx, cy - 0.212, z + 0.055), M['plastic_grey'], bevel=0.004),
        box('printer_tray_2', (0.5, 0.012, 0.07), (cx, cy - 0.212, z + 0.135), M['plastic_grey'], bevel=0.004),
        box('printer_body', (0.56, 0.44, 0.2), (cx, cy + 0.03, z + 0.3), M['plastic_light'], bevel=0.012),
        box('printer_output_gap', (0.44, 0.3, 0.06), (cx - 0.02, cy - 0.02, z + 0.25), M['graphite'], bevel=0.004),
        box('printer_scanner', (0.56, 0.44, 0.07), (cx, cy + 0.03, z + 0.435), M['plastic_light'], bevel=0.01),
        box('printer_lid_line', (0.5, 0.38, 0.004), (cx, cy + 0.03, z + 0.471), M['plastic_grey'], bevel=0.0),
    ]
    panel = box('printer_panel', (0.2, 0.09, 0.02), (cx + 0.16, cy - 0.215, z + 0.43), M['black'], bevel=0.004)
    panel.rotation_euler = (35 * DEG, 0, 0)
    parts.append(panel)
    scr = plane('printer_screen', 0.12, 0.05, (cx + 0.15, cy - 0.228, z + 0.438), M['led_blue'], rot=(-55 * DEG, 0, 0))
    parts.append(scr)
    parts.append(box('printer_led', (0.012, 0.004, 0.012), (cx + 0.25, cy - 0.215, z + 0.3), M['led_green'], bevel=0))
    # The printed bank change form lying in the output tray.
    form = plane('printer_form', 0.21, 0.297, (cx - 0.02, cy - 0.03, z + 0.282), M['form'], rot=(-90 * DEG, 0, 0))
    form.rotation_euler = (-90 * DEG, 0, 4 * DEG)
    parts.append(form)
    for p in parts:
        tag(p, bake=g, ix='printer')


def shredder(M):
    g = 'ix_shredder'
    x, y = -1.78, Y1 - 0.26
    body = paint('shredder_bin', rgb('#8b939a'), rough=0.4)
    parts = [
        box('shredder_bin', (0.38, 0.28, 0.5), (x, y, 0.25), body, bevel=0.012),
        box('shredder_window', (0.012, 0.18, 0.28), (x + 0.19, y, 0.22), paint('shredder_window', rgb('#3a4148'), rough=0.1), bevel=0.003),
        box('shredder_head', (0.4, 0.3, 0.12), (x, y, 0.56), M['graphite'], bevel=0.012),
        box('shredder_slot', (0.26, 0.012, 0.004), (x, y + 0.02, 0.621), M['black'], bevel=0),
        box('shredder_led', (0.012, 0.012, 0.004), (x + 0.15, y - 0.09, 0.621), M['led_green'], bevel=0),
        box('shredder_switch', (0.04, 0.025, 0.008), (x - 0.13, y - 0.09, 0.622), M['black'], bevel=0.002),
    ]
    for p in parts:
        tag(p, bake=g, ix='shredder')


# ------------------------------------------------------------------ the desk
def computer(M):
    g = 'ix_computer'
    dx, dy = DESK
    sw, sh = 0.62, 0.36
    zc = DESK_Z + 0.14 + sh / 2
    screens = (('computer', dx - 0.33, dy + 0.2, 10), ('second', dx + 0.38, dy + 0.18, -14))
    parts = []
    for sid, mx, my, rz in screens:
        mon = [
            box(f'mon_{sid}_base', (0.24, 0.17, 0.012), (0, 0.03, DESK_Z + 0.006), M['graphite'], bevel=0.004),
            box(f'mon_{sid}_neck', (0.05, 0.03, 0.2), (0, 0.06, DESK_Z + 0.11), M['graphite'], bevel=0.006),
            box(f'mon_{sid}_bezel', (sw, 0.026, sh), (0, 0, zc), M['black'], bevel=0.005),
            box(f'mon_{sid}_back', (0.36, 0.03, 0.22), (0, 0.025, zc), M['graphite'], bevel=0.02),
        ]
        scr = plane(f'screen_{sid}', sw - 0.022, sh - 0.022, (0, -0.0135, zc), M['screen_glow'])
        place(mon, mx, my, 0, rz, bake=g, ix='computer')
        place([scr], mx, my, 0, rz, export=True, screen=sid)
        parts += mon
    # Keyboard, low profile, dark keys.
    kx, ky = dx + 0.05, Y1 - 0.72
    kb = [box('kb_deck', (0.44, 0.14, 0.016), (0, 0, DESK_Z + 0.008), M['graphite'], bevel=0.004)]
    for r in range(5):
        for c in range(15):
            if r == 4 and 4 <= c <= 10:
                continue
            kb.append(box('key', (0.024, 0.021, 0.007), (-0.2 + c * 0.0285, -0.052 + r * 0.026, DESK_Z + 0.019), M['keycap'], bevel=0.0015, segments=1))
    kb.append(box('key_space', (0.19, 0.021, 0.007), (-0.005, 0.052, DESK_Z + 0.019), M['keycap'], bevel=0.0015, segments=1))
    place(kb, kx, ky, 0, 0, bake=g, ix='computer')
    # Mouse on its mat.
    pad = plane('mousepad', 0.3, 0.24, (dx + 0.46, Y1 - 0.72, DESK_Z + 0.002), M['mousepad'], rot=(-90 * DEG, 0, 0))
    mouse = sphere('mouse', 0.038, (dx + 0.47, Y1 - 0.72, DESK_Z + 0.014), M['black'], scale=(0.8, 1.3, 0.45))
    for p in (pad, mouse):
        tag(p, bake=g, ix='computer')


def sticky(M):
    # Half under the front edge of the keyboard, where Sam cannot miss it.
    note = plane('sticky_note', 0.076, 0.076, (DESK[0] + 0.25, Y1 - 0.8, DESK_Z + 0.0015), M['sticky'], rot=(-90 * DEG, 0, 0))
    note.rotation_euler = (-90 * DEG, 0, -9 * DEG)
    tag(note, bake='ix_sticky', ix='sticky')


def mobile(M):
    g = 'ix_phone'
    px, py = DESK[0] + 0.74, Y1 - 0.62
    tilt = 18 * DEG
    parts = [
        box('stand_base', (0.09, 0.085, 0.008), (0, 0.01, DESK_Z + 0.004), M['graphite'], bevel=0.003),
        box('stand_back', (0.07, 0.008, 0.11), (0, 0.035, DESK_Z + 0.055), M['graphite'], bevel=0.003, rot=(-tilt, 0, 0)),
        box('stand_lip', (0.08, 0.018, 0.012), (0, -0.022, DESK_Z + 0.014), M['graphite'], bevel=0.003),
        box('phone_body', (0.075, 0.009, 0.158), (0, 0.012, DESK_Z + 0.098), paint('phone_body', rgb('#1e2227'), rough=0.3, metal=0.4), bevel=0.008, segments=3, rot=(-tilt, 0, 0)),
    ]
    normal = Vector((0, -math.cos(tilt), math.sin(tilt)))
    centre = Vector((0, 0.012, DESK_Z + 0.098)) + normal * 0.0052
    scr = plane('screen_phone', 0.068, 0.148, tuple(centre), M['phone_glow'], rot=(-tilt, 0, 0))
    place(parts, px, py, 0, -18, bake=g, ix='phone')
    place([scr], px, py, 0, -18, export=True, screen='phone')


def wedge(name, w, d, h_front, h_back, mat):
    """A block whose top slopes from h_back at the back (+Y) down to h_front
    at the front: a desk phone's body."""
    import bmesh as _bm
    bm = _bm.new()
    x0, x1, y0, y1 = -w / 2, w / 2, -d / 2, d / 2
    v = [bm.verts.new(c) for c in (
        (x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0),
        (x0, y0, h_front), (x1, y0, h_front), (x1, y1, h_back), (x0, y1, h_back))]
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([v[i] for i in f])
    _bm.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = hb._obj_from_bmesh(name, bm, mat)
    mod = obj.modifiers.new('bevel', 'BEVEL')
    mod.width = 0.006
    mod.segments = 2
    return obj


def deskphone(M):
    g = 'ix_deskphone'
    px, py, rz = DESK[0] - 0.74, Y1 - 0.42, 18
    w, d, hf, hb_ = 0.2, 0.2, 0.03, 0.1
    slope = math.atan2(hb_ - hf, d)
    body = wedge('dp_body', w, d, hf, hb_, M['graphite'])
    body.location = (0.03, 0, DESK_Z)
    parts = [body]
    # The handset lying along the left side, in its cradle.
    parts.append(soft(box('dp_handset', (0.05, 0.19, 0.03), (-0.1, 0.0, DESK_Z + 0.075), M['black'], bevel=0), level=1, bevel=0.012, segments=2))
    for sy in (-0.07, 0.07):
        parts.append(sphere('dp_handset_end', 0.026, (-0.1, sy, DESK_Z + 0.07), M['black'], scale=(1.0, 1.25, 0.75)))
    parts.append(box('dp_cradle', (0.055, 0.2, 0.05), (-0.1, 0.0, DESK_Z + 0.025), M['graphite'], bevel=0.008))
    parts.append(torus('dp_cord', 0.028, 0.004, (-0.1, -0.12, DESK_Z + 0.03), M['black'], rot=(0, 90 * DEG, 0), seg=18, ring=6))
    # The display and keypad face: the game draws the phone's own screen here,
    # flush on the sloped top.
    mid = (hf + hb_) / 2
    normal = Vector((0, -math.sin(slope), math.cos(slope)))
    centre = Vector((0.03, 0.0, DESK_Z + mid)) + normal * 0.003
    scr = plane('screen_deskphone', w - 0.03, (d / math.cos(slope)) - 0.03, tuple(centre), M['deskphone_glow'], rot=(-(90 * DEG - slope), 0, 0))
    place(parts, px, py, 0, rz, bake=g, ix='deskphone')
    place([scr], px, py, 0, rz, export=True, screen='deskphone')


def notebook(M):
    g = 'ix_notebook'
    cover = paint('notebook_cover', rgb('#1d2a30'), rough=0.6)
    parts = [
        box('nb_pages', (0.14, 0.2, 0.014), (0.004, 0, DESK_Z + 0.009), M['paper'], bevel=0.002),
        box('nb_cover_bottom', (0.148, 0.21, 0.003), (0, 0, DESK_Z + 0.0015), cover, bevel=0.001),
        box('nb_cover_top', (0.148, 0.21, 0.003), (0, 0, DESK_Z + 0.0175), cover, bevel=0.001),
        box('nb_spine', (0.006, 0.21, 0.019), (-0.074, 0, DESK_Z + 0.0095), cover, bevel=0.002),
        box('nb_band', (0.006, 0.212, 0.0195), (0.055, 0, DESK_Z + 0.0098), M['lanyard'], bevel=0.0),
        cylinder('nb_pen', 0.005, 0.14, (0.0, -0.02, DESK_Z + 0.024), paint('pen_blue', rgb('#1f3c88'), rough=0.3), rot=(90 * DEG, 0, 0), verts=10),
    ]
    place(parts, DESK[0] - 0.5, Y1 - 0.8, 0, -10, bake=g, ix='notebook')


def usb(M):
    g = 'ix_usb'
    parts = [
        box('usb_body', (0.07, 0.024, 0.01), (0, 0, DESK_Z + 0.005), M['usb'], bevel=0.003),
        box('usb_plug', (0.016, 0.014, 0.006), (0.043, 0, DESK_Z + 0.005), M['usb_metal'], bevel=0.001),
        plane('usb_label', 0.042, 0.016, (-0.006, 0, DESK_Z + 0.0105), M['usb_label'], rot=(-90 * DEG, 0, 0)),
    ]
    place(parts, DESK[0] + 0.72, Y1 - 0.9, 0, 24, bake=g, ix='usb')


def badge(M):
    g = 'ix_badge'
    bx, by = RETURN[0] - 0.12, 1.02
    card = box('badge_card', (0.056, 0.088, 0.003), (0, 0, DESK_Z + 0.004), M['plastic_light'], bevel=0.001)
    face = plane('badge_face', 0.054, 0.086, (0, 0, DESK_Z + 0.0058), M['badge'], rot=(-90 * DEG, 0, 0))
    holder = box('badge_holder', (0.062, 0.096, 0.004), (0, 0, DESK_Z + 0.0025), paint('badge_holder', rgb('#c8d0d4'), rough=0.2), bevel=0.002)
    clip = box('badge_clip', (0.014, 0.02, 0.006), (0, 0.055, DESK_Z + 0.004), M['steel'], bevel=0.002)
    lanyard = torus('lanyard', 0.16, 0.006, (0.0, 0.2, DESK_Z + 0.004), M['lanyard'], seg=40, ring=4)
    lanyard.scale = (0.55, 1.0, 0.25)
    place([card, face, holder, clip, lanyard], bx, by, 0, 18, bake=g, ix='badge')


def desk_things(M):
    # Mug of coffee gone cold, by the second monitor.
    mx, my = DESK[0] + 0.62, Y1 - 0.38
    mug = [
        cylinder('mug', 0.04, 0.095, (0, 0, DESK_Z + 0.0475), M['mug'], verts=28),
        cylinder('mug_band', 0.0405, 0.02, (0, 0, DESK_Z + 0.07), M['mug_band'], verts=28),
        cylinder('mug_coffee', 0.036, 0.004, (0, 0, DESK_Z + 0.085), M['coffee'], verts=24),
        torus('mug_handle', 0.025, 0.007, (0.045, 0, DESK_Z + 0.05), M['mug'], rot=(90 * DEG, 0, 0), arc=200, seg=14, ring=8),
    ]
    mug[3].rotation_euler = (90 * DEG, 0, -80 * DEG)
    place(mug, mx, my, 0, 0, bake='decor')
    # Headphones on the return.
    hx, hy, z = RETURN[0] + 0.05, 0.72, DESK_Z
    band = torus('hp_band', 0.085, 0.011, (hx, hy, z + 0.012), M['black'], rot=(0, 0, 20 * DEG), arc=200, seg=24, ring=8)
    tag(band, bake='decor')
    for side in (-1, 1):
        a = 20 * DEG + (0 if side > 0 else 200 * DEG)
        ox, oy = math.cos(a) * 0.085, math.sin(a) * 0.085
        tag(cylinder('hp_cup', 0.042, 0.03, (hx + ox, hy + oy, z + 0.018), M['black'], verts=24), bake='decor')
        tag(cylinder('hp_pad', 0.038, 0.012, (hx + ox, hy + oy, z + 0.036), M['chair'], verts=24), bake='decor')
    # Pen pot, desk lamp and a small plant on the return.
    pens = import_model('stationery_supplies', pick=['stationery_supplies_pencilcup', 'stationery_supplies_pen_red', 'stationery_supplies_pen_blue', 'stationery_supplies_pencil_new_a'], name='pen_pot')
    fit(pens, height=0.14)
    put(pens, RETURN[0] + 0.2, 2.12, DESK_Z, rz=90)
    tag(pens, bake='decor')
    lamp = import_model('desk_lamp_arm_01', name='desk_lamp', decimate=0.35)
    fit(lamp, height=0.62)
    put(lamp, RETURN[0] + 0.25, 1.78, DESK_Z, rz=250)
    tag(lamp, bake='decor')
    plant = import_model('potted_plant_04', name='desk_plant', decimate=0.5)
    fit(plant, height=0.24)
    put(plant, RETURN[0] + 0.2, 0.52, DESK_Z, rz=0)
    tag(plant, bake='decor')
    # A mesh bin between the pedestal and the return.
    import bmesh as _bm
    bm = _bm.new()
    _bm.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=28, radius1=0.12, radius2=0.14, depth=0.32)
    for f in [f for f in bm.faces if f.normal.z > 0.9]:
        bm.faces.remove(f)
    for v in bm.verts:
        v.co.z += 0.16
    me = bpy.data.meshes.new('bin')
    bm.to_mesh(me)
    bm.free()
    bin_ = bpy.data.objects.new('bin', me)
    bpy.context.scene.collection.objects.link(bin_)
    bin_.data.materials.append(M['bin'])
    s = bin_.modifiers.new('wall', 'SOLIDIFY')
    s.thickness = 0.005
    for p in bin_.data.polygons:
        p.use_smooth = True
    bin_.location = (1.98, 1.02, 0)
    tag(bin_, bake='decor')
    tag(torus('bin_rim', 0.14, 0.006, (1.98, 1.02, 0.32), M['bin'], seg=28, ring=6), bake='decor')


def aisle_things(M):
    # The desk across the aisle, left for the night.
    ox, oy = -1.1, -0.45
    mon = [
        box('other_mon_base', (0.24, 0.17, 0.012), (0, 0.03, DESK_Z + 0.006), M['graphite'], bevel=0.004),
        box('other_mon_neck', (0.05, 0.03, 0.2), (0, 0.06, DESK_Z + 0.11), M['graphite'], bevel=0.006),
        box('other_mon_bezel', (0.56, 0.026, 0.33), (0, 0, DESK_Z + 0.3), M['black'], bevel=0.005),
        plane('other_mon_screen', 0.54, 0.31, (0, -0.0135, DESK_Z + 0.3), M['screen_off']),
    ]
    place(mon, ox + 0.1, oy + 0.3, 0, 0, bake='furniture')
    kb = box('other_kb', (0.44, 0.14, 0.016), (ox + 0.1, oy - 0.1, DESK_Z + 0.008), M['graphite'], bevel=0.004)
    tag(kb, bake='furniture')
    plant = import_model('potted_plant_02', name='other_plant', decimate=0.12)
    fit(plant, height=0.42)
    put(plant, ox - 0.72, oy + 0.22, DESK_Z, rz=30)
    tag(plant, bake='decor')
    clip = import_model('clipboard', name='clipboard', decimate=0.4)
    fit(clip, depth=0.3)
    put(clip, ox + 0.62, oy - 0.05, DESK_Z, rz=-14)
    tag(clip, bake='decor')
    # The tall plant by the window, and the cleaners' sign by the door.
    tree = import_model('pachira_aquatica_01', pick=['pachira_aquatica_01_bark_a', 'pachira_aquatica_01_leaves_a'], name='tall_plant', decimate=0.2)
    fit(tree, height=1.7)
    put(tree, -1.32, Y1 - 0.34, 0, rz=20)
    tag(tree, bake='decor')
    sign = import_model('WetFloorSign_01', name='wet_floor_sign')
    fit(sign, height=0.62)
    put(sign, X0 + 0.48, -0.55, 0, rz=65)
    tag(sign, bake='decor')


# --------------------------------------------------------------------- lights
def lights():
    world_color(hexrgb('#0a1220'), 0.22)
    cool = (0.93, 0.97, 1.0)
    # Ceiling panels over each zone: cool office white.
    area_light('panel_desk', (1.3, 1.3, H - 0.03), 1.2, 330, rgb=cool, size_y=1.2)
    area_light('panel_aisle', (-1.1, -0.6, H - 0.03), 1.2, 260, rgb=cool, size_y=1.2)
    area_light('panel_printer', (-2.3, 1.7, H - 0.03), 1.0, 180, rgb=cool, size_y=1.0)
    # A soft fill from the open front, so faces towards the camera are not flat.
    hb.aim(area_light('fill', (2.2, -2.2, 2.1), 1.6, 120, rgb=(1.0, 0.97, 0.94)), (-0.4, 0.8, 0.7))
    # The desk lamp, warm, on the return.
    hb.aim(spot_light('desk_lamp_bulb', (RETURN[0] + 0.05, 1.62, DESK_Z + 0.5), 38, rgb=(1.0, 0.8, 0.58), angle=85, radius=0.03), (RETURN[0] - 0.25, 1.3, DESK_Z))
    # The monitors throw a little blue light at the keyboard and chair.
    hb.aim(area_light('monitor_wash', (DESK[0], Y1 - 0.35, DESK_Z + 0.33), 0.9, 22, rgb=(0.7, 0.8, 1.0), size_y=0.3), (DESK[0], Y1 - 1.2, DESK_Z))
    # The city through the window.
    area_light('city', ((WX0 + WX1) / 2, Y1 + 0.6, 1.6), 3.2, 60, rgb=(0.55, 0.65, 1.0), rot=(-90 * DEG, 0, 0), size_y=1.8)


def camera():
    return dollhouse_camera(target=(0.0, 0.15, 1.1), direction=(1.0, -1.06, 1.02), ortho_scale=10.0)


# ----------------------------------------------------------------------- build
def build():
    hb.reset()
    M = materials()
    shell(M)
    window(M)
    door(M)
    intercom(M)
    whiteboard(M)
    back_wall_decor(M)
    desks(M)
    chairs(M)
    printer_corner(M)
    shredder(M)
    computer(M)
    sticky(M)
    mobile(M)
    deskphone(M)
    notebook(M)
    usb(M)
    badge(M)
    desk_things(M)
    aisle_things(M)
    lights()
    camera()
    hb.uv_cube(list(bpy.context.scene.objects))
    # Directions from the room towards every camera the game uses: overview,
    # straight on, front right, above, and square on to the left wall for the
    # whiteboard, intercom and door.
    views = [(1.0, -1.06, 1.02), (0, -1, 0.1), (0.7, -0.7, 0.2), (0, 0, 1), (1, -0.5, 0.1), (1, 0, 0.3), (0.3, -0.6, 1)]
    return {'bake': BAKE, 'exposure': -0.6, 'views': views}
