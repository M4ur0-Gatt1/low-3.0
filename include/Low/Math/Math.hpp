#pragma once

// Math module public API
#include "Vec3.hpp"
#include "Mat4.hpp"
#include "Ray.hpp"
#include "AABB.hpp"

namespace Low::Math {

/**
 * @brief Convierte grados a radianes.
 */
constexpr double toRadians(double degrees) {
    return degrees * 0.017453292519943295; // PI / 180
}

/**
 * @brief Convierte radianes a grados.
 */
constexpr double toDegrees(double radians) {
    return radians * 57.29577951308232; // 180 / PI
}

/**
 * @brief Clampa un valor entre min y max.
 */
template<typename T>
constexpr T clamp(T value, T min, T max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/**
 * @brief Interpolación lineal suave (smoothstep).
 */
constexpr double smoothstep(double edge0, double edge1, double x) {
    double t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

} // namespace Low::Math
