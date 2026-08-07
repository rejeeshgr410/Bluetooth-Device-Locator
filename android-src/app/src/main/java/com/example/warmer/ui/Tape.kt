package com.example.warmer.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.warmer.signal.fill

@Composable
fun Tape(
    history: List<Float>,
    modifier: Modifier = Modifier,
    height: Dp = 150.dp
) {
    val slots = 60
    val recent = history.takeLast(slots)
    val padCount = maxOf(0, slots - recent.size)
    val cells: List<Float?> = List(padCount) { null } + recent.map { it as Float? }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .background(InkRaised, shape = RoundedCornerShape(4.dp))
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height

            // Hairline grid levels
            listOf(-45f, -60f, -72f, -85f).forEach { line ->
                val lineY = h - (fill(line) * h)
                drawLine(
                    color = Hairline,
                    start = Offset(0f, lineY),
                    end = Offset(w, lineY),
                    strokeWidth = 1.dp.toPx()
                )
            }

            // Phosphor trace bars
            val barWidth = w / slots.toFloat()
            cells.forEachIndexed { i, rssiVal ->
                if (rssiVal != null) {
                    val age = i / slots.toFloat()
                    val fillRatio = fill(rssiVal)
                    val barH = maxOf(2.dp.toPx(), fillRatio * h)
                    val opacity = 0.18f + age * 0.82f

                    drawRect(
                        color = Amber.copy(alpha = opacity),
                        topLeft = Offset(i * barWidth + 1f, h - barH),
                        size = Size(maxOf(1f, barWidth - 2f), barH)
                    )
                }
            }
        }
    }
}
