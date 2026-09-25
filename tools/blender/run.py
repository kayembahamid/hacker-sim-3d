"""
Entry point for Blender, headless.

  blender --background --factory-startup --python tools/blender/run.py -- \
      --scene bedroom --mode preview --out tools/.cache/bake --samples 96

  --mode preview   build the room and render the dollhouse view (fast look)
  --mode bake      build, bake every group, denoise, develop, export the GLB
  --scale 0.5      bake textures at half size, for quick test bakes
"""
import argparse
import importlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, 'scenes'))

import bpy  # noqa: E402
import hb  # noqa: E402
import bake  # noqa: E402


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--scene', required=True)
    p.add_argument('--mode', choices=['preview', 'bake', 'blend'], default='preview')
    p.add_argument('--out', required=True)
    p.add_argument('--samples', type=int, default=96)
    p.add_argument('--scale', type=float, default=1.0)
    p.add_argument('--exposure', type=float, default=None)
    p.add_argument('--res', default=None, help='preview size, e.g. 1600x1000')
    p.add_argument('--no-denoise', action='store_true')
    p.add_argument('--only', default=None, help='comma separated bake groups (test bakes)')
    p.add_argument('--look', default=None, help='preview close up: x,y,z,ortho_scale[,dx,dy,dz]')
    return p.parse_args(argv)


def main():
    a = args()
    os.makedirs(a.out, exist_ok=True)
    scene_mod = importlib.import_module(a.scene)
    t0 = time.time()
    cfg = scene_mod.build()
    exposure = cfg.get('exposure', 0.0) if a.exposure is None else a.exposure
    bake.log(f'built {a.scene} in {time.time() - t0:.1f}s, {len(bpy.data.objects)} objects')

    if a.mode == 'blend':
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.out, f'{a.scene}.blend'))
        return

    if a.mode == 'preview':
        res = tuple(int(v) for v in a.res.split('x')) if a.res else None
        if a.look:
            # A close up instead of the overview, for checking details.
            v = [float(n) for n in a.look.split(',')]
            from mathutils import Vector
            cam = bpy.context.scene.camera
            d = Vector(v[4:7] if len(v) >= 7 else (1.0, -1.06, 1.02)).normalized()
            cam.location = Vector(v[0:3]) + d * 30
            cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
            cam.data.ortho_scale = v[3]
        bake.preview(os.path.join(a.out, f'{a.scene}_preview.png'), samples=a.samples, exposure=exposure, res=res)
        return

    sizes = cfg['bake']
    joined = bake.finalize(sizes)
    only = set(a.only.split(',')) if a.only else None
    views = cfg.get('views')
    for g, obj in joined.items():
        if views:
            bake.cull(obj, views)
        base = sizes[g]
        bake.unwrap(obj, size=max(64, int(base * a.scale)))

    tex_dir = os.path.join(a.out, 'textures')
    os.makedirs(tex_dir, exist_ok=True)
    developed = {}
    for g, obj in joined.items():
        if only and g not in only:
            continue
        base = sizes[g]
        size = max(64, int(base * a.scale))
        img = bake.bake(obj, size, a.samples)
        if not a.no_denoise:
            img = bake.denoise(img)
        developed[g] = bake.develop(img, os.path.join(tex_dir, f'{g}.png'), exposure)

    # Materials are swapped only once every group is baked: until then the
    # real materials are what light bounces off.
    for g, obj in joined.items():
        if g in developed:
            bake.assign_baked(obj, developed[g])

    ship = [o for o in bpy.context.scene.objects
            if o.type == 'MESH' and o.get('export', True)
            and (o.name in developed or o.get('screen') or o.get('sky'))]
    glb = os.path.join(a.out, f'{a.scene}.glb')
    bake.export(glb, ship)

    report = {
        'scene': a.scene,
        'samples': a.samples,
        'scale': a.scale,
        'exposure': exposure,
        'groups': {g: {'faces': len(o.data.polygons), 'size': max(64, int(sizes[g] * a.scale))}
                   for g, o in joined.items() if g in developed},
        'seconds': round(time.time() - t0, 1),
    }
    with open(os.path.join(a.out, f'{a.scene}.report.json'), 'w') as f:
        json.dump(report, f, indent=2)
    bake.log('done in', report['seconds'], 's')


main()
