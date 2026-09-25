"""
hb: the small Blender toolkit both rooms are built with.

Everything here runs inside Blender (bpy), headless:

    blender --background --factory-startup --python tools/blender/run.py -- ...

The idea is the RansomLeak pipeline in plain Python: model the room, light it
like a real room, bake the light into textures, export glTF. At runtime the
browser draws every surface with MeshBasicMaterial and pays nothing for light.

Conventions
  Blender is Z up, and the glTF exporter turns that into Y up. So in here
  +X is right, +Y is towards the back wall, +Z is up. The back wall sits at
  +Y and the left wall at -X, which is what the dollhouse camera looks at.

  Every object carries custom properties that decide where it goes:
    bake     name of the bake group (one texture atlas per group)
    export   False for light blockers and helpers that only exist for the bake
    ix       id of an interactive object (phone, computer, backpack...)
    screen   id of an HTML screen surface (computer, phone)
"""
import bpy
import bmesh
import json
import math
import os
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
CACHE = os.path.join(TOOLS, '.cache')

DEG = math.pi / 180


def sources():
    with open(os.path.join(CACHE, 'sources.resolved.json')) as f:
        return json.load(f)


# --------------------------------------------------------------------- scene
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'CYCLES'
    use_gpu(scene)
    world = bpy.data.worlds.new('World')
    scene.world = world
    return scene


def use_gpu(scene):
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'METAL'
        scene.cycles.device = 'GPU'
    except Exception as e:  # pragma: no cover - CPU fallback on other machines
        print('[hb] no GPU, baking on CPU:', e)
        scene.cycles.device = 'CPU'


def collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def link(obj, col=None):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    (col or bpy.context.scene.collection).objects.link(obj)
    return obj


def tag(obj, bake=None, export=True, ix=None, screen=None, **extra):
    if bake is not None:
        obj['bake'] = bake
    obj['export'] = bool(export)
    if ix:
        obj['ix'] = ix
    if screen:
        obj['screen'] = screen
    for k, v in extra.items():
        obj[k] = v
    return obj


def select_only(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or (objs[0] if objs else None)


# ----------------------------------------------------------------- materials
_mats = {}


def _principled(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if bsdf is None:
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return nt, bsdf


def color(name, rgb, rough=0.6, metal=0.0, emit=None, strength=0.0, alpha=1.0):
    """A flat colour. rgb is 0..1 in sRGB, the way a designer would pick it."""
    key = ('c', name)
    if key in _mats:
        return _mats[key]
    mat = bpy.data.materials.new(name)
    nt, bsdf = _principled(mat)
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(rgb), 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (*srgb_to_linear(emit), 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
    _mats[key] = mat
    return mat


def srgb_to_linear(rgb):
    def f(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(f(c) for c in rgb[:3])


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _uv_mapping(nt, tile, rotate=0.0):
    """UVMap coordinates scaled so one texture repeat covers `tile` metres.

    Procedural meshes get their UVMap from a 1 metre cube projection (see
    uv_cube), so UV units are metres and the grain of the floor and the grain
    of the desk come out at the same real size. The UV map is named explicitly
    because the bake adds a second one later.
    """
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'UVMap'
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1 / tile)
    mapping.inputs['Rotation'].default_value = (0, 0, rotate)
    nt.links.new(uvn.outputs['UV'], mapping.inputs['Vector'])
    return mapping


def textured(name, tex_id, tile=1.0, tint=None, rough=None, hue=0.5, sat=1.0, val=1.0,
             normal=0.4, rotate=0.0):
    """A Poly Haven texture on the mesh's metre scaled UVs."""
    key = ('t', name)
    if key in _mats:
        return _mats[key]
    maps = sources()['textures'][tex_id]
    mat = bpy.data.materials.new(name)
    nt, bsdf = _principled(mat)
    n = nt.nodes
    mapping = _uv_mapping(nt, tile, rotate)

    def img(path, non_color=False):
        node = n.new('ShaderNodeTexImage')
        node.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            node.image.colorspace_settings.name = 'Non-Color'
        nt.links.new(mapping.outputs['Vector'], node.inputs['Vector'])
        return node

    diff = img(maps['diff'])
    colour = diff.outputs['Color']
    if hue != 0.5 or sat != 1.0 or val != 1.0:
        hsv = n.new('ShaderNodeHueSaturation')
        hsv.inputs['Hue'].default_value = hue
        hsv.inputs['Saturation'].default_value = sat
        hsv.inputs['Value'].default_value = val
        nt.links.new(colour, hsv.inputs['Color'])
        colour = hsv.outputs['Color']
    if tint is not None:
        mix = n.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['B'].default_value = (*srgb_to_linear(tint), 1.0)
        nt.links.new(colour, mix.inputs['A'])
        colour = mix.outputs['Result']
    nt.links.new(colour, bsdf.inputs['Base Color'])

    if rough is not None:
        bsdf.inputs['Roughness'].default_value = rough
    elif 'rough' in maps:
        r = img(maps['rough'], non_color=True)
        nt.links.new(r.outputs['Color'], bsdf.inputs['Roughness'])
    if normal and 'nor' in maps:
        nm = img(maps['nor'], non_color=True)
        nmap = n.new('ShaderNodeNormalMap')
        nmap.inputs['Strength'].default_value = normal
        nt.links.new(nm.outputs['Color'], nmap.inputs['Color'])
        nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    _mats[key] = mat
    return mat


def paint(name, rgb, tex_id=None, amount=0.35, tile=1.0, rough=0.8, metal=0.0, rotate=0.0):
    """A flat colour you choose, with a texture's grain overlaid on it.

    This is how the walls come out the exact off white they should be while
    still reading as plaster: the colour is decided here, the texture only
    adds variation around it.
    """
    key = ('p', name)
    if key in _mats:
        return _mats[key]
    mat = bpy.data.materials.new(name)
    nt, bsdf = _principled(mat)
    base = (*srgb_to_linear(rgb), 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if tex_id is None:
        bsdf.inputs['Base Color'].default_value = base
        _mats[key] = mat
        return mat
    maps = sources()['textures'][tex_id]
    mapping = _uv_mapping(nt, tile, rotate)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(maps['diff'], check_existing=True)
    nt.links.new(mapping.outputs['Vector'], tex.inputs['Vector'])
    grey = nt.nodes.new('ShaderNodeHueSaturation')
    grey.inputs['Saturation'].default_value = 0.0
    nt.links.new(tex.outputs['Color'], grey.inputs['Color'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'OVERLAY'
    mix.inputs['Factor'].default_value = amount
    mix.inputs['A'].default_value = base
    nt.links.new(grey.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    _mats[key] = mat
    return mat


def uv_cube(objs):
    """Metre scaled cube projection UVs for every procedural mesh that has none.

    Done in each object's own space before anything is joined, so a rotated
    rug keeps its pattern square to its edges.
    """
    todo = [o for o in objs if o.type == 'MESH' and not o.data.uv_layers]
    if not todo:
        return
    for o in todo:
        o.data.uv_layers.new(name='UVMap')
    select_only(todo)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=1.0, correct_aspect=True, clip_to_bounds=False, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def image_material(name, path, rough=0.5, emit=0.0):
    """A picture on a flat card (posters, photos). Uses the mesh's own UVs."""
    key = ('i', name)
    if key in _mats:
        return _mats[key]
    mat = bpy.data.materials.new(name)
    nt, bsdf = _principled(mat)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(path, check_existing=True)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    if emit:
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emit
    _mats[key] = mat
    return mat


def emissive(name, rgb, strength):
    key = ('e', name, strength)
    if key in _mats:
        return _mats[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*srgb_to_linear(rgb), 1.0)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    _mats[key] = mat
    return mat


def glass(name='glass'):
    key = ('g', name)
    if key in _mats:
        return _mats[key]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    nt.links.new(tr.outputs['BSDF'], out.inputs['Surface'])
    _mats[key] = mat
    return mat


# ---------------------------------------------------------------- primitives
def _obj_from_bmesh(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def _finish(obj, loc, rot, bevel, segments, smooth):
    obj.location = Vector(loc)
    obj.rotation_euler = tuple(r for r in rot)
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'ANGLE'
        mod.angle_limit = 50 * DEG
        mod.harden_normals = False
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def box(name, size, loc=(0, 0, 0), mat=None, rot=(0, 0, 0), bevel=0.004, segments=2,
        smooth=False, origin='center'):
    """An axis aligned box of exactly size (x, y, z) metres.

    origin='bottom' puts the object origin on the bottom face, which is what you
    want for anything that stands on a floor or a desk.
    """
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    z0 = 0.5 if origin == 'bottom' else 0.0
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, (v.co.z + z0) * sz))
    obj = _obj_from_bmesh(name, bm, mat)
    return _finish(obj, loc, rot, bevel, segments, smooth)


def cylinder(name, radius, depth, loc=(0, 0, 0), mat=None, rot=(0, 0, 0), verts=32,
             bevel=0.003, segments=2, radius_top=None, origin='center', smooth=True):
    bm = bmesh.new()
    r2 = radius if radius_top is None else radius_top
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts,
                          radius1=radius, radius2=r2, depth=depth)
    if origin == 'bottom':
        for v in bm.verts:
            v.co.z += depth / 2
    obj = _obj_from_bmesh(name, bm, mat)
    return _finish(obj, loc, rot, bevel, segments, smooth)


def sphere(name, radius, loc=(0, 0, 0), mat=None, scale=(1, 1, 1), rot=(0, 0, 0), segments=24, rings=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    for v in bm.verts:
        v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2]))
    obj = _obj_from_bmesh(name, bm, mat)
    return _finish(obj, loc, rot, 0, 0, True)


def torus(name, major, minor, loc=(0, 0, 0), mat=None, rot=(0, 0, 0), arc=360, seg=32, ring=12):
    """A torus, or a slice of one (arc in degrees) for headbands and handles."""
    bm = bmesh.new()
    verts = []
    steps = seg if arc >= 360 else seg + 1
    for i in range(steps):
        a = (arc * DEG) * i / seg
        ring_verts = []
        for j in range(ring):
            b = 2 * math.pi * j / ring
            r = major + minor * math.cos(b)
            ring_verts.append(bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b))))
        verts.append(ring_verts)
    count = len(verts) if arc >= 360 else len(verts) - 1
    for i in range(count):
        a = verts[i]
        b = verts[(i + 1) % len(verts)]
        for j in range(ring):
            bm.faces.new((a[j], a[(j + 1) % ring], b[(j + 1) % ring], b[j]))
    if arc < 360:
        bm.faces.new(list(reversed(verts[0])))
        bm.faces.new(verts[-1])
    # Face winding above is not guaranteed outward, and the bake culls by
    # normal, so make every normal point out.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = _obj_from_bmesh(name, bm, mat)
    return _finish(obj, loc, rot, 0, 0, True)


def soft(obj, level=2, bevel=None, segments=4):
    """Rounded, stuffed look for cushions, mattresses and bags: a wide bevel,
    then subdivision on top so nothing reads as a box."""
    if bevel:
        mod = obj.modifiers.new('round', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = 'NONE'
    sub = obj.modifiers.new('sub', 'SUBSURF')
    sub.levels = level
    sub.render_levels = level
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def wrinkle(obj, strength=0.008, size=0.12, seed=1):
    """A little cloth noise, for duvets, curtains and beanbags."""
    tex = bpy.data.textures.new(f'wr_{obj.name}', 'CLOUDS')
    tex.noise_scale = size
    tex.noise_depth = 1
    mod = obj.modifiers.new('wrinkle', 'DISPLACE')
    mod.texture = tex
    mod.strength = strength
    mod.mid_level = 0.5
    mod.texture_coords = 'LOCAL'
    return obj


def subdivide_mesh(obj, cuts=8):
    """Adds real vertices so a displace modifier has something to move."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def plane(name, w, h, loc=(0, 0, 0), mat=None, rot=(0, 0, 0)):
    """A card of w by h metres, facing -Y (towards the room from the back wall)."""
    bm = bmesh.new()
    a = bm.verts.new((-w / 2, 0, -h / 2))
    b = bm.verts.new((w / 2, 0, -h / 2))
    c = bm.verts.new((w / 2, 0, h / 2))
    d = bm.verts.new((-w / 2, 0, h / 2))
    f = bm.faces.new((a, b, c, d))
    uv = bm.loops.layers.uv.new('UVMap')
    for loop, co in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = co
    obj = _obj_from_bmesh(name, bm, mat)
    return _finish(obj, loc, rot, 0, 0, False)


def disc(name, radius, loc=(0, 0, 0), mat=None, rot=(0, 0, 0), segments=48, depth=0.0, rim=None):
    """A round card facing -Y, UV mapped so a square image fills it (dartboards,
    clocks, badges). depth gives it a solid edge in the rim material."""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    ring = [bm.verts.new((radius * math.cos(2 * math.pi * i / segments), 0, radius * math.sin(2 * math.pi * i / segments)))
            for i in range(segments)]
    face = bm.faces.new(ring)
    face.normal_update()
    if face.normal.y > 0:
        face.normal_flip()
    for loop in face.loops:
        co = loop.vert.co
        loop[uv].uv = (0.5 + co.x / (2 * radius), 0.5 + co.z / (2 * radius))
    if depth:
        back = [bm.verts.new((v.co.x, depth, v.co.z)) for v in ring]
        for i in range(segments):
            j = (i + 1) % segments
            f = bm.faces.new((ring[i], ring[j], back[j], back[i]))
            f.material_index = 1
        for f in bm.faces:
            f.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if f.material_index == 1])
    obj = _obj_from_bmesh(name, bm, mat)
    if rim is not None:
        obj.data.materials.append(rim)
    return _finish(obj, loc, rot, 0, 0, False)


def curtain(name, width, height, loc, mat, folds=7, depth=0.045, rot=(0, 0, 0)):
    """A hanging curtain: a sheet with sine wave folds, thicker at the top."""
    bm = bmesh.new()
    cols = folds * 8
    rows = 12
    grid = []
    for j in range(rows + 1):
        row = []
        z = -height * j / rows
        for i in range(cols + 1):
            x = width * (i / cols - 0.5)
            y = math.sin(i / cols * folds * 2 * math.pi) * depth * (0.8 + 0.2 * j / rows)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    obj = _obj_from_bmesh(name, bm, mat)
    mod = obj.modifiers.new('thick', 'SOLIDIFY')
    mod.thickness = 0.012
    for p in obj.data.polygons:
        p.use_smooth = True
    return _finish(obj, loc, rot, 0, 0, True)


# ------------------------------------------------------------ imported models
def import_model(model_id, pick=None, drop=None, name=None, decimate=None):
    """Bring a Poly Haven model in and return it as one joined object.

    pick keeps only the parts whose names contain one of the strings, which is
    how one bin is taken out of a set of three. drop removes parts. The result
    has its origin at the bottom centre and sits at the world origin.
    """
    path = sources()['models'][model_id]
    before = set(bpy.data.objects)
    if path.endswith('.blend'):
        with bpy.data.libraries.load(path, link=False) as (src, dst):
            dst.objects = [n for n in src.objects if n]
        for o in dst.objects:
            if o is not None and o.type in ('MESH', 'EMPTY'):
                bpy.context.scene.collection.objects.link(o)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    # Flatten any parent empties into world space.
    for o in new:
        if o.parent is not None:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    meshes = [o for o in new if o.type == 'MESH']
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    if pick:
        keep = [o for o in meshes if any(p == o.name or (p.endswith('*') and o.name.startswith(p[:-1])) for p in pick)]
        for o in meshes:
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        meshes = keep
    if drop:
        for o in list(meshes):
            if any(d in o.name for d in drop):
                meshes.remove(o)
                bpy.data.objects.remove(o, do_unlink=True)
    if not meshes:
        raise RuntimeError(f'{model_id}: nothing left after pick={pick} drop={drop}')
    # Poly Haven's own UV layout is carefully cut; the bake reuses it rather
    # than cutting its own. Name it predictably first.
    for m in meshes:
        if m.data.uv_layers:
            m.data.uv_layers[0].name = 'UVMap'
    obj = join(meshes, name or model_id)
    obj['uv_src'] = 'UVMap'
    if decimate:
        mod = obj.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = decimate
        # Never collapse across a UV seam: that is what shreds a layout into
        # thousands of one triangle islands.
        mod.delimit = {'UV', 'SEAM', 'MATERIAL'}
    ground(obj)
    return obj


def join(objs, name):
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    select_only(objs)
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    return obj


def apply(obj):
    """Apply transforms and modifiers so the mesh is what you see."""
    select_only([obj])
    if obj.modifiers:
        bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def ground(obj):
    """Origin to the bottom centre of the bounding box, object at the origin."""
    apply(obj)
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    pivot = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    obj.data.transform(Matrix.Translation(-(pivot - obj.location)))
    obj.location = Vector((0, 0, 0))
    return obj


def dims(obj):
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    return Vector((max(v.x for v in bb) - min(v.x for v in bb),
                   max(v.y for v in bb) - min(v.y for v in bb),
                   max(v.z for v in bb) - min(v.z for v in bb)))


def fit(obj, height=None, width=None, depth=None):
    """Uniform scale so one measured dimension comes out right."""
    d = dims(obj)
    k = None
    if height:
        k = height / d.z
    elif width:
        k = width / d.x
    elif depth:
        k = depth / d.y
    if k:
        obj.scale = (k, k, k)
        apply(obj)
    return obj


def put(obj, x, y, z=0.0, rz=0.0):
    obj.location = Vector((x, y, z))
    obj.rotation_euler = (0, 0, rz * DEG)
    return obj


def retint(obj, match, rgb=None, hsv=None):
    """Recolour the material slots whose name contains match, by duplicating
    the material and multiplying its base colour."""
    for slot in obj.material_slots:
        m = slot.material
        if m is None or match not in m.name:
            continue
        m2 = m.copy()
        nt = m2.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            continue
        link = bsdf.inputs['Base Color'].links[0] if bsdf.inputs['Base Color'].links else None
        src = link.from_socket if link else None
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        if src is not None:
            nt.links.new(src, mix.inputs['A'])
        else:
            mix.inputs['A'].default_value = bsdf.inputs['Base Color'].default_value
        mix.inputs['B'].default_value = (*srgb_to_linear(rgb or (1, 1, 1)), 1.0)
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        slot.material = m2
    return obj


def remove_material_faces(obj, match):
    """Delete the faces that use a material, for example a clock's glass,
    which bakes badly and adds nothing at this size."""
    idx = [i for i, s in enumerate(obj.material_slots) if s.material and match in s.material.name]
    if not idx:
        return obj
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    faces = [f for f in bm.faces if f.material_index in idx]
    bmesh.ops.delete(bm, geom=faces, context='FACES')
    bm.to_mesh(obj.data)
    bm.free()
    return obj


# ------------------------------------------------------------------- lights
def area_light(name, loc, size, energy, rgb=(1, 1, 1), rot=(0, 0, 0), shape='RECTANGLE', size_y=None):
    light = bpy.data.lights.new(name, 'AREA')
    light.shape = shape
    light.size = size
    if size_y is not None:
        light.size_y = size_y
    light.energy = energy
    light.color = rgb
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    obj['export'] = False
    return obj


def point_light(name, loc, energy, rgb=(1, 1, 1), radius=0.05):
    light = bpy.data.lights.new(name, 'POINT')
    light.energy = energy
    light.color = rgb
    light.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    obj['export'] = False
    return obj


def spot_light(name, loc, energy, rgb=(1, 1, 1), rot=(0, 0, 0), angle=70, blend=0.6, radius=0.03):
    light = bpy.data.lights.new(name, 'SPOT')
    light.energy = energy
    light.color = rgb
    light.spot_size = angle * DEG
    light.spot_blend = blend
    light.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = rot
    obj['export'] = False
    return obj


def aim(obj, target):
    """Point a light (or anything that looks down its -Z) at a spot."""
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return obj


def world_color(rgb, strength):
    world = bpy.context.scene.world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes.get('Background') or nt.nodes.new('ShaderNodeBackground')
    out = nt.nodes.get('World Output') or nt.nodes.new('ShaderNodeOutputWorld')
    bg.inputs['Color'].default_value = (*srgb_to_linear(rgb), 1.0)
    bg.inputs['Strength'].default_value = strength
    if not bg.outputs['Background'].links:
        nt.links.new(bg.outputs['Background'], out.inputs['Surface'])


# ------------------------------------------------------------------- camera
def dollhouse_camera(target, direction, ortho_scale, res=(1600, 1000)):
    """The same orthographic view the game opens on."""
    cam_data = bpy.data.cameras.new('dollhouse')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = ortho_scale
    cam_data.clip_start = 0.1
    cam_data.clip_end = 200
    cam = bpy.data.objects.new('dollhouse', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    d = Vector(direction).normalized()
    cam.location = Vector(target) + d * 30
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam['export'] = False
    scene = bpy.context.scene
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = res
    return cam
