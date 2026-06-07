// app.js — главный управляющий скрипт
(async function main() {
  const canvas = document.getElementById('glCanvas');
  const renderer = new SimpleRenderer(canvas);
  renderer.prepare();

  // Загрузка модели
  const { json, binBuffer } = await loadGLB('model1.glb');
  console.log('glTF JSON:', json);

  const allMeshes = collectMeshes(json, binBuffer);
  if (!allMeshes.length) throw new Error('Нет мешей в сцене');

  const meshDrawData = [];
  for (const mesh of allMeshes) {
    meshDrawData.push(await renderer.uploadMesh(mesh, binBuffer));
  }
  
  // AABB и камера
  const sceneAABB = computeSceneAABB(allMeshes, binBuffer);
  console.log('AABB min:', sceneAABB.min, 'max:', sceneAABB.max);

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

  // Переключение по клавише 0
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Digit0') {
      showAABB = !showAABB;
      console.log('AABB', showAABB ? 'вкл' : 'выкл');
    }
  });

  // Ввод
  const input = setupInput(canvas, camera);

  // Цикл отрисовки
  function loop() {
    input.updateKeyboard();
    renderer.draw(meshDrawData);
    if (showAABB && wireframeBox) {
        renderer.drawWireframeBox(wireframeBox, camera, [0.2, 1.0, 0.2]); // зелёный
    }
    requestAnimationFrame(loop);
  }
  loop();
  console.log('✅ Модульная система готова');
})().catch(err => {
  console.error(err);
  document.body.innerText = 'Ошибка: ' + err.message;
});