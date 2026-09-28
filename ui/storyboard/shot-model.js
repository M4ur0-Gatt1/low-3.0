/* ══════════════════════════════════════════════════════════════════════════
   STORYBOARD — generador de tomas y cámaras

   Un storyboard se piensa en tipos de toma, no en coordenadas: el artista
   decide «plano medio, contrapicado» y la cámara tiene que ubicarse sola. Este
   módulo hace las dos direcciones y garantiza que coincidan: lo que el
   generador arma, el clasificador lo reconoce.

   La óptica se toma prestada del modelo multiplano (`composition.multiplane`)
   para no tener dos cámaras distintas en el mismo programa.

   Convenciones, para que nadie las adivine:
   - `y` crece HACIA ABAJO, como en el lienzo SVG.
   - `subject.y` es la coronilla; el cuerpo baja `height` desde ahí.
   - la cámara mira en +Z: se para en `z` negativo y el sujeto vive en z ≈ 0.
   - `rotationX` positivo es picado (mira hacia abajo).

   @module storyboard/shot-model
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const storyboard = LOW.storyboard = LOW.storyboard || {};

  const DEFAULT_ASPECT = 16 / 9;
  const DEFAULT_SUBJECT = Object.freeze({ x: 0, y: 0, z: 0, height: 170 });
  const DEFAULT_LENS = Object.freeze({ focalLength: 50, sensorWidth: 36 });

  /* `coverage` = cuánto del alto del cuadro ocupa la figura. 1 es la figura
     justa de borde a borde; más de 1 significa que la toma la recorta, que es
     exactamente lo que distingue un plano medio de un plano entero. Los
     valores son el centro de cada tipo: los límites se derivan de ellos, así
     que clasificar y generar NO pueden desincronizarse. */
  const SHOT_TYPES = Object.freeze([
    { id: "gran-plano-general", name: "Gran plano general", coverage: 0.15, framing: "la figura dentro del entorno" },
    { id: "plano-general", name: "Plano general", coverage: 0.5, framing: "figura entera con aire" },
    { id: "plano-entero", name: "Plano entero", coverage: 0.9, framing: "de la cabeza a los pies" },
    { id: "plano-americano", name: "Plano americano", coverage: 1.28, framing: "desde las rodillas" },
    { id: "plano-medio", name: "Plano medio", coverage: 2.0, framing: "desde la cintura" },
    { id: "primer-plano", name: "Primer plano", coverage: 3.6, framing: "hombros y cabeza" },
    { id: "primerisimo-primer-plano", name: "Primerísimo primer plano", coverage: 7.0, framing: "la cara" },
  ]);

  const ANGLES = Object.freeze([
    { id: "nivel", name: "A nivel", pitch: 0 },
    { id: "picado", name: "Picado", pitch: 15 },
    { id: "contrapicado", name: "Contrapicado", pitch: -15 },
  ]);

  // Frontera entre dos tipos: la media GEOMÉTRICA de sus coberturas. La escala
  // de planos es multiplicativa (cada uno acerca por un factor), así que el
  // punto medio aritmético caería siempre corrido hacia el plano más cerrado.
  const BOUNDARIES = SHOT_TYPES.slice(0, -1).map((type, i) =>
    Math.sqrt(type.coverage * SHOT_TYPES[i + 1].coverage));

  const HEADROOM = 0.06;      // aire sobre la cabeza cuando la toma recorta
  const SKY_SHARE = 0.25;     // del sobrante, cuánto va arriba en un plano abierto

  const num = (value, fallback = 0) => Number.isFinite(+value) ? +value : fallback;
  const lensOf = (camera) => {
    const multiplane = LOW.composition && LOW.composition.multiplane;
    const base = { ...DEFAULT_LENS, ...(camera || {}) };
    return multiplane ? multiplane.cameraProjection(base) : base;
  };
  const subjectOf = (subject) => {
    const value = { ...DEFAULT_SUBJECT, ...(subject || {}) };
    // Una figura sin altura haría una división por cero y devolvería infinitos:
    // se cae a la altura por defecto en vez de propagar NaN a la interfaz.
    const height = num(value.height, 0);
    return { ...value, x: num(value.x), y: num(value.y), z: num(value.z),
      height: height > 0 ? height : DEFAULT_SUBJECT.height };
  };
  const typeById = (id) => SHOT_TYPES.find((type) => type.id === id) || null;

  /** Campo de visión VERTICAL en grados: es el que decide el encuadre de una
      figura de pie, no el horizontal que suele publicarse. */
  function verticalFov(camera, aspect = DEFAULT_ASPECT) {
    const lens = lensOf(camera);
    const ratio = num(aspect, DEFAULT_ASPECT) || DEFAULT_ASPECT;
    const sensorHeight = lens.sensorWidth / ratio;
    return 2 * Math.atan(sensorHeight / (2 * lens.focalLength)) * 180 / Math.PI;
  }

  /** Alto del mundo que entra en el cuadro a esa distancia. */
  function frameHeightAt(camera, distance, aspect = DEFAULT_ASPECT) {
    const fov = verticalFov(camera, aspect) * Math.PI / 180;
    return 2 * Math.max(0, num(distance)) * Math.tan(fov / 2);
  }

  /** Distancia REAL a lo largo del eje de visión. Con la cámara inclinada, la
      separación en Z es sólo el cateto: usarla como distancia haría que un
      contrapicado pareciera un plano más cerrado de lo que es. */
  function distanceTo(camera, subject) {
    const cam = { ...DEFAULT_LENS, z: -1000, ...(camera || {}) };
    const horizontal = Math.max(1e-6, subjectOf(subject).z - num(cam.z, -1000));
    const pitch = Math.abs(num(cam.rotationX)) * Math.PI / 180;
    return horizontal / Math.max(0.15, Math.cos(pitch));   // tope: nada de dividir por ~0
  }

  /** Cuánto del alto del cuadro ocupa la figura. Es la única medida que
      distingue un tipo de toma de otro. */
  function coverage(camera, subject, aspect = DEFAULT_ASPECT) {
    const person = subjectOf(subject);
    const height = frameHeightAt(camera, distanceTo(camera, person), aspect);
    return height > 0 ? person.height / height : 0;
  }

  /** Qué toma es esto. Devuelve siempre un tipo real: la interfaz nunca tiene
      que lidiar con un nulo. */
  function classify(camera, subject, aspect = DEFAULT_ASPECT) {
    const value = coverage(camera, subject, aspect);
    let index = BOUNDARIES.findIndex((limit) => value < limit);
    if (index < 0) index = SHOT_TYPES.length - 1;
    return { ...SHOT_TYPES[index], coverage: value };
  }

  /** Qué franja del cuerpo entra en el cuadro, en las mismas unidades que la
      figura: `top` y `bottom` medidos desde los pies. Es lo que ata el nombre
      del plano a la geometría — un «plano medio» tiene que cortar de verdad a
      la altura de la cintura, si no el vocabulario es decorativo. */
  /** Altura a la que MIRA la cámara. Con inclinación no coincide con la altura
      a la que está parada, y el cuadro se centra en lo que mira, no en ella. */
  function aimY(camera, subject) {
    const cam = { z: -1000, ...(camera || {}) };
    const horizontal = Math.max(1e-6, subjectOf(subject).z - num(cam.z, -1000));
    const pitch = num(cam.rotationX) * Math.PI / 180;
    return num(cam.y) + Math.tan(pitch) * horizontal;   // eje hacia abajo: picado mira abajo
  }

  function frameBand(camera, subject, aspect = DEFAULT_ASPECT) {
    const person = subjectOf(subject);
    const height = frameHeightAt(camera, distanceTo(camera, person), aspect);
    const frameTopModel = aimY(camera, person) - height / 2;   // eje hacia abajo
    // Se pasa al eje del cuerpo: 0 en los pies, `height` en la coronilla.
    const top = person.height - (frameTopModel - person.y);
    return { top, bottom: top - height, height };
  }

  /** Aire entre el borde superior del cuadro y la coronilla. Negativo sería
      cortarle la cabeza al personaje. */
  function headroomOf(camera, subject, aspect = DEFAULT_ASPECT) {
    const person = subjectOf(subject);
    const height = frameHeightAt(camera, distanceTo(camera, person), aspect);
    const frameTop = aimY(camera, person) - height / 2;
    return person.y - frameTop;
  }

  /** EL GENERADOR: se pide una toma y la cámara se ubica sola.
      Calcula distancia por la cobertura del tipo, altura por lo que se
      encuadra —la cabeza manda: nunca queda pegada al borde— y la inclinación
      por el ángulo. Conserva el lente que se le pase: cambiar de tipo de toma
      no debe cambiarle el lente al director. */
  function frameShot(shotTypeId, subject, camera, options = {}) {
    const type = typeById(shotTypeId) || typeById("plano-medio");
    const person = subjectOf(subject);
    const aspect = num(options.aspect, DEFAULT_ASPECT) || DEFAULT_ASPECT;
    const lens = lensOf(camera);
    const fov = verticalFov(lens, aspect) * Math.PI / 180;

    const frameHeight = person.height / type.coverage;
    const distance = frameHeight / (2 * Math.tan(fov / 2));

    // Dónde queda el borde de arriba. Si la toma recorta, se ancla en la
    // cabeza con aire; si sobra cuadro, el sobrante se reparte dejando más
    // suelo que cielo, que es como se ve una figura parada en el mundo.
    const slack = frameHeight - person.height;
    const frameTop = slack > 0
      ? person.y - slack * SKY_SHARE
      : person.y - frameHeight * HEADROOM;

    // El ángulo NO reencuadra: la cámara gira alrededor del centro de lo que se
    // encuadra, manteniendo la distancia. Un contrapicado cambia desde dónde se
    // mira al personaje, no si el personaje entra. (Antes la cámara sólo subía
    // o bajaba y el encuadre se le escapaba: el E2E lo agarró proyectando la
    // coronilla y viéndola salirse del cuadro.)
    const angle = ANGLES.find((a) => a.id === options.angle) || ANGLES[0];
    const pitch = angle.pitch * Math.PI / 180;
    const targetY = frameTop + frameHeight / 2;

    return { ...lens,
      x: person.x,
      y: targetY - distance * Math.sin(pitch),        // eje hacia abajo: picado sube
      z: person.z - distance * Math.cos(pitch),
      rotationX: angle.pitch, rotationY: 0, rotationZ: 0,
      shotType: type.id, angle: angle.id };
  }

  storyboard.shots = Object.freeze({ SHOT_TYPES, ANGLES, DEFAULT_SUBJECT, DEFAULT_ASPECT,
    verticalFov, frameHeightAt, coverage, classify, headroomOf, frameBand, aimY, frameShot });
})(typeof window !== "undefined" ? window : globalThis);
