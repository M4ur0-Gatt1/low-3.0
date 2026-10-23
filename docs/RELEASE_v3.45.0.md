# LOW 3.45.0 · El rescate ante caídas, en disco (fase 1 terminada)

Sin funciones nuevas. Cierra la fase 1 del camino a la estabilidad, «que no se pierda nada» (`docs/CAMINO_ESTABILIDAD.md`).

## Lo que cambia para quien usa LOW

- **Lo que no llegaste a guardar se rescata en archivos**, en `%APPDATA%/LOW/rescate/`, y ya no en el almacenamiento del navegador (unos 5 MB). Si LOW se cierra mal, al volver la pantalla inicial te ofrece recuperarlo, como antes.
- **Los documentos grandes también tienen rescate.** Antes, uno de más de 2,5 MB no tenía; desde la 3.44 por lo menos avisaba.
- La primera vez que abrís LOW, los rescates que había en el navegador pasan solos al disco.
- **Si el disco falla al rescatar, LOW avisa** con el motivo y deja una copia en el navegador.

## Defectos que se evitaron al hacerlo

- Abrir un documento en el primer instante (doble clic en un .low) podía consultar el rescate antes de que llegara del disco: no lo ofrecía, y el autoguardado lo pisaba. Ahora abrir espera a la lectura.
- La pantalla inicial se pinta antes de que la app pueda leer el disco: un rescate que estaba sólo en el disco no se ofrecía. Ahora se repinta cuando llega.

## Medido

- **En la app real (WebView2) con cierre forzado:** el rescate de un documento de 3 MB y el de una escena vuelven, se ofrecen al arrancar, y el navegador queda sin obra (`node tools/check_rescate_real.js`). Las bibliotecas de la 3.44 siguen en verde (`node tools/check_almacen_3d_real.js`).
- **Pruebas nuevas o ampliadas:**
  - `tools/check_rescate_disco_ui.js` (el pase, un rescate que está sólo en el disco, abrir con el disco lento);
  - `tools/check_rescate_aviso_ui.js` (falla del disco);
  - `tools/check_almacen3d_backend.py` (9 casos).
