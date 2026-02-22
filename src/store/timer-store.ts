import { create } from 'zustand';

export interface TimerSlot {
  id: string;
  label: string;
  hours: number;
  minutes: number;
  seconds: number;
}

const genId = () => Math.random().toString(36).slice(2);

interface TimerStore {
  slots: TimerSlot[];
  addSlot: () => void;
  updateSlot: (id: string, changes: Partial<Omit<TimerSlot, 'id'>>) => void;
  deleteSlot: (id: string) => void;
  moveSlot: (fromIndex: number, toIndex: number) => void;
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  slots: [
    { id: genId(), label: '', hours: 0, minutes: 1, seconds: 0 },
  ],

  addSlot: () => {
    const { slots } = get();
    if (slots.length >= 10) return;
    set({ slots: [...slots, { id: genId(), label: '', hours: 0, minutes: 1, seconds: 0 }] });
  },

  updateSlot: (id, changes) =>
    set({ slots: get().slots.map((s) => (s.id === id ? { ...s, ...changes } : s)) }),

  deleteSlot: (id) =>
    set({ slots: get().slots.filter((s) => s.id !== id) }),

  moveSlot: (fromIndex, toIndex) => {
    const slots = [...get().slots];
    const [item] = slots.splice(fromIndex, 1);
    slots.splice(toIndex, 0, item);
    set({ slots });
  },
}));
