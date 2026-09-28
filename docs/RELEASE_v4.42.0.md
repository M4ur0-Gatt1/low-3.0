# LOW v4.42.0 — lo que el documento nuevo todavía no podía hacer

Los tres defectos de hoy —el arranque clavado, el panel de animación vacío, el
sidebar que no aparecía— eran **la misma familia**: código escrito para el
camino viejo del `.svg` suelto, que asume `DZ.path`, y que nadie portó cuando
LOW pasó a abrir con «Nuevo documento» y un `.low`.

Así que en vez de esperar al siguiente, se barrió la familia entera.

## 1. No se podía exportar. Nada.

Todas las salidas —MP4, WebM, GIF, secuencia PNG, hoja de sprites y Premiere—
le mandaban `DZ.path` al puente. Un `.low` lo tiene en **null**. Medido en la
app real, documento recién creado, un rectángulo dibujado, exportar secuencia:

```
TypeError: argument should be a str or an os.PathLike object
where __fspath__ returns a str, not 'NoneType'
```

…y el estado clavado en «Guardando la secuencia…». Es decir: **con el flujo por
defecto del programa, lo que animabas no salía de LOW**. El final de todo el
trabajo.

El documento nuevo sí tiene ruta propia —el `.low` que se crea al empezar—, así
que ahora hay una sola verdad, `dzRutaDeSalida(DZ)`, y las cinco salidas la usan.
Y el puente, si igual le llega una ruta vacía, contesta **qué hacer** en vez de
reventar: «guardá el documento antes de exportar».

Verificado en la app real: `escena_20260913_172849_001.png`, 15 KB, con el
dibujo adentro. Mirado, no sólo contado.

## 2. El titiritero no podía actuar

Guardar la toma era escribir archivos `nombre_fNNN.svg` al lado del diseño. Sin
`DZ.path` —y con el puente exigiendo además ese nombre— el titiritero contestaba
«abrí un diseño primero». Con «Nuevo documento» no hay ninguno que abrir.

Ahora la toma se graba **donde vive el trabajo**: cada captura es un dibujo del
nivel de la capa activa, expuesto en cuadros consecutivos después del último. No
pisa lo animado —números de dibujo nuevos, cuadros al final— porque reusar un
número cambiaría el dibujo en todos los cuadros donde ya estaba expuesto.

Medido: 50 capturas → 50 dibujos nuevos, cuadros 1 → 51, y el dibujo que ya
estaba intacto.

## Lo que SÍ debe seguir pidiendo un `.svg`

No todo lo que menciona `DZ.path` está mal: guardar el `.svg`, las variaciones
con IA y el prompt sobre el diseño trabajan **sobre ese archivo**. Se revisaron
uno por uno; quedan como están.

## Pruebas

- **`check_export_documento_nuevo_ui.js`, nueva y en CI**: crea un documento
  como una persona, dibuja, espía el puente y exige que las cuatro salidas
  reciban una **ruta de verdad**. Escrita antes del arreglo y fallando.
- **`check_titiritero_documento_ui.js`, nueva y en CI**: arranca el titiritero,
  deja que grabe, corta, y exige dibujos nuevos y cuadros nuevos **sin pisar** lo
  que ya había. Dos mutaciones verificadas.
- **`check_export_anim_backend.py`**: sin ruta, las dos salidas del puente
  contestan un error legible en vez de un `TypeError`.
- **Seis contratos estáticos nuevos** (315 en total), verificados por mutación.
- Puerta completa: **12 suites, 12 puentes y 47 recorridos. 0 fallos.**

## Reversión

Estable previa: `v4.41.3`. Lo nuevo vive en `ui/animation/ruta-de-salida.js` y
`ui/animation/toma-al-documento.js`; en `app.js` son líneas plegadas.
