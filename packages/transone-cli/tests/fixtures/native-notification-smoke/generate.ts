import { resolve } from 'node:path';
import { analyzeNativeScreen } from '../../../src/app/analyze';
import { nativeRuntimeSource } from '../../../src/app/runtime-codegen';
import { build } from '../../../src/build';
import { resolveConfig } from '../../../src/config';
import { notificationSmoke } from './scenario';

const [platform, output, deviceSmoke, ...extra] = process.argv.slice(2);
if (
  (platform !== 'android' && platform !== 'harmony') ||
  !output ||
  (deviceSmoke !== undefined && deviceSmoke !== '--device-smoke') ||
  extra.length
)
  throw new Error(
    'Usage: bun generate.ts <android|harmony> <output directory> [--device-smoke]'
  );

const root = resolve(import.meta.dir, '../../../../..');
const entry = resolve(import.meta.dir, 'main.ts');
const target = platform === 'android' ? 'app-android' : 'app-harmony';
const language = platform === 'android' ? 'kotlin' : 'ark';
const config = {
  entry,
  app: {
    appName: 'TransOne Notification Smoke',
    bundleId: 'com.transone.notificationsmoke',
  },
};
const project = await build({ root, target, config, outDir: output });
const screen = await analyzeNativeScreen(
  entry,
  await resolveConfig({ root, target, config })
);

// Keep standalone harness files outside the generated Android and Harmony
// source sets so that their duplicate runtime classes cannot affect the app.
const harness = resolve(project.outDir, 'smoke');
const source = nativeRuntimeSource(screen, language);
const scenario = notificationSmoke(screen, language);
if (platform === 'android') {
  if (deviceSmoke) {
    const bundleId = config.app.bundleId;
    const main = resolve(project.outDir, 'app/src/main');
    const manifest = resolve(main, 'AndroidManifest.xml');
    const manifestSource = await Bun.file(manifest).text();
    if (!manifestSource.includes('</manifest>'))
      throw new Error(
        'Android smoke fixture is missing its generated manifest'
      );
    await Bun.write(
      manifest,
      manifestSource.replace(
        '</manifest>',
        `  <instrumentation android:name=".NotificationSmoke" android:targetPackage="${bundleId}"/>\n</manifest>`
      )
    );
    await Bun.write(
      resolve(
        main,
        'java',
        bundleId.replace(/\./g, '/'),
        'NotificationSmoke.kt'
      ),
      `package ${bundleId}

import android.app.Activity
import android.app.Instrumentation
import android.os.Bundle
import android.util.Log

class NotificationSmoke : Instrumentation() {
  override fun onCreate(arguments: Bundle?) {
    super.onCreate(arguments)
    start()
  }

  override fun onStart() {
    val result = Bundle()
    try {
      result.putString("stream", "\\n" + runNotificationSmoke() + "\\n")
      finish(Activity.RESULT_OK, result)
    } catch (error: Throwable) {
      result.putString("stream", "\\n" + Log.getStackTraceString(error))
      finish(Activity.RESULT_CANCELED, result)
    }
  }
}
` + scenario
    );
  }
  await Bun.write(resolve(harness, 'NotificationSmoke.kt'), scenario);
  await Bun.write(
    resolve(harness, 'main.kt'),
    source + scenario + '\nfun main() { println(runNotificationSmoke()) }\n'
  );
} else {
  if (deviceSmoke) {
    const page = resolve(project.outDir, 'entry/src/main/ets/pages/Index.ets');
    const pageSource = await Bun.file(page).text();
    const entryMarker = '\n@Entry\n';
    const mountMarker = '  aboutToAppear(): void {\n';
    if (!pageSource.includes(entryMarker) || !pageSource.includes(mountMarker))
      throw new Error(
        'Harmony smoke fixture is missing its generated page lifecycle'
      );
    await Bun.write(
      page,
      pageSource
        .replace(entryMarker, () => scenario + entryMarker)
        .replace(
          mountMarker,
          () => `${mountMarker}    try { console.info(runNotificationSmoke()); }
    catch (error) { console.error('TransOne notification smoke failed: ' + String(error)); }
`
        )
    );
  }
  await Bun.write(resolve(harness, 'NotificationSmoke.ets'), scenario);
  await Bun.write(
    resolve(harness, 'main.ets'),
    source + scenario + '\nconsole.log(runNotificationSmoke());\n'
  );
}
console.log(project.outDir);
