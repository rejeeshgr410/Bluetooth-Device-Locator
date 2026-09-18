package com.bluetooth.locator.haptics;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Short proximity pulses for the hunt screen.
 *
 * Android 13+ classifies any short vibration without attributes as touch feedback
 * (USAGE_TOUCH), and drops it when the user has system touch feedback switched off.
 * The Haptics plugin and the WebView's navigator.vibrate both hit that. These pulses
 * are a feature the user turned on in the app, so they are tagged as alarm usage,
 * which Android delivers regardless of the touch-feedback setting.
 */
@CapacitorPlugin(name = "ProximityHaptics")
public class ProximityHapticsPlugin extends Plugin {

    private Vibrator vibrator;

    @Override
    public void load() {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = manager.getDefaultVibrator();
        } else {
            vibrator = getLegacyVibrator(context);
        }
    }

    @SuppressWarnings("deprecation")
    private Vibrator getLegacyVibrator(Context context) {
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }

    @PluginMethod
    public void pulse(PluginCall call) {
        int duration = Math.max(5, Math.min(500, call.getInt("duration", 30)));
        if (vibrator == null || !vibrator.hasVibrator()) {
            call.resolve();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            VibrationEffect effect = VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE);
            vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM));
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrateWithAudioAttributes(duration);
        } else {
            vibrateLegacy(duration);
        }
        call.resolve();
    }

    @SuppressWarnings("deprecation")
    private void vibrateWithAudioAttributes(int duration) {
        AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();
        vibrator.vibrate(VibrationEffect.createOneShot(duration, VibrationEffect.DEFAULT_AMPLITUDE), attributes);
    }

    @SuppressWarnings("deprecation")
    private void vibrateLegacy(int duration) {
        vibrator.vibrate(duration);
    }
}
