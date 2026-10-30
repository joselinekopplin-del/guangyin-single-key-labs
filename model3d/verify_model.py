"""在新的 Blender 进程中独立打开 BLEND 并导入 GLB，核对结构。

运行：blender -b --factory-startup --python-exit-code 1 --python verify_model.py
不保存修改，不启动任何 FDTD 计算。
"""
import argparse,sys,json,math,hashlib,datetime
from pathlib import Path
import bpy
from mathutils import Vector

argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
parser=argparse.ArgumentParser()
parser.add_argument('--config',default=str(Path(__file__).with_name('model_config.json')))
args=parser.parse_args(argv)
config_path=Path(args.config).resolve();base=config_path.parent
cfg=json.loads(config_path.read_text(encoding='utf-8'))
snap=json.loads((base/cfg['design_snapshot']).read_text(encoding='utf-8'))
p=cfg['physical'];N=p['cells_per_axis'];P=p['period_mm']
paths={k:(base/v).resolve() for k,v in cfg['output'].items()}
manifest=json.loads(paths['manifest'].read_text(encoding='utf-8'))
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
entries=[0,p['d12_entrance_mm'],p['d12_entrance_mm']+p['d23_entrance_mm']]
checks=[]

def check(condition,name):
    assert condition,name
    checks.append(name)

def world_vertices(ob):
    return [ob.matrix_world@v.co for v in ob.data.vertices]

def quantized_points(ob,world_to_mm=1):
    # glTF扁平法线会复制顶点，因此比较唯一空间点，不要求顶点排列一致。
    # 0.0001 mm = 0.1 μm，仅用于导出文件的坐标一致性检查。
    return {tuple(round(x*world_to_mm,4) for x in v) for v in world_vertices(ob)}

bpy.ops.wm.open_mainfile(filepath=str(paths['blend']))
bpy.context.view_layer.update()
check(bpy.data.objects.get('OpticalSystem') is not None,'BLEND由Blender实际重新打开')
check(abs(bpy.context.scene.unit_settings.scale_length-.001)<1e-8,'BLEND物理单位1数值单位=1mm')
root=bpy.data.objects['OpticalSystem']
co=math.cos(math.radians(p['local_pillar_orientation_deg']));si=math.sin(math.radians(p['local_pillar_orientation_deg']))
all_geometry_indices=set()
for layer,entry in enumerate(entries):
    name=f'L{layer+1}';ob=bpy.data.objects[name]
    check(ob.parent==root and abs(ob.location.x-entry)<1e-6,name+'入口与父子层级')
    check({child.name for child in ob.children}=={name+'_Pillars',name+'_Substrate'},name+'柱与基底保留独立对象')
    pillars=bpy.data.objects[name+'_Pillars'];substrate=bpy.data.objects[name+'_Substrate']
    check(len(pillars.data.vertices)==N*N*8 and len(pillars.data.polygons)==N*N*6,name+'含256个真实矩形柱网格块')
    for row in range(N):
        for col in range(N):
            index=snap['geometry_C'][layer][row][col];all_geometry_indices.add(index)
            item=snap['library_pairs'][index];start=(row*N+col)*8
            vertices=[v.co for v in pillars.data.vertices[start:start+8]]
            center=sum(vertices,Vector())/8
            expected=Vector((p['pillar_height_mm']/2,(col-(N-1)/2)*P,(row-(N-1)/2)*P))
            assert (center-expected).length<1e-6,(name,row,col,'柱中心')
            local=[Vector((v.x-center.x,co*(v.y-center.y)+si*(v.z-center.z),-si*(v.y-center.y)+co*(v.z-center.z))) for v in vertices]
            spans=[max(v[axis] for v in local)-min(v[axis] for v in local) for axis in range(3)]
            target=[p['pillar_height_mm'],item['L_um']/1000,item['W_um']/1000]
            assert all(abs(a-b)<1e-6 for a,b in zip(spans,target)),(name,row,col,'柱尺寸',spans,target)
    check(True,name+'每个柱L/W与冻结设计C索引逐项一致')
    x=[v.co.x for v in substrate.data.vertices]
    check(abs(min(x)-p['pillar_height_mm'])<1e-6 and abs(max(x)-p['pillar_height_mm']-p['substrate_height_mm'])<1e-6,name+'正向入射先柱后有限基底')
check(abs(bpy.data.objects['MeasurementPlane'].location.x-entries[-1]-p['d3_measurement_mm'])<1e-6,'采样面位置正确')
source_meshes={ob.name:quantized_points(ob) for ob in bpy.data.objects if ob.type=='MESH'}
check(all(abs(mat.diffuse_color[3]-1)<1e-6 for mat in bpy.data.materials),'颜色均为不透明展示材质')
check(all_geometry_indices <= set(range(len(snap['library_pairs']))),'三层几何均来自冻结25种候选库，无新增或虚构几何')
check(len(all_geometry_indices)==len({value for layer in snap['geometry_C'] for row in layer for value in row}),'不同几何数量由真实设计统计，不强制等于候选库数量')
check(sha(paths['glb'])==manifest['files']['glb']['sha256'],'GLB哈希与清单一致')
check(sha(paths['blend'])==manifest['files']['blend']['sha256'],'BLEND哈希与清单一致')

# 清空内存场景后真正重新导入glTF，不能只靠JSON头判断模型可用。
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(paths['glb']))
bpy.context.view_layer.update()
for name in ['OpticalSystem','L1','L2','L3','MeasurementPlane','Guides']:
    check(bpy.data.objects.get(name) is not None,'GLB重新导入后保留节点'+name)
for name,points in source_meshes.items():
    ob=bpy.data.objects.get(name)
    check(ob is not None and ob.type=='MESH','GLB重新导入网格'+name)
    check(quantized_points(ob,1/manifest['gltf_mm_to_unit'])==points,'GLB重新导入米坐标换算毫米后与BLEND一致：'+name)
    if name.endswith(('_Pillars','_Substrate')):
        node=ob.active_material.node_tree.nodes.get('Principled BSDF')
        expected=cfg['display']['silicon_surface']['visual_ior']
        check(node is not None and abs(node.inputs['IOR'].default_value-expected)<1e-6,
              'GLB导入后保留可见材质IOR：'+name)
check(abs(bpy.data.objects['L2'].matrix_world.translation.x-p['d12_entrance_mm']*manifest['gltf_mm_to_unit'])<1e-6,'glTF毫米转换系数实测')
record={'status':'PASS','verified_at':datetime.datetime.now().astimezone().isoformat(),'blender_version':bpy.app.version_string,
        'checks':checks,'check_count':len(checks),'geometry_types':len(all_geometry_indices),'pillar_count':3*N*N,
        'mesh_count':len(source_meshes),'gltf_mm_to_unit':manifest['gltf_mm_to_unit'],'coordinate_check_resolution_mm':.0001,
        'glb_sha256':sha(paths['glb']),'blend_sha256':sha(paths['blend']),
        'scope':'只确认文件可读取、对象组织、物理几何索引及导出坐标；不代表重新验证电磁性能。'}
destination=base/'logs/reopen_validation.json';destination.parent.mkdir(parents=True,exist_ok=True)
destination.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print('STRUCTURE_REOPEN_PASS',json.dumps({'checks':len(checks),'pillars':3*N*N,'geometry_types':len(all_geometry_indices)}))
