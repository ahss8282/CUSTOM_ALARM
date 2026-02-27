/**
 * withFullScreenIntent.js
 * Expo Config Plugin — Android fullScreenIntent 지원
 *
 * 이 플러그인은 세 가지 작업을 수행합니다:
 * 1. AndroidManifest.xml의 MainActivity에 잠금화면 표시 속성 추가
 *    - android:showWhenLocked="true"  → 잠금화면 위에 Activity 표시
 *    - android:turnScreenOn="true"    → 콜드 스타트(앱이 완전히 종료된 상태)에서 화면 켜기
 * 2. AndroidManifest.xml에 FOREGROUND_SERVICE 권한 추가 (fullScreenIntent 필요)
 * 3. MainActivity.kt에 런타임 Window 플래그 삽입
 *    - setShowWhenLocked(true) / setTurnScreenOn(true) 를 onCreate + onNewIntent 양쪽에서 호출
 *    - 이유: 앱이 백그라운드에 살아있을 때 fullScreenAction이 발동하면 Android는
 *      Activity를 새로 만들지 않고 onNewIntent()로 재사용합니다.
 *      이 경우 Manifest 속성은 적용되지 않으므로 코드로 직접 플래그를 설정해야 합니다.
 *
 * 사용법: app.json의 plugins 배열에 "./plugins/withFullScreenIntent" 추가
 */
const { withAndroidManifest, withMainActivity, withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * AndroidManifest.xml에서 MainActivity 요소를 찾아 반환합니다.
 */
function findMainActivity(manifest) {
  const application = manifest.manifest?.application?.[0];
  if (!application?.activity) return null;
  return application.activity.find(
    (a) =>
      a.$?.['android:name'] === '.MainActivity' ||
      a.$?.['android:name']?.endsWith('.MainActivity')
  );
}

/**
 * AndroidManifest.xml의 권한 목록에 권한을 추가합니다.
 * 이미 있으면 추가하지 않습니다.
 */
function addPermission(manifest, permission) {
  const usesPermission = manifest.manifest['uses-permission'] ?? [];
  const alreadyExists = usesPermission.some((p) => p.$?.['android:name'] === permission);
  if (!alreadyExists) {
    manifest.manifest['uses-permission'] = [
      ...usesPermission,
      { $: { 'android:name': permission } },
    ];
  }
}

/**
 * MainActivity.kt에 setShowWhenLocked / setTurnScreenOn 호출 코드를 삽입합니다.
 *
 * 삽입 위치:
 *   - onCreate: super.onCreate(...) 바로 다음 → 콜드 스타트 시 화면 켜기
 *   - onNewIntent 오버라이드 추가 → 백그라운드에서 fullScreenAction 발동 시 화면 켜기
 *
 * 멱등성(idempotent): setShowWhenLocked 문자열이 이미 있으면 아무것도 하지 않습니다.
 */
function withScreenOnWhenLocked(config) {
  return withMainActivity(config, (config) => {
    let contents = config.modResults.contents;

    // 이미 패치된 경우 건너뜀 (재빌드 시 중복 삽입 방지)
    if (contents.includes('onNewIntent_alarm_patched')) return config;

    // ── 1. import android.os.Build 추가 ──────────────────────────────────
    // Expo SDK 54의 MainActivity.kt는 package 선언 다음에 import 블록이 옵니다.
    if (!contents.includes('import android.os.Build')) {
      // 첫 번째 import 줄 앞에 삽입
      contents = contents.replace(
        /^(import )/m,
        'import android.os.Build\n$1'
      );
    }

    // ── 2. onNewIntent 오버라이드 추가 ───────────────────────────────────
    // onCreate에는 setShowWhenLocked/setTurnScreenOn을 삽입하지 않습니다.
    // 이유: onCreate에 항상 적용하면 앱 사용 중에도 이 플래그가 유지되어
    //       Samsung 등 일부 기기에서 화면 자동 꺼짐을 방해합니다.
    // 대신 Manifest의 android:showWhenLocked / android:turnScreenOn 속성이
    // 콜드 스타트(앱 종료 후 알람 발동)를 처리하고,
    // onNewIntent(앱이 백그라운드에 살아있을 때 알람 발동)는 아래 코드가 처리합니다.
    // 이미 onNewIntent가 있으면 중복 추가하지 않음
    if (!contents.includes('onNewIntent')) {
      const onNewIntentCode =
        '\n  // onNewIntent_alarm_patched\n' +
        '  override fun onNewIntent(intent: android.content.Intent) {\n' +
        '    super.onNewIntent(intent)\n' +
        '    // setShowWhenLocked / setTurnScreenOn은 alarm-ringing 화면에서\n' +
        '    // AlarmAudio.setLockScreenFlags()로 직접 제어합니다.\n' +
        '    // 여기서 무조건 true로 설정하면 타이머 알림 등 모든 Intent에서\n' +
        '    // 잠금화면 플래그가 영구 설정되는 버그가 발생합니다.\n' +
        '  }';

      // 클래스의 마지막 닫는 중괄호 앞에 삽입
      const lastBraceIdx = contents.lastIndexOf('\n}');
      if (lastBraceIdx !== -1) {
        contents =
          contents.slice(0, lastBraceIdx) +
          onNewIntentCode +
          contents.slice(lastBraceIdx);
      }
    }

    // onActivityResult null 가드: IntentLauncher/ImagePicker 등에서 data=null로 돌아올 때
    // ReactActivityDelegate.onActivityResult가 Objects.requireNonNull(data)를 호출해 NPE 크래시가
    // 발생하는 React Native 내부 버그를 방어합니다.
    if (!contents.includes('onActivityResult')) {
      const onActivityResultCode =
        '\n  override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {\n' +
        '    // data가 null이면 빈 Intent를 전달해 ReactActivityDelegate의 NPE를 방지합니다.\n' +
        '    super.onActivityResult(requestCode, resultCode, data ?: android.content.Intent())\n' +
        '  }';

      const lastBraceIdx = contents.lastIndexOf('\n}');
      if (lastBraceIdx !== -1) {
        contents =
          contents.slice(0, lastBraceIdx) +
          onActivityResultCode +
          contents.slice(lastBraceIdx);
      }
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = function withFullScreenIntent(config) {
  // Step 1: AndroidManifest.xml 수정
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // showWhenLocked / turnScreenOn은 alarm-ringing 화면에서
    // AlarmAudio.setLockScreenFlags()로 런타임에 제어합니다.
    // 매니페스트에 true로 고정하면 타이머 알림 등 모든 화면 켜기 시
    // 잠금화면 위에 앱이 노출되는 버그가 발생합니다.
    const mainActivity = findMainActivity(manifest);
    if (mainActivity) {
      mainActivity.$['android:showWhenLocked'] = 'false';
      mainActivity.$['android:turnScreenOn'] = 'false';
    }

    // FOREGROUND_SERVICE 권한 추가 (fullScreenIntent에 필요)
    addPermission(manifest, 'android.permission.FOREGROUND_SERVICE');

    return config;
  });

  // Step 2: MainActivity.kt에 런타임 Window 플래그 삽입 (백그라운드 재사용 경로 대비)
  config = withScreenOnWhenLocked(config);

  // Step 3: android/build.gradle에 notifee 로컬 Maven 저장소 추가
  // prebuild --clean 시 build.gradle이 재생성되므로 플러그인이 자동 삽입합니다.
  config = withProjectBuildGradle(config, (config) => {
    const notifeeRepo = "maven { url \"$rootDir/../node_modules/@notifee/react-native/android/libs\" }";
    if (!config.modResults.contents.includes('notifee/react-native/android/libs')) {
      config.modResults.contents = config.modResults.contents.replace(
        /maven \{ url 'https:\/\/www\.jitpack\.io' \}/,
        (match) => `${match}\n    // @notifee/react-native 로컬 AAR 저장소\n    ${notifeeRepo}`
      );
    }
    return config;
  });

  return config;
};
