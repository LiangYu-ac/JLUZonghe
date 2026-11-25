#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface PythonRuntime : NSObject

+ (instancetype)shared;

/// Starts embedded Python 3.13 and boots `jlu_ios.start(dataDir, appVersion)`.
/// Completion runs on the main queue with `(url, token, errorMessage)`.
- (void)startServerWithDataDir:(NSString *)dataDir
                    appVersion:(NSString *)appVersion
                    completion:(void (^)(NSString * _Nullable url,
                                         NSString * _Nullable token,
                                         NSString * _Nullable errorMessage))completion;

@end

NS_ASSUME_NONNULL_END
