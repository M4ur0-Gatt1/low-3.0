#pragma once

#include <cstdint>
#include <random>
#include <string>

namespace Low::Core {

/**
 * @brief UUID único para identificar objetos de escena.
 * Generado aleatoriamente en construcción.
 */
class UUID {
public:
    UUID() {
        static std::random_device rd;
        static std::mt19937_64 gen(rd());
        static std::uniform_int_distribution<uint64_t> dist;

        uint64_t a = dist(gen);
        uint64_t b = dist(gen);
        
        // Formato simple: 2 x uint64 en hex
        data[0] = a;
        data[1] = b;
    }

    // Constructor desde valores existentes (para deserialización)
    constexpr UUID(uint64_t a, uint64_t b) : data{a, b} {}

    bool operator==(const UUID& other) const {
        return data[0] == other.data[0] && data[1] == other.data[1];
    }

    bool operator!=(const UUID& other) const {
        return !(*this == other);
    }

    bool operator<(const UUID& other) const {
        if (data[0] != other.data[0]) return data[0] < other.data[0];
        return data[1] < other.data[1];
    }

    std::string toString() const {
        char buffer[37];
        snprintf(buffer, sizeof(buffer), "%016llx-%016llx", 
                 (unsigned long long)data[0], 
                 (unsigned long long)data[1]);
        return std::string(buffer);
    }

    static UUID Empty() {
        return UUID(0, 0);
    }

    bool isValid() const {
        return data[0] != 0 || data[1] != 0;
    }

private:
    uint64_t data[2];
};

} // namespace Low::Core
