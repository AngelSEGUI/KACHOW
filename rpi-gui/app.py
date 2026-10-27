import os
import time
import serial
import glob
import io
from flask import Flask, render_template, Response
from flask_socketio import SocketIO

# Import Picamera2 for Camera Module 3
try:
    from picamera2 import Picamera2
    camera_available = True
except ImportError:
    camera_available = False
    print("[WARNING] Picamera2 not found. Video streaming disabled.")

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# --- Reset USB Bus for ESP32-P4 ---
def reset_usb_bus():
    print("[INFO] Resetting USB bus to revive ESP32 connection...")
    try:
        os.system('echo "1-1" | sudo tee /sys/bus/usb/drivers/usb/unbind > /dev/null 2>&1')
        time.sleep(0.5)
        os.system('echo "1-1" | sudo tee /sys/bus/usb/drivers/usb/bind > /dev/null 2>&1')
        time.sleep(1.5)
    except Exception as e:
        print(f"[WARNING] Could not cycle USB bus: {e}")

reset_usb_bus()

# --- ESP32 Serial Initialization ---
def find_esp32_port():
    ports = glob.glob('/dev/ttyUSB*') + glob.glob('/dev/ttyACM*')
    return ports[0] if ports else None

esp32_port = find_esp32_port()
ser = None

if esp32_port:
    try:
        ser = serial.Serial(
            port=esp32_port,
            baudrate=115200,
            timeout=0.1,
            dsrdtr=False,
            rtscts=False,
            xonxoff=False
        )
        print("[INFO] Waiting 2s for ESP32 boot sequence...")
        time.sleep(2)
        ser.reset_input_buffer()
        ser.reset_output_buffer()
        print(f"[INFO] ESP32 successfully connected on {esp32_port}")
    except Exception as e:
        print(f"[ERROR] Could not open serial port {esp32_port}: {e}")
else:
    print("[WARNING] No ESP32 detected on USB ports. Running in dry-run mode.")

# --- Camera Module 3 Setup ---
picam2 = None
if camera_available:
    try:
        picam2 = Picamera2()
        # Configure 640x480 resolution for high FPS and ultra-low video latency
        camera_config = picam2.create_preview_configuration(main={"size": (640, 480)})
        picam2.configure(camera_config)
        picam2.start()
        print("[INFO] Camera Module 3 initialized successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to initialize Camera Module 3: {e}")
        picam2 = None

def generate_camera_frames():
    """Generates MJPEG stream frames from Camera Module 3."""
    while True:
        if picam2:
            try:
                # Capture JPEG image into memory buffer
                stream = io.BytesIO()
                picam2.capture_file(stream, format='jpeg')
                frame = stream.getvalue()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
            except Exception as e:
                time.sleep(0.1)
        else:
            time.sleep(0.5)

# --- Routes & WebSocket Event Handlers ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    """Video streaming route for the camera feed."""
    return Response(generate_camera_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

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