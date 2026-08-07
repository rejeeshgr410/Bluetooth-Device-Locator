package com.example.warmer.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.warmer.signal.Confidence
import com.example.warmer.signal.Crumb
import com.example.warmer.signal.Estimate
import kotlin.math.max
import kotlin.math.min

@Composable
fun TrackMap(
    track: List<Pair<Float, Float>>,
    crumbs: List<Crumb>,
    estimate: Estimate,
    fixX: Float,
    fixY: Float,
    heading: Float,
    modifier: Modifier = Modifier,
    sizeDp: Dp = 320.dp
) {
    val xs = track.map { it.first } + crumbs.map { it.x } + listOf(fixX, estimate.x)
    val ys = track.map { it.second } + crumbs.map { it.y } + listOf(fixY, estimate.y)
    val minX = min(xs.minOrNull() ?: -2f, -2f)
    val maxX = max(xs.maxOrNull() ?: 2f, 2f)
    val minY = min(ys.minOrNull() ?: -2f, -2f)
    val maxY = max(ys.maxOrNull() ?: 2f, 2f)
    val cx = (minX + maxX) / 2f
    val cy = (minY + maxY) / 2f
    val span = maxOf(maxX - minX, maxY - minY, 6f) * 1.2f

    Box(
        modifier = modifier
            .size(sizeDp)
            .background(InkRaised, shape = RoundedCornerShape(4.dp))
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val sz = size.width
            val scale = sz / span
            fun toScreen(x: Float, y: Float): Offset {
                return Offset(
                    x = sz / 2f + (x - cx) * scale,
                    y = sz / 2f - (y - cy) * scale
                )
            }

            // 4x4 Gridlines
            listOf(0.25f, 0.5f, 0.75f).forEach { f ->
                drawLine(Hairline, Offset(sz * f, 0f), Offset(sz * f, sz), strokeWidth = 1.dp.toPx())
                drawLine(Hairline, Offset(0f, sz * f), Offset(sz, sz * f), strokeWidth = 1.dp.toPx())
            }

            // Track dots
            track.forEachIndexed { i, pt ->
                val p = toScreen(pt.first, pt.second)
                val alpha = 0.12f + (i / max(1f, track.size.toFloat())) * 0.4f
                drawCircle(TextWhite.copy(alpha = alpha), radius = 1.5.dp.toPx(), center = p)
            }

            // Amber crumbs
            val strongest = if (crumbs.isNotEmpty()) crumbs.maxOf { it.rssi } else 0f
            val weakest = if (crumbs.isNotEmpty()) crumbs.minOf { it.rssi } else 0f
            val range = maxOf(1f, strongest - weakest)

            crumbs.forEach { k ->
                val p = toScreen(k.x, k.y)
                val strength = (k.rssi - weakest) / range
                val r = (4.dp.toPx() + strength * 7.dp.toPx())
                drawCircle(Amber.copy(alpha = 0.25f + strength * 0.6f), radius = r, center = p)
                if (k.manual) {
                    drawCircle(TextWhite, radius = r, center = p, style = Stroke(width = 1.5.dp.toPx()))
                }
            }

            // Centroid target ring
            if (crumbs.size >= 2) {
                val estP = toScreen(estimate.x, estimate.y)
                val color = if (estimate.confidence == Confidence.GOOD) Warm else TextMuted
                drawCircle(color, radius = 20.dp.toPx(), center = estP, style = Stroke(width = 1.dp.toPx()))
                drawCircle(color, radius = 3.dp.toPx(), center = estP)
            }

            // User triangle
            val userP = toScreen(fixX, fixY)
            rotate(degrees = heading, pivot = userP) {
                val path = Path().apply {
                    moveTo(userP.x, userP.y - 10.dp.toPx())
                    lineTo(userP.x - 6.dp.toPx(), userP.y + 6.dp.toPx())
                    lineTo(userP.x + 6.dp.toPx(), userP.y + 6.dp.toPx())
                    close()
                }
                drawPath(path, TextWhite)
            }
        }

        Text(
            text = "${span.toInt()} m across",
            fontFamily = FontFamily.Monospace,
            fontSize = 9.sp,
            color = Hairline,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(8.dp)
        )
    }
}
