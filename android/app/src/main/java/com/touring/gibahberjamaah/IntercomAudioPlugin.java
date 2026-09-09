package com.touring.gibahberjamaah;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "IntercomAudio")
public class IntercomAudioPlugin extends Plugin {
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private AudioManager.OnAudioFocusChangeListener focusListener;

    @Override
    public void load() {
        audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        focusListener = focus -> {
            if (focus == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT ||
                    focus == AudioManager.AUDIOFOCUS_LOSS) {
                notifyListeners("audioFocusChanged", new JSObject().put("hasFocus", false));
            } else if (focus == AudioManager.AUDIOFOCUS_GAIN) {
                configureAudioMode();
                notifyListeners("audioFocusChanged", new JSObject().put("hasFocus", true));
            }
        };
    }

    @com.getcapacitor.PluginMethod
    public void startAudioSession(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Izin mikrofon diperlukan");
            return;
        }

        configureAudioMode();
        requestAudioFocus();

        Intent serviceIntent = new Intent(getContext(), IntercomAudioService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(serviceIntent);
        } else {
            getContext().startService(serviceIntent);
        }
        call.resolve(new JSObject().put("started", true));
    }

    @com.getcapacitor.PluginMethod
    public void stopAudioSession(PluginCall call) {
        abandonAudioFocus();
        getContext().stopService(new Intent(getContext(), IntercomAudioService.class));
        if (audioManager != null) {
            audioManager.setMode(AudioManager.MODE_NORMAL);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                audioManager.clearCommunicationDevice();
            } else {
                audioManager.setSpeakerphoneOn(false);
            }
        }
        call.resolve(new JSObject().put("stopped", true));
    }

    @com.getcapacitor.PluginMethod
    public void getAudioState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("mode", audioManager == null ? AudioManager.MODE_NORMAL : audioManager.getMode());
        result.put("wiredHeadset", audioManager != null && audioManager.isWiredHeadsetOn());
        result.put("bluetoothSco", audioManager != null && audioManager.isBluetoothScoOn());
        call.resolve(result);
    }

    private void configureAudioMode() {
        if (audioManager == null) {
            return;
        }
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        audioManager.setSpeakerphoneOn(false);
    }

    private void requestAudioFocus() {
        if (audioManager == null) {
            return;
        }
        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(focusListener)
                    .setAcceptsDelayedFocusGain(false)
                    .build();
            audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            audioManager.requestAudioFocus(
                    focusListener,
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
            );
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else {
            audioManager.abandonAudioFocus(focusListener);
        }
    }
}
