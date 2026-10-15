/* ══ EL PISO SIN FIN ════════════════════════════════════════════════════════
   Mauro (v3.30.0): «quiero que la cuadrícula del piso no tenga fin; que esté
   marcado un centro de trabajo con algún color tipo magenta y líneas de
   punto, pero que la cuadrícula del piso esté en todos lados».

   Antes era un GridHelper de 20 × 20 m: más allá de su borde no había piso, y
   para armar un fondo (una calle, un paisaje) el piso se terminaba enseguida.
   Ahora es un plano que SIGUE a la cámara y dibuja las líneas en el shader con
   las coordenadas del mundo, así que nunca se termina:
   - líneas finas cada 0,5 m y marcadas cada 5 m, del ancho de un píxel a
     cualquier distancia (fwidth);
   - se desvanece en la lejanía, que si no el horizonte se llena de muaré;
   - EL CENTRO DE TRABAJO en magenta y de puntos: los dos ejes por el origen
     (X y Z) y un círculo de 1 m alrededor del centro.
   No se elige ni sirve de apoyo por malla (el apoyo del piso es el plano
   y = 0 del motor), no sale al 2D y no tapa nada (no escribe profundidad). */
import * as THREE from 'three';

const MAGENTA = new THREE.Color(0xe0218a);

const VERT = /* glsl */`
  varying vec3 vMundo;
  void main() {
    vec4 m = modelMatrix * vec4(position, 1.0);
    vMundo = m.xyz;
    gl_Position = projectionMatrix * viewMatrix * m;
  }
`;

const FRAG = /* glsl */`
  uniform vec3 uFina;
  uniform vec3 uGruesa;
  uniform vec3 uCentro;
  uniform float uOpacidad;
  uniform float uLejos;
  uniform vec2 uCam;
  varying vec3 vMundo;

  // cuánto «es línea» este píxel para una grilla de paso p (0 = nada, 1 = línea)
  // Se apaga sola donde las líneas quedarían a menos de ~2 px una de otra (lejos,
  // hacia el horizonte): si no, se amontonan en una franja gris con muaré.
  float grilla(vec2 q, float p) {
    vec2 r = q / p;
    vec2 fw = fwidth(r);
    vec2 g = abs(fract(r - 0.5) - 0.5) / fw;
    float densidad = max(fw.x, fw.y);
    return (1.0 - min(min(g.x, g.y), 1.0)) * (1.0 - smoothstep(0.25, 0.5, densidad));
  }
  // una recta (eje) de puntos: ancho de ~1,5 px, cortada cada 0,5 m
  float ejePunteado(float distanciaAlEje, float aLoLargo) {
    float w = fwidth(distanciaAlEje) * 1.5;
    float l = 1.0 - smoothstep(w * 0.5, w, abs(distanciaAlEje));
    float punto = step(0.5, fract(aLoLargo / 0.5));
    return l * punto;
  }

  void main() {
    vec2 q = vMundo.xz;
    float d = length(q - uCam);
    float fade = 1.0 - smoothstep(uLejos * 0.35, uLejos, d);
    float fina = grilla(q, 0.5);
    float gruesa = grilla(q, 5.0);
    vec3 color = mix(uFina, uGruesa, gruesa);
    float a = max(fina * 0.55, gruesa) * uOpacidad;

    // el centro de trabajo: ejes por el origen y un círculo de 1 m, de puntos
    float ejes = max(ejePunteado(q.y, q.x), ejePunteado(q.x, q.y));
    float rc = length(q);
    float ang = atan(q.y, q.x);
    float circulo = ejePunteado(rc - 1.0, ang * 1.0) ;
    float centro = max(ejes, circulo);
    color = mix(color, uCentro, centro);
    a = max(a, centro * 0.9);

    a *= fade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(color, a);
  }
`;

export class PisoInfinito {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  /** Hasta dónde llega el piso antes de desvanecerse (en metros). */
  private static readonly LEJOS = 260;

  constructor() {
    const lado = PisoInfinito.LEJOS * 2.2;
    const geo = new THREE.PlaneGeometry(lado, lado).rotateX(-Math.PI / 2);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uFina: { value: new THREE.Color(0xd7dce4) },
        uGruesa: { value: new THREE.Color(0xb3bac6) },
        uCentro: { value: MAGENTA.clone() },
        uOpacidad: { value: 0.75 },
        uLejos: { value: PisoInfinito.LEJOS },
        uCam: { value: new THREE.Vector2() },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'piso-infinito';
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    this.mesh.userData.noPick = true;
    this.mesh.raycast = () => undefined;   // no se elige ni se apoya por malla
  }

  get visible(): boolean { return this.mesh.visible; }
  set visible(v: boolean) { this.mesh.visible = v; }

  /** Antes de cada cuadro: el plano se para debajo de la cámara (las líneas no
   *  se mueven: van con las coordenadas del mundo). */
  seguir(cam: THREE.Camera): void {
    const p = cam.position;
    this.mesh.position.set(p.x, 0, p.z);
    (this.mat.uniforms.uCam.value as THREE.Vector2).set(p.x, p.z);
  }

  tema(oscuro: boolean): void {
    (this.mat.uniforms.uFina.value as THREE.Color).set(oscuro ? 0x5d666c : 0xd7dce4);
    (this.mat.uniforms.uGruesa.value as THREE.Color).set(oscuro ? 0x7c868c : 0xb3bac6);
    (this.mat.uniforms.uCentro.value as THREE.Color).set(oscuro ? 0xff4fb0 : 0xe0218a);
    this.mat.uniforms.uOpacidad.value = oscuro ? 0.6 : 0.75;
  }

  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
