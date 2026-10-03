# LOW 3.1.2 — el flujo completo, recorrido en la app real

Esta versión sale de hacer, en la aplicación instalada y con un perfil nuevo (como lo tiene quien instala LOW por primera vez), el recorrido completo de un chico: crear un documento, dibujar, pasar al cuadro 2, papel cebolla, agregar una capa, deshacer, cerrar mal el programa, recuperar, guardar, cerrar y volver a abrir. Con todas las pruebas automáticas en verde, aparecieron seis defectos graves. Están todos arreglados y cada uno tiene su prueba.

## Lo que se arregló

- **«Nuevo documento» no hacía nada en una instalación nueva.** Sin una carpeta de proyecto elegida, el puente fallaba con «No hay workspace abierto» y el error iba a parar al chat de IA, que en el estudio 2D no se ve. Ahora LOW usa su propia carpeta, `Documentos\LOW Proyectos`, y la recuerda. Si algo falla al crear, lo dice en pantalla.

- **Cada trazo necesitaba dos Ctrl+Z, y el segundo dejaba la mesa vacía.** El deshacer viejo (el de los `.svg` sueltos) guardaba una foto del lienzo además del paso del documento. Deshacer esa foto restauraba un lienzo viejo, sin las otras capas. Ahora un trazo es un solo paso. Y un Ctrl+Z inmediato, antes de que el trazo termine de guardarse, deshace ese trazo y no el anterior.

- **«Recuperar lo que quedó sin guardar» creaba un documento vacío.** El trabajo seguía guardado, pero inalcanzable: el documento vacío pasaba a ser el «más nuevo» y era el que se ofrecía la vez siguiente. Ahora el botón abre lo rescatado en su archivo, marcado como sin guardar, y Ctrl+S lo escribe. Un documento recién creado y vacío ya no cuenta como trabajo para rescatar.

- **Abrir con «Abrir documento…» un archivo con cambios sin guardar no avisaba**, y al seguir trabajando el autoguardado pisaba esos cambios. Ahora pregunta si abrir los cambios o lo último guardado. Si los dos son iguales, no pregunta nada.

- **Al abrir un `.low`, la línea de tiempo quedaba apagada**: solo se veía la barra de transporte, sin capas ni X-sheet. Ahora se enciende si el espacio activo la usa, y no te cambia de espacio.

- **Cerrar un documento te mandaba a la pantalla de código e IA**, y en el caso del menú dejaba la pestaña colgada: volver a abrir el mismo archivo no abría nada. Ahora las tres formas de cerrar (el menú, la × de la pestaña y la X de la barra) vuelven al estudio 2D, con su invitación para crear o abrir.

- **Todo documento nuevo nacía «sin guardar»** y con un paso fantasma para deshacer. Cerrarlo sin haberlo tocado preguntaba «¿descartar cambios?», y esa falsa alarma enseña a apretar Descartar sin leer. Ahora nace limpio.

- **Abrir un archivo o apretar Play lo dejaba «sin guardar»** sin haber cambiado nada. Abrir desde la pantalla vacía arrastraba una marca del lienzo anterior. Al reproducir, pasar por un cuadro vacío de alguna capa también marcaba cambios. Ahora, en un documento `.low`, lo que figura sin guardar lo decide el documento. Un trazo de verdad sigue marcándolo; mirar ya no.

- **Si abrir un documento fallaba, no se veía ningún aviso.** El mensaje iba al chat de IA. Ahora aparece en el estudio.

- **Exportar: el botón principal era MP4 y en una computadora sin ffmpeg fallaba.** Esa es la situación de casi cualquier chico. Ahora el diálogo sabe qué funciona en esa máquina. Sin ffmpeg, el principal pasa a ser «GIF animado» y MP4 explica qué le falta. Además LOW usa el ffmpeg del paquete `imageio-ffmpeg` si está instalado.

- **Todo se exportaba en 1080×608 aunque el documento fuera 1920×1080.** El MP4, la secuencia PNG y Premiere salen ahora en la resolución del documento. El GIF conserva el tope de 1080 px, porque a 1920 pesa demasiado para compartir.

- **Después de actualizar, LOW podía seguir mostrando la interfaz vieja.** La caché de la ventana sobrevive a las actualizaciones, y el servidor interno no le decía que volviera a pedir los archivos. Ahora los pide siempre y, al cambiar de versión, vacía esa caché. Las preferencias y los puntos de rescate no se tocan. Esto puede explicar algún «instalé el arreglo y sigue igual».

## Pruebas nuevas en CI

`check_un_trazo_un_deshacer_ui`, `check_rescate_escena_ui`, `check_cerrar_documento_ui`, `check_reproducir_no_ensucia_ui`, `check_exportar_sin_ffmpeg_ui` y `check_ui_sin_cache_backend`. Además, `check_escena_nueva_backend` cubre ahora el primer arranque y `check_export_anim_backend` comprueba qué informa el puente sobre MP4. Cada una falla sin su arreglo: las verifiqué quitando el arreglo y viendo que la prueba cae.

Dos pruebas viejas dependían del deshacer anterior: `check_vector_nodes_ui` metía trazos en el lienzo sin avisarle al programa, algo que ninguna herramienta real hace. Ahora marca el cambio como lo haría una herramienta. A `check_cambiar_capa_ui` ahora espera a que aparezca cada elemento, en vez de suponer un tiempo fijo.

## Lo que no está probado

La entrada física de una tableta. Los trazos de esta sesión son eventos reales de mouse.
