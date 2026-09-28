# LOW v4.27.0 — El cartel que criaba lobo

Reporte: *«aparece un cartel diciendo que se instaló una versión nueva con LOW
abierto pero no es correcto, y además ya lo cerré y lo volví a abrir y el cartel
persiste»*.

Tiene razón, y el defecto es **mío**, de la v4.23.0. Peor: la función existía
justamente para no confundir a nadie, y terminó haciendo lo contrario.

## Por qué saltaba

Yo lo adivinaba comparando la **fecha del ejecutable** con el arranque del
proceso: si el archivo era más nuevo, alguien había instalado con LOW abierto.

Medido en su máquina:

| | |
|---|---|
| mtime del `LOW.exe` instalado | `12:47:54` |
| reloj de la máquina | `10:16:38` |
| diferencia | el archivo dice estar **151 minutos en el futuro** |
| zona horaria | UTC−3 |

**El instalador conserva la marca de tiempo del build, y el build corre en
UTC.** Así que en una máquina en UTC−3 el archivo instalado dice estar unas tres
horas adelante, y mi comparación era verdadera **siempre**, en todos los
arranques y para siempre. De ahí que cerrar y volver a abrir no cambiara nada:
no era un estado pegado, era el cálculo saltando de nuevo.

Y eso es más grave que no avisar. Un cartel que aparece cuando no corresponde
entrena a ignorarlo, así que el día que sí corresponda tampoco se va a leer.

## Cómo se arregla

Con una señal exacta en vez de una heurística: **el instalador anota la versión
que acaba de instalar** en `HKCU\Software\LOW\Version`, y el programa la compara
con la que trae compilada adentro. Si el registro dice una **más nueva**, esta
ventana quedó con código viejo.

No depende de ningún reloj, ni de zonas horarias, ni de cómo el instalador
maneje las fechas. Es la única señal fiable disponible: un ejecutable de un solo
archivo no puede leer su propia versión nueva sin desempacarse.

Las versiones se comparan **por número**, no como texto: `4.9.0` es anterior a
`4.26.0`, y una comparación de cadenas diría lo contrario.

Y el aviso ahora dice **las dos** versiones, que es lo que uno necesita saber:

> **Se instaló LOW 4.28.0 con el programa abierto.** Esta ventana sigue
> corriendo la 4.27.0, así que los arreglos de la 4.28.0 no están acá. Cerrá LOW
> y volvé a abrirlo.

## Cuándo desaparece el cartel en tu máquina

Al instalar **esta** versión. La 4.26.0 que estás corriendo tiene el cálculo
viejo compilado adentro, y nada de lo que publique puede cambiar un proceso que
ya está en memoria. Instalá la 4.27.0 y no vuelve.

Como la 4.26.0 no dejó la clave en el registro, la 4.27.0 arranca **sin señal**
y por lo tanto sin aviso — que es lo correcto: en un primer arranque nadie
instaló nada por encima.

## Pruebas

El guard `check_version_onion_ui.js` ya existía; ahora prueba la señal nueva y,
sobre todo, **el falso positivo**: le pasa `151 * 60` —el número exacto del
reporte— y exige que **no** dispare nada. Verificado contra su violación:
volviendo a aceptar cualquier valor, el guard falla con «un número vuelve a
disparar el aviso».

5 contratos estáticos nuevos, y uno de ellos prohíbe que `st_mtime` vuelva a
aparecer en `main.py` para esto.

## Reversión

Estable previa: `v4.26.0`. El cambio toca `binario_reemplazado()` en `main.py`,
una línea del `[Registry]` del instalador y el texto del aviso.
