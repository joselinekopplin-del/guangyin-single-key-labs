"""验证本次外观修缮未改变旧版真实几何。在 Blender 内运行。

blender -b --factory-startup --python-exit-code 1 --python verify_surface_refinement.py -- --baseline <旧版model3d目录>
只读打开两份模型，不保存场景，不调用FDTD。
"""
import argparse,sys,json,hashlib,datetime
from pathlib import Path
import bpy

args=sys.argv[sys.argv.index('--')+1:]
parser=argparse.ArgumentParser();parser.add_argument('--baseline',required=True)
args=parser.parse_args(args);old=Path(args.baseline).resolve();current=Path(__file__).parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
old_config=json.loads((old/'model_config.json').read_text(encoding='utf-8'))
new_config=json.loads((current/'model_config.json').read_text(encoding='utf-8'))
checks=[]
def check(condition,label):
    assert condition,label
    checks.append(label)
check(old_config['physical']==new_config['physical'],'全部物理配置逐字段保持不变')
check(sha(old/'data/design_snapshot.json')==sha(current/'data/design_snapshot.json'),'冻结设计与真实几何库快照逐字节保持不变')
def load_geometry(folder):
    bpy.ops.wm.open_mainfile(filepath=str(folder/'system.blend'))
    bpy.context.view_layer.update()
    return {ob.name:{'parent':ob.parent.name if ob.parent else None,
                    'points':[tuple(ob.matrix_world@v.co) for v in ob.data.vertices],
                    'faces':[tuple(p.vertices) for p in ob.data.polygons]}
            for ob in bpy.data.objects if ob.type=='MESH'}
before=load_geometry(old);after=load_geometry(current)
check(set(before)==set(after),'新旧模型9个网格对象名称完全相同')
for name in before:
    check(before[name]==after[name],name+'世界顶点、面及父节点逐项完全相同')
for layer in ['L1','L2','L3']:
    for suffix in ['Pillars','Substrate']:
        mat=bpy.data.objects[layer+'_'+suffix].active_material
        node=mat.node_tree.nodes.get('Principled BSDF')
        check(node is not None and node.inputs['Metallic'].default_value==0,layer+'_'+suffix+'非金属硅展示材质')
record={'status':'PASS','verified_at':datetime.datetime.now().astimezone().isoformat(),
        'checks':checks,'check_count':len(checks),'baseline_blend_sha256':sha(old/'system.blend'),
        'refined_blend_sha256':sha(current/'system.blend'),
        'note':'严格世界顶点比较，没有改变柱尺寸/顶点/基底/间距；PBR仅为可见结构外观。此项不是电磁性能复核。'}
(current/'logs/surface_refinement_validation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print('SURFACE_REFINEMENT_PASS',len(checks))
