// snowParticles.js — система частиц снежинок (исправлено)
class SnowParticleSystem {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.gl = renderer.gl;

    this.particleCount = options.particleCount || 600;
    this.particleSize = options.particleSize || 0.3;
    this.wind = options.wind || [0.1, -0.5, 0.0];
    this.areaRadius = options.areaRadius || 20;
    this.areaHeight = options.areaHeight || 30;

    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(this._createParticle());
    }

    this._initGL();
  }

  _createParticle() {
    return {
      x: (Math.random() - 0.5) * this.areaRadius * 2,
      y: Math.random() * this.areaHeight,
      z: (Math.random() - 0.5) * this.areaRadius * 2,
      vx: this.wind[0] + (Math.random() - 0.5) * 0.2,
      vy: this.wind[1] + (Math.random() - 0.5) * 0.3,
      vz: this.wind[2] + (Math.random() - 0.5) * 0.2,
      angle: Math.random() * Math.PI * 2,
      angleSpeed: (Math.random() - 0.5) * 2.0
    };
  }

  _initGL() {
    const gl = this.gl;

    const vertSrc = `
      attribute vec2 aCorner;
      attribute vec3 aCenter;
      attribute vec2 aTexCoord;
      uniform mat4 uProjectionView;
      varying vec2 vTexCoord;
      void main() {
        vec3 worldPos = aCenter + vec3(aCorner, 0.0);
        gl_Position = uProjectionView * vec4(worldPos, 1.0);
        vTexCoord = aTexCoord;
      }
    `;
    const fragSrc = `
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D uTexture;
      void main() {
        vec4 texColor = texture2D(uTexture, vTexCoord);
        gl_FragColor = texColor;
      }
    `;

    const vert = this._createShader(gl.VERTEX_SHADER, vertSrc);
    const frag = this._createShader(gl.FRAGMENT_SHADER, fragSrc);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vert);
    gl.attachShader(this.program, frag);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error('Ошибка линковки программы частиц: ' + gl.getProgramInfoLog(this.program));
    }

    this.uniforms = {
      uProjectionView: gl.getUniformLocation(this.program, 'uProjectionView'),
      uTexture: gl.getUniformLocation(this.program, 'uTexture')
    };
    this.attribs = {
      aCorner: gl.getAttribLocation(this.program, 'aCorner'),
      aCenter: gl.getAttribLocation(this.program, 'aCenter'),
      aTexCoord: gl.getAttribLocation(this.program, 'aTexCoord')
    };

    // Индексный буфер
    const indices = new Uint16Array(this.particleCount * 6);
    for (let i = 0; i < this.particleCount; i++) {
      const vi = i * 4;
      const ii = i * 6;
      indices[ii]   = vi;
      indices[ii+1] = vi + 1;
      indices[ii+2] = vi + 2;
      indices[ii+3] = vi;
      indices[ii+4] = vi + 2;
      indices[ii+5] = vi + 3;
    }
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Вершинный буфер: 4 вершины на частицу, каждая вершина = 7 floats (aCorner.x, aCorner.y, aCenter.x, aCenter.y, aCenter.z, aTexCoord.u, aTexCoord.v)
    const vertexSize = 7 * Float32Array.BYTES_PER_ELEMENT; // 28 байт на вершину
    const totalSize = this.particleCount * 4 * vertexSize;  // общий размер буфера в байтах
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, totalSize, gl.DYNAMIC_DRAW);

    // Текстура снежинки
    this.texture = this._generateSnowflakeTexture();
  }

  _createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('Ошибка компиляции шейдера частиц: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  _generateSnowflakeTexture() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.9)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  update(dt, camera) {
    const center = camera.target;
    const halfHeight = this.areaHeight / 2;

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.angle += p.angleSpeed * dt;

      const dx = p.x - center[0];
      const dz = p.z - center[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (p.y < center[1] - halfHeight || dist > this.areaRadius) {
        p.y = center[1] + halfHeight;
        p.x = center[0] + (Math.random() - 0.5) * this.areaRadius * 2;
        p.z = center[2] + (Math.random() - 0.5) * this.areaRadius * 2;
        p.angle = Math.random() * Math.PI * 2;
      }
    }

    const vertexData = new Float32Array(this.particleCount * 4 * 7);
    let idx = 0;
    const halfSize = this.particleSize / 2;
    const corners = [
      [-halfSize, -halfSize],
      [ halfSize, -halfSize],
      [ halfSize,  halfSize],
      [-halfSize,  halfSize]
    ];
    const texCoords = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ];

    for (const p of this.particles) {
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      for (let v = 0; v < 4; v++) {
        const cx = corners[v][0];
        const cy = corners[v][1];
        const rx = cx * cos - cy * sin;
        const ry = cx * sin + cy * cos;
        vertexData[idx++] = rx;          // aCorner.x
        vertexData[idx++] = ry;          // aCorner.y
        vertexData[idx++] = p.x;         // aCenter.x
        vertexData[idx++] = p.y;         // aCenter.y
        vertexData[idx++] = p.z;         // aCenter.z
        vertexData[idx++] = texCoords[v][0]; // aTexCoord.u
        vertexData[idx++] = texCoords[v][1]; // aTexCoord.v
      }
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexData);
  }

  draw(camera) {
    const gl = this.gl;
    gl.useProgram(this.program);

    const projectionView = mat4.create();
    mat4.multiply(projectionView, camera.projectionMatrix, camera.viewMatrix);
    gl.uniformMatrix4fv(this.uniforms.uProjectionView, false, projectionView);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.uTexture, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    const stride = 7 * Float32Array.BYTES_PER_ELEMENT; // 28 байт

    gl.enableVertexAttribArray(this.attribs.aCorner);
    gl.vertexAttribPointer(this.attribs.aCorner, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(this.attribs.aCenter);
    gl.vertexAttribPointer(this.attribs.aCenter, 3, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    gl.enableVertexAttribArray(this.attribs.aTexCoord);
    gl.vertexAttribPointer(this.attribs.aTexCoord, 2, gl.FLOAT, false, stride, 5 * Float32Array.BYTES_PER_ELEMENT);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.particleCount * 6, gl.UNSIGNED_SHORT, 0);

    gl.depthMask(true);
    gl.disable(gl.BLEND);

    gl.disableVertexAttribArray(this.attribs.aCorner);
    gl.disableVertexAttribArray(this.attribs.aCenter);
    gl.disableVertexAttribArray(this.attribs.aTexCoord);
  }
}