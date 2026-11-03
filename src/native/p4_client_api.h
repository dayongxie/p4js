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

#include "p4_client_user.h"
#include "p4_spec_mgr.h"

class Enviro;
class P4JsResults;
class P4JsSpecData;

class P4JsClientApi
{
  public:
    P4JsClientApi();
    ~P4JsClientApi();

    // Tagged mode - can be enabled/disabled on a per-command basis
    void Tagged( int enable );

    int IsTagged() { return IsTag(); }

    // Set track mode - track usage of this command on the server
    int SetTrack( int enable, Error* e );

    int GetTrack() { return IsTrackMode() != 0; }

    // Set streams mode
    void SetStreams( int enable );

    int IsStreams() { return IsStreamsMode() != 0; };

    // Set graph mode
    void SetGraph( int enable );

    int IsGraph() { return IsGraphMode() != 0; };

    // Returns bool, but may raise exception
    int SetCharset( const char* c, Error* e );

    // Set API level for backwards compatibility
    void SetApiLevel( int level );

    void SetClient( const char* c ) { client.SetClient( c ); }

    void SetCwd( const char* c );
    void SetEnviroFile( const char* c );
    void SetEVar( const char* var, const char* val );

    void SetHost( const char* h ) { client.SetHost( h ); }

    void SetIgnoreFile( const char* f ) { client.SetIgnoreFile( f ); }

    void SetMaxResults( int v ) { maxResults = v; }

    void SetMaxScanRows( int v ) { maxScanRows = v; }

    void SetMaxLockTime( int v ) { maxLockTime = v; }

    int SetEnv( const char* var, const char* val, Error* e );

    void SetLanguage( const char* l ) { client.SetLanguage( l ); }

    void SetPassword( const char* p ) { client.SetPassword( p ); }

    void SetPort( const char* p ) { client.SetPort( p ); }

    void SetProg( const char* p ) { prog = p; }

    void SetProtocol( const char* var, const char* val );
    const StrPtr* GetProtocol( const char* var ) { return client.GetProtocol( var ); }
    void SetVar( const char* var, const char* val );
    void SetTicketFile( const char* p );
    void SetTrustFile( const char* p );

    void SetUser( const char* u ) { client.SetUser( u ); }

    void SetVersion( const char* v ) { version = v; }

    void SetArrayConversion( int i );

    int GetApiLevel() { return apiLevel; }

    const StrPtr& GetBuild() { return client.GetBuild(); }

    const StrPtr& GetCharset() { return client.GetCharset(); }

    const StrPtr& GetClient() { return client.GetClient(); }

    const StrPtr& GetConfig() { return client.GetConfig(); }

    const StrPtr& GetCwd() { return client.GetCwd(); }

    const char* GetEnv( const char* v );
    const StrPtr* GetEnviroFile();
    const StrPtr* GetEVar( const char* v );

    const StrPtr& GetHost() { return client.GetHost(); }

    const StrPtr& GetIgnoreFile() { return client.GetIgnoreFile(); }

    const StrPtr& GetLanguage() { return client.GetLanguage(); }

    const StrPtr& GetPassword() { return client.GetPassword(); }

    const StrPtr& GetPort() { return client.GetPort(); }

    const StrPtr& GetProg() { return prog; }

    const StrPtr& GetTicketFile();

    const StrPtr& GetTrustFile();

    const StrPtr& GetUser() { return client.GetUser(); }

    const StrPtr& GetVersion() { return version; }

    int IsIgnored( const char* path );

    int GetMaxResults() { return maxResults; }

    int GetMaxScanRows() { return maxScanRows; }

    int GetMaxLockTime() { return maxLockTime; }

    int GetServerLevel(Error* e);
    int ServerCaseSensitive(Error* e);
    int ServerUnicode(Error* e);


    // Session management
    int Connect( Error *e );
    int Connected(); // Return true if connected and not dropped.
    int Disconnect( Error *e );

    // Executing commands.
    P4JsResults* Run( const char* cmd, int argc, char* const* argv, Error* e );

    void ResetInput() { ui.ResetInput(); }

    void AppendInput( char* input ) { ui.AppendInput( input ); }

    void AppendInputBytes( const char* input, unsigned int length )
    {
        ui.AppendInputBytes( input, length );
    }

    // Result handling
    P4JsResults* GetResults() { return ui.GetResults(); }

    // Spec parsing
    P4JsSpecData* ParseSpec( const char* type, const char* form, Error* e );
    char* FormatSpec( const char* type, P4JsSpecData* spec, Error* e );
    char* FormatSpec( const char* type, StrDict* dict, Error* e );
    StrDict* SpecFields( const char* type, Error* e );

    // Exception levels:
    //
    // 		0 - No exceptions raised
    // 		1 - Exceptions raised for errors
    // 		2 - Exceptions raised for errors and warnings
    //
    void ExceptionLevel( int i ) { exceptionLevel = i; }

    int ExceptionLevel() { return exceptionLevel; }

    //
    // Debugging support. Debug levels are:
    //
    //     1:	Debugs commands being executed
    //     2:	Debug UI method calls
    //     3:	Show garbage collection
    //
    int GetDebug() { return debug; }

    void SetDebug( int d );

    // 'p4 password' support; see P4JsClientUser::Prompt(Error*, ...)
    void SetDiscardUnusedOldPasswordSlot( int d )
    {
        ui.SetDiscardUnusedOldPasswordSlot( d != 0 );
    }

    // Handler support

    void SetHandler( P4JsHandler* handler )
    {
        ui.SetHandler( handler );
        UpdateBreak();
    }

    P4JsHandler* GetHandler() { return ui.GetHandler(); }

    //	Progress API support
    void SetProgress( P4JsProgress* progress ) { ui.SetProgress( progress ); }

    P4JsProgress* GetProgress() { return ui.GetProgress(); }

    void SetKeepAlive( P4JsKeepAlive* k )
    {
        ui.SetKeepAlive( k );
        UpdateBreak();
    }

    void SetSSOHandler( P4JsSSOHandler* handler )
    {
        ui.SetSSOHandler( handler );
    }

    P4JsSSOHandler* GetSSOHandler() { return ui.GetSSOHandler(); }

    void SetResolveHandler( P4JsResolveHandler* handler )
    {
        ui.SetResolveHandler( handler );
    }

    P4JsResolveHandler* GetResolveHandler() { return ui.GetResolveHandler(); }

    // FileSysBuffer support
    void SetFileBuffer( P4JsFileSysBuffer* buffer )
    {
        ui.SetFileBuffer( buffer );
    }

    P4JsFileSysBuffer* GetFileBuffer() { return ui.GetFileBuffer(); }


  private:
    void RunCmd( const char* cmd, ClientUser* ui, int argc, char* const* argv );

    int ConnectOrReconnect( Error *e ); // internal connect method

    enum
    {
        S_TAGGED = 0x0001,
        S_CONNECTED = 0x0002,
        S_CMDRUN = 0x0004,
        S_UNICODE = 0x0008,
        S_CASEFOLDING = 0x0010,
        S_TRACK = 0x0020,
        S_STREAMS = 0x0040,
        S_GRAPH = 0x0080,

        S_INITIAL_STATE =
          0x00C1, // Streams, Graph, and Tagged enabled by default
        S_RESET_MASK = 0x001E,
    };

    void InitFlags() { flags = S_INITIAL_STATE; }

    void ResetFlags() { flags &= ~S_RESET_MASK; }

    void SetTag() { flags |= S_TAGGED; }

    void ClearTag() { flags &= ~S_TAGGED; }

    int IsTag() { return flags & S_TAGGED; }

    void SetConnected() { flags |= S_CONNECTED; }

    void ClearConnected() { flags &= ~S_CONNECTED; }

    int IsConnected() { return flags & S_CONNECTED; }

    void UpdateBreak()
    {
        if( IsConnected() )
            client.SetBreak( ui.GetHandler() || ui.GetKeepAlive() ? &ui : 0 );
    }

    void SetCmdRun() { flags |= S_CMDRUN; }

    void ClearCmdRun() { flags &= ~S_CMDRUN; }

    int IsCmdRun() { return flags & S_CMDRUN; }

    void SetUnicode() { flags |= S_UNICODE; }

    void ClearUnicode() { flags &= ~S_UNICODE; }

    int IsUnicode() { return flags & S_UNICODE; }

    void SetCaseFold() { flags |= S_CASEFOLDING; }

    void ClearCaseFold() { flags &= ~S_CASEFOLDING; }

    int IsCaseFold() { return flags & S_CASEFOLDING; }

    void SetTrackMode() { flags |= S_TRACK; }

    void ClearTrackMode() { flags &= ~S_TRACK; }

    int IsTrackMode() { return flags & S_TRACK; }

    void SetStreamsMode() { flags |= S_STREAMS; }

    void ClearStreamsMode() { flags &= ~S_STREAMS; }

    int IsStreamsMode() { return flags & S_STREAMS; }

    void SetGraphMode() { flags |= S_GRAPH; }

    void ClearGraphMode() { flags &= ~S_GRAPH; }

    int IsGraphMode() { return flags & S_GRAPH; }

  private:
    ClientApi client;
    P4JsClientUser ui;
    Enviro* enviro;
    P4JsSpecMgr specMgr;
    StrBuf prog;
    StrBuf version;
    StrBuf ticketFile;
    StrBuf trustFile;
    int depth;
    int debug;
    int exceptionLevel;
    int apiLevel;
    int server2;
    int flags;
    int maxResults;
    int maxScanRows;
    int maxLockTime;
};
