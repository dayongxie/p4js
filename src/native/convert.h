#pragma once

#include <napi.h>

#include <string>
#include <vector>

#include "p4js_p4.h"

class P4JsResults;
class P4JsSpecData;

// Convert a Perforce StrDict into a JS object, grouping numbered keys
// (Field0, Field1, Field[0], ...) into arrays.
Napi::Object StrDictToJs( Napi::Env env, StrDict* dict );

// Convert a parsed spec into a JS object.
Napi::Object SpecDataToJs( Napi::Env env, P4JsSpecData* spec );

// Convert an Error object into a JS message object.
Napi::Object MessageToJs( Napi::Env env, Error* error );

// Format an Error as plain text.
std::string FormatError( Error* error );

// Build the { results, errors, warnings, messages, trackOutput } envelope.
Napi::Object BuildEnvelope( Napi::Env env, P4JsResults* results, Error* topError );

// Convert a JS object (P4Spec) into a StrDict suitable for Spec::Format.
void JsObjectToStrDict( Napi::Env env, Napi::Object object, StrDict* dict );
