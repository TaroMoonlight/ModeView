// app.js — главный управляющий скрипт
(async function main() {

    // Spector захватчик
    /*let spectorCapture = null;
    if (typeof SPECTOR !== 'undefined') {
        spectorCapture = new SPECTOR.Spector();
        spectorCapture.displayUI(); // показывает кнопку захвата на странице
    }*/

    const canvas = document.getElementById('mainCanvas');
    const renderer = new SimpleRenderer(canvas);
    renderer.prepare();

    // Загрузка модели
    const { json, binBuffer } = await loadGLB('model.glb');
    //console.log('glTF JSON:', json);

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

    //Simple CubeMap
    function createTestCubemapImages() {
        const size = 64;
        const colors = [
            [255, 0, 0], [0, 255, 0], [0, 0, 255],   // +X, -X, +Y
            [255, 255, 0], [255, 0, 255], [0, 255, 255] // -Y, +Z, -Z
        ];
        return colors.map(c => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
            ctx.fillRect(0, 0, size, size);
            return canvas;
        });
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
    const distance = maxDim / Math.tan(Math.PI / 8) * 1.3;
    const camera = new OrbitCamera(center, distance, 0, Math.PI / 4);
    camera.updateProjection(canvas.clientWidth / canvas.clientHeight);
    renderer.camera = camera;

    const productionUI = new ProductionUI();
    // Настройка сброса камеры
    productionUI.setResetCallback(() => {
        camera.target = center.slice();
        camera.distance = distance;
        camera.theta = 0;
        camera.phi = Math.PI / 4;
        camera.updateViewMatrix();
    });

    if (CONFIG.IS_PHONE) {
        new MobileControls(camera);
    }

    // Подсчёт треугольников (если нужно)
    let totalTriangles = 0;
    allMeshes.forEach(mesh => {
        mesh.mesh.primitives.forEach(prim => {
            const idxAccessor = mesh.accessors[prim.indices];
            if (idxAccessor) totalTriangles += idxAccessor.count / 3;
        });
    });
    productionUI.setModelInfo({ triangles: Math.round(totalTriangles), textures: json.textures?.length || 0 });

    // Система снежинок
    const snowSystem = new SnowParticleSystem(renderer, {
        particleCount: 600,
        particleSize: 0.3,
        wind: [0.1, -0.5, 0.0],   // лёгкий ветер вправо и вниз
        areaRadius: 15,
        areaHeight: 25
    });

    /*const testImages = createTestCubemapImages();
    renderer.cubeTexture = renderer.createCubeTexture(testImages);*/
    const skyImages = generateStarryNightSky(512, 400, true, 25); // 512x512, 400 звёзд на грань
    renderer.cubeTexture = renderer.createCubeTexture(skyImages);

    const textureEditor = new CanvasTextureEditor(renderer, renderer.cubeTexture, 512);

    // Переключение редактора по клавише 'E'
    document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyE') {
            textureEditor.toggle();
        }
    });

    //console.log('Skybox vertex buffer:', renderer.skyboxVertexBuffer);
    //console.log('Skybox index buffer:', renderer.skyboxIndexBuffer);

    // Для отслеживания времени
    let lastTime = performance.now();

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
    const desktopInput = setupInput(canvas, camera);
    const mobileInput = setupMobileInput(canvas, camera);

    let frameCount = 0;
    let fpsUpdateTime = lastTime;

    function loop() {
        const now = performance.now();
        frameCount++;

        // Обновление FPS раз в секунду
        if (now - fpsUpdateTime >= 1000) {
            productionUI.setFPS(frameCount / ((now - fpsUpdateTime) * 0.001));
            frameCount = 0;
            fpsUpdateTime = now;
        }

        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        desktopInput.updateKeyboard();
        mobileInput.update();

        // Очистка
        renderer.draw(null, true);
        renderer.drawSkybox(camera);

        renderer.draw(meshDrawData, false);
        if (showAABB && wireframeBox && CONFIG.DEBUG) {
            renderer.drawWireframeBox(wireframeBox, camera, [0.2, 1.0, 0.2]);
        }

        // Мировые оси (если включены в UI или в debug)
        if ((CONFIG.DEBUG && showAxes) || productionUI.isAxesEnabled()) {
            renderer.drawWorldAxes(camera);
        }

        // Снег
        if (productionUI.isSnowEnabled()) {
            snowSystem.update(dt, camera);
            snowSystem.draw(camera);
        }

        // Отладка (только в debug-режиме)
        if (CONFIG.DEBUG && debugModeActive && debugHandler) {
            debugHandler.update(getAxisFlags());
        }

        requestAnimationFrame(loop);
    }
    loop();
    console.log('✅ Модульная система готова');
})().catch(err => {
    console.error(err);
    document.body.innerText = 'Ошибка: ' + err.message;
});