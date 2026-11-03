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

#include "p4js_p4.h"

#include "p4_spec_mgr.h"
#include "p4_spec_data.h"
#include "p4_results.h"

P4JsResults::P4JsResults()
{
    apiLevel = atoi( P4Tag::l_client );
    Reset();
}

P4JsResults::~P4JsResults()
{
    Reset();
}

void
P4JsResults::Reset()
{
    // Remove from the end to prevent moving
    for( int i = Count() - 1; i >= 0; i-- ) {
        Destroy( Get( i ) );
        Remove( i );
    }

    infoCount = 0;
    warnCount = 0;
    errorCount = 0;
    trackCount = 0;
    dictCount = 0;
    specCount = 0;
    stringCount = 0;
}

int
P4JsResults::Compare( const void* r1, const void* r2 ) const
{
    return 0; // don't sort?
}

void
P4JsResults::Destroy( void* r ) const
{
    // Delete the object if it belongs to us
    P4JsResult* res = (P4JsResult*)r;
    if( !res->taken ) {
        switch( res->type ) {
        case STRING:
        case BINARY:
        case TRACK:
            delete res->str;
            break;
        case DICT:
            delete res->dict;
            break;
        case ERROR:
            delete res->err;
            break;
        case SPEC:
            delete res->spec;
            break;
        }
        delete res;
    } else
        res->taken = 2;
}

//
// Direct output - not via a message of any kind. For example,
// binary output.
//
void
P4JsResults::AddOutput( Error* e )
{
    if( e->GetSeverity() == E_EMPTY )
        return;

    P4JsResult* r = new P4JsResult;
    r->type = ERROR;
    r->taken = 0;
    r->err = new Error;
    *r->err = *e;
    Put( r );

    if( e->GetSeverity() == E_INFO )
        infoCount++;
    else if( e->GetSeverity() == E_WARN )
        warnCount++;
    else
        errorCount++;
}

void
P4JsResults::AddOutput( StrPtr o, bool binary )
{
    P4JsResult* r = new P4JsResult;
    r->type = binary ? BINARY : STRING;
    r->taken = 0;
    r->str = new StrBuf;
    *r->str = o;
    Put( r );
    stringCount++;
}

void
P4JsResults::AddOutput( StrDict* d )
{
    P4JsResult* r = new P4JsResult;
    r->type = DICT;
    r->taken = 0;
    r->dict = d;
    Put( r );
    dictCount++;
}

void
P4JsResults::AddOutput( P4JsSpecData* s )
{
    P4JsResult* r = new P4JsResult;
    r->type = SPEC;
    r->taken = 0;
    r->spec = s;
    Put( r );
    specCount++;
}

void
P4JsResults::AddTrack( const char* t )
{
    P4JsResult* r = new P4JsResult;
    r->type = TRACK;
    r->taken = 0;
    r->str = new StrBuf;
    *r->str = t;
    Put( r );
    trackCount++;
}

void
P4JsResults::AddTrack( StrPtr t )
{
    P4JsResult* r = new P4JsResult;
    r->type = TRACK;
    r->taken = 0;
    r->str = new StrBuf;
    *r->str = t;
    Put( r );
    trackCount++;
}

void
P4JsResults::DeleteTrack()
{
    // Rollback any track lines
    for( int i = Count() - 1; i >= 0; i-- ) {
        P4JsResult* res = (P4JsResult*)Get( i );
        if( res->type != TRACK )
            return;
        Destroy( Get( i ) );
        Remove( i );
    }
}

int
P4JsResults::ErrorCount()
{
    return errorCount;
}

int
P4JsResults::WarningCount()
{
    return warnCount;
}

void
P4JsResults::FmtErrors( StrBuf& buf )
{
    // Fmt( "[Error]: ", errors, buf );
}

void
P4JsResults::FmtWarnings( StrBuf& buf )
{
    // Fmt( "[Warning]: ", warnings, buf );
}

void
P4JsResults::Fmt( const char* label, void* ary, StrBuf& buf )
{
    // ID		idJoin;
    // VALUE	s1;
    StrBuf csep;
    // VALUE	rsep;

    buf.Clear();
    // If the array is empty, then we just return
    if( !Count() )
        return;

    // This is the string we'll use to prefix each entry in the array
    csep << "\n\t" << label;

    buf << csep;

    return;
}

char*
P4JsResults::FmtMessage( Error* e )
{
    StrBuf t;
    e->Fmt( t, EF_PLAIN );
    char* s = (char*)malloc( t.Length() + 1 );
    memcpy( s, t.Text(), t.Length() + 1 );
    return s;
}
