package co.betafocus.replyhq

import android.content.Context

object AndroidContextHolder {
    private var appContext: Context? = null

    fun init(context: Context) {
        appContext = context.applicationContext
    }

    fun requireContext(): Context {
        return appContext ?: error("AndroidContextHolder is not initialized.")
    }
}
