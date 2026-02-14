/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getSdkStatus,
  SdkAvailabilityStatus,
  initialize,
  requestPermission,
} from 'react-native-health-connect';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  PaperProvider,
  TextInput,
  MD3LightTheme as DefaultTheme,
  Switch,
  Chip,
} from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import BackgroundFetch from 'react-native-background-fetch';

import { performFullSync } from './SanitasSyncLogic';

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#007AFF',
    background: '#FFFFFF',
    surface: '#F2F2F2',
    onSurface: '#000000',
  },
};

const LAST_SYNC_KEY = '@sanitas_last_sync';

// Composant pour le badge de statut
const ServiceStatusChip = ({ isActive }) => {
  if (isActive) {
    return (
      <Chip icon="check-circle" style={styles.chip}>
        Actif
      </Chip>
    );
  }
  return (
    <Chip icon="alert-circle-outline" style={styles.chip}>
      Inactif
    </Chip>
  );
};

function App() {
  const [sdkStatus, setSdkStatus] = useState(
    SdkAvailabilityStatus.SDK_UNAVAILABLE,
  );
  const [lastSync, setLastSync] = useState(null);

  const [sanitasEmail, setSanitasEmail] = useState('');
  const [sanitasPassword, setSanitasPassword] = useState('');
  const [sanitasDeviceId, setSanitasDeviceId] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Prêt.');

  const [isServiceActive, setIsServiceActive] = useState(false);

  // --- FONCTION POUR DEMANDER L'IGNORANCE DES OPTIMISATIONS BATTERIE ---
  const requestBatteryOptimization = async () => {
    try {
      if (Platform.OS === 'android') {
        Alert.alert(
          'Optimisation batterie',
          "Pour fonctionner en arrière-plan de manière optimale, l'app doit être exemptée des optimisations de batterie. Voulez-vous ouvrir les paramètres ?",
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Ouvrir',
              onPress: () => {
                Linking.openSettings();
              },
            },
          ],
        );
      }
    } catch (err) {
      console.warn('Erreur batterie:', err);
    }
  };

  // --- FONCTION POUR DEMANDER LES NOTIFICATIONS ---
  // Reste utile pour la future implémentation de notifications locales si besoin
  const requestNotificationPermission = async () => {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Permission notifications accordée');
        } else {
          console.log('Permission notifications refusée');
        }
      } catch (err) {
        console.warn(err);
      }
    }
  };

  // --- 1. INITIALISATION AU DÉMARRAGE ---
  useEffect(() => {
    const initApp = async () => {
      try {
        await requestNotificationPermission();

        const email = await AsyncStorage.getItem('@sanitas_email');
        const password = await AsyncStorage.getItem('@sanitas_password');
        let deviceId = await AsyncStorage.getItem('@sanitas_deviceId');
        const lastSyncTime = await AsyncStorage.getItem(LAST_SYNC_KEY);

        if (lastSyncTime) {
          setLastSync(new Date(lastSyncTime));
        }
        if (email) {
          setSanitasEmail(email);
        }
        if (password) {
          setSanitasPassword(password);
        }

        if (!deviceId) {
          deviceId = uuid.v4();
          await AsyncStorage.setItem('@sanitas_deviceId', deviceId);
        }
        setSanitasDeviceId(deviceId);

        // --- CONFIGURATION DE WORKMANAGER ---

        // Callback si l'app est réveillée alors qu'elle est en mémoire (Foreground/Background)
        const onEvent = async taskId => {
          console.log(`[WorkManager] 🔄 Réveil (Task: ${taskId})`);
          try {
            const result = await performFullSync(true);
            if (result.success && result.count > 0) {
              console.log(
                `[WorkManager] ✅ Succès : ${result.count} nouveaux records`,
              );
            } else {
              console.log(
                '[WorkManager] ℹ️ Synchro terminée (Rien de nouveau)',
              );
            }
          } catch (e) {
            console.error('[WorkManager] ❌ Erreur:', e);
          }
          // Toujours terminer la tâche
          BackgroundFetch.finish(taskId);
        };

        const onTimeout = async taskId => {
          console.warn(`[WorkManager] ⚠️ Timeout de la tâche: ${taskId}`);
          BackgroundFetch.finish(taskId);
        };

        // EXÉCUTION OBLIGATOIRE à chaque démarrage du moteur JS (retrait du 'if')
        const status = await BackgroundFetch.configure(
          {
            minimumFetchInterval: 15,
            stopOnTerminate: false,
            enableHeadless: true,
            startOnBoot: true,
            requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
          },
          onEvent,
          onTimeout,
        );

        console.log('[App] WorkManager configuré avec le statut:', status);
        setIsServiceActive(
          status === BackgroundFetch.STATUS_AVAILABLE || status === 2,
        );
      } catch (e) {
        console.error('[App] Erreur Init:', e);
        setStatusMessage('Erreur chargement: ' + e.message);
      }
    };

    initApp();
  }, []);

  const handleSaveCredentials = async () => {
    try {
      setIsLoading(true);
      if (!sanitasDeviceId) {
        const newId = uuid.v4();
        await AsyncStorage.setItem('@sanitas_deviceId', newId);
        setSanitasDeviceId(newId);
      }
      await AsyncStorage.setItem('@sanitas_email', sanitasEmail);
      await AsyncStorage.setItem('@sanitas_password', sanitasPassword);
      setStatusMessage('Identifiants sauvegardés.');
    } catch (e) {
      setStatusMessage(`Erreur: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- GESTION SERVICE (WorkManager) ---
  const toggleService = async () => {
    if (isServiceActive) {
      await BackgroundFetch.stop();
      setIsServiceActive(false);
      setStatusMessage('Planification en arrière-plan arrêtée.');
    } else {
      if (!sanitasEmail || !sanitasPassword) {
        Alert.alert('Erreur', "Veuillez configurer vos identifiants d'abord.");
        return;
      }

      await BackgroundFetch.start();
      setIsServiceActive(true);
      setStatusMessage('Planification en arrière-plan démarrée.');
    }
  };

  // --- SYNCHRO MANUELLE ---
  const handleManualSync = useCallback(async () => {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    setStatusMessage('Synchronisation manuelle...');

    try {
      const result = await performFullSync(false);
      if (result.success) {
        if (result.date) {
          setLastSync(result.date);
        }
        setStatusMessage(`Succès: ${result.count} ajouts.`);
      } else {
        setStatusMessage(`Échec: ${result.message}`);
      }
    } catch (e) {
      setStatusMessage('Erreur critique UI: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // --- HEALTH CONNECT ---
  const checkPermissions = useCallback(async () => {
    try {
      const permissionsList = [
        { accessType: 'read', recordType: 'Weight' },
        { accessType: 'write', recordType: 'Weight' },
        { accessType: 'read', recordType: 'BodyFat' },
        { accessType: 'write', recordType: 'BodyFat' },
        { accessType: 'read', recordType: 'BoneMass' },
        { accessType: 'write', recordType: 'BoneMass' },
        { accessType: 'read', recordType: 'LeanBodyMass' },
        { accessType: 'write', recordType: 'LeanBodyMass' },
        { accessType: 'read', recordType: 'BodyWaterMass' },
        { accessType: 'write', recordType: 'BodyWaterMass' },
      ];
      await requestPermission(permissionsList);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const checkAvailability = async () => {
      const status = await getSdkStatus();
      if (status === SdkAvailabilityStatus.SDK_AVAILABLE) {
        await initialize();
        await checkPermissions();
      }
      setSdkStatus(status);
    };
    checkAvailability();
  }, [checkPermissions]);

  const renderServiceRight = useCallback(
    () => <ServiceStatusChip isActive={isServiceActive} />,
    [isServiceActive],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <PaperProvider theme={theme}>
        <Appbar.Header>
          <Appbar.Content title="Sanitas ➜ Samsung Health" />
        </Appbar.Header>
        <ScrollView style={styles.container}>
          <Text style={[styles.statusText, { color: theme.colors.onSurface }]}>
            {statusMessage}
          </Text>

          {isLoading && <ActivityIndicator animating={true} size="large" />}

          <Card style={styles.card}>
            <Card.Title title="⚙️ Configuration" />
            <Card.Content>
              <TextInput
                label="Email"
                value={sanitasEmail}
                onChangeText={setSanitasEmail}
                autoCapitalize="none"
                style={styles.input}
              />
              <TextInput
                label="Mot de passe"
                value={sanitasPassword}
                onChangeText={setSanitasPassword}
                secureTextEntry
                style={styles.input}
              />
              <Button mode="contained" onPress={handleSaveCredentials}>
                Sauvegarder
              </Button>
              <Text style={styles.label}>ID: {sanitasDeviceId}</Text>
            </Card.Content>
          </Card>

          <Card
            style={[
              styles.card,
              {
                borderColor: isServiceActive ? '#4CAF50' : '#9E9E9E',
                borderWidth: 2,
              },
            ]}
          >
            <Card.Title
              title="🚀 Tâche d'arrière-plan"
              subtitle="Synchronisation automatique"
              right={renderServiceRight}
            />
            <Card.Content>
              <View style={styles.row}>
                <Text style={styles.switchLabel}>Activer le service</Text>
                <Switch value={isServiceActive} onValueChange={toggleService} />
              </View>
              <Text style={styles.hint}>
                La synchronisation s'exécutera silencieusement en arrière-plan
                par l'OS (environ toutes les 15 à 30 minutes selon la batterie).
              </Text>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Title title="🔋 Optimisations" />
            <Card.Content>
              <Button
                mode="outlined"
                onPress={requestBatteryOptimization}
                icon="battery-alert"
              >
                Désactiver optimisation batterie
              </Button>
              <Text style={styles.hint}>
                Recommandé pour éviter que Samsung One UI ne bloque le
                WorkManager.
              </Text>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Title title="🔄 Actions manuelles" />
            <Card.Content>
              <Button
                icon="sync"
                mode="contained"
                onPress={handleManualSync}
                disabled={isLoading}
              >
                Synchroniser maintenant
              </Button>
              <Text style={styles.label}>
                Dernière: {lastSync ? lastSync.toLocaleString() : 'Jamais'}
              </Text>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Title title="🏥 Health Connect" />
            <Card.Content>
              <Text style={styles.label}>SDK: {sdkStatus}</Text>
              <Button onPress={checkPermissions} mode="outlined">
                Gérer les permissions
              </Button>
            </Card.Content>
          </Card>
        </ScrollView>
      </PaperProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: { flex: 1, padding: 16 },
  card: { marginBottom: 16, elevation: 2 },
  input: { marginBottom: 12, backgroundColor: '#fff' },
  label: { marginTop: 8, fontSize: 12, color: 'gray' },
  statusText: {
    fontSize: 16,
    textAlign: 'center',
    margin: 16,
    fontWeight: 'bold',
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  hint: { fontSize: 12, fontStyle: 'italic', color: '#666', marginTop: 8 },
  chip: { marginRight: 16 },
  switchLabel: { fontSize: 16, flex: 1 },
});

export default App;
