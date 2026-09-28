#pragma once

// Core module public API
#include "UUID.hpp"
#include "Logger.hpp"
#include <memory>
#include <vector>
#include <string>
#include <unordered_map>

namespace Low::Core {

/**
 * @brief Tipos básicos y utilidades compartidas por todos los módulos.
 */

// Smart pointers estándar
template<typename T>
using Ref = std::shared_ptr<T>;

template<typename T>
using Unique = std::unique_ptr<T>;

template<typename T, typename... Args>
Ref<T> MakeRef(Args&&... args) {
    return std::make_shared<T>(std::forward<Args>(args)...);
}

template<typename T, typename... Args>
Unique<T> MakeUnique(Args&&... args) {
    return std::make_unique<T>(std::forward<Args>(args)...);
}

/**
 * @brief Resultado de operación que puede fallar.
 * Similar a std::expected (C++23) pero compatible con C++20.
 */
template<typename T, typename E = std::string>
class Result {
public:
    static Result Ok(T value) {
        Result r;
        r.hasValue_ = true;
        r.value_ = std::move(value);
        return r;
    }

    static Result Err(E error) {
        Result r;
        r.hasValue_ = false;
        r.error_ = std::move(error);
        return r;
    }

    bool isOk() const { return hasValue_; }
    bool isErr() const { return !hasValue_; }

    T& value() { 
        if (!hasValue_) throw std::runtime_error("Accediendo a valor inválido");
        return value_; 
    }
    
    const T& value() const { 
        if (!hasValue_) throw std::runtime_error("Accediendo a valor inválido");
        return value_; 
    }

    E& error() { 
        if (hasValue_) throw std::runtime_error("Accediendo a error inválido");
        return error_; 
    }

    const E& error() const { 
        if (hasValue_) throw std::runtime_error("Accediendo a error inválido");
        return error_; 
    }

    T valueOr(T defaultValue) const {
        return hasValue_ ? value_ : defaultValue;
    }

private:
    Result() = default;
    bool hasValue_;
    union {
        T value_;
        E error_;
    };
};

/**
 * @brief Pool simple de objetos para evitar allocaciones frecuentes.
 * @tparam T Tipo de objeto a poolizar.
 * @tparam InitialSize Cantidad inicial de objetos pre-asignados.
 */
template<typename T, size_t InitialSize = 64>
class ObjectPool {
public:
    ObjectPool() {
        // Pre-allocar objetos iniciales
        for (size_t i = 0; i < InitialSize; ++i) {
            freeList_.push_back(std::make_unique<T>());
        }
    }

    template<typename... Args>
    T* acquire(Args&&... args) {
        T* obj;
        
        if (freeList_.empty()) {
            // Expandir pool dinámicamente
            auto newObj = std::make_unique<T>(std::forward<Args>(args)...);
            objects_.push_back(std::move(newObj));
            obj = objects_.back().get();
        } else {
            obj = freeList_.back().release();
            freeList_.pop_back();
            objects_.push_back(std::unique_ptr<T>(obj));
        }

        // Resetear el objeto (si tiene método reset)
        // obj->reset(); 
        
        return obj;
    }

    void release(T* ptr) {
        // Buscar y mover a freeList
        for (auto it = objects_.begin(); it != objects_.end(); ++it) {
            if (it->get() == ptr) {
                freeList_.push_back(std::move(*it));
                objects_.erase(it);
                return;
            }
        }
    }

    size_t size() const { return objects_.size(); }
    size_t available() const { return freeList_.size(); }

private:
    std::vector<std::unique_ptr<T>> objects_;
    std::vector<std::unique_ptr<T>> freeList_;
};

} // namespace Low::Core

// Hash specialization para UUID en unordered_map
namespace std {
    template<>
    struct hash<Low::Core::UUID> {
        size_t operator()(const Low::Core::UUID& uuid) const {
            auto str = uuid.toString();
            return std::hash<std::string>{}(str);
        }
    };
}
