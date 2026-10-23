# El camino a la estabilidad

Pedido de Mauro (22-oct-2026): «solucioná los problemas que marcás antes de seguir mejorando funciones o agregando herramientas; quiero que lo que tenemos tenga estabilidad, seriedad y confiabilidad».

**Regla mientras dure el camino:** no entran funciones nuevas. Sí entran los arreglos de defectos que aparezcan usando LOW. Cada fase se da por terminada sólo cuando se cumplen sus criterios, medidos y no estimados. Si una fase destapa un problema más grave, ese problema pasa adelante.

El orden va de lo que más daño hace a lo que menos:

1. perder trabajo;
2. no poder confiar en las pruebas;
3. que el código se rompa solo al tocarlo;
4. que sea lento;
5. que sea confuso.

---

## Fase 0 · Cerrar lo abierto

- Publicar la 3.43, que estaba en la puerta.
- Desde acá, congelar las funciones nuevas.

**Criterio:** la 3.43 publicada; este documento en el repositorio.

## Fase 1 · Que no se pierda nada

El riesgo más serio que hay hoy:

- **la biblioteca 3D entera** (tus personajes con su escultura, su ropa, su actuación) y **el guardado automático del 3D** viven en el almacenamiento del navegador, que tiene un límite de 5 a 10 MB;
- si no entra, se guarda **en silencio**: `guardarKitsPropios` devuelve «false» y nadie avisa;
- un personaje en «Muy alta» pesa de uno a dos megas.

Trabajos:

1. La biblioteca 3D y el guardado automático del 3D pasan a **archivos en disco**, en la carpeta de datos de LOW, a través del backend. Es el mismo patrón que ya usan las bibliotecas de pinceles y los fondos.
   - Cada colección va en su archivo.
   - El archivo se escribe aparte y recién después reemplaza al viejo, así un corte de luz no lo deja a medias.
   - Queda la versión anterior como respaldo.
2. **Migración automática:** lo que hoy está en el almacenamiento del navegador pasa al disco la primera vez. No se borra del navegador hasta comprobar que se escribió bien.
3. **Si un guardado falla, se avisa** con un mensaje visible y la razón. Ningún guardado vuelve a fallar en silencio.
4. Inventario de todo lo que se guarda en el navegador. Sólo pueden quedar ahí preferencias (tema, último pincel, si se vio una guía), nunca obra.

**Criterios:**
- una biblioteca de 10 personajes en «Muy alta» sobrevive a cerrar y abrir la app real (WebView2);
- llenar el disco o negar permisos muestra un aviso;
- cero datos de obra en el almacenamiento del navegador.

### Estado (v3.44.0, 22-oct-2026)

Hecho y medido:

- **Biblioteca 3D y autoguardado del 3D en disco** (`%APPDATA%/LOW/estudio3d/`), con pase automático y avisos. Criterio cumplido en la app real: 10 personajes «Muy alta» (26,7 MB, tres veces lo que entra en el navegador) y la escena sobreviven a un **cierre forzado** (`tools/check_almacen_3d_real.js`, local: necesita WebView2).
- **Biblioteca de personajes del 2D en disco** (`%APPDATA%/LOW/obra/`). No estaba en el plan; apareció en el inventario.
- **Escritura atómica sin hueco:** el respaldo se hace con un enlace duro, así el archivo principal no falta ni un instante.

Defectos que aparecieron al hacerlo (todos con su prueba):

- guardar mientras el disco todavía se estaba leyendo (unos 2 s con 27 MB) reemplazaba la biblioteca entera por la lista vacía del arranque, tanto en el 3D como en el 2D;
- en el 2D, un personaje dañado vaciaba la lista, y el próximo «Guardar» pisaba todo;
- en el 2D, el personaje número 41 borraba al más viejo;
- el aviso del 3D se llamaba a sí mismo (recursión infinita).

**Inventario del almacenamiento del navegador**, lo que queda después de la 3.44:

- **Preferencias** (pueden quedar): `low3d:theme`, `low3d:guia-fondos`, `low3d:kit-activo`, `low3d:calle-tipo`, `low3d:iman-fuga`, `low3d:pincel-escultura`, `low.2d.panelLayout`, `low.2d.dockSizes`, `low.panels.v1`, `low.layouts.v1`, `low.toolbar.v1`, `low.workspace.*`, `low.timeline.*`, `low.onion.v2`, `low.camara*`, `low.refent*`, `low.paralelas.mm`, `low.desfase.mm`, `low.matriz`, `low.mesa.v1`, `low.esculpir.v1`, `low.limpieza.v1`, `low.bitmap.v1`, `low.coloring.v1`, `low.color.recent.v1`, `low.palette.*`, `low.brush.actual`, `low.brush.favorites`, `low.dz*`, `low.idioma` y similares.
- **Pinceles propios** (`low.brushes.v1`): son ajustes, pocos KB; las bibliotecas importadas ya van a disco.
- ~~Pendiente, es obra:~~ resuelto en la 3.45 (abajo): el **rescate ante caídas** (`low.document.recovery.*`, `low.scene.recovery.v2.*`). Desde la 3.44 ya no falla en silencio: si no entra, avisa una vez por documento. **Llevarlo al disco es lo que falta para cerrar la fase 1** (v3.45).

### Cierre (v3.45.0, 22-oct-2026) · fase 1 TERMINADA

- **El rescate ante caídas va al disco** (`%APPDATA%/LOW/rescate/`, un archivo por documento o escena, escritura atómica con respaldo). Un almacén con la forma del del navegador (`workspace/rescate-disco.js`) reemplaza al navegador en los dos rescates sin tocar su lógica.
- **Sin el tope de 2,5 MB:** un documento grande ahora tiene rescate.
- **Abrir espera a la lectura:** un documento abierto en el primer instante (doble clic en un .low, «Abrir…») ve su rescate. Antes, con la lectura asíncrona, se abría sin ofrecerlo y el autoguardado lo pisaba.
- **La pantalla inicial se repinta** cuando llega el disco: se pinta antes de que exista el puente, y un rescate que estaba sólo en el disco no se ofrecía.
- **Si el disco falla:** copia en el navegador y aviso con el motivo. Sin el puente al disco, el navegador como antes (con su tope y su poda).

**Criterios cumplidos, medidos en la app real (WebView2) con cierre forzado:**
- 10 personajes «Muy alta» (26,7 MB) y la escena 3D vuelven (`tools/check_almacen_3d_real.js`);
- el rescate de un documento de 3 MB y el de una escena vuelven y se ofrecen al arrancar (`tools/check_rescate_real.js`);
- el almacenamiento del navegador queda sin obra (las dos pruebas lo comprueban);
- llenar el disco o no poder leerlo muestra un aviso (`check_almacen_3d_ui`, `check_personajes_2d_disco_ui`, `check_rescate_aviso_ui`).

Las dos pruebas de la app real son locales (necesitan WebView2): se corren antes de publicar algo que toque el guardado. Pasan a la tanda de humo de la fase 2.

## Fase 2 · Pruebas en las que se pueda confiar

Hoy cada puerta trae de 4 a 12 pruebas «intermitentes» (pasan solas), y una, la de reproducción fluida, falla siempre en esta máquina. Una prueba que falla a veces termina sin mirarse, y ahí se cuelan los defectos.

1. **Cero intermitentes.** Cada una se investiga hasta la causa: esperas por tiempo en vez de por estado, recursos compartidos entre carriles. Se arregla la prueba o el programa, según dónde esté la causa. Si una no se puede arreglar en el momento, va a cuarentena con fecha y motivo escritos, y no queda como ruido.
2. **Reproducción fluida:** entender por qué da 37 de 48 cuadros en esta máquina (pasa igual con la 3.41) y arreglarlo. Si es el programa, es la Fase 4.
3. **Humo en la app de verdad.** Una tanda corta que corre en LOW real (WebView2, por CDP en :9224), no en Chrome con el servidor de prueba. Los defectos que sólo existían ahí (la caché vieja, la cola de conexiones, Alt, el almacenamiento vacío) se encontraron a mano. Recorre:
   - arrancar; dibujo nuevo; dibujar; guardar; cerrar; reabrir y comprobar que está igual;
   - exportar MP4;
   - abrir el 3D, guardar un personaje, cerrar y reabrir.

**Criterio:** tres puertas completas seguidas sin intermitentes y el humo en WebView2 en verde.

### Avance (v3.46.0, 23-oct-2026)

Banco de estrés: la prueba corre N veces en su Chrome mientras otros carriles corren el resto, igual que en la puerta, y cada falla queda entera.

Intermitentes resueltas, las dos con la causa en el **programa** (no en la prueba):

- **`check_guias_regla_ui`**: la guía medía el doble clic con la hora de *atender* el evento (`performance.now()`), no con la de la entrada. Con la máquina ocupada, dos clics rápidos llegaban a más de 450 ms y no contaban como doble clic. Le pasaba igual a una persona. Ahora usa `e.timeStamp`, y también el polígono de selección. La prueba lo reproduce siempre: dos clics a 100 ms con el hilo ocupado 600 ms en medio.
- **`check_panel_espejo_ui`**: la ventana separada borraba y volvía a poner sus hojas de estilo en **cada** cambio del estudio. Mientras cargaban, quedaba sin estilos y, por el `* { transition: color }` del estudio, se desvanecía desde el negro: un parpadeo en cada cambio. Ahora las hojas no se tocan si no cambiaron, y la ventana no se muestra hasta que cargan.

Quedan: `check_perf_budgets`, `check_reproduccion_fluida_ui` (miden tiempos), `check_rig_skeleton_ui` y `check_tomas_ui`.

## Fase 3 · Que el código no se rompa solo

Hoy cada función nueva se cuelga **envolviendo funciones globales**. El final de un trazo pasa por varios envoltorios encadenados (paralelas, AutoCAD, unir puntas, espejo, pincel en vivo) y el resultado depende del orden en que cargan los archivos. `app.js` está clavado en su techo de 16 886 líneas y el motor 3D es una sola clase de unas 8000.

1. **El circuito del trazo, explícito.** Un registro con etapas en orden: arrancar, cada punto, al soltar y después de soltar. Cada módulo se anota en su etapa y con su prioridad, y reemplaza a sus envoltorios. Las combinaciones (paralelas + espejo + referencias + unir puntas) quedan con prueba propia.
2. **Partir `app.js` por áreas**, sin cambiar lo que hace: archivo, lienzo y vista, herramientas, capas, línea de tiempo, exportar. El techo baja en cada paso hasta unas 12 000 líneas.
3. **Partir el motor 3D:** el taller de personaje, las tomas y el terreno pasan a sus propios controladores.

**Criterio:** las mismas pruebas en verde antes y después de cada paso, que el techo de `app.js` baje y que no quede ningún envoltorio en el circuito del trazo.

## Fase 4 · Que no se ponga lento

1. **Una escena de referencia pesada**, guardada en el repositorio: 240 cuadros, unos 300 trazos por cuadro, tres capas y sonido. Se mide en la app real:
   - los cuadros por segundo al reproducir;
   - el tiempo de abrir y de guardar;
   - la memoria;
   - el tiempo de dibujar un trazo con la escena cargada.
2. **Reproducir desde cuadros ya pintados en caché** (imagen por cuadro, rehecha sólo cuando el cuadro cambia), en vez de redibujar el SVG en cada cuadro.
3. Esos números, como **topes en la puerta**. Ya existe `check_perf_budgets` y hay que ampliarlo.

**Criterio:** 24 cuadros por segundo sostenidos en la escena de referencia en esta máquina, y abrirla en menos de 3 segundos.

## Fase 5 · Un solo programa, claro

1. **El 2D y el 3D dicen lo mismo con las mismas palabras.** El grosor ya está; faltan el color, el pincel y el deshacer (un solo historial para el usuario).
2. **Una pasada de orden:** qué va en cada barra, en cada panel y en cada cajón, medido a media pantalla (1000 × 560).
   - La barra del lápiz está llena.
   - El panel del taller es larguísimo.
   - Hay funciones escondidas en «Más herramientas» o en la línea de comandos.
   - Ya pasó que no aparecía la caminata.
3. **Un manual corto con imágenes:** los primeros diez minutos y una página por módulo.

**Criterio:** alguien que no conoce LOW hace sus primeros diez minutos con el manual y sin ayuda.

## Fase 6 · La prueba de fuego

1. **Un corto de 30 segundos hecho entero en LOW**: guion, fondos en 3D, personajes, animación, color, sonido y exportación. Cada tropiezo queda anotado y va a una lista. Esa lista decide qué se arregla primero.
2. **Entre 3 y 5 animadores** de tu red, con el instalador y el manual, durante dos semanas. Lo que reporten entra a la misma lista.

**Criterio:** el corto terminado sin salir de LOW, y la lista de tropiezos cerrada o con fecha.

---

## Recién después

Con esto en verde se vuelve a sumar: el resto de AutoCAD (recortar, alargar, empalme), más paralelas, la ropa esculpible y lo que salga del corto. Cada función nueva entra con su prueba y sin envolver nada: se anota en su circuito.
