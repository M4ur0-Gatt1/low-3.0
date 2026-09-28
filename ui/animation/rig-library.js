(function(global){
  "use strict";
  const LOW=global.LOW=global.LOW||{}, animation=LOW.animation=LOW.animation||{};
  const b=(id,parent,x1,y1,x2,y2,name,limits,meta)=>({id,parentId:parent||null,head:{x:x1,y:y1},tail:{x:x2,y:y2},name:name||id,limits:limits||{min:-180,max:180},...(meta||{})});
  const ctrl=(id,parent,x1,y1,x2,y2,name,shape="ring",limits)=>
    b(id,parent,x1,y1,x2,y2,name,limits||{min:-180,max:180},{role:"control",control:{shape,label:name||id}});
  const templates={
    human_standard:{name:"Humano · completo",kind:"humano",bones:[
      // Sin topes anatómicos: todos los huesos giran 360° libres por defecto.
      // Si se quiere limitar un hueso puntual, se hace en Construir (rigMin/rigMax).
      b("root",null,.50,.82,.50,.66,"Raíz"),
      b("spine","root",.50,.66,.50,.56,"Columna lumbar"),
      b("chest","spine",.50,.56,.50,.48,"Columna media"),
      b("upper_chest","chest",.50,.48,.50,.43,"Pecho superior"),
      b("neck","upper_chest",.50,.43,.50,.35,"Cuello"),b("head","neck",.50,.35,.50,.18,"Cabeza"),
      b("clavicle_L","upper_chest",.50,.43,.42,.44,"Hombro izq."),b("upper_arm_L","clavicle_L",.42,.44,.34,.48,"Brazo izq."),b("forearm_L","upper_arm_L",.34,.48,.20,.58,"Antebrazo izq."),b("hand_L","forearm_L",.20,.58,.14,.62,"Mano izq."),
      b("clavicle_R","upper_chest",.50,.43,.58,.44,"Hombro der."),b("upper_arm_R","clavicle_R",.58,.44,.66,.48,"Brazo der."),b("forearm_R","upper_arm_R",.66,.48,.80,.58,"Antebrazo der."),b("hand_R","forearm_R",.80,.58,.86,.62,"Mano der."),
      b("thigh_L","root",.47,.68,.40,.84,"Muslo izq."),b("shin_L","thigh_L",.40,.84,.40,.96,"Pierna izq."),b("foot_L","shin_L",.40,.96,.32,.98,"Pie izq."),
      b("thigh_R","root",.53,.68,.60,.84,"Muslo der."),b("shin_R","thigh_R",.60,.84,.60,.96,"Pierna der."),b("foot_R","shin_R",.60,.96,.68,.98,"Pie der.")]},
    human_simple:{name:"Humano · stickman",kind:"humano",bones:[
      b("root",null,.5,.76,.5,.55,"Centro"),b("spine","root",.5,.55,.5,.32,"Cuerpo"),b("head","spine",.5,.32,.5,.16,"Cabeza"),
      b("arm_L","spine",.5,.38,.2,.55,"Brazo izq."),b("arm_R","spine",.5,.38,.8,.55,"Brazo der."),
      b("leg_L","root",.48,.7,.3,.96,"Pierna izq."),b("leg_R","root",.52,.7,.7,.96,"Pierna der.")]},
    human_chibi:{name:"Humano · infantil/chibi",kind:"humano",bones:[
      b("root",null,.5,.76,.5,.58,"Raíz"),b("spine","root",.5,.58,.5,.43,"Torso"),b("head","spine",.5,.43,.5,.17,"Cabeza"),
      b("arm_L","spine",.48,.47,.24,.63,"Brazo izq."),b("arm_R","spine",.52,.47,.76,.63,"Brazo der."),
      b("leg_L","root",.47,.72,.36,.94,"Pierna izq."),b("leg_R","root",.53,.72,.64,.94,"Pierna der.")]},
    dog:{name:"Perro",kind:"cuadrúpedo",bones:[
      b("root",null,.48,.56,.58,.53,"Cadera"),b("spine","root",.48,.56,.30,.50,"Lomo"),b("neck","spine",.30,.50,.22,.39,"Cuello"),b("head","neck",.22,.39,.12,.42,"Cabeza"),b("tail","root",.58,.53,.78,.42,"Cola"),
      b("front_upper_L","spine",.32,.52,.30,.72,"Delantera izq."),b("front_lower_L","front_upper_L",.30,.72,.27,.93,"Pata del. izq."),b("front_upper_R","spine",.36,.54,.39,.73,"Delantera der."),b("front_lower_R","front_upper_R",.39,.73,.40,.94,"Pata del. der."),
      b("hind_upper_L","root",.54,.56,.48,.74,"Trasera izq."),b("hind_lower_L","hind_upper_L",.48,.74,.51,.94,"Pata tras. izq."),b("hind_upper_R","root",.58,.56,.65,.72,"Trasera der."),b("hind_lower_R","hind_upper_R",.65,.72,.68,.93,"Pata tras. der.")]},
    cat:{name:"Gato",kind:"cuadrúpedo",bones:[
      b("root",null,.52,.57,.60,.54,"Cadera"),b("spine","root",.52,.57,.30,.49,"Lomo"),b("neck","spine",.30,.49,.22,.38,"Cuello"),b("head","neck",.22,.38,.13,.40,"Cabeza"),b("tail_1","root",.60,.54,.76,.43,"Cola 1"),b("tail_2","tail_1",.76,.43,.88,.31,"Cola 2"),
      b("front_L","spine",.31,.52,.28,.92,"Delantera izq."),b("front_R","spine",.36,.53,.40,.93,"Delantera der."),b("hind_L","root",.53,.57,.48,.91,"Trasera izq."),b("hind_R","root",.59,.56,.66,.91,"Trasera der.")]},
    horse:{name:"Caballo",kind:"cuadrúpedo",bones:[
      b("root",null,.56,.52,.64,.49,"Cadera"),b("spine","root",.56,.52,.30,.47,"Lomo"),b("neck_1","spine",.30,.47,.23,.31,"Cuello 1"),b("neck_2","neck_1",.23,.31,.17,.20,"Cuello 2"),b("head","neck_2",.17,.20,.08,.25,"Cabeza"),b("tail","root",.64,.49,.82,.58,"Cola"),
      b("front_upper_L","spine",.31,.49,.30,.69,"Brazo del. izq."),b("front_lower_L","front_upper_L",.30,.69,.29,.95,"Caña del. izq."),b("front_upper_R","spine",.36,.50,.39,.70,"Brazo del. der."),b("front_lower_R","front_upper_R",.39,.70,.41,.95,"Caña del. der."),
      b("hind_upper_L","root",.56,.53,.50,.70,"Muslo tras. izq."),b("hind_lower_L","hind_upper_L",.50,.70,.51,.95,"Caña tras. izq."),b("hind_upper_R","root",.62,.51,.69,.69,"Muslo tras. der."),b("hind_lower_R","hind_upper_R",.69,.69,.72,.95,"Caña tras. der.")]},
    face_pro:{name:"Rostro · controles profesionales",kind:"rostro",bones:[
      ctrl("face_pin",null,.50,.78,.50,.55,"Face Pin","pin"),
      ctrl("neck_ctrl","face_pin",.50,.91,.50,.79,"Neck Control","ring",{min:-45,max:45}),
      ctrl("head_ctrl","face_pin",.50,.55,.50,.19,"Head Control","ring",{min:-65,max:65}),
      ctrl("hair_ctrl","head_ctrl",.50,.20,.50,.08,"Hair Control","ring",{min:-35,max:35}),
      ctrl("brow_L","head_ctrl",.38,.32,.25,.30,"Brow L","slider",{min:-25,max:25}),
      ctrl("brow_R","head_ctrl",.62,.32,.75,.30,"Brow R","slider",{min:-25,max:25}),
      ctrl("eye_L","head_ctrl",.36,.42,.27,.42,"Eye L","ring",{min:-20,max:20}),
      ctrl("eye_R","head_ctrl",.64,.42,.73,.42,"Eye R","ring",{min:-20,max:20}),
      ctrl("lid_upper_L","eye_L",.36,.39,.29,.39,"Upper Lid L","arc",{min:-15,max:15}),
      ctrl("lid_lower_L","eye_L",.36,.45,.29,.45,"Lower Lid L","arc",{min:-15,max:15}),
      ctrl("lid_upper_R","eye_R",.64,.39,.71,.39,"Upper Lid R","arc",{min:-15,max:15}),
      ctrl("lid_lower_R","eye_R",.64,.45,.71,.45,"Lower Lid R","arc",{min:-15,max:15}),
      ctrl("nose_ctrl","head_ctrl",.50,.48,.50,.59,"Nose Control","pin",{min:-20,max:20}),
      ctrl("cheek_L","head_ctrl",.31,.57,.23,.60,"Cheek L","ring",{min:-25,max:25}),
      ctrl("cheek_R","head_ctrl",.69,.57,.77,.60,"Cheek R","ring",{min:-25,max:25}),
      ctrl("mouth_ctrl","head_ctrl",.50,.68,.61,.68,"Mouth Control","slider",{min:-30,max:30}),
      ctrl("mouth_L","mouth_ctrl",.43,.68,.34,.68,"Mouth Corner L","pin",{min:-25,max:25}),
      ctrl("mouth_R","mouth_ctrl",.57,.68,.66,.68,"Mouth Corner R","pin",{min:-25,max:25}),
      ctrl("jaw_ctrl","head_ctrl",.50,.70,.50,.84,"Jaw Control","ring",{min:-12,max:38})]}
  };
  function instantiate(key,box,prefix){
    const t=templates[key]; if(!t)return [];
    box=box||{x:0,y:0,width:1000,height:1000}; prefix=prefix||key;
    const idMap=Object.fromEntries(t.bones.map(x=>[x.id,`${prefix}_${x.id}`]));
    const pt=p=>({x:box.x+p.x*box.width,y:box.y+p.y*box.height});
    return t.bones.map(x=>({id:idMap[x.id],name:x.name,parentId:x.parentId?idMap[x.parentId]:null,
      head:pt(x.head),pivot:pt(x.head),tail:pt(x.tail),pinned:!x.parentId,limits:{...x.limits},
      role:x.role||"bone",control:x.control?{...x.control}:null}));
  }
  function apply(doc,key,box,prefix){
    // Defensa de interfaz: un handler DOM puede entregar accidentalmente el
    // MouseEvent. La biblioteca siempre cae en una plantilla real.
    if(typeof key!=="string"||!templates[key])key="human_standard";
    const bones=instantiate(key,box,prefix);
    return doc?.ensureRigBones?.(bones,"Insertar esqueleto de biblioteca")||[];
  }
  animation.rigLibrary={templates,instantiate,apply};
})(typeof window!=="undefined"?window:globalThis);
