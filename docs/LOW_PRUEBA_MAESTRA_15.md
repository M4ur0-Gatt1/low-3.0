# La prueba maestra (§15) — cómo se corre

La §15 de la biblia es la que decide si LOW está a la altura de su promesa. Pide
que **una persona que no participó del desarrollo** haga un proyecto completo
**sin ayuda**, y —esto es la parte que se olvida— que el proceso «quede grabado
como prueba repetible y se mida en errores, tiempo, interrupciones y necesidad de
ayuda».

Hasta la v4.25.0 no existía con qué medirlo. Ahora sí: **Ayuda → Prueba maestra
§15…**

## Qué hace falta antes de empezar

- **Una persona ajena al desarrollo.** No vale el autor. No vale alguien a quien
  se le explicó el programa antes. Ese es el punto de la prueba.
- **Una tableta**, porque el paso 2 la pide.
- **Un segundo personaje en piezas** para importar (paso 5). Conviene tenerlo
  listo en una carpeta antes de arrancar, para que buscarlo no cuente como parte
  de la prueba.
- **Audio** para el paso 9.
- Y nada más. Sin manual, sin tutorial, sin nadie al lado.

## Las reglas, que son incómodas a propósito

**No se ayuda.** Si la persona se traba, se traba. Cuando pida ayuda, se aprieta
«Necesité ayuda…» y se anota **en qué** se trabó, con sus palabras. Recién
entonces se le contesta. Ese botón es el dato más valioso de toda la prueba: es
el único que dice dónde el programa no se explica solo.

**El paso se empieza antes de hacerlo.** El cronómetro no se puede rellenar
después: el instrumento no deja marcar un paso terminado que nunca se empezó, a
propósito. Un tiempo inventado ensucia la única medición limpia que hay.

**«Con ayuda» no es «listo».** El instrumento los distingue y el veredicto exige
los **doce pasos sin ayuda**. Once y uno con ayuda es NO aprobada. Así está
escrito en §13: «ningún área puede pasar de 8 hasta que se corra la prueba
maestra de §15».

**Los errores no se preguntan.** Se cuentan solos, enganchando los mismos
eventos que usa el informe de fallo, y se atribuyen al paso que estaba abierto.
Nadie recuerda cuántas veces algo falló mientras trabajaba.

**El paso 12 es un cierre forzado de verdad.** Se mata el proceso desde el
administrador de tareas, no se cierra la ventana. Y el instrumento lo nota: si
la corrida quedó sin cerrar, la próxima vez que se abra suma una interrupción.

## Qué queda grabado

Dos archivos por corrida, en `%APPDATA%\LOW\sesiones\` (en macOS y Linux, la
carpeta de datos equivalente):

- **`prueba15-AAAAMMDD-HHMMSS.json`** — el esqueleto estable de los doce pasos,
  con id fijo (`p01`…`p12`), tiempos, errores, ayudas con su nota, resultado, más
  la versión de LOW y la plataforma. Es el archivo para **comparar** corridas.
- **`prueba15-AAAAMMDD-HHMMSS.md`** — el mismo dato en una tabla legible, con el
  veredicto arriba.

El panel guarda solo mientras se avanza, así que una corrida interrumpida no se
pierde: al reabrir LOW continúa donde estaba y anota la interrupción.

## Cómo se lee el resultado

La línea que importa es la primera: **«N de 12 pasos sin ayuda»**. Después:

| dato | qué te dice |
|---|---|
| tiempo por paso | dónde el programa hace perder el tiempo, no dónde falla |
| errores por paso | qué parte se rompe bajo uso real, no bajo prueba |
| ayudas con su nota | **dónde el programa no se explica solo** |
| interrupciones | cuántas veces se cayó o hubo que matarlo |

Una corrida con doce pasos hechos y cinco pedidos de ayuda **no es un éxito**:
es un programa que funciona y no se entiende. Son dos problemas distintos y el
instrumento los separa a propósito.

## Y qué hacer con eso

Cada nota de ayuda es un defecto de interfaz con nombre y apellido. Cada error
contado es un defecto de producto. La comparación entre dos corridas —misma
tabla, distinta versión— es la única evidencia de «validación humana» que la §13
acepta.

Mientras la prueba no se corra ni una vez, la respuesta honesta a «¿cuánto
falta?» sigue siendo: **el programa está listo para que lo use su autor, y
todavía no probado para que lo use otro.**
