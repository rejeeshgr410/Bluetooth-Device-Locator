package expo.modules.classicbluetooth

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Classic Bluetooth (BR/EDR) device discovery.
 *
 * react-native-ble-plx only speaks Bluetooth LE. Phones, most headsets, car
 * stereos and anything predating BLE announce themselves over Classic inquiry
 * instead, which is a different radio mode entirely and invisible to an LE
 * scan. This module wraps BluetoothAdapter.startDiscovery() to cover it.
 *
 * Classic inquiry is not a stream. It runs roughly 12-second bursts and gives
 * one RSSI sample per device per burst, so callers should restart it on
 * onDiscoveryFinished and must not expect the packet cadence an LE scan gives.
 */
private const val TAG = "ClassicBT"

class ClassicBluetoothModule : Module() {
  private var receiver: BroadcastReceiver? = null

  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("No application context available")

  private fun adapter(): BluetoothAdapter? =
    (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  override fun definition() = ModuleDefinition {
    Name("ClassicBluetooth")

    Events("onDeviceFound", "onDiscoveryFinished")

    Function("isSupported") {
      adapter() != null
    }

    /**
     * Everything this phone is paired with, whether or not it is advertising.
     *
     * This is the answer to "why can't I see my earbuds": a connected device
     * stops advertising and stops being discoverable, so no amount of scanning
     * will surface it. But the pairing still exists, and for anything with a
     * BLE side we can open a GATT connection and read its RSSI directly.
     *
     * `type` matters to the caller: DEVICE_TYPE_CLASSIC cannot give RSSI this
     * way, so the UI must not promise tracking for those.
     */
    Function("getBondedDevices") {
      val a = adapter() ?: return@Function emptyList<Map<String, Any?>>()
      try {
        a.bondedDevices.map { d ->
          mapOf(
            "id" to d.address,
            "name" to (try { d.name } catch (_: SecurityException) { null }),
            "type" to when (d.type) {
              BluetoothDevice.DEVICE_TYPE_CLASSIC -> "classic"
              BluetoothDevice.DEVICE_TYPE_LE -> "le"
              BluetoothDevice.DEVICE_TYPE_DUAL -> "dual"
              else -> "unknown"
            },
          )
        }
      } catch (_: SecurityException) {
        // BLUETOOTH_CONNECT not granted; caller shows the permission card.
        emptyList<Map<String, Any?>>()
      }
    }

    AsyncFunction("startDiscovery") {
      val a = adapter() ?: throw CodedException("This device has no Bluetooth adapter")
      if (!a.isEnabled) throw CodedException("Bluetooth is switched off")
      registerReceiver()
      try {
        // A discovery already in flight would make startDiscovery a no-op.
        if (a.isDiscovering) a.cancelDiscovery()
        if (!a.startDiscovery()) {
          throw CodedException("Bluetooth refused to start discovery")
        }
        Log.d(TAG, "startDiscovery accepted")
      } catch (e: SecurityException) {
        // BLUETOOTH_SCAN not granted on Android 12+.
        throw CodedException("Missing Bluetooth scan permission: ${e.message}")
      }
    }

    AsyncFunction("stopDiscovery") {
      try {
        adapter()?.let { if (it.isDiscovering) it.cancelDiscovery() }
      } catch (_: SecurityException) {
        // Nothing useful to do; we are stopping anyway.
      }
      unregisterReceiver()
    }

    OnDestroy {
      try {
        adapter()?.let { if (it.isDiscovering) it.cancelDiscovery() }
      } catch (_: SecurityException) {
      }
      unregisterReceiver()
    }
  }

  private fun registerReceiver() {
    if (receiver != null) return

    val r = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        when (intent?.action) {
          BluetoothDevice.ACTION_FOUND -> {
            val device: BluetoothDevice? =
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
              } else {
                @Suppress("DEPRECATION")
                intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
              }
            if (device == null) return

            val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()
            if (rssi == Short.MIN_VALUE.toInt()) return // no signal reading, useless to us

            // getName() needs BLUETOOTH_CONNECT on Android 12+; a device we can
            // see but cannot name is still worth reporting.
            val name = try {
              device.name
            } catch (_: SecurityException) {
              null
            }

            Log.d(TAG, "found ${device.address} name=$name rssi=$rssi")
            sendEvent(
              "onDeviceFound",
              mapOf(
                "id" to device.address,
                "name" to name,
                "rssi" to rssi,
              ),
            )
          }

          BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
            Log.d(TAG, "discovery finished")
            sendEvent("onDiscoveryFinished", mapOf<String, Any?>())
          }
        }
      }
    }

    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_FOUND)
      addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
    }

    // Android 14+ requires every runtime receiver to declare its export status.
    // ACTION_FOUND is broadcast BY THE SYSTEM, not by us, so this must be
    // EXPORTED. Registering it NOT_EXPORTED compiles, runs, starts discovery
    // happily — and then silently never fires, which is exactly what happened.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(r, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(r, filter)
    }
    Log.d(TAG, "receiver registered")
    receiver = r
  }

  private fun unregisterReceiver() {
    receiver?.let {
      try {
        context.unregisterReceiver(it)
      } catch (_: IllegalArgumentException) {
        // Already gone.
      }
    }
    receiver = null
  }
}
