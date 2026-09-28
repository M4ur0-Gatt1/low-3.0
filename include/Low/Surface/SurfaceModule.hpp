#pragma once

// Surface module public API
#include "ISurface.hpp"
#include "PlaneSurface.hpp"
#include "SphereSurface.hpp"
#include "SurfaceEngine.hpp"

namespace Low::Surface {

/**
 * @brief Módulo Surface: Sistema de contexto para dibujo 3D.
 * 
 * Filosofía clave:
 * - El lápiz NUNCA calcula profundidad (Z) directamente
 * - Siempre dibuja SOBRE una superficie (plano, esfera, malla, etc.)
 * - Cada superficie define SU PROPIA intersección con el rayo del mouse
 * - El SurfaceEngine resuelve conflictos mediante prioridades
 * 
 * Esto elimina el problema del "slider Z" y hace que el dibujo 3D
 * sea tan intuitivo como el 2D.
 */

} // namespace Low::Surface
