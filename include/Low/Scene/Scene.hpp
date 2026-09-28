#pragma once

#include "SceneObject.hpp"
#include <vector>
#include <unordered_map>
#include <functional>

namespace Low::Scene {

/**
 * @brief Contenedor principal de todos los objetos 3D.
 * Maneja jerarquía, búsqueda y notificación de cambios.
 */
class Scene {
public:
    using ChangeCallback = std::function<void()>;

    Scene() = default;
    ~Scene() = default;

    /**
     * @brief Agrega un objeto a la escena (toma posesión).
     */
    void addObject(Core::Ref<SceneObject> object) {
        if (!object) return;
        objects_[object->getId()] = object;
        notifyChange();
    }

    /**
     * @brief Remueve un objeto de la escena por ID.
     */
    bool removeObject(const Core::UUID& id) {
        auto it = objects_.find(id);
        if (it != objects_.end()) {
            objects_.erase(it);
            notifyChange();
            return true;
        }
        return false;
    }

    /**
     * @brief Obtiene un objeto por ID.
     * @return nullptr si no existe.
     */
    Core::Ref<SceneObject> getObject(const Core::UUID& id) const {
        auto it = objects_.find(id);
        return (it != objects_.end()) ? it->second : nullptr;
    }

    /**
     * @brief Obtiene todos los objetos de un tipo específico.
     */
    template<typename T>
    std::vector<Core::Ref<T>> getObjectsByType() const {
        std::vector<Core::Ref<T>> result;
        for (const auto& [id, obj] : objects_) {
            if (auto typedObj = std::dynamic_pointer_cast<T>(obj)) {
                result.push_back(typedObj);
            }
        }
        return result;
    }

    /**
     * @brief Lista todos los objetos visibles y desbloqueados.
     */
    std::vector<Core::Ref<SceneObject>> getVisibleObjects() const {
        std::vector<Core::Ref<SceneObject>> result;
        for (const auto& [id, obj] : objects_) {
            if (obj->isVisible() && !obj->isLocked()) {
                result.push_back(obj);
            }
        }
        return result;
    }

    /**
     * @brief Limpia toda la escena.
     */
    void clear() {
        objects_.clear();
        notifyChange();
    }

    /**
     * @brief Cantidad de objetos en la escena.
     */
    size_t count() const { return objects_.size(); }

    /**
     * @brief Registra callback para cambios en la escena.
     */
    void setChangeCallback(ChangeCallback callback) {
        changeCallback_ = std::move(callback);
    }

    // Iteración
    auto begin() { return objects_.begin(); }
    auto end() { return objects_.end(); }
    auto begin() const { return objects_.begin(); }
    auto end() const { return objects_.end(); }

private:
    void notifyChange() {
        if (changeCallback_) {
            changeCallback_();
        }
    }

    std::unordered_map<Core::UUID, Core::Ref<SceneObject>> objects_;
    ChangeCallback changeCallback_;
};

} // namespace Low::Scene
