# LOW 3.23.0 — Elegís dónde se guarda lo que exportás

Pedido de Mauro: «cuando exporto los archivos quiero poder elegir dónde los guardo; ahora se arma una carpeta por defecto y no la puedo cambiar».

## Cómo se usa

Exportar animación (botón de la línea de tiempo o menú Animación) → elegís el formato y se abre el diálogo del sistema, como en Photoshop o Harmony:

- **MP4, WebM, GIF y spritesheet** son un archivo: diálogo de **Guardar**, con el nombre del documento ya puesto y la extensión correcta (si la borrás, LOW la agrega).
- **Secuencia PNG y XML para Premiere** son muchos archivos: se elige la **carpeta**, y los archivos van directo ahí (el XML junto a sus cuadros y su audio, para que Premiere no pida relinkear).
- El diálogo abre en **la última carpeta que usaste**; la primera vez, en la del documento.
- **Cancelar** no exporta nada y lo avisa.
- Se pregunta **antes** de rasterizar: no hay que esperar el render para elegir.

De yapa: un documento que todavía no se guardó ahora puede exportarse (antes pedía guardar primero, porque no había dónde escribir).

Si el diálogo no puede abrirse, la exportación no se rompe: va a `export/` al lado del documento, como antes.

## Pruebas

- **`check_export_destino_backend.py`** (nueva, 24 comprobaciones): qué diálogo abre cada formato, nombre y extensión sugeridos, que recuerde la carpeta, cancelar, documento sin guardar, y que la secuencia, el spritesheet y Premiere se escriban en el lugar elegido sin crear `export/`. Sin elección, sigue yendo a `export/`. Falla con el puente anterior.
- **`check_export_destino_ui.js`** (nueva): con clics de verdad en el editor, el modal ya no promete «carpeta export/», MP4 pregunta antes de exportar y el puente recibe el archivo elegido, cancelar no exporta, PNG y Premiere reciben la carpeta, y un puente que no sabe preguntar exporta igual. Falla sin el cambio.
- Siguen pasando las pruebas de exportación existentes (animación, documento nuevo, Premiere, sin ffmpeg) y el contrato 2D.
