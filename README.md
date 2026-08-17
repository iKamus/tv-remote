# TvRemote

App **React Native (JS puro, sin Expo)** + PWA para controlar la TV Philips
32PHG5102/77 via API JointSpace v1. Control 100% local (mismo WiFi que la TV);
sin chip, sin internet, sin servidores.

## Estado

- `app/` — app **React Native 0.87 (JS puro, sin TypeScript, sin Expo)**:
  botones (power, vol, canal, flechas, OK, back, home, **netflix**, **modo TV**),
  IP editable (AsyncStorage), escaneo de subred por lotes (Promise.race, sin
  AbortController — no funciona en RN) y **WOL** para encender (UDP broadcast,
  lo que el navegador no puede). APK generado en la raiz: `TvRemote.apk`
  (no se sube a git, >50MB).
- `pwa/index.html` — prototipo HTML+JS plano, misma funcionalidad de botones
  (sin WOL). Servir con `node server.js` (Chromium bloquea fetch a IPs
  privadas desde `file://`).
- `server.js` — mini server Node (sin deps) que sirve `pwa/` en `:8080`.

## Datos verificados (2026-08-17)

- TV: Philips 32PHG5102/77 (modelo Argentina, gama PHG/NetTV)
- IP: 192.168.0.11 (DHCP — CAMBIA: estuvo en .12; reservar IP estatica en el router, MAC 70:C9:4E:09:E5:DD)
- API: JointSpace v1, HTTP puerto 1925, sin autenticacion, CORS abierto
- `GET /1/system`, `GET /1/audio/volume`, `GET /1/channels/current`, `GET /1/ambilight/measured`, `GET /1/powerstate` (`{"powerstate":"On"}`)
- `POST /1/input/key` body `{"key":"VolumeUp"}` (teclas verificadas: VolumeUp/Down, ChannelStepUp/Down, CursorUp/Down/Left/Right, Confirm, Back, Home, WatchTV, Standby, Netflix)
- Encendido desde standby: WOL magic packet UDP a `subnet.255:9`, MAC `70:C9:4E:09:E5:DD`

## Requisitos

- Celular y TV en el mismo WiFi (funciona sin internet)
- App RN: Android (APK); build con JDK 17 + Android SDK

## Build del APK

```
cd app
npm install
cd android
gradlew.bat assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```