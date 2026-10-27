#include <Arduino.h>

// --- Wheel Pin Mapping ---
// M1 = Front-Left, M2 = Front-Right, M3 = Rear-Left, M4 = Rear-Right
const int M1_DIR = 4;   // IO04 -> M1 Direction control
const int M1_PWM = 5;   // IO05 -> M1 PWM speed control
const int M2_DIR = 20;  // IO20 -> M2 Direction control
const int M2_PWM = 21;  // IO21 -> M2 PWM speed control
const int M3_DIR = 22;  // IO22 -> M3 Direction control
const int M3_PWM = 23;  // IO23 -> M3 PWM speed control
const int M4_DIR = 31;  // IO31 -> M4 Direction control
const int M4_PWM = 32;  // IO32 -> M4 PWM speed control

// Speed presets (0 - 255)
const int MOVE_SPEED = 200;
const int TURN_SPEED = 180;

void setMotor(int dirPin, int pwmPin, bool direction, int speed) {
  digitalWrite(dirPin, direction ? HIGH : LOW);
  analogWrite(pwmPin, speed);
}

void stopMotors() {
  analogWrite(M1_PWM, 0);
  analogWrite(M2_PWM, 0);
  analogWrite(M3_PWM, 0);
  analogWrite(M4_PWM, 0);
}

void driveForward() {
  // Left side motors (M1, M3) forward, Right side motors (M2, M4) forward
  setMotor(M1_DIR, M1_PWM, true, MOVE_SPEED);
  setMotor(M2_DIR, M2_PWM, true, MOVE_SPEED);
  setMotor(M3_DIR, M3_PWM, true, MOVE_SPEED);
  setMotor(M4_DIR, M4_PWM, true, MOVE_SPEED);
}

void driveBackward() {
  // Left side motors (M1, M3) reverse, Right side motors (M2, M4) reverse
  setMotor(M1_DIR, M1_PWM, false, MOVE_SPEED);
  setMotor(M2_DIR, M2_PWM, false, MOVE_SPEED);
  setMotor(M3_DIR, M3_PWM, false, MOVE_SPEED);
  setMotor(M4_DIR, M4_PWM, false, MOVE_SPEED);
}

void turnLeft() {
  // Skid-steer / Differential drive: Left motors reverse, Right motors forward
  setMotor(M1_DIR, M1_PWM, false, TURN_SPEED);
  setMotor(M2_DIR, M2_PWM, true,  TURN_SPEED);
  setMotor(M3_DIR, M3_PWM, false, TURN_SPEED);
  setMotor(M4_DIR, M4_PWM, true,  TURN_SPEED);
}

void turnRight() {
  // Skid-steer / Differential drive: Left motors forward, Right motors reverse
  setMotor(M1_DIR, M1_PWM, true,  TURN_SPEED);
  setMotor(M2_DIR, M2_PWM, false, TURN_SPEED);
  setMotor(M3_DIR, M3_PWM, true,  TURN_SPEED);
  setMotor(M4_DIR, M4_PWM, false, TURN_SPEED);
}

void setup() {
  Serial.begin(115200);

  // Initialize motor control pins as outputs
  pinMode(M1_DIR, OUTPUT);
  pinMode(M1_PWM, OUTPUT);
  pinMode(M2_DIR, OUTPUT);
  pinMode(M2_PWM, OUTPUT);
  pinMode(M3_DIR, OUTPUT);
  pinMode(M3_PWM, OUTPUT);
  pinMode(M4_DIR, OUTPUT);
  pinMode(M4_PWM, OUTPUT);

  stopMotors();
}

void loop() {
  if (Serial.available() > 0) {
    char command = Serial.read();

    switch (command) {
      case 'F': driveForward();  break;
      case 'B': driveBackward(); break;
      case 'L': turnLeft();      break;
      case 'R': turnRight();     break;
      case 'S': stopMotors();    break;
      default:  stopMotors();    break;
    }
  }
}