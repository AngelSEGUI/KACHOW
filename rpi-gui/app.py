import os
import time
import serial
import glob
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
# Use threading mode to prevent Eventlet execution delays
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

def reset_usb_bus():
    """Unbinds and re-binds Raspberry Pi USB drivers to force a physical USB re-enumeration."""
    print("[INFO] Resetting USB bus to revive ESP32 connection...")
    try:
        # Force USB host controller unbind/rebind cycle
        os.system('echo "1-1" | sudo tee /sys/bus/usb/drivers/usb/unbind > /dev/null 2>&1')
        time.sleep(0.5)
        os.system('echo "1-1" | sudo tee /sys/bus/usb/drivers/usb/bind > /dev/null 2>&1')
        time.sleep(1.5)
    except Exception as e:
        print(f"[WARNING] Could not cycle USB bus: {e}")

# Run USB power cycle before opening the serial port
reset_usb_bus()

def find_esp32_port():
    ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
    return ports[0] if ports else None

esp32_port = find_esp32_port()
ser = None

if esp32_port:
    try:
        # Standard PySerial initialization without write_timeout deadlocks
        ser = serial.Serial(
            port=esp32_port,
            baudrate=115200,
            timeout=0.1,
            dsrdtr=False,
            rtscts=False,
            xonxoff=False
        )
        
        print("[INFO] Waiting 2 seconds for ESP32 boot sequence...")
        time.sleep(2)
        
        ser.reset_input_buffer()
        ser.reset_output_buffer()
        print(f"[INFO] ESP32 successfully connected on {esp32_port}")
    except Exception as e:
        print(f"[ERROR] Could not open serial port {esp32_port}: {e}")
else:
    print("[WARNING] No ESP32 detected on USB ports. Running in dry-run mode.")

def send_command(cmd_char):
    global ser
    if ser and ser.is_open:
        try:
            ser.write(cmd_char.encode('utf-8'))
            print(f"Sent to ESP32: {cmd_char}")
        except serial.SerialTimeoutException:
            print("[WARNING] Serial write timed out!")
        except Exception as e:
            print(f"[ERROR] Failed to send command: {e}")
    else:
        print(f"Dry-run command: {cmd_char}")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('move')
def handle_move(data):
    direction = data.get('direction')
    
    command_map = {
        'forward': 'F',
        'backward': 'B',
        'left': 'L',
        'right': 'R',
        'stop': 'S'
    }
    
    cmd = command_map.get(direction, 'S')
    send_command(cmd)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)