# Cortar un dibujo y crear codos o rodillas

En Animación, abrí Rigging / Esqueleto y elegí **Construir**. El bloque
**Cortar y articular** aparece antes de la biblioteca de esqueletos.

1. Seleccioná la forma o el grupo vectorial que vas a trabajar.
2. Si necesitás separar una pieza del dibujo, elegí **Cortar pieza** y marcá
   dos puntos de una línea que lo atraviese. Quedan dos objetos seleccionables.
   Un Ctrl+Z vuelve a unirlos.
3. Seleccioná el brazo o la pierna completos. Ajustá **Zona flexible** antes
   de crear la articulación: un valor mayor ensancha la transición del doblez.
4. **Crear codo** pide hombro, codo y muñeca. **Crear rodilla** pide cadera,
   rodilla y tobillo. Esc o Cancelar abandonan la operación sin modificar el dibujo.
5. Elegí **Animar → Posar** y girá la punta del hueso del antebrazo o la pierna.
   El extremo superior queda fijo y el dibujo se dobla en la articulación.
   Las claves usan el cuadro activo y el historial habitual de LOW.

El corte es opcional: un brazo dibujado como una sola pieza puede doblarse
sin cortarlo por el codo. Para separar un brazo del torso, cortalo por el hombro
y después articulá el brazo completo.

## Alcance actual

Funciona con trazados, figuras geométricas y grupos vectoriales. Las curvas se
muestrean al convertirlas en geometría deformable; el original exacto se recupera
con Deshacer. PNG/JPG, texto, instancias SVG, máscaras y recortes no se convierten
con esta herramienta. Una pieza ya vinculada a un rig se rechaza para preservar
sus huesos y claves. Para grupos con transformaciones superiores, seleccioná
el grupo completo.

La articulación crea dos huesos y una superficie de malla de 12 × 12 puntos.
Los pesos sólo pertenecen a esos dos huesos: otros personajes de la escena no
atraen la pieza. El hueso de superficie conserva la geometría; los otros dos
controlan el movimiento. El estado vive en Scene.rig y se guarda en .lowscene.

## Validación

`node tools/check_flexible_limb_ui.js` verifica tres clics, doblez del SVG visible,
anclaje del hombro, pesos normalizados, un solo Undo/Redo, restauración de la escena,
rodilla sobre rectángulo, cancelación y corte reversible en dos piezas.

También se ejecutó contra una instancia propia de LOW en WebView2, usando un SVG
temporal. El runner admite `ENDPOINT - RUTA_SVG` para esta verificación; recarga
la página de esa instancia y modifica el dibujo de prueba.
