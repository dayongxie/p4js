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

#include "p4_merge_data.h"
#include "p4_spec_mgr.h"
#include "p4_results.h"
#include "p4js_debug.h"
#include "p4_client_user.h"

P4JsMergeData::P4JsMergeData( ClientUser* ui, ClientMerge* m, void* info )
{
    this->debug = 0;
    this->actionmerger = 0;
    this->ui = ui;
    this->merger = m;
    this->hint = m->AutoResolve( CMF_FORCE );
    this->info = info;

    // Extract (forcibly) the paths from the RPC buffer.
    StrPtr* t;
    if( ( t = ui->varList->GetVar( "baseName" ) ) )
        base = t->Text();
    if( ( t = ui->varList->GetVar( "yourName" ) ) )
        yours = t->Text();
    if( ( t = ui->varList->GetVar( "theirName" ) ) )
        theirs = t->Text();
}

P4JsMergeData::P4JsMergeData( ClientUser* ui, ClientResolveA* m, void* info )
{
    this->debug = 0;
    this->merger = 0;
    this->ui = ui;
    this->hint = m->AutoResolve( CMF_FORCE );
    this->actionmerger = m;
    this->info = info;
}

char*
P4JsMergeData::GetYourName()
{
    if( merger && yours.Length() )
        return yours.Text();
    else
        return 0;
}

char*
P4JsMergeData::GetTheirName()
{
    if( merger && theirs.Length() )
        return theirs.Text();
    else
        return 0;
}

char*
P4JsMergeData::GetBaseName()
{
    if( merger && base.Length() )
        return base.Text();
    else
        return 0;
}

char*
P4JsMergeData::GetYourPath()
{
    if( merger && merger->GetYourFile() )
        return merger->GetYourFile()->Name();
    else
        return 0;
}

char*
P4JsMergeData::GetTheirPath()
{
    if( merger && merger->GetTheirFile() )
        return merger->GetTheirFile()->Name();
    else
        return 0;
}

char*
P4JsMergeData::GetBasePath()
{
    if( merger && merger->GetBaseFile() )
        return merger->GetBaseFile()->Name();
    else
        return 0;
}

char*
P4JsMergeData::GetResultPath()
{
    if( merger && merger->GetResultFile() )
        return merger->GetResultFile()->Name();
    else
        return 0;
}

int
P4JsMergeData::GetMergeHint()
{
    return hint;
}

int
P4JsMergeData::RunMergeTool()
{
    Error e;
    if( merger ) {
        ui->Merge( merger->GetBaseFile(),
                   merger->GetTheirFile(),
                   merger->GetYourFile(),
                   merger->GetResultFile(),
                   &e );

        if( e.Test() )
            return 0;
        return 1;
    }
    return 0;
}

int
P4JsMergeData::GetActionResolveStatus()
{
    return actionmerger ? 1 : 0;
}

int
P4JsMergeData::GetContentResolveStatus()
{
    return merger ? 1 : 0;
}

void*
P4JsMergeData::GetMergeInfo()
{
    return this->info;
}

const Error*
P4JsMergeData::GetMergeAction()
{
    //	If we don't have an actionMerger then return nil
    if( actionmerger ) {
        return &actionmerger->GetMergeAction();
    }
    return 0;
}

const Error*
P4JsMergeData::GetYoursAction()
{
    if( actionmerger ) {
        return &actionmerger->GetYoursAction();
    }
    return 0;
}

const Error*
P4JsMergeData::GetTheirAction()
{
    if( actionmerger ) {
        return &actionmerger->GetTheirAction();
    }
    return 0;
}

const Error*
P4JsMergeData::GetType()
{
    if( actionmerger ) {
        return &actionmerger->GetType();
    }
    return 0;
}

char*
P4JsMergeData::GetString()
{
    asStr.Clear();
    StrBuf buffer;

    if( actionmerger ) {
        asStr << "P4JsMergeData - Action\n";
        actionmerger->GetMergeAction().Fmt( &buffer, EF_INDENT );
        asStr << "\tmergeAction: " << buffer << "\n";
        buffer.Clear();

        actionmerger->GetTheirAction().Fmt( &buffer, EF_INDENT );
        asStr << "\ttheirAction: " << buffer << "\n";
        buffer.Clear();

        actionmerger->GetYoursAction().Fmt( &buffer, EF_INDENT );
        asStr << "\tyoursAction: " << buffer << "\n";
        buffer.Clear();

        actionmerger->GetType().Fmt( &buffer, EF_INDENT );
        asStr << "\ttype: " << buffer << "\n";
        buffer.Clear();

        asStr << "\thint: " << hint << "\n";
        return asStr.Text();
    } else {
        asStr << "P4JsMergeData - Content\n";
        if( yours.Length() )
            asStr << "yourName: " << yours << "\n";
        if( theirs.Length() )
            asStr << "thierName: " << theirs << "\n";
        if( base.Length() )
            asStr << "baseName: " << base << "\n";

        if( merger && merger->GetYourFile() )
            asStr << "\tyourFile: " << merger->GetYourFile()->Name() << "\n";
        if( merger && merger->GetTheirFile() )
            asStr << "\ttheirFile: " << merger->GetTheirFile()->Name() << "\n";
        if( merger && merger->GetBaseFile() )
            asStr << "\tbaseFile: " << merger->GetBaseFile()->Name() << "\n";

        return asStr.Text();
    }
    return 0;
}
