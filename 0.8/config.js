// config.js – глобальные настройки
const CONFIG = {
  DEBUG: window.location.search.includes('debug'),
  IS_MOBILE: /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
  IS_TABLET: /iPad|Android(?!.*Mobi)/i.test(navigator.userAgent) || 
             (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  IS_DESKTOP: !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
  IS_PHONE: /Mobi|Android|iPhone|iPod/i.test(navigator.userAgent) && !/iPad/i.test(navigator.userAgent),
  UI: {
    THEME: 'dark',
    POSITION: 'bottom-right',
    SHOW_FPS: true,
    SHOW_MODEL_INFO: true,
    SHOW_SNOW_TOGGLE: true,
    SHOW_AXES_TOGGLE: false,
    SHOW_RESET_CAMERA: true,
    MOBILE_CONTROLS_SIDE: 'right',
  }
};