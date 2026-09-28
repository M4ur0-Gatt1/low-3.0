#pragma once

#include "../Core/Core.hpp"
#include "../Math/Math.hpp"
#include <vector>
#include <string>

namespace Low::Scene {

/**
 * @brief Clase base para todos los objetos en la escena.
 * Cada objeto tiene identidad única, transformación y estado.
 */
class SceneObject {
public:
    SceneObject(const std::string& name = "Unnamed")
        : id_(Core::UUID()), name_(name), visible_(true), locked_(false) {}

    virtual ~SceneObject() = default;

    // Identidad
    Core::UUID getId() const { return id_; }
    const std::string& getName() const { return name_; }
    void setName(const std::string& name) { name_ = name; }

    // Estado
    bool isVisible() const { return visible_; }
    void setVisible(bool visible) { visible_ = visible; }

    bool isLocked() const { return locked_; }
    void setLocked(bool locked) { locked_ = locked; }

    // Transformación
    Math::Mat4 getTransform() const { return transform_; }
    void setTransform(const Math::Mat4& transform) { transform_ = transform; }
    
    Math::Vec3 getPosition() const {
        return Math::Vec3(transform_(0, 3), transform_(1, 3), transform_(2, 3));
    }

    void setPosition(const Math::Vec3& pos) {
        transform_ = Math::Mat4::Translation(pos);
    }

    // BoundingBox (debe ser implementado por subclases según su geometría)
    virtual Math::AABB getBoundingBox() const {
        return Math::AABB::Empty();
    }

    // Tipo de objeto (para RTTI ligero sin exceptions)
    enum class Type {
        Unknown,
        Stroke,
        Guide,
        Mesh,
        Image,
        Camera,
        Light,
        Group,
        Surface
    };

    virtual Type getType() const { return Type::Unknown; }

protected:
    Core::UUID id_;
    std::string name_;
    bool visible_;
    bool locked_;
    Math::Mat4 transform_;
};

} // namespace Low::Scene
