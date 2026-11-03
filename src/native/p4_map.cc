#include "p4_map.h"

#include <algorithm>

P4JsMap::P4JsMap()
{
    map = new MapApi();
}

P4JsMap::P4JsMap( MapApi* m )
{
    map = m ? m : new MapApi();
}

P4JsMap::~P4JsMap()
{
    delete map;
}

MapApi*
P4JsMap::Release()
{
    MapApi* result = map;
    map = new MapApi();
    return result;
}

void
P4JsMap::InsertLine( const std::string& line )
{
    std::string text = line;
    MapType type = MapInclude;
    const std::string::size_type first = text.find_first_not_of( " \t\r\n" );
    if( first == std::string::npos )
        return;
    text.erase( 0, first );
    if( !text.empty() && text[0] == '-' )
    {
        type = MapExclude;
        text.erase( 0, 1 );
    }

    const std::string::size_type split = text.find_first_of( " \t" );
    if( split == std::string::npos )
    {
        StrRef ref( (char*)text.c_str() );
        map->Insert( ref, type );
        return;
    }

    std::string lhs = text.substr( 0, split );
    std::string rhs = text.substr( split + 1 );
    const std::string::size_type rhsStart = rhs.find_first_not_of( " \t" );
    if( rhsStart == std::string::npos )
        rhs.clear();
    else
        rhs.erase( 0, rhsStart );

    StrRef l( (char*)lhs.c_str() );
    StrRef r( (char*)rhs.c_str() );
    map->Insert( l, r, type );
}

void
P4JsMap::Insert( const std::string& lhs, const std::string& rhs )
{
    StrRef l( (char*)lhs.c_str() );
    StrRef r( (char*)rhs.c_str() );
    map->Insert( l, r );
}

std::string
P4JsMap::Translate( const std::string& input, int direction ) const
{
    StrRef from( (char*)input.c_str() );
    StrBuf to;
    map->Translate( from, to, direction == 0 ? MapLeftRight : MapRightLeft );
    return std::string( to.Text(), to.Length() );
}

std::vector<std::string>
P4JsMap::TranslateArray( const std::string& input, int direction ) const
{
    StrRef from( (char*)input.c_str() );
    StrArray to;
    map->Translate( from, to, direction == 0 ? MapLeftRight : MapRightLeft );

    std::vector<std::string> result;
    for( int i = 0; i < to.Count(); i++ )
    {
        const StrBuf* item = to.Get( i );
        if( item )
            result.push_back( std::string( item->Text(), item->Length() ) );
    }
    return result;
}

int
P4JsMap::Count() const
{
    return map->Count();
}

void
P4JsMap::Reverse()
{
    MapApi* reversed = new MapApi();
    for( int i = 0; i < map->Count(); i++ )
    {
        const StrPtr* l = map->GetLeft( i );
        const StrPtr* r = map->GetRight( i );
        if( l && r )
            reversed->Insert( *r, *l, map->GetType( i ) );
    }
    delete map;
    map = reversed;
}

void
P4JsMap::Clear()
{
    map->Clear();
}

std::string
P4JsMap::AsString() const
{
    std::string result;
    for( int i = 0; i < map->Count(); i++ )
    {
        const StrPtr* l = map->GetLeft( i );
        const StrPtr* r = map->GetRight( i );
        if( !l || !r )
            continue;
        if( !result.empty() )
            result += "\n";
        if( map->GetType( i ) == MapExclude )
            result += "-";
        result.append( l->Text(), l->Length() );
        result += " ";
        result.append( r->Text(), r->Length() );
    }
    return result;
}

std::vector<std::string>
P4JsMap::AsArray() const
{
    std::vector<std::string> result;
    for( int i = 0; i < map->Count(); i++ )
    {
        const StrPtr* l = map->GetLeft( i );
        const StrPtr* r = map->GetRight( i );
        if( !l || !r )
            continue;
        std::string line = map->GetType( i ) == MapExclude ? "-" : "";
        line.append( l->Text(), l->Length() );
        line += " ";
        line.append( r->Text(), r->Length() );
        result.push_back( line );
    }
    return result;
}

std::string
P4JsMap::Lhs( int index ) const
{
    const StrPtr* value = map->GetLeft( index );
    return value ? std::string( value->Text(), value->Length() ) : std::string();
}

std::string
P4JsMap::Rhs( int index ) const
{
    const StrPtr* value = map->GetRight( index );
    return value ? std::string( value->Text(), value->Length() ) : std::string();
}

int
P4JsMap::Type( int index ) const
{
    return (int)map->GetType( index );
}

P4JsMap*
P4JsMap::Join( const P4JsMap* other ) const
{
    return new P4JsMap( MapApi::Join( map, other->map ) );
}
