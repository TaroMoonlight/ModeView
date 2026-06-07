// loader.js — загрузка GLB, извлечение текстур и мешей
async function loadGLB(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const dataView = new DataView(buffer);

  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== 'glTF') throw new Error('Неверный формат GLB');
  const version = dataView.getUint32(4, true);
  console.log('GLB версия:', version);

  let offset = 12;
  let json = null;
  let binBuffer = null;

  while (offset < buffer.byteLength) {
    const chunkLength = dataView.getUint32(offset, true);
    const chunkType = dataView.getUint32(offset + 4, true);
    const chunkData = new Uint8Array(buffer, offset + 8, chunkLength);

    if (chunkType === 0x4E4F534A) { // JSON
      const jsonText = new TextDecoder().decode(chunkData);
      json = JSON.parse(jsonText);
    } else if (chunkType === 0x004E4942) { // BIN
      binBuffer = chunkData.buffer.slice(chunkData.byteOffset, chunkData.byteOffset + chunkData.byteLength);
    }
    offset += 8 + chunkLength;
  }

  if (!json) throw new Error('Отсутствует JSON chunk');
  return { json, binBuffer };
}

// Асинхронно загружает все изображения из GLTF
async function loadTextureImages(gltf, binBuffer) {
  const images = [];
  if (!gltf.images) return images;

  for (const image of gltf.images) {
    if (image.bufferView !== undefined) {
      // Встроенное изображение в binBuffer
      const bv = gltf.bufferViews[image.bufferView];
      const array = new Uint8Array(binBuffer, (bv.byteOffset || 0), bv.byteLength);
      const blob = new Blob([array], { type: image.mimeType || 'image/png' });
      const img = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(blob);
      });
      images.push(img);
    } else if (image.uri) {
      // Внешний URI — загружаем через fetch
      const img = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = image.uri;
      });
      images.push(img);
    } else {
      images.push(null);
    }
  }
  return images;
}

function collectMeshes(gltf, binBuffer, textureImages = []) {
  const defaultScene = gltf.scenes?.[gltf.scene ?? 0];
  if (!defaultScene) return [];

  const meshes = [];
  const processNode = (nodeIndex) => {
    const node = gltf.nodes[nodeIndex];
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes[node.mesh];
      if (mesh) {
        const translation = node.translation || [0, 0, 0];
        const rotation = node.rotation || [0, 0, 0, 1];
        const scale = node.scale || [1, 1, 1];
        const modelMatrix = mat4.create();
        mat4.composeTransform(modelMatrix, translation, rotation, scale);

        // Собираем информацию о материале для каждого примитива
        const primitivesData = mesh.primitives.map(prim => {
          const material = gltf.materials?.[prim.material];
          let baseColorFactor = material?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
          let baseColorTextureImage = null;

          const texInfo = material?.pbrMetallicRoughness?.baseColorTexture;
          if (texInfo !== undefined) {
            const texture = gltf.textures?.[texInfo.index];
            if (texture && texture.source !== undefined) {
              baseColorTextureImage = textureImages[texture.source] || null;
            }
          }

          return {
            ...prim,
            baseColorFactor,
            baseColorTextureImage
          };
        });

        meshes.push({
          mesh,
          accessors: gltf.accessors,
          bufferViews: gltf.bufferViews,
          modelMatrix,
          primitivesData
        });
      }
    }
    if (node.children) {
      node.children.forEach(processNode);
    }
  };

  defaultScene.nodes?.forEach(processNode);
  return meshes;
}

function computeSceneAABB(meshes, binBuffer) {
  let min = [ Infinity,  Infinity,  Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  meshes.forEach(meshData => {
    meshData.mesh.primitives.forEach((prim, idx) => {
      const posAttr = prim.attributes?.POSITION;
      if (posAttr === undefined) return;
      const accessor = meshData.accessors[posAttr];
      const bufferView = meshData.bufferViews[accessor.bufferView];
      const posData = new Float32Array(
        binBuffer,
        (bufferView.byteOffset || 0) + (accessor.byteOffset || 0),
        accessor.count * 3
      );
      for (let i = 0; i < posData.length; i += 3) {
        for (let j = 0; j < 3; j++) {
          if (posData[i + j] < min[j]) min[j] = posData[i + j];
          if (posData[i + j] > max[j]) max[j] = posData[i + j];
        }
      }
    });
  });
  return { min, max };
}