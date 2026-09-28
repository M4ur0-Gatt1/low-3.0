# Handoff: LOW — Editor de código con agente IA

## Overview
LOW es un editor de código con un agente de IA integrado que trabaja con múltiples proveedores (Anthropic, OpenAI, Groq, DeepSeek, NVIDIA NIM, etc.). Este paquete documenta el diseño de la pantalla principal del editor: layout, tema dark/light, panel del agente, y sistema visual completo.

## About the Design Files
Los archivos de este paquete son **referencias de diseño creadas en HTML** — prototipos que muestran la apariencia y comportamiento previstos, NO código de producción para copiar directamente. La tarea es **recrear estos diseños en el entorno del codebase existente** usando sus patrones y librerías establecidos. El proyecto original del usuario ya tiene lógica funcional (chat, comandos, providers); este handoff cubre solo los estilos y estructura visual.

`LOW Editor.dc.html` usa un formato propietario de componentes; ignora el scaffolding (`<x-dc>`, `support.js`, atributos `style-hover`) y lee los estilos inline + el bloque `<style>` de variables CSS, que es la fuente de verdad de los tokens.

## Fidelity
**High-fidelity (hifi)**. Colores, tipografía, espaciado y estados son finales. Recrear pixel-perfect con las librerías del codebase.

## Screens / Views

### Editor principal
- **Purpose**: Escribir código con asistencia del agente (panel derecho).
- **Layout**: columna vertical de 100vh:
  1. **Header** (barra superior): flex horizontal, `padding: 8px 14px`, `gap: 12px`, borde inferior `1px solid var(--line)`, fondo `var(--panel)`.
  2. **Cuerpo** (flex: 1): fila horizontal con 4 zonas:
     - Barra de actividad: `46px` ancho, iconos verticales
     - Árbol de archivos: `200px` ancho
     - Editor: `flex: 1` (tabs + código + terminal)
     - Panel del agente: `360px` ancho (configurable 300–480)
  3. **Footer** (barra de estado): `padding: 5px 14px`, `font-size: 11px`

#### Header
- Logo: cuadrado `26×26px`, `border-radius: 8px`, fondo `--green`, estrella ★ roja `#E5322D` centrada, 13px
- Wordmark "LOW": Figtree 700, 15px, `letter-spacing: -0.2px`
- Separador vertical: `1px × 20px`, `var(--line)`
- Selector de modelo: pill con fondo `--panel2`, borde `--line`, `border-radius: 9px`, `padding: 6px 12px`, punto verde de estado `7px`, texto Figtree 500 12.5px, caret ▾
- Buscador ⌘K: mismo estilo pero fondo transparente, texto `--mut`, `min-width: 220px`, kbd badge `⌘K` en JetBrains Mono 10.5px con fondo `--panel2` y `border-radius: 5px`
- Botones icono (tema ☀/☾, config ⚙): `32×32px`, `border-radius: 9px`, borde `--line`, color `--mut`; hover → color `--txt`, borde `--mut`
- Botón primario "▶ Ejecutar": fondo `--red`, sin borde, `border-radius: 9px`, `padding: 7px 16px`, texto blanco Figtree 600 12.5px; hover → `--redh`

#### Barra de actividad (46px)
Botones `32×32px`, `border-radius: 9px`. Activo: fondo `--panel2`, color `--txt`. Inactivo: transparente, color `--mut`, hover → `--txt`. El icono del agente (★) siempre en `--red`. Gap 6px, padding vertical 10px.

#### Árbol de archivos (200px)
- Encabezado del proyecto: Figtree 600, 10.5px, uppercase, `letter-spacing: 0.08em`, color `--faint`
- Ítems: `padding: 5px 8px`, `border-radius: 7px`, 12.5px, color `--mut`; hover → fondo `--panel2` + color `--txt`; activo: fondo `--panel2`, color `--txt`
- Sangría por nivel: +14px por nivel
- Archivo modificado: punto rojo `6px` alineado a la derecha

#### Editor
- Tabs: tab activa con fondo `--panel2`, borde `--line` (sin borde inferior), `border-radius: 9px 9px 0 0`, `padding: 7px 14px`, 12.5px peso 500 + punto rojo si hay cambios; tabs inactivas solo texto `--mut`
- Código: JetBrains Mono 12.5px, `line-height: 1.75`. Gutter de números: 52px, alineado a la derecha, color `--faint`
- Líneas editadas por el agente: fondo `--greensoft`, `border-left: 2px solid var(--green)`
- Terminal (colapsable): `height: 76px`, borde superior `--line`, fondo `--panel`, JetBrains Mono 11.5px, prompt ➜ en `--green`

#### Panel del agente (360px)
- Header: "Agente" Figtree 600 13px + badge "activo" (JetBrains Mono 10.5px, color `--green`, fondo `--greensoft`, pill `border-radius: 99px`, `padding: 2px 8px`) + iconos historial ⟲ y nueva conversación ＋
- Burbuja del usuario: alineada a la derecha, `max-width: 85%`, fondo `--panel2`, `border-radius: 12px 12px 4px 12px`, `padding: 9px 13px`, 12.5px
- Respuesta del agente: avatar mini-logo `18×18px` (`border-radius: 6px`) + "LOW · nombre-modelo" en 11px `--mut`; texto 12.5px `line-height: 1.55`
- Tarjeta Plan: borde `--line`, `border-radius: 11px`; header con fondo `--panel2`, "Plan 3/3" + barra de progreso (`height: 3px`, pill, relleno `--green`); pasos con ✓ en `--green`, texto 12px `--mut`
- Tarjeta de cambios: borde `--line`, `border-radius: 11px`; fila con ✎ rojo + nombre de archivo (JetBrains Mono 11.5px) + `+3` verde / `−1` rojo + link "Ver diff"; botones Aceptar (fondo `--red`, texto blanco, `border-radius: 8px`, Figtree 600 12px) y Rechazar (transparente, borde `--line`, texto `--mut`)
- Zona de entrada: chips de comandos (`/compare`, `/run`, `/files`) en JetBrains Mono 10.5px, pill con borde `--line`, color `--mut`, hover → `--txt`; caja de texto con fondo `--panel2`, borde `--line`, `border-radius: 12px`, placeholder "Ordena algo a LOW…" en `--faint`; botón enviar → `32×32px`, fondo `--red`, `border-radius: 9px`

#### Barra de estado
11px, color `--mut`: "● 3 APIs conectadas" (punto verde), "⑂ main" | derecha: "TypeScript · UTF-8", "Ln 16, Col 42"

## Interactions & Behavior
- **Toggle de tema**: botón ☀/☾ en el header alterna dark ↔ light. Implementar con variables CSS en `:root`/clase (`body.light`) — todos los componentes las heredan sin re-estilar
- **Hover**: botones outline → borde y texto se aclaran (`--mut` → `--txt`); botón rojo → `--redh`; ítems de árbol/tabs → fondo `--panel2`
- **Aceptar/Rechazar cambios**: la tarjeta del chat aplica o revierte el diff; las líneas verdes resaltadas en el editor pasan a normales al aceptar
- **Terminal**: colapsable
- **Archivo modificado**: punto rojo 6px en tab y árbol
- Transiciones: no se definieron animaciones; recomendado `transition: 120ms ease` en colores de hover

## State Management
- `theme: 'dark' | 'light'` (persistir en config del usuario)
- `activeFile`, `openTabs[]` (con flag `modified`)
- `agentStatus: 'idle' | 'activo'`, `messages[]`, plan con pasos `done/pending`
- `pendingChanges[]` por archivo (`+adds/−dels`), acciones accept/reject
- `terminalVisible: boolean`
- Proveedor/modelo activo + estado de conexión por API

## Design Tokens

### Colores — tema dark (por defecto)
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#0B0B0C` | Fondo del editor |
| `--panel` | `#131315` | Header, sidebars, footer |
| `--panel2` | `#19191C` | Elementos elevados: pills, tabs, burbujas |
| `--line` | `rgba(255,255,255,.08)` | Bordes |
| `--line2` | `rgba(255,255,255,.05)` | Bordes sutiles |
| `--txt` | `#F4F4F2` | Texto principal |
| `--mut` | `#98988F` | Texto secundario |
| `--faint` | `#5C5C57` | Texto terciario (gutter, placeholders) |
| `--red` | `#E5322D` | Rojo revolución: botones primarios, agente |
| `--redh` | `#F0453F` | Hover del rojo |
| `--redsoft` | `rgba(229,50,45,.13)` | Fondos rojos sutiles |
| `--green` | `#4E8C5F` | Verde guerrillero: logo, éxito, conexión |
| `--greensoft` | `rgba(78,140,95,.15)` | Líneas editadas, badges |

### Colores — tema light
| Token | Valor |
|---|---|
| `--bg` | `#F5F4F1` |
| `--panel` | `#FFFFFF` |
| `--panel2` | `#EDECE8` |
| `--line` | `rgba(0,0,0,.09)` |
| `--txt` | `#171716` |
| `--mut` | `#6E6E67` |
| `--faint` | `#A5A59D` |
| `--red` | `#D22823` |
| `--redh` | `#B91F1B` |
| `--green` | `#3E7A4F` |
| `--greensoft` | `rgba(62,122,79,.12)` |

### Sintaxis de código (dark / light)
| Token | Dark | Light |
|---|---|---|
| keyword | `#F07E79` | `#C03530` |
| string | `#93C6A4` | `#2F7A47` |
| comment | `#63635E` | `#9A9A92` |
| function | `#E3C989` | `#9A6F00` |
| number | `#C9A0DC` | `#7B3FA0` |

### Tipografía
- **UI**: Figtree (Google Fonts) — 400, 500, 600, 700. Base 12.5–13px; wordmark 15px/700; labels 10.5–11px
- **Código y elementos técnicos** (kbd, chips de comando, nombres de archivo, badges): JetBrains Mono — 400, 500, 600. Código 12.5px / line-height 1.75

### Radios
- Botones y pills: `9px` · Tarjetas: `11px` · Burbujas e input: `12px` · Logo: `8px` (26px) / `6px` (18px) · Badges pill: `99px` · Tabs: `9px 9px 0 0`

### Espaciado
Escala: 4, 6, 8, 10, 12, 14, 16px. Padding de paneles: 12–14px. Gaps entre mensajes: 12px.

### Sombras
Ninguna — la jerarquía se logra solo con los tres niveles de fondo (`--bg` → `--panel` → `--panel2`) y bordes.

## Assets
- **Logo**: no hay archivo de imagen; en el prototipo es un cuadrado redondeado verde (`--green`) con estrella ★ roja (`#E5322D`). Reemplazar por el isotipo real de la gorra cuando exista.
- Iconos: caracteres unicode como placeholder (▤ ⌕ ⑂ ★ ⚙ ▾ ✎ ⟲ ＋ →). Usar una librería de iconos del codebase (p. ej. Lucide) manteniendo tamaños 13–14px.

## Files
- `Fidel Editor.dc.html` — pantalla principal hi-fi (fuente de verdad de tokens y layout)
- `Fidel Wireframes.dc.html` — wireframes exploratorios (1a–1h: 4 direcciones del editor + bienvenida, config de APIs, paleta ⌘K, vista diff). Solo referencia de estructura para pantallas aún no diseñadas en hi-fi.
