export const STORAGE_KEYS = {
  TOKEN: 'app_auth_token',
  USER_INFO: 'app_user_info',
  THEME: 'app_settings_theme'
} as const;

export const EVENT_KEYS = {
  API_ERROR: 'app:api:error',
  AUTH_EXPIRED: 'app:auth:expired'
} as const;
