package com.customalarm.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * AlarmAudioModule
 *
 * STREAM_ALARM 스트림을 사용해 알람 사운드를 재생합니다.
 * STREAM_ALARM은 Android의 무음/진동 모드를 무시하고 소리를 재생합니다.
 * (단, 완전 무음 알람 볼륨이 0이면 소리 없음)
 *
 * JS에서 NativeModules.AlarmAudio.play(uri, volume) / .stop() 으로 사용합니다.
 */
class AlarmAudioModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var mediaPlayer: MediaPlayer? = null

    override fun getName() = "AlarmAudio"

    /**
     * 알람 사운드를 재생합니다.
     * @param uri 오디오 파일 URI (file:// 또는 resource URI)
     * @param volume 볼륨 (0.0 ~ 1.0)
     */
    @ReactMethod
    fun play(uri: String, volume: Double, promise: Promise) {
        try {
            // 기존 재생 중이면 멈춤
            stopInternal()

            val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

            // STREAM_ALARM 볼륨을 최소 1 이상으로 보장 (완전 음소거 방지)
            val maxVol = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            val currentVol = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
            if (currentVol == 0) {
                audioManager.setStreamVolume(
                    AudioManager.STREAM_ALARM,
                    (maxVol * 0.8).toInt(),
                    0
                )
            }

            val player = MediaPlayer()
            player.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)          // STREAM_ALARM과 동등
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )

            val parsedUri = Uri.parse(uri)
            player.setDataSource(reactContext, parsedUri)
            player.isLooping = true
            player.setVolume(volume.toFloat(), volume.toFloat())
            player.prepare()
            player.start()
            mediaPlayer = player

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ALARM_AUDIO_ERROR", e.message, e)
        }
    }

    /**
     * 알람 사운드를 멈춥니다.
     */
    @ReactMethod
    fun stop(promise: Promise) {
        try {
            stopInternal()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ALARM_AUDIO_ERROR", e.message, e)
        }
    }

    /**
     * 앱을 백그라운드로 이동합니다.
     * BackHandler.exitApp()이 호출하는 System.exit(0) 대신 이 메서드를 사용합니다.
     * System.exit(0)은 삼성 One UI에서 강제 종료로 인식되어
     * 이후 AlarmManager가 앱을 재시작하지 못하는 문제가 발생합니다.
     * moveTaskToBack(true)는 홈 버튼을 누른 것과 동일한 효과입니다.
     */
    @ReactMethod
    fun moveToBackground(promise: Promise) {
        try {
            reactContext.currentActivity?.moveTaskToBack(true)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("MOVE_BG_ERROR", e.message, e)
        }
    }

    private fun stopInternal() {
        mediaPlayer?.let {
            if (it.isPlaying) it.stop()
            it.release()
        }
        mediaPlayer = null
    }

    override fun invalidate() {
        super.invalidate()
        stopInternal()
    }
}
