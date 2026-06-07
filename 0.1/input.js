// input.js — подключает мышь и клавиатуру к камере
function setupInput(canvas, camera) {
  // Мышь
  let isMouseDown = false;
  let lastMouseX = 0, lastMouseY = 0;
  let panning = false;

  canvas.addEventListener('mousedown', (e) => {
    isMouseDown = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    panning = (e.button === 1) || (e.button === 0 && e.shiftKey);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (panning) {
      camera.pan(-dx, dy);
    } else {
      camera.rotate(dx, dy);
    }
  });

  window.addEventListener('mouseup', () => { isMouseDown = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoom(e.deltaY);
  });

  // Клавиатура
  const keys = {};
  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
  });
  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // Функция, вызываемая каждый кадр для применения клавиш
  function updateKeyboard() {
    if (keys['KeyA']) camera.handleKeyboard('KeyA');
    if (keys['KeyD']) camera.handleKeyboard('KeyD');
    if (keys['KeyW']) camera.handleKeyboard('KeyW');
    if (keys['KeyS']) camera.handleKeyboard('KeyS');
  }

  return { updateKeyboard };
}