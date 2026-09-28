# LOW v4.37.0 — el XML de Premiere nombraba archivos que no existían

Esta versión cierra el último **parcial** que quedaba en el inventario de
capacidades, y al cerrarlo apareció un defecto de los que arruinan una entrega.

## 1. Premiere abría la secuencia con todos los cuadros perdidos

El nombre de los cuadros lo calculan **dos lados distintos**: el frontend lo
escribe dentro del XML, y `export_premiere` escribe los archivos en el disco. Y
cada uno tenía su propia regla para limpiar el nombre de la escena:

```
frontend:  name.replace(/[^\w.-]+/g, "_")
puente:    re.sub(r"[^\w.-]+", "_", name).strip("_")
```

Con una escena llamada **«El Gato (final)»** —o «Escena 1!», o cualquiera que
termine en algo que no sea letra o número— el XML pedía
`El_Gato_final__0001.png` y el puente escribía `El_Gato_final_0001.png`.
Premiere importa eso con **todos los cuadros offline**, pidiendo relinkear uno
por uno: exactamente lo que el comentario de ese código dice que evita.

Ahora los dos lados usan la misma regla, y la prueba del puente comprueba la
única cosa que importa de verdad: **cada archivo que el XML nombra tiene que
existir en la carpeta**.

## 2. El camino desde el menú no lo probaba nadie

El inventario lo decía con todas las letras: «el archivo que sale está probado,
el camino desde el menú no». Ahora está probado, y lo que se cuida es:

- Que **avise antes** de exportar si la escena no tiene audio cargado — porque
  el que viene a *sincronizar* y se lleva un XML mudo se entera en el montaje.
- Que **cancelar no escriba nada**: si el puente se llama igual, el aviso es
  decorado.
- Que salgan **todos los cuadros del rango**, incluidos los que están en blanco.
  Un hueco que desaparece adelanta un cuadro todo lo que sigue, y con audio eso
  es el labial corrido.
- Que el XML nombre **tantos archivos como cuadros** se mandan, con el nombre
  exacto que el puente va a escribir.

## 3. El diagnóstico de tableta crecía sin techo

`diag-log.txt` escribe un renglón por evento de puntero y sólo hacía `append`.
Medido en la máquina de Mauro: **23 MB** creciendo desde agosto dentro de
`%APPDATA%`. Un log que nadie vacía deja de ser diagnóstico y pasa a ser basura
que ocupa disco.

Ahora tiene un tope de 2 MB y, al recortar, conserva **la última mitad**:
recortar guardando el principio sería peor que no recortar, porque se tiraría
justo lo que hace falta para diagnosticar lo que acaba de pasar.

## 4. El plan maestro se contradecía con el repositorio

`LOW_PLAN_MAESTRO_2026-09.md` tenía **todo el backlog sin tildar**, incluidos
items publicados hacía días. Un plan que se contradice con el código es
exactamente la enfermedad que A01 vino a diagnosticar, así que ahora está
sincronizado y con tres estados: `[x]` cerrado con versión y prueba, `[~]`
parcial con lo que falta dicho, `[ ]` abierto.

Cerrados: **A01, A02, A03, A04, B03, C01, C02**. Parciales: **B01, B02, C03**
(los tres esperan revisión artística, no código) y **F05**. La prueba maestra
§15 (**A05**) queda abierta y **no está bloqueada por nadie**: el probador
humano de LOW es Mauro.

## Pruebas

- **`check_export_premiere_ui.js`** y **`check_export_premiere_backend.py`**,
  nuevas y en CI. Seis mutaciones verificadas, incluida la que reproduce el
  defecto del nombre.
- **`check_diag_log_backend.py`**, nueva y en CI. Tres mutaciones verificadas.
- **Cuatro contratos estáticos nuevos** (279 en total).
- Puerta completa: **12 suites, 11 comprobaciones de puente y 41 recorridos. 0
  fallos.**

## Un defecto de mi propia prueba, que vale anotarlo

La primera versión del recorrido comprobaba los nombres del XML con
`startsWith`, y `El_Gato_final__0001.png` —con dos guiones bajos— también
empieza con `El_Gato_final_`. O sea que la prueba **pasaba con el defecto
puesto**. Se vio porque la mutación no mordió, que es para lo que existe el
paso de mutaciones. Ahora la comparación es exacta, nombre por nombre.

## Reversión

Estable previa: `v4.36.1`. El arreglo del nombre es una línea en
`dzExportPremiere` (`ui/app.js`); el tope del log, `save_tablet_log` en
`main.py`.
