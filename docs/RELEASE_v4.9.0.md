# LOW v4.9.0 — La barra espaciadora es la mano, y la barra la armás vos

## La barra espaciadora

Espacio hacía dos cosas a la vez: mantener apretado paneaba, pero con la
animación abierta los atajos de reproducción se lo quedaban primero. Resultado:
el atajo que uno tiene apretado la mitad del tiempo mientras dibuja quedaba
anulado justo cuando más se necesita.

- **Espacio es la mano. Siempre y en todos los modos.** Ya no reproduce.
- **Reproducir pasa a `Enter`**, y es **reasignable** como cualquier otro atajo
  desde Preferencias del estudio, donde ahora aparece como «Reproducir / parar».
- Con la pluma dibujando, `Enter` sigue cerrando el trazado: eso manda, porque
  es lo que se está haciendo en ese momento.

El mapa de atajos configurables sólo admitía teclas sueltas; se extendió para
aceptar `Enter`, que es lo que hacía falta para tener un play que no fuera la
barra.

## La barra de herramientas la armás vos

Qué herramientas están a la vista y cuáles quedan detrás de `⋯` ya no lo decide
una lista fija del programa: hay quien vive con la mano y quien no la toca
nunca, y cualquier lista que elija el programa le va a quedar mal a alguien.

- **Clic derecho sobre una herramienta del cajón** → entra a la barra y se queda
  ahí.
- **Clic derecho sobre una de la barra** → se va al cajón.
- Lo fijado se respeta **antes** que cualquier cálculo de espacio: si la barra no
  da para todas, lo que se baja al cajón es lo que no fijaste. Lo que mandaste al
  cajón no vuelve solo aunque sobre lugar.
- Se guarda por usuario, y sobrevive a mover o acoplar la barra.

## Pruebas

- Cinco contratos estáticos nuevos: la barra espaciadora no vuelve a reproducir,
  reproducir tiene atajo propio y reasignable, `Enter` no pisa el cierre de la
  pluma, la barra sigue siendo configurable y fijar no vuelve a quedar invertido.
- Los **13** recorridos E2E y las 7 suites de modelo, en verde.

Verificado en navegador: con la animación abierta, Espacio activa la mano y no
toca la reproducción; `Enter` arranca y para el play; y el clic derecho mueve una
herramienta entre la barra y el cajón, en los dos sentidos, con persistencia.

## Reversión

Estable previa: `v4.8.0`. Quien tuviera memoria muscular de Espacio para
reproducir puede reasignar `play` a lo que quiera desde Preferencias; el resto
del cambio es de interfaz y no toca el documento.
