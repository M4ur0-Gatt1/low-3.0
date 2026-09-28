#pragma once

#include "ISurface.hpp"
#include "PlaneSurface.hpp"
#include "SphereSurface.hpp"
#include <vector>
#include <algorithm>
#include <memory>

namespace Low::Surface {

/**
 * @brief Motor principal de superficies.
 * 
 * Responsabilidades:
 * - Mantener colección de superficies activas
 * - Resolver intersecciones múltiples con prioridad
 * - Proveer punto de dibujo óptimo dado un rayo
 * 
 * Este es el "corazón" del sistema de contexto de LOW.
 * El lápiz nunca trabaja en vacío: siempre hay una superficie activa.
 */
class SurfaceEngine {
public:
    SurfaceEngine() = default;
    ~SurfaceEngine() = default;

    /**
     * @brief Agrega una superficie al motor.
     */
    void addSurface(std::shared_ptr<ISurface> surface) {
        if (!surface) return;
        surfaces_.push_back(surface);
    }

    /**
     * @brief Remueve una superficie por nombre o puntero.
     */
    bool removeSurface(const std::string& name) {
        auto it = std::find_if(surfaces_.begin(), surfaces_.end(),
            [&name](const std::shared_ptr<ISurface>& s) {
                return s->getName() == name;
            });
        
        if (it != surfaces_.end()) {
            surfaces_.erase(it);
            return true;
        }
        return false;
    }

    /**
     * @brief Encuentra la mejor intersección considerando prioridades.
     * 
     * Algoritmo:
     * 1. Intersectar rayo con TODAS las superficies activas
     * 2. Filtrar resultados inválidos (hit=false)
     * 3. Ordenar por prioridad (mayor primero), luego por distancia (menor primero)
     * 4. Retornar el mejor resultado
     * 
     * @param ray Rayo desde la cámara/mouse
     * @return Mejor HitResult o HitResult con hit=false si no hay intersecciones
     */
    HitResult findBestIntersection(const Math::Ray& ray) const {
        HitResult best;
        best.hit = false;
        best.distance = std::numeric_limits<double>::max();

        std::vector<HitResult> candidates;
        candidates.reserve(surfaces_.size());

        // 1. Intersectar con todas las superficies activas
        for (const auto& surface : surfaces_) {
            if (!surface->isActive()) continue;
            
            HitResult result = surface->intersect(ray);
            if (result.hit) {
                candidates.push_back(result);
            }
        }

        if (candidates.empty()) {
            return best;
        }

        // 2. Ordenar por prioridad (desc) y luego distancia (asc)
        std::sort(candidates.begin(), candidates.end(),
            [](const HitResult& a, const HitResult& b) {
                if (a.priority != b.priority) {
                    return a.priority > b.priority;  // Mayor prioridad primero
                }
                return a.distance < b.distance;  // Menor distancia primero
            });

        // 3. Retornar el mejor
        return candidates[0];
    }

    /**
     * @brief Obtiene todas las superficies que intersectan el rayo.
     * Útil para debugging o selección múltiple.
     */
    std::vector<HitResult> findAllIntersections(const Math::Ray& ray) const {
        std::vector<HitResult> results;
        
        for (const auto& surface : surfaces_) {
            if (!surface->isActive()) continue;
            
            HitResult result = surface->intersect(ray);
            if (result.hit) {
                results.push_back(result);
            }
        }

        // Ordenar por distancia
        std::sort(results.begin(), results.end(),
            [](const HitResult& a, const HitResult& b) {
                return a.distance < b.distance;
            });

        return results;
    }

    /**
     * @brief Limpia todas las superficies.
     */
    void clear() {
        surfaces_.clear();
    }

    /**
     * @brief Cantidad de superficies registradas.
     */
    size_t count() const { return surfaces_.size(); }

    /**
     * @brief Obtiene una superficie por nombre.
     */
    std::shared_ptr<ISurface> getSurface(const std::string& name) const {
        auto it = std::find_if(surfaces_.begin(), surfaces_.end(),
            [&name](const std::shared_ptr<ISurface>& s) {
                return s->getName() == name;
            });
        
        return (it != surfaces_.end()) ? *it : nullptr;
    }

    // Iteración
    auto begin() { return surfaces_.begin(); }
    auto end() { return surfaces_.end(); }
    auto begin() const { return surfaces_.begin(); }
    auto end() const { return surfaces_.end(); }

private:
    std::vector<std::shared_ptr<ISurface>> surfaces_;
};

} // namespace Low::Surface
