#pragma once

#include "ISurface.hpp"

namespace Low::Surface {

/**
 * @brief Superficie plana infinita o limitada.
 * 
 * Implementación básica de ISurface para un plano definido por
 * un punto y una normal. Usado como superficie de dibujo por defecto.
 */
class PlaneSurface : public ISurface {
public:
    /**
     * @brief Crea un plano infinito.
     * @param point Punto que pertenece al plano.
     * @param normal Normal del plano (debe estar normalizada).
     * @param limitSize Si es > 0, el plano tiene límites cuadrados de este tamaño.
     */
    PlaneSurface(const Math::Vec3& point, const Math::Vec3& normal, 
                 double limitSize = -1.0)
        : point_(point), 
          normal_(normal.normalized()), 
          limitSize_(limitSize),
          priority_(70),
          active_(true) {}

    HitResult intersect(const Math::Ray& ray) const override {
        HitResult result;
        result.priority = priority_;
        result.userData = const_cast<void*>(reinterpret_cast<const void*>(this));

        double denom = ray.direction.dot(normal_);
        
        // Rayo paralelo al plano
        if (std::abs(denom) < 1e-8) {
            return result;
        }

        Math::Vec3 p0ToOrigin = ray.origin - point_;
        double t = -p0ToOrigin.dot(normal_) / denom;
        
        // Intersección detrás del rayo
        if (t < 0) {
            return result;
        }

        Math::Vec3 hitPoint = ray.pointAt(t);
        
        // Verificar límites si existen
        if (limitSize_ > 0) {
            Math::Vec3 local = hitPoint - point_;
            Math::Vec3 u = normal_.cross(Math::Vec3::UnitX());
            if (u.lengthSquared() < 1e-6) {
                u = normal_.cross(Math::Vec3::UnitY());
            }
            u.normalize();
            Math::Vec3 v = normal_.cross(u);
            
            double projU = std::abs(local.dot(u));
            double projV = std::abs(local.dot(v));
            
            if (projU > limitSize_ / 2.0 || projV > limitSize_ / 2.0) {
                return result; // Fuera de los límites
            }
            
            // Calcular UV
            result.uv.x = (local.dot(u) + limitSize_ / 2.0) / limitSize_;
            result.uv.y = (local.dot(v) + limitSize_ / 2.0) / limitSize_;
        }

        result.hit = true;
        result.distance = t;
        result.point = hitPoint;
        result.normal = normal_;
        
        return result;
    }

    Math::Vec3 normal(const Math::Vec3& point) const override {
        return normal_; // La normal es constante en todo el plano
    }

    Math::Vec2 uv(const Math::Vec3& point) const override {
        if (limitSize_ <= 0) {
            return Math::Vec2(0, 0);
        }
        
        Math::Vec3 local = point - point_;
        Math::Vec3 u = normal_.cross(Math::Vec3::UnitX());
        if (u.lengthSquared() < 1e-6) {
            u = normal_.cross(Math::Vec3::UnitY());
        }
        u.normalize();
        Math::Vec3 v = normal_.cross(u);
        
        return Math::Vec2(
            (local.dot(u) + limitSize_ / 2.0) / limitSize_,
            (local.dot(v) + limitSize_ / 2.0) / limitSize_
        );
    }

    Math::AABB bounds() const override {
        if (limitSize_ > 0) {
            Math::Vec3 half(limitSize_ / 2.0, limitSize_ / 2.0, limitSize_ / 2.0);
            return Math::AABB(point_ - half, point_ + half);
        }
        // Plano infinito: AABB inválido
        return Math::AABB::Empty();
    }

    int getPriority() const override {
        return priority_;
    }

    std::string getName() const override {
        return name_;
    }

    bool isActive() const override {
        return active_;
    }

    // Setters
    void setPriority(int priority) { priority_ = priority; }
    void setName(const std::string& name) { name_ = name; }
    void setActive(bool active) { active_ = active; }
    
    const Math::Vec3& getPoint() const { return point_; }
    const Math::Vec3& getNormal() const { return normal_; }
    double getLimitSize() const { return limitSize_; }

private:
    Math::Vec3 point_;
    Math::Vec3 normal_;
    double limitSize_;  // -1 = infinito
    int priority_;
    std::string name_;
    bool active_;
};

} // namespace Low::Surface
