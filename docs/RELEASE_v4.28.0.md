# LOW v4.28.0 — LOW abre dibujando

Decisión de Mauro, y da vuelta la jerarquía que el programa tenía desde el
principio:

> Mantengamos un solo programa avanzando más sobre el módulo 2D y haciéndolo más
> presente, que sea la primera pantalla, y que la IA y redes sean un botón — al
> revés de lo que es ahora.

Hasta acá LOW abría en el lado programador —la conversación con el agente, el
árbol del proyecto, las herramientas de código— y el estudio de dibujo vivía
detrás del ícono de la pluma. **Ahora se abre dibujando**, y al agente se va con
un botón que dice **✳ IA**.

## Lo que se ve al abrir

El estudio, con sus herramientas y sus paneles, y en el medio una invitación con
las dos únicas cosas que uno quiere hacer al empezar: **Nuevo documento** o
**Abrir documento…**. Debajo, en chico, «o ir a IA y redes».

## Los cuatro cuidados, y los cuatro salieron de medir

**1. No se crea ningún archivo al arrancar.** El camino que ya existía para
entrar al diseño llama a `new_design()`, que **escribe** un
`disenos/diseno_<fecha>.svg`. Usarlo en el arranque habría dejado un SVG nuevo
por cada vez que abrís LOW. La primera pantalla se abre vacía y sólo crea cuando
se lo pedís.

**2. El módulo vacío se veía roto.** Medido antes de tocar nada: abrir el estudio
sin documento deja las herramientas y los paneles, y en el medio un damero
enorme sin lienzo, sin pestañas y sin nada que hacer. Eso no se lee como «listo
para empezar», se lee como «algo falló». De ahí la invitación.

**3. El botón a la IA no puede ser el de cerrar.** El botón X del estudio corre
`closeDesign()`, que **cierra el documento** — no cambia de pantalla. Si el
interruptor hubiera sido ése, cambiar de pantalla te haría perder el dibujo. El
botón nuevo sólo esconde el estudio: el documento queda abierto y volver es
inmediato. Los dos siguen existiendo y hacen cosas distintas.

**4. La vuelta tampoco puede crear archivos.** La pluma de la barra izquierda
corría `designEntry()`, que si no hay `DZ.path` crea un archivo. Eso era
tolerable cuando entrar al diseño pasaba una vez por sesión; **ahora que la IA es
un botón, el viaje de ida y vuelta es constante**, y cada vuelta habría dejado un
SVG nuevo. Peor: con un `.low` abierto `DZ.path` puede estar en null, así que el
archivo se habría creado teniendo trabajo abierto. Ahora la vuelta muestra lo que
ya hay, y sólo delega en el camino viejo si de verdad no hay nada.

## Dos trampas que casi me comen, y quedan escritas

**`?.` no protege un identificador suelto.** La llamada del arranque era
`dzPantallaInicial?.()`. Si el módulo no cargara, eso lanza **ReferenceError** —el
`?.` sólo cubre valores nulos de un binding que existe, no identificadores no
declarados— y como `init()` es `async` y sin `try`, el arranque moriría ahí
dejando **el programa en nada**. Va por `window.dzPantallaInicial?.()`, que nunca
tira. Hay un contrato que lo exige.

**`window.DZ` no existe.** `DZ` se declara con `const` en `app.js`, así que es un
binding léxico y no una propiedad de `window` — igual que `api`. Leyéndolo como
`window.DZ`, mi comprobación de «¿hay algo abierto?» devolvía siempre falso y la
invitación **no se iba nunca**, ni con un documento encima. Hay contrato.

## Pruebas

`tools/check_pantalla_inicial_ui.js`, nueva y en la puerta de CI. Deja que el
arranque termine **solo** y después exige: que el 2D esté abierto, que **no se
haya creado nada**, que la invitación esté con sus tres acciones, que el botón a
la IA exista, se lea, **no sea** el de cerrar y esté antes que él; que ir a la IA
esconda el estudio **conservando el documento y las pestañas**; y que volver no
cree nada. Además comprueba que el arranque llegó al final, que es cómo se
detecta que la llamada nueva no se llevó puesto `init()`.

Lo que esa prueba **no** cubre, a propósito: que el X siga cerrando el documento.
Cerrar sin guardar abre un modal propio y el arnés se cuelga esperándolo; eso ya
lo cubre `check_document_tabs_ui`, que sabe clickear el modal. Me colgó una
corrida antes de acordarme.

6 contratos estáticos nuevos, dos verificados a mano contra su violación.

Y uno de esos contratos tuvo que aprender algo: **buscar un texto en un archivo
que además lo explica encuentra la explicación**. Mis primeras dos versiones
mordían el comentario que dice «no usar `closeDesign` acá». Ahora se sacan los
comentarios antes de comprobar — la misma corrección que hizo falta con
`appearance: slider-vertical` en `app.css`.

## Lo que NO se hizo, y por qué

**No se partió el programa en dos.** Lo medí para poder opinar: el lado de
animación son ~15.100 líneas, el de IA/redes 2.221, y **lo compartido 23.827**
(`main.py` con 209 métodos de puente, y `app.js`). El bulto no está en las
mitades, está en el medio, y ese corte es la deuda de §12 que viene bajando de a
poco. Un dato a favor del corte, para cuando toque: **la animación no llama ni
una vez al código de IA/redes** — la dependencia ya es de una sola vía.

Esto es el paso que da casi todo el beneficio y cuesta días en vez de semanas: la
persona que se siente a hacer la prueba maestra de §15 ya no se encuentra con un
programa que hace dos cosas sin relación.

## Reversión

Estable previa: `v4.27.0`. Se revierte sacando la llamada de `app.js` línea 334;
el módulo y su hoja quedan inertes.
