import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alarm, DEFAULT_ALARM } from '../types/alarm';
import { scheduleAlarmNotification, cancelAlarmNotification } from '../utils/notification';

const STORAGE_KEY = 'alarms';

interface AlarmStore {
  alarms: Alarm[];
  isLoaded: boolean;
  loadAlarms: () => Promise<void>;
  addAlarm: (alarm: Partial<Omit<Alarm, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  updateAlarm: (id: string, changes: Partial<Omit<Alarm, 'id' | 'createdAt'>>) => Promise<void>;
  deleteAlarm: (id: string) => Promise<void>;
  toggleAlarm: (id: string) => Promise<void>;
}

const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const saveToStorage = async (alarms: Alarm[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
};

export const useAlarmStore = create<AlarmStore>((set, get) => ({
  alarms: [],
  isLoaded: false,

  loadAlarms: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const alarms: Alarm[] = raw ? JSON.parse(raw) : [];
      set({ alarms, isLoaded: true });
    } catch {
      set({ alarms: [], isLoaded: true });
    }
  },

  addAlarm: async (data) => {
    const now = new Date().toISOString();
    const alarm: Alarm = {
      ...DEFAULT_ALARM,
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    const alarms = [...get().alarms, alarm];
    set({ alarms });
    await saveToStorage(alarms);
    if (alarm.isEnabled) {
      await scheduleAlarmNotification(alarm);
    }
  },

  updateAlarm: async (id, changes) => {
    const alarms = get().alarms.map((a) =>
      a.id === id ? { ...a, ...changes, updatedAt: new Date().toISOString() } : a
    );
    set({ alarms });
    await saveToStorage(alarms);
    const updated = alarms.find((a) => a.id === id);
    if (updated) {
      await cancelAlarmNotification(id);
      if (updated.isEnabled) {
        await scheduleAlarmNotification(updated);
      }
    }
  },

  deleteAlarm: async (id) => {
    await cancelAlarmNotification(id);
    const alarms = get().alarms.filter((a) => a.id !== id);
    set({ alarms });
    await saveToStorage(alarms);
  },

  toggleAlarm: async (id) => {
    const alarm = get().alarms.find((a) => a.id === id);
    if (!alarm) return;
    await get().updateAlarm(id, { isEnabled: !alarm.isEnabled });
  },
}));
