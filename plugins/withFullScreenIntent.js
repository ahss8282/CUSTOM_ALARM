/**
 * withFullScreenIntent.js
 * Expo Config Plugin — Android fullScreenIntent 지원
 *
 * 이 플러그인은 두 가지 작업을 수행합니다:
 * 1. AndroidManifest.xml의 MainActivity에 잠금화면 표시 속성 추가
 *    - android:showWhenLocked="true"  → 잠금화면 위에 Activity 표시
 *    - android:turnScreenOn="true"    → 알람 수신 시 화면 자동 켜기
 * 2. AndroidManifest.xml에 FOREGROUND_SERVICE 권한 추가 (fullScreenIntent 필요)
 *
 * 사용법: app.json의 plugins 배열에 "./plugins/withFullScreenIntent" 추가
 */
const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * AndroidManifest.xml에서 MainActivity 요소를 찾아 반환합니다.
 * @param {object} manifest - Android manifest 객체
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
 * @param {object} manifest - Android manifest 객체
 * @param {string} permission - 추가할 권한 이름
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

module.exports = function withFullScreenIntent(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // 1. MainActivity에 잠금화면 + 화면 켜기 속성 추가
    const mainActivity = findMainActivity(manifest);
    if (mainActivity) {
      mainActivity.$['android:showWhenLocked'] = 'true';
      mainActivity.$['android:turnScreenOn'] = 'true';
    }

    // 2. FOREGROUND_SERVICE 권한 추가 (fullScreenIntent에 필요)
    addPermission(manifest, 'android.permission.FOREGROUND_SERVICE');

    return config;
  });
};
