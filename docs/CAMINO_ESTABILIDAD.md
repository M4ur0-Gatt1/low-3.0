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

## Fase 2 · Pruebas en las que se pueda confiar

Hoy cada puerta trae de 4 a 12 pruebas «intermitentes» (pasan solas), y una, la de reproducción fluida, falla siempre en esta máquina. Una prueba que falla a veces termina sin mirarse, y ahí se cuelan los defectos.

1. **Cero intermitentes.** Cada una se investiga hasta la causa: esperas por tiempo en vez de por estado, recursos compartidos entre carriles. Se arregla la prueba o el programa, según dónde esté la causa. Si una no se puede arreglar en el momento, va a cuarentena con fecha y motivo escritos, y no queda como ruido.
2. **Reproducción fluida:** entender por qué da 37 de 48 cuadros en esta máquina (pasa igual con la 3.41) y arreglarlo. Si es el programa, es la Fase 4.
3. **Humo en la app de verdad.** Una tanda corta que corre en LOW real (WebView2, por CDP en :9224), no en Chrome con el servidor de prueba. Los defectos que sólo existían ahí (la caché vieja, la cola de conexiones, Alt, el almacenamiento vacío) se encontraron a mano. Recorre:
   - arrancar; dibujo nuevo; dibujar; guardar; cerrar; reabrir y comprobar que está igual;
   - exportar MP4;
   - abrir el 3D, guardar un personaje, cerrar y reabrir.

**Criterio:** tres puertas completas seguidas sin intermitentes y el humo en WebView2 en verde.

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
