# Flash McQueen

Real-time web application interface for mobile robot teleoperation, hosted on a Raspberry Pi and communicating with an onboard microcontroller (ESP32 or Arduino) via USB serial.

## Project Architecture
```text
Client Device (Phone/PC Browser)
  | WebSockets (Wi-Fi)
  v
Raspberry Pi (Flask + SocketIO Server)
  | USB Serial Communications (/dev/ttyUSB0 or /dev/ttyACM0)
  v
ESP32 / Arduino Microcontroller
  | GPIO / PWM Pins
  v
Motor Driver & Wheels
```
## Repository Structure
```text
rpi-gui/
├── README.md               # Project documentation
├── app.py                  # Python server script (Flask, SocketIO, PySerial)
├── firmware/
│   ├── arduino_firmware.ino# Arduino microcontroller firmware
│   ├── esp32_firmware.ino  # ESP32 microcontroller firmware
│   └── README.md           # Microcontroller flashing guide
├── static/
│   ├── css/
│   │   └── style.css       # UI stylesheet
│   └── js/
│       └── main.js         # Touch event handling and WebSocket client
└── templates/
    └── index.html          # HTML structure
```

## Quick Start Guide

### 1. Flash Microcontroller Firmware
Flash either `arduino_firmware.ino` or `esp32_firmware.ino` onto your microcontroller using the Arduino IDE prior to running the web server. Refer to `firmware/README.md` for complete flashing steps.

### 2. Copy Repository to Raspberry Pi
Transfer the repository folder from your host computer to the Raspberry Pi:
```text
scp -r rpi-gui pi@<RASPBERRY_PI_IP>:~/
```
### 3. Install Python Dependencies
Connect to the Raspberry Pi via SSH and install the required dependencies:

```text
ssh pi@<RASPBERRY_PI_IP>
cd ~/rpi-gui
pip install flask flask-socketio eventlet pyserial
```

if you get an error installing the packages, try creating a venve and use it to install them and run the script : 

```text
sudo apt update
sudo apt install -y python3-venv python3-full
cd ~/rpi-gui
python3 -m venv venv
source venv/bin/activate
pip install flask flask-socketio eventlet pyserial
```

### 4. Run the Application
1. Connect the flashed microcontroller to a USB port on the Raspberry Pi.
2. Launch the Python web server:

```text
python3 app.py
```

3. Open a browser on any device connected to the same Wi-Fi network and navigate to:

http://<RASPBERRY_PI_IP>:5000

## Technical Stack

- Backend: Python 3, Flask, Flask-SocketIO, PySerial
- Frontend: HTML5, CSS3, JavaScript (ES6, Socket.IO Client API)
- Embedded: C++ / Arduino Framework
