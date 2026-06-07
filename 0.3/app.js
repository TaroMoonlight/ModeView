// app.js — главный управляющий скрипт
(async function main() {

  // Spector захватчик
  //let spectorCapture = null;
  //if (typeof SPECTOR !== 'undefined') {
  //  spectorCapture = new SPECTOR.Spector();
  //  spectorCapture.displayUI(); // показывает кнопку захвата на странице
  //}

  const canvas = document.getElementById('mainCanvas');
  const renderer = new SimpleRenderer(canvas);
  renderer.prepare();

  // Загрузка модели
  const { json, binBuffer } = await loadGLB('model.glb');
  console.log('glTF JSON:', json);

  // Загружаем все изображения
  const textureImages = await loadTextureImages(json, binBuffer);
  const allMeshes = collectMeshes(json, binBuffer, textureImages);
  if (!allMeshes.length) throw new Error('Нет мешей в сцене');

  const meshDrawData = await Promise.all(allMeshes.map(mesh => renderer.uploadMesh(mesh, binBuffer)));
  
  // Отладочный режим
  let debugModeActive = false;
  let debugHandler = null;

  // Обработчик кнопки отладки
  document.getElementById('debugBtn').addEventListener('click', () => {
    debugModeActive = !debugModeActive;
    document.getElementById('debugView').style.display = debugModeActive ? 'grid' : 'none';
    document.getElementById('mainCanvas').style.display = debugModeActive ? 'none' : 'block';
    document.body.classList.toggle('debug-active', debugModeActive);
    if (!debugModeActive) renderer.resize();
  });

  // Функция для чтения флагов осей
  function getAxisFlags() {
    return {
      showX: document.getElementById('chkAxisX').checked,
      showY: document.getElementById('chkAxisY').checked,
      showZ: document.getElementById('chkAxisZ').checked
    };
  }

  // AABB и камера
  const sceneAABB = computeSceneAABB(allMeshes, binBuffer);
  //console.log('AABB min:', sceneAABB.min, 'max:', sceneAABB.max);

  const center = [
    (sceneAABB.min[0] + sceneAABB.max[0]) / 2,
    (sceneAABB.min[1] + sceneAABB.max[1]) / 2,
    (sceneAABB.min[2] + sceneAABB.max[2]) / 2
  ];
  const maxDim = Math.max(
    sceneAABB.max[0] - sceneAABB.min[0],
    sceneAABB.max[1] - sceneAABB.min[1],
    sceneAABB.max[2] - sceneAABB.min[2]
  );
  const distance = maxDim / Math.tan(Math.PI/8) * 1.3;
  const camera = new OrbitCamera(center, distance, 0, Math.PI/4);
  camera.updateProjection(canvas.clientWidth / canvas.clientHeight);
  renderer.camera = camera;

  // Отладка: проволочный AABB
  const wireframeBox = renderer.createWireframeBox(sceneAABB.min, sceneAABB.max);
  let showAABB = false;

  // Инициализация отладчика (после того, как определён sceneAABB и meshDrawData)
  debugHandler = await setupDebugMode(camera, sceneAABB, allMeshes, binBuffer);

  // Переключение по клавише 0
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Digit0') {
      showAABB = !showAABB;
      console.log('AABB', showAABB ? 'вкл' : 'выкл');
    }
  });

  // Ввод
  const input = setupInput(canvas, camera);
  const mobileInput = setupMobileInput(canvas, camera);

  // Цикл отрисовки
  function loop() {
    input.updateKeyboard();
    renderer.draw(meshDrawData);
    if (debugModeActive && debugHandler) {
      debugHandler.update(getAxisFlags());
    } else {
      renderer.draw(meshDrawData);
      if (showAABB && wireframeBox) {
        renderer.drawWireframeBox(wireframeBox, camera, [0.2, 1.0, 0.2]);
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
  console.log('✅ Модульная система готова');
})().catch(err => {
  console.error(err);
  document.body.innerText = 'Ошибка: ' + err.message;
});