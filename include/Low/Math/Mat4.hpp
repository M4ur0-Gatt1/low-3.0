#pragma once

#include "Vec3.hpp"
#include <array>

namespace Low::Math {

/**
 * @brief Matriz 4x4 para transformaciones 3D (Model, View, Projection).
 * Almacenada en orden column-major (compatible con OpenGL).
 */
class Mat4 {
public:
    std::array<double, 16> data;

    constexpr Mat4() : data{1.0, 0.0, 0.0, 0.0,
                            0.0, 1.0, 0.0, 0.0,
                            0.0, 0.0, 1.0, 0.0,
                            0.0, 0.0, 0.0, 1.0} {}

    // Acceso como matriz[row][col] -> data[row * 4 + col]
    double& operator()(int row, int col) {
        return data[row * 4 + col];
    }

    constexpr double operator()(int row, int col) const {
        return data[row * 4 + col];
    }

    // Multiplicación de matrices
    Mat4 operator*(const Mat4& other) const {
        Mat4 result;
        for (int i = 0; i < 4; ++i) {
            for (int j = 0; j < 4; ++j) {
                result(i, j) = 0.0;
                for (int k = 0; k < 4; ++k) {
                    result(i, j) += (*this)(i, k) * other(k, j);
                }
            }
        }
        return result;
    }

    // Transformar Vec3 (asume w=1)
    Vec3 transform(const Vec3& v) const {
        double x = data[0] * v.x + data[4] * v.y + data[8] * v.z + data[12];
        double y = data[1] * v.x + data[5] * v.y + data[9] * v.z + data[13];
        double z = data[2] * v.x + data[6] * v.y + data[10] * v.z + data[14];
        double w = data[3] * v.x + data[7] * v.y + data[11] * v.z + data[15];
        
        if (w != 0.0 && w != 1.0) {
            return Vec3(x / w, y / w, z / w);
        }
        return Vec3(x, y, z);
    }

    // Matriz identidad estática
    static constexpr Mat4 Identity() {
        return Mat4();
    }

    // Matriz de traslación
    static Mat4 Translation(const Vec3& t) {
        Mat4 m;
        m(0, 3) = t.x;
        m(1, 3) = t.y;
        m(2, 3) = t.z;
        return m;
    }

    // Matriz de escala
    static Mat4 Scale(const Vec3& s) {
        Mat4 m;
        m(0, 0) = s.x;
        m(1, 1) = s.y;
        m(2, 2) = s.z;
        return m;
    }

    // Matriz de rotación alrededor del eje X
    static Mat4 RotationX(double radians) {
        Mat4 m;
        double c = std::cos(radians);
        double s = std::sin(radians);
        m(1, 1) = c;
        m(1, 2) = -s;
        m(2, 1) = s;
        m(2, 2) = c;
        return m;
    }

    // Matriz de rotación alrededor del eje Y
    static Mat4 RotationY(double radians) {
        Mat4 m;
        double c = std::cos(radians);
        double s = std::sin(radians);
        m(0, 0) = c;
        m(0, 2) = s;
        m(2, 0) = -s;
        m(2, 2) = c;
        return m;
    }

    // Matriz de rotación alrededor del eje Z
    static Mat4 RotationZ(double radians) {
        Mat4 m;
        double c = std::cos(radians);
        double s = std::sin(radians);
        m(0, 0) = c;
        m(0, 1) = -s;
        m(1, 0) = s;
        m(1, 1) = c;
        return m;
    }

    // Matriz de vista (LookAt)
    static Mat4 LookAt(const Vec3& eye, const Vec3& center, const Vec3& up) {
        Vec3 f = (center - eye).normalized();
        Vec3 s = f.cross(up).normalized();
        Vec3 u = s.cross(f);

        Mat4 result;
        result(0, 0) = s.x;
        result(1, 0) = s.y;
        result(2, 0) = s.z;
        result(0, 1) = u.x;
        result(1, 1) = u.y;
        result(2, 1) = u.z;
        result(0, 2) = -f.x;
        result(1, 2) = -f.y;
        result(2, 2) = -f.z;
        result(0, 3) = -s.dot(eye);
        result(1, 3) = -u.dot(eye);
        result(2, 3) = f.dot(eye);
        return result;
    }

    // Matriz de proyección perspectiva
    static Mat4 Perspective(double fovRadians, double aspectRatio, double nearPlane, double farPlane) {
        Mat4 result;
        double tanHalfFov = std::tan(fovRadians / 2.0);
        
        result(0, 0) = 1.0 / (aspectRatio * tanHalfFov);
        result(1, 1) = 1.0 / tanHalfFov;
        result(2, 2) = -(farPlane + nearPlane) / (farPlane - nearPlane);
        result(2, 3) = -(2.0 * farPlane * nearPlane) / (farPlane - nearPlane);
        result(3, 2) = -1.0;
        result(3, 3) = 0.0;
        
        return result;
    }

    // Transpuesta
    Mat4 transpose() const {
        Mat4 result;
        for (int i = 0; i < 4; ++i) {
            for (int j = 0; j < 4; ++j) {
                result(i, j) = (*this)(j, i);
            }
        }
        return result;
    }
};

} // namespace Low::Math
