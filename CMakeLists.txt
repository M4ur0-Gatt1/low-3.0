cmake_minimum_required(VERSION 3.20)
project(LOW2 VERSION 0.1.0 LANGUAGES CXX)

# Estándar C++20
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Configuración de compilación para MSVC/Windows y Linux
if(MSVC)
    add_compile_options(/W4 /WX- /permissive-)
    add_definitions(-DUNICODE -D_UNICODE)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -Wno-unused-parameter)
endif()

# Dependencias externas (se asume que el usuario las instala o usa vcpkg/conan)
# OpenGL, GLAD, GLM, ImGui se vincularán aquí

find_package(OpenGL REQUIRED)

# Estructura de directorios de include
include_directories(${CMAKE_SOURCE_DIR}/include)
include_directories(${CMAKE_SOURCE_DIR}/src)
include_directories(${OPENGL_INCLUDE_DIR})

# ==========================================
# MÓDULO CORE (Matemáticas y Tipos Base)
# ==========================================
file(GLOB_RECURSE CORE_SOURCES src/Core/*.cpp src/Core/*.hpp src/Core/*.h)
file(GLOB_RECURSE MATH_SOURCES src/Math/*.cpp src/Math/*.hpp src/Math/*.h)

add_library(LowCore STATIC 
    ${CORE_SOURCES}
    ${MATH_SOURCES}
)

target_include_directories(LowCore PUBLIC 
    ${CMAKE_SOURCE_DIR}/include/Low/Core
    ${CMAKE_SOURCE_DIR}/include/Low/Math
)

# ==========================================
# MÓDULO SCENE (SceneGraph y Objetos)
# ==========================================
file(GLOB_RECURSE SCENE_SOURCES src/Scene/*.cpp src/Scene/*.hpp src/Scene/*.h)

add_library(LowScene STATIC ${SCENE_SOURCES})
target_link_libraries(LowScene PUBLIC LowCore)
target_include_directories(LowScene PUBLIC ${CMAKE_SOURCE_DIR}/include/Low/Scene)

# ==========================================
# MÓDULO STROKE (Motor de Trazos)
# ==========================================
file(GLOB_RECURSE STROKE_SOURCES src/Stroke/*.cpp src/Stroke/*.hpp src/Stroke/*.h)

add_library(LowStroke STATIC ${STROKE_SOURCES})
target_link_libraries(LowStroke PUBLIC LowCore LowScene)
target_include_directories(LowStroke PUBLIC ${CMAKE_SOURCE_DIR}/include/Low/Stroke)

# ==========================================
# MÓDULO SURFACE (Motor de Superficies)
# ==========================================
file(GLOB_RECURSE SURFACE_SOURCES src/Surface/*.cpp src/Surface/*.hpp src/Surface/*.h)

add_library(LowSurface STATIC ${SURFACE_SOURCES})
target_link_libraries(LowSurface PUBLIC LowCore LowScene LowMath)
target_include_directories(LowSurface PUBLIC ${CMAKE_SOURCE_DIR}/include/Low/Surface)

# ==========================================
# MÓDULO RENDER (OpenGL y Geometría)
# ==========================================
file(GLOB_RECURSE RENDER_SOURCES src/Render/*.cpp src/Render/*.hpp src/Render/*.h)

add_library(LowRender STATIC ${RENDER_SOURCES})
target_link_libraries(LowRender PUBLIC LowCore LowScene LowStroke LowSurface ${OPENGL_LIBRARIES})
target_include_directories(LowRender PUBLIC ${CMAKE_SOURCE_DIR}/include/Low/Render)

# ==========================================
# MÓDULO INPUT (Mouse, Wacom, SpaceMouse)
# ==========================================
file(GLOB_RECURSE INPUT_SOURCES src/Input/*.cpp src/Input/*.hpp src/Input/*.h)

add_library(LowInput STATIC ${INPUT_SOURCES})
target_link_libraries(LowInput PUBLIC LowCore LowScene)
target_include_directories(LowInput PUBLIC ${CMAKE_SOURCE_DIR}/include/Low/Input)

# ==========================================
# MÓDULO UI (Dear ImGui Integration)
# ==========================================
# Nota: ImGui requiere configuración especial de backends (Win32/OpenGL3)
# Aquí solo se define el target, la implementación real va en src/UI
file(GLOB_RECURSE UI_SOURCES src/UI/*.cpp src/UI/*.hpp src/UI/*.h)

add_library(LowUI STATIC ${UI_SOURCES})
target_link_libraries(LowUI PUBLIC LowCore LowRender LowInput)
target_include_directories(LowUI PUBLIC ${CMAKE_SOURCE_DIR}/include/Low/UI)

# ==========================================
# APLICACIÓN PRINCIPAL
# ==========================================
file(GLOB_RECURSE APP_SOURCES src/App/*.cpp src/App/*.hpp src/App/*.h)

add_executable(LOW2 ${APP_SOURCES})

target_link_libraries(LOW2 PRIVATE
    LowCore
    LowScene
    LowStroke
    LowSurface
    LowRender
    LowInput
    LowUI
    ${OPENGL_LIBRARIES}
)

# Copiar shaders al directorio de build
file(COPY ${CMAKE_SOURCE_DIR}/shaders DESTINATION ${CMAKE_BINARY_DIR})

# Tests unitarios (opcional, requiere GoogleTest)
# enable_testing()
# add_subdirectory(tests)

message(STATUS "LOW 2.0 Build Configuration Complete")
message(STATUS "  - C++ Standard: C++20")
message(STATUS "  - OpenGL: ${OPENGL_VERSION}")
