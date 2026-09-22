import type { NativeDialect, NativeNode, NativeScreen, NativeTextPart } from './types';

function text(parts: NativeTextPart[], language: 'swift' | 'kotlin' | 'ark'): string {
  if (language === 'swift') {
    const value = parts.map((part) => part.kind === 'literal' ? part.value : `\\(${part.key})`).join('');
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  if (language === 'kotlin') {
    return JSON.stringify(parts.map((part) => part.kind === 'literal' ? part.value : `$${part.key}`).join(''));
  }
  return parts.map((part) => part.kind === 'literal' ? JSON.stringify(part.value) : `this.${part.key}`).join(' + ') || '""';
}
function action(node: Extract<NativeNode, { kind: 'button' }>, language: 'swift' | 'kotlin' | 'ark'): string {
  const { action } = node;
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
      'TransOneApp/ContentView.swift': `import SwiftUI\n\nstruct ContentView: View {\n${swiftState(screen)}\n  var body: some View {\n${swiftNode(screen.root)}\n  }\n}\n`,
      'TransOneApp.xcodeproj/project.pbxproj': `// !$*UTF8*$!\n// Generated TransOne Xcode project: ${config.appName}\n`,
      'TransOneApp/Assets.xcassets/Contents.json': '{"info":{"author":"xcode","version":1}}\n',
    };
  },
};

export const ANDROID_DIALECT: NativeDialect = {
  id: 'app-android', label: 'Android 原生 App（Jetpack Compose）', resourceDirectory: 'app/src/main/assets',
  generateProject(screen, config) {
    const pkg = config.bundleId.replace(/[^A-Za-z0-9_.]/g, '_'); const path = pkg.replace(/\./g, '/');
    return {
      'settings.gradle.kts': `rootProject.name = "${config.appName}"\ninclude(":app")\n`,
      'build.gradle.kts': 'plugins { }\n',
      'app/build.gradle.kts': `plugins { id("com.android.application") version "8.5.0" apply false }\n`,
      'app/src/main/AndroidManifest.xml': `<manifest package="${pkg}" xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="${config.appName}"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>\n`,
      [`app/src/main/java/${path}/MainActivity.kt`]: `package ${pkg}\n\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.runtime.*\nimport androidx.compose.foundation.layout.Column\nimport androidx.compose.material3.*\n\nclass MainActivity : ComponentActivity() { override fun onCreate(savedInstanceState: android.os.Bundle?) { super.onCreate(savedInstanceState); setContent {\n${kotlinState(screen)}\n${kotlinNode(screen.root)}\n} } }\n`,
    };
  },
};

export const HARMONY_DIALECT: NativeDialect = {
  id: 'app-harmony', label: 'HarmonyOS 原生 App（ArkUI）', resourceDirectory: 'entry/src/main/resources/rawfile',
  generateProject(screen, config) {
    return {
      'AppScope/app.json5': `{ "app": { "bundleName": "${config.bundleId}", "vendor": "TransOne", "versionCode": 1, "versionName": "1.0.0" } }\n`,
      'AppScope/resources/base/element/string.json': `{ "string": [{ "name": "app_name", "value": "${config.appName}" }] }\n`,
      'entry/src/main/module.json5': '{ "module": { "name": "entry", "type": "entry", "mainElement": "EntryAbility" } }\n',
      'entry/src/main/ets/entryability/EntryAbility.ets': 'import UIAbility from \'@ohos.app.ability.UIAbility\';\nexport default class EntryAbility extends UIAbility {}\n',
      'entry/src/main/ets/pages/Index.ets': `@Entry\n@Component\nstruct Index {\n${arkState(screen)}\n  build() {\n${arkNode(screen.root)}\n  }\n}\n`,
    };
  },
};
