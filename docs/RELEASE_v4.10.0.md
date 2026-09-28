# LOW v4.10.0 — Controles: los diales de cara y manos

Cierra el **último nivel** de la tabla de deformación de la biblia (§4.3). Con
esto los seis niveles —rígido, flexi-binding, pesos, malla, Smart Bones y
controles— están hechos.

## Qué es

Un **control** es un dial con nombre: «boca abierta», «ceja izquierda», «mano
cerrada». No es un hueso ni una pieza: es un número entre dos extremos que el
animador mueve y que conduce acciones.

Desde **Rigging → Construir → Controles**: *Nuevo control*, le ponés nombre, y
aparece su dial. Moverlo **deja clave** en el cuadro actual — un control que no
se anima sirve para mirar, no para actuar.

## La decisión que lo hace barato

Un control es **un canal más**, con la ruta `controls/<id>`. Con eso hereda todo
lo que ya estaba probado, sin código nuevo:

- se le ponen claves por cuadro y se interpola;
- aparece en el **Function Editor** con sus curvas y tangentes, como
  «dial · boca abierta»;
- cualquier **Smart Bone** puede tomarlo de conductor, igual que toma el ángulo
  de un hueso.

Un dial de cara animable sale, así, de piezas que ya funcionaban. No hay un
subsistema paralelo para la cara.

Detalles que importan: un dial sin claves vale su **reposo**, para que una cara
recién armada no arranque con todas sus correcciones al mínimo; un valor fuera
del recorrido se **acota** en vez de romper el dial; y quitar un control se lleva
su canal y deja **sin conductor** a las acciones que conducía, en vez de que
sigan aportando a ciegas.

## Corregido

- El filtro «Selección» del editor de curvas escondía los diales cuando había
  una pieza seleccionada. Un dial no es de un hueso, es del personaje: ahora se
  muestran siempre, que es justo cuando se los necesita —animando la cara con
  una pieza elegida—.

## Pruebas

- 23 pruebas de modelo nuevas (suite de Smart Bones y controles: **51/51**):
  validación del recorrido, reposo sin claves, interpolación, acotado, el dial
  como canal, conducción de acciones, corrección del recorrido, persistencia y
  el desenganche al quitarlo.
- El recorrido E2E de Smart Bones cubre ahora el circuito del panel: crear el
  dial contestando el modal real, moverlo y comprobar que deja **una** clave, y
  que aparece en el editor de curvas.
- Cinco contratos estáticos nuevos.
- Los **13** recorridos E2E y las 7 suites de modelo, en verde.

## Pendiente

- De §12 SIGUIENTE quedan: **audio y lipsync**, y la prueba de mocap con videos
  reales.
- De §12 AHORA queda el punto 7, la extracción de `app.js`.
- **Trabajo remoto en equipo**: el modelo de colaboración existe y está probado
  (relojes Lamport, roles, bloqueos, presencia, cola offline), pero **no tiene
  transporte ni interfaz** — nadie puede compartir todavía. Es la próxima
  decisión de diseño, no un arreglo.

## Reversión

Estable previa: `v4.9.0`. Los controles son una rama nueva del rig; una escena
guardada con `v4.10.0` abre en `v4.9.0` y los diales quedan ignorados.
