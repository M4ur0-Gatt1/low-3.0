# LOW 3.24.1 — Guardar con otro nombre no pierde el ícono de LOW

Pedido de Mauro: «cuando le cambio los nombres a los archivos pierden el ícono de LOW».

## Qué pasaba

**Guardar escena como…** abría el diálogo de Guardar sin filtro de tipo. Si se escribía el nombre nuevo sin «.low» —«caminata v2»—, el archivo quedaba **sin extensión**. Windows asocia el ícono y el doble clic por la extensión, así que para el sistema dejaba de ser una escena de LOW. Lo mismo pasaba con un punto en el nombre («caminata.final»).

## Qué cambió

- El diálogo filtra por **Escena de LOW (*.low)**, y por *.low3d en el estudio 3D.
- LOW **agrega la extensión** si falta: «caminata v2» → «caminata v2.low», «caminata.final» → «caminata.final.low». Si ya la trae, no la duplica.
- Para archivos de código, y para el STL del estudio 3D, se agrega sólo si el nombre no trae ninguna; una extensión elegida a propósito se respeta.

**Los archivos que ya quedaron sin extensión** se arreglan renombrándolos en el Explorador y agregando «.low» al final. También se abren con **Animación → Abrir escena…**, y desde ahí **Guardar escena como…** ya les pone la extensión.

## Pruebas

- **`check_guardar_extension_backend.py`** (nueva, 12 comprobaciones). Con el código anterior fallan 6: el archivo quedaba como «caminata v2».
