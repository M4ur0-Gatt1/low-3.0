/* ══════════════════════════════════════════════════════════════════════════
   LA BIBLIOTECA DE PERSONAJES DEL 2D, EN DISCO (v3.44, fase 1 del camino a la
   estabilidad: «que no se pierda nada»)

   «Mis personajes» del rig (dibujo + huesos de cada uno) vivía en el
   almacenamiento del navegador (~5 MB por origen), con tres maneras de perder
   obra sin enterarse:
   - lleno, `setItem` tiraba y el personaje no se guardaba;
   - el personaje número 41 borraba al más viejo (se guardaban los primeros 40);
   - nada avisaba.

   Ahora, adentro de LOW, es un archivo (%APPDATA%/LOW/obra/personajes2d.json,
   almacen3d.py: escritura atómica con respaldo). Acá queda en memoria para leer
   al instante. Las reglas, las mismas que el 3D:
   - lo que había en el navegador pasa al disco la primera vez, y recién se
     borra de ahí cuando el disco confirma;
   - lo que se guarda ANTES de terminar de leer el disco espera y se suma (la
     lista vacía del arranque no puede pisar el archivo);
   - si el disco falla se AVISA y queda una copia de emergencia en el navegador,
     que se suma al archivo la próxima vez;
   - sin el puente al disco (un navegador suelto), el navegador, como antes,
     pero avisando si no entra.

   Reemplaza `dzCharacterLibraryRead/Write` de app.js.

   @module core/personajes-2d-disco
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const CLAVE = "low.2d.characters.v1", NOMBRE = "personajes2d";
  let lista = null;                 // la biblioteca, en crudo (como se guarda)
  let estado = "sin-leer";          // sin-leer | leyendo | listo | ilegible | fuera
  let enEspera = null, lectura = null;
  let escribiendo = false, pendiente = null;

  const deTexto = (t) => { try { const v = JSON.parse(t || "[]"); return Array.isArray(v) ? v.filter((x) => x && x.id) : []; } catch (_) { return []; } };
  const local = () => { try { return global.localStorage.getItem(CLAVE); } catch (_) { return null; } };
  const sacarLocal = () => { try { global.localStorage.removeItem(CLAVE); } catch (_) { /* sin almacén */ } };
  const api = () => { const a = global.pywebview && global.pywebview.api; return a && typeof a.obra2d_guardar === "function" ? a : null; };
  const avisar = (texto) => { try { (global.dzSetStatus || console.warn)(texto); } catch (_) { console.warn(texto); } };
  /** base con nuevos encima: el mismo id se reemplaza, lo demás se agrega */
  const juntar = (base, nuevos) => { const out = base.slice(); for (const k of nuevos) { const i = out.findIndex((x) => x.id === k.id); if (i >= 0) out[i] = k; else out.push(k); } return out; };

  function copiaDeEmergencia(texto, motivo) {
    let copia = false;
    try { global.localStorage.setItem(CLAVE, texto); copia = true; } catch (_) { /* tampoco entró */ }
    avisar("⚠ No se pudo guardar la biblioteca de personajes en el disco: " + motivo +
      (copia ? " · quedó una copia de emergencia" : " · guardá el documento para no perder el personaje"));
  }
  async function escribir(texto) {
    pendiente = texto;
    if (escribiendo) return;
    escribiendo = true;
    while (pendiente !== null) {
      const t = pendiente; pendiente = null;
      let r;
      try { r = await api().obra2d_guardar(NOMBRE, t); } catch (e) { r = { error: String((e && e.message) || e) }; }
      if (r && r.ok) sacarLocal(); else copiaDeEmergencia(t, (r && r.error) || "sin respuesta");
    }
    escribiendo = false;
  }

  function leerLista() {
    if (!lista) lista = deTexto(local());
    return lista;
  }
  function guardarLista(nueva) {
    lista = nueva.slice();
    const texto = JSON.stringify(lista);
    if (estado === "fuera" || !api()) {
      try { global.localStorage.setItem(CLAVE, texto); }
      catch (e) { avisar("⚠ No entró en el almacenamiento: el personaje NO se guardó en la biblioteca (" + ((e && e.message) || e) + ")"); throw e; }
      return;
    }
    if (estado === "sin-leer" || estado === "leyendo") { enEspera = lista.slice(); void iniciar(); return; }
    if (estado === "ilegible") { copiaDeEmergencia(texto, "no se pudo leer el archivo, y escribirlo borraría lo que tiene"); return; }
    void escribir(texto);
  }

  function iniciar() { return (lectura = lectura || leerDisco()); }
  async function leerDisco() {
    const a = api();
    if (!a) { estado = "fuera"; return; }
    estado = "leyendo";
    let r;
    try { r = await a.obra2d_leer(NOMBRE); } catch (e) { r = { error: String((e && e.message) || e) }; }
    const espera = enEspera; enEspera = null;
    if (!r || r.error) {
      estado = "ilegible";
      avisar("⚠ No se pudo leer la biblioteca de personajes del disco: " + ((r && r.error) || "sin respuesta") + " · lo que guardes queda en el navegador, sin tocar el archivo");
      if (espera) guardarLista(espera);
      return;
    }
    estado = "listo";
    const delNavegador = local();
    if (typeof r.json === "string") {
      const delDisco = deTexto(r.json);
      const extra = deTexto(delNavegador).filter((k) => !delDisco.some((x) => x.id === k.id));
      const junta = juntar(juntar(delDisco, extra), espera || []);
      if (extra.length || espera) guardarLista(junta);
      else { lista = junta; if (delNavegador) sacarLocal(); }
    } else if (delNavegador || espera) {
      lista = juntar(deTexto(delNavegador), espera || []);
      void escribir(JSON.stringify(lista));
    } else lista = [];
    try { global.dzCharacterLibraryRender && global.dzCharacterLibraryRender(); } catch (_) { /* sin panel todavía */ }
  }

  /* UNO DAÑADO NO VACÍA LA BIBLIOTECA. Antes se leía con un solo `map`: un
     personaje ilegible tiraba, la lista se veía vacía y el próximo «Guardar»
     escribía [el nuevo] encima de todos. Ahora se lee de a uno; el que no se
     puede leer no se muestra, pero se conserva al guardar. */
  const lib = () => global.LOW && global.LOW.animation && global.LOW.animation.characterLibrary;
  const legible = (x) => { const l = lib(); if (!l) return x; try { return l.read(x); } catch (_) { return null; } };
  global.dzCharacterLibraryRead = function () {
    return leerLista().map(legible).filter(Boolean);
  };
  global.dzCharacterLibraryWrite = function (nueva) {
    nueva = Array.isArray(nueva) ? nueva : [];
    const ilegibles = leerLista().filter((x) => !legible(x) && !nueva.some((k) => k && k.id === x.id));
    guardarLista(nueva.concat(ilegibles));
  };
  global.LOW = global.LOW || {};
  global.LOW.personajes2d = { iniciar, estado: () => estado, escribiendo: () => escribiendo || pendiente !== null };

  if (api()) void iniciar();
  else global.addEventListener("pywebviewready", () => { void iniciar(); });
})(typeof window !== "undefined" ? window : globalThis);
