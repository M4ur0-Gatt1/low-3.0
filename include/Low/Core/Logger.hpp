#pragma once

#include <memory>
#include <vector>
#include <string>
#include <functional>
#include <optional>

namespace Low::Core {

/**
 * @brief Sistema de logging simple para debug y producción.
 * Niveles: Trace, Debug, Info, Warning, Error, Critical.
 */
enum class LogLevel {
    Trace,
    Debug,
    Info,
    Warning,
    Error,
    Critical
};

class Logger {
public:
    using LogCallback = std::function<void(LogLevel, const std::string&)>;

    static Logger& Instance() {
        static Logger instance;
        return instance;
    }

    void setLevel(LogLevel level) {
        minLevel_ = level;
    }

    void setCallback(LogCallback callback) {
        callback_ = std::move(callback);
    }

    void log(LogLevel level, const std::string& message) {
        if (level >= minLevel_ && callback_) {
            callback_(level, message);
        }
    }

    // Helpers
    void trace(const std::string& msg) { log(LogLevel::Trace, msg); }
    void debug(const std::string& msg) { log(LogLevel::Debug, msg); }
    void info(const std::string& msg) { log(LogLevel::Info, msg); }
    void warning(const std::string& msg) { log(LogLevel::Warning, msg); }
    void error(const std::string& msg) { log(LogLevel::Error, msg); }
    void critical(const std::string& msg) { log(LogLevel::Critical, msg); }

private:
    Logger() : minLevel_(LogLevel::Info) {}
    LogLevel minLevel_;
    LogCallback callback_;
};

// Macros convenientes (solo en debug)
#ifdef LOW_DEBUG
    #define LOW_LOG_TRACE(msg) ::Low::Core::Logger::Instance().trace(msg)
    #define LOW_LOG_DEBUG(msg) ::Low::Core::Logger::Instance().debug(msg)
    #define LOW_LOG_INFO(msg) ::Low::Core::Logger::Instance().info(msg)
    #define LOW_LOG_WARNING(msg) ::Low::Core::Logger::Instance().warning(msg)
    #define LOW_LOG_ERROR(msg) ::Low::Core::Logger::Instance().error(msg)
#else
    #define LOW_LOG_TRACE(msg)
    #define LOW_LOG_DEBUG(msg)
    #define LOW_LOG_INFO(msg)
    #define LOW_LOG_WARNING(msg)
    #define LOW_LOG_ERROR(msg)
#endif

} // namespace Low::Core
