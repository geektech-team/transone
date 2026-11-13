import type { NativeAction, NativeDialect, NativeNode, NativeScreen, NativeTextPart } from './types';
import { nativeExpression, nativeRuntimeSource, nativeString, type NativeLanguage } from './runtime-codegen';

function runtimeText(parts: NativeTextPart[], language: NativeLanguage): string {
  const values = parts.map(part => nativeExpression(part.kind === 'expression' ? part.value : part.kind === 'state' ? part : {kind:'literal',value:part.value},language,language==='ark'?'this.runtime.':'runtime.'));
  const array=language==='kotlin'?`listOf(${values.join(', ')})`:`[${values.join(', ')}]`;
  return language==='swift'?`runtime.present { ${array} }`:language==='kotlin'?`runtime.present({ ${array} }, revision)`:`this.runtime.present(() => ${array}, this.revision)`;
}
function runtimeAction(value: NativeAction, language: NativeLanguage): string {
  const runtime=language==='ark'?'this.runtime.':'runtime.';
  if(value.kind==='sequence')return value.actions.map(action=>runtimeAction(action,language)).join('; ');
  if(value.kind==='invoke')return `${language==='swift'?'_ = try ':''}${runtime}invoke(${nativeString(value.instance,language)}, ${nativeString(value.method,language)}, ${language==='kotlin'?'listOf(':'['}${value.args.map(arg=>nativeExpression(arg,language,runtime)).join(', ')}${language==='kotlin'?')':']'})`;
  const expression=value.kind==='set-literal'?nativeExpression({kind:'literal',value:value.value},language):`${runtime}binary("+", ${runtime}getState(${nativeString(value.key,language)}), ${nativeExpression({kind:'literal',value:value.by},language)})`;
  return `${runtime}assign(${nativeString(value.key,language)}, ${expression})`;
}
function runtimeNode(node: NativeNode, language: NativeLanguage, indent='    '): string {
  if(node.kind==='container')return `${indent}${language==='swift'?'VStack {':language==='kotlin'?'Column {':'Column() {'}\n${node.children.map(child=>runtimeNode(child,language,indent+'  ')).join('\n')}\n${indent}}`;
  const label=runtimeText(node.parts,language);
  if(node.kind==='text')return `${indent}Text(${label})`;
  const body=runtimeAction(node.action,language);
  return language==='swift'?`${indent}Button(${label}, action: runtime.action { ${body} })`
    :language==='kotlin'?`${indent}Button(onClick = runtime.action { ${body} }) { Text(${label}) }`
    :`${indent}Button(${label}).onClick(this.runtime.action(() => { ${body}; }))`;
}

function text(parts: NativeTextPart[], language: 'swift' | 'kotlin' | 'ark'): string {
  if(parts.some(part=>part.kind==='expression'))throw new Error('Native expressions require a component runtime');
  const simple=parts as Exclude<NativeTextPart,{kind:'expression'}>[];
  if (language === 'swift') {
    const value = simple.map((part) => part.kind === 'literal' ? part.value : `\\(${part.key})`).join('');
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  if (language === 'kotlin') {
    return JSON.stringify(simple.map((part) => part.kind === 'literal' ? part.value : `$${part.key}`).join(''));
  }
  return simple.map((part) => part.kind === 'literal' ? JSON.stringify(part.value) : `this.${part.key}`).join(' + ') || '""';
}
function action(node: Extract<NativeNode, { kind: 'button' }>, language: 'swift' | 'kotlin' | 'ark'): string {
  return nativeAction(node.action, language);
}
function nativeAction(action: NativeAction, language: 'swift' | 'kotlin' | 'ark'): string {
  if(action.kind==='invoke')throw new Error('Native method invocation requires a component runtime');
  if (action.kind === 'sequence') return action.actions.map(item => nativeAction(item, language)).join('; ');
  const target = language === 'ark' ? `this.${action.key}` : action.key;
  return action.kind === 'increment' ? `${target} ${action.by >= 0 ? '+=' : '-='} ${Math.abs(action.by)}` : `${target} = ${typeof action.value === 'string' ? JSON.stringify(action.value) : action.value}`;
}
function swiftNode(node: NativeNode, indent = '    '): string {
  if (node.kind === 'container') return `${indent}VStack {\n${node.children.map((child) => swiftNode(child, `${indent}  `)).join('\n')}\n${indent}}`;
  if (node.kind === 'text') return `${indent}Text(${text(node.parts, 'swift')})`;
  return `${indent}Button(${text(node.parts, 'swift')}) { ${action(node, 'swift')} }`;
}
function kotlinNode(node: NativeNode, indent = '    '): string {
  if (node.kind === 'container') return `${indent}Column {\n${node.children.map((child) => kotlinNode(child, `${indent}  `)).join('\n')}\n${indent}}`;
  if (node.kind === 'text') return `${indent}Text(${text(node.parts, 'kotlin')})`;
  return `${indent}Button(onClick = { ${action(node, 'kotlin')} }) { Text(${text(node.parts, 'kotlin')}) }`;
}
function arkNode(node: NativeNode, indent = '    '): string {
  if (node.kind === 'container') return `${indent}Column() {\n${node.children.map((child) => arkNode(child, `${indent}  `)).join('\n')}\n${indent}}`;
  if (node.kind === 'text') return `${indent}Text(${text(node.parts, 'ark')})`;
  return `${indent}Button(${text(node.parts, 'ark')}).onClick(() => { ${action(node, 'ark')} })`;
}
function swiftState(screen: NativeScreen): string { return screen.state.map((item) => `  @State private var ${item.key}: ${typeof item.value === 'number' ? 'Int' : typeof item.value === 'boolean' ? 'Bool' : 'String'} = ${JSON.stringify(item.value)}`).join('\n'); }
function kotlinState(screen: NativeScreen): string { return screen.state.map((item) => `    var ${item.key} by remember { mutableStateOf(${JSON.stringify(item.value)}) }`).join('\n'); }
function arkState(screen: NativeScreen): string { return screen.state.map((item) => `  @State ${item.key}: ${typeof item.value === 'number' ? 'number' : typeof item.value === 'boolean' ? 'boolean' : 'string'} = ${JSON.stringify(item.value)}`).join('\n'); }

export const IOS_DIALECT: NativeDialect = {
  id: 'app-ios', label: 'iOS 原生 App（SwiftUI）', resourceDirectory: 'TransOneApp/Assets',
  generateProject(screen, config) {
    return {
      'TransOneApp/TransOneApp.swift': `import SwiftUI\n\n@main struct TransOneApp: App { var body: some Scene { WindowGroup { ContentView() } } }\n`,
      'TransOneApp/ContentView.swift': screen.program ? `import SwiftUI\nimport Foundation\n\n${nativeRuntimeSource(screen,'swift')}\nfinal class TnModel: ObservableObject {\n  @Published var revision = 0\n  let runtime = TnRuntime()\n  init() { runtime.changed = { [weak self] in self?.revision += 1 } }\n}\nstruct ContentView: View {\n  @StateObject private var model = TnModel()\n  var body: some View {\n    let runtime = model.runtime\n${runtimeNode(screen.root,'swift')}\n      .onAppear { do { try runtime.mount() } catch { print(error) } }\n      .onDisappear { do { try runtime.unmount() } catch { print(error) } }\n  }\n}\n` : `import SwiftUI\n\nstruct ContentView: View {\n${swiftState(screen)}\n  var body: some View {\n${swiftNode(screen.root)}\n  }\n}\n`,
      'TransOneApp.xcodeproj/project.pbxproj': xcodeProject(config),
      'TransOneApp/Assets.xcassets/Contents.json': '{"info":{"author":"xcode","version":1}}\n',
    };
  },
};

function xcodeProject(config: { appName: string; bundleId: string; minPlatformVersion: string }): string {
  const escapedName = config.appName.replace(/"/g, '\\"');
  return `// !$*UTF8*$!
{
  archiveVersion = 1;
  classes = {};
  objectVersion = 56;
  objects = {

/* Begin PBXBuildFile section */
    A00100000000000000000001 /* TransOneApp.swift in Sources */ = {isa = PBXBuildFile; fileRef = A00100000000000000000011 /* TransOneApp.swift */; };
    A00100000000000000000002 /* ContentView.swift in Sources */ = {isa = PBXBuildFile; fileRef = A00100000000000000000012 /* ContentView.swift */; };
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
    A00100000000000000000011 /* TransOneApp.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = TransOneApp.swift; sourceTree = "<group>"; };
    A00100000000000000000012 /* ContentView.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = ContentView.swift; sourceTree = "<group>"; };
    A00100000000000000000013 /* TransOneApp.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = TransOneApp.app; sourceTree = BUILT_PRODUCTS_DIR; };
/* End PBXFileReference section */

/* Begin PBXGroup section */
    A00100000000000000000021 = {isa = PBXGroup; children = (A00100000000000000000022 /* TransOneApp */, A00100000000000000000023 /* Products */, ); sourceTree = "<group>"; };
    A00100000000000000000022 /* TransOneApp */ = {isa = PBXGroup; children = (A00100000000000000000011 /* TransOneApp.swift */, A00100000000000000000012 /* ContentView.swift */, ); path = TransOneApp; sourceTree = "<group>"; };
    A00100000000000000000023 /* Products */ = {isa = PBXGroup; children = (A00100000000000000000013 /* TransOneApp.app */, ); name = Products; sourceTree = "<group>"; };
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
    A00100000000000000000031 /* TransOneApp */ = {isa = PBXNativeTarget; buildConfigurationList = A00100000000000000000041 /* Build configuration list for PBXNativeTarget "TransOneApp" */; buildPhases = (A00100000000000000000032 /* Sources */, A00100000000000000000033 /* Frameworks */, A00100000000000000000034 /* Resources */, ); buildRules = (); dependencies = (); name = TransOneApp; productName = TransOneApp; productReference = A00100000000000000000013 /* TransOneApp.app */; productType = "com.apple.product-type.application"; };
/* End PBXNativeTarget section */

/* Begin PBXProject section */
    A00100000000000000000051 /* Project object */ = {isa = PBXProject; attributes = { LastUpgradeCheck = 2700; TargetAttributes = { A00100000000000000000031 = { CreatedOnToolsVersion = 27.0; }; }; }; buildConfigurationList = A00100000000000000000052 /* Build configuration list for PBXProject "TransOneApp" */; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base, ); mainGroup = A00100000000000000000021; productRefGroup = A00100000000000000000023; projectDirPath = ""; projectRoot = ""; targets = (A00100000000000000000031 /* TransOneApp */, ); };
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
    A00100000000000000000034 /* Resources */ = {isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
    A00100000000000000000032 /* Sources */ = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = (A00100000000000000000001 /* TransOneApp.swift in Sources */, A00100000000000000000002 /* ContentView.swift in Sources */, ); runOnlyForDeploymentPostprocessing = 0; };
/* End PBXSourcesBuildPhase section */

/* Begin PBXFrameworksBuildPhase section */
    A00100000000000000000033 /* Frameworks */ = {isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0; };
/* End PBXFrameworksBuildPhase section */

/* Begin XCBuildConfiguration section */
    A00100000000000000000061 /* Debug */ = {isa = XCBuildConfiguration; buildSettings = { CLANG_ENABLE_MODULES = YES; SWIFT_VERSION = 5.0; }; name = Debug; };
    A00100000000000000000062 /* Release */ = {isa = XCBuildConfiguration; buildSettings = { CLANG_ENABLE_MODULES = YES; SWIFT_VERSION = 5.0; }; name = Release; };
    A00100000000000000000063 /* Debug */ = {isa = XCBuildConfiguration; buildSettings = { ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES; CODE_SIGNING_ALLOWED = NO; GENERATE_INFOPLIST_FILE = YES; IPHONEOS_DEPLOYMENT_TARGET = ${config.minPlatformVersion}; PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId}; PRODUCT_NAME = "${escapedName}"; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Debug; };
    A00100000000000000000064 /* Release */ = {isa = XCBuildConfiguration; buildSettings = { ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES; CODE_SIGNING_ALLOWED = NO; GENERATE_INFOPLIST_FILE = YES; IPHONEOS_DEPLOYMENT_TARGET = ${config.minPlatformVersion}; PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId}; PRODUCT_NAME = "${escapedName}"; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; TARGETED_DEVICE_FAMILY = "1,2"; }; name = Release; };
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
    A00100000000000000000041 /* Build configuration list for PBXNativeTarget "TransOneApp" */ = {isa = XCConfigurationList; buildConfigurations = (A00100000000000000000063 /* Debug */, A00100000000000000000064 /* Release */, ); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
    A00100000000000000000052 /* Build configuration list for PBXProject "TransOneApp" */ = {isa = XCConfigurationList; buildConfigurations = (A00100000000000000000061 /* Debug */, A00100000000000000000062 /* Release */, ); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; };
/* End XCConfigurationList section */
  };
  rootObject = A00100000000000000000051 /* Project object */;
}
`;
}

export const ANDROID_DIALECT: NativeDialect = {
  id: 'app-android', label: 'Android 原生 App（Jetpack Compose）', resourceDirectory: 'app/src/main/assets',
  generateProject(screen, config) {
    const pkg = config.bundleId.replace(/[^A-Za-z0-9_.]/g, '_');
    const path = pkg.replace(/\./g, '/');
    const appName = nativeString(config.appName, 'kotlin');
    const label = config.appName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
    const content = screen.program
      ? `      val runtime = remember { TnRuntime() }
      var revision by remember { mutableStateOf(0) }
      DisposableEffect(runtime) {
        runtime.changed = { revision += 1 }
        try {
          runtime.mount()
        } catch (error: Exception) {
          android.util.Log.e("TransOne", "Native mount failed", error)
        }
        onDispose {
          try {
            runtime.unmount()
          } catch (error: Exception) {
            android.util.Log.e("TransOne", "Native unmount failed", error)
          } finally {
            runtime.changed = {}
          }
        }
      }
${runtimeNode(screen.root, 'kotlin', '      ')}`
      : `${kotlinState(screen)}\n${kotlinNode(screen.root, '      ')}`;
    return {
      'settings.gradle.kts': `pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}
dependencyResolutionManagement {
  repositories {
    google()
    mavenCentral()
  }
}
rootProject.name = ${appName}
include(":app")
`,
      'build.gradle.kts': `plugins {
  id("com.android.application") version "8.5.2" apply false
  id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
`,
      'gradle.properties': 'android.useAndroidX=true\n',
      'app/build.gradle.kts': `plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "${pkg}"
  compileSdk = 34
  defaultConfig {
    applicationId = "${pkg}"
    minSdk = 23
    targetSdk = 34
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
  buildFeatures { compose = true }
  composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }
}

dependencies {
  implementation(platform("androidx.compose:compose-bom:2024.06.00"))
  implementation("androidx.activity:activity-compose:1.9.0")
  implementation("androidx.compose.material3:material3")
}
`,
      'app/src/main/AndroidManifest.xml': `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:label="${label}">
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>
  </application>
</manifest>
`,
      [`app/src/main/java/${path}/MainActivity.kt`]: `package ${pkg}

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.*
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.*
${screen.program ? nativeRuntimeSource(screen, 'kotlin') : ''}
class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
${content}
    }
  }
}
`,
    };
  },
};

export const HARMONY_DIALECT: NativeDialect = {
  id: 'app-harmony', label: 'HarmonyOS 原生 App（ArkUI）', resourceDirectory: 'entry/src/main/resources/rawfile',
  generateProject(screen, config) {
    const json = (value: object) => JSON.stringify(value, null, 2) + '\n';
    const page = 'pages/Index';
    const ability = 'EntryAbility';
    const abilitySource = `ets/entryability/${ability}.ets`;
    const sdkProfile = '5.0.0(12)';
    const modelVersion = '5.0.0';
    // Embedded 104 × 104 PNG for the default launcher and startup window.
    const icon = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAGgAAABoCAIAAACSfiL2AAAAtElEQVR42u3Y0QkAIAhFUfdonjZs31ohJALlyF3A8/lizKVEgQAcOHDgBA4cOHDgBA4cOHDgBA4cOHACBw4cOHDX7YIHDhw4cODAgQMHDhw4cOB6w73qz8MN1xFw4MCBAwcOHDhw4MCBAwcOHDhw4MCBAwcOHDhw4MCBAwcOHDhw4MCBAwcOHDhw4MCBAwcOHDhw4MCBAydw4MCBAydw4MCBAydw4MCBEzhw4MCBEzhw4Kp3AAVITDujomsAAAAAAElFTkSuQmCC',
      'base64'
    );
    return {
      'build-profile.json5': json({
        app: {
          signingConfigs: [],
          products: [{ name: 'default', compatibleSdkVersion: sdkProfile, runtimeOS: 'HarmonyOS' }],
          buildModeSet: [{ name: 'debug' }, { name: 'release' }],
        },
        modules: [{
          name: 'entry',
          srcPath: './entry',
          targets: [{ name: 'default', applyToProducts: ['default'] }],
        }],
      }),
      'hvigorfile.ts': "import { appTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: appTasks, plugins: [] };\n",
      'hvigor/hvigor-config.json5': json({ modelVersion, dependencies: {} }),
      'oh-package.json5': json({ modelVersion, name: 'transone-app', version: '1.0.0', dependencies: {} }),
      'AppScope/app.json5': json({
        app: {
          bundleName: config.bundleId,
          vendor: 'TransOne',
          versionCode: 1,
          versionName: '1.0.0',
          icon: '$media:app_icon',
          label: '$string:app_name',
        },
      }),
      'AppScope/resources/base/element/string.json': json({
        string: [{ name: 'app_name', value: config.appName }],
      }),
      'AppScope/resources/base/media/app_icon.png': icon,
      'entry/build-profile.json5': json({ apiType: 'stageMode', targets: [{ name: 'default' }] }),
      'entry/hvigorfile.ts': "import { hapTasks } from '@ohos/hvigor-ohos-plugin';\nexport default { system: hapTasks, plugins: [] };\n",
      'entry/oh-package.json5': json({ name: 'entry', version: '1.0.0', dependencies: {} }),
      'entry/src/main/module.json5': json({
        module: {
          name: 'entry',
          type: 'entry',
          mainElement: ability,
          deviceTypes: ['phone', 'tablet'],
          deliveryWithInstall: true,
          installationFree: false,
          pages: '$profile:main_pages',
          abilities: [{
            name: ability,
            srcEntry: `./${abilitySource}`,
            icon: '$media:entry_icon',
            label: '$string:entry_label',
            startWindowIcon: '$media:entry_icon',
            startWindowBackground: '$color:start_window_background',
            exported: true,
            skills: [{ entities: ['entity.system.home'], actions: ['ohos.want.action.home'] }],
          }],
        },
      }),
      'entry/src/main/resources/base/element/color.json': json({
        color: [{ name: 'start_window_background', value: '#ffffff' }],
      }),
      'entry/src/main/resources/base/element/string.json': json({
        string: [{ name: 'entry_label', value: config.appName }],
      }),
      'entry/src/main/resources/base/media/entry_icon.png': icon,
      'entry/src/main/resources/base/profile/main_pages.json': json({ src: [page] }),
      [`entry/src/main/${abilitySource}`]: `import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onWindowStageCreate(windowStage: window.WindowStage): void {
    try {
      windowStage.loadContent('${page}', (error) => {
        if (error.code) console.error('TransOne loadContent failed: ' + error.message);
      });
    } catch (error) {
      console.error('TransOne loadContent failed: ' + String(error));
    }
  }
}
`,
      [`entry/src/main/ets/${page}.ets`]: screen.program
        ? `${nativeRuntimeSource(screen, 'ark')}
@Entry
@Component
struct Index {
  @State private revision: number = 0;
  private runtime: TnRuntime = new TnRuntime();

  aboutToAppear(): void {
    this.runtime.changed = () => { this.revision += 1; };
    try { this.runtime.mount(); }
    catch (error) { console.error('TransOne mount failed: ' + String(error)); }
  }

  aboutToDisappear(): void {
    try { this.runtime.unmount(); }
    catch (error) { console.error('TransOne unmount failed: ' + String(error)); }
  }

  build() {
${runtimeNode(screen.root, 'ark')}
  }
}
`
        : `@Entry\n@Component\nstruct Index {\n${arkState(screen)}\n  build() {\n${arkNode(screen.root)}\n  }\n}\n`,
    };
  },
};
