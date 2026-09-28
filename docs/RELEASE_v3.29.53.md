# LOW v3.29.53 — La mano ya no deja la pantalla pegada

Con **tableta o lápiz**, usar la mano para navegar el lienzo dejaba la pantalla
pegada al cursor: el dibujo seguía moviéndose solo, sin apretar nada, y el
puntero quedaba en "agarrando" para siempre. La única salida era recargar.

## Por qué pasaba

El paneo entraba por un evento de **puntero** —que es lo que emite una tableta—
pero después seguía el arrastre escuchando eventos de **mouse**. Y como al
entrar hace `preventDefault()`, el navegador deja de emitir los eventos de mouse
equivalentes. Resultado con lápiz: el `mouseup` no llegaba nunca.

Eso dejaba dos fallas encadenadas: el lienzo **no respondía** mientras
arrastrabas, y el seguidor quedaba vivo después de soltar, así que el próximo
movimiento del lápiz —ya sin apretar— se llevaba la pantalla con él.

Con mouse común no se notaba, porque ahí los eventos de mouse sí llegan.

## Qué cambió

El arrastre ahora se sigue con eventos de puntero, filtrando por el id del
puntero que lo empezó, y se suelta por cualquiera de estas vías: al levantar el
lápiz, si el sistema cancela el puntero, o si la ventana pierde el foco
(alt-tab a mitad del gesto). Además toma la captura del puntero, así soltar
fuera del lienzo también termina el paneo.

## Qué se midió

Gesto de lápiz completo —apoyar, arrastrar 60×40, levantar— y después mover sin
apretar:

| caso | antes | ahora |
| --- | --- | --- |
| paneo mientras arrastrás con lápiz | no respondía: `0,0` | sigue el lápiz: `60,40` |
| mover el lápiz después de soltar | la pantalla saltaba a `259,180` | no se mueve |
| cursor al terminar | quedaba en «agarrando» | vuelve al de la herramienta |
| mouse + herramienta mano | andaba | sigue andando: `30,20` |
| barra espaciadora + lápiz | — | panea `-45,25` y el cursor vuelve al lápiz |
| alt-tab a mitad del arrastre | quedaba pegada | suelta y no se mueve más |
