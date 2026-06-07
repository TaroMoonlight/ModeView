// math.js — матричные операции для WebGL
const mat4 = {
  create() {
    return new Float32Array(16);
  },

  identity(out) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  },

  perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
    return out;
  },

  lookAt(out, eye, center, up) {
    let [ex, ey, ez] = eye;
    let [cx, cy, cz] = center;
    let [ux, uy, uz] = up;
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let len = Math.sqrt(zx * zx + zy * zy + zz * zz);
    if (len > 0) { zx /= len; zy /= len; zz /= len; }
    let xx = uy * zz - uz * zy;
    let xy = uz * zx - ux * zz;
    let xz = ux * zy - uy * zx;
    len = Math.sqrt(xx * xx + xy * xy + xz * xz);
    if (len > 0) { xx /= len; xy /= len; xz /= len; }
    let yx = zy * xz - zz * xy;
    let yy = zz * xx - zx * xz;
    let yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  },

  multiply(out, a, b) {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        out[j * 4 + i] =
          a[0 * 4 + i] * b[j * 4 + 0] +
          a[1 * 4 + i] * b[j * 4 + 1] +
          a[2 * 4 + i] * b[j * 4 + 2] +
          a[3 * 4 + i] * b[j * 4 + 3];
      }
    }
    return out;
  },

  scaleMatrix(out, sx, sy, sz = sx) {
    out[0] = sx;  out[1] = 0;  out[2] = 0;  out[3] = 0;
    out[4] = 0;  out[5] = sy; out[6] = 0;  out[7] = 0;
    out[8] = 0;  out[9] = 0;  out[10] = sz; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0;  out[15] = 1;
    return out;
  },

  rotationMatrix(out, angle, axisX, axisY, axisZ) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const x = axisX, y = axisY, z = axisZ;
    const len = Math.sqrt(x*x + y*y + z*z);
    if (len < 1e-12) { return mat4.identity(out); }
    const nx = x / len, ny = y / len, nz = z / len;
    const tx = t * nx, ty = t * ny;
    out[0] = tx * nx + c;       out[1] = tx * ny + s * nz;  out[2] = tx * nz - s * ny;  out[3] = 0;
    out[4] = tx * ny - s * nz;  out[5] = ty * ny + c;       out[6] = ty * nz + s * nx;  out[7] = 0;
    out[8] = tx * nz + s * ny;  out[9] = ty * nz - s * nx;  out[10] = t * nz * nz + c;   out[11] = 0;
    out[12] = 0;                out[13] = 0;                out[14] = 0;                 out[15] = 1;
    return out;
  },

  translationMatrix(out, tx, ty, tz) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
    return out;
  },

  transformPoint(out, mat, vec) {
    const x = vec[0], y = vec[1], z = vec[2];
    const w = mat[3]*x + mat[7]*y + mat[11]*z + mat[15];
    out[0] = (mat[0]*x + mat[4]*y + mat[8]*z + mat[12]) / w;
    out[1] = (mat[1]*x + mat[5]*y + mat[9]*z + mat[13]) / w;
    out[2] = (mat[2]*x + mat[6]*y + mat[10]*z + mat[14]) / w;
    return out;
  },

  transformDirection(out, mat, vec) {
    const x = vec[0], y = vec[1], z = vec[2];
    out[0] = mat[0]*x + mat[4]*y + mat[8]*z;
    out[1] = mat[1]*x + mat[5]*y + mat[9]*z;
    out[2] = mat[2]*x + mat[6]*y + mat[10]*z;
    return out;
  },
  // Кватернион в матрицу поворота
  fromQuaternion(out, q) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    out[0] = 1 - (yy + zz); out[1] = xy + wz;       out[2] = xz - wy;       out[3] = 0;
    out[4] = xy - wz;       out[5] = 1 - (xx + zz); out[6] = yz + wx;       out[7] = 0;
    out[8] = xz + wy;       out[9] = yz - wx;       out[10] = 1 - (xx + yy); out[11] = 0;
    out[12] = 0;            out[13] = 0;            out[14] = 0;            out[15] = 1;
    return out;
  },

  // Сборка матрицы модели: translation * rotation * scale
  composeTransform(out, translation, rotation, scale) {
    const rotMat = mat4.create();
    const scaleMat = mat4.create();
    const transMat = mat4.create();
    mat4.translationMatrix(transMat, translation[0], translation[1], translation[2]);
    mat4.fromQuaternion(rotMat, rotation);
    mat4.scaleMatrix(scaleMat, scale[0], scale[1], scale[2]);
    const temp = mat4.create();
    mat4.multiply(temp, rotMat, scaleMat);   // R * S
    mat4.multiply(out, transMat, temp);      // T * (R * S)
    return out;
  }
};