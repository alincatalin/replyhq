package co.betafocus.replyhq

interface Platform {
    val name: String
}

expect fun getPlatform(): Platform