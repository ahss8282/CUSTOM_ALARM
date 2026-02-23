/**
 * pick-sound.ts
 * expo-document-picker를 사용해 기기에서 오디오 파일을 선택하는 유틸리티입니다.
 */
import * as DocumentPicker from 'expo-document-picker';

export interface PickedSound {
  name: string; // 파일 표시 이름
  uri: string;  // 선택된 파일의 임시 URI
}

/**
 * 기기에서 오디오 파일을 선택합니다.
 * 사용자가 취소하면 null을 반환합니다.
 */
export const pickSoundFile = async (): Promise<PickedSound | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    // audio/* : MP3, AAC, WAV, M4A 등 모든 오디오 형식 허용
    type: ['audio/mpeg', 'audio/aac', 'audio/wav', 'audio/x-m4a', 'audio/*'],
    copyToCacheDirectory: true, // 임시 캐시 디렉토리에 복사 (URI 접근 안정성)
  });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  return {
    name: asset.name,
    uri: asset.uri,
  };
};
