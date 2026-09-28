#pragma once

#include "Vec3.hpp"
#include <algorithm>
#include <limits>

namespace Low::Math {

/**
 * @brief Caja delimitadora alineada a los ejes (AABB).
 * Usada para culling, selección y optimización de intersecciones.
 */
class AABB {
public:
    Vec3 min;
    Vec3 max;

    constexpr AABB() 
        : min(Vec3(std::numeric_limits<double>::max(), std::numeric_limits<double>::max(), std::numeric_limits<double>::max())),
          max(Vec3(std::numeric_limits<double>::lowest(), std::numeric_limits<double>::lowest(), std::numeric_limits<double>::lowest())) {}

    constexpr AABB(const Vec3& min, const Vec3& max) : min(min), max(max) {}

    /**
     * @brief Crea un AABB desde un solo punto.
     */
    static AABB fromPoint(const Vec3& point) {
        return AABB(point, point);
    }

    /**
     * @brief Expande la caja para incluir un punto.
     */
    void extend(const Vec3& point) {
        min.x = std::min(min.x, point.x);
        min.y = std::min(min.y, point.y);
        min.z = std::min(min.z, point.z);
        max.x = std::max(max.x, point.x);
        max.y = std::max(max.y, point.y);
        max.z = std::max(max.z, point.z);
    }

    /**
     * @brief Expande la caja para incluir otra caja.
     */
    void extend(const AABB& other) {
        extend(other.min);
        extend(other.max);
    }

    /**
     * @brief Verifica si la caja es válida (min < max).
     */
    bool isValid() const {
        return min.x <= max.x && min.y <= max.y && min.z <= max.z;
    }

    /**
     * @brief Centro de la caja.
     */
    Vec3 center() const {
        return (min + max) * 0.5;
    }

    /**
     * @brief Tamaño de la caja.
     */
    Vec3 size() const {
        return max - min;
    }

    /**
     * @brief Verifica si un punto está dentro de la caja.
     */
    bool contains(const Vec3& point) const {
        return point.x >= min.x && point.x <= max.x &&
               point.y >= min.y && point.y <= max.y &&
               point.z >= min.z && point.z <= max.z;
    }

    /**
     * @brief Verifica si esta caja intersecta con otra.
     */
    bool intersects(const AABB& other) const {
        return min.x <= other.max.x && max.x >= other.min.x &&
               min.y <= other.max.y && max.y >= other.min.y &&
               min.z <= other.max.z && max.z >= other.min.z;
    }

    /**
     * @brief Intersección de un rayo con la caja (slab method).
     * @return true si el rayo intersecta la caja.
     */
    bool intersectRay(const Ray& ray) const {
        Vec3 invDir = Vec3(1.0 / ray.direction.x, 1.0 / ray.direction.y, 1.0 / ray.direction.z);
        
        double t1 = (min.x - ray.origin.x) * invDir.x;
        double t2 = (max.x - ray.origin.x) * invDir.x;
        double t3 = (min.y - ray.origin.y) * invDir.y;
        double t4 = (max.y - ray.origin.y) * invDir.y;
        double t5 = (min.z - ray.origin.z) * invDir.z;
        double t6 = (max.z - ray.origin.z) * invDir.z;

        double tmin = std::max({std::min(t1, t2), std::min(t3, t4), std::min(t5, t6)});
        double tmax = std::min({std::max(t1, t2), std::max(t3, t4), std::max(t5, t6)});

        // Si tmax < 0, la caja está detrás del rayo
        // Si tmin > tmax, no hay intersección
        return tmax >= std::max(0.0, tmin);
    }

    // Caja vacía (inválida)
    static constexpr AABB Empty() {
        return AABB();
    }
};

} // namespace Low::Math
