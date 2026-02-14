package com.sanitassync

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import javax.annotation.Nullable

class SanitasSyncService : HeadlessJsTaskService() {

    // CORRECTION ICI : Ajout du "?" après Intent pour autoriser les valeurs nulles
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        // "SanitasSync" est la clé utilisée dans index.js
        // On utilise le safe call (?.) car intent peut être null
        return intent?.extras?.let {
            HeadlessJsTaskConfig(
                "SanitasSync",
                Arguments.fromBundle(it),
                5000, // Timeout pour le démarrage
                true // Autorisé en premier plan (Foreground)
            )
        }
    }
}