#include <Arduino.h>

// --- Your Working Pin Mapping ---
const int M1_DIR = 4;   const int M1_PWM = 5;
const int M2_DIR = 20;  const int M2_PWM = 21;
const int M3_DIR = 22;  const int M3_PWM = 23;
const int M4_DIR = 31;  const int M4_PWM = 32;

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
  setMotor(M1_DIR, M1_PWM, true, MOVE_SPEED);
  setMotor(M2_DIR, M2_PWM, true, MOVE_SPEED);
  setMotor(M3_DIR, M3_PWM, true, MOVE_SPEED);
  setMotor(M4_DIR, M4_PWM, true, MOVE_SPEED);
}

void driveBackward() {
  setMotor(M1_DIR, M1_PWM, false, MOVE_SPEED);
  setMotor(M2_DIR, M2_PWM, false, MOVE_SPEED);
  setMotor(M3_DIR, M3_PWM, false, MOVE_SPEED);
  setMotor(M4_DIR, M4_PWM, false, MOVE_SPEED);
}

void turnLeft() {
  setMotor(M1_DIR, M1_PWM, false, TURN_SPEED);
  setMotor(M2_DIR, M2_PWM, true,  TURN_SPEED);
  setMotor(M3_DIR, M3_PWM, false, TURN_SPEED);
  setMotor(M4_DIR, M4_PWM, true,  TURN_SPEED);
}

void turnRight() {
  setMotor(M1_DIR, M1_PWM, true,  TURN_SPEED);
  setMotor(M2_DIR, M2_PWM, false, TURN_SPEED);
  setMotor(M3_DIR, M3_PWM, true,  TURN_SPEED);
  setMotor(M4_DIR, M4_PWM, false, TURN_SPEED);
}

void setup() {
  Serial.begin(115200);

  pinMode(M1_DIR, OUTPUT); pinMode(M1_PWM, OUTPUT);
  pinMode(M2_DIR, OUTPUT); pinMode(M2_PWM, OUTPUT);
  pinMode(M3_DIR, OUTPUT); pinMode(M3_PWM, OUTPUT);
  pinMode(M4_DIR, OUTPUT); pinMode(M4_PWM, OUTPUT);

  stopMotors();
}

void loop() {
  if (Serial.available() > 0) {
    char command = Serial.read();

    // Ignore newline and carriage return characters from serial stream
    if (command == '\n' || command == '\r') return;

    switch (command) {
      case 'F': driveForward();  break;
      case 'B': driveBackward(); break;
      case 'L': turnLeft();      break;
      case 'R': turnRight();     break;
      case 'S': stopMotors();    break;
      default:  break; // Do nothing on unknown characters to avoid stopping motors unexpectedly
    }
  }
}