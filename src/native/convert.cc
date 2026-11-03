#include "convert.h"
#include "p4_results.h"
#include "p4_spec_data.h"

#include <map>
#include <set>
#include <sstream>

namespace {

bool IsSpecialKey( const std::string& key )
{
    return key == "specdef" || key == "func" || key == "specFormatted";
}

struct RawPair
{
    std::string key;
    std::string value;
};

// Split "Field[12]" or "Field12" into ("Field", 12).
bool SplitIndexedKey( const std::string& key, std::string& base, int& index )
{
    if( key.empty() )
        return false;

    const std::string::size_type bracket = key.rfind( '[' );
    if( bracket != std::string::npos && key.back() == ']' )
    {
        const std::string digits = key.substr( bracket + 1, key.size() - bracket - 2 );
        if( !digits.empty() &&
            digits.find_first_not_of( "0123456789" ) == std::string::npos )
        {
            base = key.substr( 0, bracket );
            index = std::atoi( digits.c_str() );
            return !base.empty();
        }
        return false;
    }

    std::string::size_type pos = key.size();
    while( pos > 0 && key[pos - 1] >= '0' && key[pos - 1] <= '9' )
        --pos;
    if( pos == 0 || pos == key.size() )
        return false;

    base = key.substr( 0, pos );
    index = std::atoi( key.c_str() + pos );
    return true;
}

void InsertScalar( Napi::Object& object, const std::string& key, const std::string& value )
{
    object.Set( key, Napi::String::New( object.Env(), value ) );
}

void InsertArray( Napi::Object& object, const std::string& base,
                  const std::map<int, std::string>& values )
{
    Napi::Array array = Napi::Array::New( object.Env(), values.size() );
    uint32_t slot = 0;
    for( const auto& entry : values )
        array.Set( slot++, Napi::String::New( object.Env(), entry.second ) );
    object.Set( base, array );
}

// Shared implementation for plain dicts and spec data.
Napi::Object DictToJs( Napi::Env env, StrDict* dict )
{
    Napi::Object object = Napi::Object::New( env );
    if( !dict )
        return object;

    std::vector<RawPair> raw;
    for( int i = 0;; i++ )
    {
        StrRef var;
        StrRef val;
        if( !dict->GetVar( i, var, val ) )
            break;
        const std::string key( var.Text(), var.Length() );
        if( IsSpecialKey( key ) )
            continue;
        raw.push_back( { key, std::string( val.Text(), val.Length() ) } );
    }

    std::map<std::string, std::string> rawScalars;
    for( const auto& pair : raw )
        rawScalars[pair.key] = pair.value;

    std::map<std::string, std::map<int, std::string>> arrays;
    std::map<std::string, std::string> scalars;

    for( const auto& pair : raw )
    {
        std::string base;
        int index = -1;
        if( SplitIndexedKey( pair.key, base, index ) )
        {
            const auto baseIt = rawScalars.find( base );
            // A numbered key is a real array element unless the base key is
            // also present with a non-empty scalar value.  This mirrors the
            // p4python collision behaviour for keys such as depotFile2.
            if( baseIt == rawScalars.end() || baseIt->second.empty() )
            {
                arrays[base][index] = pair.value;
                continue;
            }
        }
        scalars[pair.key] = pair.value;
    }

    for( const auto& entry : scalars )
    {
        // If a scalar and an array share a base name, p4python renames the
        // scalar (e.g. otherOpen -> otherOpens) to avoid losing it.
        if( arrays.find( entry.first ) != arrays.end() )
            InsertScalar( object, entry.first + "s", entry.second );
        else
            InsertScalar( object, entry.first, entry.second );
    }

    for( const auto& entry : arrays )
        InsertArray( object, entry.first, entry.second );

    return object;
}

std::string FormatErrorLine( Error* error, int index )
{
    StrBuf buf;
    if( index >= 0 )
        error->Fmt( index + 1, buf, 0 );
    else
        error->Fmt( &buf, EF_PLAIN );
    return std::string( buf.Text(), buf.Length() );
}

int ErrorSeverity( Error* error, int index )
{
    if( index >= 0 )
    {
        ErrorId* id = error->GetId( index );
        if( id )
            return id->Severity();
    }
    return error->GetSeverity();
}

int ErrorCode( Error* error, int index )
{
    if( index >= 0 )
    {
        ErrorId* id = error->GetId( index );
        if( id )
            return id->code;
    }
    ErrorId* id = error->GetId( 0 );
    return id ? id->code : 0;
}

Napi::Object MakeMessage( Napi::Env env, Error* error, int index,
                          const std::string& text )
{
    Napi::Object message = Napi::Object::New( env );
    message.Set( "severity", Napi::Number::New( env, ErrorSeverity( error, index ) ) );
    message.Set( "code", Napi::Number::New( env, ErrorCode( error, index ) ) );
    message.Set( "text", Napi::String::New( env, text ) );

    StrDict* args = error->GetDict();
    if( args )
    {
        Napi::Object argObject = Napi::Object::New( env );
        for( int i = 0;; i++ )
        {
            StrRef var;
            StrRef val;
            if( !args->GetVar( i, var, val ) )
                break;
            argObject.Set( std::string( var.Text(), var.Length() ),
                           std::string( val.Text(), val.Length() ) );
        }
        message.Set( "args", argObject );
    }
    return message;
}

void AddMessage( Napi::Env env, Error* error, int index,
                 const std::string& text,
                 Napi::Array& results, Napi::Array& errors, Napi::Array& warnings,
                 Napi::Array& messages, std::set<std::string>& seenErrors,
                 std::set<std::string>& seenWarnings )
{
    if( text.empty() )
        return;

    const int severity = ErrorSeverity( error, index );
    messages.Set( messages.Length(), MakeMessage( env, error, index, text ) );

    if( severity == E_EMPTY || severity == E_INFO )
    {
        Napi::Object item = Napi::Object::New( env );
        item.Set( "kind", Napi::String::New( env, "string" ) );
        item.Set( "value", Napi::String::New( env, text ) );
        results.Set( results.Length(), item );
        return;
    }

    if( severity == E_WARN )
    {
        if( seenWarnings.insert( text ).second )
            warnings.Set( warnings.Length(), Napi::String::New( env, text ) );
        return;
    }

    if( seenErrors.insert( text ).second )
        errors.Set( errors.Length(), Napi::String::New( env, text ) );
}

void AddError( Napi::Env env, Error* error, Napi::Array& results, Napi::Array& errors,
               Napi::Array& warnings, Napi::Array& messages,
               std::set<std::string>& seenErrors,
               std::set<std::string>& seenWarnings )
{
    if( !error || !error->Test() )
        return;

    const int count = error->GetErrorCount();
    if( count <= 0 )
    {
        AddMessage( env, error, -1, FormatErrorLine( error, -1 ), results, errors,
                    warnings, messages, seenErrors, seenWarnings );
        return;
    }

    for( int i = 0; i < count; i++ )
        AddMessage( env, error, i, FormatErrorLine( error, i ), results, errors,
                    warnings, messages, seenErrors, seenWarnings );
}

}  // namespace

Napi::Object StrDictToJs( Napi::Env env, StrDict* dict )
{
    return DictToJs( env, dict );
}

Napi::Object SpecDataToJs( Napi::Env env, P4JsSpecData* spec )
{
    return spec ? DictToJs( env, spec->GetDict() ) : Napi::Object::New( env );
}

Napi::Object MessageToJs( Napi::Env env, Error* error )
{
    return MakeMessage( env, error, -1, FormatErrorLine( error, -1 ) );
}

std::string FormatError( Error* error )
{
    return error ? FormatErrorLine( error, -1 ) : std::string();
}

Napi::Object BuildEnvelope( Napi::Env env, P4JsResults* results, Error* topError )
{
    Napi::Array jsResults = Napi::Array::New( env );
    Napi::Array errors = Napi::Array::New( env );
    Napi::Array warnings = Napi::Array::New( env );
    Napi::Array messages = Napi::Array::New( env );
    Napi::Array trackOutput = Napi::Array::New( env );

    std::set<std::string> seenErrors;
    std::set<std::string> seenWarnings;

    if( results )
    {
        for( int i = 0; i < results->Count(); i++ )
        {
            P4JsResult* result = static_cast<P4JsResult*>( results->Get( i ) );
            if( !result )
                continue;

            switch( result->type )
            {
            case STRING:
                {
                    Napi::Object item = Napi::Object::New( env );
                    item.Set( "kind", Napi::String::New( env, "string" ) );
                    item.Set( "value", Napi::String::New(
                        env, result->str ? result->str->Text() : "" ) );
                    jsResults.Set( jsResults.Length(), item );
                }
                break;

            case BINARY:
                {
                    Napi::Object item = Napi::Object::New( env );
                    item.Set( "kind", Napi::String::New( env, "binary" ) );
                    if( result->str )
                        item.Set( "value", Napi::Buffer<char>::Copy(
                            env, result->str->Text(), result->str->Length() ) );
                    else
                        item.Set( "value", Napi::Buffer<char>::New( env, 0 ) );
                    jsResults.Set( jsResults.Length(), item );
                }
                break;

            case TRACK:
                trackOutput.Set( trackOutput.Length(), Napi::String::New(
                    env, result->str ? result->str->Text() : "" ) );
                break;

            case DICT:
                {
                    Napi::Object item = Napi::Object::New( env );
                    item.Set( "kind", Napi::String::New( env, "dict" ) );
                    item.Set( "value", StrDictToJs( env, result->dict ) );
                    jsResults.Set( jsResults.Length(), item );
                }
                break;

            case SPEC:
                {
                    Napi::Object item = Napi::Object::New( env );
                    item.Set( "kind", Napi::String::New( env, "spec" ) );
                    item.Set( "value", SpecDataToJs( env, result->spec ) );
                    jsResults.Set( jsResults.Length(), item );
                }
                break;

            case ERROR:
                AddError( env, result->err, jsResults, errors, warnings, messages,
                          seenErrors, seenWarnings );
                break;
            }
        }
    }

    AddError( env, topError, jsResults, errors, warnings, messages, seenErrors,
              seenWarnings );

    Napi::Object envelope = Napi::Object::New( env );
    envelope.Set( "results", jsResults );
    envelope.Set( "errors", errors );
    envelope.Set( "warnings", warnings );
    envelope.Set( "messages", messages );
    envelope.Set( "trackOutput", trackOutput );
    return envelope;
}

void JsObjectToStrDict( Napi::Env env, Napi::Object object, StrDict* dict )
{
    Napi::Array keys = object.GetPropertyNames();
    for( uint32_t i = 0; i < keys.Length(); i++ )
    {
        Napi::Value keyValue = keys.Get( i );
        if( !keyValue.IsString() )
            continue;
        const std::string key = keyValue.As<Napi::String>().Utf8Value();
        Napi::Value value = object.Get( keyValue );

        if( value.IsArray() )
        {
            Napi::Array array = value.As<Napi::Array>();
            dict->SetVar( key.c_str(), "" );
            for( uint32_t j = 0; j < array.Length(); j++ )
            {
                Napi::Value item = array.Get( j );
                if( item.IsString() )
                {
                    const std::string text = item.As<Napi::String>().Utf8Value();
                    dict->SetVar( key.c_str(), (int)j, StrRef( (char*)text.c_str() ) );
                }
            }
            continue;
        }

        if( value.IsString() )
        {
            const std::string text = value.As<Napi::String>().Utf8Value();
            dict->SetVar( key.c_str(), text.c_str() );
        }
        else if( value.IsNumber() )
        {
            const std::string text = value.As<Napi::Number>().ToString().Utf8Value();
            dict->SetVar( key.c_str(), text.c_str() );
        }
        else if( value.IsBoolean() )
        {
            dict->SetVar( key.c_str(), value.As<Napi::Boolean>().Value() ? "true" : "false" );
        }
        else if( value.IsNull() || value.IsUndefined() )
        {
            dict->SetVar( key.c_str(), "" );
        }
    }
}
