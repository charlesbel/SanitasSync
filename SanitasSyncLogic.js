import AsyncStorage from '@react-native-async-storage/async-storage';
import SanitasCrypto from './SanitasCrypto';
import DeviceInfo from 'react-native-device-info';
import { getTimeZone } from 'react-native-localize';
import {
  insertRecords,
  readRecords,
  initialize,
  getSdkStatus,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

// Constantes
const SANITAS_LOGIN_URL = 'https://sync.connect-sanitas-online.de/auth/login/';
const SANITAS_DOWNLOAD_URL =
  'https://sync.connect-sanitas-online.de/synchronization/downloadData/';
const LAST_SYNC_KEY = '@sanitas_last_sync';

// --- FONCTION DE FILTRAGE ET ÉCRITURE ---
const processAndWriteData = async (scaleData, lastSync) => {
  const candidateData = lastSync
    ? scaleData.filter(m => new Date(m.MeasurementTimeWithDate) > lastSync)
    : scaleData;

  if (!candidateData || candidateData.length === 0) {
    console.log('[Logic] Aucune nouvelle donnée (basé sur date).');
    return 0;
  }

  let dataToProcess = [];
  try {
    const times = candidateData.map(m =>
      new Date(m.MeasurementTimeWithDate).getTime(),
    );
    const minTime = new Date(Math.min(...times));
    const maxTime = new Date(Math.max(...times));
    minTime.setMinutes(minTime.getMinutes() - 1);
    maxTime.setMinutes(maxTime.getMinutes() + 1);

    const { records: existingRecords } = await readRecords('Weight', {
      timeRangeFilter: {
        operator: 'between',
        startTime: minTime.toISOString(),
        endTime: maxTime.toISOString(),
      },
    });
    const existingTimestamps = new Set(
      (existingRecords ?? []).map(r => new Date(r.time).getTime()),
    );

    dataToProcess = candidateData.filter(m => {
      const mTime = new Date(m.MeasurementTimeWithDate).getTime();
      return !existingTimestamps.has(mTime);
    });
  } catch (e) {
    console.warn(
      '[Logic] Erreur lecture HealthConnect (peut-être background sans permission?):',
      e,
    );
    dataToProcess = candidateData;
  }

  if (dataToProcess.length === 0) {
    return 0;
  }

  // Transformation
  const allRecords = dataToProcess
    .filter(m => !m.IsDeleted)
    .map(measurement => {
      const time = new Date(measurement.MeasurementTimeWithDate).toISOString();
      const list = [];
      if (measurement.WeightKg) {
        list.push({
          recordType: 'Weight',
          weight: { value: measurement.WeightKg, unit: 'kilograms' },
          time,
        });
      }
      if (measurement.BodyFatPct) {
        list.push({
          recordType: 'BodyFat',
          percentage: measurement.BodyFatPct,
          time,
        });
      }
      if (measurement.BoneMassKg) {
        list.push({
          recordType: 'BoneMass',
          mass: { value: measurement.BoneMassKg, unit: 'kilograms' },
          time,
        });
      }
      if (measurement.WeightKg && measurement.MusclePct) {
        const lbm = measurement.WeightKg * (measurement.MusclePct / 100.0);
        list.push({
          recordType: 'LeanBodyMass',
          mass: { value: parseFloat(lbm.toFixed(2)), unit: 'kilograms' },
          time,
        });
      }
      if (measurement.WeightKg && measurement.WaterPct) {
        const bwm = measurement.WeightKg * (measurement.WaterPct / 100.0);
        list.push({
          recordType: 'BodyWaterMass',
          mass: { value: parseFloat(bwm.toFixed(2)), unit: 'kilograms' },
          time,
        });
      }
      return list;
    })
    .flat();

  if (allRecords.length === 0) {
    return 0;
  }

  // Groupement par type
  const recordsByType = {};
  for (const r of allRecords) {
    if (!recordsByType[r.recordType]) {
      recordsByType[r.recordType] = [];
    }
    recordsByType[r.recordType].push(r);
  }

  let totalWritten = 0;
  for (const type of Object.keys(recordsByType)) {
    try {
      await insertRecords(recordsByType[type]);
      totalWritten += recordsByType[type].length;
    } catch (err) {
      console.error(`[Logic] Erreur écriture type ${type}:`, err);
    }
  }
  return totalWritten;
};

// --- FONCTION PRINCIPALE DE SYNCHRO (Exportée) ---
// Ajout du paramètre isAutoSync pour être précis
export const performFullSync = async (isAutoSync = true) => {
  console.log('[Sync Logic] Démarrage de la logique de synchronisation...');

  // --- 0. INITIALISATION HEALTH CONNECT (CRITIQUE POUR LE MODE HEADLESS) ---
  try {
    const status = await getSdkStatus();
    if (status === SdkAvailabilityStatus.SDK_AVAILABLE) {
      // On tente de l'initialiser. Si c'est déjà fait (via l'UI), ça passera silencieusement ou renverra une petite erreur gérée.
      await initialize();
      console.log('[Sync Logic] Client Health Connect initialisé.');
    } else {
      console.warn(
        '[Sync Logic] Abandon : Health Connect non disponible sur cet appareil.',
      );
      return { success: false, message: 'Health Connect indisponible' };
    }
  } catch (initErr) {
    console.log(
      '[Sync Logic] Info Init (peut-être déjà initialisé) :',
      initErr.message,
    );
  }
  // -------------------------------------------------------------------------

  // 1. Récupérer les identifiants
  const email = await AsyncStorage.getItem('@sanitas_email');
  const password = await AsyncStorage.getItem('@sanitas_password');
  const deviceId = await AsyncStorage.getItem('@sanitas_deviceId');
  const lastSyncStr = await AsyncStorage.getItem(LAST_SYNC_KEY);
  const lastSync = lastSyncStr ? new Date(lastSyncStr) : null;

  if (!email || !password || !deviceId) {
    console.log("[Sync Logic] Pas d'identifiants, abandon.");
    return { success: false, message: 'Identifiants manquants' };
  }

  const crypto = new SanitasCrypto();

  try {
    // 2. AUTH
    const localTz = getTimeZone();
    const deviceName = await DeviceInfo.getDeviceName();
    const osVersion = DeviceInfo.getSystemVersion();
    const phoneModel = DeviceInfo.getModel();

    const loginRes = await fetch(SANITAS_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SourcePlatform: 'Android',
        PhoneModel: phoneModel,
        password: password,
        OS: 'Android',
        DeviceId: deviceId,
        OsVersion: osVersion,
        timeZone: localTz,
        PlatForm: 'Android',
        userName: email,
        VersionNumber: 190,
        Name: deviceName,
      }),
    });

    const loginData = await loginRes.json();
    if (!loginRes.ok || loginData.IsValidUser !== true) {
      return {
        success: false,
        message: 'Erreur Auth: ' + (loginData.UserStatus || 'Inconnu'),
      };
    }

    // 3. DOWNLOAD - RESTAURATION DU PAYLOAD COMPLET (STRICTEMENT IDENTIQUE À L'ORIGINAL)
    const clientDateTime = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const deviceInfoString = `Manufacturer:${DeviceInfo.getBrand()}#Model:${phoneModel}#Android Version:${osVersion}#App Culture:fr-FR#Device Culture:${getTimeZone()}#Wi-fi:true#Mobile Data:false`;

    const downloadPayload = {
      ASSettingsLastCount: 0,
      DeviceClassDurationSettingsLastCount: 0,
      GlucoseMeasurementLastCount: 0,
      GlucoseSettingsLastCount: 0,
      MeasurementMedicationRefLastCount: 0,
      MeasurementsLastCount: 0,
      MedicationLastCount: 0,
      ScaleMeasurementLastCount: 0,
      UserLastCount: 0,
      SettingsLastCount: 0,
      UserDevicesLastCount: 0,
      UserTargetWeightLastCount: 0,
      UserWHRManagementLastCount: 0,
      DeviceClientDetailsLastCount: 0,
      DeviceClientRelationshipLastCount: 0,
      ASMeasurementsLastCount: 0,
      ASMeasurementDetailsLastCount: 0,
      SleepDetailsLastCount: 0,
      SleepMasterLastCount: 0,
      WeightSettingsLastCount: 0,
      PdfExportStatisticsLastCount: 0,
      UserProfilePicLastCount: 0,
      UserDeviceLoginHistoryLastCount: 0,
      DeviceLastCount: 0,
      SourcePlateform: 'Android',
      LastSyncDateForDownlaodTables: '1990-01-01T00:00:00.000',
      CurrentPlateformVersions: 'AN190',
      SourcePrefix: 'AN000******', // Remis
      VersionNumber: 190,
      ImageDownloadSource: 'IPhone', // Remis
      FinalIdentifier: loginData.FinalIdentifier,
      IsAutomaticSync: isAutoSync ? 1 : 0,
      ClientDateTime: clientDateTime,
      exception_log: '', // Remis
      DeviceInfo: deviceInfoString, // Format complet remis
    };

    const encryptedBody = crypto.getEncryptedRequest(
      JSON.stringify(downloadPayload),
    );

    const dlRes = await fetch(SANITAS_DOWNLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Android#${loginData.FinalIdentifier}#${loginData.UserAccessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: encryptedBody,
    });

    if (!dlRes.ok) {
      // Log de l'erreur pour aider au debug
      console.error('[Sync Logic] Erreur HTTP Download:', dlRes.status);
      const errorText = await dlRes.text();
      console.error('[Sync Logic] Corps réponse erreur:', errorText);
      throw new Error('Erreur HTTP Download ' + dlRes.status);
    }

    const encryptedText = await dlRes.text();
    const decryptedJSON = crypto.decryptResponse(encryptedText);
    const data = JSON.parse(decryptedJSON);

    if (data.erreur_dechiffrement) {
      throw new Error('Erreur Déchiffrement');
    }

    const scaleData = data.scaleMeasurement;
    let writtenCount = 0;
    if (scaleData && scaleData.length > 0) {
      writtenCount = await processAndWriteData(scaleData, lastSync);

      // Succès : Mise à jour date
      const now = new Date();
      await AsyncStorage.setItem(LAST_SYNC_KEY, now.toISOString());
      return { success: true, count: writtenCount, date: now };
    } else {
      return { success: true, count: 0, message: 'Aucune donnée' };
    }
  } catch (e) {
    console.error('[Sync Logic] Exception:', e);
    return { success: false, message: e.message };
  }
};
