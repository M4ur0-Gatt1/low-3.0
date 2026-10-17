/* ══ EL TERRENO DEL ESTUDIO 3D: MONTAÑAS, VALLES, RÍOS Y LAGOS ═══════════════
   Mauro: «el módulo 3D como un SimCity para construir una ciudad para el
   escenario; también quiero poder hacer ríos, lagos, montañas, todos los
   elementos para componer espacios y paisajes».

   El terreno es una GRILLA DE ALTURAS: LADO × LADO metros centrada en el
   origen, una altura por metro. Plano (todo en 0) coincide con el piso y no se
   dibuja; en cuanto se levanta o se hunde algo, aparece.

   - Pinceles: levantar, hundir, suavizar, aplanar (a la altura donde se
     empezó). Radio en metros y fuerza; el borde cae suave (coseno²), así una
     pasada no deja escalones.
   - El agua se arma ENCIMA: un río cava su cauce a lo largo de un recorrido;
     un lago cava una hondonada dentro de un contorno. Las dos cosas son
     cambios del terreno + una superficie de agua que arma el motor.
   - Deshacer: cada cambio guarda sólo el RECTÁNGULO que tocó (antes y después),
     no la grilla entera (58 mil alturas por paso llenarían la memoria).
   - Guardar: centímetros en Int16, en base64 (≈ 155 KB con todo tocado).

   Sólo datos y cuentas: el motor arma la malla con `geometria()`. */

export const LADO = 240;                 // metros por lado
export const N = LADO + 1;               // vértices por lado (uno por metro)
const MITAD = LADO / 2;

export type ModoTerreno = 'levantar' | 'hundir' | 'suavizar' | 'aplanar';
export interface PincelTerreno { modo: ModoTerreno; radio: number; fuerza: number }
export const PINCEL_INICIAL: PincelTerreno = { modo: 'levantar', radio: 10, fuerza: 0.5 };

/** Un rectángulo de la grilla (índices inclusive) con sus alturas. */
export interface Parche { i0: number; j0: number; i1: number; j1: number; alturas: Float32Array }

export class Terreno {
  /** alturas en metros, fila j (eje z) por columna i (eje x) */
  h: Float32Array<ArrayBufferLike> = new Float32Array(N * N);

  static idx(i: number, j: number): number { return j * N + i; }
  /** Del mundo a la grilla (puede caer fuera). */
  static aGrilla(x: number, z: number): [number, number] { return [x + MITAD, z + MITAD]; }
  static aMundo(i: number, j: number): [number, number] { return [i - MITAD, j - MITAD]; }

  plano(): boolean { for (let k = 0; k < this.h.length; k++) if (this.h[k] !== 0) return false; return true; }

  /** La altura en (x, z), bilineal; 0 fuera de la grilla. */
  alturaEn(x: number, z: number): number {
    const [gi, gj] = Terreno.aGrilla(x, z);
    if (gi < 0 || gj < 0 || gi > LADO || gj > LADO) return 0;
    const i = Math.min(LADO - 1, Math.floor(gi)), j = Math.min(LADO - 1, Math.floor(gj));
    const u = gi - i, v = gj - j, h = this.h;
    const a = h[Terreno.idx(i, j)], b = h[Terreno.idx(i + 1, j)], c = h[Terreno.idx(i, j + 1)], d = h[Terreno.idx(i + 1, j + 1)];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  /** La normal (sin normalizar del todo) en (x, z), por diferencias. */
  normalEn(x: number, z: number): [number, number, number] {
    const e = 0.5;
    const dx = (this.alturaEn(x + e, z) - this.alturaEn(x - e, z)) / (2 * e);
    const dz = (this.alturaEn(x, z + e) - this.alturaEn(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  }

  /** Dónde el rayo toca el terreno (marcha + bisección). null si no lo toca
   *  dentro de la grilla. Sirve aunque el terreno sea plano (da y = 0). */
  rayo(o: [number, number, number], d: [number, number, number], lejos = 1200): [number, number, number] | null {
    const paso = 0.5;
    let t0 = 0;
    const sobre = (t: number) => { const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t; return y - this.alturaEn(x, z); };
    const dentro = (t: number) => { const x = o[0] + d[0] * t, z = o[2] + d[2] * t; return Math.abs(x) <= MITAD && Math.abs(z) <= MITAD; };
    let s0 = sobre(0);
    if (s0 < 0) return null;                          // la cámara está bajo tierra
    for (let t = paso; t <= lejos; t += paso) {
      const s = sobre(t);
      if (s <= 0 && dentro(t)) {
        let a = t0, b = t;
        for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (sobre(m) > 0) a = m; else b = m; }
        return [o[0] + d[0] * b, o[1] + d[1] * b, o[2] + d[2] * b];
      }
      t0 = t; s0 = s;
    }
    return null;
  }

  /** Copia del rectángulo (para deshacer). */
  copiar(i0: number, j0: number, i1: number, j1: number): Parche {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(LADO, i1); j1 = Math.min(LADO, j1);
    const w = i1 - i0 + 1, alturas = new Float32Array(Math.max(0, w * (j1 - j0 + 1)));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) alturas[(j - j0) * w + (i - i0)] = this.h[Terreno.idx(i, j)];
    return { i0, j0, i1, j1, alturas };
  }
  pegar(p: Parche): void {
    const w = p.i1 - p.i0 + 1;
    for (let j = p.j0; j <= p.j1; j++) for (let i = p.i0; i <= p.i1; i++) this.h[Terreno.idx(i, j)] = p.alturas[(j - p.j0) * w + (i - p.i0)];
  }

  /** Una pincelada en (x, z): `dt` es cuánto pesa este toque (el motor lo da
   *  por distancia recorrida). `nivel` es la altura de aplanar. Devuelve el
   *  rectángulo tocado (para rearmar sólo esa parte de la malla). */
  pincelar(x: number, z: number, p: PincelTerreno, dt: number, nivel = 0): [number, number, number, number] | null {
    const [ci, cj] = Terreno.aGrilla(x, z), r = Math.max(1, p.radio);
    const i0 = Math.max(0, Math.floor(ci - r)), i1 = Math.min(LADO, Math.ceil(ci + r));
    const j0 = Math.max(0, Math.floor(cj - r)), j1 = Math.min(LADO, Math.ceil(cj + r));
    if (i0 > i1 || j0 > j1) return null;
    const fuerza = Math.max(0, Math.min(1, p.fuerza)) * dt;
    const viejo = p.modo === 'suavizar' ? this.copiar(i0 - 1, j0 - 1, i1 + 1, j1 + 1) : null;
    const h = this.h;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dist = Math.hypot(i - ci, j - cj);
      if (dist > r) continue;
      const k = Math.cos((dist / r) * Math.PI / 2) ** 2 * fuerza, id = Terreno.idx(i, j);
      if (p.modo === 'levantar') h[id] += k * 2.5;
      else if (p.modo === 'hundir') h[id] -= k * 2.5;
      else if (p.modo === 'aplanar') h[id] += (nivel - h[id]) * Math.min(1, k * 2);
      else if (viejo) {
        const w = viejo.i1 - viejo.i0 + 1, a = (ii: number, jj: number) => viejo.alturas[(Math.max(viejo.j0, Math.min(viejo.j1, jj)) - viejo.j0) * w + (Math.max(viejo.i0, Math.min(viejo.i1, ii)) - viejo.i0)];
        const prom = (a(i - 1, j) + a(i + 1, j) + a(i, j - 1) + a(i, j + 1) + a(i, j) * 4) / 8;
        h[id] += (prom - h[id]) * Math.min(1, k * 3);
      }
    }
    return [i0, j0, i1, j1];
  }

  /** Cava un CAUCE a lo largo de un recorrido (x, z): el lecho baja de a poco
   *  (el agua no sube), `ancho` de orilla a orilla y `hondo` metros bajo la
   *  orilla más baja. Devuelve la altura del agua en cada punto del eje. */
  cavarRio(eje: [number, number][], ancho: number, hondo: number): number[] {
    if (eje.length < 2) return [];
    // el nivel del agua: la orilla en cada punto, sin subir nunca río abajo
    const nivel: number[] = [];
    for (const [x, z] of eje) {
      const orilla = this.alturaEn(x, z);
      nivel.push(nivel.length ? Math.min(nivel[nivel.length - 1], orilla) : orilla);
    }
    const r = ancho / 2 + 2;                         // las márgenes en pendiente
    let i0 = LADO, j0 = LADO, i1 = 0, j1 = 0;
    for (const [x, z] of eje) { const [gi, gj] = Terreno.aGrilla(x, z); i0 = Math.min(i0, Math.floor(gi - r)); i1 = Math.max(i1, Math.ceil(gi + r)); j0 = Math.min(j0, Math.floor(gj - r)); j1 = Math.max(j1, Math.ceil(gj + r)); }
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(LADO, i1); j1 = Math.min(LADO, j1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x, z] = Terreno.aMundo(i, j);
      // el punto del eje más cercano y su nivel
      let mejor = Infinity, nv = 0;
      for (let s = 0; s < eje.length - 1; s++) {
        const [ax, az] = eje[s], [bx, bz] = eje[s + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < mejor) { mejor = d; nv = nivel[s] + (nivel[s + 1] - nivel[s]) * t; }
      }
      if (mejor > r) continue;
      const lecho = nv - hondo, id = Terreno.idx(i, j);
      // adentro del cauce, el lecho (cóncavo); en la margen, de la orilla al lecho
      const fondo = mejor <= ancho / 2 ? lecho + hondo * 0.6 * (mejor / (ancho / 2)) ** 2 : lecho + (nv - lecho) * ((mejor - ancho / 2) / 2);
      if (this.h[id] > fondo) this.h[id] = fondo;
    }
    return nivel.map((n) => n - hondo * 0.3);
  }

  /** Cava un LAGO dentro de un contorno (x, z): el agua queda a la altura de
   *  la orilla más baja y el fondo baja hasta `hondo` hacia el centro.
   *  Devuelve la altura del agua. */
  cavarLago(contorno: [number, number][], hondo: number): number {
    if (contorno.length < 3) return 0;
    const orilla = Math.min(...contorno.map(([x, z]) => this.alturaEn(x, z)));
    const agua = orilla - 0.25;
    let i0 = LADO, j0 = LADO, i1 = 0, j1 = 0;
    for (const [x, z] of contorno) { const [gi, gj] = Terreno.aGrilla(x, z); i0 = Math.min(i0, Math.floor(gi)); i1 = Math.max(i1, Math.ceil(gi)); j0 = Math.min(j0, Math.floor(gj)); j1 = Math.max(j1, Math.ceil(gj)); }
    i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1); i1 = Math.min(LADO, i1 + 1); j1 = Math.min(LADO, j1 + 1);
    const adentro = (x: number, z: number) => { let c = false; for (let a = 0, b = contorno.length - 1; a < contorno.length; b = a++) { const [xa, za] = contorno[a], [xb, zb] = contorno[b]; if ((za > z) !== (zb > z) && x < (xb - xa) * (z - za) / (zb - za) + xa) c = !c; } return c; };
    const alBorde = (x: number, z: number) => { let m = Infinity; for (let a = 0; a < contorno.length; a++) { const [ax, az] = contorno[a], [bx, bz] = contorno[(a + 1) % contorno.length], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return m; };
    let lejos = 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const [x, z] = Terreno.aMundo(i, j); if (adentro(x, z)) lejos = Math.max(lejos, alBorde(x, z)); }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x, z] = Terreno.aMundo(i, j);
      if (!adentro(x, z)) continue;
      const f = Math.min(1, alBorde(x, z) / Math.min(lejos, 6));      // la playa: 6 m hasta lo hondo
      const fondo = agua - 0.15 - hondo * Math.sin(f * Math.PI / 2), id = Terreno.idx(i, j);
      if (this.h[id] > fondo) this.h[id] = fondo;
    }
    return agua;
  }

  /** Para guardar: centímetros en Int16 (±327 m), en base64. Vacío si es plano. */
  aTexto(): string {
    if (this.plano()) return '';
    const cm = new Int16Array(this.h.length);
    for (let k = 0; k < cm.length; k++) cm[k] = Math.max(-32767, Math.min(32767, Math.round(this.h[k] * 100)));
    const b = new Uint8Array(cm.buffer);
    let s = '';
    for (let k = 0; k < b.length; k += 0x8000) s += String.fromCharCode(...b.subarray(k, k + 0x8000));
    return btoa(s);
  }
  deTexto(t: string | undefined): boolean {
    this.h.fill(0);
    if (!t) return true;
    try {
      const s = atob(t);
      if (s.length !== this.h.length * 2) return false;
      const b = new Uint8Array(s.length);
      for (let k = 0; k < s.length; k++) b[k] = s.charCodeAt(k);
      const cm = new Int16Array(b.buffer);
      for (let k = 0; k < cm.length; k++) this.h[k] = cm[k] / 100;
      return true;
    } catch { this.h.fill(0); return false; }
  }

  /** Las posiciones (x, y, z) y los colores (r, g, b) de la malla, con un
   *  color por altura y pendiente. `paleta` en 0–1. Triángulos por índice. */
  geometria(paleta: { pasto: number[]; tierra: number[]; roca: number[]; nieve: number[] }, nieveDesde = 22):
    { pos: Float32Array; col: Float32Array; idx: Uint32Array } {
    const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const id = Terreno.idx(i, j), [x, z] = Terreno.aMundo(i, j), y = this.h[id];
      pos[id * 3] = x; pos[id * 3 + 1] = y; pos[id * 3 + 2] = z;
      const [, ny] = this.normalEn(x, z);
      const pend = 1 - ny;                                   // 0 plano … 1 vertical
      let c = y < -0.3 ? paleta.tierra : paleta.pasto;
      if (pend > 0.28) c = mezcla(c, paleta.roca, Math.min(1, (pend - 0.28) * 5));
      if (y > nieveDesde) c = mezcla(c, paleta.nieve, Math.min(1, (y - nieveDesde) / 4));
      col[id * 3] = c[0]; col[id * 3 + 1] = c[1]; col[id * 3 + 2] = c[2];
    }
    const idx = new Uint32Array(LADO * LADO * 6);
    let k = 0;
    for (let j = 0; j < LADO; j++) for (let i = 0; i < LADO; i++) {
      const a = Terreno.idx(i, j), b = Terreno.idx(i + 1, j), c = Terreno.idx(i, j + 1), d = Terreno.idx(i + 1, j + 1);
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    return { pos, col, idx };
  }
}

const mezcla = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
