// renderer.js — WebGL‑рендерер с unlit-шейдером и поддержкой текстур
class SimpleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true })
            || canvas.getContext('experimental-webgl', { antialias: true });
    if (!this.gl) throw new Error('WebGL 1.0 не поддерживается');

    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.1, 0.1, 0.15, 1.0);

    // Для альфа-наложения (если понадобится позже)
    // gl.enable(gl.BLEND);
    // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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
  }

  // Загрузка текстуры из URL (Blob URL) и настройка WebGLTexture
  loadTexture(textureData) {
    return new Promise((resolve, reject) => {
      if (!textureData || !textureData.imageData) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, textureData.wrapS);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, textureData.wrapT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, textureData.minFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, textureData.magFilter);
        URL.revokeObjectURL(textureData.imageData);
        resolve(tex);
      };
      img.onerror = reject;
      img.src = textureData.imageData;
    });
  }

  // Загружаем геометрию, текстуры и формируем drawData
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

      // Текстурные координаты (могут отсутствовать)
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

      // Загружаем текстуру базового цвета
      const texture = await this.loadTexture(primData.baseColorTexture);

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

    return drawDataArray; // массив для всех примитивов одного меша
  }

  _componentSize(compType) {
    if (compType === 5126) return 4;
    if (compType === 5123) return 2;
    if (compType === 5125) return 4;
    return 1;
  }

  _typeCount(type) {
    switch(type) {
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

  draw(meshesDrawData) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!meshesDrawData || meshesDrawData.length === 0 || !this.camera) return;

    gl.useProgram(this.program);

    const projectionView = mat4.create();
    mat4.multiply(projectionView, this.camera.projectionMatrix, this.camera.viewMatrix);
    gl.uniformMatrix4fv(this.uniforms.uProjectionView, false, projectionView);

    meshesDrawData.forEach(primArray => {
      primArray.forEach(drawData => {
        gl.uniformMatrix4fv(this.uniforms.uModelMatrix, false, drawData.modelMatrix);
        gl.uniform4fv(this.uniforms.uBaseColorFactor, drawData.baseColorFactor);

        // Привязываем текстуру, если есть, иначе отключаем юнит 0 (используем белую)
        if (drawData.texture) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, drawData.texture);
          gl.uniform1i(this.uniforms.uBaseColorTexture, 0);
        } else {
          // Если нет текстуры, всё равно надо что-то биндить, чтобы не было ошибок.
          // Можно создать дефолтную белую 1x1 текстуру при инициализации, но для простоты
          // передадим uniform, который отключает текстуру? Проще создать заглушку.
          if (!this._whiteTexture) {
            this._whiteTexture = this._createWhiteTexture();
          }
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this._whiteTexture);
          gl.uniform1i(this.uniforms.uBaseColorTexture, 0);
        }

        // Позиции
        gl.bindBuffer(gl.ARRAY_BUFFER, drawData.posBuffer);
        gl.enableVertexAttribArray(this.attribs.aPosition);
        gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);

        // Текстурные координаты
        if (drawData.hasTexCoords && drawData.texCoordBuffer) {
          gl.bindBuffer(gl.ARRAY_BUFFER, drawData.texCoordBuffer);
          gl.enableVertexAttribArray(this.attribs.aTexCoord);
          gl.vertexAttribPointer(this.attribs.aTexCoord, 2, gl.FLOAT, false, 0, 0);
        } else {
          // Если нет UV, отключаем атрибут, чтобы не использовать мусор
          gl.disableVertexAttribArray(this.attribs.aTexCoord);
          // Установим константное значение (0,0), чтобы избежать чтения неопределённых данных
          gl.vertexAttrib2f(this.attribs.aTexCoord, 0, 0);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, drawData.indexBuffer);
        gl.drawElements(gl.TRIANGLES, drawData.indexCount, drawData.indexType, 0);
      });
    });
  }

  // Вспомогательная заглушка: белая текстура 1x1
  _createWhiteTexture() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
    return tex;
  }

  // Проволочный AABB (без изменений)
  createWireframeBox(min, max) {
    const gl = this.gl;
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const vertices = new Float32Array([
      x0,y0,z0, x1,y0,z0,
      x0,y0,z0, x0,y0,z1,
      x1,y0,z0, x1,y0,z1,
      x0,y0,z1, x1,y0,z1,
      x0,y1,z0, x1,y1,z0,
      x0,y1,z0, x0,y1,z1,
      x1,y1,z0, x1,y1,z1,
      x0,y1,z1, x1,y1,z1,
      x0,y0,z0, x0,y1,z0,
      x1,y0,z0, x1,y1,z0,
      x0,y0,z1, x0,y1,z1,
      x1,y0,z1, x1,y1,z1
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
    // Отключаем текстуру
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this._whiteTexture);
    gl.uniform1i(this.uniforms.uBaseColorTexture, 0);
    // Позиции
    gl.bindBuffer(gl.ARRAY_BUFFER, box.buffer);
    gl.enableVertexAttribArray(this.attribs.aPosition);
    gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(this.attribs.aTexCoord);
    gl.drawArrays(gl.LINES, 0, box.count);
  }
}