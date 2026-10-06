# LOW 3.6.0 — Bibliotecas de pinceles de Photoshop, Krita, Procreate y GIMP, y tres bibliotecas libres incluidas

Pedido de Mauro: «quiero que incorpores pinceles de otros softwares para instalar bibliotecas como las de Photoshop… y que le instales bibliotecas de pinceles». Esta es la segunda de tres entregas.

## Instalar bibliotecas de otros programas

En el Estudio de pinceles, **«Instalar biblioteca…»** acepta uno o varios archivos a la vez:

| Programa | Archivos | Qué se lee |
|---|---|---|
| **Photoshop** | `.abr` (versiones viejas y nuevas) | Las puntas, también las **comprimidas**, y los ajustes de cada pincel: diámetro, espaciado, ángulo, redondez y dureza. |
| **Krita** | `.bundle`, `.kpp` | Los presets con sus puntas, incluidas las **animadas** (varias celdas). |
| **Procreate** | `.brushset`, `.brush` | La forma (`Shape.png`), el **grano** propio del pincel (`Grain.png`) y sus ajustes: espaciado, tamaño, presión y dispersión. |
| **GIMP** | `.gbr`, `.gih` | La punta. Las animadas se usan como **variantes**: una al azar en cada sello. |
| **MyPaint** | `.myb` | Los ajustes; la punta es redonda. |
| Cualquiera | `.zip` | El archivo tal como se descarga, con los pinceles adentro. |

Antes LOW rechazaba casi todos los `.abr` («Este ABR usa puntas comprimidas sin preview compatible»). De un `.brushset` tomaba cualquier imagen sin leer el pincel, y Krita y GIMP no se podían instalar.

### Probado con bibliotecas reales

- `.abr` de Photoshop de K. M. Alexander: **148 y 238 puntas**, iguales a las originales.
- `.bundle` de Krita de David Revoy: **46 pinceles**, 12 de ellos con punta animada (61 celdas).

Las puntas de Krita que eran opacas (tinta oscura sobre fondo blanco) salían como cuadrados negros; ahora se leen bien.

## Las bibliotecas quedan instaladas como archivos

Cada biblioteca se guarda en la carpeta de datos de LOW (`%APPDATA%\LOW\pinceles`) y se carga cada vez que abrís el programa. Antes los pinceles importados iban al almacén del navegador, donde entran unos 5 MB: una biblioteca de Photoshop con cientos de puntas no cabía.

En el **selector de pincel**, cada biblioteca aparece como su propio grupo (📚). En el Estudio podés elegir una, ver su autor y su licencia, y **quitarla**.

## Tres bibliotecas libres, incluidas de fábrica

Las tres tienen licencia **CC0** (dominio público): se pueden usar en trabajos comerciales y vienen dentro de LOW.

- **David Revoy · Krita 25.01:** 46 pinceles de ilustración y pintura del autor de *Pepper&Carrot*.
- **K. M. Alexander · Myer:** 148 sellos de árboles y asentamientos para mapas.
- **K. M. Alexander · Mercator:** 238 sellos cartográficos de pueblos y ciudades.

Los créditos completos, con fuente, licencia y checksum, están en `pinceles/CREDITOS.md`. Una biblioteca incluida no se borra: **«Ocultar biblioteca»** la saca de la vista.

## Sellos con un toque

- **Un toque** con un pincel de sellos (un árbol, una casa) deja **un sello**. Antes, un trazo de un solo punto se descartaba y no quedaba nada.
- **Un sello no se duplica:** un toque dejaba dos sellos encimados, con el doble de tinta.
- **Las puntas importadas no giran con el trazo,** igual que en Photoshop y Krita: un árbol queda derecho.

## Pruebas

- **`check_brush_import_backend.py`** (nueva, 13 casos) arma archivos de cada formato byte por byte, con la misma estructura que usa cada programa, y exige que la punta importada sea **igual píxel a píxel** a la guardada:
  - `.abr` 6.1 y 6.2, con y sin compresión, y v2;
  - `.gbr` en gris y RGBA, y `.gih` (también opacos);
  - `.kpp` y `.bundle`, `.brushset`, `.myb` y `.zip`;
  - instalar, listar y quitar bibliotecas, y las incluidas;
  - que cada biblioteca que viaja con LOW declare licencia CC0, autor y fuente, y figure en los créditos.
- **`check_bibliotecas_ui.js`** (nueva) usa clics reales. Comprueba que:
  - **«Instalar biblioteca…»** instala y elige el primer pincel;
  - el selector agrupa por biblioteca;
  - el trazo usa la punta propia, y las variantes funcionan;
  - **un toque** deja **un** sello;
  - nada va al almacén del navegador;
  - la biblioteca vuelve al recargar y se puede quitar.
