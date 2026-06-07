// mobileControls.js – виртуальные кнопки зума и панорамирования (стопкой)
class MobileControls {
  constructor(camera) {
    if (!camera) {
      console.warn('MobileControls: camera не передана, кнопки не созданы');
      return;
    }
    this.camera = camera;
    this.active = {};
    this._createUI();
    this._startLoop();
  }

  _createUI() {
    const container = document.createElement('div');
    container.id = 'mobileControls';
    // Добавляем класс стороны из конфига
    const side = (CONFIG.UI && CONFIG.UI.MOBILE_CONTROLS_SIDE) || 'right';
    container.classList.add('mobile-controls-' + side);

    // Кнопки в столбик: сначала зум, потом стрелки
    container.innerHTML = `
      <button class="ctrl-btn" data-action="zoomIn">+</button>
      <button class="ctrl-btn" data-action="zoomOut">−</button>
      <button class="ctrl-btn" data-action="panUp">▲</button>
      <button class="ctrl-btn" data-action="panLeft">◀</button>
      <button class="ctrl-btn" data-action="panDown">▼</button>
      <button class="ctrl-btn" data-action="panRight">▶</button>
    `;
    document.body.appendChild(container);

    // Общие обработчики для всех кнопок
    const buttons = container.querySelectorAll('.ctrl-btn');
    buttons.forEach(btn => {
      const action = btn.dataset.action;
      const start = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.active[action] = true;
        btn.classList.add('active');
      };
      const end = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.active[action] = false;
        btn.classList.remove('active');
      };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointerleave', end);
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end);
      btn.addEventListener('touchcancel', end);
    });
  }

  _startLoop() {
    const step = () => {
      if (this.active.zoomIn) this.camera.zoom(10);
      if (this.active.zoomOut) this.camera.zoom(-10);
      if (this.active.panLeft) this.camera.pan(6, 0);
      if (this.active.panRight) this.camera.pan(-6, 0);
      if (this.active.panUp) this.camera.pan(0, 5);
      if (this.active.panDown) this.camera.pan(0, -5);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}