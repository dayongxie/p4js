#pragma once

#include <string>
#include <vector>

#include "p4js_p4.h"

class P4JsMap
{
  public:
    P4JsMap();
    explicit P4JsMap( MapApi* map );
    ~P4JsMap();

    P4JsMap( const P4JsMap& ) = delete;
    P4JsMap& operator=( const P4JsMap& ) = delete;

    MapApi* GetMap() const { return map; }
    MapApi* Release();

    void InsertLine( const std::string& line );
    void Insert( const std::string& lhs, const std::string& rhs );
    std::string Translate( const std::string& input, int direction ) const;
    std::vector<std::string> TranslateArray( const std::string& input, int direction ) const;
    int Count() const;
    void Reverse();
    void Clear();
    std::string AsString() const;
    std::vector<std::string> AsArray() const;
    std::string Lhs( int index ) const;
    std::string Rhs( int index ) const;
    int Type( int index ) const;
    P4JsMap* Join( const P4JsMap* other ) const;

  private:
    MapApi* map;
};
