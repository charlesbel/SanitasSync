package com.sanitassync

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || 
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            
            Log.d("BootReceiver", "Boot completed - Checking if service should restart")
            
            // Vérifier si le service était actif avant le reboot
            val prefs = context.getSharedPreferences("SanitasSync", Context.MODE_PRIVATE)
            val wasActive = prefs.getBoolean("service_was_active", false)
            
            if (wasActive) {
                Log.d("BootReceiver", "Restarting service after boot")
                // Utiliser HeadlessJS pour redémarrer le service
                val serviceIntent = Intent(context, SanitasSyncService::class.java)
                serviceIntent.putExtra("source", "boot")
                HeadlessJsTaskService.acquireWakeLockNow(context)
                context.startForegroundService(serviceIntent)
            }
        }
    }
}