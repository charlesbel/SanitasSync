package com.sanitassync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

class ServiceRestartReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.d("ServiceRestartReceiver", "Service restart requested")
        
        val prefs = context.getSharedPreferences("SanitasSync", Context.MODE_PRIVATE)
        val shouldBeActive = prefs.getBoolean("service_was_active", false)
        
        if (shouldBeActive) {
            Log.d("ServiceRestartReceiver", "Restarting service")
            val serviceIntent = Intent(context, SanitasSyncService::class.java)
            serviceIntent.putExtra("source", "restart_receiver")
            HeadlessJsTaskService.acquireWakeLockNow(context)
            context.startForegroundService(serviceIntent)
        }
    }
}