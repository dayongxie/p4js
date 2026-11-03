#pragma once

#include <napi.h>

#include <memory>

#include "p4js_p4.h"

class P4JsMap;

class NativeMap : public Napi::ObjectWrap<NativeMap>
{
  public:
    static Napi::FunctionReference constructor;
    static void Init( Napi::Env env, Napi::Object exports );

    explicit NativeMap( const Napi::CallbackInfo& info );
    ~NativeMap() override;

    P4JsMap* Map() const { return map.get(); }
    void Replace( P4JsMap* value );

  private:
    Napi::Value InsertLine( const Napi::CallbackInfo& info );
    Napi::Value Insert( const Napi::CallbackInfo& info );
    Napi::Value Translate( const Napi::CallbackInfo& info );
    Napi::Value TranslateArray( const Napi::CallbackInfo& info );
    Napi::Value Count( const Napi::CallbackInfo& info );
    Napi::Value Reverse( const Napi::CallbackInfo& info );
    Napi::Value Clear( const Napi::CallbackInfo& info );
    Napi::Value AsString( const Napi::CallbackInfo& info );
    Napi::Value AsArray( const Napi::CallbackInfo& info );
    Napi::Value Lhs( const Napi::CallbackInfo& info );
    Napi::Value Rhs( const Napi::CallbackInfo& info );
    Napi::Value Type( const Napi::CallbackInfo& info );
    Napi::Value Join( const Napi::CallbackInfo& info );

    std::unique_ptr<P4JsMap> map;
};
