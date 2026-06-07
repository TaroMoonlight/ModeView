function generateStarryNightSky0(size = 512, starsPerFace = 300) {
  const faces = [];
  const colors = [
    '#0a0a2e', // тёмно-синий
    '#0d0d35',
    '#0a0a2e',
    '#0d0d35',
    '#0a0a2e',
    '#0d0d35'
  ]; // лёгкая вариация фона для реализма

  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Фон
    ctx.fillStyle = colors[face];
    ctx.fillRect(0, 0, size, size);

    // Звёзды
    for (let i = 0; i < starsPerFace; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = Math.random() * 1.8 + 0.2; // от 0.2 до 2.0 пикселей
      const brightness = Math.random() * 0.8 + 0.2; // 0.2 .. 1.0
      
      // Цветовая вариация: белый + немного тёплых/холодных оттенков
      const r = 255;
      const g = 255 - Math.floor(Math.random() * 30); // 225..255
      const b = 255 - Math.floor(Math.random() * 50); // 205..255
      const a = brightness;
      
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    faces.push(canvas);
  }
  return faces;
}

function generateStarryNightSky1(size = 512, starsPerFace = 500, addClouds = true) {
  const faces = [];
  // Немного варьируем фон для реализма
  const bgColors = [
    '#0a0a2e', '#0d0d35', '#0a0a2e',
    '#0d0d35', '#0a0a2e', '#0d0d35'
  ];

  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // --- Фон ---
    ctx.fillStyle = bgColors[face];
    ctx.fillRect(0, 0, size, size);

    // --- Звёзды (разноцветные) ---
    for (let i = 0; i < starsPerFace; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = Math.random() * 2.5 + 0.3; // 0.3..2.8 px
      const brightness = Math.random() * 0.9 + 0.1; // 0.1..1.0

      // Цвет: от белого до желтоватого/голубоватого
      const r = 255;
      const g = Math.floor(200 + Math.random() * 55); // 200..255
      const b = Math.floor(180 + Math.random() * 75); // 180..255

      ctx.fillStyle = `rgba(${r},${g},${b},${brightness})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Лёгкое свечение вокруг самых ярких звёзд
      if (brightness > 0.7 && Math.random() > 0.5) {
        const glowRadius = radius * 2.5;
        const gradient = ctx.createRadialGradient(x, y, radius * 0.5, x, y, glowRadius);
        gradient.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Облака (опционально) ---
    if (addClouds) {
      ctx.save();
      ctx.globalAlpha = 0.12; // общая прозрачность облаков
      ctx.fillStyle = '#ffffff';

      const numClouds = Math.floor(size / 25); // примерно 20 для 512
      for (let i = 0; i < numClouds; i++) {
        const cx = Math.random() * size;
        const cy = Math.random() * size;
        const baseR = size * (Math.random() * 0.08 + 0.04); // 4-12% от размера

        // Кластер из нескольких кругов
        for (let j = 0; j < 5; j++) {
          const offX = (Math.random() - 0.5) * baseR * 2;
          const offY = (Math.random() - 0.5) * baseR * 2;
          const r = baseR * (Math.random() * 0.5 + 0.5);
          ctx.beginPath();
          ctx.arc(cx + offX, cy + offY, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    faces.push(canvas);
  }
  return faces;
}

function generateStarryNightSky(size = 1024, starsPerFace = 800, addClouds = true, cloudBlur = 10) {
  const faces = [];
  const bgColors = [
    '#0a0a2e', '#0d0d35', '#0a0a2e',
    '#0d0d35', '#0a0a2e', '#0d0d35'
  ];

  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Фон
    ctx.fillStyle = bgColors[face];
    ctx.fillRect(0, 0, size, size);

    // Красочные звёзды
    for (let i = 0; i < starsPerFace; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = Math.random() * 2.5 + 0.3;
      const brightness = Math.random() * 0.9 + 0.1;

      const r = 255;
      const g = Math.floor(200 + Math.random() * 55);
      const b = Math.floor(180 + Math.random() * 75);

      ctx.fillStyle = `rgba(${r},${g},${b},${brightness})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (brightness > 0.7 && Math.random() > 0.5) {
        const glowRadius = radius * 2.5;
        const gradient = ctx.createRadialGradient(x, y, radius * 0.5, x, y, glowRadius);
        gradient.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Облака с размытием
    if (addClouds) {
      ctx.save();
      ctx.filter = `blur(${cloudBlur}px)`;
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#ffffff';

      const numClouds = Math.floor(size / 30);
      for (let i = 0; i < numClouds; i++) {
        const cx = Math.random() * size;
        const cy = Math.random() * size;
        const baseR = size * (Math.random() * 0.1 + 0.05);

        for (let j = 0; j < 5; j++) {
          const offX = (Math.random() - 0.5) * baseR * 2;
          const offY = (Math.random() - 0.5) * baseR * 2;
          const r = baseR * (Math.random() * 0.6 + 0.4);
          ctx.beginPath();
          ctx.arc(cx + offX, cy + offY, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    faces.push(canvas);
  }
  return faces;
}

// Генерация равнопромежуточной панорамы (Equirectangular)
function generateEquirectangularSky(width, height, starsCount, addClouds, cloudBlur) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Фон
  ctx.fillStyle = '#0a0a2e';
  ctx.fillRect(0, 0, width, height);

  // Красочные звёзды (равномерно по сфере)
  for (let i = 0; i < starsCount; i++) {
    // Сферические координаты
    const theta = Math.random() * Math.PI * 2;          // азимут 0..2PI
    const phi = Math.acos(2 * Math.random() - 1);       // полярный угол 0..PI
    // UV на панораме: u = theta/(2PI), v = phi/PI
    const u = theta / (Math.PI * 2);
    const v = phi / Math.PI;
    const x = u * width;
    const y = v * height;

    const radius = Math.random() * 2.5 + 0.3;
    const brightness = Math.random() * 0.9 + 0.1;
    const r = 255;
    const g = Math.floor(200 + Math.random() * 55);
    const b = Math.floor(180 + Math.random() * 75);

    ctx.fillStyle = `rgba(${r},${g},${b},${brightness})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Свечение ярких звёзд
    if (brightness > 0.7 && Math.random() > 0.5) {
      const glowRadius = radius * 2.5;
      const gradient = ctx.createRadialGradient(x, y, radius * 0.5, x, y, glowRadius);
      gradient.addColorStop(0, `rgba(${r},${g},${b},0.6)`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Облака (размытые, на всю панораму)
  if (addClouds) {
    ctx.save();
    ctx.filter = `blur(${cloudBlur}px)`;
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ffffff';
    const numClouds = Math.floor(width / 40);
    for (let i = 0; i < numClouds; i++) {
      const cx = Math.random() * width;
      const cy = Math.random() * height;
      const baseR = width * (Math.random() * 0.04 + 0.02);
      for (let j = 0; j < 5; j++) {
        const offX = (Math.random() - 0.5) * baseR * 2;
        const offY = (Math.random() - 0.5) * baseR * 2;
        const r = baseR * (Math.random() * 0.6 + 0.4);
        ctx.beginPath();
        ctx.arc(cx + offX, cy + offY, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  return canvas;
}

// Конвертация панорамы в 6 граней куба
function convertEquirectangularToCube(equirectCanvas, faceSize) {
  const equirectCtx = equirectCanvas.getContext('2d');
  const equirectWidth = equirectCanvas.width;
  const equirectHeight = equirectCanvas.height;
  const directions = [
    { forward: [1,0,0], up: [0,-1,0] },  // +X
    { forward: [-1,0,0], up: [0,-1,0] }, // -X
    { forward: [0,1,0], up: [0,0,1] },   // +Y
    { forward: [0,-1,0], up: [0,0,-1] }, // -Y
    { forward: [0,0,1], up: [0,-1,0] },  // +Z
    { forward: [0,0,-1], up: [0,-1,0] }  // -Z
  ];
  const faces = [];

  for (const dir of directions) {
    const faceCanvas = document.createElement('canvas');
    faceCanvas.width = faceSize;
    faceCanvas.height = faceSize;
    const faceCtx = faceCanvas.getContext('2d');
    const imageData = faceCtx.createImageData(faceSize, faceSize);
    const data = imageData.data;

    const fwd = dir.forward;
    const up = dir.up;
    // Вычисляем right как cross(up, fwd)
    const right = [
      up[1]*fwd[2] - up[2]*fwd[1],
      up[2]*fwd[0] - up[0]*fwd[2],
      up[0]*fwd[1] - up[1]*fwd[0]
    ];

    for (let y = 0; y < faceSize; y++) {
      for (let x = 0; x < faceSize; x++) {
        // Нормализованные координаты на грани (-1..1)
        const u = (x / faceSize) * 2 - 1;
        const v = (y / faceSize) * 2 - 1;
        // Направление вектора из центра куба
        const px = fwd[0] + right[0] * u + up[0] * v;
        const py = fwd[1] + right[1] * u + up[1] * v;
        const pz = fwd[2] + right[2] * u + up[2] * v;
        const len = Math.sqrt(px*px + py*py + pz*pz);
        const nx = px / len;
        const ny = py / len;
        const nz = pz / len;

        // Преобразуем в сферические координаты
        const theta = Math.atan2(nx, nz);          // -PI..PI
        const phi = Math.acos(ny);                 // 0..PI
        // UV на панораме (с учётом сдвига theta)
        const uEq = ((theta / (Math.PI * 2)) + 0.5) % 1.0;
        const vEq = phi / Math.PI;
        const sx = uEq * equirectWidth;
        const sy = vEq * equirectHeight;

        // Ближайший сосед (для скорости)
        const ix = Math.min(equirectWidth-1, Math.max(0, Math.floor(sx)));
        const iy = Math.min(equirectHeight-1, Math.max(0, Math.floor(sy)));
        const pixel = equirectCtx.getImageData(ix, iy, 1, 1).data;
        const idx = (y * faceSize + x) * 4;
        data[idx]   = pixel[0];
        data[idx+1] = pixel[1];
        data[idx+2] = pixel[2];
        data[idx+3] = 255;
      }
    }
    faceCtx.putImageData(imageData, 0, 0);
    faces.push(faceCanvas);
  }

  return faces;
}