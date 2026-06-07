// renderer.js — WebGL‑рендерер с шейдерами и загрузкой геометрии
class SimpleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { antialias: true })
            || canvas.getContext('experimental-webgl', { antialias: true });
    if (!this.gl) throw new Error('WebGL 1.0 не поддерживается');

    const gl = this.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.1, 0.1, 0.15, 1.0);

    this.camera = null; // будет установлена позже
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
      uniform mat4 uModelViewProjection;
      void main() {
        gl_Position = uModelViewProjection * aPosition;
      }
    `;
    const fragSrc = `
      precision mediump float;
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `;
    this.program = this.createProgram(vertSrc, fragSrc);
    this.uniforms = {
      uModelViewProjection: gl.getUniformLocation(this.program, 'uModelViewProjection'),
      uColor: gl.getUniformLocation(this.program, 'uColor')
    };
    this.attribs = {
      aPosition: gl.getAttribLocation(this.program, 'aPosition')
    };
  }

  uploadMesh(meshInfo, binBuffer) {
    const { mesh, accessors, bufferViews } = meshInfo;
    const gl = this.gl;
    const drawDataArray = [];

    mesh.primitives.forEach(prim => {
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

      drawDataArray.push({
        indexBuffer: glIndexBuffer,
        indexCount: indexAccessor.count,
        indexType: indexAccessor.componentType === 5123 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
        posBuffer,
      });
    });

    return drawDataArray;
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

    const modelMat = mat4.identity(mat4.create());
    const mvp = mat4.create();
    mat4.multiply(mvp, this.camera.projectionMatrix, this.camera.viewMatrix);
    mat4.multiply(mvp, mvp, modelMat);

    gl.uniformMatrix4fv(this.uniforms.uModelViewProjection, false, mvp);
    gl.uniform3f(this.uniforms.uColor, 1.0, 0.5, 0.0); // оранжевый

    meshesDrawData.forEach(primArray => {
      primArray.forEach(drawData => {
        gl.bindBuffer(gl.ARRAY_BUFFER, drawData.posBuffer);
        gl.enableVertexAttribArray(this.attribs.aPosition);
        gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, drawData.indexBuffer);
        gl.drawElements(gl.TRIANGLES, drawData.indexCount, drawData.indexType, 0);
      });
    });
  }

   // Создаёт вершинный буфер для линий AABB (12 рёбер, 24 вершины)
  createWireframeBox(min, max) {
    const gl = this.gl;
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    // Каждое ребро — два треугольника? Нет, LINE_STRIP? Проще массив из пар.
    const vertices = new Float32Array([
      x0,y0,z0, x1,y0,z0, // низ
      x0,y0,z0, x0,y0,z1,
      x1,y0,z0, x1,y0,z1,
      x0,y0,z1, x1,y0,z1,

      x0,y1,z0, x1,y1,z0, // верх
      x0,y1,z0, x0,y1,z1,
      x1,y1,z0, x1,y1,z1,
      x0,y1,z1, x1,y1,z1,

      x0,y0,z0, x0,y1,z0, // вертикали
      x1,y0,z0, x1,y1,z0,
      x0,y0,z1, x0,y1,z1,
      x1,y0,z1, x1,y1,z1
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    return { buffer, count: vertices.length / 3 }; // 24 вершины
  }

  // Рисует проволочный бокс
  drawWireframeBox(box, camera, color) {
    const gl = this.gl;
    gl.useProgram(this.program);
    const mvp = mat4.create();

    const model = mat4.identity(mat4.create());
    mat4.scaleMatrix(model,1.25,1.25,1.25);

    mat4.multiply(mvp, camera.projectionMatrix, camera.viewMatrix);
    mat4.multiply(mvp, mvp, model);
    gl.uniformMatrix4fv(this.uniforms.uModelViewProjection, false, mvp);
    gl.uniform3f(this.uniforms.uColor, color[0], color[1], color[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, box.buffer);
    gl.enableVertexAttribArray(this.attribs.aPosition);
    gl.vertexAttribPointer(this.attribs.aPosition, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, box.count);
  }
}