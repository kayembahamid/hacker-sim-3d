"""
Bake and export: the part of the pipeline that turns a lit Blender room into a
glTF the browser can draw with no lighting maths at all.

  finalize()  apply modifiers and join each bake group into one mesh
  unwrap()    give that mesh a second UV map with every face on its own island
  bake()      Cycles COMBINED bake of that mesh into a float image
  denoise()   OpenImageDenoise through the compositor
  develop()   exposure and tone curve in numpy, then 8 bit sRGB
  export()    one GLB with every baked mesh, the screens and the anchors

The tone curve is Khronos PBR Neutral, the same one the preview renders use,
so a preview PNG is an honest picture of what the game will show.
"""
import bpy
import bmesh
import math
import os
import time
import numpy as np
from mathutils import Vector

from hb import select_only, DEG


def log(*a):
    print('[bake]', *a, flush=True)


# ------------------------------------------------------------------ geometry
def finalize(bake_sizes):
    """Join every object of each bake group into one mesh named after the group.

    Before joining, each part gets its 'bake' UVs: a copy of its own layout if
    it came from Poly Haven, a smart projection if it was modelled here. After
    joining, unwrap() evens out the texel density and packs the lot.

    Returns {group: object}. Objects tagged export=False (the hidden walls, the
    sky card, the ceiling) still light the room but are not joined or shipped.
    """
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        g = obj.get('bake')
        if g is None:
            continue
        groups.setdefault(g, []).append(obj)

    joined = {}
    for g, objs in groups.items():
        if g not in bake_sizes:
            raise RuntimeError(f'bake group {g} has no size in the bake table')
        ix = next((o.get('ix') for o in objs if o.get('ix')), None)
        screen = next((o.get('screen') for o in objs if o.get('screen')), None)
        for o in objs:
            select_only([o])
            if o.modifiers:
                bpy.ops.object.convert(target='MESH')
        bake_uvs(objs)
        select_only(objs, objs[0])
        if len(objs) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = g
        obj.data.name = g
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        # Keep the ids the game needs on the joined object.
        for k in list(obj.keys()):
            if k not in ('bake', 'export', 'ix', 'screen'):
                del obj[k]
        obj['bake'] = g
        obj['export'] = True
        if ix:
            obj['ix'] = ix
        if screen:
            obj['screen'] = screen
        joined[g] = obj
        log(f'{g}: {len(objs)} parts, {len(obj.data.polygons)} faces')
    return joined


def bake_uvs(objs):
    """Give every part a 'bake' UV map, before the parts are joined."""
    cut = []
    for o in objs:
        me = o.data
        src = me.uv_layers.get(o.get('uv_src', '')) if o.get('uv_src') else None
        dst = me.uv_layers.get('bake') or me.uv_layers.new(name='bake')
        tex_uv = me.uv_layers.get('UVMap')
        if tex_uv is not None:
            tex_uv.active_render = True
        if src is not None:
            buf = np.empty(len(me.loops) * 2, dtype=np.float32)
            src.data.foreach_get('uv', buf)
            dst.data.foreach_set('uv', buf)
            me.uv_layers.active = dst
            reproject_degenerate(o)
        else:
            me.uv_layers.active = dst
            cut.append(o)
    if cut:
        select_only(cut)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=66 * DEG, island_margin=0.0, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')


def reproject_degenerate(obj):
    """Give faces whose copied UVs have no area a projection of their own.

    A downloaded model sometimes collapses a few hidden faces to a line in UV
    space. Evening out texel density would then blow that line up to the size
    of the whole atlas and shrink everything else to nothing, so those faces
    are cut again on their own before anything is packed.
    """
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    lay = bm.loops.layers.uv.get('bake')
    bad = []
    for f in bm.faces:
        uvs = [l[lay].uv for l in f.loops]
        a = 0.0
        for i in range(1, len(uvs) - 1):
            e1 = uvs[i] - uvs[0]
            e2 = uvs[i + 1] - uvs[0]
            a += abs(e1.x * e2.y - e1.y * e2.x) / 2
        area3 = f.calc_area()
        if a < 1e-10 or (area3 > 0 and a / area3 < 1e-5):
            bad.append(f.index)
    bm.free()
    if not bad:
        return 0
    select_only([obj])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for i in bad:
        me.polygons[i].select = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.smart_project(angle_limit=66 * DEG, island_margin=0.0, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    log(f'{obj.name}: re-cut {len(bad)} faces with degenerate UVs')
    return len(bad)


def cull(obj, view_dirs, threshold=-0.15):
    """Delete every face no game camera can ever see.

    view_dirs point from the room towards each camera the game uses (the
    overview and the close ups). A face is kept if it faces at least one of
    them. The threshold leaves room for the mouse tilt, which turns the room a
    few degrees. Undersides, backs against walls and the outside of the walls
    go, which is often a third of the atlas.
    """
    dirs = [Vector(d).normalized() for d in view_dirs]
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    kill = [f for f in bm.faces if max(f.normal.dot(d) for d in dirs) < threshold]
    before = len(bm.faces)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(me)
    bm.free()
    log(f'{obj.name}: culled {len(kill)} of {before} faces')


def unwrap(obj, size=2048, margin_px=3):
    """Even out texel density across every island, then pack them all.

    average_islands_scale makes each island's share of the texture match its
    real surface area, so a book spine and a wall get the same sharpness.
    Overlapping islands (a book set that reuses one cover) are packed apart,
    so no two surfaces ever bake into the same pixels.
    """
    me = obj.data
    uv = me.uv_layers['bake']
    tex_uv = me.uv_layers.get('UVMap')
    # Textures keep reading UVMap (the render UV), the bake writes into 'bake'
    # (the active UV). Mixing the two up bakes a scrambled atlas.
    if tex_uv is not None:
        tex_uv.active_render = True
    me.uv_layers.active = uv
    select_only([obj])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    # A fixed gap of a few texels between islands. A gap scaled to each island
    # sounds fairer, but with thousands of leaf sized islands the gaps end up
    # bigger than the islands and the atlas is mostly empty.
    bpy.ops.uv.pack_islands(rotate=True, scale=True, merge_overlap=False, margin_method='ADD',
                            margin=margin_px / size, shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    return uv


# ---------------------------------------------------------------------- bake
def bake(obj, size, samples):
    """COMBINED bake of one object into a new float image."""
    w, h = (size, size) if isinstance(size, int) else size
    img = bpy.data.images.new(f'bake_{obj.name}', w, h, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Linear Rec.709'
    # Every material on the object needs the target image as its active node.
    added = []
    for slot in obj.material_slots:
        mat = slot.material
        if mat is None or not mat.use_nodes:
            continue
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = img
        node.name = '__bake_target'
        mat.node_tree.nodes.active = node
        added.append((mat, node))

    me = obj.data
    me.uv_layers.active = me.uv_layers['bake']

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    b = scene.render.bake
    b.use_pass_direct = True
    b.use_pass_indirect = True
    b.use_pass_diffuse = True
    b.use_pass_glossy = True
    b.use_pass_transmission = True
    b.use_pass_emit = True
    b.margin = 16
    b.margin_type = 'EXTEND'
    # Reflections are seen from the dollhouse camera, which is where the
    # player spends most of the game.
    b.view_from = 'ACTIVE_CAMERA'

    select_only([obj])
    t0 = time.time()
    bpy.ops.object.bake(type='COMBINED', margin=16, margin_type='EXTEND', use_clear=True, target='IMAGE_TEXTURES')
    log(f'{obj.name}: baked {w}x{h} at {samples} samples in {time.time() - t0:.1f}s')

    for mat, node in added:
        mat.node_tree.nodes.remove(node)
    return img


def denoise(img):
    """Run OpenImageDenoise over a baked image, via a throwaway compositor scene."""
    w, h = img.size
    tmp_dir = bpy.app.tempdir
    src = os.path.join(tmp_dir, f'{img.name}_src.exr')
    dst = os.path.join(tmp_dir, f'{img.name}_dn.exr')
    img.filepath_raw = src
    img.file_format = 'OPEN_EXR'
    img.save()

    main = bpy.context.window.scene if bpy.context.window else bpy.context.scene
    sc = bpy.data.scenes.new('denoise')
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    sc.render.filepath = dst
    sc.render.use_compositing = True

    tree = bpy.data.node_groups.new('denoise_tree', 'CompositorNodeTree')
    sc.compositing_node_group = tree
    loaded = bpy.data.images.load(src, check_existing=False)
    n_img = tree.nodes.new('CompositorNodeImage')
    n_img.image = loaded
    n_dn = tree.nodes.new('CompositorNodeDenoise')
    for prop, val in (('prefilter', 'NONE'), ('use_hdr', True), ('quality', 'HIGH')):
        if hasattr(n_dn, prop):
            try:
                setattr(n_dn, prop, val)
            except Exception:
                pass
    for sock_name, val in (('HDR', True),):
        if sock_name in n_dn.inputs:
            n_dn.inputs[sock_name].default_value = val
    tree.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    out = tree.nodes.new('NodeGroupOutput')
    tree.links.new(n_img.outputs['Image'], n_dn.inputs['Image'])
    tree.links.new(n_dn.outputs['Image'], out.inputs[0])

    bpy.ops.render.render(write_still=True, scene=sc.name)
    result = bpy.data.images.load(dst, check_existing=False)
    result.colorspace_settings.name = 'Linear Rec.709'
    bpy.data.scenes.remove(sc)
    if bpy.context.window:
        bpy.context.window.scene = main
    return result


def pixels(img):
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape(h, w, 4)


def pbr_neutral(c):
    """Khronos PBR Neutral tone mapping, on an (..., 3) linear array."""
    start = 0.8 - 0.04
    desat = 0.15
    x = np.min(c, axis=-1, keepdims=True)
    offset = np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    c = c - offset
    peak = np.max(c, axis=-1, keepdims=True)
    d = 1.0 - start
    over = peak >= start
    # Only the compressed range needs the new peak; elsewhere it is unused, and
    # computing it there could divide by zero.
    new_peak = np.where(over, 1.0 - d * d / np.maximum(peak + d - start, 1e-6), peak)
    scaled = c * np.where(over, new_peak / np.maximum(peak, 1e-6), 1.0)
    g = np.where(over, 1.0 - 1.0 / (desat * (peak - new_peak) + 1.0), 0.0)
    return scaled * (1.0 - g) + new_peak * g


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def develop(img, path, exposure=0.0):
    """Exposure, PBR Neutral, sRGB, 8 bit PNG. Returns the saved image."""
    px = pixels(img)
    rgb = px[..., :3] * (2.0 ** exposure)
    out = to_srgb(pbr_neutral(np.maximum(rgb, 0)))
    h, w = out.shape[:2]
    final = bpy.data.images.new(os.path.basename(path).rsplit('.', 1)[0], w, h, alpha=False)
    final.colorspace_settings.name = 'sRGB'
    buf = np.ones((h, w, 4), dtype=np.float32)
    buf[..., :3] = out
    final.pixels.foreach_set(buf.ravel())
    final.filepath_raw = path
    final.file_format = 'PNG'
    final.save()
    return final


def assign_baked(obj, image):
    """Swap every material for one that shows the baked image on the bake UVs,
    and drop the other UV maps so the bake becomes TEXCOORD_0 in the glTF."""
    mat = bpy.data.materials.new(f'baked_{obj.name}')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    uvn = nt.nodes.new('ShaderNodeUVMap')
    uvn.uv_map = 'bake'
    nt.links.new(uvn.outputs['UV'], tex.inputs['Vector'])
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 1.0
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for uv in [u for u in obj.data.uv_layers if u.name != 'bake']:
        obj.data.uv_layers.remove(uv)
    return mat


# -------------------------------------------------------------------- export
def export(path, objs):
    select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=False,
        export_materials='EXPORT',
        export_image_format='AUTO',
        export_extras=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    log('exported', path, f'{os.path.getsize(path) / 1024 / 1024:.2f} MB')


# ------------------------------------------------------------------- preview
def preview(path, samples=96, exposure=0.0, res=None):
    """A Cycles render from the dollhouse camera with the game's tone curve."""
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'Khronos PBR Neutral'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = exposure
    if res:
        scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = path
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    log('preview', path, f'{time.time() - t0:.1f}s')
