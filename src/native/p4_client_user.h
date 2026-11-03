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
#include "p4_results.h"

class P4JsSpecMgr;
class P4JsSpecData;
class P4JsMergeData;
class P4JsResults;
class ClientProgress;

typedef void ( *cbInit_t )( void*, int );
typedef void ( *cbDesc_t )( void*, char*, int );
typedef void ( *cbTotal_t )( void*, long );
typedef void ( *cbUpdate_t )( void*, long );
typedef void ( *cbDone_t )( void*, int );

typedef int ( *cbHandleBin_t )( void*, char*, int );
typedef int ( *cbHandleMsg_t )( void*, Error* e );
typedef int ( *cbHandleStat_t )( void*, StrDict* d );
typedef int ( *cbHandleText_t )( void*, char* );
typedef int ( *cbHandleTrack_t )( void*, char* );
typedef int ( *cbHandleSpec_t )( void*, P4JsSpecData* );

class P4JsProgress
{
  public:
    P4JsProgress( cbInit_t cbInit,
                  cbDesc_t cbDesc,
                  cbTotal_t cbTotal,
                  cbUpdate_t cbUpdate,
                  cbDone_t cbDone,
                  void* context );
    void Init( int type );
    void Description( const StrPtr* d, int u );
    void Total( long t );
    void Update( long update );
    void Done( int f );

  private:
    cbInit_t cbInit;
    cbDesc_t cbDesc;
    cbTotal_t cbTotal;
    cbUpdate_t cbUpdate;
    cbDone_t cbDone;
    void* context;
};

typedef int ( *cbIsAlive_t )( void* );

class P4JsKeepAlive
{
  public:
    P4JsKeepAlive( cbIsAlive_t cbIsAlive, void* context );
    int IsAlive();

  private:
    cbIsAlive_t cbIsAlive;
    void* context;
};

class P4JsHandler
{
  public:
    P4JsHandler( cbHandleBin_t cbHandleBin,
                 cbHandleMsg_t cbHandleMsg,
                 cbHandleStat_t cbHandleStat,
                 cbHandleText_t cbHandleText,
                 cbHandleTrack_t cbHandleTrack,
                 cbHandleSpec_t cbHandleSpec,
                 void* context );
    int HandleBinary( StrPtr data );
    int HandleMessage( Error* e );
    int HandleStat( StrDict* d );
    int HandleText( StrPtr data );
    int HandleTrack( StrPtr data );
    int HandleSpec( P4JsSpecData* spec );

  private:
    cbHandleBin_t cbHandleBin;
    cbHandleMsg_t cbHandleMsg;
    cbHandleStat_t cbHandleStat;
    cbHandleText_t cbHandleText;
    cbHandleTrack_t cbHandleTrack;
    cbHandleSpec_t cbHandleSpec;
    void* context;
};

typedef int ( *cbSSOAuthorize_t )( void*, StrDict* d, int l, char** result );

class P4JsSSOHandler : public ClientSSO
{
  public:
    P4JsSSOHandler( cbSSOAuthorize_t cbSSOAuthorize, void* context );
    ClientSSOStatus Authorize( StrDict& vars, int maxLength, StrBuf& result );

  private:
    cbSSOAuthorize_t cbSSOAuthorize;
    void* context;
};

typedef int ( *cbResolve_t )( void*, P4JsMergeData* m );

class P4JsResolveHandler
{
  public:
    P4JsResolveHandler( cbResolve_t cbResolve, void* context );
    int Resolve( P4JsMergeData* m );

  private:
    cbResolve_t cbResolve;
    void* context;
};

typedef void ( *cbFbRelease_t )( void* );
typedef void ( *cbFbOpen_t )( void*, char *path, int mode, Error *e );
typedef void ( *cbFbWrite_t )( void*, char *buf, int len, Error *e );
typedef int ( *cbFbRead_t )( void*, char *buf, int len, Error *e );
typedef void ( *cbFbClose_t )( void*, Error *e );
typedef void ( *cbFbSeek_t )( void*, long long offset, Error* e );
typedef void ( *cbFbSizeHint_t )( void*, long long size );
class P4JsFileSysBuffer : public FileSysBuffer {
  public:
    P4JsFileSysBuffer( cbFbRelease_t cbFbRelease,
                       cbFbOpen_t cbFbOpen,
                       cbFbWrite_t cbFbWrite,
                       cbFbRead_t cbFbRead,
                       cbFbClose_t cbFbClose,
                       cbFbSeek_t cbFbSeek,
                       cbFbSizeHint_t cbFbSizeHint,
                       void* context );
    virtual void	Release();

    virtual void	Open( StrPtr *path, FileOpenMode mode, Error *e );
    virtual void	Write( const char *buf, int len, Error *e );
    virtual int	Read( char *buf, int len, Error *e );
    virtual void	Close( Error *e );

    virtual void	Seek( offL_t offset, Error* e );
    virtual void	SizeHint( offL_t size );

  private:
    cbFbRelease_t cbFbRelease;
    cbFbOpen_t cbFbOpen;
    cbFbWrite_t cbFbWrite;
    cbFbRead_t cbFbRead;
    cbFbClose_t cbFbClose;
    cbFbSeek_t cbFbSeek;
    cbFbSizeHint_t cbFbSizeHint;
    void* context;

};

class P4JsClientUser
  : public ClientUser
  , public KeepAlive
{
  public:
    P4JsClientUser( P4JsSpecMgr* s );
    virtual ~P4JsClientUser();

    // Client User methods overridden here
    void OutputInfo( char level, const char* data );
    void OutputText( const char* data, int length );
    void Message( Error* e );
    void OutputStat( StrDict* values );
    void OutputBinary( const char* data, int length );
    void HandleError( Error* e );
    void InputData( StrBuf* strbuf, Error* e );
    void Diff( FileSys* f1,
               FileSys* f2,
               int doPage,
               char* diffFlags,
               Error* e );
    void Prompt( const StrPtr& msg, StrBuf& rsp, int noEcho, Error* e );
    void Prompt( Error* err, StrBuf& rsp, int noEcho, Error* e );

    FileSys* File( FileSysType type );

    int Resolve( ClientMerge* m, Error* e );
    int Resolve( ClientResolveA* m, int preview, Error* e );

    ClientProgress* CreateProgress( int type );
    ClientProgress* CreateProgress( int type, P4INT64 total );
    int ProgressIndicator();

    void Finished();

    // Local methods

    void ResetInput();
    void AppendInput( char* input );
    void AppendInputBytes( const char* input, unsigned int length );

    void SetCommand( const char* c ) { cmd = c; }

    void SetApiLevel( int l );

    void SetTrack( bool t ) { track = t; }

    P4JsResults* GetResults() { return &results; }

    int ErrorCount();
    void Reset();

    // Debugging support
    void SetDebug( int d ) { debug = d; }

    // 'p4 password' support: see Prompt(Error*, ...) in p4jsclientuser.cpp.
    // One-shot per command; not cleared by Reset() so it survives from
    // being set (before Run()) through Reset() (inside Run()) to the
    // prompt it targets.
    void SetDiscardUnusedOldPasswordSlot( bool d )
    {
        discardUnusedOldPasswordSlot = d;
    }

    // Handler support
    void SetHandler( P4JsHandler* handler );

    P4JsHandler* GetHandler() { return handler; }

    //	Progress API support
    void SetProgress( P4JsProgress* p );

    P4JsProgress* GetProgress() { return progress; }

    void SetKeepAlive( P4JsKeepAlive* k ) { keepAlive = k; }
    P4JsKeepAlive* GetKeepAlive() { return keepAlive; }

    // SSO handler support
    void SetSSOHandler( P4JsSSOHandler* handler );
    P4JsSSOHandler* GetSSOHandler();

    // Resolve handler support
    void SetResolveHandler( P4JsResolveHandler* handler );
    P4JsResolveHandler* GetResolveHandler();

    // FileSysBuffer support
    void SetFileBuffer( P4JsFileSysBuffer* buffer );
    P4JsFileSysBuffer* GetFileBuffer() { return fileBuffer; }

    // override from KeepAlive
    virtual int IsAlive()
    {
        if( alive && keepAlive && !keepAlive->IsAlive() )
            alive = 0;
        return alive;
    }

  private:
    void* MkMergeInfo( ClientMerge* m, StrPtr& hint );
    void* MkActionMergeInfo( ClientResolveA* m, StrPtr& hint );
    void ProcessMessage( Error* e );
    void ProcessOutput( StrPtr data, bool binary );
    void ProcessOutput( StrDict* data );
    void ProcessOutput( P4JsSpecData* data );
    bool CallOutputMethod( StrPtr data, bool binary );
    bool CallOutputMethod( StrDict* data );
    bool CallOutputMethod( Error* e );
    bool CallOutputMethod( P4JsSpecData* e );

  private:
    StrBuf cmd;
    P4JsSpecMgr* specMgr;
    P4JsResults results;
    StrArray* input;
    P4JsResolveHandler* resolveHandler;
    P4JsHandler* handler;
    P4JsProgress* progress;
    P4JsKeepAlive* keepAlive;
    P4JsFileSysBuffer* fileBuffer;
    int debug;
    int apiLevel;
    int alive;
    bool track;
    bool oldPasswordPromptSeen;
    bool discardUnusedOldPasswordSlot;
};