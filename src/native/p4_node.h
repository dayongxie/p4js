#pragma once

#include <napi.h>

#include <atomic>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include "p4js_p4.h"

class P4JsClientApi;
class P4JsKeepAlive;
class P4JsProgress;

struct ProgressEvent
{
    int kind;
    int type;
    std::string description;
    int units;
    long total;
    long position;
    int fail;
    std::mutex mutex;
    std::condition_variable deliveredCv;
    bool delivered = false;
};

class P4Node : public Napi::ObjectWrap<P4Node>
{
  public:
    static Napi::FunctionReference constructor;

    static void Init( Napi::Env env, Napi::Object exports );

    explicit P4Node( const Napi::CallbackInfo& info );
    ~P4Node() override;

    P4JsClientApi* Api() const { return api.get(); }
    P4JsKeepAlive* KeepAlive() const { return keepAlive; }

    bool IsBusy() const { return busy.load(); }
    void SetBusy( bool value ) { busy.store( value ); }

    bool IsCancelled() const { return cancelled.load(); }
    void SetCancelled( bool value ) { cancelled.store( value ); }

    void EmitProgress( int kind, int type, const char* description, int units,
                       long total, long position, int fail );
    void ClearProgress();

  private:
    Napi::Value GetProp( const Napi::CallbackInfo& info );
    void SetProp( const Napi::CallbackInfo& info );

    Napi::Value Connect( const Napi::CallbackInfo& info );
    Napi::Value Disconnect( const Napi::CallbackInfo& info );
    Napi::Value Run( const Napi::CallbackInfo& info );

    Napi::Value ServerLevel( const Napi::CallbackInfo& info );
    Napi::Value ServerUnicode( const Napi::CallbackInfo& info );
    Napi::Value ServerCaseInsensitive( const Napi::CallbackInfo& info );

    Napi::Value ParseSpec( const Napi::CallbackInfo& info );
    Napi::Value FormatSpec( const Napi::CallbackInfo& info );
    Napi::Value IsIgnored( const Napi::CallbackInfo& info );

    Napi::Value GetEnvValue( const Napi::CallbackInfo& info );
    void SetEnv( const Napi::CallbackInfo& info );
    Napi::Value Protocol( const Napi::CallbackInfo& info );
    void SetProtocol( const Napi::CallbackInfo& info );

    void SetProgress( const Napi::CallbackInfo& info );
    void Cancel( const Napi::CallbackInfo& info );

    void ThrowIfBusy() const;
    void ThrowIfBusy( const char* operation ) const;

  private:
    std::unique_ptr<P4JsClientApi> api;
    std::atomic<bool> busy{ false };
    std::atomic<bool> cancelled{ false };
    P4JsKeepAlive* keepAlive = nullptr;
    P4JsProgress* progress = nullptr;
    Napi::ThreadSafeFunction progressTsfn;
    bool hasProgressTsfn = false;
    Napi::ObjectReference progressObject;
};
