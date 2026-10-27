# Microcontroller Firmware Instructions

This folder contains the embedded code for both microcontrollers used in the robot architecture. Each code must be flashed individually using the **Arduino IDE** before running the main Raspberry Pi web server.

---

## 1. Arduino Firmware (`arduino_firmware.ino`)

1. Connect the **Arduino** directly to your computer using a USB cable.
2. Open `arduino_firmware.ino` in the **Arduino IDE**.
3. Select your board under **Tools > Board** (e.g., *Arduino Uno* or *Arduino Mega*).
4. Select the correct serial port under **Tools > Port**.
5. Click **Upload** (or press `Ctrl + U` / `Cmd + U`).

---

## 2. ESP32 Firmware (`esp32_firmware.ino`)

1. Connect the **ESP32** directly to your computer using a USB cable.
2. Open `esp32_firmware.ino` in the **Arduino IDE**.
3. Select your board under **Tools > Board** (e.g., *ESP32 Dev Module*).
   * *Note: Ensure the ESP32 board package is installed via `Preferences > Additional Boards Manager URLs` if not already visible.*
4. Select the correct serial port under **Tools > Port**.
5. Set the **Baud Rate** to `115200` in your code and monitor.
6. Click **Upload** (press and hold the `BOOT` button on the ESP32 if the IDE gets stuck on `Connecting...`).

---

> **Note:** Firmware flashing only needs to be completed once. Both microcontrollers store the compiled code in non-volatile flash memory and will retain it across reboots. Once flashed, connect both microcontrollers to the Raspberry Pi over USB.