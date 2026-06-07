// renderer.js — WebGL‑рендерер с unlit‑шейдером (текстура + цвет)
class SimpleRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { antialias: true })
            || canvas.getContext('experimental-webgl', { antialias: true });
        if (!this.gl) throw new Error('WebGL 1.0 не поддерживается');

        const gl = this.gl;
        // Максимальное количество костей, которое можно передать через uniform
        const maxUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
        this.maxBones = Math.floor(maxUniformVectors / 4);
        console.log(`Max bones supported: ${this.maxBones}`);
        // VAO расширение
        this.vaoExt = gl.getExtension('OES_vertex_array_object');
        this.hasVAO = !!this.vaoExt;
        if (this.hasVAO) {
            console.log('VAO supported');
        } else {
            console.log('VAO not available, using traditional attribute setup');
        }

        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0.1, 0.1, 0.15, 1.0);

        this.camera = null;
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
            this.canvas.width = w * dpr;
            this.canvas.height = h * dpr;
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            if (this.camera) {
                this.camera.updateProjection(w / h);
            }
        }
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('Ошибка компиляции шейдера: ' + info);
        }
        return shader;
    }

    createProgram(vertSrc, fragSrc) {
        const gl = this.gl;
        const vert = this.createShader(gl.VERTEX_SHADER, vertSrc);
        const frag = this.createShader(gl.FRAGMENT_SHADER, fragSrc);
        const program = gl.createProgram();
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('Ошибка линковки программы: ' + gl.getProgramInfoLog(program));
        }
        return program;
    }

    prepare() {
        const gl = this.gl;
        const vertSrc = `
      attribute vec4 aPosition;
      attribute vec2 aTexCoord;
      uniform mat4 uProjectionView;
      uniform mat4 uModelMatrix;
      varying vec2 vTexCoord;
      void main() {
        gl_Position = uProjectionView * uModelMatrix * aPosition;
        vTexCoord = aTexCoord;
      }
    `;

        const vertSrcSkin = `
        attribute vec4 aPosition;
        attribute vec2 aTexCoord;
        attribute vec4 aJoints;
        attribute vec4 aWeights;
        uniform mat4 uProjectionView;
        uniform mat4 uModelMatrix;
        uniform mat4 uJointMatrices[256];
        varying vec2 vTexCoord;
        void main() {
            mat4 skinMatrix = 
            aWeights.x * uJointMatrices[int(aJoints.x)] +
            aWeights.y * uJointMatrices[int(aJoints.y)] +
            aWeights.z * uJointMatrices[int(aJoints.z)] +
            aWeights.w * uJointMatrices[int(aJoints.w)];
            vec4 skinnedPos = skinMatrix * vec4(aPosition.xyz, 1.0);
            gl_Position = uProjectionView * uModelMatrix * skinnedPos;
            vTexCoord = aTexCoord;
        }
        `;

        const fragSrc = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform vec4 uBaseColorFactor;
      uniform sampler2D uBaseColorTexture;
      void main() {
        vec4 texColor = texture2D(uBaseColorTexture, vTexCoord);
        gl_FragColor = texColor * uBaseColorFactor;
      }
    `;

        // Фрагментный такой же как и для обычной модели
        this.skinProgram = this.createProgram(vertSrcSkin, fragSrc);
        // Получаем локации uniform'ов
        this.skinUniforms = {
            uProjectionView: gl.getUniformLocation(this.skinProgram, 'uProjectionView'),
            uModelMatrix: gl.getUniformLocation(this.skinProgram, 'uModelMatrix'),
            uBaseColorFactor: gl.getUniformLocation(this.skinProgram, 'uBaseColorFactor'),
            uBaseColorTexture: gl.getUniformLocation(this.skinProgram, 'uBaseColorTexture'),
            uJointMatrices: gl.getUniformLocation(this.skinProgram, 'uJointMatrices[0]') // массив
        };
        this.skinAttribs = {
            aPosition: gl.getAttribLocation(this.skinProgram, 'aPosition'),
            aTexCoord: gl.getAttribLocation(this.skinProgram, 'aTexCoord'),
            aJoints: gl.getAttribLocation(this.skinProgram, 'aJoints'),
            aWeights: gl.getAttribLocation(this.skinProgram, 'aWeights')
        };

        this.program = this.createProgram(vertSrc, fragSrc);
        this.uniforms = {
            uProjectionView: gl.getUniformLocation(this.program, 'uProjectionView'),
            uModelMatrix: gl.getUniformLocation(this.program, 'uModelMatrix'),
            uBaseColorFactor: gl.getUniformLocation(this.program, 'uBaseColorFactor'),
            uBaseColorTexture: gl.getUniformLocation(this.program, 'uBaseColorTexture')
        };
        this.attribs = {
            aPosition: gl.getAttribLocation(this.program, 'aPosition'),
            aTexCoord: gl.getAttribLocation(this.program, 'aTexCoord')
        };

        // Белая текстура-заглушка для объектов без текстуры
        this.whiteTexture = this._createWhiteTexture();

        // Создание буфера для мировых осей
        const axisLength = 10000;
        const axisVertices = new Float32Array([
            -axisLength, 0, 0, axisLength, 0, 0,   // X
            0, -axisLength, 0, 0, axisLength, 0,   // Y
            0, 0, -axisLength, 0, 0, axisLength    // Z
        ]);
        this.worldAxesBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.worldAxesBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, axisVertices, gl.STATIC_DRAW);

        this._initSkyboxGL();
    }

    // ---------- Skybox ----------
    _initSkyboxGL0() {
        const gl = this.gl;

        const vertSrc = `
    attribute vec3 aPosition;
    uniform mat4 uProjectionView;
    void main() {
      vec4 pos = uProjectionView * vec4(aPosition, 1.0);
      gl_Position = pos;
      //vTexCoord = aPosition;
    }
  `;
        const fragSrc = `
    precision mediump float;
    void main() {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `;

        this.skyboxProgram = this.createProgram(vertSrc, fragSrc);
        this.skyboxUniforms = {
            uProjectionView: gl.getUniformLocation(this.skyboxProgram, 'uProjectionView')
        };
        this.skyboxAttribs = {
            aPosition: gl.getAttribLocation(this.skyboxProgram, 'aPosition')
        };

        // Геометрия куба (24 вершины, индексы)
        const vertices = new Float32Array([
            // правый
            1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1,
            // левый
            -1, 1, 1, -1, -1, 1, -1, 1, -1, -1, -1, -1,
            // верхний
            -1, 1, -1, 1, 1, -1, -1, 1, 1, 1, 1, 1,
            // нижний
            -1, -1, 1, 1, -1, 1, -1, -1, -1, 1, -1, -1,
            // передний
            -1, 1, 1, 1, 1, 1, -1, -1, 1, 1, -1, 1,
            // задний
            1, 1, -1, -1, 1, -1, 1, -1, -1, -1, -1, -1
        ]);
        const indices = new Uint16Array([
            0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7,
            8, 9, 10, 10, 9, 11, 12, 13, 14, 14, 13, 15,
            16, 17, 18, 18, 17, 19, 20, 21, 22, 22, 21, 23
        ]);

        this.skyboxVertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.skyboxVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        this.skyboxIndexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skyboxIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        this.skyboxIndexCount = indices.length;
    }

    // ---------- Skybox ----------
    _initSkyboxGL() {
        const gl = this.gl;

        // Шейдеры
        const vertSrc = `
    attribute vec3 aPosition;
    uniform mat4 uProjectionView;
    varying vec3 vTexCoord;
    void main() {
      vec4 pos = uProjectionView * vec4(aPosition, 1.0);
      gl_Position = pos.xyww; // всегда максимальная глубина
      vTexCoord = aPosition;  // позиция куба = направление
    }
  `;
        const fragSrc = `
    precision mediump float;
    varying vec3 vTexCoord;
    uniform samplerCube uCubeTexture;
    void main() {
      gl_FragColor = textureCube(uCubeTexture, vTexCoord);
    }
  `;

        this.skyboxProgram = this.createProgram(vertSrc, fragSrc);
        this.skyboxUniforms = {
            uProjectionView: gl.getUniformLocation(this.skyboxProgram, 'uProjectionView'),
            uCubeTexture: gl.getUniformLocation(this.skyboxProgram, 'uCubeTexture')
        };
        this.skyboxAttribs = {
            aPosition: gl.getAttribLocation(this.skyboxProgram, 'aPosition')
        };

        // Единичный куб (инвертированные грани, чтобы рисовался внутри)
        const vertices = new Float32Array([
            // правый
            1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1,
            // левый
            -1, 1, 1, -1, -1, 1, -1, 1, -1, -1, -1, -1,
            // верхний
            -1, 1, -1, 1, 1, -1, -1, 1, 1, 1, 1, 1,
            // нижний
            -1, -1, 1, 1, -1, 1, -1, -1, -1, 1, -1, -1,
            // передний
            -1, 1, 1, 1, 1, 1, -1, -1, 1, 1, -1, 1,
            // задний
            1, 1, -1, -1, 1, -1, 1, -1, -1, -1, -1, -1
        ]);
        const indices = new Uint16Array([
            0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7,
            8, 9, 10, 10, 9, 11, 12, 13, 14, 14, 13, 15,
            16, 17, 18, 18, 17, 19, 20, 21, 22, 22, 21, 23
        ]);

        this.skyboxVertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.skyboxVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        this.skyboxIndexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skyboxIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        this.skyboxIndexCount = indices.length;
    }

    // Загружает 6 изображений в кубическую текстуру
    createCubeTexture(images) {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

        const targets = [
            gl.TEXTURE_CUBE_MAP_POSITIVE_X, gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
            gl.TEXTURE_CUBE_MAP_POSITIVE_Y, gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
            gl.TEXTURE_CUBE_MAP_POSITIVE_Z, gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
        ];
        for (let i = 0; i < 6; i++) {
            gl.texImage2D(targets[i], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]);
        }
        gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    drawSkybox(camera) {
        const gl = this.gl;
        gl.useProgram(this.skyboxProgram);

        const oldDepthFunc = gl.getParameter(gl.DEPTH_FUNC);

        gl.depthFunc(gl.LEQUAL);

        // Убираем перенос из видовой матрицы, оставляем только поворот
        const view = mat4.create();
        mat4.copy(view, camera.viewMatrix);
        view[12] = 0; view[13] = 0; view[14] = 0;
        const projectionView = mat4.create();
        mat4.multiply(projectionView, camera.projectionMatrix, view);
        gl.uniformMatrix4fv(this.skyboxUniforms.uProjectionView, false, projectionView);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.cubeTexture);
        gl.uniform1i(this.skyboxUniforms.uCubeTexture, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.skyboxVertexBuffer);
        gl.enableVertexAttribArray(this.skyboxAttribs.aPosition);
        gl.vertexAttribPointer(this.skyboxAttribs.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.depthMask(false);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skyboxIndexBuffer);
        gl.drawElements(gl.TRIANGLES, this.skyboxIndexCount, gl.UNSIGNED_SHORT, 0);

        gl.depthFunc(oldDepthFunc);
        gl.depthMask(true);

        gl.disableVertexAttribArray(this.skyboxAttribs.aPosition);
    }

    // Загружает 6 изображений в кубическую текстуру
    createCubeTexture(images) {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

        const targets = [
            gl.TEXTURE_CUBE_MAP_POSITIVE_X, gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
            gl.TEXTURE_CUBE_MAP_POSITIVE_Y, gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
            gl.TEXTURE_CUBE_MAP_POSITIVE_Z, gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
        ];
        for (let i = 0; i < 6; i++) {
            gl.texImage2D(targets[i], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]);
        }
        gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    drawSkybox0(camera) {
        const gl = this.gl;
        gl.useProgram(this.skyboxProgram);

        // Убираем перенос из view матрицы
        const view = mat4.create();
        mat4.copy(view, camera.viewMatrix);
        view[12] = 0; view[13] = 0; view[14] = 0;
        const projectionView = mat4.create();
        mat4.multiply(projectionView, camera.projectionMatrix, view);
        gl.uniformMatrix4fv(this.skyboxUniforms.uProjectionView, false, projectionView);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.skyboxVertexBuffer);
        gl.enableVertexAttribArray(this.skyboxAttribs.aPosition);
        gl.vertexAttribPointer(this.skyboxAttribs.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.skyboxIndexBuffer);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(false); // чтобы куб всегда был сзади
        gl.drawElements(gl.TRIANGLES, this.skyboxIndexCount, gl.UNSIGNED_SHORT, 0);
        gl.depthMask(true);

        gl.disableVertexAttribArray(this.skyboxAttribs.aPosition);
    }

    // Создаёт WebGL-текстуру из HTMLImageElement
    createTextureFromImage(image) {
        if (!image) return this.whiteTexture;
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return tex;
    }

    async uploadMesh(meshInfo, binBuffer) {
        const { mesh, accessors, bufferViews, modelMatrix, primitivesData } = meshInfo;
        const gl = this.gl;
        const drawDataArray = [];

        for (let i = 0; i < mesh.primitives.length; i++) {
            const prim = mesh.primitives[i];
            const primData = primitivesData[i];

            const indexAccessor = accessors[prim.indices];
            if (!indexAccessor) throw new Error('Примитив без индексов – пока не поддерживается');

            const indexBV = bufferViews[indexAccessor.bufferView];
            const indexData = new Uint8Array(binBuffer,
                (indexBV.byteOffset || 0) + (indexAccessor.byteOffset || 0),
                indexAccessor.count * this._componentSize(indexAccessor.componentType) * this._typeCount(indexAccessor.type));

            let indexTypedArray;
            if (indexAccessor.componentType === 5123) {
                indexTypedArray = new Uint16Array(indexData.buffer, indexData.byteOffset, indexData.byteLength / 2);
            } else if (indexAccessor.componentType === 5125) {
                indexTypedArray = new Uint32Array(indexData.buffer, indexData.byteOffset, indexData.byteLength / 4);
            } else {
                throw new Error('Неподдерживаемый компонентный тип индексов');
            }

            const glIndexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glIndexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexTypedArray, gl.STATIC_DRAW);

            // Позиции
            const posAttr = prim.attributes?.POSITION;
            if (posAttr === undefined) throw new Error('Нет атрибута POSITION');
            const posAccessor = accessors[posAttr];
            const posBV = bufferViews[posAccessor.bufferView];
            const posData = new Float32Array(binBuffer,
                (posBV.byteOffset || 0) + (posAccessor.byteOffset || 0),
                posAccessor.count * 3);
            const posBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);

            // UV-координаты (если есть)
            let texCoordBuffer = null;
            let hasTexCoords = false;
            const texCoordAttr = prim.attributes?.TEXCOORD_0;
            if (texCoordAttr !== undefined) {
                const texAccessor = accessors[texCoordAttr];
                const texBV = bufferViews[texAccessor.bufferView];
                const texData = new Float32Array(binBuffer,
                    (texBV.byteOffset || 0) + (texAccessor.byteOffset || 0),
                    texAccessor.count * 2);
                texCoordBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, texData, gl.STATIC_DRAW);
                hasTexCoords = true;
            }

            // Текстура из загруженного изображения
            const texture = this.createTextureFromImage(primData.baseColorTextureImage);

            drawDataArray.push({
                indexBuffer: glIndexBuffer,
                indexCount: indexAccessor.count,
                indexType: indexAccessor.componentType === 5123 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
                posBuffer,
                texCoordBuffer,
                hasTexCoords,
                texture,
                baseColorFactor: primData.baseColorFactor,
                modelMatrix
            });
        }

        return drawDataArray;
    }

    async uploadSkinnedMesh(meshInfo, binBuffer) {
        const { mesh, accessors, bufferViews, modelMatrix, primitivesData, skinData, nodes, nodeIndex } = meshInfo;
        const gl = this.gl;
        const drawDataArray = [];

        // Если есть готовые сырые данные после разбиения – используем их
        const rawData = meshInfo._rawData;
        if (rawData) {
            // ----- ЗАГРУЗКА РАЗБИТОГО ПРИМИТИВА -----
            const posBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, rawData.positions, gl.STATIC_DRAW);

            let texCoordBuffer = null;
            if (rawData.uvs) {
                texCoordBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, rawData.uvs, gl.STATIC_DRAW);
            }

            const jointsBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, jointsBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, rawData.joints, gl.STATIC_DRAW);

            const weightsBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, weightsBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, rawData.weights, gl.STATIC_DRAW);

            const indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, rawData.indices, gl.STATIC_DRAW);

            const vao = this.createSkinVAO({
                positionBuffer: posBuffer,
                texCoordBuffer: texCoordBuffer,
                jointsBuffer: jointsBuffer,
                weightsBuffer: weightsBuffer,
            }, indexBuffer);

            const primData = primitivesData[0];
            const texture = this.createTextureFromImage(primData.baseColorTextureImage) || this.whiteTexture;

            drawDataArray.push({
                indexBuffer,
                indexCount: rawData.indices.length,
                indexType: gl.UNSIGNED_SHORT,
                posBuffer,
                texCoordBuffer,
                texture,
                baseColorFactor: primData.baseColorFactor,
                modelMatrix,
                jointsBuffer,
                weightsBuffer,
                vao,
                skinData,
                nodes,
                nodeIndex
            });
            return drawDataArray;
        }

        // ----- ОБЫЧНАЯ ЗАГРУЗКА СКИНОВОГО МЕША (НЕ РАЗБИТОГО) -----
        for (let i = 0; i < mesh.primitives.length; i++) {
            const prim = mesh.primitives[i];
            const primData = primitivesData[i];

            // Проверяем, что есть скин-атрибуты
            if (prim.attributes.JOINTS_0 === undefined || prim.attributes.WEIGHTS_0 === undefined) {
                console.warn('Примитив без скин-атрибутов, пропущен');
                continue;
            }

            // Индексы
            const indexAccessor = accessors[prim.indices];
            if (!indexAccessor) throw new Error('Нет индексов');
            const indexBV = bufferViews[indexAccessor.bufferView];
            const indexData = new Uint8Array(binBuffer,
                (indexBV.byteOffset || 0) + (indexAccessor.byteOffset || 0),
                indexAccessor.count * this._componentSize(indexAccessor.componentType) * this._typeCount(indexAccessor.type));
            let indexTypedArray;
            if (indexAccessor.componentType === 5123) {
                indexTypedArray = new Uint16Array(indexData.buffer, indexData.byteOffset, indexData.byteLength / 2);
            } else if (indexAccessor.componentType === 5125) {
                indexTypedArray = new Uint32Array(indexData.buffer, indexData.byteOffset, indexData.byteLength / 4);
            } else {
                throw new Error('Неподдерживаемый компонентный тип индексов');
            }
            const glIndexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glIndexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexTypedArray, gl.STATIC_DRAW);

            // Позиции
            const posAttr = prim.attributes.POSITION;
            if (posAttr === undefined) throw new Error('Нет POSITION');
            const posAccessor = accessors[posAttr];
            const posBV = bufferViews[posAccessor.bufferView];
            const posData = new Float32Array(binBuffer,
                (posBV.byteOffset || 0) + (posAccessor.byteOffset || 0),
                posAccessor.count * 3);
            const posBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);

            // UV (если есть)
            let texCoordBuffer = null;
            const texCoordAttr = prim.attributes.TEXCOORD_0;
            if (texCoordAttr !== undefined) {
                const texAccessor = accessors[texCoordAttr];
                const texBV = bufferViews[texAccessor.bufferView];
                const texData = new Float32Array(binBuffer,
                    (texBV.byteOffset || 0) + (texAccessor.byteOffset || 0),
                    texAccessor.count * 2);
                texCoordBuffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, texData, gl.STATIC_DRAW);
            }

            // JOINTS_0
            const jointsAttr = prim.attributes.JOINTS_0;
            const jointsAccessor = accessors[jointsAttr];
            const jointsBV = bufferViews[jointsAccessor.bufferView];
            let jointsData;
            if (jointsAccessor.componentType === 5121) { // UNSIGNED_BYTE
                jointsData = new Uint8Array(binBuffer,
                    (jointsBV.byteOffset || 0) + (jointsAccessor.byteOffset || 0),
                    jointsAccessor.count * 4);
            } else if (jointsAccessor.componentType === 5123) { // UNSIGNED_SHORT
                jointsData = new Uint16Array(binBuffer,
                    (jointsBV.byteOffset || 0) + (jointsAccessor.byteOffset || 0),
                    jointsAccessor.count * 4);
            } else {
                throw new Error('Неподдерживаемый тип JOINTS_0');
            }
            // Приводим к Float32 для шейдера (WebGL 1.0 требует FLOAT для атрибутов)
            const jointsFloat = new Float32Array(jointsData.length);
            for (let j = 0; j < jointsData.length; j++) {
                jointsFloat[j] = jointsData[j];
            }
            const jointsBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, jointsBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, jointsFloat, gl.STATIC_DRAW);

            // WEIGHTS_0
            const weightsAttr = prim.attributes.WEIGHTS_0;
            const weightsAccessor = accessors[weightsAttr];
            const weightsBV = bufferViews[weightsAccessor.bufferView];
            const weightsData = new Float32Array(binBuffer,
                (weightsBV.byteOffset || 0) + (weightsAccessor.byteOffset || 0),
                weightsAccessor.count * 4);
            const weightsBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, weightsBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, weightsData, gl.STATIC_DRAW);

            // Текстура
            const texture = this.createTextureFromImage(primData.baseColorTextureImage) || this.whiteTexture;

            // VAO
            const vao = this.createSkinVAO({
                positionBuffer: posBuffer,
                texCoordBuffer: texCoordBuffer,
                jointsBuffer: jointsBuffer,
                weightsBuffer: weightsBuffer,
            }, glIndexBuffer);

            drawDataArray.push({
                indexBuffer: glIndexBuffer,
                indexCount: indexAccessor.count,
                indexType: indexAccessor.componentType === 5123 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
                posBuffer,
                texCoordBuffer,
                texture,
                baseColorFactor: primData.baseColorFactor,
                modelMatrix,
                jointsBuffer,
                weightsBuffer,
                vao,
                skinData,
                nodes,
                nodeIndex
            });
        }

        return drawDataArray;
    }

    _componentSize(compType) {
        if (compType === 5126) return 4;
        if (compType === 5123) return 2;
        if (compType === 5125) return 4;
        return 1;
    }

    _typeCount(type) {
        switch (type) {
            case 'SCALAR': return 1;
            case 'VEC2': return 2;
            case 'VEC3': return 3;
            case 'VEC4': return 4;
            case 'MAT2': return 4;
            case 'MAT3': return 9;
            case 'MAT4': return 16;
            default: return 1;
        }
    }

    draw(meshesDrawData, clear = true) {
        const gl = this.gl;
        if (clear) {
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }

        if (!meshesDrawData || meshesDrawData.length === 0 || !this.camera) return;

        gl.useProgram(this.program);

        const projectionView = mat4.create();
        mat4.multiply(projectionView, this.camera.projectionMatrix, this.camera.viewMatrix);
        gl.uniformMatrix4fv(this.uniforms.uProjectionView, false, projectionView);

        meshesDrawData.forEach(primArray => {
            primArray.forEach(drawData => {
                gl.uniformMatrix4fv(this.uniforms.uModelMatrix, false, drawData.modelMatrix);
                gl.uniform4fv(this.uniforms.uBaseColorFactor, drawData.baseColorFactor);

                // Привязываем текстуру
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, drawData.texture);
                gl.uniform1i(this.uniforms.uBaseColorTexture, 0);

                // Позиции
                gl.bindBuffer(gl.ARRAY_BUFFER, drawData.posBuffer);
                gl.enableVertexAttribArray(this.attribs.aPosition);
                gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);

                // UV
                if (drawData.hasTexCoords && drawData.texCoordBuffer) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, drawData.texCoordBuffer);
                    gl.enableVertexAttribArray(this.attribs.aTexCoord);
                    gl.vertexAttribPointer(this.attribs.aTexCoord, 2, gl.FLOAT, false, 0, 0);
                } else {
                    gl.disableVertexAttribArray(this.attribs.aTexCoord);
                    gl.vertexAttrib2f(this.attribs.aTexCoord, 0, 0);
                }

                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, drawData.indexBuffer);
                gl.drawElements(gl.TRIANGLES, drawData.indexCount, drawData.indexType, 0);
            });
        });
    }

    // Белая 1x1 текстура
    _createWhiteTexture() {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
        return tex;
    }

    // Проволочный бокс
    createWireframeBox(min, max) {
        const gl = this.gl;
        const [x0, y0, z0] = min;
        const [x1, y1, z1] = max;
        const vertices = new Float32Array([
            x0, y0, z0, x1, y0, z0,
            x0, y0, z0, x0, y0, z1,
            x1, y0, z0, x1, y0, z1,
            x0, y0, z1, x1, y0, z1,
            x0, y1, z0, x1, y1, z0,
            x0, y1, z0, x0, y1, z1,
            x1, y1, z0, x1, y1, z1,
            x0, y1, z1, x1, y1, z1,
            x0, y0, z0, x0, y1, z0,
            x1, y0, z0, x1, y1, z0,
            x0, y0, z1, x0, y1, z1,
            x1, y0, z1, x1, y1, z1
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        return { buffer, count: vertices.length / 3 };
    }

    drawWireframeBox(box, camera, color) {
        const gl = this.gl;
        gl.useProgram(this.program);
        const projectionView = mat4.create();
        mat4.multiply(projectionView, camera.projectionMatrix, camera.viewMatrix);
        gl.uniformMatrix4fv(this.uniforms.uProjectionView, false, projectionView);
        const identity = mat4.identity(mat4.create());
        gl.uniformMatrix4fv(this.uniforms.uModelMatrix, false, identity);
        gl.uniform4fv(this.uniforms.uBaseColorFactor, [...color, 1.0]);
        // Белая текстура
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.whiteTexture);
        gl.uniform1i(this.uniforms.uBaseColorTexture, 0);
        // Позиции
        gl.bindBuffer(gl.ARRAY_BUFFER, box.buffer);
        gl.enableVertexAttribArray(this.attribs.aPosition);
        gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.disableVertexAttribArray(this.attribs.aTexCoord);
        gl.drawArrays(gl.LINES, 0, box.count);
    }

    // Линии (оси и пр.)
    drawLines(vertexBuffer, vertexCount, color) {
        const gl = this.gl;
        gl.useProgram(this.program);
        const projectionView = mat4.create();
        mat4.multiply(projectionView, this.camera.projectionMatrix, this.camera.viewMatrix);
        gl.uniformMatrix4fv(this.uniforms.uProjectionView, false, projectionView);
        const identity = mat4.identity(mat4.create());
        gl.uniformMatrix4fv(this.uniforms.uModelMatrix, false, identity);
        gl.uniform4fv(this.uniforms.uBaseColorFactor, [...color, 1.0]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.whiteTexture);
        gl.uniform1i(this.uniforms.uBaseColorTexture, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.enableVertexAttribArray(this.attribs.aPosition);
        gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
        gl.disableVertexAttribArray(this.attribs.aTexCoord);
        gl.drawArrays(gl.LINES, 0, vertexCount);
    }

    drawWorldAxes(camera) {
        const gl = this.gl;
        gl.useProgram(this.program);

        const modelMatrix = mat4.identity(mat4.create());
        const projectionView = mat4.create();
        mat4.multiply(projectionView, camera.projectionMatrix, camera.viewMatrix);
        const mvp = mat4.create();
        mat4.multiply(mvp, projectionView, modelMatrix);
        gl.uniformMatrix4fv(this.uniforms.uProjectionView, false, mvp);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.whiteTexture);
        gl.uniform1i(this.uniforms.uBaseColorTexture, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.worldAxesBuffer);
        gl.enableVertexAttribArray(this.attribs.aPosition);
        gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
        if (this.attribs.aTexCoord) gl.disableVertexAttribArray(this.attribs.aTexCoord);

        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false); // не пишем в буфер глубины, чтобы не перекрыть другие объекты

        // X
        gl.uniform4fv(this.uniforms.uBaseColorFactor, [1, 0, 0, 1]);
        gl.drawArrays(gl.LINES, 0, 2);
        // Y
        gl.uniform4fv(this.uniforms.uBaseColorFactor, [0, 1, 0, 1]);
        gl.drawArrays(gl.LINES, 2, 2);
        // Z
        gl.uniform4fv(this.uniforms.uBaseColorFactor, [0, 0, 1, 1]);
        gl.drawArrays(gl.LINES, 4, 2);

        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
        gl.disableVertexAttribArray(this.attribs.aPosition);
    }

    createSkinVAO(attribs, indexBuffer) {
        const gl = this.gl;
        if (!gl) {
            console.error('createSkinVAO: gl is null');
            return null;
        }
        if (!this.hasVAO) return null;

        const vao = this.vaoExt.createVertexArrayOES();
        this.vaoExt.bindVertexArrayOES(vao);

        if (attribs.positionBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, attribs.positionBuffer);
            gl.enableVertexAttribArray(this.skinAttribs.aPosition);
            gl.vertexAttribPointer(this.skinAttribs.aPosition, 3, gl.FLOAT, false, 0, 0);
        }
        if (attribs.texCoordBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, attribs.texCoordBuffer);
            gl.enableVertexAttribArray(this.skinAttribs.aTexCoord);
            gl.vertexAttribPointer(this.skinAttribs.aTexCoord, 2, gl.FLOAT, false, 0, 0);
        }
        if (attribs.jointsBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, attribs.jointsBuffer);
            gl.enableVertexAttribArray(this.skinAttribs.aJoints);
            gl.vertexAttribPointer(this.skinAttribs.aJoints, 4, gl.FLOAT, false, 0, 0);
        }
        if (attribs.weightsBuffer) {
            gl.bindBuffer(gl.ARRAY_BUFFER, attribs.weightsBuffer);
            gl.enableVertexAttribArray(this.skinAttribs.aWeights);
            gl.vertexAttribPointer(this.skinAttribs.aWeights, 4, gl.FLOAT, false, 0, 0);
        }
        if (indexBuffer) {
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        }

        this.vaoExt.bindVertexArrayOES(null);
        return vao;
    }

    drawSkinMesh(primData, camera, jointMatrices) {
        const gl = this.gl;
        gl.useProgram(this.skinProgram);

        const projectionView = mat4.create();
        mat4.multiply(projectionView, camera.projectionMatrix, camera.viewMatrix);
        gl.uniformMatrix4fv(this.skinUniforms.uProjectionView, false, projectionView);
        gl.uniformMatrix4fv(this.skinUniforms.uModelMatrix, false, primData.modelMatrix);
        gl.uniform4fv(this.skinUniforms.uBaseColorFactor, primData.baseColorFactor);

        // Передаём матрицы костей
        gl.uniformMatrix4fv(this.skinUniforms.uJointMatrices, false, jointMatrices);

        // Текстура
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, primData.texture);
        gl.uniform1i(this.skinUniforms.uBaseColorTexture, 0);

        if (this.hasVAO && primData.vao) {
            this.vaoExt.bindVertexArrayOES(primData.vao);
        } else {
            // Fallback: включаем атрибуты вручную
            gl.bindBuffer(gl.ARRAY_BUFFER, primData.positionBuffer);
            gl.enableVertexAttribArray(this.skinAttribs.aPosition);
            gl.vertexAttribPointer(this.skinAttribs.aPosition, 3, gl.FLOAT, false, 0, 0);

            if (primData.texCoordBuffer) {
                gl.bindBuffer(gl.ARRAY_BUFFER, primData.texCoordBuffer);
                gl.enableVertexAttribArray(this.skinAttribs.aTexCoord);
                gl.vertexAttribPointer(this.skinAttribs.aTexCoord, 2, gl.FLOAT, false, 0, 0);
            } else {
                gl.disableVertexAttribArray(this.skinAttribs.aTexCoord);
                gl.vertexAttrib2f(this.skinAttribs.aTexCoord, 0, 0);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, primData.jointsBuffer);
            gl.enableVertexAttribArray(this.skinAttribs.aJoints);
            gl.vertexAttribPointer(this.skinAttribs.aJoints, 4, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, primData.weightsBuffer);
            gl.enableVertexAttribArray(this.skinAttribs.aWeights);
            gl.vertexAttribPointer(this.skinAttribs.aWeights, 4, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, primData.indexBuffer);
        }

        gl.drawElements(gl.TRIANGLES, primData.indexCount, primData.indexType, 0);

        if (this.hasVAO) {
            this.vaoExt.bindVertexArrayOES(null);
        } else {
            // отключаем атрибуты
            gl.disableVertexAttribArray(this.skinAttribs.aPosition);
            gl.disableVertexAttribArray(this.skinAttribs.aTexCoord);
            gl.disableVertexAttribArray(this.skinAttribs.aJoints);
            gl.disableVertexAttribArray(this.skinAttribs.aWeights);
        }
    }
}