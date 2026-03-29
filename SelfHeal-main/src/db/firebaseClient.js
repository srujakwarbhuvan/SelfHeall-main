import { ref, set, push, get, child } from "firebase/database";
import { db } from "../config/firebase.js";

/**
 * FirebaseClient — Interface for Realtime Database Persistence
 * ============================================================
 * Provides structured methods to save AI heal events and test runs.
 * ============================================================
 */
export class FirebaseClient {
  /**
   * Save a single heal event
   * @param {Object} heal - The heal details (original_selector, healed_selector, etc.)
   */
  static async saveHeal(heal) {
    try {
      const healsRef = ref(db, 'heals');
      const newHealRef = push(healsRef);
      await set(newHealRef, {
        ...heal,
        timestamp: heal.timestamp || new Date().toISOString()
      });
      return newHealRef.key;
    } catch (err) {
      console.error('  [Firebase] Error saving heal:', err.message);
      throw err;
    }
  }

  /**
   * Get all heal events
   * @returns {Promise<Array>} List of heal events
   */
  static async getAllHeals() {
    try {
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, 'heals'));
      if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
      }
      return [];
    } catch (err) {
      console.error('  [Firebase] Error fetching heals:', err.message);
      return [];
    }
  }

  /**
   * Save a test run summary
   * @param {Object} run - Run details (testFile, status, steps, etc.)
   */
  static async saveRunHistory(run) {
    try {
      const historyRef = ref(db, 'history');
      const newRunRef = push(historyRef);
      await set(newRunRef, {
        ...run,
        timestamp: run.timestamp || new Date().toISOString()
      });
      return newRunRef.key;
    } catch (err) {
      console.error('  [Firebase] Error saving run history:', err.message);
      throw err;
    }
  }

  /**
   * Get complete run history
   * @returns {Promise<Array>} List of historical runs
   */
  static async getRunHistory() {
    try {
      const dbRef = ref(db);
      const snapshot = await get(child(dbRef, 'history'));
      if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
      }
      return [];
    } catch (err) {
      console.error('  [Firebase] Error fetching history:', err.message);
      return [];
    }
  }
}

export default FirebaseClient;
