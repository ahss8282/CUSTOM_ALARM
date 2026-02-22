import { Platform } from 'react-native';

// 디자인 가이드 기반 색상 토큰
export const DesignTokens = {
  primary: '#d1d0ec',     // 라벤더
  accent: '#EDC7CF',      // 파스텔 핑크
  bgLight: '#f6f6f7',
  bgDark: '#15151d',
};

export const Colors = {
  light: {
    text: '#11181C',
    subText: '#6B7280',
    background: DesignTokens.bgLight,
    card: '#FFFFFF',
    tint: DesignTokens.primary,
    icon: '#687076',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#6B6BA8',
    border: '#E5E7EB',
    primary: DesignTokens.primary,
    accent: DesignTokens.accent,
    danger: '#EF4444',
    switchTrackOn: DesignTokens.primary,
    switchThumb: '#FFFFFF',
  },
  dark: {
    text: '#ECEDEE',
    subText: '#9CA3AF',
    background: DesignTokens.bgDark,
    card: '#1E1E2E',
    tint: DesignTokens.primary,
    icon: '#9BA1A6',
    tabIconDefault: '#6B7280',
    tabIconSelected: DesignTokens.primary,
    border: '#2D2D3D',
    primary: DesignTokens.primary,
    accent: DesignTokens.accent,
    danger: '#EF4444',
    switchTrackOn: DesignTokens.primary,
    switchThumb: '#FFFFFF',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
