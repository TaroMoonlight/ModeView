// debugMode.js — четырёхоконный отладочный вид с осями, лучом камеры и управлением орто-видами
async function setupDebugMode(mainCamera, sceneAABB, allMeshes, binBuffer) {
  const perspCanvas = document.querySelector('#cellPersp canvas');
  const topCanvas = document.querySelector('#cellTop canvas');
  const leftCanvas = document.querySelector('#cellLeft canvas');
  const frontCanvas = document.querySelector('#cellFront canvas');

  const perspRenderer = new SimpleRenderer(perspCanvas);
  const topRenderer = new SimpleRenderer(topCanvas);
  const leftRenderer = new SimpleRenderer(leftCanvas);
  const frontRenderer = new SimpleRenderer(frontCanvas);
  const renderers = [perspRenderer, topRenderer, leftRenderer, frontRenderer];
  renderers.forEach(r => r.prepare());

  // Асинхронная загрузка геометрии в каждый контекст
  const perspMeshData = await Promise.all(allMeshes.map(m => perspRenderer.uploadMesh(m, binBuffer)));
  const topMeshData = await Promise.all(allMeshes.map(m => topRenderer.uploadMesh(m, binBuffer)));
  const leftMeshData = await Promise.all(allMeshes.map(m => leftRenderer.uploadMesh(m, binBuffer)));
  const frontMeshData = await Promise.all(allMeshes.map(m => frontRenderer.uploadMesh(m, binBuffer)));

  renderers.forEach(r => r.resize());
  window.addEventListener('resize', () => {
    if (document.getElementById('debugView').style.display !== 'none') {
      renderers.forEach(r => r.resize());
    }
  });

  const maxDim = Math.max(
    sceneAABB.max[0] - sceneAABB.min[0],
    sceneAABB.max[1] - sceneAABB.min[1],
    sceneAABB.max[2] - sceneAABB.min[2]
  ) * 1.2;
  const center = [
    (sceneAABB.min[0] + sceneAABB.max[0]) / 2,
    (sceneAABB.min[1] + sceneAABB.max[1]) / 2,
    (sceneAABB.min[2] + sceneAABB.max[2]) / 2
  ];

  // --------------------------------------------------------------
  // Ортогональные камеры с возможностью панорамирования и зума
  class OrthoCamera {
    constructor(eye, up, center, halfSize) {
      this.eye = eye.slice();
      this.up = up.slice();
      this.center = center.slice();
      this.halfSize = halfSize;
      this.viewMatrix = mat4.create();
      this.projectionMatrix = mat4.create();
      this.updateViewMatrix();
      this.updateProjection(1);
    }

    updateViewMatrix() {
      mat4.lookAt(this.viewMatrix, this.eye, this.center, this.up);
    }

    updateProjection(aspect) {
      const half = this.halfSize;
      const left = -half * aspect;
      const right = half * aspect;
      const bottom = -half;
      const top = half;
      const near = 0.01;
      const far = 1000;
      this.projectionMatrix[0] = 2 / (right - left);
      this.projectionMatrix[5] = 2 / (top - bottom);
      this.projectionMatrix[10] = -2 / (far - near);
      this.projectionMatrix[12] = -(right + left) / (right - left);
      this.projectionMatrix[13] = -(top + bottom) / (top - bottom);
      this.projectionMatrix[14] = -(far + near) / (far - near);
      this.projectionMatrix[15] = 1;
    }

    // Панорамирование: сдвиг центра в плоскости экрана
    pan(deltaX, deltaY, aspect) {
      // В орто-камере просто сдвигаем центр в направлениях right и up
      const forward = [
        this.center[0] - this.eye[0],
        this.center[1] - this.eye[1],
        this.center[2] - this.eye[2]
      ];
      const lenFwd = Math.sqrt(forward[0]**2 + forward[1]**2 + forward[2]**2) || 1;
      const fwd = forward.map(v => v / lenFwd);
      const right = [
        this.up[1]*fwd[2] - this.up[2]*fwd[1],
        this.up[2]*fwd[0] - this.up[0]*fwd[2],
        this.up[0]*fwd[1] - this.up[1]*fwd[0]
      ];
      const up = [
        fwd[1]*right[2] - fwd[2]*right[1],
        fwd[2]*right[0] - fwd[0]*right[2],
        fwd[0]*right[1] - fwd[1]*right[0]
      ];

      const scale = this.halfSize * 2 / 500; // чувствительность
      this.center[0] += (right[0] * deltaX + up[0] * deltaY) * scale;
      this.center[1] += (right[1] * deltaX + up[1] * deltaY) * scale;
      this.center[2] += (right[2] * deltaX + up[2] * deltaY) * scale;
      // Перемещаем и глаз вместе с центром
      this.eye[0] += (right[0] * deltaX + up[0] * deltaY) * scale;
      this.eye[1] += (right[1] * deltaX + up[1] * deltaY) * scale;
      this.eye[2] += (right[2] * deltaX + up[2] * deltaY) * scale;
      this.updateViewMatrix();
    }

    // Зум: изменение halfSize
    zoom(delta) {
      this.halfSize *= (1 - delta * 0.001);
      if (this.halfSize < maxDim * 0.01) this.halfSize = maxDim * 0.01;
      if (this.halfSize > maxDim * 10) this.halfSize = maxDim * 10;
      this.updateProjection(1); // аспект обновится позже
    }
  }

  const halfInit = maxDim / 2;
  const topCam = new OrthoCamera(
    [center[0], center[1] + maxDim, center[2]],
    [0, 0, -1],
    center.slice(),
    halfInit
  );
  const leftCam = new OrthoCamera(
    [center[0] - maxDim, center[1], center[2]],
    [0, 1, 0],
    center.slice(),
    halfInit
  );
  const frontCam = new OrthoCamera(
    [center[0], center[1], center[2] + maxDim],
    [0, 1, 0],
    center.slice(),
    halfInit
  );

  // --------------------------------------------------------------
  // Создаём AABB wireframe для каждого рендерера
  const wireframes = {
    persp: perspRenderer.createWireframeBox(sceneAABB.min, sceneAABB.max),
    top: topRenderer.createWireframeBox(sceneAABB.min, sceneAABB.max),
    left: leftRenderer.createWireframeBox(sceneAABB.min, sceneAABB.max),
    front: frontRenderer.createWireframeBox(sceneAABB.min, sceneAABB.max)
  };

  // Создаём буферы осей для каждого рендерера
  const axisLength = maxDim * 0.5;
  const createAxisBuffers = (renderer) => {
    const gl = renderer.gl;
    const xVerts = new Float32Array([0,0,0, axisLength,0,0]);
    const yVerts = new Float32Array([0,0,0, 0,axisLength,0]);
    const zVerts = new Float32Array([0,0,0, 0,0,axisLength]);
    const createBuf = (data) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return buf;
    };
    return { x: createBuf(xVerts), y: createBuf(yVerts), z: createBuf(zVerts) };
  };
  const axes = {
    persp: createAxisBuffers(perspRenderer),
    top: createAxisBuffers(topRenderer),
    left: createAxisBuffers(leftRenderer),
    front: createAxisBuffers(frontRenderer)
  };

  // Динамические буферы для луча камеры (будем обновлять каждый кадр)
  const camRayBuffers = {
    persp: perspRenderer.gl.createBuffer(),
    top: topRenderer.gl.createBuffer(),
    left: leftRenderer.gl.createBuffer(),
    front: frontRenderer.gl.createBuffer()
  };

  // Управление для перспективного окна (perspCanvas)
  function setupPerspControls(canvas, camera) {
    let isMouseDown = false;
    let lastX = 0, lastY = 0;
    let panning = false;

    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isMouseDown = true;
      lastX = e.clientX;
      lastY = e.clientY;
      panning = (e.button === 1) || (e.button === 0 && e.shiftKey);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (panning) {
        camera.pan(dx, dy);
      } else {
        camera.rotate(dx, dy);
      }
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      camera.zoom(e.deltaY);
    });
  }

  // --------------------------------------------------------------
  // Управление для орто-окон
  function setupOrthoControls(canvas, orthoCam, getAspect) {
    let isDragging = false;
    let lastX = 0, lastY = 0;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        e.preventDefault();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const aspect = getAspect();
      orthoCam.pan(dx, dy, aspect);
      // Обновим проекцию с текущим аспектом
      orthoCam.updateProjection(aspect);
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      orthoCam.zoom(e.deltaY);
      orthoCam.updateProjection(getAspect());
    });
  }

  setupPerspControls(perspCanvas,mainCamera);
  setupOrthoControls(topCanvas, topCam, () => topCanvas.clientWidth / topCanvas.clientHeight);
  setupOrthoControls(leftCanvas, leftCam, () => leftCanvas.clientWidth / leftCanvas.clientHeight);
  setupOrthoControls(frontCanvas, frontCam, () => frontCanvas.clientWidth / frontCanvas.clientHeight);

  // --------------------------------------------------------------
  // Отрисовка одного вьюпорта
  function drawView(renderer, camera, wireBox, axisBufs, meshData, camRayBuf, showAxes, showCamRay) {
    renderer.resize();
    renderer.camera = camera;
    renderer.draw(meshData);
    // AABB
    renderer.drawWireframeBox(wireBox, camera, [0.2, 1.0, 0.2]);
    // Оси
    if (showAxes) {
      if (showAxes.x) renderer.drawLines(axisBufs.x, 2, [1, 0, 0]);
      if (showAxes.y) renderer.drawLines(axisBufs.y, 2, [0, 1, 0]);
      if (showAxes.z) renderer.drawLines(axisBufs.z, 2, [0, 0, 1]);
    }
    // Луч камеры (только для орто-окон)
    if (showCamRay && camRayBuf) {
      renderer.drawLines(camRayBuf, 2, [1.0, 1.0, 0.0]); // жёлтый
    }
  }

  // --------------------------------------------------------------
  // Внешний метод update
  return {
    update(flags) {
      const showAxes = { x: flags.showX, y: flags.showY, z: flags.showZ };

      // Вычисляем глаз и цель основной камеры
      const eye = [
        mainCamera.target[0] + mainCamera.distance * Math.sin(mainCamera.phi) * Math.cos(mainCamera.theta),
        mainCamera.target[1] + mainCamera.distance * Math.cos(mainCamera.phi),
        mainCamera.target[2] + mainCamera.distance * Math.sin(mainCamera.phi) * Math.sin(mainCamera.theta)
      ];
      const target = mainCamera.target;

      // Обновляем буфер луча для каждого рендерера (можно сделать общим, но контексты разные)
      const updateRayBuffer = (renderer, buf) => {
        const gl = renderer.gl;
        const data = new Float32Array([...eye, ...target]);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      };
      updateRayBuffer(perspRenderer, camRayBuffers.persp); // в перспективе не рисуем, но обновим для единообразия
      updateRayBuffer(topRenderer, camRayBuffers.top);
      updateRayBuffer(leftRenderer, camRayBuffers.left);
      updateRayBuffer(frontRenderer, camRayBuffers.front);

      // Перспектива (без луча)
      const perspAspect = perspCanvas.clientWidth / perspCanvas.clientHeight;
      mainCamera.updateProjection(perspAspect);
      drawView(perspRenderer, mainCamera, wireframes.persp, axes.persp, perspMeshData, null, showAxes, false);

      // Орто-виды с лучом
      const topAspect = topCanvas.clientWidth / topCanvas.clientHeight;
      topCam.updateProjection(topAspect);
      drawView(topRenderer, topCam, wireframes.top, axes.top, topMeshData, camRayBuffers.top, showAxes, true);

      const leftAspect = leftCanvas.clientWidth / leftCanvas.clientHeight;
      leftCam.updateProjection(leftAspect);
      drawView(leftRenderer, leftCam, wireframes.left, axes.left, leftMeshData, camRayBuffers.left, showAxes, true);

      const frontAspect = frontCanvas.clientWidth / frontCanvas.clientHeight;
      frontCam.updateProjection(frontAspect);
      drawView(frontRenderer, frontCam, wireframes.front, axes.front, frontMeshData, camRayBuffers.front, showAxes, true);
    }
  };
}