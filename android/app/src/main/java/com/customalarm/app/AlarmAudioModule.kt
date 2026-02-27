package com.customalarm.app

import android.app.Activity
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.*

/**
 * AlarmAudioModule
 *
 * STREAM_ALARM으로 오디오를 재생합니다.
 * STREAM_ALARM은 기기의 미디어 볼륨(STREAM_MUSIC)이 아닌 알람 볼륨을 사용하므로
 * 무음 모드·진동 모드에서도 알람 볼륨이 0이 아니면 소리가 납니다.
 */
class AlarmAudioModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var mediaPlayer: MediaPlayer? = null

    override fun getName(): String = "AlarmAudio"

    /**
     * 지정한 URI의 오디오 파일을 STREAM_ALARM으로 반복 재생합니다.
     * @param uri    file:// URI
     * @param volume 0.0 ~ 1.0
     */
    @ReactMethod
    fun play(uri: String, volume: Float, promise: Promise) {
        try {
            stop(null) // 기존 재생 중지
            val player = MediaPlayer()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                player.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
            } else {
                @Suppress("DEPRECATION")
                player.setAudioStreamType(AudioManager.STREAM_ALARM)
            }

            player.setDataSource(reactApplicationContext, Uri.parse(uri))
            player.isLooping = true
            player.setVolume(volume, volume)
            player.prepare()
            player.start()
            mediaPlayer = player
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("PLAY_ERROR", e.message, e)
        }
    }

    /** 재생을 멈추고 리소스를 해제합니다. */
    @ReactMethod
    fun stop(promise: Promise?) {
        try {
            mediaPlayer?.let {
                if (it.isPlaying) it.stop()
                it.release()
            }
            mediaPlayer = null
            promise?.resolve(null)
        } catch (e: Exception) {
            promise?.reject("STOP_ERROR", e.message, e)
        }
    }

    /**
     * 앱을 백그라운드로 이동합니다.
     * BackHandler.exitApp() 대신 사용하여 AlarmManager가 앱을 재시작할 수 있도록 합니다.
     */
    @ReactMethod
    fun moveToBackground(promise: Promise) {
        try {
            reactApplicationContext.currentActivity?.moveTaskToBack(true)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("BACKGROUND_ERROR", e.message, e)
        }
    }

    /**
     * 잠금화면 위 표시 플래그를 설정/해제합니다.
     *
     * 알람이 해제된 뒤 false로 호출하면 이후 일반 화면 사용 시
     * 네비게이션 바에 최근 앱 버튼이 정상적으로 표시됩니다.
     * 알람 발동 시 true로 호출하면 잠금화면 위에 화면이 표시됩니다.
     */
    @ReactMethod
    fun setLockScreenFlags(show: Boolean, promise: Promise) {
        try {
            val activity: Activity? = reactApplicationContext.currentActivity
            if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                activity.runOnUiThread {
                    activity.setShowWhenLocked(show)
                    activity.setTurnScreenOn(show)
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("LOCK_SCREEN_ERROR", e.message, e)
        }
    }
}
