/* ══════════════════════════════════════════════════════════════════════════
   LO QUE ES OBRA, AL DISCO (fase 1 del camino a la estabilidad)

   Antes de la 3.44 la biblioteca 3D (los personajes con su escultura, ropa y
   actuación; las escenografías propias) y el autoguardado de la escena vivían
   en el almacenamiento del navegador: de 5 a 10 MB, y lleno fallaba EN
   SILENCIO. Ahora, adentro de LOW, van a archivos (almacen3d.py) por la página
   que contiene al estudio (ui/core/almacen-3d.js):
   - cada escritura va en cola: si llegan varias, se escribe la última (lo de
     antes ya no importa) y nunca dos a la vez;
   - si falla, se AVISA (evento «low3d:aviso», que el motor muestra);
   - un navegador suelto (las pruebas, el estudio abierto solo) sigue usando su
     almacenamiento, como antes.

   @module design/engine/almacen3d
   ══════════════════════════════════════════════════════════════════════════ */

export type NombreAlmacen = 'biblioteca' | 'autoguardado';
export interface RespuestaAlmacen { ok?: boolean; json?: string | null; error?: string; sinApp?: boolean; respaldo?: boolean; bytes?: number }

/** ¿El estudio corre adentro de LOW (en su iframe)? */
export const enLOW = (): boolean => { try { return window.parent !== window; } catch { return false; } };

let siguiente = 0;
const esperando = new Map<number, (r: RespuestaAlmacen) => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('message', (ev: MessageEvent) => {
    const m = ev.data as (RespuestaAlmacen & { type?: string; id?: number }) | null;
    if (!m || typeof m !== 'object' || m.type !== 'low:almacen-respuesta' || typeof m.id !== 'number') return;
    const listo = esperando.get(m.id);
    if (listo) { esperando.delete(m.id); listo(m); }
  });
}

/** Una operación con el disco, por la página de LOW. */
export function pedir(op: 'leer' | 'guardar' | 'borrar', nombre: NombreAlmacen, json?: string): Promise<RespuestaAlmacen> {
  if (!enLOW()) return Promise.resolve({ sinApp: true, error: 'fuera de LOW' });
  return new Promise((listo) => {
    const id = ++siguiente;
    esperando.set(id, listo);
    try { window.parent.postMessage({ type: 'low:almacen', op, nombre, json, id }, window.location.origin); }
    catch (e) { esperando.delete(id); listo({ error: String(e) }); return; }
    // una biblioteca grande tarda en escribirse: espera generosa
    window.setTimeout(() => { if (esperando.has(id)) { esperando.delete(id); listo({ error: 'la app no contestó' }); } }, 60000);
  });
}

/** Un aviso que se ve (el motor lo muestra en su barra). */
export function avisar(texto: string): void {
  try { window.dispatchEvent(new CustomEvent('low3d:aviso', { detail: texto })); } catch { /* sin ventana */ }
}

/* la cola de escritura: por nombre, la última versión gana */
const cola = new Map<NombreAlmacen, { enCurso: boolean; pendiente: string | null; esperan: ((r: RespuestaAlmacen) => void)[] }>();
/** Guarda en disco; resuelve con el resultado de la escritura que incluyó este contenido. */
export function guardarEnDisco(nombre: NombreAlmacen, json: string): Promise<RespuestaAlmacen> {
  let c = cola.get(nombre);
  if (!c) { c = { enCurso: false, pendiente: null, esperan: [] }; cola.set(nombre, c); }
  c.pendiente = json;
  const p = new Promise<RespuestaAlmacen>((r) => c!.esperan.push(r));
  if (!c.enCurso) void vaciar(nombre);
  return p;
}
async function vaciar(nombre: NombreAlmacen): Promise<void> {
  const c = cola.get(nombre)!;
  c.enCurso = true;
  while (c.pendiente !== null) {
    const json = c.pendiente, esperan = c.esperan;
    c.pendiente = null; c.esperan = [];
    const r = await pedir('guardar', nombre, json);
    for (const e of esperan) e(r);
  }
  c.enCurso = false;
}
/** ¿Queda algo por escribir? (al cerrar, para las pruebas) */
export function escribiendo(): boolean { for (const c of cola.values()) if (c.enCurso || c.pendiente !== null) return true; return false; }
