// ui.js – production UI
class ProductionUI {
  constructor(options = {}) {
    this.theme = options.theme || CONFIG.UI.THEME;
    this.position = options.position || CONFIG.UI.POSITION;
    this.showFPS = options.showFPS !== undefined ? options.showFPS : CONFIG.UI.SHOW_FPS;
    this.showModelInfo = options.showModelInfo !== undefined ? options.showModelInfo : CONFIG.UI.SHOW_MODEL_INFO;
    this.showSnowToggle = options.showSnowToggle !== undefined ? options.showSnowToggle : CONFIG.UI.SHOW_SNOW_TOGGLE;
    this.showAxesToggle = options.showAxesToggle !== undefined ? options.showAxesToggle : CONFIG.UI.SHOW_AXES_TOGGLE;
    this.showResetCamera = options.showResetCamera !== undefined ? options.showResetCamera : CONFIG.UI.SHOW_RESET_CAMERA;

    this.fps = 0;
    this.modelInfo = null; // { triangles, textures }
    this.snowEnabled = true;
    this.axesEnabled = false; // по умолчанию выключены в production
    this.resetCameraCallback = null;

    this.panel = document.createElement('div');
    this.panel.id = 'productionUI';
    this.panel.className = `ui-theme-${this.theme} ui-position-${this.position}`;
    document.body.appendChild(this.panel);

    this._buildUI();
  }

  _buildUI() {
    const panel = this.panel;

    if (this.showFPS) {
      const fpsEl = document.createElement('div');
      fpsEl.className = 'ui-fps';
      fpsEl.textContent = 'FPS: --';
      panel.appendChild(fpsEl);
      this.fpsElement = fpsEl;
    }

    if (this.showModelInfo) {
      const modelEl = document.createElement('div');
      modelEl.className = 'ui-model-info';
      modelEl.textContent = 'Модель: загрузка...';
      panel.appendChild(modelEl);
      this.modelElement = modelEl;
    }

    if (this.showSnowToggle) {
      const label = document.createElement('label');
      label.className = 'ui-toggle';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.snowEnabled;
      checkbox.addEventListener('change', () => {
        this.snowEnabled = checkbox.checked;
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(' Снег'));
      panel.appendChild(label);
    }

    if (this.showAxesToggle) {
      const label = document.createElement('label');
      label.className = 'ui-toggle';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.axesEnabled;
      checkbox.addEventListener('change', () => {
        this.axesEnabled = checkbox.checked;
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(' Оси'));
      panel.appendChild(label);
    }

    if (this.showResetCamera) {
      const btn = document.createElement('button');
      btn.className = 'ui-button';
      btn.textContent = 'Сброс камеры';
      btn.addEventListener('click', () => {
        if (this.resetCameraCallback) this.resetCameraCallback();
      });
      panel.appendChild(btn);
    }
  }

  setFPS(fps) {
    this.fps = fps;
    if (this.fpsElement) {
      this.fpsElement.textContent = `FPS: ${Math.round(fps)}`;
    }
  }

  setModelInfo(info) {
    this.modelInfo = info;
    if (this.modelElement && info) {
      this.modelElement.textContent = `Треугольников: ${info.triangles}, текстур: ${info.textures}`;
    }
  }

  isSnowEnabled() {
    return this.snowEnabled;
  }

  isAxesEnabled() {
    return this.axesEnabled;
  }

  setResetCallback(callback) {
    this.resetCameraCallback = callback;
  }
}