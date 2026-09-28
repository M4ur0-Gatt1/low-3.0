#pragma once

#include "../Core/Core.hpp"
#include "../Math/Math.hpp"

namespace Low::Surface {

/**
 * @brief Resultado de una intersección rayo-superficie.
 */
struct HitResult {
    bool hit = false;
    double distance = 0.0;          // Distancia desde el origen del rayo
    Math::Vec3 point;               // Punto de intersección
    Math::Vec3 normal;              // Normal en el punto de intersección
    Math::Vec2 uv = {0, 0};        // Coordenadas UV (si aplica)
    int priority = 0;               // Prioridad para resolución de conflictos
    void* userData = nullptr;       // Datos adicionales del objeto intersectado
};

/**
 * @brief Interfaz principal para todas las superficies dibujables.
 * 
 * Este es el corazón del Surface Engine. Cada tipo de superficie
 * (plano, malla, esfera, loft, etc.) implementa esta interfaz.
 * 
 * El lápiz NUNCA calcula profundidad directamente. Siempre pregunta:
 * "¿Dónde intersecto esta superficie?"
 */
class ISurface {
public:
    virtual ~ISurface() = default;

    /**
     * @brief Intersecta un rayo con la superficie.
     * @param ray Rayo desde la cámara/mouse.
     * @return HitResult con información de intersección o hit=false.
     */
    virtual HitResult intersect(const Math::Ray& ray) const = 0;

    /**
     * @brief Obtiene la normal en un punto dado de la superficie.
     * @param point Punto sobre la superficie.
     * @return Vector normal normalizado.
     */
    virtual Math::Vec3 normal(const Math::Vec3& point) const = 0;

    /**
     * @brief Obtiene coordenadas UV en un punto dado.
     * @param point Punto sobre la superficie.
     * @return Coordenadas UV (puede ser {0,0} si no aplica).
     */
    virtual Math::Vec2 uv(const Math::Vec3& point) const {
        return Math::Vec2(0, 0);
    }

    /**
     * @brief Caja delimitadora de la superficie.
     * Usada para culling y optimización.
     */
    virtual Math::AABB bounds() const = 0;

    /**
     * @brief Prioridad de esta superficie para captura del lápiz.
     * Valores más altos = mayor prioridad.
     * 
     * Escala sugerida:
     * - Vertex: 100
     * - Edge/Curve: 95
     * - Guide: 90
     * - Mesh: 80
     * - Image: 75
     * - Plane: 70
     * - Fixed Depth: 10
     */
    virtual int getPriority() const = 0;

    /**
     * @brief Nombre identificatorio de la superficie.
     */
    virtual std::string getName() const = 0;

    /**
     * @brief Verifica si la superficie está activa para dibujo.
     */
    virtual bool isActive() const = 0;
};

} // namespace Low::Surface
