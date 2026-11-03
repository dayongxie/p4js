#include "p4_node.h"

#include <cstdlib>
#include <mutex>
#include <stdexcept>
#include <utility>
#include <vector>

#include "convert.h"
#include "p4_client_api.h"
#include "p4_client_user.h"
#include "p4_results.h"
#include "p4_spec_data.h"

namespace {

std::mutex g_p4_mutex;

std::string ToString( const Napi::Value& value )
{
    if( value.IsString() )
        return value.As<Napi::String>().Utf8Value();
    return std::string();
}

void ProgressInitCb( void* context, int type )
{
    static_cast<P4Node*>( context )->EmitProgress( 0, type, nullptr, 0, 0, 0, 0 );
}

void ProgressDescriptionCb( void* context, char* description, int units )
{
    static_cast<P4Node*>( context )->EmitProgress( 1, 0, description, units, 0, 0, 0 );
}

void ProgressTotalCb( void* context, long total )
{
    static_cast<P4Node*>( context )->EmitProgress( 2, 0, nullptr, 0, total, 0, 0 );
}

void ProgressUpdateCb( void* context, long position )
{
    static_cast<P4Node*>( context )->EmitProgress( 3, 0, nullptr, 0, 0, position, 0 );
}

void ProgressDoneCb( void* context, int fail )
{
    static_cast<P4Node*>( context )->EmitProgress( 4, 0, nullptr, 0, 0, 0, fail );
}

int KeepAliveCb( void* context )
{
    return static_cast<P4Node*>( context )->IsCancelled() ? 0 : 1;
}

class P4Worker : public Napi::AsyncWorker
{
  public:
    P4Worker( Napi::Env env, P4Node* node, Napi::ObjectReference ref )
      : Napi::AsyncWorker( env )
      , deferred( Napi::Promise::Deferred::New( env ) )
      , node( node )
      , ref( std::move( ref ) )
    {
    }

    Napi::Promise Promise() { return deferred.Promise(); }

    void Execute() override
    {
        std::lock_guard<std::mutex> lock( g_p4_mutex );
        try
        {
            ExecuteOp();
        }
        catch( const std::exception& error )
        {
            SetError( error.what() );
        }
        catch( ... )
        {
            SetError( "unknown native error" );
        }
    }

    void OnOK() override
    {
        node->SetBusy( false );
        try
        {
            Napi::Env env = Env();
            Napi::HandleScope scope( env );
            deferred.Resolve( BuildResult( env ) );
        }
        catch( const Napi::Error& error )
        {
            deferred.Reject( error.Value() );
        }
        catch( const std::exception& error )
        {
            deferred.Reject( Napi::Error::New( Env(), error.what() ).Value() );
        }
        ref.Reset();
    }

    void OnError( const Napi::Error& error ) override
    {
        node->SetBusy( false );
        deferred.Reject( error.Value() );
        ref.Reset();
    }

  protected:
    virtual void ExecuteOp() = 0;
    virtual Napi::Value BuildResult( Napi::Env env ) = 0;

    Napi::Promise::Deferred deferred;
    P4Node* node;
    Napi::ObjectReference ref;
};

class ConnectWorker : public P4Worker
{
  public:
    ConnectWorker( Napi::Env env, P4Node* node, Napi::ObjectReference ref )
      : P4Worker( env, node, std::move( ref ) )
    {
    }

    void ExecuteOp() override
    {
        error.reset( new Error );
        ok = node->Api()->Connect( error.get() ) != 0;
        node->Api()->SetKeepAlive( node->KeepAlive() );
    }

    Napi::Value BuildResult( Napi::Env env ) override
    {
        if( !ok && error && error->Test() )
        {
            const std::string message = FormatError( error.get() );
            error.reset();
            throw Napi::Error::New( env, message.empty() ? "connect failed" : message );
        }
        error.reset();
        return env.Undefined();
    }

  private:
    std::unique_ptr<Error> error;
    bool ok = false;
};

class DisconnectWorker : public P4Worker
{
  public:
    DisconnectWorker( Napi::Env env, P4Node* node, Napi::ObjectReference ref )
      : P4Worker( env, node, std::move( ref ) )
    {
    }

    void ExecuteOp() override
    {
        error.reset( new Error );
        ok = node->Api()->Disconnect( error.get() ) != 0;
    }

    Napi::Value BuildResult( Napi::Env env ) override
    {
        if( !ok && error && error->Test() && error->GetSeverity() >= E_FAILED )
        {
            const std::string message = FormatError( error.get() );
            error.reset();
            throw Napi::Error::New( env, message.empty() ? "disconnect failed" : message );
        }
        error.reset();
        return env.Undefined();
    }

  private:
    std::unique_ptr<Error> error;
    bool ok = false;
};

struct InputItem
{
    bool bytes;
    std::string data;
};

class RunWorker : public P4Worker
{
  public:
    RunWorker( Napi::Env env, P4Node* node, Napi::ObjectReference ref,
               std::string command, std::vector<std::string> args,
               std::vector<InputItem> inputs )
      : P4Worker( env, node, std::move( ref ) )
      , command( std::move( command ) )
      , args( std::move( args ) )
      , inputs( std::move( inputs ) )
    {
    }

    void ExecuteOp() override
    {
        P4JsClientApi* api = node->Api();
        api->ResetInput();
        for( const auto& input : inputs )
        {
            if( input.bytes )
                api->AppendInputBytes( input.data.data(), (unsigned int)input.data.size() );
            else
                api->AppendInput( const_cast<char*>( input.data.c_str() ) );
        }

        std::vector<char*> argv;
        argv.reserve( args.size() );
        for( const auto& arg : args )
            argv.push_back( const_cast<char*>( arg.c_str() ) );

        error.reset( new Error );
        api->Run( command.c_str(), (int)argv.size(),
                  argv.empty() ? nullptr : argv.data(), error.get() );
    }

    Napi::Value BuildResult( Napi::Env env ) override
    {
        Napi::Object envelope = BuildEnvelope( env, node->Api()->GetResults(),
                                               error.get() );
        error.reset();
        return envelope;
    }

  private:
    std::string command;
    std::vector<std::string> args;
    std::vector<InputItem> inputs;
    std::unique_ptr<Error> error;
};

enum class ServerInfoKind
{
    Level,
    Unicode,
    CaseSensitive
};

class ServerInfoWorker : public P4Worker
{
  public:
    ServerInfoWorker( Napi::Env env, P4Node* node, Napi::ObjectReference ref,
                      ServerInfoKind kind )
      : P4Worker( env, node, std::move( ref ) )
      , kind( kind )
    {
    }

    void ExecuteOp() override
    {
        error.reset( new Error );
        switch( kind )
        {
        case ServerInfoKind::Level:
            value = node->Api()->GetServerLevel( error.get() );
            break;
        case ServerInfoKind::Unicode:
            value = node->Api()->ServerUnicode( error.get() );
            break;
        case ServerInfoKind::CaseSensitive:
            value = node->Api()->ServerCaseSensitive( error.get() );
            break;
        }
    }

    Napi::Value BuildResult( Napi::Env env ) override
    {
        if( error && error->Test() )
        {
            const std::string message = FormatError( error.get() );
            error.reset();
            throw Napi::Error::New( env, message.empty() ? "server query failed" : message );
        }
        error.reset();
        if( kind == ServerInfoKind::Level )
            return Napi::Number::New( env, value );
        return Napi::Boolean::New( env, value != 0 );
    }

  private:
    ServerInfoKind kind;
    std::unique_ptr<Error> error;
    int value = 0;
};

}  // namespace

Napi::FunctionReference P4Node::constructor;

void P4Node::Init( Napi::Env env, Napi::Object exports )
{
    Napi::Function func = DefineClass( env, "NativeP4", {
        InstanceMethod( "getProp", &P4Node::GetProp ),
        InstanceMethod( "setProp", &P4Node::SetProp ),
        InstanceMethod( "connect", &P4Node::Connect ),
        InstanceMethod( "disconnect", &P4Node::Disconnect ),
        InstanceMethod( "run", &P4Node::Run ),
        InstanceMethod( "serverLevel", &P4Node::ServerLevel ),
        InstanceMethod( "serverUnicode", &P4Node::ServerUnicode ),
        InstanceMethod( "serverCaseInsensitive", &P4Node::ServerCaseInsensitive ),
        InstanceMethod( "parseSpec", &P4Node::ParseSpec ),
        InstanceMethod( "formatSpec", &P4Node::FormatSpec ),
        InstanceMethod( "isIgnored", &P4Node::IsIgnored ),
        InstanceMethod( "env", &P4Node::GetEnvValue ),
        InstanceMethod( "setEnv", &P4Node::SetEnv ),
        InstanceMethod( "protocol", &P4Node::Protocol ),
        InstanceMethod( "setProtocol", &P4Node::SetProtocol ),
        InstanceMethod( "setProgress", &P4Node::SetProgress ),
        InstanceMethod( "cancel", &P4Node::Cancel ),
    });

    constructor = Napi::Persistent( func );
    constructor.SuppressDestruct();
    exports.Set( "NativeP4", func );
}

P4Node::P4Node( const Napi::CallbackInfo& info )
  : Napi::ObjectWrap<P4Node>( info )
  , api( new P4JsClientApi() )
{
    keepAlive = new P4JsKeepAlive( KeepAliveCb, this );
    api->SetKeepAlive( keepAlive );
}

P4Node::~P4Node()
{
    ClearProgress();
    if( api )
    {
        api->SetKeepAlive( nullptr );
        api->SetProgress( nullptr );
    }
    delete keepAlive;
    keepAlive = nullptr;
}

void P4Node::ThrowIfBusy() const
{
    ThrowIfBusy( "operation" );
}

void P4Node::ThrowIfBusy( const char* operation ) const
{
    if( busy.load() )
    {
        throw Napi::Error::New(
            Env(), std::string( "p4js: cannot " ) + operation +
                   " while another Perforce operation is in progress" );
    }
}

Napi::Value P4Node::GetProp( const Napi::CallbackInfo& info )
{
    Napi::Env env = info.Env();
    const std::string name = ToString( info[0] );
    P4JsClientApi* p4 = api.get();

    if( name == "connected" )
        return Napi::Boolean::New( env, p4->Connected() != 0 );
    if( name == "configFile" || name == "p4config_file" )
        return Napi::String::New( env, p4->GetConfig().Text() );
    if( name == "envinroFile" )
    {
        const StrPtr* value = p4->GetEnviroFile();
        return value ? Napi::String::New( env, value->Text() ) : env.Undefined();
    }
    if( name == "port" )
        return Napi::String::New( env, p4->GetPort().Text() );
    if( name == "user" )
        return Napi::String::New( env, p4->GetUser().Text() );
    if( name == "client" )
        return Napi::String::New( env, p4->GetClient().Text() );
    if( name == "password" )
        return Napi::String::New( env, p4->GetPassword().Text() );
    if( name == "charset" )
        return Napi::String::New( env, p4->GetCharset().Text() );
    if( name == "cwd" )
        return Napi::String::New( env, p4->GetCwd().Text() );
    if( name == "host" )
        return Napi::String::New( env, p4->GetHost().Text() );
    if( name == "ticketFile" )
        return Napi::String::New( env, p4->GetTicketFile().Text() );
    if( name == "trustFile" )
        return Napi::String::New( env, p4->GetTrustFile().Text() );
    if( name == "ignoreFile" )
        return Napi::String::New( env, p4->GetIgnoreFile().Text() );
    if( name == "language" )
        return Napi::String::New( env, p4->GetLanguage().Text() );
    if( name == "prog" )
        return Napi::String::New( env, p4->GetProg().Text() );
    if( name == "version" )
        return Napi::String::New( env, p4->GetVersion().Text() );
    if( name == "apiLevel" )
        return Napi::Number::New( env, p4->GetApiLevel() );
    if( name == "streams" )
        return Napi::Boolean::New( env, p4->IsStreams() != 0 );
    if( name == "tagged" )
        return Napi::Boolean::New( env, p4->IsTagged() != 0 );
    if( name == "track" )
        return Napi::Boolean::New( env, p4->GetTrack() != 0 );
    if( name == "graph" )
        return Napi::Boolean::New( env, p4->IsGraph() != 0 );
    if( name == "debug" )
        return Napi::Number::New( env, p4->GetDebug() );
    if( name == "maxResults" )
        return Napi::Number::New( env, p4->GetMaxResults() );
    if( name == "maxScanRows" )
        return Napi::Number::New( env, p4->GetMaxScanRows() );
    if( name == "maxLockTime" )
        return Napi::Number::New( env, p4->GetMaxLockTime() );

    return env.Undefined();
}

void P4Node::SetProp( const Napi::CallbackInfo& info )
{
    ThrowIfBusy( "change configuration" );
    const std::string name = ToString( info[0] );
    Napi::Value value = info[1];
    P4JsClientApi* p4 = api.get();

    if( value.IsNull() || value.IsUndefined() )
        return;

    const std::string text = ToString( value );
    const int number = value.IsNumber() ? value.As<Napi::Number>().Int32Value() : 0;
    const bool truth = value.IsBoolean() ? value.As<Napi::Boolean>().Value() : number != 0;

    if( name == "port" ) p4->SetPort( text.c_str() );
    else if( name == "user" ) p4->SetUser( text.c_str() );
    else if( name == "client" ) p4->SetClient( text.c_str() );
    else if( name == "password" ) p4->SetPassword( text.c_str() );
    else if( name == "cwd" ) p4->SetCwd( text.c_str() );
    else if( name == "host" ) p4->SetHost( text.c_str() );
    else if( name == "ticketFile" ) p4->SetTicketFile( text.c_str() );
    else if( name == "trustFile" ) p4->SetTrustFile( text.c_str() );
    else if( name == "ignoreFile" ) p4->SetIgnoreFile( text.c_str() );
    else if( name == "language" ) p4->SetLanguage( text.c_str() );
    else if( name == "prog" ) p4->SetProg( text.c_str() );
    else if( name == "version" ) p4->SetVersion( text.c_str() );
    else if( name == "envinroFile" ) p4->SetEnviroFile( text.c_str() );
    else if( name == "apiLevel" ) p4->SetApiLevel( number );
    else if( name == "streams" ) p4->SetStreams( truth ? 1 : 0 );
    else if( name == "tagged" ) p4->Tagged( truth ? 1 : 0 );
    else if( name == "graph" ) p4->SetGraph( truth ? 1 : 0 );
    else if( name == "debug" ) p4->SetDebug( number );
    else if( name == "maxResults" ) p4->SetMaxResults( number );
    else if( name == "maxScanRows" ) p4->SetMaxScanRows( number );
    else if( name == "maxLockTime" ) p4->SetMaxLockTime( number );
    else if( name == "charset" )
    {
        Error error;
        p4->SetCharset( text.c_str(), &error );
        if( error.Test() )
            throw Napi::Error::New( info.Env(), FormatError( &error ) );
    }
    else if( name == "track" )
    {
        Error error;
        p4->SetTrack( truth ? 1 : 0, &error );
        if( error.Test() )
            throw Napi::Error::New( info.Env(), FormatError( &error ) );
    }
}

Napi::Value P4Node::Connect( const Napi::CallbackInfo& info )
{
    ThrowIfBusy( "connect" );
    SetBusy( true );
    SetCancelled( false );
    Napi::ObjectReference ref = Napi::Persistent( info.This().As<Napi::Object>() );
    auto* worker = new ConnectWorker( info.Env(), this, std::move( ref ) );
    Napi::Promise promise = worker->Promise();
    worker->Queue();
    return promise;
}

Napi::Value P4Node::Disconnect( const Napi::CallbackInfo& info )
{
    ThrowIfBusy( "disconnect" );
    SetBusy( true );
    SetCancelled( false );
    Napi::ObjectReference ref = Napi::Persistent( info.This().As<Napi::Object>() );
    auto* worker = new DisconnectWorker( info.Env(), this, std::move( ref ) );
    Napi::Promise promise = worker->Promise();
    worker->Queue();
    return promise;
}

Napi::Value P4Node::Run( const Napi::CallbackInfo& info )
{
    Napi::Env env = info.Env();
    ThrowIfBusy( "run" );

    if( info.Length() < 1 || !info[0].IsArray() )
        throw Napi::TypeError::New( env, "p4js: run(args, inputs?) expects an array" );

    Napi::Array array = info[0].As<Napi::Array>();
    if( array.Length() == 0 )
        throw Napi::TypeError::New( env, "p4js: run() requires a command" );

    std::string command;
    std::vector<std::string> args;
    for( uint32_t i = 0; i < array.Length(); i++ )
    {
        Napi::Value value = array.Get( i );
        std::string text = value.IsString() ? value.As<Napi::String>().Utf8Value()
                                            : value.ToString().Utf8Value();
        if( i == 0 )
            command = text;
        else
            args.push_back( text );
    }

    std::vector<InputItem> inputs;
    if( info.Length() > 1 && info[1].IsArray() )
    {
        Napi::Array inputArray = info[1].As<Napi::Array>();
        for( uint32_t i = 0; i < inputArray.Length(); i++ )
        {
            Napi::Value value = inputArray.Get( i );
            if( value.IsBuffer() )
            {
                Napi::Buffer<char> buffer = value.As<Napi::Buffer<char>>();
                inputs.push_back( { true, std::string( buffer.Data(), buffer.Length() ) } );
            }
            else if( value.IsString() )
            {
                inputs.push_back( { false, value.As<Napi::String>().Utf8Value() } );
            }
        }
    }

    SetBusy( true );
    SetCancelled( false );
    Napi::ObjectReference ref = Napi::Persistent( info.This().As<Napi::Object>() );
    auto* worker = new RunWorker( env, this, std::move( ref ), std::move( command ),
                                  std::move( args ), std::move( inputs ) );
    Napi::Promise promise = worker->Promise();
    worker->Queue();
    return promise;
}

Napi::Value P4Node::ServerLevel( const Napi::CallbackInfo& info )
{
    ThrowIfBusy( "query server level" );
    SetBusy( true );
    SetCancelled( false );
    Napi::ObjectReference ref = Napi::Persistent( info.This().As<Napi::Object>() );
    auto* worker = new ServerInfoWorker( info.Env(), this, std::move( ref ),
                                         ServerInfoKind::Level );
    Napi::Promise promise = worker->Promise();
    worker->Queue();
    return promise;
}

Napi::Value P4Node::ServerUnicode( const Napi::CallbackInfo& info )
{
    ThrowIfBusy( "query server unicode" );
    SetBusy( true );
    SetCancelled( false );
    Napi::ObjectReference ref = Napi::Persistent( info.This().As<Napi::Object>() );
    auto* worker = new ServerInfoWorker( info.Env(), this, std::move( ref ),
                                         ServerInfoKind::Unicode );
    Napi::Promise promise = worker->Promise();
    worker->Queue();
    return promise;
}

Napi::Value P4Node::ServerCaseInsensitive( const Napi::CallbackInfo& info )
{
    ThrowIfBusy( "query server case sensitivity" );
    SetBusy( true );
    SetCancelled( false );
    Napi::ObjectReference ref = Napi::Persistent( info.This().As<Napi::Object>() );
    auto* worker = new ServerInfoWorker( info.Env(), this, std::move( ref ),
                                         ServerInfoKind::CaseSensitive );
    Napi::Promise promise = worker->Promise();
    worker->Queue();
    return promise;
}

Napi::Value P4Node::ParseSpec( const Napi::CallbackInfo& info )
{
    Napi::Env env = info.Env();
    ThrowIfBusy( "parse spec" );
    const std::string type = ToString( info[0] );
    const std::string form = ToString( info[1] );
    Error error;
    P4JsSpecData* spec = api->ParseSpec( type.c_str(), form.c_str(), &error );
    if( error.Test() || !spec )
    {
        delete spec;
        throw Napi::Error::New( env, FormatError( &error ) );
    }
    Napi::Object result = SpecDataToJs( env, spec );
    delete spec;
    return result;
}

Napi::Value P4Node::FormatSpec( const Napi::CallbackInfo& info )
{
    Napi::Env env = info.Env();
    ThrowIfBusy( "format spec" );
    const std::string type = ToString( info[0] );
    if( info.Length() < 2 || !info[1].IsObject() )
        throw Napi::TypeError::New( env, "p4js: formatSpec(type, spec) expects an object" );

    StrBufDict dict;
    JsObjectToStrDict( env, info[1].As<Napi::Object>(), &dict );
    Error error;
    char* form = api->FormatSpec( type.c_str(), &dict, &error );
    if( !form )
        throw Napi::Error::New( env, FormatError( &error ) );
    Napi::String result = Napi::String::New( env, form );
    free( form );
    return result;
}

Napi::Value P4Node::IsIgnored( const Napi::CallbackInfo& info )
{
    ThrowIfBusy( "check ignored" );
    const std::string path = ToString( info[0] );
    return Napi::Boolean::New( info.Env(), api->IsIgnored( path.c_str() ) != 0 );
}

Napi::Value P4Node::GetEnvValue( const Napi::CallbackInfo& info )
{
    const std::string name = ToString( info[0] );
    const char* value = api->GetEnv( name.c_str() );
    return value ? Napi::String::New( info.Env(), value ) : info.Env().Undefined();
}

void P4Node::SetEnv( const Napi::CallbackInfo& info )
{
    ThrowIfBusy( "set environment" );
    const std::string name = ToString( info[0] );
    std::string value;
    const char* valuePtr = nullptr;
    if( info.Length() > 1 && !info[1].IsNull() && !info[1].IsUndefined() )
    {
        value = ToString( info[1] );
        valuePtr = value.c_str();
    }
    Error error;
    api->SetEnv( name.c_str(), valuePtr, &error );
    if( error.Test() )
        throw Napi::Error::New( info.Env(), FormatError( &error ) );
}

Napi::Value P4Node::Protocol( const Napi::CallbackInfo& info )
{
    const std::string name = ToString( info[0] );
    const StrPtr* value = api->GetProtocol( name.c_str() );
    return value ? Napi::String::New( info.Env(), value->Text() ) : info.Env().Undefined();
}

void P4Node::SetProtocol( const Napi::CallbackInfo& info )
{
    ThrowIfBusy( "set protocol" );
    const std::string name = ToString( info[0] );
    const std::string value = ToString( info[1] );
    api->SetProtocol( name.c_str(), value.c_str() );
}

void P4Node::EmitProgress( int kind, int type, const char* description, int units,
                           long total, long position, int fail )
{
    if( !hasProgressTsfn )
        return;

    auto* event = new ProgressEvent;
    event->kind = kind;
    event->type = type;
    event->description = description ? description : "";
    event->units = units;
    event->total = total;
    event->position = position;
    event->fail = fail;

    napi_status status;
    {
        // The callback runs on the main thread and will need this mutex, so
        // do not hold it while enqueueing the event.
        std::unique_lock<std::mutex> lock( event->mutex );
        status = progressTsfn.BlockingCall(
            event, []( Napi::Env env, Napi::Function callback, ProgressEvent* data ) {
                if( env != nullptr )
                {
                    Napi::HandleScope scope( env );
                    try
                    {
                        Napi::Value target = callback.Get( "__p4jsProgress" );
                        if( target.IsObject() )
                        {
                            Napi::Object object = target.As<Napi::Object>();
                            auto call = [&object, env]( const char* name,
                                                        std::vector<napi_value> args ) {
                                Napi::Value method = object.Get( name );
                                if( method.IsFunction() )
                                    method.As<Napi::Function>().Call( object, args );
                            };

                            switch( data->kind )
                            {
                            case 0:
                                call( "init", { Napi::Number::New( env, data->type ) } );
                                break;
                            case 1:
                                call( "setDescription",
                                      { Napi::String::New( env, data->description ),
                                        Napi::Number::New( env, data->units ) } );
                                break;
                            case 2:
                                call( "setTotal",
                                      { Napi::Number::New( env, (double)data->total ) } );
                                break;
                            case 3:
                                call( "update",
                                      { Napi::Number::New( env, (double)data->position ) } );
                                break;
                            case 4:
                                call( "done",
                                      { Napi::Boolean::New( env, data->fail != 0 ) } );
                                break;
                            }
                        }
                    }
                    catch( ... )
                    {
                        // Progress handlers must never break the command.
                    }
                }

                {
                    std::lock_guard<std::mutex> guard( data->mutex );
                    data->delivered = true;
                }
                data->deliveredCv.notify_all();
            } );
    }

    if( status != napi_ok )
    {
        delete event;
        return;
    }

    // Wait until the main thread has actually run the handler.  This keeps
    // progress ordering deterministic with respect to run() resolving.
    {
        std::unique_lock<std::mutex> lock( event->mutex );
        event->deliveredCv.wait( lock, [event] { return event->delivered; } );
    }
    delete event;
}

void P4Node::ClearProgress()
{
    if( api )
        api->SetProgress( nullptr );
    delete progress;
    progress = nullptr;
    if( hasProgressTsfn )
    {
        progressTsfn.Release();
        hasProgressTsfn = false;
    }
    progressObject.Reset();
}

void P4Node::SetProgress( const Napi::CallbackInfo& info )
{
    Napi::Env env = info.Env();
    ThrowIfBusy( "change progress handler" );

    ClearProgress();

    if( info.Length() == 0 || info[0].IsNull() || info[0].IsUndefined() )
        return;

    if( !info[0].IsObject() )
        throw Napi::TypeError::New( env, "p4js: setProgress expects an object or null" );

    Napi::Object object = info[0].As<Napi::Object>();
    progressObject = Napi::Persistent( object );

    Napi::Function dispatcher = Napi::Function::New(
        env, []( const Napi::CallbackInfo& callbackInfo ) {
            return callbackInfo.Env().Undefined();
        } );
    dispatcher.Set( "__p4jsProgress", object );

    progressTsfn = Napi::ThreadSafeFunction::New(
        env, dispatcher, "p4js-progress", 0, 1 );
    hasProgressTsfn = true;

    progress = new P4JsProgress( ProgressInitCb, ProgressDescriptionCb,
                                 ProgressTotalCb, ProgressUpdateCb,
                                 ProgressDoneCb, this );
    api->SetProgress( progress );
}

void P4Node::Cancel( const Napi::CallbackInfo& info )
{
    SetCancelled( true );
}
