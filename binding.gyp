{
  "variables": {
    "p4api_root%": "<!(node -e \"console.log(require('path').resolve(process.env.P4API_ROOT || 'third_party/p4api'))\")",
    "p4ssl_root%": "<!(node -e \"console.log(require('path').resolve(process.env.P4SSL_ROOT || 'third_party/openssl'))\")",
    "p4ssl_lib_dir%": "<!(node -e \"const fs=require('fs'),path=require('path');const root=path.resolve(process.env.P4SSL_ROOT||'third_party/openssl');const candidates=[path.join(root,'lib','VC','x64','MD'),path.join(root,'lib','VC','x64'),path.join(root,'lib')];const found=candidates.find(d=>fs.existsSync(path.join(d,'libssl.lib'))||fs.existsSync(path.join(d,'libssl.dll.a')));console.log(found||candidates[2])\")"
  },
  "targets": [
    {
      "target_name": "p4js_native",
      "sources": [
        "src/native/addon.cc",
        "src/native/p4_client_api.cc",
        "src/native/p4_client_user.cc",
        "src/native/p4_results.cc",
        "src/native/p4_spec_mgr.cc",
        "src/native/p4_spec_data.cc",
        "src/native/p4_merge_data.cc",
        "src/native/p4_map.cc",
        "src/native/p4_map_node.cc",
        "src/native/convert.cc",
        "src/native/p4_node.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "<(p4api_root)/include",
        "<(p4ssl_root)/include"
      ],
      "defines": [
        "NAPI_CPP_EXCEPTIONS",
        "NAPI_VERSION=8"
      ],
      "conditions": [
        ["OS=='win'", {
          "defines": [
            "OS_NT",
            "MT",
            "_CRT_SECURE_NO_WARNINGS",
            "_CRT_NONSTDC_NO_DEPRECATE",
            "NOMINMAX"
          ],
          "libraries": [
            "<(p4api_root)/lib/libp4api.lib",
            "<(p4api_root)/lib/libclient.lib",
            "<(p4api_root)/lib/librpc.lib",
            "<(p4api_root)/lib/libp4script.lib",
            "<(p4api_root)/lib/libp4script_c.lib",
            "<(p4api_root)/lib/libp4script_curl.lib",
            "<(p4api_root)/lib/libp4script_sqlite.lib",
            "<(p4api_root)/lib/libsupp.lib",
            "<(p4ssl_lib_dir)/libssl.lib",
            "<(p4ssl_lib_dir)/libcrypto.lib",
            "ws2_32.lib",
            "wsock32.lib",
            "advapi32.lib",
            "bcrypt.lib",
            "iphlpapi.lib",
            "user32.lib",
            "gdi32.lib",
            "ole32.lib",
            "shell32.lib",
            "crypt32.lib",
            "oldnames.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "RuntimeLibrary": 0,
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/EHsc"]
            }
          }
        }],
        ["OS=='linux'", {
          "defines": ["CASE_INSENSITIVE"],
          "cflags_cc": ["-std=c++17", "-Wno-deprecated-declarations"],
          "libraries": [
            "-L<(p4api_root)/lib",
            "-lp4api",
            "-lclient",
            "-lrpc",
            "-lp4script",
            "-lp4script_c",
            "-lp4script_curl",
            "-lp4script_sqlite",
            "-lsupp",
            "-L<(p4ssl_root)/lib",
            "-lssl",
            "-lcrypto",
            "-lpthread",
            "-lrt"
          ]
        }],
        ["OS=='mac'", {
          "defines": ["CASE_INSENSITIVE"],
          "cflags_cc": ["-std=c++17", "-Wno-deprecated-declarations"],
          "libraries": [
            "-L<(p4api_root)/lib",
            "-lp4api",
            "-lclient",
            "-lrpc",
            "-lp4script",
            "-lp4script_c",
            "-lp4script_curl",
            "-lp4script_sqlite",
            "-lsupp",
            "-L<(p4ssl_root)/lib",
            "-lssl",
            "-lcrypto",
            "-framework",
            "ApplicationServices",
            "-framework",
            "Foundation",
            "-framework",
            "Security"
          ]
        }]
      ]
    }
  ]
}
