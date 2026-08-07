package com.example.warmer.signal

import kotlin.math.pow
import kotlin.math.max
import kotlin.math.min

const val STALE_AFTER_MS = 5000L

fun ema(previous: Float?, sample: Float, alpha: Float = 0.28f): Float {
    if (previous == null || previous.isNaN()) return sample
    return previous + alpha * (sample - previous)
}

fun clamp(value: Float, minVal: Float, maxVal: Float): Float {
    return max(minVal, min(maxVal, value))
}

data class Band(
    val key: String,
    val label: String,
    val hint: String
)

fun band(rssi: Float): Band {
    return when {
        rssi >= -45f -> Band("reach", "ARM'S REACH", "Look down. Under, behind, inside something.")
        rssi >= -60f -> Band("table", "SAME TABLE", "A few steps. Sweep the surfaces near you.")
        rssi >= -72f -> Band("room", "SAME ROOM", "Walk the perimeter and watch the tape.")
        rssi >= -85f -> Band("far", "FAR, OR BEHIND COVER", "Try the next room, or open the drawer.")
        else -> Band("veryFar", "VERY FAR, OR SHIELDED", "Metal and bodies eat signal. Keep moving.")
    }
}

fun fill(rssi: Float): Float {
    return clamp((rssi + 95f) / 55f, 0f, 1f)
}

fun clickIntervalMs(rssi: Float): Long {
    val t = clamp((rssi + 90f) / 40f, 0f, 1f)
    return (1000f * (70f / 1000f).toDouble().pow(t.toDouble())).toLong()
}

fun roughRange(rssi: Float, txPower: Float = -59f, n: Float = 2.4f): String {
    val d = 10.0.pow(((txPower - rssi) / (10f * n)).toDouble())
    return when {
        d < 0.5 -> "under 0.5 m"
        d < 1.5 -> "0.5 – 1.5 m"
        d < 4.0 -> "1.5 – 4 m"
        d < 10.0 -> "4 – 10 m"
        else -> "over 10 m"
    }
}

enum class Trend { WARMER, COLDER, STEADY }

fun trend(history: List<Float>, threshold: Float = 1.5f): Trend {
    if (history.size < 8) return Trend.STEADY
    val window = history.takeLast(12)
    val half = window.size / 2
    val older = window.take(half)
    val recent = window.drop(half)
    val delta = recent.average().toFloat() - older.average().toFloat()
    return when {
        delta > threshold -> Trend.WARMER
        delta < -threshold -> Trend.COLDER
        else -> Trend.STEADY
    }
}

fun kindOf(name: String?): String {
    val n = (name ?: "").lowercase()
    return when {
        n.isEmpty() -> "Unnamed"
        Regex("airpod|buds|headphone|wh-|wf-|beats").containsMatchIn(n) -> "Earbuds"
        Regex("watch|band|fit|garmin").containsMatchIn(n) -> "Watch"
        Regex("iphone|galaxy|pixel|redmi|oneplus|phone").containsMatchIn(n) -> "Phone"
        Regex("ipad|tab\\b").containsMatchIn(n) -> "Tablet"
        Regex("macbook|laptop|thinkpad").containsMatchIn(n) -> "Laptop"
        Regex("tile|airtag|tracker|smarttag").containsMatchIn(n) -> "Tracker"
        Regex("tv|speaker|soundbar|jbl|bose").containsMatchIn(n) -> "Audio"
        else -> "Device"
    }
}
