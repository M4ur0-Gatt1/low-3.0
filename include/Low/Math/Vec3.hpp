#pragma once

#include <cmath>
#include <algorithm>
#include <array>
#include <stdexcept>

namespace Low::Math {

/**
 * @brief Vector3 de precisión doble para cálculos geométricos.
 * Optimizado para operaciones SIMD futuras.
 */
class Vec3 {
public:
    double x, y, z;

    constexpr Vec3() : x(0.0), y(0.0), z(0.0) {}
    constexpr Vec3(double x, double y, double z) : x(x), y(y), z(z) {}

    // Operadores básicos
    constexpr Vec3 operator+(const Vec3& other) const {
        return Vec3(x + other.x, y + other.y, z + other.z);
    }

    constexpr Vec3 operator-(const Vec3& other) const {
        return Vec3(x - other.x, y - other.y, z - other.z);
    }

    constexpr Vec3 operator*(double scalar) const {
        return Vec3(x * scalar, y * scalar, z * scalar);
    }

    constexpr Vec3 operator/(double scalar) const {
        if (scalar == 0.0) throw std::runtime_error("División por cero en Vec3");
        return Vec3(x / scalar, y / scalar, z / scalar);
    }

    Vec3& operator+=(const Vec3& other) {
        x += other.x; y += other.y; z += other.z;
        return *this;
    }

    Vec3& operator-=(const Vec3& other) {
        x -= other.x; y -= other.y; z -= other.z;
        return *this;
    }

    // Producto punto
    constexpr double dot(const Vec3& other) const {
        return x * other.x + y * other.y + z * other.z;
    }

    // Producto cruz
    constexpr Vec3 cross(const Vec3& other) const {
        return Vec3(
            y * other.z - z * other.y,
            z * other.x - x * other.z,
            x * other.y - y * other.x
        );
    }

    // Magnitud al cuadrado (más rápido que magnitude)
    constexpr double lengthSquared() const {
        return x * x + y * y + z * z;
    }

    // Magnitud
    double length() const {
        return std::sqrt(lengthSquared());
    }

    // Normalización
    Vec3 normalized() const {
        double len = length();
        if (len == 0.0) return Vec3();
        return *this / len;
    }

    void normalize() {
        double len = length();
        if (len != 0.0) {
            *this = *this / len;
        }
    }

    // Distancia a otro punto
    double distanceTo(const Vec3& other) const {
        return (*this - other).length();
    }

    // Interpolación lineal
    static Vec3 lerp(const Vec3& a, const Vec3& b, double t) {
        return a + (b - a) * t;
    }

    constexpr bool operator==(const Vec3& other) const {
        return x == other.x && y == other.y && z == other.z;
    }

    // Constants
    static constexpr Vec3 Zero() { return Vec3(0, 0, 0); }
    static constexpr Vec3 UnitX() { return Vec3(1, 0, 0); }
    static constexpr Vec3 UnitY() { return Vec3(0, 1, 0); }
    static constexpr Vec3 UnitZ() { return Vec3(0, 0, 1); }
};

// Multiplicación escalar * vector
inline Vec3 operator*(double scalar, const Vec3& v) {
    return v * scalar;
}

} // namespace Low::Math
