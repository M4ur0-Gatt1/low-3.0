# LOW v4.15.0 — Ahora se mide, y el ejecutable se prueba

Dos de los seis faltantes del balance, cerrados. Ninguno agrega funciones: los
dos sacan a LOW de opinar sobre sí mismo.

## 1. Rendimiento: seis presupuestos escritos, cero mediciones (§10)

La biblia decía «no se optimiza por intuición». Tampoco se verificaba: los seis
presupuestos de §10 estaban escritos desde el principio y **nunca se había
medido ninguno**.

Ahora los mide `tools/check_perf_budgets.js`, en la puerta de CI. De paso quedó
**definida la escena patrón** que §10 nombraba sin definir: 3 capas × 24 cuadros,
30 trazos de 40 puntos por dibujo, ≈914 KB.

Lo medido en esta máquina, tres corridas:

| | medido | presupuesto |
|---|---|---|
| Trazo: trabajo hasta que existe en la hoja | **2,5 – 4,2 ms** | 16 ms |
| Cuadro más largo arrastrando | **18,0 – 18,6 ms** | 33 ms (piso 30 FPS) |
| Guardado: bloqueo máximo del hilo | **17,3 – 21,4 ms** | 250 ms |
| Apertura de la escena patrón | **18,0 – 18,4 ms** | 400 ms |
| Reproducción a 24 fps: cuadros perdidos | **11 – 17 %** | sin saltos |

**Los cuatro presupuestos de tiempo pasan sin usar el margen.** Y el dato que
más tranquiliza es de la otra clase: un trazo de 60 puntos deja **−1** nodos en
la hoja y uno de 180 deja **1**. Un trazo se colapsa en una sola cinta sin
importar su largo — es lo que evita que el archivo engorde por trazo y que
después de una jornada el proyecto sea inmanejable.

### Dos clases de presupuesto, porque no se exigen igual

**Tiempos**: se miden, se imprimen siempre, y la puerta usa un margen ×4. Un
runner de CI cargado tarda tres o cuatro veces más que una máquina de trabajo, y
un umbral ajustado daría fallas falsas todos los días; una regresión real
—quintuplicar la latencia— igual la agarra.

**Trabajo**: serializaciones por punto de trazo, nodos que deja un gesto. Eso no
depende de la máquina, así que la puerta es estricta y sin margen. Es la clase
que descubre las regresiones antes de que se sientan.

### Y encontró tres defectos de mi propio arnés

Los tres lo habrían dejado decorativo, y por eso se verificó contra un freno
artificial antes de darlo por bueno:

1. **El medidor de bloqueos descartaba justo la muestra que importaba.** Con un
   freno de 1600 ms devolvía 18 ms. Corregido, informa 3211 ms y falla.
2. **Los cuadros perdidos se calculaban restando números de cuadro.** Con el
   bucle encendido la escena vuelve al 1, así que 36 avances se leían como 11 y
   estuve a un paso de firmar que la reproducción estaba rota.
3. **La escena patrón salía 24 veces más chica** de lo que decía medir:
   `expose(id, 24, 1)` expone el MISMO dibujo 24 veces — es un sostenido, no 24
   dibujos.

La línea base queda escrita en `docs/LOW_PERF_BASELINE.md`, con lo que **todavía
no se mide**: progreso y cancelación al abrir, memoria, escenas de decenas de
megas, y que nada de esto corre en el motor real de pywebview sino en Chromium.

## 2. Humo sobre el ejecutable empaquetado, en los tres sistemas (§9·4)

Se publicaban cuatro artefactos por release y **sólo el de Windows lo arrancaba
alguien**. Los de macOS y Linux eran binarios que compilaban; que funcionaran no
lo sabía nadie.

Ahora el binario se autochequea. `LOW --smoke` no abre ventana: comprueba lo que
hace falta para abrirla.

- que estén los **70 archivos** que pide `index.html` dentro del bundle;
- que el sello de versión del HTML coincida con `LOW_VERSION`;
- que el puente `Api` se construya;
- que importen `webview`, `PIL` y `numpy`;
- que se puedan escribir archivos temporales.

Corre en los tres sistemas dentro de CI, sobre el binario recién compilado y
antes de subirlo. Verificado escondiendo un módulo: nombra el archivo exacto y
devuelve 1.

Eso es lo que rompe un empaquetado — un archivo de datos que no entró, una ruta
que funciona desde el repo y no desde el `.exe` — y es justo lo que las pruebas
del repositorio no pueden ver.

### Y de paso, §9·1

El autochequeo encontró que `main.py` decía `LOW_VERSION = "4.11.0"` con
`VERSION` en 4.14.0. El binario publicado estaba bien —CI lo sella desde el tag
al compilar— pero **la fuente mentía**, y es donde uno mira cuando algo no cuadra.
Ahora `tools/stamp_version.py` sella `LOW_VERSION` junto con el HTML, así que no
pueden separarse otra vez.

## Balance actualizado

Con esto, del balance de septiembre:

- **Rendimiento** sale de 4: hay medición automatizada con presupuestos y línea
  base. Sube a **6** — falta memoria, escenas grandes y el motor real.
- **Distribución** sale de 5: los tres binarios se prueban antes de publicarse.
  Sube a **7** — falta instalar y desinstalar de verdad en cada sistema.

Siguen faltando: la prueba maestra de §15 (nunca corrida), partir `app.js`
(18.564 líneas), MOCAP-05 y los P1 de pincel e inicio seguro.

## Pruebas

Batería completa antes de publicar: 11 suites de modelo (600 casos), 4
comprobaciones Python, **16 recorridos E2E**, el arnés de presupuestos y el humo
del empaquetado. Todo en la puerta de CI.

De paso se subió el tiempo de espera de CDP de 40 a 120 s en los tres recorridos
más largos: en ráfaga se pasaban de 40 s con la máquina cargada y fallaban por
lentitud, no por regresión — el mismo error que confundir un runner flojo con un
defecto del producto.

## Reversión

Estable previa: `v4.14.0`. Nada de esta versión toca el producto: son
mediciones, comprobaciones y el sellado de la versión.

---

## Nota de v4.15.1

La puerta de v4.15.0 falló en `check_document_recovery_tabs_ui.js` —un recorrido
de multi-documento que ya estaba en el árbol— con «la escena A perdió o mezcló
su LowDoc». **No reproduje la falla**: pasa limpio en la máquina de trabajo, con
la CPU estrangulada a 1/6, y corriendo en secuencia detrás del recorrido de
pestañas, que es el orden de CI.

Lo que se hizo es endurecimiento, no un arreglo de la causa, y corresponde
decirlo así: leía el lienzo en el mismo tirón sincrónico en que activaba la
pestaña —ahora espera por condición, con tope—, no limpiaba `localStorage` como
sí hacen los demás recorridos, y ahora informa cuántas pestañas había, cuál
estaba activa y si el lienzo llegó a sincronizar. Si vuelve a fallar, el log va a
decir por qué.

También se sacó del repositorio un perfil de Chromium de las pruebas que un
`git add -A` mío metió en el commit de v4.15.0 —133 archivos, incluido un
volcado de fallo— y quedó en `.gitignore`. Se verificó antes de alarmar: las
bases de Cookies, Login Data e History estaban **vacías**, sólo con su tabla de
metadatos. Los archivos siguen alcanzables en el commit `c1144dc`; purgarlos de
la historia exige reescribirla y esa decisión no es mía.
