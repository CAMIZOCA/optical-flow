import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useKeepAwake } from 'expo-keep-awake';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { captureImage, imageUri, prepareImage } from './src/images';
import { claimNext, completeOcr, currentBatch, failScan, getScan, history, listScans, newBatch, retryScan, reviewManually, saveReview } from './src/database';
import { defaultSettings, loadSettings, recognize, storeSettings } from './src/ocr';
import { statusLabels } from './src/domain';
import type { Review, Scan, Settings } from './src/domain';

type Page = 'capture' | 'queue' | 'settings';
const colors = { ink: '#17343a', primary: '#14725f', mint: '#e5f5ee', muted: '#617779', white: '#fff', bg: '#f4f8f7' };

function Button({ title, onPress, disabled, light }: { title: string; onPress: () => void; disabled?: boolean; light?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[styles.button, light && styles.lightButton, disabled && { opacity: .5 }]}>
    <Text style={[styles.buttonText, light && { color: colors.primary }]}>{title}</Text>
  </TouchableOpacity>;
}

function CameraPanel({ onShot, onClose }: { onShot: (uri: string, width: number, height: number) => void; onClose: () => void }) {
  const camera = useRef<CameraView>(null);
  const working = useRef(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  useKeepAwake();

  async function shoot() {
    if (!ready || working.current) return;
    working.current = true;
    try {
      const picture = await camera.current?.takePictureAsync({ quality: 1, skipProcessing: false });
      if (picture) onShot(picture.uri, picture.width, picture.height);
    } catch { setMessage('No se pudo tomar la foto. Intenta de nuevo.'); }
    finally { working.current = false; }
  }

  return <View style={styles.cameraFrame}>
    <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" onCameraReady={() => setReady(true)} />
    <View style={styles.cameraTop}><Button title="Cerrar cámara" onPress={onClose} light /></View>
    <View style={styles.guide} pointerEvents="none" />
    <View style={styles.cameraBottom}>
      {!!message && <Text style={styles.cameraMessage}>{message}</Text>}
      <Text style={styles.cameraHint}>Centra la orden, evita sombras y toma una foto por documento.</Text>
      <TouchableOpacity accessibilityLabel="Tomar foto" accessibilityRole="button" onPress={() => void shoot()} disabled={!ready} style={styles.shutter}><View style={styles.shutterCore} /></TouchableOpacity>
      <Text style={styles.cameraHint}>La cámara seguirá abierta para la siguiente orden.</Text>
    </View>
  </View>;
}

function ScanReview({ scan, onSaved, onBack, onRetry, busy }: {
  scan: Scan; onSaved: (review: Review, approve: boolean) => void; onBack: () => void; onRetry: () => void; busy: boolean;
}) {
  const [name, setName] = useState(scan.name);
  const [cedula, setCedula] = useState(scan.cedula);
  const [documentDate, setDocumentDate] = useState(scan.document_date);
  const [notes, setNotes] = useState(scan.notes);
  const [text, setText] = useState(scan.raw_text);
  const [events, setEvents] = useState<Array<{ action: string; created_at: string }>>([]);
  useEffect(() => { void history(scan.id).then(setEvents).catch(() => undefined); }, [scan.id]);
  const review = () => ({ name, cedula, document_date: documentDate, notes, raw_text: text });

  return <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
    <Button title="← Volver a la lista" onPress={onBack} light />
    <Image source={{ uri: imageUri(scan.optimized_path || scan.original_path) }} style={styles.document} resizeMode="contain" />
    <Text style={styles.caption}>Original preservado · JPEG para OCR {scan.width} × {scan.height} · {Math.round(scan.bytes / 1024)} KB</Text>
    <Text style={styles.title}>Revisar orden</Text>
    <Text style={styles.state}>Estado · {statusLabels[scan.status]}</Text>
    {!!scan.error && <Text style={styles.error}>{scan.error}</Text>}
    {!!scan.warnings && <Text style={styles.notice}>{scan.warnings}</Text>}
    <Text style={styles.label}>Nombre del paciente *</Text>
    <TextInput accessibilityLabel="Nombre del paciente" value={name} onChangeText={setName} style={styles.input} placeholder="Revisar con la fotografía" />
    <Text style={styles.label}>Cédula *</Text>
    <TextInput accessibilityLabel="Cédula" value={cedula} onChangeText={setCedula} style={styles.input} keyboardType="number-pad" placeholder="10 dígitos" />
    <Text style={styles.label}>Fecha de la orden (opcional)</Text>
    <TextInput value={documentDate} onChangeText={setDocumentDate} style={styles.input} placeholder="AAAA-MM-DD" />
    <Text style={styles.label}>Texto extraído y corregido</Text>
    <TextInput accessibilityLabel="Texto extraído" value={text} onChangeText={setText} style={[styles.input, styles.textArea]} multiline textAlignVertical="top" placeholder="El OCR aparecerá aquí. También puedes escribirlo manualmente." />
    <Text style={styles.label}>Observaciones</Text>
    <TextInput value={notes} onChangeText={setNotes} style={styles.input} placeholder="Anota dudas para la revisión" />
    <View style={styles.row}>
      <Button title="Guardar borrador" disabled={busy} onPress={() => onSaved(review(), false)} light />
      <Button title="Marcar revisada" disabled={busy} onPress={() => onSaved(review(), true)} />
    </View>
    {scan.status === 'error' && <Button title="Reintentar OCR" onPress={onRetry} disabled={busy} light />}
    <Text style={styles.label}>Historial de la captura</Text>
    {events.map((item, index) => <Text style={styles.caption} key={index}>{new Date(item.created_at).toLocaleString()} · {item.action}</Text>)}
  </ScrollView>;
}

function Main() {
  const [page, setPage] = useState<Page>('capture');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scans, setScans] = useState<Scan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [batch, setBatch] = useState('');
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const processing = useRef(false);
  const taking = useRef(false);

  const refresh = useCallback(async () => setScans(await listScans()), []);
  useEffect(() => {
    void Promise.all([currentBatch(), loadSettings(), listScans()]).then(([id, config, list]) => {
      setBatch(id); setSettings(config); setScans(list);
    }).catch(e => setError(String(e)));
  }, []);

  const pump = useCallback(async () => {
    if (processing.current || !settings.automatic || !settings.ocrUrl || !settings.token || AppState.currentState !== 'active') return;
    processing.current = true;
    try {
      let next = await claimNext();
      while (next && AppState.currentState === 'active') {
        await refresh();
        try { await completeOcr(next.id, await recognize(next, settings)); }
        catch (e) { await failScan(next.id, e instanceof Error ? e.message : 'Falló el OCR.'); }
        await refresh();
        next = await claimNext();
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo procesar la cola.'); }
    finally { processing.current = false; }
  }, [refresh, settings]);

  useEffect(() => {
    void pump();
    const timer = setInterval(() => { void pump(); }, 3000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void pump(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [pump]);

  async function add(uri: string, width: number, height: number) {
    try {
      const id = await captureImage({ uri, width, height }, batch || await currentBatch());
      await refresh();
      const scan = await getScan(id);
      if (scan.status === 'error') setError(scan.error);
      void pump();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la imagen.'); }
  }

  function capture(uri: string, width: number, height: number) {
    if (taking.current) return;
    taking.current = true;
    void add(uri, width, height).finally(() => { taking.current = false; });
  }

  async function importPhotos() {
    try {
      const response = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1, selectionLimit: 0 });
      if (response.canceled) return;
      setBusy(true);
      for (const image of response.assets) await add(image.uri, image.width, image.height);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron importar las fotos.'); }
    finally { setBusy(false); }
  }

  async function openCamera() {
    try {
      const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
      if (!permission.granted) { setError('Activa el permiso de cámara para tomar fotografías.'); return; }
      setCameraOpen(true);
    } catch (e) { setError(String(e)); }
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const activeScan = scans.find(item => item.id === selected);
  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content" />
    <View style={styles.header}><Text style={styles.brand}>OPTICAL FLOW</Text><Text style={styles.subbrand}>Órdenes antiguas · captura y revisión</Text></View>
    {!!error && <TouchableOpacity onPress={() => setError('')} style={styles.errorBox}><Text style={styles.error}>{error} · Toca para cerrar</Text></TouchableOpacity>}
    {activeScan && !cameraOpen && page === 'queue' ?
      <ScanReview key={activeScan.id} scan={activeScan} busy={busy} onBack={() => setSelected(null)}
        onSaved={(review, approve) => void act(() => saveReview(activeScan.id, review, approve))}
        onRetry={() => void act(async () => {
          if (activeScan.optimized_path) await retryScan(activeScan.id);
          else await prepareImage(activeScan.id);
          void pump();
        })} />
      : page === 'capture' ? cameraOpen ?
        <CameraPanel onShot={capture} onClose={() => setCameraOpen(false)} /> :
        <ScrollView contentContainerStyle={styles.home}>
          <View style={styles.hero}><Text style={styles.heroTitle}>Digitaliza las órdenes antiguas</Text>
            <Text style={styles.heroCopy}>Toma una foto por orden. Se guarda al instante y puedes seguir fotografiando mientras el texto se procesa.</Text>
            <Button title="Abrir cámara" onPress={() => void openCamera()} />
            <Button title="Seleccionar varias fotos" onPress={() => void importPhotos()} disabled={busy} light /></View>
          <Text style={styles.title}>Capturas de hoy</Text>
          <Text style={styles.subbrand}>{scans.length} fotos guardadas · {scans.filter(s => s.status === 'review').length} por revisar</Text>
          {scans.slice(0, 4).map(scan => <TouchableOpacity key={scan.id} style={styles.listItem} onPress={() => { setSelected(scan.id); setPage('queue'); }}>
            <Image source={{ uri: imageUri(scan.thumbnail_path || scan.original_path) }} style={styles.thumb} />
            <View><Text style={styles.listTitle}>{scan.name || 'Orden ' + scan.id.slice(0, 6)}</Text><Text style={styles.caption}>{statusLabels[scan.status]}</Text></View>
          </TouchableOpacity>)}
        </ScrollView>
      : page === 'queue' ?
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.title}>Órdenes guardadas</Text><Text style={styles.subbrand}>Cada foto conserva su estado para revisar y reintentar.</Text>
          <Button title="Iniciar otro lote" disabled={busy} light onPress={() => void act(async () => setBatch(await newBatch()))} />
          {scans.map(scan => <TouchableOpacity key={scan.id} style={styles.listItem} onPress={() => {
            if (scan.status === 'queued' || scan.status === 'error') {
              void act(async () => { await reviewManually(scan.id); setSelected(scan.id); });
            } else setSelected(scan.id);
          }}>
            <Image source={{ uri: imageUri(scan.thumbnail_path || scan.original_path) }} style={styles.thumb} />
            <View style={{ flex: 1 }}><Text style={styles.listTitle}>{scan.name || 'Orden ' + scan.id.slice(0, 8)}</Text>
              <Text style={styles.caption}>{scan.cedula || 'Cédula pendiente'} · {statusLabels[scan.status]}</Text></View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>)}
        </ScrollView>
      : <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>OCR de pruebas</Text>
          <Text style={styles.subbrand}>Indica la dirección de tu computadora en la misma red Wi-Fi. Las fotos quedan guardadas aunque el servicio no responda.</Text>
          <Text style={styles.label}>URL del OCR</Text>
          <TextInput value={settings.ocrUrl} onChangeText={ocrUrl => setSettings({ ...settings, ocrUrl })} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="http://192.168.1.20:5050/extract" />
          <Text style={styles.label}>Token de pruebas</Text>
          <TextInput value={settings.token} onChangeText={token => setSettings({ ...settings, token })} secureTextEntry autoCapitalize="none" style={styles.input} placeholder="Token definido en Docker" />
          <Button title="Guardar y procesar pendientes" disabled={busy} onPress={() => void act(async () => {
            await storeSettings(settings); void pump();
          })} />
          <Text style={styles.notice}>Utiliza el servicio OCR solo en una red de prueba y fotos ficticias. La asociación con pacientes se planificará en Laravel.</Text>
        </ScrollView>}
    <View style={styles.tabs}>
      {(['capture', 'queue', 'settings'] as const).map((item, index) => <TouchableOpacity key={item} accessibilityRole="tab" accessibilityState={{ selected: page === item }} style={styles.tab}
        onPress={() => { setCameraOpen(false); setSelected(null); setPage(item); }}><Text style={[styles.tabText, page === item && { color: colors.primary }]}>{['Cámara', 'Revisión', 'Ajustes'][index]}</Text></TouchableOpacity>)}
    </View>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, header: { paddingHorizontal: 22, paddingVertical: 14, backgroundColor: colors.white },
  brand: { fontSize: 18, fontWeight: '900', letterSpacing: 1.6, color: colors.ink }, subbrand: { color: colors.muted, marginTop: 3 },
  title: { fontSize: 23, fontWeight: '800', color: colors.ink, marginBottom: 6 },
  hero: { borderRadius: 22, backgroundColor: colors.mint, padding: 26, gap: 14, marginBottom: 25 },
  heroTitle: { color: colors.ink, fontSize: 28, fontWeight: '800' }, heroCopy: { color: colors.ink, lineHeight: 23, fontSize: 15 },
  home: { padding: 22 }, list: { padding: 22, gap: 9 }, detailContent: { padding: 20, paddingBottom: 44, gap: 9 },
  button: { paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', marginVertical: 3 },
  buttonText: { color: colors.white, fontWeight: '700' }, lightButton: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#abcfc3' },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.white, borderRadius: 14, padding: 12, marginTop: 9 },
  listTitle: { color: colors.ink, fontWeight: '700', fontSize: 15 }, caption: { fontSize: 12, color: colors.muted }, thumb: { width: 58, height: 66, borderRadius: 7, backgroundColor: '#e1eae6' },
  state: { color: colors.primary, fontWeight: '700', marginBottom: 5 }, chevron: { fontSize: 28, color: colors.muted },
  label: { color: colors.ink, fontWeight: '700', marginTop: 9 }, input: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#c7d8d2', borderRadius: 10, padding: 12, minHeight: 48, color: colors.ink },
  textArea: { minHeight: 130 }, row: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' }, document: { height: 260, width: '100%', backgroundColor: '#e6eeeb', borderRadius: 12 },
  notice: { backgroundColor: '#e6f1eb', color: colors.ink, padding: 14, lineHeight: 21, borderRadius: 12, marginTop: 15 }, error: { color: '#8f3024' }, errorBox: { backgroundColor: '#fde9e5', padding: 9 },
  cameraFrame: { flex: 1, backgroundColor: '#141c1b' }, cameraTop: { position: 'absolute', top: 12, left: 15 }, cameraBottom: { position: 'absolute', bottom: 25, left: 20, right: 20, alignItems: 'center', gap: 14 },
  guide: { position: 'absolute', top: '20%', left: '8%', right: '8%', height: '49%', borderWidth: 2, borderColor: '#d6f4e9', borderRadius: 12 },
  cameraHint: { color: colors.white, textAlign: 'center' }, cameraMessage: { color: '#ffe0d4' }, shutter: { height: 80, width: 80, borderWidth: 4, borderColor: colors.white, borderRadius: 40, justifyContent: 'center', alignItems: 'center' }, shutterCore: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.white },
  tabs: { flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderColor: '#d8e6e1' }, tab: { flex: 1, padding: 17, alignItems: 'center' }, tabText: { color: colors.muted, fontWeight: '700' },
});
