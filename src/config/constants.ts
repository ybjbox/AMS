export const STORAGE_KEYS = {
  TOKEN: 'app_auth_token',
  USER_INFO: 'app_user_info',
  THEME: 'app_settings_theme',
} as const;

export const EVENT_KEYS = {
  API_ERROR: 'app:api:error',
  AUTH_EXPIRED: 'app:auth:expired',
} as const;

// 内置默认系统图标（群邦 logo，public/brand-mark.png）；设置里上传自定义图标会覆盖它
export const DEFAULT_SYSTEM_ICON = '/brand-mark.png';

// 默认用户头像（品牌蓝人像，public/avatar-default.svg）；个人资料上传头像会覆盖它
export const DEFAULT_USER_AVATAR = '/avatar-default.svg';
