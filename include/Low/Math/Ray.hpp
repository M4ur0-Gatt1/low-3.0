#pragma once

#include "Vec3.hpp"

namespace Low::Math {

/**
 * @brief Rayo para intersecciones 3D (mouse picking, surface testing).
 * Representado por origen y dirección normalizada.
 */
class Ray {
public:
    Vec3 origin;
    Vec3 direction;

    constexpr Ray() : origin(Vec3::Zero()), direction(Vec3::UnitZ()) {}
    
    constexpr Ray(const Vec3& origin, const Vec3& direction) 
        : origin(origin), direction(direction.normalized()) {}

    /**
     * @brief Obtiene un punto a lo largo del rayo.
     * @param t Distancia desde el origen (puede ser negativa).
     */
    constexpr Vec3 pointAt(double t) const {
        return origin + direction * t;
    }

    /**
     * @brief Intersección con un plano definido por punto y normal.
     * @param planePoint Punto en el plano.
     * @param planeNormal Normal del plano (debe estar normalizada).
     * @return Distancia t si hay intersección, -1 si es paralelo.
     */
    double intersectPlane(const Vec3& planePoint, const Vec3& planeNormal) const {
        double denom = direction.dot(planeNormal);
        
        // Rayo paralelo al plano
        if (std::abs(denom) < 1e-8) {
            return -1.0;
        }

        Vec3 p0ToOrigin = origin - planePoint;
        double t = -p0ToOrigin.dot(planeNormal) / denom;
        
        // Intersección detrás del rayo
        if (t < 0) {
            return -1.0;
        }

        return t;
    }

    /**
     * @brief Intersección con esfera.
     * @param center Centro de la esfera.
     * @param radius Radio de la esfera.
     * @return Distancia t más cercana si hay intersección, -1 si no hay.
     */
    double intersectSphere(const Vec3& center, double radius) const {
        Vec3 oc = origin - center;
        double b = oc.dot(direction);
        double c = oc.dot(oc) - radius * radius;
        
        double discriminant = b * b - c;
        
        if (discriminant < 0) {
            return -1.0; // Sin intersección
        }

        double t = -b - std::sqrt(discriminant);
        if (t < 0) {
            t = -b + std::sqrt(discriminant);
            if (t < 0) return -1.0;
        }

        return t;
    }
};

} // namespace Low::Math
