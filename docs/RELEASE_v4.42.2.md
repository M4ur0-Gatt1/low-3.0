# LOW v4.42.2 — el botón muerto, la promesa falsa, y una auditoría que queda

Cierre del barrido de la familia `DZ.path`. Lo que quedaba era chico pero uno de
los dos podía costar un documento entero.

## 1. «Ver en el navegador» no hacía nada — y arreglarlo mal era peor

El botón estaba escrito así:

```js
if (DZ.path) api.preview_html(DZ.path, ...)
```

Con un `.low` no hay `DZ.path`: el botón no hacía **nada**, sin decir por qué.

Lo obvio era pasarle la ruta del documento, como en la exportación. **Habría
sido un desastre**: `preview_html` *escribe* en la ruta que recibe, así que le
habría encajado el HTML del lienzo encima al `.low` y el documento se perdía.

La salida correcta es la contraria: pasar `null` y dejar que el puente escriba
un **temporal**, que es lo que ya sabía hacer. Ahora el botón anda siempre, y un
contrato impide que alguien «arregle» esto pasándole la ruta del documento.

## 2. Composición prometía dos paneles que esconde a propósito

El espacio declaraba `layers` y `code` visibles, y el CSS los oculta —a
propósito: Composición trae su propio outliner e inspector, y el doble panel
aplastaba el escenario—. La definición mentía.

No es un detalle de prolijidad: **esa mentira es lo que hace imposible auditar
el resto**, y es parte de cómo se me escapó el espacio de Animación apagado.
Ahora la definición dice la verdad.

## 3. Y la auditoría queda puesta

`check_espacio_animacion_ui` recorre **los siete espacios** con un documento
abierto y exige que cada panel que un espacio promete **se vea de verdad**. Si
alguno vuelve a prometer lo que no muestra —o deja de encender lo que promete—,
la prueba lo dice con nombre y apellido. Mutación verificada.

## Y una verificación que da tranquilidad

El **punto de recuperación sí se guarda** con documentos nuevos: medido, 2.749
bytes con el dibujo sin guardar adentro, ocho segundos después de dibujarlo. La
familia `DZ.path` no se llevó puesto el rescate.

## Pruebas

- **Auditoría de los siete espacios**, nueva y en CI, con mutación verificada.
- **Un contrato estático nuevo** (317 en total), verificado por mutación.
- Barrido completo de `api.*(DZ.path)`: lo que queda —guardar el `.svg`,
  variaciones con IA, prompt sobre el diseño— trabaja **sobre ese archivo** y
  está bien como está.
- Puerta completa: **12 suites, 12 puentes y 47 recorridos. 0 fallos.**

## Reversión

Estable previa: `v4.42.1`. Son dos líneas en `ui/app.js` y dos en
`ui/workspace/workspaces.js`.
