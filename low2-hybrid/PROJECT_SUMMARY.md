# LOW 3D — estado real

LOW 3D es el módulo autónomo de LOW para dibujar y construir escenarios,
referencias, fondos y entornos tridimensionales de forma directa.

## Autoría

Software creado por **Mauro Gatti y Tropa Circa**.

## Implementación activa

- Electron, React y TypeScript.
- Three.js como motor de escena y render en tiempo real.
- Motor principal: `modules/design/engine/webgl-design3d.ts`.
- Estado compartido: `store/low-store.ts`.
- Build del renderer mediante Vite.

El puente C++/Node-API permanece como trabajo experimental y no es el motor del
ejecutable actual. Las descripciones históricas de motores nativos completos no
deben interpretarse como funciones disponibles.

## Funciones disponibles

- Trazos 3D editables con presión y estabilización.
- Guías y superficies contextuales.
- Plano, cilindro, esfera y toro editables.
- Simetría combinable X/Y/Z.
- Capas, selección, edición de puntos, licuar, tijera y borrador.
- Vistas perspectiva y ortográficas.
- Joystick de orientación.
- Guardado inicial de proyectos `.low3d`.
- Salida del módulo con Escape sin cerrar LOW.

## Trabajo pendiente

- Persistencia completa de guías personalizadas.
- Importación y exportación GLB/GLTF/OBJ.
- Materiales, luces y sombras editables.
- Cámaras guardadas y render por pases.
- Pruebas automatizadas del motor geométrico.
- Puente estable con los restantes módulos de LOW.
