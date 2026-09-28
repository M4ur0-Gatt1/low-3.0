#pragma once

#include "ISurface.hpp"

namespace Low::Surface {

/**
 * @brief Superficie esférica para dibujo 3D.
 * 
 * Implementación de ISurface para una esfera definida por
 * centro y radio. Útil para dibujar sobre formas orgánicas.
 */
class SphereSurface : public ISurface {
public:
    SphereSurface(const Math::Vec3& center, double radius)
        : center_(center), 
          radius_(radius),
          priority_(85),
          active_(true) {}

    HitResult intersect(const Math::Ray& ray) const override {
        HitResult result;
        result.priority = priority_;
        result.userData = const_cast<void*>(reinterpret_cast<const void*>(this));

        Math::Vec3 oc = ray.origin - center_;
        double b = oc.dot(ray.direction);
        double c = oc.dot(oc) - radius_ * radius_;
        
        double discriminant = b * b - c;
        
        if (discriminant < 0) {
            return result; // Sin intersección
        }

        double t = -b - std::sqrt(discriminant);
        if (t < 0) {
            t = -b + std::sqrt(discriminant);
            if (t < 0) return result;
        }

        Math::Vec3 hitPoint = ray.pointAt(t);
        Math::Vec3 hitNormal = (hitPoint - center_).normalized();

        result.hit = true;
        result.distance = t;
        result.point = hitPoint;
        result.normal = hitNormal;
        
        // Calcular UV usando coordenadas esféricas
        Math::Vec3 p = (hitPoint - center_) / radius_;
        result.uv.x = 0.5 + std::atan2(p.z, p.x) / (2.0 * 3.14159265359);
        result.uv.y = 0.5 - std::asin(p.y) / 3.14159265359;
        
        return result;
    }

    Math::Vec3 normal(const Math::Vec3& point) const override {
        return (point - center_).normalized();
    }

    Math::Vec2 uv(const Math::Vec3& point) const override {
        Math::Vec3 p = (point - center_) / radius_;
        return Math::Vec2(
            0.5 + std::atan2(p.z, p.x) / (2.0 * 3.14159265359),
            0.5 - std::asin(p.y) / 3.14159265359
        );
    }

    Math::AABB bounds() const override {
        Math::Vec3 half(radius_, radius_, radius_);
        return Math::AABB(center_ - half, center_ + half);
    }

    int getPriority() const override { return priority_; }
    std::string getName() const override { return name_; }
    bool isActive() const override { return active_; }

    void setPriority(int priority) { priority_ = priority; }
    void setName(const std::string& name) { name_ = name; }
    void setActive(bool active) { active_ = active; }
    
    const Math::Vec3& getCenter() const { return center_; }
    double getRadius() const { return radius_; }

private:
    Math::Vec3 center_;
    double radius_;
    int priority_;
    std::string name_;
    bool active_;
};

} // namespace Low::Surface
