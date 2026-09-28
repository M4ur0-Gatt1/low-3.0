import * as THREE from 'three';

/** Encuadra geometría visible, sin incluir el suelo, luces ni controles. */
export function frameGeometry(camera:THREE.Camera, objects:THREE.Object3D[], target:THREE.Vector3, aspect:number):number|null {
  const bounds=new THREE.Box3();
  for(const object of objects)if(object.visible)bounds.expandByObject(object);
  if(bounds.isEmpty())return null;
  const center=bounds.getCenter(new THREE.Vector3());
  const radius=Math.max(.1,bounds.getSize(new THREE.Vector3()).length()/2);
  const direction=camera.position.clone().sub(target).normalize();
  if(direction.lengthSq()<.1)direction.set(1,.7,1).normalize();
  let distance=camera.position.distanceTo(target);
  if(camera instanceof THREE.PerspectiveCamera){
    const vertical=THREE.MathUtils.degToRad(camera.fov/2);
    const horizontal=Math.atan(Math.tan(vertical)*Math.max(.1,aspect));
    distance=radius*1.25/Math.sin(Math.min(vertical,horizontal));
    camera.near=Math.min(camera.near,Math.max(.001,distance-radius*1.5));
    camera.far=Math.max(camera.far,distance+radius*3);camera.updateProjectionMatrix();
  }
  if(camera instanceof THREE.OrthographicCamera){camera.far=Math.max(camera.far,distance+radius*3);camera.near=Math.min(camera.near,-radius*3);camera.updateProjectionMatrix();}
  camera.position.copy(center).addScaledVector(direction,Math.max(distance,radius*2));
  target.copy(center);camera.lookAt(center);camera.updateMatrixWorld(true);
  return radius*1.25/Math.min(1,Math.max(.1,aspect));
}
