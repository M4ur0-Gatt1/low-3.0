# LOW v4.19.0 — Composición deja de ser un diorama

El reporte fue «este módulo es totalmente fake», y después, más preciso: «las
herramientas no hacen nada dentro de composición, no puedo cambiar las
posiciones de los planos». Las dos cosas eran ciertas de la experiencia, y
ninguna era cierta del motor. Vale la pena separarlo.

## Lo que sí era real (medido antes de tocar nada)

Poner Z escribe `data-z` en el elemento → se guarda en el dibujo → llega al
cuadro que se exporta → `dzCamView` aplica **paralaje de verdad**
(`p = 100/(100+z)`, con el dolly compensado para que lo cercano crezca más
rápido). Las cuatro manijas del gizmo funcionan y escriben en el modelo: XY
(x 0→120, y 0→50), Z (0→120), R (rotación 0→45°), S (escala 1→1,4).

## Por qué se sentía falso

**1. Agarrar un plano no lo movía.** Sólo hacía algo si antes apretabas G, R o
S — una interfaz modal estilo Blender que nadie adivina. Por omisión no hay
herramienta puesta, así que agarrabas un plano y no pasaba **nada**.

**2. No había cámara en la pantalla.** Y el paralaje sólo existe cuando la
cámara **se mueve**; la cámara vivía en otro panel. Ordenabas la profundidad y
no veías ningún resultado. La pantalla misma lo admitía: *«todos los planos
están en Z 0: la mesa se ve plana»*.

Trabajo sin resultado visible. Eso es lo que se siente falso aunque el motor
ande.

## Lo que cambia

**Arrastrar un plano lo mueve.** Y si el plano no estaba elegido, el mismo
gesto lo elige y lo mueve — antes el `click` llegaba *después* del arrastre, así
que agarrar un plano nuevo movía el anterior. Las teclas G/R/S siguen mandando
cuando están puestas. El rótulo de la barra ahora dice el gesto en vez de
«Seleccionar»: *«Arrastrá un plano para moverlo · Z profundidad · R rotar · S
escalar»*.

**Vista CÁMARA**, junto a Perspectiva / Frente / Arriba. No dibuja una
aproximación: pinta **el cuadro que se va a exportar**, pasado por el mismo
`dzCamView` que usa la exportación. Si el paralaje no se nota, es porque no
está, no porque la vista mienta.

- **arrastrar** panea la cámara y el paralaje se ve en el acto;
- **rueda** hace dolly;
- **Auto-key** deja clave de cámara al soltar, en **un** paso de historial;
- sin Auto-key la cámara se mueve sólo para mirar y no guarda nada — asomarse
  por el visor sin tocar la animación.

Y una línea que dice si hay algo que ver: *«planos en distinta profundidad:
paneá para ver el paralaje»* o *«todos a la misma profundidad: paneá y se mueven
juntos»*.

## Un arreglo de rendimiento que venía de arriba

`manipulate()` llamaba a `render()` en **cada** `pointermove`, y `render()` vacía
las tarjetas y **clona el dibujo de cada plano**. Con una escena real eso es
clonar el arte completo sesenta veces por segundo, y además destruía y recreaba
la tarjeta que uno tiene agarrada. Ahora el arrastre mueve sólo la tarjeta
arrastrada; el render completo va al soltar. Medido: **2 renders por arrastre**,
contra uno por cada movimiento del puntero.

## Pruebas

`tools/check_composition_ui.js`, nuevo y en la puerta de CI. Verifica el
paralaje **midiendo que dos planos a distinta profundidad se muevan distinto**
—no que «algo cambie»—, y cuenta los renders del arrastre. Se comprobó que
falla con el código viejo, con el mensaje del reporte: *«agarrar un plano y
arrastrarlo NO lo mueve»*.

El recorrido que ya existía (`check_multiplane_ui`) certificaba **presencia**:
contaba gizmos y nunca arrastraba ninguno. Sigue, y ahora hay uno que prueba
conducta.

8 contratos estáticos nuevos.

## La puerta de `app.js` frenó este trabajo, y estuvo bien

Este cambio le agregaba líneas a `app.js`, y la puerta lo rechazó. Así que el
puente de composición —9 funciones, 149 líneas— se fue a
`ui/panels/composition-panel.js`, donde pertenece: al lado del modelo, la vista
y la cámara. `app.js` pasa de 18.008 a **17.863** líneas.

## Reversión

Estable previa: `v4.17.1`. El motor de composición no cambió: cambia cómo se lo
maneja y que ahora se puede ver el resultado.

---

# Además en v4.19.0 — identidad, archivos `.low` y firma

## Los archivos son `.low` y tienen su propio ícono

Las escenas se guardan como **`.low`**. Las `.lowscene` de antes **se siguen
abriendo** — §14 dice que una versión nueva no rompe documentos anteriores — y
el marcador de formato *dentro* del JSON sigue siendo `lowscene`: eso no es la
extensión, es el contenido, y lo lee también el punto de recuperación.

El instalador registra la extensión **por usuario** (`HKCU`), porque LOW se
instala sin permisos de administrador. Y registra un **ícono de documento
propio**, `low_doc.ico`: una hoja con el rayo, distinta del ícono del programa,
que es la convención de Windows para que en una carpeta se distinga un archivo
de una aplicación de un vistazo.

El ícono trae nueve tamaños y **los chicos están dibujados aparte, píxel por
píxel**. Bajar un dibujo de 256 px a 16 con un filtro deja el borde de la hoja
lavado y el rayo convertido en una mancha gris; a 16 px el rayo va macizo del
acento, porque lo que se lee a ese tamaño es la silueta.

**Y el doble clic abre el archivo.** Sin eso la asociación es decorativa:
Windows abriría LOW y el archivo quedaría en el aire. El puente entrega la ruta
**una sola vez** —después la limpia, así un refresco de la interfaz no la reabre
encima de lo que tengas en pantalla— y usa **el mismo camino** que *Abrir
escena*, no una segunda implementación.

## El logo del arranque

El rayo partido naranja/celeste **es el de Aladdin Sane y es identidad**: el
mismo rayo está en el logotipo de la barra superior, y el código lo dice. Así
que no lo toqué, aunque el celeste sea el que se quitó de la interfaz en la
v4.8.0 — una cosa es un acento de interfaz y otra es la marca. Si lo querés
monocromo, es una línea y lo cambio.

Lo que sí cambió es la ejecución: el rayo estaba **colgando 24 px por debajo de
la línea de base** de las letras y ahora apoya donde apoyan la L y la W; el
corte entre los dos colores es vertical y limpio como en el logotipo; hay un
reflejo que le da volumen sin agregar un tercer color; y entra una sola vez, con
las letras apareciendo y el rayo bajando de escala. Con «reducir movimiento»
puesto no hay animación.

Sigue sin interceptar clics, que es lo que antes lo hacía tapar el lienzo y
parecer que «no andaba ningún botón».

## Firma digital: lo que está y lo que no puedo hacer yo

**No puedo conseguir el certificado.** La firma que saca el aviso de Windows
necesita un certificado de firma de código emitido por una autoridad reconocida,
y se compra con verificación de identidad. Un certificado autofirmado **no
sirve**: firma el archivo, Windows no lo reconoce, y el aviso sigue —a veces
peor—.

Lo que **sí** está hecho: la compilación **firma sola en cuanto haya
certificado**. Los dos pasos están cableados, en el orden que importa — el
ejecutable después de compilarlo, y **el instalador después de armarlo**, porque
lo primero que ejecuta el usuario es el setup y es eso lo que Windows mira.
Ambos con `sha256` y **sellado de tiempo**: sin el sello, la firma muere el día
que vence el certificado y los instaladores ya publicados empiezan a avisar de
la nada.

Mientras no haya certificado, los pasos **se saltean solos** con un aviso en el
log: el release sale sin firma en vez de fallar y dejarte sin instaladores.

Para encenderlo: dos secretos en el repositorio, `LOW_PFX_BASE64` y
`LOW_PFX_PASSWORD`. En **`docs/LOW_FIRMA_DIGITAL.md`** está el cómo, la tabla de
tipos de certificado con precios, y dos cosas que suelen sorprender: que desde
2023 los OV/EV **no se entregan como archivo** (la clave va en token o HSM, y
entonces el camino del `.pfx` no sirve), y que con **OV** el aviso puede seguir
un tiempo hasta juntar reputación mientras con **EV** desaparece desde la
primera descarga.

Para el caso de LOW, la opción sensata es **Azure Trusted Signing**: unos 10
dólares por mes, firma de verdad, sin token físico. Si vas por ahí o por un
token, decime y cambio el cableado a ese camino.

## Pruebas

- 12 contratos estáticos nuevos: que se ofrezca `.low`, que se sigan abriendo
  las `.lowscene`, que el doble clic llegue a la aplicación y limpie la ruta,
  que la asociación sea `HKCU` y no `HKLM`, que exista `low_doc.ico`, que se
  firme **con** sellado de tiempo y que se firmen **los dos** archivos, y que el
  celeste del rayo **no** se vaya (es identidad).
- Verificado en el navegador: guarda `Escena.low`, abre un `.low` por ruta, avisa
  si no existe, y **abre una `.lowscene` vieja**.
- `check_multiplane_ui` y el humo del puente exigían `.lowscene` en el nombre
  del archivo guardado; ahora exigen `.low`.
