// textureEditor.js — редактор кубической карты со слоями, отменой и ластиком
class CanvasTextureEditor {
  constructor(renderer, cubeTexture, faceSize = 256) {
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.cubeTexture = cubeTexture;
    this.faceSize = faceSize;

    // Для каждой грани храним массив слоёв. Каждый слой — { canvas, ctx, visible }
    this.faces = [];
    for (let i = 0; i < 6; i++) {
      this.faces.push([this._createLayer()]);
    }

    this.activeFace = 0;
    this.activeLayer = 0; // индекс активного слоя на текущей грани

    // Инструменты
    this.tool = 'brush'; // 'brush' или 'eraser'
    this.brushColor = '#ffffff';
    this.brushSize = 10;
    this.brushOpacity = 1.0; // 0..1

    // История отмены (храним копии канвасов слоёв для активной грани)
    this.undoStack = []; // массив состояний [{faceIndex, layerIndex, imageData}]
    this.maxUndo = 10;

    // UI
    this.createUI();

    // Превью и события
    this.previewCanvas = document.getElementById('editorCanvas');
    this.previewCtx = this.previewCanvas.getContext('2d');
    this.previewCanvas.width = faceSize;
    this.previewCanvas.height = faceSize;

    this._bindEvents();
    this._updatePreview();
  }

  _createLayer() {
    const canvas = document.createElement('canvas');
    canvas.width = this.faceSize;
    canvas.height = this.faceSize;
    const ctx = canvas.getContext('2d');
    // Новый слой — прозрачный
    return { canvas, ctx, visible: true };
  }

  // ---------- UI ----------
  createUI() {
    // Если панель уже существует — выходим
    if (document.getElementById('editorPanel')) return;

    const panel = document.createElement('div');
    panel.id = 'editorPanel';
    panel.style.cssText = 'position:fixed; top:10px; right:10px; z-index:200; background:rgba(0,0,0,0.8); padding:8px; border-radius:4px; display:none; color:white; font-family:monospace;';
    document.body.appendChild(panel);

    // Всё остальное заполнение панели выносим в отдельный метод, чтобы можно было обновлять
    this._populateUI(panel);
  }

  _populateUI(panel) {
    panel.innerHTML = '';

    // Выбор грани
    const faceNames = ['+X', '-X', '+Y', '-Y', '+Z', '-Z'];
    const faceDiv = document.createElement('div');
    faceNames.forEach((name, i) => {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.style.margin = '2px';
      btn.addEventListener('click', () => this.selectFace(i));
      faceDiv.appendChild(btn);
    });
    panel.appendChild(faceDiv);

    // Инструменты: кисть, ластик
    const toolDiv = document.createElement('div');
    const brushBtn = document.createElement('button');
    brushBtn.textContent = 'Кисть';
    brushBtn.addEventListener('click', () => this.setTool('brush'));
    const eraserBtn = document.createElement('button');
    eraserBtn.textContent = 'Ластик';
    eraserBtn.addEventListener('click', () => this.setTool('eraser'));
    toolDiv.appendChild(brushBtn);
    toolDiv.appendChild(eraserBtn);
    panel.appendChild(toolDiv);

    // Цвет
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = this.brushColor;
    colorInput.addEventListener('change', (e) => this.brushColor = e.target.value);
    panel.appendChild(colorInput);

    // Размер кисти
    const sizeInput = document.createElement('input');
    sizeInput.type = 'range';
    sizeInput.min = 1;
    sizeInput.max = 50;
    sizeInput.value = this.brushSize;
    sizeInput.addEventListener('input', (e) => this.brushSize = parseInt(e.target.value));
    panel.appendChild(sizeInput);

    // Непрозрачность
    const opacityInput = document.createElement('input');
    opacityInput.type = 'range';
    opacityInput.min = 0;
    opacityInput.max = 1;
    opacityInput.step = 0.05;
    opacityInput.value = this.brushOpacity;
    opacityInput.addEventListener('input', (e) => this.brushOpacity = parseFloat(e.target.value));
    panel.appendChild(opacityInput);

    // Слои
    const layerDiv = document.createElement('div');
    layerDiv.innerHTML = '<b>Слои</b><br>';
    const addLayerBtn = document.createElement('button');
    addLayerBtn.textContent = '+ Слой';
    addLayerBtn.addEventListener('click', () => this.addLayer());
    const delLayerBtn = document.createElement('button');
    delLayerBtn.textContent = '- Слой';
    delLayerBtn.addEventListener('click', () => this.deleteLayer());
    layerDiv.appendChild(addLayerBtn);
    layerDiv.appendChild(delLayerBtn);
    panel.appendChild(layerDiv);

    this.layerListDiv = document.createElement('div');
    panel.appendChild(this.layerListDiv);
    this._updateLayerList();

    // Сохранение / загрузка
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Сохранить';
    saveBtn.addEventListener('click', () => this.saveToStorage());
    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Загрузить';
    loadBtn.addEventListener('click', () => this.loadFromStorage());
    panel.appendChild(saveBtn);
    panel.appendChild(loadBtn);
  }

  _updateLayerList() {
    const layers = this.faces[this.activeFace];
    this.layerListDiv.innerHTML = '';
    layers.forEach((layer, idx) => {
      const div = document.createElement('div');
      div.style.cursor = 'pointer';
      div.style.padding = '2px';
      if (idx === this.activeLayer) div.style.background = '#555';
      div.textContent = `Слой ${idx} (${layer.visible ? '👁' : '─'})`;
      div.addEventListener('click', () => this.selectLayer(idx));
      // Переключение видимости по двойному клику
      div.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        this._updateLayerList();
        this._updatePreview();
        this._updateCubeTexture();
      });
      this.layerListDiv.appendChild(div);
    });
  }

  // ---------- Инструменты ----------
  setTool(tool) {
    this.tool = tool;
  }

  selectFace(index) {
    this.activeFace = index;
    this.activeLayer = 0;
    this._updatePreview();
    this._updateLayerList();
  }

  selectLayer(index) {
    this.activeLayer = index;
    this._updateLayerList();
    this._updatePreview();
  }

  addLayer() {
    const layers = this.faces[this.activeFace];
    layers.push(this._createLayer());
    this.activeLayer = layers.length - 1;
    this._updateLayerList();
    this._updatePreview();
  }

  deleteLayer() {
    const layers = this.faces[this.activeFace];
    if (layers.length <= 1) return;
    layers.splice(this.activeLayer, 1);
    if (this.activeLayer >= layers.length) this.activeLayer = layers.length - 1;
    this._updateLayerList();
    this._updatePreview();
    this._updateCubeTexture();
  }

  // ---------- История отмены ----------
  _pushUndo() {
    const layers = this.faces[this.activeFace];
    const layer = layers[this.activeLayer];
    // сохраняем копию канваса активного слоя
    const imageData = layer.ctx.getImageData(0, 0, this.faceSize, this.faceSize);
    this.undoStack.push({ faceIndex: this.activeFace, layerIndex: this.activeLayer, imageData });
    if (this.undoStack.length > this.maxUndo) this.undoStack.shift();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const state = this.undoStack.pop();
    if (state.faceIndex !== this.activeFace) {
      // переключаемся на нужную грань
      this.selectFace(state.faceIndex);
      this.activeLayer = state.layerIndex;
    }
    const layer = this.faces[state.faceIndex][state.layerIndex];
    layer.ctx.putImageData(state.imageData, 0, 0);
    this._updatePreview();
    this._updateCubeTexture();
    this._updateLayerList();
  }

  // ---------- Рисование ----------
  _bindEvents() {
    const canvas = this.previewCanvas;
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      this.drawing = true;
      this._pushUndo(); // сохраняем состояние перед началом мазка
      const pos = this._getCanvasPos(e);
      this._drawDot(pos.x, pos.y);
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.active || !this.drawing) return;
      const pos = this._getCanvasPos(e);
      this._drawDot(pos.x, pos.y);
    });

    window.addEventListener('mouseup', () => {
      this.drawing = false;
    });

    // Отмена по Ctrl+Z
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.code === 'KeyZ') {
        e.preventDefault();
        this.undo();
      }
    });
  }

  _getCanvasPos(e) {
    const rect = this.previewCanvas.getBoundingClientRect();
    const scaleX = this.faceSize / rect.width;
    const scaleY = this.faceSize / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }

  _drawDot(x, y) {
    const layers = this.faces[this.activeFace];
    const layer = layers[this.activeLayer];
    const ctx = layer.ctx;

    ctx.globalAlpha = this.brushOpacity;
    if (this.tool === 'brush') {
      ctx.fillStyle = this.brushColor;
      ctx.beginPath();
      ctx.arc(x, y, this.brushSize, 0, Math.PI * 2);
      ctx.fill();
    } else { // ластик
      ctx.clearRect(x - this.brushSize, y - this.brushSize, this.brushSize * 2, this.brushSize * 2);
    }
    ctx.globalAlpha = 1.0;

    this._updatePreview();
    this._updateCubeTexture();
  }

  // ---------- Композитинг и обновление текстур ----------
  _updatePreview() {
    const layers = this.faces[this.activeFace];
    this.previewCtx.clearRect(0, 0, this.faceSize, this.faceSize);
    // фон базового цвета (если слои не полностью перекрывают)
    this.previewCtx.fillStyle = '#0a0a2e';
    this.previewCtx.fillRect(0, 0, this.faceSize, this.faceSize);
    for (const layer of layers) {
      if (layer.visible) {
        this.previewCtx.drawImage(layer.canvas, 0, 0);
      }
    }
  }

  _updateCubeTexture() {
    // Собираем финальное изображение грани из всех видимых слоёв
    const layers = this.faces[this.activeFace];
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.faceSize;
    tempCanvas.height = this.faceSize;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = '#0a0a2e';
    tempCtx.fillRect(0, 0, this.faceSize, this.faceSize);
    for (const layer of layers) {
      if (layer.visible) {
        tempCtx.drawImage(layer.canvas, 0, 0);
      }
    }

    const gl = this.gl;
    const targets = [
      gl.TEXTURE_CUBE_MAP_POSITIVE_X, gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
      gl.TEXTURE_CUBE_MAP_POSITIVE_Y, gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
      gl.TEXTURE_CUBE_MAP_POSITIVE_Z, gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
    ];
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cubeTexture);
    gl.texSubImage2D(targets[this.activeFace], 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, tempCanvas);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  }

  // ---------- Сохранение / загрузка ----------
  saveToStorage() {
    const data = this.faces.map(layers =>
      layers.map(layer => ({
        visible: layer.visible,
        dataURL: layer.canvas.toDataURL()
      }))
    );
    localStorage.setItem('skyboxEditorData', JSON.stringify(data));
    alert('Сохранено в localStorage');
  }

  async loadFromStorage() {
    const json = localStorage.getItem('skyboxEditorData');
    if (!json) { alert('Нет сохранённых данных'); return; }
    const data = JSON.parse(json);
    for (let i = 0; i < 6; i++) {
      const layersData = data[i];
      const newLayers = [];
      for (const ld of layersData) {
        const canvas = document.createElement('canvas');
        canvas.width = this.faceSize;
        canvas.height = this.faceSize;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = ld.dataURL;
        await new Promise(resolve => { img.onload = resolve; });
        ctx.drawImage(img, 0, 0);
        newLayers.push({ canvas, ctx, visible: ld.visible });
      }
      this.faces[i] = newLayers;
    }
    this._updatePreview();
    this._updateCubeTexture();
    alert('Загружено из localStorage');
  }

  // ---------- Переключение редактора ----------
  toggle() {
    this.active = !this.active;
    const panel = document.getElementById('editorPanel');
    const container = document.getElementById('editorContainer');
    if (panel && container) {
      panel.style.display = this.active ? 'block' : 'none';
      container.style.display = this.active ? 'block' : 'none';
      if (this.active) {
        this._updatePreview();
        this._updateLayerList();
      }
    }
  }
}