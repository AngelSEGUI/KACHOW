import os
import time
import serial
import glob
import cv2
import numpy as np
from flask import Flask, render_template, Response
from flask_socketio import SocketIO

# Import Picamera2 for Camera Module 3
try:
    from picamera2 import Picamera2
    camera_available = True
except ImportError:
    camera_available = False
    print("[WARNING] Picamera2 not found. Video streaming disabled.")

# Import YOLO from Ultralytics
try:
    from ultralytics import YOLO
    yolo_model = YOLO('yolov8n.pt')
    yolo_available = True
    print("[INFO] YOLOv8 model loaded successfully.")
except Exception as e:
    yolo_available = False
    print(f"[WARNING] Could not load YOLO model: {e}")

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# --- Helper: Get Raspberry Pi CPU Temperature ---
def get_cpu_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp", "r") as f:
            temp_raw = float(f.read().strip())
            return round(temp_raw / 1000.0, 1)
    except Exception:
        return 0.0

def temp_broadcaster():
    """Background task sending CPU temperature every 2 seconds."""
    while True:
        temp = get_cpu_temp()
        socketio.emit('cpu_temp', {'temp': temp})
        time.sleep(2)

# Start background thread for CPU temperature telemetry
socketio.start_background_task(temp_broadcaster)

# --- USB Bus Reset for ESP32-P4 Native USB ---
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
        camera_config = picam2.create_preview_configuration(main={"size": (640, 480)})
        picam2.configure(camera_config)
        picam2.start()
        print("[INFO] Camera Module 3 (IMX708) initialized successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to initialize Camera Module 3: {e}")
        picam2 = None

def generate_camera_frames():
    """Captures camera frames, passes them through YOLO detection, and streams JPEG."""
    while True:
        if picam2:
            try:
                frame_array = picam2.capture_array()
                frame_bgr = cv2.cvtColor(frame_array, cv2.COLOR_RGB2BGR)

                if yolo_available:
                    results = yolo_model(frame_bgr, conf=0.45, verbose=False)
                    for result in results:
                        for box in result.boxes:
                            x1, y1, x2, y2 = map(int, box.xyxy[0])
                            conf = float(box.conf[0])
                            cls = int(box.cls[0])
                            label_name = yolo_model.names[cls]

                            cv2.rectangle(frame_bgr, (x1, y1), (x2, y2), (254, 242, 0), 2)
                            caption = f"{label_name} {conf:.2f}"
                            t_size = cv2.getTextSize(caption, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
                            cv2.rectangle(frame_bgr, (x1, y1 - t_size[1] - 8), (x1 + t_size[0] + 6, y1), (254, 242, 0), -1)
                            cv2.putText(frame_bgr, caption, (x1 + 3, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

                ret, buffer = cv2.imencode('.jpg', frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
                if not ret:
                    continue
                
                frame_bytes = buffer.tobytes()
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
                
                time.sleep(0.01)
            except Exception as e:
                print(f"[ERROR] Camera/YOLO frame error: {e}")
                time.sleep(0.1)
        else:
            time.sleep(0.5)

# --- Routes & WebSocket Handlers ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
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