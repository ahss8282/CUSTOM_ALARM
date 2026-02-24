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
const { withAndroidManifest, withMainActivity } = require('@expo/config-plugins');

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
    if (contents.includes('setShowWhenLocked')) return config;

    // ── 1. import android.os.Build 추가 ──────────────────────────────────
    // Expo SDK 54의 MainActivity.kt는 package 선언 다음에 import 블록이 옵니다.
    if (!contents.includes('import android.os.Build')) {
      // 첫 번째 import 줄 앞에 삽입
      contents = contents.replace(
        /^(import )/m,
        'import android.os.Build\n$1'
      );
    }

    // ── 2. onCreate에 코드 삽입 ──────────────────────────────────────────
    // super.onCreate(null) 또는 super.onCreate(savedInstanceState) 두 패턴 모두 처리
    const screenOnCode =
      '\n    // fullScreenIntent: 화면이 꺼진 상태에서 알람 발동 시 화면 켜기\n' +
      '    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {\n' +
      '      setShowWhenLocked(true)\n' +
      '      setTurnScreenOn(true)\n' +
      '    }';

    contents = contents.replace(
      /super\.onCreate\((?:savedInstanceState|null)\)/,
      (match) => `${match}${screenOnCode}`
    );

    // ── 3. onNewIntent 오버라이드 추가 ───────────────────────────────────
    // 이미 onNewIntent가 있으면 중복 추가하지 않음
    if (!contents.includes('onNewIntent')) {
      const onNewIntentCode =
        '\n  override fun onNewIntent(intent: android.content.Intent) {\n' +
        '    super.onNewIntent(intent)\n' +
        '    // fullScreenIntent: 백그라운드 상태에서 알람이 발동할 때 화면 켜기\n' +
        '    // Manifest의 android:turnScreenOn은 Activity 신규 생성 시에만 적용되므로\n' +
        '    // 백그라운드 재사용 경로(onNewIntent)에서는 코드로 직접 설정해야 합니다.\n' +
        '    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {\n' +
        '      setShowWhenLocked(true)\n' +
        '      setTurnScreenOn(true)\n' +
        '    }\n' +
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

    // MainActivity에 잠금화면 + 화면 켜기 속성 추가 (콜드 스타트 대비)
    const mainActivity = findMainActivity(manifest);
    if (mainActivity) {
      mainActivity.$['android:showWhenLocked'] = 'true';
      mainActivity.$['android:turnScreenOn'] = 'true';
    }

    // FOREGROUND_SERVICE 권한 추가 (fullScreenIntent에 필요)
    addPermission(manifest, 'android.permission.FOREGROUND_SERVICE');

    return config;
  });

  // Step 2: MainActivity.kt에 런타임 Window 플래그 삽입 (백그라운드 재사용 경로 대비)
  config = withScreenOnWhenLocked(config);

  return config;
};
