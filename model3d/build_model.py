"""在 Blender 内运行：从冻结的真实几何索引生成可编辑三层结构与 glTF。

Blender 坐标：+X为原FDTD的+z传播方向；Y=原x，Z=原y。
1 Blender unit在建模数组中代表1 mm，scene.scale_length=0.001。
glTF导出使用标准Y-up；导出坐标及单位由脚本读取GLB后实际核对。
"""
import argparse,sys,json,math,hashlib,struct,datetime
from pathlib import Path
import bpy
from mathutils import Vector

argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
parser=argparse.ArgumentParser(description='光隐三层结构建模：不运行FDTD或系统训练')
parser.add_argument('--config',default=str(Path(__file__).with_name('model_config.json')))
parser.add_argument('--skip-render',action='store_true')
args=parser.parse_args(argv)
config_path=Path(args.config).resolve();base=config_path.parent
cfg=json.loads(config_path.read_text(encoding='utf-8'))
snap_path=(base/cfg['design_snapshot']).resolve()
snap=json.loads(snap_path.read_text(encoding='utf-8'))
p=cfg['physical'];d=cfg['display'];N=p['cells_per_axis'];P=p['period_mm']
assert N==snap['N']==16 and len(snap['geometry_C'])==3
assert p['illumination']=='pillar_first','柱/基底入射顺序必须有来源，当前只支持已核对的pillar_first'
assert d['physical_geometry_scale_xyz']==[1,1,1],'本版本正式导出保持物理比例；展开仅在网页展示层处理'
assert p['d12_entrance_mm']>p['pillar_height_mm']+p['substrate_height_mm']
assert p['d23_entrance_mm']>p['pillar_height_mm']+p['substrate_height_mm']
out={k:(base/v).resolve() for k,v in cfg['output'].items()}
for path in out.values():path.parent.mkdir(parents=True,exist_ok=True)
previous_manifest=json.loads(out['manifest'].read_text(encoding='utf-8')) if out['manifest'].exists() else {}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0  # 只作用于本次进程，不写用户全局设置。
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=.001
scene.unit_settings.length_unit='MILLIMETERS'
collection=bpy.data.collections.new('Optical_structure');scene.collection.children.link(collection)

def empty(name,parent=None,location=(0,0,0),**metadata):
    ob=bpy.data.objects.new(name,None);collection.objects.link(ob);ob.parent=parent;ob.location=location
    ob.empty_display_type='PLAIN_AXES';ob.empty_display_size=.2
    for key,value in metadata.items():ob[key]=value
    return ob

def mat(name,color,roughness=.5,ior=1.5,specular_level=.5):
    m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=color
    bs.inputs['Roughness'].default_value=roughness;bs.inputs['Metallic'].default_value=0
    bs.inputs['IOR'].default_value=ior
    bs.inputs['Specular IOR Level'].default_value=specular_level
    m['appearance_only']=True
    return m

def mesh(name,verts,faces,parent,material,**metadata):
    me=bpy.data.meshes.new(name+'_mesh');me.from_pydata(verts,[],faces);me.validate();me.update()
    ob=bpy.data.objects.new(name,me);collection.objects.link(ob);ob.parent=parent;ob.data.materials.append(material)
    for key,value in metadata.items():ob[key]=value
    return ob

def box(v,f,center,size,theta=0):
    i=len(v);cx,cy,cz=center;sx,sy,sz=(x/2 for x in size);co=math.cos(theta);si=math.sin(theta)
    for dx,dy,dz in [(-sx,-sy,-sz),(-sx,-sy,sz),(-sx,sy,sz),(-sx,sy,-sz),(sx,-sy,-sz),(sx,-sy,sz),(sx,sy,sz),(sx,sy,-sz)]:
        v.append((cx+dx,cy+co*dy-si*dz,cz+si*dy+co*dz))
    for face in [(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]:f.append(tuple(i+n for n in face))

def circle_section(v,f,x0,x1,r0,r1,y,z,sides=12):
    off=len(v)
    for x,r in [(x0,r0),(x1,r1)]:
        for j in range(sides):v.append((x,y+r*math.cos(2*math.pi*j/sides),z+r*math.sin(2*math.pi*j/sides)))
    f.append(tuple(off+j for j in range(sides-1,-1,-1)));f.append(tuple(off+sides+j for j in range(sides)))
    for j in range(sides):k=(j+1)%sides;f.append((off+j,off+k,off+sides+k,off+sides+j))

root=empty('OpticalSystem',model_version=cfg['model_version'],units='millimeter in Blender coordinates',description='三层近似系统的结构展示，非新的电磁计算')
roots={};entries=[0,p['d12_entrance_mm'],p['d12_entrance_mm']+p['d23_entrance_mm']]
layer_manifest=[];cell_manifest=[];aperture=N*P
for layer in range(3):
    name=f'L{layer+1}';entry=entries[layer];color=d['colors'][name]
    ob=empty(name,root,(entry,0,0),part_id=name,chinese_name=f'第{layer+1}层超表面',
        function='真实几何查表设计C；每个柱的L和W同时约束x/y响应。',physical_entry_mm=entry,
        aperture_mm=aperture,cell_count=N*N,illumination='pillar_first')
    roots[name]=ob
    if layer==1:ob.rotation_euler.x=math.radians(p['layer2_rotation_deg'])
    surface=d['silicon_surface']
    pillar_mat=mat(name+'_Silicon_Pillars',color,surface['pillar_roughness'],surface['visual_ior'],surface['specular_ior_level'])
    substrate_mat=mat(name+'_Silicon_Substrate',surface['substrate_color'],surface['substrate_roughness'],surface['visual_ior'],surface['specular_ior_level'])
    verts=[];faces=[];indices=snap['geometry_C'][layer]
    for row in range(N):
        assert len(indices[row])==N
        for col in range(N):
            ix=indices[row][col];item=snap['library_pairs'][ix]
            L=item['L_um']/1000;W=item['W_um']/1000
            assert 0<L<P and 0<W<P
            y=(col-(N-1)/2)*P;z=(row-(N-1)/2)*P
            box(verts,faces,(p['pillar_height_mm']/2,y,z),(p['pillar_height_mm'],L,W),math.radians(p['local_pillar_orientation_deg']))
            cell_manifest.append({'layer':layer+1,'row':row,'column':col,'geometry_id':item['id'],'L_um':item['L_um'],'W_um':item['W_um'],'center_transverse_mm':[y,z]})
    pillars=mesh(name+'_Pillars',verts,faces,ob,pillar_mat,part_id=name,
        chinese_name=f'第{layer+1}层硅柱阵列',cell_count=N*N,
        editing='每个柱是独立不连接网格块；Blender编辑模式可按松散块拆分，不是高度相位映射。')
    v=[];f=[];box(v,f,(p['pillar_height_mm']+p['substrate_height_mm']/2,0,0),(p['substrate_height_mm'],aperture,aperture))
    mesh(name+'_Substrate',v,f,ob,substrate_mat,part_id=name,chinese_name=f'第{layer+1}层有限硅基底',thickness_mm=p['substrate_height_mm'])
    layer_manifest.append({'id':name,'label':f'第{layer+1}层超表面','entry_mm':entry,'thickness_mm':p['pillar_height_mm']+p['substrate_height_mm'],
       'pillar_height_mm':p['pillar_height_mm'],'substrate_height_mm':p['substrate_height_mm'],
       'rotation_deg':p['layer2_rotation_deg'] if layer==1 else 0,'children':[name+'_Pillars',name+'_Substrate'],
       'description':f'16×16硅柱，孔径{aperture:.2f}mm；先柱后基底，同一几何配对决定两种偏振响应。'+('这是系统定义的可旋转第二层。' if layer==1 else '')})

measure_x=entries[-1]+p['d3_measurement_mm'];measure_size=p['measurement_samples_per_axis']*P
measure=empty('MeasurementPlane',root,(measure_x,0,0),part_id='MeasurementPlane',chinese_name='复场采样面（计算面）',
    function='系统假设在此获得双偏振振幅与相位；不是实体相机或已搭建硬件。',side_mm=measure_size)
roots['MeasurementPlane']=measure
v=[];f=[];q=d['measurement_frame_thickness_mm'];h=measure_size/2
for y in [-h,h]:box(v,f,(0,y,0),(q,q,measure_size))
for z in [-h,h]:box(v,f,(0,0,z),(q,measure_size,q))
mesh('Measurement_Frame',v,f,measure,mat('Measurement_display_color',d['colors']['MeasurementPlane']),part_id='MeasurementPlane')

guides=empty('Guides',root,part_id='Guides',chinese_name='方向与偏振辅助标记',function='仅表达传播先后与入射线偏振，不是求解电磁场。')
roots['Guides']=guides;v=[];f=[];r=d['arrow_radius_mm'];head=d['arrow_head_length_mm']
for a,b in [(-2.,-.25),(1.15,entries[1]-.25),(entries[1]+1.15,entries[2]-.25),(entries[2]+1.15,measure_x-.3)]:
    circle_section(v,f,a,b-head,r,r,0,0);circle_section(v,f,b-head,b,r*3.4,0,0,0)
mesh('Propagation_Arrows',v,f,guides,mat('Propagation_display_color',d['colors']['Guides']),part_id='Guides',physical_result=False)
v=[];f=[];box(v,f,(-1.8,0,0),(.045,1.1,.045),math.radians(p['incident_polarization_deg']))
mesh('Input_Polarization_Symbol',v,f,guides,mat('Polarization_display_color',(.12,.45,.65,1)),part_id='Guides',physical_result=False)

# 生成预览所需灯光/相机，不导出到GLB作为系统硬件。
def studio_object(name,data,location):
    ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=location;return ob
camera=studio_object('PreviewCamera',bpy.data.cameras.new('PreviewCamera'),(-6,-13,9));scene.camera=camera
target=Vector((6.7,0,0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=20
for name,position,power,size in [('StudioKey',(-5,-7,11),1500,8),('StudioFill',(8,7,10),600,7),('StudioRim',(18,0,8),1800,6)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='DISK';light.size=size
    ob=studio_object(name,light,position);ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('StudioWorld');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.84,.87,.91,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5;scene.world=world
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=d['render_samples'];scene.cycles.use_denoising=True
scene.render.resolution_x=d['render_resolution'][0];scene.render.resolution_y=d['render_resolution'][1];scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
# 按相机投影后的完整包围盒取景，包含尺寸更大的计算采样窗。
bpy.context.view_layer.update()
inverse_rotation=camera.rotation_euler.to_quaternion().inverted()
projected=[inverse_rotation@(ob.matrix_world@Vector(corner)-camera.location)
           for ob in collection.objects if ob.type=='MESH' for corner in ob.bound_box]
xmin=min(v.x for v in projected);xmax=max(v.x for v in projected)
ymin=min(v.y for v in projected);ymax=max(v.y for v in projected)
offset=camera.rotation_euler.to_quaternion()@Vector(((xmin+xmax)/2,(ymin+ymax)/2,0))
camera.location+=offset
camera.data.ortho_scale=max(xmax-xmin,(ymax-ymin)*scene.render.resolution_x/scene.render.resolution_y)*1.12
scene.render.filepath=str(out['preview'])
for area in bpy.context.screen.areas if bpy.context.screen else []:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=20;area.spaces.active.region_3d.view_location=(7,0,0)
        area.spaces.active.shading.type='MATERIAL'

bpy.ops.wm.save_as_mainfile(filepath=str(out['blend']))
bpy.ops.object.select_all(action='DESELECT')
for ob in collection.objects:ob.select_set(True)
bpy.context.view_layer.objects.active=root
# glTF规范的世界长度单位是米；Blender工程按毫米建模。
# 仅导出时在共同根加毫米→米变换，随后恢复，BLEND与预览不受影响。
root.scale=(.001,.001,.001)
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=str(out['glb']),export_format='GLB',use_selection=True,
    export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_materials='EXPORT')
root.scale=(1,1,1)
bpy.context.view_layer.update()

# 回读GLB二进制头、JSON及几何buffer；不要只把“文件存在”当验证通过。
glb=out['glb'].read_bytes();magic,version,total=struct.unpack_from('<4sII',glb);assert magic==b'glTF' and version==2 and total==len(glb)
length,kind=struct.unpack_from('<I4s',glb,12);assert kind==b'JSON';gltf=json.loads(glb[20:20+length])
names={node.get('name'):i for i,node in enumerate(gltf['nodes'])}
for name in ['OpticalSystem','L1','L2','L3','MeasurementPlane','Guides','L1_Pillars','L2_Pillars','L3_Pillars']:assert name in names,name
for name in ['L1','L2','L3']:assert len(gltf['nodes'][names[name]].get('children',[]))==2
triangles=sum(gltf['accessors'][pr['indices']]['count']//3 for m in gltf['meshes'] for pr in m['primitives'])
assert triangles<48000
translations={name:gltf['nodes'][names[name]].get('translation',[0,0,0]) for name in ['L1','L2','L3','MeasurementPlane']}
ratio=translations['L2'][0]/entries[1]
assert abs(ratio-0.001)<1e-6 or abs(ratio-1)<1e-6,translations
assert abs(translations['L3'][0]-entries[2]*ratio)<1e-6
# 某些导出器会把单位缩放保留在共同父节点；实际变换在manifest明确记录。
root_transform=gltf['nodes'][names['OpticalSystem']]
root_scale=root_transform.get('scale',[1,1,1])
world_per_mm=ratio*root_scale[0]
assert abs(world_per_mm-.001)<1e-9,'标准glTF世界单位必须为米'
materials=[{'name':m.get('name'),'alphaMode':m.get('alphaMode','OPAQUE'),'baseColorFactor':m.get('pbrMetallicRoughness',{}).get('baseColorFactor')} for m in gltf.get('materials',[])]
for material,source in zip(materials,gltf.get('materials',[])):
    material['metallicFactor']=source.get('pbrMetallicRoughness',{}).get('metallicFactor',1)
    material['roughnessFactor']=source.get('pbrMetallicRoughness',{}).get('roughnessFactor',1)
    material['visual_ior']=source.get('extensions',{}).get('KHR_materials_ior',{}).get('ior',1.5)
    material['specular_factor']=source.get('extensions',{}).get('KHR_materials_specular',{}).get('specularFactor',1)
    if '_Silicon_' in material['name']:
        assert abs(material['visual_ior']-d['silicon_surface']['visual_ior'])<1e-6,'GLB可见材质IOR必须与Blender一致'
        assert abs(material['specular_factor']-2*d['silicon_surface']['specular_ior_level'])<1e-6
assert all(m['alphaMode']=='OPAQUE' for m in materials),'本版本采用实体色与测量面线框，避免未验证的透明排序'

sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
manifest={'schema':'guangyin.structure.v1','generated_at':datetime.datetime.now().astimezone().isoformat(),'blender_version':bpy.app.version_string,
 'gltf_mm_to_unit':world_per_mm,
 'model_version':cfg['model_version'],'model_kind':'Blender exported editable geometric structure; not a full-wave field solution',
 'coordinate_system':{'propagation_axis':'+X','blender':'X=original FDTD z; Y=original x; Z=original y','gltf':'X=propagation; Y=original y; Z=-original x; glTF standard Y-up',
 'blender_scene_scale_length':scene.unit_settings.scale_length,'blender_coordinate_unit':'1 numeric unit = 1 mm','gltf_world_units_per_mm':world_per_mm,
 'gltf_world_unit':'metre','gltf_world_mm_to_unit':world_per_mm,
 'gltf_local_coordinate_unit':'Layer local positions remain mm; OpticalSystem scale=.001 converts to world metres',
 'gltf_root_scale':root_scale,'gltf_root_translations':translations},
 'physical':p,'display':{'render_version':d['render_version'],'default_scale':'真实几何比例；箭头和采样面线框为示意','scale_xyz':[1,1,1],'not_to_scale_in_exploded_view':True,
 'surface_appearance':d['silicon_surface'],'surface_is_visual_approximation':'统一深灰硅外观，PBR粗糙度及可见光IOR仅为展示近似；不是0.7THz材料反射或加工测量，未改变物理模型n=3.42。',
 'colors_are_display_only':True,'simplification':'每层256个真实几何柱作为256个独立网格块合并为一对象；三层与基底分别保留；未减少柱数。',
 'arrows_are_schematic':True,'measurement_is_computational_plane':True},
 'parts':layer_manifest+[{'id':'MeasurementPlane','label':'复场采样面','entry_mm':measure_x,'side_mm':measure_size,'description':'64×64采样窗；假设获得双偏振复场的计算面，不是实体相机。'},
 {'id':'Guides','label':'方向与偏振示意','description':'+X传播箭头与线偏振符号，非真实电磁场。'}],
 'stable_root_names':['L1','L2','L3','MeasurementPlane','Guides'],'triangles':triangles,'gltf_nodes':len(gltf['nodes']),
 'materials':materials,'cell_count':len(cell_manifest),'cell_geometries':cell_manifest,
 'candidate_geometry_count':len(snap['library_pairs']),
 'used_geometry_indices':sorted({index for layer in snap['geometry_C'] for row in layer for index in row}),
 'used_geometry_count':len({index for layer in snap['geometry_C'] for row in layer for index in row}),
 'source_sha256':snap['sources'],'configuration_sha256':sha(config_path),'design_snapshot_sha256':sha(snap_path),
 'files':{'glb':{'path':'system.glb','sha256':sha(out['glb']),'bytes':len(glb)},'blend':{'path':'../../model3d/system.blend','sha256':sha(out['blend']),'bytes':out['blend'].stat().st_size}},
 'limits':cfg['notes']}
out['manifest'].write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
if not args.skip_render:
    scene.render.filepath=str(out['preview']);bpy.ops.render.render(write_still=True)
    manifest['files']['preview']={'path':'preview.png','sha256':sha(out['preview']),'bytes':out['preview'].stat().st_size,'kind':'Blender structural render; fallback image, not live 3D or electromagnetic field'}
    # 真实L1几何的局部放大图；仅改变摄影机及可见性，没有增加柱或改变长宽。
    for ob in collection.objects:
        cursor=ob
        while cursor.parent and cursor.parent!=root:cursor=cursor.parent
        ob.hide_render=cursor.name!='L1'
    camera.location=(-3.2,-3.7,3.1);detail_target=Vector((.45,0,0))
    camera.rotation_euler=(detail_target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=3.1
    scene.render.resolution_x=1400;scene.render.resolution_y=1200
    # 标尺位于正交相机的像平面，长度0.5mm；不是新增的器件部件。
    rot=camera.rotation_euler.to_quaternion();right=rot@Vector((1,0,0));up=rot@Vector((0,1,0))
    anchor=detail_target-right*1.23-up*1.08
    verts=[anchor,anchor+right*.5,anchor+right*.5+up*.014,anchor+up*.014]
    scale_mat=mat('Detail_scale_bar',(0.025,.03,.04,1))
    scale_ob=mesh('Detail_scale_bar',verts,[(0,1,2,3)],None,scale_mat,display_only=True)
    text_data=bpy.data.curves.new('Detail_scale_text','FONT');text_data.body='0.5 mm';text_data.size=.095
    text_ob=studio_object('Detail_scale_text',text_data,anchor+up*.045);text_ob.rotation_euler=camera.rotation_euler
    text_data.materials.append(scale_mat)
    scene.render.filepath=str(out['detail']);bpy.ops.render.render(write_still=True)
    manifest['files']['detail']={'path':'detail.png','sha256':sha(out['detail']),'bytes':out['detail'].stat().st_size,
      'kind':'Blender orthographic structural detail of L1; real frozen design geometry, not SEM or FDTD field',
      'scale_bar_mm':.5,'scale_bar_plane':'orthographic image plane','geometry_source':'frozen design C, L1','cell_count':N*N}
    out['manifest'].write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
elif (previous_manifest.get('configuration_sha256')==sha(config_path)
      and previous_manifest.get('design_snapshot_sha256')==sha(snap_path)
      and out['preview'].exists()
      and previous_manifest.get('files',{}).get('preview',{}).get('sha256')==sha(out['preview'])):
    manifest['files']['preview']=previous_manifest['files']['preview']
    manifest['files']['preview']['reused_for_identical_configuration']=True
    if (out['detail'].exists() and previous_manifest.get('files',{}).get('detail',{}).get('sha256')==sha(out['detail'])):
        manifest['files']['detail']=previous_manifest['files']['detail']
        manifest['files']['detail']['reused_for_identical_configuration']=True
    out['manifest'].write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
validation={'status':'PASS','blender_version':bpy.app.version_string,'generated_at':manifest['generated_at'],'geometry_count':len(cell_manifest),
 'triangles':triangles,'glb_header_valid':True,'stable_named_nodes_and_hierarchy':True,'materials_opaque':True,
 'physical_entries_and_export_coordinates_verified':True,'gltf_world_units_per_mm':world_per_mm,
 'config_sha256':sha(config_path),'glb_sha256':sha(out['glb']),'blend_sha256':sha(out['blend']),
 'preview_rendered':not args.skip_render,'blender_saved':str(out['blend']),'glb_saved':str(out['glb']),
 'note':'此检查确认结构/文件，不代表电磁性能；单独回读.blend和重新导入GLB在verify_model.py中执行。'}
out['validation'].write_text(json.dumps(validation,ensure_ascii=False,indent=2),encoding='utf-8')
print('STRUCTURE_BUILD_PASS',json.dumps({'nodes':len(gltf['nodes']),'triangles':triangles,'glb_world_units_per_mm':world_per_mm,'translations':translations}))
