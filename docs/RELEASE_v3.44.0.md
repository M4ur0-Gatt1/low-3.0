# LOW 3.44.0 · Que no se pierda nada (fase 1 del camino a la estabilidad)

Sin funciones nuevas: es la primera entrega del camino a la estabilidad (`docs/CAMINO_ESTABILIDAD.md`).

## Lo que cambia para quien usa LOW

- **Tus personajes y escenografías del 3D se guardan en archivos**, en `%APPDATA%/LOW/estudio3d/`. Antes vivían en el almacenamiento del navegador (5 a 10 MB): con unos pocos personajes en «Muy alta» el guardado fallaba sin avisar. La primera vez que abrís el 3D, lo que había pasa solo al disco.
- **El autoguardado de la escena 3D también va al disco.**
- **«Mis personajes» del 2D (rig) también va al disco**, en `%APPDATA%/LOW/obra/`. Ya no hay tope de 40: antes el número 41 borraba al más viejo.
- **Si algo no se puede guardar, LOW avisa** con el motivo y deja una copia de emergencia, que se suma al archivo la próxima vez que se pueda.
- **El rescate ante caídas avisa si no entra.** Pasa con documentos de más de 2,5 MB o con el almacén lleno. Antes, el día de la caída no había nada que recuperar y nada lo había dicho.
- Cada archivo se escribe aparte y recién después reemplaza al anterior, que queda como respaldo (`.bak`). Un corte de luz no deja nada a medias.

## Defectos corregidos

- Guardar un personaje mientras la biblioteca todavía se estaba leyendo (unos 2 s con una grande) reemplazaba la biblioteca entera por la lista vacía del arranque. Pasaba en el 3D y en el 2D.
- 2D: un personaje dañado vaciaba la lista, y el próximo «Guardar» pisaba todos. Ahora el dañado no se muestra pero se conserva.
- 2D: el personaje número 41 borraba al más viejo.

## Medido

- **En la app real (WebView2):** 10 personajes «Muy alta» (26,7 MB) y la escena sobreviven a un cierre forzado (`node tools/check_almacen_3d_real.js`).
- **Pruebas nuevas:**
  - `tools/check_almacen3d_backend.py` (8 casos: corte a mitad de escritura, respaldo, archivo principal siempre presente, rechazos);
  - `tools/check_almacen_3d_ui.js`;
  - `tools/check_personajes_2d_disco_ui.js`;
  - `tools/check_rescate_aviso_ui.js`.

## Pendiente de la fase 1

Llevar el rescate ante caídas al disco (v3.45).
