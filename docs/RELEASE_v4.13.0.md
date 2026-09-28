# LOW v4.13.0 — Equipo: trabajar con otros, en tu propio servidor

Hasta acá LOW era de a uno. Esta versión abre el proyecto al equipo: se ve
quién está y en qué cuadro, se toman las piezas para que nadie las pise, el
dibujo va y viene, y los comentarios quedan pegados al cuadro del que hablan.

**Corre en tu droplet.** No hay servicio de terceros en el medio, no hay cuenta
que crear, no hay nada de esto que dependa de que una empresa siga existiendo.

## El servidor

`server/low_relay.py`: un archivo, **sin dependencias**. En el droplet se
levanta con el Python que ya está instalado.

```bash
LOW_RELAY_TOKEN=una-clave-larga python3 server/low_relay.py --puerto 8787 --datos /var/lib/low-relay
```

En `server/README.md` está el servicio de systemd y la configuración de nginx
con TLS —incluido el `proxy_read_timeout` largo, sin el cual nginx corta las
conexiones quietas y el equipo se pasa el día reconectando—.

No se agregó ninguna biblioteca a propósito: un relé que en dos años no arranca
porque una dependencia cambió de API es un relé que nadie va a mantener. El
protocolo WebSocket son treinta líneas y están ahí, a la vista.

## Qué decide el servidor

Casi nada, y eso es deliberado. **Los bloqueos**, y sólo eso. Dos personas que
piden la misma pieza en el mismo instante no pueden resolverlo entre ellas:
alguien tiene que ser el árbitro. Sin eso las dos creen que ganaron y se pisan
el dibujo.

Las operaciones las numera, las guarda y las reparte, pero no las interpreta:
no sabe qué es un hueso ni una capa, y no debe saberlo. Si supiera, habría que
actualizar el servidor cada vez que LOW aprende algo nuevo.

Los bloqueos del que se desconecta **se sueltan solos**. Un bloqueo que
sobrevive al que lo tomó deja la pieza trabada hasta que alguien entre al
servidor a mano, y esa es la forma más rápida de que el equipo deje de usarlos.

## Del lado de LOW

**Ventana → Equipo.** Servidor, proyecto, tu nombre, clave y rol. Los roles son
de verdad, no decoración: `reviewer` sólo comenta y `viewer` sólo mira, y el
servidor los rechaza si intentan otra cosa.

Tres cosas que tenían que salir bien y por las que hay pruebas específicas:

**Lo que se dibuja sin red no se pierde.** Se aplica local en el acto y se
encola; al reconectar sale en orden. Un colaborativo que exige red para dibujar
es peor que trabajar solo.

**No se aplica dos veces.** La operación propia vuelve del servidor con su
número, igual que las ajenas. Si se aplicara al volver, cada trazo se dibujaría
dos veces.

**Se reintenta con espera creciente.** 1s, 2s, 4s… hasta 30, con un pellizco de
azar para que diez personas no vuelvan todas en el mismo instante. Un reintento
por segundo contra un servidor caído es un ataque al propio droplet.

## El Ctrl+Z de uno no deshace el trabajo del otro

Lo que llega del equipo entra en el documento **sin pasar por el historial
propio**. Es lo que espera cualquiera que dibuja, y la prueba lo verifica
contando los pasos del historial antes y después de recibir un cambio ajeno.

## Lo grueso, dicho de frente

El dibujo se reparte por **instantánea de nivel**: cuando algo cambia, sale la
capa y su nivel enteros. Es grueso a propósito, y por eso va de la mano con los
bloqueos: si dos personas editan el **mismo** nivel a la vez, la última
instantánea gana y alguien pierde trazos. Tomando el nivel eso no pasa.

No es una fusión carácter por carácter tipo documento de texto. Para dibujo, y
con niveles tomados, alcanza — y es honesto decir dónde está el límite en vez
de prometer una fusión que no hay.

## Lo que NO incluye

**Pantalla compartida.** Estaba en la lista y no está: es video en vivo entre
navegadores (WebRTC), un problema distinto del de sincronizar operaciones y una
pieza aparte. Prefiero decirlo que dejarlo a medias.

## Dos bugs que aparecieron en el camino

**Clickear un chip de la barra de cuadros no hacía nada.** Con un documento
abierto, `DZ.anim.frames` queda vacía a propósito —los cuadros los define la
escena, no una lista de archivos— y `dzGoFrame` exigía esa lista antes de
hacer cualquier cosa. Se veían los chips y ninguno movía la cabeza lectora; se
navegaba sólo por atajos y por la X-sheet, que es por lo que pasó inadvertido.
Corregido y con guardia propia en `check_workspace_ui.js`.

**Dos LOW se devolvían la misma instantánea.** El dibujo que llega pasa por el
lienzo, que lo normaliza en sus capas de arte, y esa versión salía de vuelta.
Ahora no se manda lo que ya está allá afuera. La prueba comprueba las dos cosas
que importan: que el dibujo del otro **sobrevive** a la normalización, y que
después de una vuelta se queda quieto.

## Pruebas

- `tools/check_relay_server.py` — el protocolo con **clientes WebSocket
  reales**: sala, numeración, puesta al día del que llega tarde, bloqueos
  arbitrados, liberación al desconectarse, presencia, comentarios, roles,
  clave, aislamiento entre salas, salud por HTTP y persistencia tras reinicio.
- `tools/run_collab_transport_tests.js` — **34/34**: el cliente ante cortes de
  red, con socket de mentira y relojes controlados.
- `tools/check_colab_ui.js` — LOW **contra el servidor de verdad**: la propia
  página abre una segunda conexión que hace de la otra persona.
- 7 pruebas de modelo nuevas (360 en total) y 13 contratos estáticos.
- Batería completa antes de publicar: 10 suites de modelo, 4 comprobaciones
  Python y **14 recorridos E2E**, todos en verde.

Una aclaración sobre el arnés: las tres primeras fallas de la prueba del
servidor eran del propio arnés —mensajes encolados de pasos anteriores que
hacían pasar por buena una comprobación que miraba un mensaje viejo—. Se
corrigieron y recién entonces esas tres cosas quedaron verificadas de verdad.

## Lo que queda dicho como está

`tools/check_color_studio_ui.js` sigue **fuera** de la puerta de CI: falla de
forma intermitente cuando corre en ráfaga con los demás. Es una limitación del
arnés, no del producto, y se sigue corriendo a mano.

La configuración del panel —incluida la clave del relé— se guarda en el
navegador embebido, en la máquina de cada uno. Es cómodo y es lo que hace
cualquier cliente, pero conviene saberlo.

## Reversión

Estable previa: `v4.12.0`. Sin conectarse, LOW se comporta exactamente igual
que antes: el panel de Equipo no toca nada mientras esté desconectado.
