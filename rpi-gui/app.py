import time
import serial
import glob
from flask import Flask, render_template
from flask_socketio import SocketIO

app = Flask(__name__)
# Explicitly use 'threading' mode to avoid Eventlet network delays
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# --- Auto-detect ESP32 Serial Port ---
def find_esp32_port():
    ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
    return ports[0] if ports else None

esp32_port = find_esp32_port()
ser = None

if esp32_port:
    try:
        # write_timeout=0 ensures non-blocking serial transmission
        ser = serial.Serial(esp32_port, 115200, timeout=1, write_timeout=0)
        
        print(f"[INFO] Opening serial port on {esp32_port}. Waiting 2s for ESP32 boot...")
        time.sleep(2)
        
        ser.reset_input_buffer()
        ser.reset_output_buffer()
        print(f"[INFO] ESP32 successfully connected on {esp32_port}")
    except Exception as e:
        print(f"[ERROR] Could not open serial port {esp32_port}: {e}")
else:
    print("[WARNING] No ESP32 detected on USB ports. Running in dry-run mode.")

def send_command(cmd_char):
    if ser and ser.is_open:
        try:
            ser.write(cmd_char.encode('utf-8'))
            ser.flush()  # Force immediate transmission over USB
            print(f"Sent to ESP32: {cmd_char}")
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