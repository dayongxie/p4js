
/*******************************************************************************

Copyright (c) 2024, Perforce Software, Inc.  All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1.  Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.

2.  Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in the
    documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL PERFORCE SOFTWARE, INC. BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*******************************************************************************/

// Adapted for p4js from p4go (MIT/BSD-3), commit c16689a.
// See THIRD-PARTY-NOTICES.md and docs/upstream-notes.md.

#pragma once

#include "p4js_p4.h"

#ifndef P4JS_RESULTS_H
#define P4JS_RESULTS_H

class P4JsSpecData;

enum P4JsResultType
{
    STRING,
    BINARY,
    TRACK,
    DICT,
    ERROR,
    SPEC
};

struct P4JsResult
{
    P4JsResultType type;
    int taken;
    StrBuf* str;
    StrDict* dict;
    Error* err;
    P4JsSpecData* spec;
};

class P4JsResults : public VVarArray
{
  public:
    P4JsResults();
    ~P4JsResults();

    virtual int Compare( const void*, const void* ) const;
    virtual void Destroy( void* ) const;

    // Setting
    void AddOutput( Error* e );
    void AddOutput( StrPtr o , bool binary=false );
    void AddOutput( StrDict* d );
    void AddOutput( P4JsSpecData* d );
    void AddTrack( const char* t );
    void AddTrack( StrPtr t );
    void DeleteTrack();

    // Get errors/warnings as a formatted string
    void FmtErrors( StrBuf& buf );
    void FmtWarnings( StrBuf& buf );

    // Set API level for backwards compatibility
    void SetApiLevel( int l ) { apiLevel = l; }

    // Testing
    int ErrorCount();
    int WarningCount();

    // Clear previous results
    void Reset();

  private:
    void Fmt( const char* label, void* ary, StrBuf& buf );
    char* FmtMessage( Error* e );
    char* WrapMessage( Error* e );

    int infoCount;
    int warnCount;
    int errorCount;
    int trackCount;
    int dictCount;
    int specCount;
    int stringCount;

    int apiLevel;
};

#endif // P4JS_RESULTS_H
