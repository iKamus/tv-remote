# TvRemote

App **React Native (JS puro, sin Expo)** + PWA para controlar la TV Philips
32PHG5102/77 via API JointSpace v1. Control 100% local (mismo WiFi que la TV);
sin chip, sin internet, sin servidores.

## Estado

- `pwa/index.html` — prototipo de testeo (HTML+JS plano): control remoto con
  botones (power, vol, canal, flechas, OK, back) + deteccion automatica de la TV
  por escaneo de subred (prueba `:1925/1/system` en cada IP; verificado: detecta
  la TV por su modelo). IP editable y guardada en localStorage.
- `app/` — app **React Native 0.87 (JS puro, sin TypeScript, sin Expo)**:
  11 botones + IP editable (AsyncStorage) + escaneo por lotes + **WOL para
  encender** (UDP broadcast, lo que el navegador no puede). Compila a APK con
  Gradle (`android/gradlew.bat assembleRelease`).
- `server.js` — mini server Node (sin deps) que sirve `pwa/` en `:8080` para
  probar la PWA desde el celular (Chromium bloquea fetch a IPs privadas desde
  `file://`).

## Datos verificados (2026-08-17)

- TV: Philips 32PHG5102/77 (modelo Argentina, gama PHG/NetTV)
- IP: 192.168.0.12 (DHCP — CAMBIA, ver historial: 2026-08-17 estaba en .11; reservar IP estatica en el router cuando se pueda)
- API: JointSpace v1, HTTP puerto 1925, sin autenticacion, CORS abierto (`Access-Control-Allow-Origin: *`)
- Endpoints que responden:
  - `GET /1/system`
  - `GET /1/audio/volume` -> `{"muted":false,"current":10,"min":0,"max":60}`
  - `GET /1/channels/current` -> `{"id":"4_4719360"}`
  - `GET /1/ambilight/measured`
  - `GET /1/powerstate` -> `{"powerstate":"On"}`
- Control (verificado que responde 200):
  - `POST /1/input/key` body `{"key":"VolumeUp"}` (teclas: VolumeUp/Down, Mute, Home, Source, CursorUp/Down/Left/Right, Confirm, Back, Exit, ChannelStepUp/Down, Digit0-9, Standby)
  - `POST /1/audio/volume` body `{"current":30}` (rango 0-60)
  - `POST /1/channels/current` body `{"id":"..."}`
- Encendido desde standby: por WOL (magic packet UDP, MAC 70:C9:4E:09:E5:DD) — implementado en la app RN

## Requisitos

- Celular y TV en el mismo WiFi (funciona aunque no haya internet)
- PWA: cualquier navegador; servirla con `node server.js` (no desde `file://`)
- App RN: APK instalable (Android); build con JDK 17 + Android SDK

## Build del APK

```
cd app
npm install
cd android
gradlew.bat assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```