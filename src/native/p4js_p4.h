#pragma once

// Central include point for the Perforce C++ API headers.  Several P4 headers
// have no include guards, so they must only be pulled in once per translation
// unit.  Include this header before any p4js native header.

#include <p4/clientapi.h>
#include <p4/strops.h>
#include <p4/strtable.h>
#include <p4/vararray.h>
#include <p4/strarray.h>
#include <p4/i18napi.h>
#include <p4/enviro.h>
#include <p4/hostenv.h>
#include <p4/spec.h>
#include <p4/ignore.h>
#include <p4/debug.h>
#include <p4/clientprog.h>
#include <p4/charcvt.h>
#include <p4/diff.h>
#include <p4/mapapi.h>
