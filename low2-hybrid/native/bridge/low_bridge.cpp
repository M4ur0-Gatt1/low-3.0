#include <napi.h>
#include "core/SurfaceEngine.hpp"
#include "core/StrokeEngine.hpp"
#include "core/InputEngine.hpp"

namespace Low {

/**
 * @brief Wrapper del Surface Engine para Node-API
 * 
 * Permite a los módulos TypeScript existentes usar el motor de superficies
 * de alto rendimiento sin reimplementar toda la lógica.
 */
class SurfaceEngineWrapper : public Napi::ObjectWrap<SurfaceEngineWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "SurfaceEngine", {
            InstanceMethod("intersect", &SurfaceEngineWrapper::Intersect),
            InstanceMethod("addSurface", &SurfaceEngineWrapper::AddSurface),
            InstanceMethod("removeSurface", &SurfaceEngineWrapper::RemoveSurface),
            InstanceMethod("setActiveSurface", &SurfaceEngineWrapper::SetActiveSurface),
            InstanceMethod("getPriority", &SurfaceEngineWrapper::GetPriority),
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);

        exports.Set("SurfaceEngine", func);
        return exports;
    }

    SurfaceEngineWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<SurfaceEngineWrapper>(info) {
        engine_ = std::make_unique<SurfaceEngine>();
    }

private:
    std::unique_ptr<SurfaceEngine> engine_;

    Napi::Value Intersect(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (info.Length() < 2) {
            Napi::TypeError::New(env, "Ray and surface type required").ThrowAsJavaScriptException();
            return env.Null();
        }

        // Extraer rayo desde JavaScript
        Napi::Object rayObj = info[0].As<Napi::Object>();
        Math::Ray ray = ExtractRay(rayObj);

        // Extraer tipo de superficie
        std::string surfaceType = info[1].As<Napi::String>().Utf8Value();

        // Ejecutar intersección en C++
        HitResult hit = engine_->intersect(ray, surfaceType);

        // Devolver resultado a JavaScript
        Napi::Object result = Napi::Object::New(env);
        result.Set("hit", hit.hit);
        if (hit.hit) {
            result.Set("point", CreateVec3(env, hit.point));
            result.Set("normal", CreateVec3(env, hit.normal));
            result.Set("uv", CreateVec2(env, hit.uv));
            result.Set("distance", hit.distance);
            result.Set("priority", hit.priority);
        }

        return result;
    }

    Napi::Value AddSurface(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (info.Length() < 2) {
            Napi::TypeError::New(env, "Surface type and config required").ThrowAsJavaScriptException();
            return env.Null();
        }

        std::string type = info[0].As<Napi::String>().Utf8Value();
        Napi::Object config = info[1].As<Napi::Object>();

        UUID surfaceId = engine_->addSurface(type, ExtractConfig(config));

        return Napi::String::New(env, surfaceId.toString());
    }

    void RemoveSurface(const Napi::CallbackInfo& info) {
        std::string id = info[0].As<Napi::String>().Utf8Value();
        engine_->removeSurface(UUID::fromString(id));
    }

    void SetActiveSurface(const Napi::CallbackInfo& info) {
        std::string id = info[0].As<Napi::String>().Utf8Value();
        engine_->setActiveSurface(UUID::fromString(id));
    }

    Napi::Value GetPriority(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        auto priorities = engine_->getPriorities();

        Napi::Object result = Napi::Object::New(env);
        for (const auto& [type, priority] : priorities) {
            result.Set(type, priority);
        }
        return result;
    }

    Math::Ray ExtractRay(const Napi::Object& obj) {
        Napi::Value originVal = obj.Get("origin");
        Napi::Value dirVal = obj.Get("direction");
        
        Math::Vec3 origin = ExtractVec3(originVal.As<Napi::Object>());
        Math::Vec3 dir = ExtractVec3(dirVal.As<Napi::Object>());
        
        return Math::Ray(origin, dir);
    }

    Math::Vec3 ExtractVec3(const Napi::Object& obj) {
        double x = obj.Get("x").As<Napi::Number>().DoubleValue();
        double y = obj.Get("y").As<Napi::Number>().DoubleValue();
        double z = obj.Get("z").As<Napi::Number>().DoubleValue();
        return Math::Vec3(x, y, z);
    }

    Math::Vec2 ExtractVec2(const Napi::Object& obj) {
        double x = obj.Get("x").As<Napi::Number>().DoubleValue();
        double y = obj.Get("y").As<Napi::Number>().DoubleValue();
        return Math::Vec2(x, y);
    }

    Napi::Object CreateVec3(Napi::Env env, const Math::Vec3& v) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("x", v.x);
        obj.Set("y", v.y);
        obj.Set("z", v.z);
        return obj;
    }

    Napi::Object CreateVec2(Napi::Env env, const Math::Vec2& v) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("x", v.x);
        obj.Set("y", v.y);
        return obj;
    }

    SurfaceConfig ExtractConfig(const Napi::Object& obj) {
        SurfaceConfig config;
        
        if (obj.Has("width")) {
            config.width = obj.Get("width").As<Napi::Number>().DoubleValue();
        }
        if (obj.Has("height")) {
            config.height = obj.Get("height").As<Napi::Number>().DoubleValue();
        }
        if (obj.Has("radius")) {
            config.radius = obj.Get("radius").As<Napi::Number>().DoubleValue();
        }
        if (obj.Has("transform")) {
            config.transform = ExtractMat4(obj.Get("transform").As<Napi::Object>());
        }
        
        return config;
    }

    Math::Mat4 ExtractMat4(const Napi::Object& obj) {
        // Implementación simplificada - extraer 16 valores
        Math::Mat4 mat;
        // ... implementación completa según formato
        return mat;
    }
};

/**
 * @brief Wrapper del Stroke Engine para Node-API
 */
class StrokeEngineWrapper : public Napi::ObjectWrap<StrokeEngineWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "StrokeEngine", {
            InstanceMethod("beginStroke", &StrokeEngineWrapper::BeginStroke),
            InstanceMethod("addPoint", &StrokeEngineWrapper::AddPoint),
            InstanceMethod("endStroke", &StrokeEngineWrapper::EndStroke),
            InstanceMethod("setBrush", &StrokeEngineWrapper::SetBrush),
            InstanceMethod("getStrokeData", &StrokeEngineWrapper::GetStrokeData),
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);

        exports.Set("StrokeEngine", func);
        return exports;
    }

    StrokeEngineWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<StrokeEngineWrapper>(info) {
        engine_ = std::make_unique<StrokeEngine>();
    }

private:
    std::unique_ptr<StrokeEngine> engine_;

    Napi::Value BeginStroke(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        std::string strokeId = engine_->beginStroke();
        
        return Napi::String::New(env, strokeId);
    }

    void AddPoint(const Napi::CallbackInfo& info) {
        if (info.Length() < 1) return;
        
        Napi::Object pointData = info[0].As<Napi::Object>();
        InputSample sample = ExtractInputSample(pointData);
        
        engine_->addPoint(sample);
    }

    Napi::Value EndStroke(const Napi::CallbackInfo& info) {
        engine_->endStroke();
        return info.Env().Undefined();
    }

    void SetBrush(const Napi::CallbackInfo& info) {
        if (info.Length() < 1) return;
        
        Napi::Object brushConfig = info[0].As<Napi::Object>();
        BrushConfig config = ExtractBrushConfig(brushConfig);
        
        engine_->setBrush(config);
    }

    Napi::Value GetStrokeData(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        auto strokeData = engine_->getStrokeData();
        
        Napi::Array points = Napi::Array::New(env, strokeData.points.size());
        for (size_t i = 0; i < strokeData.points.size(); ++i) {
            points.Set(i, CreateStrokePoint(env, strokeData.points[i]));
        }

        Napi::Object result = Napi::Object::New(env);
        result.Set("points", points);
        result.Set("brush", CreateBrushConfig(env, strokeData.brush));
        result.Set("controlPoints", strokeData.controlPointsCount);
        
        return result;
    }

    InputSample ExtractInputSample(const Napi::Object& obj) {
        InputSample sample;
        sample.position = ExtractVec3(obj.Get("position").As<Napi::Object>());
        sample.pressure = obj.Get("pressure").As<Napi::Number>().FloatValue();
        sample.tiltX = obj.Has("tiltX") ? obj.Get("tiltX").As<Napi::Number>().FloatValue() : 0.0f;
        sample.tiltY = obj.Has("tiltY") ? obj.Get("tiltY").As<Napi::Number>().FloatValue() : 0.0f;
        sample.timestamp = obj.Has("timestamp") ? obj.Get("timestamp").As<Napi::Number>().Int64Value() : 0;
        return sample;
    }

    BrushConfig ExtractBrushConfig(const Napi::Object& obj) {
        BrushConfig config;
        // Extraer configuración del pincel
        return config;
    }

    Napi::Object CreateStrokePoint(Napi::Env env, const StrokePoint& point) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("position", CreateVec3(env, point.pos));
        obj.Set("tangent", CreateVec3(env, point.tangent));
        obj.Set("normal", CreateVec3(env, point.normal));
        obj.Set("width", point.width);
        obj.Set("pressure", point.pressure);
        return obj;
    }

    Napi::Object CreateBrushConfig(Napi::Env env, const BrushConfig& config) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("type", config.type);
        obj.Set("width", config.width);
        obj.Set("color", CreateColor(env, config.color));
        return obj;
    }

    Napi::Object CreateColor(Napi::Env env, const Color& color) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("r", color.r);
        obj.Set("g", color.g);
        obj.Set("b", color.b);
        obj.Set("a", color.a);
        return obj;
    }
};

/**
 * @brief Inicialización del módulo nativo
 */
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    SurfaceEngineWrapper::Init(env, exports);
    StrokeEngineWrapper::Init(env, exports);
    
    // Constantes para tipos de superficie
    exports.Set("SURFACE_PLANE", "plane");
    exports.Set("SURFACE_SPHERE", "sphere");
    exports.Set("SURFACE_CYLINDER", "cylinder");
    exports.Set("SURFACE_TORUS", "torus");
    exports.Set("SURFACE_LOFT", "loft");
    exports.Set("SURFACE_MESH", "mesh");
    
    return exports;
}

NODE_API_MODULE(low_native_bridge, InitAll)
