// input.js — подключает мышь и клавиатуру к камере
// Стиль Blender: средняя кнопка — вращение, Shift+средняя — панорамирование, колесо — зум

function setupInput(canvas, camera) {
  // --------------------- Мышь ---------------------
  let isMouseDown = false;
  let lastMouseX = 0, lastMouseY = 0;
  let rotateMode = true;   // по умолчанию вращение
  let activeButton = null;

  // Обработчик нажатия кнопки мыши
  canvas.addEventListener('mousedown', (e) => {
    //console.log('mousedown:', e.button); // <- отладка
    e.preventDefault();
    // Реагируем только на среднюю кнопку (колесо)
    if (e.button === 0) {
      isMouseDown = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      activeButton = 0;
      // Без Shift — вращение, с Shift — панорамирование
      rotateMode = !e.altKey;
    } else {
      // Игнорируем левую и правую кнопки
      isMouseDown = false;
    }
  });

  // Обработчик движения мыши
  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (rotateMode) {
      camera.rotate(dx, dy);
    } else {
      camera.pan(dx, dy);
    }
  });

  // Обработчик отпускания кнопки мыши
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0 && isMouseDown) {
      isMouseDown = false;
      activeButton = null;
    }
  });

  // Переключение режима по Shift во время перетаскивания
  window.addEventListener('keydown', (e) => {
    if (e.code === 'AltLeft' || e.code === 'AltRight') {
        if (isMouseDown && activeButton === 0) {
            rotateMode = false; // переключаемся на панорамирование
        }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'AltLeft' || e.code === 'AltRight') {
        if (isMouseDown && activeButton === 0) {
            rotateMode = true; // возвращаемся к вращению
        }
    }
  });

  // Колёсико — зум
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoom(e.deltaY);
  });

  // --------------------- Клавиатура ---------------------
  const keys = {};
  document.addEventListener('keydown', (e) => {
    //console.log('keydown:', e.code); // <- отладка
    keys[e.code] = true;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
      e.preventDefault();
    }
  });

  function updateKeyboard() {
    if (keys['KeyA']) camera.handleKeyboard('KeyA');
    if (keys['KeyD']) camera.handleKeyboard('KeyD');
    if (keys['KeyW']) camera.handleKeyboard('KeyW');
    if (keys['KeyS']) camera.handleKeyboard('KeyS');
  }

  return { updateKeyboard };
}