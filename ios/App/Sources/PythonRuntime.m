#import "PythonRuntime.h"
#include <Python/Python.h>

@interface PythonRuntime ()
@property (nonatomic, assign) BOOL initialized;
@end

@implementation PythonRuntime

+ (instancetype)shared {
    static PythonRuntime *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[PythonRuntime alloc] init];
    });
    return instance;
}

static NSString *FormatPyError(NSString *fallback) {
    if (!PyErr_Occurred()) {
        return fallback;
    }
    PyObject *ptype = NULL, *pvalue = NULL, *ptraceback = NULL;
    PyErr_Fetch(&ptype, &pvalue, &ptraceback);
    PyErr_NormalizeException(&ptype, &pvalue, &ptraceback);
    NSString *msg = fallback;
    if (pvalue) {
        PyObject *strObj = PyObject_Str(pvalue);
        if (strObj) {
            const char *utf8 = PyUnicode_AsUTF8(strObj);
            if (utf8) {
                msg = [NSString stringWithUTF8String:utf8] ?: fallback;
            }
            Py_DECREF(strObj);
        }
    }
    Py_XDECREF(ptype);
    Py_XDECREF(pvalue);
    Py_XDECREF(ptraceback);
    return msg;
}

- (void)startServerWithDataDir:(NSString *)dataDir
                    appVersion:(NSString *)appVersion
                    completion:(void (^)(NSString * _Nullable,
                                         NSString * _Nullable,
                                         NSString * _Nullable))completion {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSString *resourcePath = [[NSBundle mainBundle] resourcePath];
        if (!resourcePath) {
            dispatch_async(dispatch_get_main_queue(), ^{
                completion(nil, nil, @"无法定位应用资源目录");
            });
            return;
        }

        NSString *pythonHome = [resourcePath stringByAppendingPathComponent:@"python"];
        NSString *stdLib = [pythonHome stringByAppendingPathComponent:@"lib/python3.13"];
        NSString *dynLoad = [stdLib stringByAppendingPathComponent:@"lib-dynload"];
        NSString *appPath = [resourcePath stringByAppendingPathComponent:@"app"];
        NSString *packagesPath = [resourcePath stringByAppendingPathComponent:@"app_packages"];

        NSFileManager *fm = [NSFileManager defaultManager];
        [fm createDirectoryAtPath:dataDir withIntermediateDirectories:YES attributes:nil error:nil];

        setenv("PYTHONHOME", [pythonHome UTF8String], 1);
        NSString *joinedPath = [NSString stringWithFormat:@"%@:%@:%@:%@", stdLib, dynLoad, appPath, packagesPath];
        setenv("PYTHONPATH", [joinedPath UTF8String], 1);
        setenv("HOME", [dataDir UTF8String], 1);
        setenv("TMPDIR", [NSTemporaryDirectory() UTF8String], 1);
        setenv("JLU_TOOLKIT_NO_KEYRING", "1", 1);

        NSString *caFile = [packagesPath stringByAppendingPathComponent:@"certifi/cacert.pem"];
        if ([fm fileExistsAtPath:caFile]) {
            setenv("SSL_CERT_FILE", [caFile UTF8String], 1);
        }

        if (!self.initialized) {
            PyPreConfig preconfig;
            PyPreConfig_InitPythonConfig(&preconfig);
            preconfig.utf8_mode = 1;
            PyStatus status = Py_PreInitialize(&preconfig);
            if (PyStatus_Exception(status)) {
                NSString *err = status.err_msg ? [NSString stringWithUTF8String:status.err_msg] : @"Python 预初始化失败";
                dispatch_async(dispatch_get_main_queue(), ^{
                    completion(nil, nil, err);
                });
                return;
            }

            PyConfig config;
            PyConfig_InitPythonConfig(&config);
            config.buffered_stdio = 0;
            config.write_bytecode = 0;
            config.install_signal_handlers = 0;
            config.module_search_paths_set = 1;

            PyConfig_SetBytesString(&config, &config.home, [pythonHome UTF8String]);
            NSArray<NSString *> *paths = @[stdLib, dynLoad, appPath, packagesPath];
            for (NSString *p in paths) {
                wchar_t *wp = Py_DecodeLocale([p UTF8String], NULL);
                if (wp) {
                    PyWideStringList_Append(&config.module_search_paths, wp);
                    PyMem_RawFree(wp);
                }
            }

            status = Py_InitializeFromConfig(&config);
            PyConfig_Clear(&config);
            if (PyStatus_Exception(status)) {
                NSString *err = status.err_msg ? [NSString stringWithUTF8String:status.err_msg] : @"Python 运行时初始化失败";
                dispatch_async(dispatch_get_main_queue(), ^{
                    completion(nil, nil, err);
                });
                return;
            }
            self.initialized = YES;
            // Release GIL on this GCD worker after initial setup so PyGILState works uniformly.
            PyEval_SaveThread();
        }

        PyGILState_STATE gstate = PyGILState_Ensure();
        NSString *outUrl = nil;
        NSString *outToken = nil;
        NSString *outErr = nil;

        PyObject *mod = PyImport_ImportModule("jlu_ios");
        if (!mod) {
            outErr = FormatPyError(@"加载 jlu_ios 模块失败");
        } else {
            PyObject *pyDir = PyUnicode_FromString([dataDir UTF8String]);
            PyObject *pyVer = PyUnicode_FromString([appVersion UTF8String]);
            PyObject *resUrl = PyObject_CallMethod(mod, "start", "OO", pyDir, pyVer);
            Py_DECREF(pyDir);
            Py_DECREF(pyVer);
            if (!resUrl) {
                outErr = FormatPyError(@"启动本地教务服务失败");
            } else {
                const char *u = PyUnicode_AsUTF8(resUrl);
                if (u) outUrl = [NSString stringWithUTF8String:u];
                Py_DECREF(resUrl);

                PyObject *resTok = PyObject_CallMethod(mod, "auth_token", NULL);
                if (!resTok) {
                    outErr = FormatPyError(@"读取本地接口令牌失败");
                } else {
                    const char *t = PyUnicode_AsUTF8(resTok);
                    if (t) outToken = [NSString stringWithUTF8String:t];
                    Py_DECREF(resTok);
                }
            }
            Py_DECREF(mod);
        }

        PyGILState_Release(gstate);

        dispatch_async(dispatch_get_main_queue(), ^{
            completion(outUrl, outToken, outErr);
        });
    });
}

@end
