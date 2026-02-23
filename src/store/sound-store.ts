/**
 * sound-store.ts
 * 사용자가 추가한 커스텀 알람음 목록을 관리하는 Zustand 스토어입니다.
 *
 * CustomSound 데이터는 AsyncStorage에 'custom_sounds' 키로 저장됩니다.
 * 실제 오디오 파일은 앱 document 폴더의 sounds/ 디렉토리에 영구 저장됩니다.
 *
 * expo-file-system SDK 54의 새 OOP API를 사용합니다:
 *   - Paths.document : 영구 저장 가능한 document 디렉토리
 *   - Directory      : 폴더 생성/접근
 *   - File           : 파일 복사/삭제
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, Directory, File } from 'expo-file-system';

const STORAGE_KEY = 'custom_sounds';

export interface CustomSound {
  id: string;    // uuid 형태의 고유 식별자
  name: string;  // 파일 표시 이름 (예: "morning_alarm.mp3")
  uri: string;   // 앱 document 폴더 내 파일의 file:// URI
}

interface SoundStore {
  customSounds: CustomSound[];
  isLoaded: boolean;
  loadSounds: () => Promise<void>;
  addSound: (name: string, sourceUri: string) => Promise<CustomSound>;
  deleteSound: (id: string) => Promise<void>;
}

const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const saveToStorage = async (sounds: CustomSound[]) => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sounds));
};

/** 앱 전용 sounds 디렉토리를 반환합니다. 없으면 생성합니다. */
const getSoundsDir = (): Directory => {
  const dir = new Directory(Paths.document, 'sounds');
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
  return dir;
};

export const useSoundStore = create<SoundStore>((set, get) => ({
  customSounds: [],
  isLoaded: false,

  loadSounds: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const sounds: CustomSound[] = raw ? JSON.parse(raw) : [];
      // 파일이 실제로 존재하는 항목만 유지 (앱 재설치 등으로 파일이 삭제된 경우 방지)
      const valid = sounds.filter((s) => {
        try {
          const file = new File(s.uri);
          return file.exists;
        } catch {
          return false;
        }
      });
      set({ customSounds: valid, isLoaded: true });
      if (valid.length !== sounds.length) {
        await saveToStorage(valid);
      }
    } catch {
      set({ customSounds: [], isLoaded: true });
    }
  },

  /**
   * 오디오 파일을 앱 영구 저장소로 복사하고 목록에 추가합니다.
   * @param name 파일 표시 이름
   * @param sourceUri expo-document-picker에서 받은 임시 URI
   */
  addSound: async (name: string, sourceUri: string) => {
    const id = generateId();
    const ext = name.split('.').pop() ?? 'mp3';
    const fileName = `${id}.${ext}`;

    const soundsDir = getSoundsDir();
    const destFile = new File(soundsDir, fileName);
    const sourceFile = new File(sourceUri);
    // 소스 파일을 sounds 폴더로 복사
    sourceFile.copy(soundsDir);
    // 복사된 파일의 URI는 sounds 폴더 + 원본 파일명으로 생성됨
    // 명시적으로 이름을 지정하기 위해 move로 이름 변경
    const copiedFile = new File(soundsDir, name);
    if (copiedFile.exists && copiedFile.uri !== destFile.uri) {
      copiedFile.move(destFile);
    }

    const finalUri = destFile.uri;
    const newSound: CustomSound = { id, name, uri: finalUri };
    const sounds = [...get().customSounds, newSound];
    set({ customSounds: sounds });
    await saveToStorage(sounds);
    return newSound;
  },

  /**
   * 커스텀 사운드를 삭제합니다. 파일도 함께 삭제됩니다.
   * @param id 삭제할 사운드의 id
   */
  deleteSound: async (id: string) => {
    const sound = get().customSounds.find((s) => s.id === id);
    if (sound) {
      try {
        const file = new File(sound.uri);
        if (file.exists) file.delete();
      } catch {
        // 파일 삭제 실패 무시
      }
    }
    const sounds = get().customSounds.filter((s) => s.id !== id);
    set({ customSounds: sounds });
    await saveToStorage(sounds);
  },
}));

/**
 * soundId 규칙:
 *   'default'        → assets/sounds/alarm_default.mp3 (내장)
 *   'bell'           → assets/sounds/alarm_bell.mp3 (내장)
 *   'digital'        → assets/sounds/alarm_digital.mp3 (내장)
 *   'gentle'         → assets/sounds/alarm_gentle.mp3 (내장)
 *   'custom:{id}'    → document/sounds/{id}.{ext} (커스텀)
 */
export const BUILTIN_SOUND_IDS = ['default', 'bell', 'digital', 'gentle'] as const;

export const isCustomSoundId = (soundId: string) => soundId.startsWith('custom:');
export const getCustomSoundId = (id: string) => `custom:${id}`;
export const parseCustomSoundId = (soundId: string) => soundId.replace('custom:', '');
