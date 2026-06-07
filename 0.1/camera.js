// camera.js — OrbitCamera, использует mat4 из math.js
class OrbitCamera {
  constructor(target, distance, theta = 0, phi = Math.PI / 4) {
    this.target = target.slice();
    this.distance = distance;
    this.theta = theta;   // горизонтальный угол
    this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi)); // вертикальный
    this.minDistance = distance * 0.01; //0.1
    this.maxDistance = distance * 10;
    this.updateViewMatrix();
  }

  rotate(deltaX, deltaY) {
    //this.theta -= deltaX * 0.005;
    this.theta += deltaX * 0.005;
    this.phi -= deltaY * 0.005;
    this.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.phi));
    this.updateViewMatrix();
  }

  zoom(delta) {
    this.distance *= (1 - delta * 0.001);
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    this.updateViewMatrix();
  }

  pan0(deltaX, deltaY) {
    const right = [
      Math.cos(this.theta),
      0,
      -Math.sin(this.theta)
    ];
    const up = [
      Math.sin(this.theta) * Math.cos(this.phi),
      Math.sin(this.phi),
      Math.cos(this.theta) * Math.cos(this.phi)
    ];
    const panSpeed = this.distance * 0.001;
    this.target[0] += (right[0] * deltaX + up[0] * deltaY) * panSpeed;
    this.target[1] += (right[1] * deltaX + up[1] * deltaY) * panSpeed;
    this.target[2] += (right[2] * deltaX + up[2] * deltaY) * panSpeed;

    console.log('theta:', this.theta, 'phi:', this.phi);
    console.log('right:', right);
    console.log('up:', up);
    console.log('deltaX:', deltaX, 'deltaY:', deltaY);
    console.log('target до:', this.target);

    this.updateViewMatrix();
  }

  pan(deltaX, deltaY) {
    // Вычисляем направление от камеры к цели
    const forward = [
      this.target[0] - (this.target[0] + this.distance * Math.sin(this.phi) * Math.cos(this.theta)),
      this.target[1] - (this.target[1] + this.distance * Math.cos(this.phi)),
      this.target[2] - (this.target[2] + this.distance * Math.sin(this.phi) * Math.sin(this.theta))
    ];
    // Нормализуем forward (хотя он и так почти единичный, но для надёжности)
    const len = Math.sqrt(forward[0] ** 2 + forward[1] ** 2 + forward[2] ** 2) || 1;
    forward[0] /= len; forward[1] /= len; forward[2] /= len;

    // Мировой "вверх" для вычисления right (избегаем проблему, когда камера смотрит точно вверх/вниз)
    const worldUp = [0, 1, 0];
    // right = normalize(cross(worldUp, forward))
    const right = [
      worldUp[1] * forward[2] - worldUp[2] * forward[1],
      worldUp[2] * forward[0] - worldUp[0] * forward[2],
      worldUp[0] * forward[1] - worldUp[1] * forward[0]
    ];
    const rLen = Math.sqrt(right[0] ** 2 + right[1] ** 2 + right[2] ** 2) || 1;
    right[0] /= rLen; right[1] /= rLen; right[2] /= rLen;

    // up = cross(forward, right) (уже ортонормирован)
    const up = [
      forward[1] * right[2] - forward[2] * right[1],
      forward[2] * right[0] - forward[0] * right[2],
      forward[0] * right[1] - forward[1] * right[0]
    ];

    const panSpeed = this.distance * 0.001;
    this.target[0] += (right[0] * deltaX + up[0] * deltaY) * panSpeed;
    this.target[1] += (right[1] * deltaX + up[1] * deltaY) * panSpeed;
    this.target[2] += (right[2] * deltaX + up[2] * deltaY) * panSpeed;
    this.updateViewMatrix();
  }

  handleKeyboard(key, speed = 1.0) {
    const rotateSpeed = 0.02 * speed;
    const zoomSpeed = 0.05 * speed;
    switch (key) {
      case 'KeyA': this.rotate(rotateSpeed, 0); break;
      case 'KeyD': this.rotate(-rotateSpeed, 0); break;
      case 'KeyW': this.zoom(-zoomSpeed); break;
      case 'KeyS': this.zoom(zoomSpeed); break;
    }
    this.updateViewMatrix();
  }

  updateViewMatrix() {
    const eye = [
      this.target[0] + this.distance * Math.sin(this.phi) * Math.cos(this.theta),
      this.target[1] + this.distance * Math.cos(this.phi),
      this.target[2] + this.distance * Math.sin(this.phi) * Math.sin(this.theta)
    ];
    this.viewMatrix = mat4.lookAt(mat4.create(), eye, this.target, [0, 1, 0]);
  }

  updateProjection(aspect) {
    this.projectionMatrix = mat4.perspective(mat4.create(), Math.PI / 4, aspect, 0.01, 1000.0);
  }
}