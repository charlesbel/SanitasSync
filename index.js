import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import BackgroundFetch from 'react-native-background-fetch';
import { performFullSync } from './SanitasSyncLogic';

// 1. Enregistrement de l'App (UI)
AppRegistry.registerComponent(appName, () => App);

// 2. Tâche Headless (Quand l'app est totalement fermée)
const HeadlessTask = async event => {
  // Extraction stricte demandée par la librairie
  const taskId = event.taskId;
  const isTimeout = event.timeout;

  if (isTimeout) {
    console.warn(`[Headless] ⚠️ Timeout OS ! (Task: ${taskId})`);
    BackgroundFetch.finish(taskId); // Il est crucial de rendre la main à l'OS
    return;
  }

  console.log(`[Headless] 🚀 Réveil en arrière-plan (Task: ${taskId})`);

  try {
    const result = await performFullSync(true);
    if (result.success && result.count > 0) {
      console.log(`[Headless] ✅ Succès : ${result.count} records ajoutés.`);
    } else {
      console.log('[Headless] ℹ️ Synchro terminée (Rien de nouveau).');
    }
  } catch (e) {
    console.error('[Headless] ❌ Erreur critique:', e);
  } finally {
    // IMPORTANT : Vous devez signaler à l'OS que la tâche est terminée
    BackgroundFetch.finish(taskId);
  }
};

// Enregistrement de la tâche Headless
BackgroundFetch.registerHeadlessTask(HeadlessTask);
