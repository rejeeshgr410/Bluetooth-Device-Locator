package com.example.warmer.signal

import kotlin.math.*

data class Crumb(
    val id: Int,
    val x: Float,
    val y: Float,
    val rssi: Float,
    val at: Long,
    val manual: Boolean
)

const val PEAK_DROPOFF_DB = 4f
const val PEAK_MIN_MOVE_M = 0.6f

data class PeakCandidate(val x: Float, val y: Float, val rssi: Float)

fun detectPeak(
    candidate: PeakCandidate?,
    sample: PeakCandidate
): Pair<PeakCandidate, PeakCandidate?> {
    if (candidate == null) return Pair(sample, null)

    if (sample.rssi >= candidate.rssi) {
        return Pair(sample, null)
    }

    val moved = hypot(sample.x - candidate.x, sample.y - candidate.y)
    val fallen = candidate.rssi - sample.rssi

    return if (fallen >= PEAK_DROPOFF_DB && moved >= PEAK_MIN_MOVE_M) {
        Pair(sample, candidate)
    } else {
        Pair(candidate, null)
    }
}

enum class Confidence { NONE, LOW, FAIR, GOOD }

data class Estimate(
    val x: Float,
    val y: Float,
    val confidence: Confidence,
    val note: String,
    val spread: Float
)

fun estimate(crumbs: List<Crumb>): Estimate {
    if (crumbs.isEmpty()) {
        return Estimate(0f, 0f, Confidence.NONE, "Walk a loop. Marks drop on their own at every signal peak.", 0f)
    }

    val best = crumbs.maxOf { it.rssi }
    var wx = 0f
    var wy = 0f
    var sum = 0f

    for (c in crumbs) {
        val w = 10.0.pow(((c.rssi - best) / 20f).toDouble()).toFloat()
        wx += c.x * w
        wy += c.y * w
        sum += w
    }

    val x = wx / sum
    val y = wy / sum

    var spread = 0f
    for (a in crumbs) {
        for (b in crumbs) {
            val dist = hypot(a.x - b.x, a.y - b.y)
            if (dist > spread) spread = dist
        }
    }

    return when {
        crumbs.size < 3 -> Estimate(x, y, Confidence.LOW, "Two marks or fewer. Keep walking — three from different spots is the minimum.", spread)
        spread < 3f -> Estimate(x, y, Confidence.LOW, "All marks are close together. Cross the room and come back for a wider baseline.", spread)
        crumbs.size < 5 || spread < 6f -> Estimate(x, y, Confidence.FAIR, "Usable. Another pass at a different angle will tighten it.", spread)
        else -> Estimate(x, y, Confidence.GOOD, "Good baseline. Head for the marker and switch back to the meter for the last few metres.", spread)
    }
}

fun relativeBearing(fromX: Float, fromY: Float, heading: Float, toX: Float, toY: Float): Float {
    val absolute = (atan2(toX - fromX, toY - fromY) * 180f / PI.toFloat())
    var rel = absolute - heading
    while (rel > 180f) rel -= 360f
    while (rel < -180f) rel += 360f
    return rel
}

fun distanceTo(fromX: Float, fromY: Float, toX: Float, toY: Float): Float {
    return hypot(toX - fromX, toY - fromY)
}

fun steer(rel: Float, metres: Float): String {
    if (metres < 1.5f) return "You are on it. Look around your feet."
    val absRel = abs(rel)
    val dir = when {
        absRel < 20f -> "straight ahead"
        absRel > 160f -> "behind you"
        rel > 0f -> if (absRel > 110f) "hard right" else "to your right"
        else -> if (absRel > 110f) "hard left" else "to your left"
    }
    return "${metres.roundToInt()} m $dir"
}
