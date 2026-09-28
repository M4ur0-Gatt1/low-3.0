# LOW v4.38.0 — achicar una forma ya no le cambia el espesor al contorno

Dos cosas que aparecieron probando la v4.37.0 recién instalada. La primera la
reportó Mauro; la segunda salió al ir a verificar la primera.

## 1. El contorno cambiaba de espesor, y distinto en cada lado

> «cuando achico una forma o la deformo no tiene que cambiar el espesor de
> ninguno de los lados»

Redimensionar escribía una `transform` con la escala sobre el elemento, y en SVG
una transformación escala **todo**: la geometría y también el trazo. Con la
deformación libre —Shift en una esquina— el factor es distinto por eje, así que
los lados verticales se pintaban con el factor X y los horizontales con el Y.

Medido antes del arreglo, achicando un rectángulo de contorno 12:

```
matrix(0.050445 0 0 0.715134 …)
lado vertical   → 0,32 px pintados
lado horizontal → 4,52 px pintados      ← catorce veces más grueso
```

Ahora **no se escala el elemento: se escala su geometría**. Un rectángulo cambia
su `x/y/width/height`, un trazado sus coordenadas, y una forma entintada su
`data-d` —y se vuelve a entintar con el mismo `data-grosor`, así que la cinta
sale igual de ancha por construcción, no por compensación—. El `stroke-width` no
se toca nunca.

Vale para el tirador de una forma y para el de la selección múltiple. Si un tipo
no se puede escalar sin mentir —un círculo estirado sólo en un eje ya no es un
círculo— se usa la transformación de siempre: es preferible eso a convertir el
elemento en otra cosa a mitad de un arrastre.

**Comprobado en la app real**, no sólo en el mock: un rectángulo de 900×500 con
contorno 18, achicado a 162×375 —factores bien distintos por eje—, queda con
**7,20 px de espesor en los dos lados**, idéntico a antes de tocarlo.

## 2. Y una segunda instancia de LOW no abría

Esto lo introduje yo en v4.32.0. Fijar el perfil de la interfaz evitó que LOW
estrenara almacenamiento vacío en cada arranque —era pérdida de datos—, pero
**WebView2 toma ese perfil en exclusiva**. Con LOW abierto, abrir una segunda
instancia terminaba así:

```
[pywebview] WebView2 initialization failed with exception:
  (0x8007139F): El grupo o recurso no está en el estado correcto…
```

Ni ventana, ni aviso: sólo una traza de .NET en el log. Apareció al intentar
abrir LOW para verificar el arreglo de arriba mientras Mauro lo tenía abierto —o
sea, exactamente el caso de alguien que quiere dos proyectos a la vez—.

Ahora el arranque mira el candado del **propio WebView2** (`EBWebView/lockfile`)
y, si el perfil de siempre está tomado, usa `webview-2`. La segunda instancia
abre y funciona; lo que no comparte son las preferencias con la otra, y queda
dicho en el log. Se mira ese candado a propósito y no uno nuestro: así se detecta
también una instancia de una **versión anterior** de LOW, que es el caso real.

Cuando la otra se cierra, el perfil de siempre vuelve a usarse: no se acumulan
carpetas.

## Pruebas

- **`check_escala_contorno_ui.js`, nueva y en CI**: arrastra el tirador con el
  mouse de verdad, con y sin Shift, y exige tres cosas juntas — que los cuatro
  lados queden iguales **entre sí**, que queden iguales **a como estaban**, y que
  la forma **sí** haya cambiado de tamaño (si no, no cambiar el espesor es
  trivial y la prueba estaría certificando una herramienta rota). Más el
  `data-grosor` de una forma entintada y el Undo.
- **`check_perfil_instancias_backend.py`, nueva y en CI**: simula el candado de
  WebView2 tal cual y comprueba el reparto de perfiles y su reutilización.
- **Cinco contratos estáticos nuevos** (284 en total), uno de ellos negativo: el
  módulo de escalado **nunca** escribe `stroke-width`.
- Puerta completa: **12 suites, 12 comprobaciones de puente y 42 recorridos. 0
  fallos.**

## Dos tropezones propios, anotados

**Un contrato se mordió su propio comentario.** El módulo nuevo explica en su
cabecera que no toca el `stroke-width`, y el contrato que exige justamente eso
buscaba el texto a secas: encontraba la explicación. Se mide sobre el código sin
comentarios, como los otros contratos que ya pisaron esta piedra.

**Y un contrato quedó describiendo una implementación que ya no existe.** La
primera versión del reparto de perfiles usaba un candado propio; al reescribirlo
para mirar el de WebView2, el contrato siguió exigiendo el candado viejo y la
puerta se puso roja. Lo agarró la puerta local antes de publicar, que es para lo
que está.

## Reversión

Estable previa: `v4.37.0`. El escalado por geometría vive en
`ui/vector/escala-geometrica.js` y son dos líneas en `app.js`; el reparto de
perfiles, en `_perfil_libre` de `main.py`.

---

## Apéndice — v4.38.1: la prueba nueva no corría en Linux

La compilación de la v4.38.0 se cayó, y no por el producto: mi prueba del
reparto de perfiles importaba `msvcrt` sin condición para simular el candado de
WebView2, y ese módulo **sólo existe en Windows**. CI compila también para Linux
y macOS.

Ahora toma el candado con el mecanismo de cada plataforma —`msvcrt` en Windows,
`fcntl` en el resto—, que es lo mismo que ya hacía el código del producto.

El código de LOW es idéntico al de la v4.38.0; lo único que cambió es la prueba.
