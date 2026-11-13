从仓库根目录生成验证项目。

```sh
bun packages/transone-cli/tests/fixtures/native-notification-smoke/generate.ts android dist/native-notification-smoke/android
bun packages/transone-cli/tests/fixtures/native-notification-smoke/generate.ts harmony dist/native-notification-smoke/harmony
```

生成的 App 可通过界面上的 **Batch and reentry**、**Fail watch**、**Recover** 和 **Record action** 依次触发场景，首行显示事件与监听顺序。预期轨迹见 [scenario.ts](scenario.ts)。

Android 验证项目可加上 `--device-smoke`，生成可在模拟器或真机执行的 instrumentation。使用 JDK 17、Gradle 8.7、Android SDK 34 和 Build Tools 34.0.0 编译。

```sh
bun packages/transone-cli/tests/fixtures/native-notification-smoke/generate.ts android dist/native-notification-smoke/android --device-smoke
cd dist/native-notification-smoke/android
gradle assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am instrument -w -r com.transone.notificationsmoke/.NotificationSmoke
```

运行成功时输出 `TransOne notification smoke passed` 和 `INSTRUMENTATION_CODE: -1`。断言还覆盖卸载后旧回调失效，以及在监听器即将抛错时重挂载并继续更新。

HarmonyOS 验证项目可加上 `--device-smoke`，在启动页的 `aboutToAppear` 中执行相同断言。在配置好 HarmonyOS SDK 和 Hvigor 的环境中编译该项目。

```sh
bun packages/transone-cli/tests/fixtures/native-notification-smoke/generate.ts harmony dist/native-notification-smoke/harmony --device-smoke
cd dist/native-notification-smoke/harmony
hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon
hdc list targets
```

也可以在 DevEco Studio 中打开生成目录，选中模拟器或已配置调试签名的真机运行。启动后在 HiLog 查找 `TransOne notification smoke passed`。失败时日志会包含出错的场景。 [华为命令行构建指南](https://developer.huawei.com/consumer/cn/doc/doccenter-deveco-studio/ide-command-line-building-app/) · [华为本地调试指南](https://developer.huawei.com/consumer/en/doc/app/agc-help-debug-overview-0000001955332054/)

输出目录里的 `smoke/main.kt` 和 `smoke/main.ets` 也可单独交给对应的编译器或命令行运行时。
