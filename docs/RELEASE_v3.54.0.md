
# LOW 3.54.0 · El Taller como una sala de dibujo de academia

Pedido de Mauro: «mejorar los modelos humanoides para que sean más anatómicos, estilo arte clásico, anatomía humana para artistas, algo más profesional», y «que trabajes también con las herramientas para mejorar los cuerpos».

## Estudio de anatomía (Taller de personaje)

Una sección nueva en el panel, con lo que tiene una sala de dibujo del natural (`engine/academia3d.ts`):

- **Yeso**: el cuerpo como un vaciado de academia, blanco mate, para estudiar luz y forma. Al apagarlo vuelve exactamente el material de fábrica.
- **Luces de academia**: Rembrandt, Lateral, Contraluz, Ventana y Cenital. Reemplazan a las del estudio mientras están puestas, y «Estudio» las devuelve.
- **Canon en cabezas**: una regla al costado del cuerpo con la medida («8 cabezas»), las divisiones y las referencias clásicas: mentón, pezones, ombligo, pubis, medio muslo, bajo la rodilla, media pierna y planta. La cabeza se mide a lo largo de su propio eje, así que da lo mismo de pie, girada o inclinada.
- **Esqueleto**: los huesos del armazón a la vista. Al prenderlo, el cuerpo pasa a transparente.
- **Planos de la cabeza**: la construcción de Loomis, pegada a la cabeza y siguiendo la pose. Incluye la esfera del cráneo, los cortes laterales, la línea media por el perfil real y las líneas del pelo, las cejas, los ojos, la nariz y el mentón.
- **Mapa de músculos**: 18 grupos en color, como una lámina, con su leyenda. El reparto es por zonas: dice dónde está cada grupo, no es un écorché disecado.
- **Poses clásicas**: Posición anatómica (palmas adelante), Contrapposto, Apoyo con la mano en la cadera, Torsión (alcanzar) y Brazos arriba. Están escritas con las mismas herramientas de Posar y ajustadas mirándolas de frente y de perfil.

## Cuerpos clásicos, hechos con las herramientas del Taller

Medidos con la regla, los cuerpos de fábrica (Quaternius) **miden 10,8 cabezas**: una cabeza chica, de cómic de superhéroes, y un físico de culturista. Tres botones los llevan a un canon con el dial «Cabeza» y la contextura, en un solo paso de Ctrl+Z:

- **Heroico · 8 cabezas**: el canon de Lisipo y de la academia para la figura ideal.
- **Académico · 7½**: el promedio del dibujo del natural, con musculatura moderada.
- **Policleto · 7**: el canon del Doríforo, sólido y compacto.

Con el canon heroico, las referencias caen donde corresponde: los pezones en la 2, el ombligo en la 3, el pubis en la 4 y la rodilla en la 6.

## Pruebas

- `tools/check_3d_academia_ui.js` (nueva, en el build), con los controles del panel:
  - el yeso entra y sale sin dejar rastro;
  - la luz Rembrandt reemplaza a las del estudio y «Estudio» las devuelve;
  - el canon mide 10,8 cabezas el cuerpo de fábrica, y «Heroico» lo deja en 8,0 en un solo Ctrl+Z;
  - el esqueleto aparece;
  - los planos de la cabeza siguen a la cabeza al girar y posar (se corren 7 mm);
  - el mapa colorea 18 grupos;
  - en «mano en la cadera» la mano queda en la cadera, y en «brazos arriba» las manos quedan sobre la cabeza.
- Las 22 pruebas del Estudio 3D, en verde.
