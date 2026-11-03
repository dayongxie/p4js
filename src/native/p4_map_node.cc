#include "p4_map_node.h"

#include "p4_map.h"

Napi::FunctionReference NativeMap::constructor;

void NativeMap::Init( Napi::Env env, Napi::Object exports )
{
    Napi::Function func = DefineClass( env, "NativeMap", {
        InstanceMethod( "insertLine", &NativeMap::InsertLine ),
        InstanceMethod( "insert", &NativeMap::Insert ),
        InstanceMethod( "translate", &NativeMap::Translate ),
        InstanceMethod( "translateArray", &NativeMap::TranslateArray ),
        InstanceMethod( "count", &NativeMap::Count ),
        InstanceMethod( "reverse", &NativeMap::Reverse ),
        InstanceMethod( "clear", &NativeMap::Clear ),
        InstanceMethod( "asString", &NativeMap::AsString ),
        InstanceMethod( "asArray", &NativeMap::AsArray ),
        InstanceMethod( "lhs", &NativeMap::Lhs ),
        InstanceMethod( "rhs", &NativeMap::Rhs ),
        InstanceMethod( "type", &NativeMap::Type ),
        InstanceMethod( "join", &NativeMap::Join ),
    });

    constructor = Napi::Persistent( func );
    constructor.SuppressDestruct();
    exports.Set( "NativeMap", func );
}

NativeMap::NativeMap( const Napi::CallbackInfo& info )
  : Napi::ObjectWrap<NativeMap>( info )
  , map( new P4JsMap() )
{
}

NativeMap::~NativeMap() = default;

void NativeMap::Replace( P4JsMap* value )
{
    map.reset( value );
}

Napi::Value NativeMap::InsertLine( const Napi::CallbackInfo& info )
{
    map->InsertLine( info[0].As<Napi::String>().Utf8Value() );
    return info.Env().Undefined();
}

Napi::Value NativeMap::Insert( const Napi::CallbackInfo& info )
{
    map->Insert( info[0].As<Napi::String>().Utf8Value(),
                 info[1].As<Napi::String>().Utf8Value() );
    return info.Env().Undefined();
}

Napi::Value NativeMap::Translate( const Napi::CallbackInfo& info )
{
    const int direction = info.Length() > 1 ? info[1].As<Napi::Number>().Int32Value() : 0;
    return Napi::String::New( info.Env(),
                              map->Translate( info[0].As<Napi::String>().Utf8Value(),
                                              direction ) );
}

Napi::Value NativeMap::TranslateArray( const Napi::CallbackInfo& info )
{
    const int direction = info.Length() > 1 ? info[1].As<Napi::Number>().Int32Value() : 0;
    const std::vector<std::string> values =
        map->TranslateArray( info[0].As<Napi::String>().Utf8Value(), direction );
    Napi::Array array = Napi::Array::New( info.Env(), values.size() );
    for( size_t i = 0; i < values.size(); i++ )
        array.Set( (uint32_t)i, Napi::String::New( info.Env(), values[i] ) );
    return array;
}

Napi::Value NativeMap::Count( const Napi::CallbackInfo& info )
{
    return Napi::Number::New( info.Env(), map->Count() );
}

Napi::Value NativeMap::Reverse( const Napi::CallbackInfo& info )
{
    map->Reverse();
    return info.Env().Undefined();
}

Napi::Value NativeMap::Clear( const Napi::CallbackInfo& info )
{
    map->Clear();
    return info.Env().Undefined();
}

Napi::Value NativeMap::AsString( const Napi::CallbackInfo& info )
{
    return Napi::String::New( info.Env(), map->AsString() );
}

Napi::Value NativeMap::AsArray( const Napi::CallbackInfo& info )
{
    const std::vector<std::string> values = map->AsArray();
    Napi::Array array = Napi::Array::New( info.Env(), values.size() );
    for( size_t i = 0; i < values.size(); i++ )
        array.Set( (uint32_t)i, Napi::String::New( info.Env(), values[i] ) );
    return array;
}

Napi::Value NativeMap::Lhs( const Napi::CallbackInfo& info )
{
    return Napi::String::New( info.Env(),
                              map->Lhs( info[0].As<Napi::Number>().Int32Value() ) );
}

Napi::Value NativeMap::Rhs( const Napi::CallbackInfo& info )
{
    return Napi::String::New( info.Env(),
                              map->Rhs( info[0].As<Napi::Number>().Int32Value() ) );
}

Napi::Value NativeMap::Type( const Napi::CallbackInfo& info )
{
    return Napi::Number::New( info.Env(),
                              map->Type( info[0].As<Napi::Number>().Int32Value() ) );
}

Napi::Value NativeMap::Join( const Napi::CallbackInfo& info )
{
    if( info.Length() < 1 || !info[0].IsObject() )
        throw Napi::TypeError::New( info.Env(), "p4js: NativeMap.join expects a NativeMap" );

    NativeMap* other = Napi::ObjectWrap<NativeMap>::Unwrap( info[0].As<Napi::Object>() );
    if( !other )
        throw Napi::TypeError::New( info.Env(), "p4js: NativeMap.join expects a NativeMap" );

    Napi::Object object = constructor.New( {} );
    NativeMap* result = Napi::ObjectWrap<NativeMap>::Unwrap( object );
    result->Replace( map->Join( other->Map() ) );
    return object;
}
