/*******************************************************************************

Copyright (c) 2025, Perforce Software, Inc.  All rights reserved.

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

#include "p4_spec_data.h"
#include <iostream>

using namespace std;

StrPtr *
P4JsSpecData::GetLine( SpecElem *sd, int x, const char **cmt )
{
    StrPtr *val = sd->IsList() ? dict->GetVar( sd->tag, x ) : dict->GetVar( sd->tag );
    if( !val ) return 0;

    last = *val;
    return &last;
}

void    
P4JsSpecData::SetLine( SpecElem *sd, int x, const StrPtr *v, Error *e )
{
    if( sd->IsList() )
        dict->SetVar( sd->tag, x, *v );
    else
        dict->SetVar( sd->tag, *v );
}

void
P4JsSpecData::Comment( SpecElem *sd, int x, const char **wv, int nl, Error *e )
{
    if( !sd->IsList() || !wv || !*wv )
        return;

    StrBuf commentTag;
    commentTag << sd->tag << "Comment";
    if( nl )
        dict->SetVar( commentTag, x, StrRef( (char*)*wv ) );
    else
    {
        StrPtr* prev = dict->GetVar( commentTag, x - 1 );
        if( prev )
        {
            StrBuf combined;
            combined << prev->Text() << " " << *wv;
            dict->SetVar( commentTag, x - 1, combined );
        }
    }
}
