#include <napi.h>

#include "p4_client_api.h"
#include "p4_map_node.h"
#include "p4_node.h"

namespace {

Napi::String Identify( const Napi::CallbackInfo& info )
{
    Napi::Env env = info.Env();
    P4JsClientApi api;
    StrBuf text;
    text << "p4js 0.1.0 P4API ";
    text << api.GetBuild();
    return Napi::String::New( env, text.Text() );
}

Napi::Object Init( Napi::Env env, Napi::Object exports )
{
    exports.Set( "identify", Napi::Function::New( env, Identify ) );
    exports.Set( "version", Napi::String::New( env, "0.1.0" ) );
    P4Node::Init( env, exports );
    NativeMap::Init( env, exports );
    return exports;
}

}  // namespace

NODE_API_MODULE( p4js_native, Init )
