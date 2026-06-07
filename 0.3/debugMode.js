// debugMode.js — четырёхоконный отладочный вид с осями координат
// Каждый контекст загружает свою копию геометрии

async function setupDebugMode(mainCamera, sceneAABB, allMeshes, binBuffer) {
  const perspCanvas = document.querySelector('#cellPersp canvas');
  const topCanvas = document.querySelector('#cellTop canvas');
  const leftCanvas = document.querySelector('#cellLeft canvas');
  const frontCanvas = document.querySelector('#cellFront canvas');

  // Создаём независимые рендереры для каждого окна
  const perspRenderer = new SimpleRenderer(perspCanvas);
  const topRenderer = new SimpleRenderer(topCanvas);
  const leftRenderer = new SimpleRenderer(leftCanvas);
  const frontRenderer = new SimpleRenderer(frontCanvas);
  const renderers = [perspRenderer, topRenderer, leftRenderer, frontRenderer];
  renderers.forEach(r => r.prepare());

  // Асинхронно загружаем геометрию для каждого рендерера в его контексте
  const perspMeshData = await Promise.all(allMeshes.map(mesh => perspRenderer.uploadMesh(mesh, binBuffer)));
  const topMeshData = await Promise.all(allMeshes.map(mesh => topRenderer.uploadMesh(mesh, binBuffer)));
  const leftMeshData = await Promise.all(allMeshes.map(mesh => leftRenderer.uploadMesh(mesh, binBuffer)));
  const frontMeshData = await Promise.all(allMeshes.map(mesh => frontRenderer.uploadMesh(mesh, binBuffer)));

  // Принудительно обновляем размеры канвасов при старте
  renderers.forEach(r => r.resize());
  window.addEventListener('resize', () => {
    if (document.getElementById('debugView').style.display !== 'none') {
      renderers.forEach(r => r.resize());
    }
  });

  setupInput(perspCanvas,mainCamera);

  // Максимальный размер сцены для ортогональных камер и длины осей
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

  // Вспомогательная функция создания ортогональной камеры
  function createOrthoCam(eye, up) {
    const cam = new OrbitCamera(center, 1, 0, 0);
    cam.updateViewMatrix = () => {
      cam.viewMatrix = mat4.lookAt(mat4.create(), eye, center, up);
    };
    cam.updateProjection = (aspect) => {
      const half = maxDim / 2;
      cam.projectionMatrix = mat4.create();
      const left = -half * aspect;
      const right = half * aspect;
      const bottom = -half;
      const top = half;
      const near = 0.01;
      const far = 1000;
      cam.projectionMatrix[0] = 2 / (right - left);
      cam.projectionMatrix[5] = 2 / (top - bottom);
      cam.projectionMatrix[10] = -2 / (far - near);
      cam.projectionMatrix[12] = -(right + left) / (right - left);
      cam.projectionMatrix[13] = -(top + bottom) / (top - bottom);
      cam.projectionMatrix[14] = -(far + near) / (far - near);
      cam.projectionMatrix[15] = 1;
    };
    cam.updateViewMatrix();
    cam.updateProjection(1);
    return cam;
  }

  const topCam = createOrthoCam([center[0], center[1] + maxDim, center[2]], [0, 0, -1]);
  const leftCam = createOrthoCam([center[0] - maxDim, center[1], center[2]], [0, 1, 0]);
  const frontCam = createOrthoCam([center[0], center[1], center[2] + maxDim], [0, 1, 0]);

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
    return {
      x: createBuf(xVerts),
      y: createBuf(yVerts),
      z: createBuf(zVerts)
    };
  };

  const axes = {
    persp: createAxisBuffers(perspRenderer),
    top: createAxisBuffers(topRenderer),
    left: createAxisBuffers(leftRenderer),
    front: createAxisBuffers(frontRenderer)
  };

  // Рисует сцену для одного вьюпорта
  function drawView(renderer, camera, wireBox, axisBufs, meshData, showAxes) {
    renderer.resize();
    renderer.camera = camera;
    renderer.draw(meshData);
    renderer.drawWireframeBox(wireBox, camera, [0.2, 1.0, 0.2]);
    if (showAxes) {
      if (showAxes.x) renderer.drawLines(axisBufs.x, 2, [1, 0, 0]);
      if (showAxes.y) renderer.drawLines(axisBufs.y, 2, [0, 1, 0]);
      if (showAxes.z) renderer.drawLines(axisBufs.z, 2, [0, 0, 1]);
    }
  }

  function update(flags) {
    const showAxes = {
      x: flags.showX,
      y: flags.showY,
      z: flags.showZ
    };

    const perspAspect = perspCanvas.clientWidth / perspCanvas.clientHeight;
    mainCamera.updateProjection(perspAspect);
    drawView(perspRenderer, mainCamera, wireframes.persp, axes.persp, perspMeshData, showAxes);

    topCam.updateProjection(topCanvas.clientWidth / topCanvas.clientHeight);
    drawView(topRenderer, topCam, wireframes.top, axes.top, topMeshData, showAxes);

    leftCam.updateProjection(leftCanvas.clientWidth / leftCanvas.clientHeight);
    drawView(leftRenderer, leftCam, wireframes.left, axes.left, leftMeshData, showAxes);

    frontCam.updateProjection(frontCanvas.clientWidth / frontCanvas.clientHeight);
    drawView(frontRenderer, frontCam, wireframes.front, axes.front, frontMeshData, showAxes);
  }

  return { update };
}