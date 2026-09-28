#include "Low/Core/Logger.hpp"
#include <iostream>
#include <chrono>
#include <iomanip>

namespace Low::Core {

// Implementación de Logger con salida a consola por defecto
static const char* levelToString(LogLevel level) {
    switch (level) {
        case LogLevel::Trace:   return "TRACE";
        case LogLevel::Debug:   return "DEBUG";
        case LogLevel::Info:    return "INFO";
        case LogLevel::Warning: return "WARN";
        case LogLevel::Error:   return "ERROR";
        case LogLevel::Critical:return "CRIT";
        default:                return "????";
    }
}

void Logger::initDefault() {
    setCallback([](LogLevel level, const std::string& message) {
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        
        std::cout << "[" 
                  << std::put_time(std::localtime(&time), "%H:%M:%S") 
                  << "] [" 
                  << levelToString(level) 
                  << "] " 
                  << message 
                  << std::endl;
    });
}

} // namespace Low::Core
