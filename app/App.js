/**
 * TvRemote - Control remoto Philips 32PHG5102/77 via JointSpace v1
 * @format
 */

import React, { useState, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import UdpSocket from 'react-native-udp';

const TV_MAC = '70:C9:4E:09:E5:DD';
const DEFAULT_IP = '192.168.0.12';
const API_PORT = 1925;

const KEYS = {
  Power: 'Standby',
  VolUp: 'VolumeUp',
  VolDown: 'VolumeDown',
  ChUp: 'ChannelStepUp',
  ChDown: 'ChannelStepDown',
  Back: 'Back',
  Up: 'CursorUp',
  Down: 'CursorDown',
  Left: 'CursorLeft',
  Right: 'CursorRight',
  Ok: 'Confirm',
};

function sendWol(broadcastIp) {
  return new Promise((resolve, reject) => {
    const socket = UdpSocket.createSocket('udp4');
    socket.once('error', err => {
      socket.close();
      reject(err);
    });
    socket.bind(0, () => {
      socket.setBroadcast(true);
      const macHex = TV_MAC.split(':').map(h => parseInt(h, 16));
      const payload = Buffer.alloc(6 + 16 * 6);
      for (let i = 0; i < 6; i++) payload[i] = 0xff;
      for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 6; j++) {
          payload[6 + i * 6 + j] = macHex[j];
        }
      }
      socket.send(payload, 0, payload.length, 9, broadcastIp, () => {
        socket.close();
        resolve(true);
      });
    });
  });
}

function App() {
  const [tvIp, setTvIp] = useState(DEFAULT_IP);
  const [log, setLog] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [localSubnet, setLocalSubnet] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('tvIp').then(ip => {
      if (ip) {
        setTvIp(ip);
        addLog('IP cargada: ' + ip);
        checkConnection(ip);
      } else {
        addLog('Sin IP guardada. Busca la TV automaticamente.');
      }
    });
    NetInfo.fetch().then(state => {
      const ip = state.details && state.details.ipAddress;
      if (ip) {
        const parts = ip.split('.');
        setLocalSubnet(parts.slice(0, 3).join('.'));
        addLog('Red del celular: ' + parts.slice(0, 3).join('.') + '.x');
      }
    });
  }, []);

  function addLog(msg) {
    const stamp = new Date().toLocaleTimeString('es-AR', { hour12: false });
    setLog(prev => [...prev.slice(-30), '[' + stamp + '] ' + msg]);
  }

  function saveIp(ip) {
    const clean = (ip || '').trim();
    if (!clean) return;
    setTvIp(clean);
    AsyncStorage.setItem('tvIp', clean);
    addLog('IP guardada: ' + clean);
    checkConnection(clean);
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function sendKey(keyName) {
    try {
      const res = await fetch('http://' + tvIp + ':' + API_PORT + '/1/input/key', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ key: KEYS[keyName] }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (err) {
      addLog('Fallo ' + keyName + ': ' + err.message + ' (' + tvIp + ')');
    }
  }

  async function checkConnection(ip) {
    try {
      const d = await fetchJson('http://' + ip + ':' + API_PORT + '/1/powerstate');
      addLog('Conectado a ' + ip + ' - TV ' + (d.powerstate === 'On' ? 'encendida' : 'apagada'));
    } catch (err) {
      addLog('Sin conexion a ' + ip + ' (' + err.message + ')');
    }
  }

  async function powerPress() {
    try {
      const d = await fetchJson('http://' + tvIp + ':' + API_PORT + '/1/powerstate');
      if (d.powerstate === 'On') {
        sendKey('Power');
        addLog('Apagando TV...');
      } else {
        addLog('TV apagada - enviando WOL...');
        const subnet = localSubnet || tvIp.split('.').slice(0, 3).join('.');
        try {
          await sendWol(subnet + '.255');
          addLog('WOL enviado a ' + subnet + '.255:9');
        } catch (err) {
          addLog('WOL fallo: ' + err.message);
        }
      }
    } catch (err) {
      addLog('No pude consultar estado en ' + tvIp + ' (' + err.message + ')');
    }
  }

  function scanTv() {
    const subnet = localSubnet || tvIp.split('.').slice(0, 3).join('.');
    const found = [];
    const ips = [];
    for (let i = 1; i <= 254; i++) ips.push(i);
    const BATCH = 20;
    setScanning(true);
    setScanMsg('Escaneando ' + subnet + '.1-254...');

    function tryIp(i) {
      const ip = subnet + '.' + i;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 600);
      return fetch('http://' + ip + ':' + API_PORT + '/1/system', { signal: ctrl.signal })
        .then(r => {
          if (r.status === 200) return r.json();
          throw new Error('no');
        })
        .then(d => {
          clearTimeout(timer);
          if (d && d.name) found.push(ip + ' (' + d.name + ')');
        })
        .catch(() => clearTimeout(timer));
    }

    function runBatch(start) {
      const batch = ips.slice(start, start + BATCH).map(tryIp);
      setScanMsg('Escaneando... ' + Math.min(start + BATCH, 254) + '/254');
      return Promise.all(batch).then(() => {
        if (start + BATCH < 254) return runBatch(start + BATCH);
      });
    }

    runBatch(0).then(() => {
      setScanning(false);
      if (found.length === 0) {
        setScanMsg('No se encontro ninguna TV. ¿El celular esta en el mismo WiFi?');
        addLog('Escaneo de ' + subnet + '.x sin resultados');
        return;
      }
      const first = found[0].split(' ')[0];
      setTvIp(first);
      AsyncStorage.setItem('tvIp', first);
      setScanMsg('Encontrada: ' + found.join(' | '));
      addLog('TV configurada: ' + first);
      checkConnection(first);
    });
  }

  function Btn({ name, label, wide, style }) {
    return (
      <TouchableOpacity
        style={[styles.btn, wide && styles.btnWide, style]}
        onPress={() => sendKey(name)}
        activeOpacity={0.7}>
        <Text style={styles.btnText}>{label}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>TvRemote</Text>
        <Text style={styles.subtitle}>Philips JointSpace</Text>
      </View>

      <View style={styles.ipRow}>
        <TextInput
          style={styles.input}
          value={tvIp}
          onChangeText={setTvIp}
          keyboardType="numeric"
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.smallBtn} onPress={() => saveIp(tvIp)} activeOpacity={0.7}>
          <Text style={styles.smallBtnText}>Guardar</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.scanBtn} onPress={scanTv} disabled={scanning} activeOpacity={0.7}>
        {scanning ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.scanBtnText}>Buscar TV automaticamente</Text>
        )}
      </TouchableOpacity>
      {scanMsg !== '' && <Text style={styles.scanMsg}>{scanMsg}</Text>}

      <View style={styles.dpad}>
        <Btn name="Up" label="▲" wide />
        <View style={styles.dpadRow}>
          <Btn name="Left" label="◀" />
          <Btn name="Ok" label="OK" />
          <Btn name="Right" label="▶" />
        </View>
        <Btn name="Down" label="▼" wide />
      </View>

      <View style={styles.row}>
        <Btn name="Back" label="RETROCEDER" wide />
        <Btn name="Power" label="POWER" wide />
      </View>
      <View style={styles.row}>
        <Btn name="VolUp" label="VOL +" wide />
        <Btn name="ChUp" label="CANAL +" wide />
      </View>
      <View style={styles.row}>
        <Btn name="VolDown" label="VOL -" wide />
        <Btn name="ChDown" label="CANAL -" wide />
      </View>

      <ScrollView style={styles.logBox}>
        {log.map((l, i) => (
          <Text key={i} style={styles.logLine}>
            {l}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: '#101418',
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#8a94a6',
    fontSize: 12,
  },
  ipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1b2129',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  smallBtn: {
    backgroundColor: '#2a3340',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  smallBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  scanBtn: {
    backgroundColor: '#0e5fd8',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  scanBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  scanMsg: {
    color: '#9fb3c8',
    fontSize: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  dpad: {
    alignItems: 'center',
    marginVertical: 8,
  },
  dpadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
  },
  btn: {
    backgroundColor: '#2a3340',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  btnWide: {
    flex: 1,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logBox: {
    flex: 1,
    marginTop: 10,
    backgroundColor: '#0b0e12',
    borderRadius: 8,
    padding: 8,
  },
  logLine: {
    color: '#7ee787',
    fontSize: 12,
    fontFamily: 'monospace',
    marginVertical: 1,
  },
});

export default App;