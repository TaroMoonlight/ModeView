// mobileInput.js — сенсорное управление (один палец — вращение, два — панорама/зум)

function setupMobileInput(canvas, camera) {
  // Для одиночного касания
  let lastTouchX = 0, lastTouchY = 0;
  let activeTouches = 0;

  // Для двух пальцев
  let lastPinchDistance = 0;
  let lastMidX = 0, lastMidY = 0;

  const getPinchDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getMidPoint = (touches) => {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  const onTouchStart = (e) => {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1) {
      lastTouchX = touches[0].clientX;
      lastTouchY = touches[0].clientY;
    } else if (touches.length === 2) {
      lastPinchDistance = getPinchDistance(touches);
      const mid = getMidPoint(touches);
      lastMidX = mid.x;
      lastMidY = mid.y;
    }
    activeTouches = touches.length;
  };

  const onTouchMove = (e) => {
    e.preventDefault();
    const touches = e.touches;

    if (touches.length === 1 && activeTouches === 1) {
      // Вращение: инвертируем dx, чтобы свайп вправо вращал модель вправо
      const dx = touches[0].clientX - lastTouchX;
      const dy = touches[0].clientY - lastTouchY;
      camera.rotate(dx, dy);   // исправлено
      lastTouchX = touches[0].clientX;
      lastTouchY = touches[0].clientY;
    } else if (touches.length === 2) {
      // Панорамирование и зум
      const currentPinch = getPinchDistance(touches);
      const mid = getMidPoint(touches);

      if (lastPinchDistance > 0) {
        const deltaPinch = currentPinch - lastPinchDistance;
        camera.zoom(deltaPinch);
      }

      if (lastMidX !== 0 && lastMidY !== 0) {
        const dx = mid.x - lastMidX;
        const dy = mid.y - lastMidY;
        camera.pan(dx, dy);
      }

      lastPinchDistance = currentPinch;
      lastMidX = mid.x;
      lastMidY = mid.y;
    }
  };

  const onTouchEnd = (e) => {
    e.preventDefault();
    activeTouches = e.touches.length;
    if (e.touches.length < 2) {
      lastPinchDistance = 0;
      lastMidX = 0;
      lastMidY = 0;
    }
  };

  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  canvas.addEventListener('touchcancel', onTouchEnd);

  return {
    update() {
      // Здесь можно добавить непрерывные жесты, если понадобятся
    }
  };
}