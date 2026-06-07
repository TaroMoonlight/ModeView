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
    const { json, binBuffer } = await loadGLB('model8.glb');
    console.log('glTF JSON:', json);

    // Загружаем все изображения
    const textureImages = await loadTextureImages(json, binBuffer);
    //const allMeshes = collectMeshes(json, binBuffer, textureImages);
    const maxBones = renderer.maxBones;
    const allMeshes = collectMeshes(json, binBuffer, textureImages, maxBones);
    if (!allMeshes.length) throw new Error('Нет мешей в сцене');

    //const meshDrawData = await Promise.all(allMeshes.map(mesh => renderer.uploadMesh(mesh, binBuffer)));

    // Загружаем меши: для статических используем обычный uploadMesh, для скиновых — uploadSkinnedMesh
    const meshDrawData = [];
    for (const meshInfo of allMeshes) {
        let data;
        if (meshInfo.skinData) {
            data = await renderer.uploadSkinnedMesh(meshInfo, binBuffer);
        } else {
            data = await renderer.uploadMesh(meshInfo, binBuffer);
        }
        // Сохраняем ссылку на меш для доступа к jointMatrices
        meshInfo.drawData = data;
        meshDrawData.push(data);
    }

    // Вычисляем матрицы костей для скиновых мешей
    allMeshes.forEach(mesh => {
        if (mesh.skinData) {
            const joints = mesh.skinData.joints;
            const ibmData = mesh.skinData.inverseBindMatrices;
            const jointMatrices = new Float32Array(joints.length * 16);
            for (let j = 0; j < joints.length; j++) {
                const jointNodeIdx = joints[j];
                const jointGlobal = mesh.nodes[jointNodeIdx].globalMatrix;
                const ibm = mat4.create();
                for (let k = 0; k < 16; k++) ibm[k] = ibmData[j * 16 + k];
                const jointMatrix = mat4.create();
                mat4.multiply(jointMatrix, jointGlobal, ibm);
                jointMatrices.set(jointMatrix, j * 16);
            }
            mesh.jointMatrices = jointMatrices;
        }

        if (mesh.skinData) {
            console.log('=== Skin Debug ===');
            console.log('Joint count:', mesh.skinData.joints.length);
            // Выведем первую кость
            const joint0 = mesh.skinData.joints[0];
            const globalMatrix = mesh.nodes[joint0].globalMatrix;
            console.log('Joint 0 global matrix:', globalMatrix);
            console.log('Joint 0 translation:', mesh.nodes[joint0].translation);
            console.log('Joint 0 rotation:', mesh.nodes[joint0].rotation);
        }
    });

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

    //const skyImages = generateStarryNightSky(512, 400, true, 25); // 512x512, 400 звёзд на грань
    //renderer.cubeTexture = renderer.createCubeTexture(skyImages);

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
        renderer.gl.clearColor(0, 86/255, 148/255, 1.0);
        //renderer.drawSkybox(camera);

        //renderer.draw(meshDrawData, false);

        for (const mesh of allMeshes) {
            const drawData = mesh.drawData;
            if (!drawData) continue;
            if (mesh.skinData && mesh.jointMatrices) {
                for (const prim of drawData) {
                    renderer.drawSkinMesh(prim, camera, mesh.jointMatrices);
                }
            } else {
                renderer.draw([drawData], false);
            }
        }

        /*
        if (showAABB && wireframeBox && CONFIG.DEBUG) {
            renderer.drawWireframeBox(wireframeBox, camera, [0.2, 1.0, 0.2]);
        }

        // Мировые оси (если включены в UI или в debug)
        if ((CONFIG.DEBUG && showAxes) || productionUI.isAxesEnabled()) {
            renderer.drawWorldAxes(camera);
        }*/

        // Снег
        if (productionUI.isSnowEnabled()) {
            snowSystem.update(dt, camera);
            snowSystem.draw(camera);
        }

        // Отладка (только в debug-режиме)
        /*if (CONFIG.DEBUG && debugModeActive && debugHandler) {
            debugHandler.update(getAxisFlags());
        }*/

        requestAnimationFrame(loop);
    }
    loop();
    console.log('✅ Модульная система готова');
})().catch(err => {
    console.error(err);
    document.body.innerText = 'Ошибка: ' + err.message;
});