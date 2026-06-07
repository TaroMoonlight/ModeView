// loader.js — загрузка и разбор GLB, включая текстуры
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

// Извлечение данных текстуры из GLTF
function extractTextureData(gltf, textureIndex, binBuffer) {
  if (textureIndex === undefined) return null;
  const texture = gltf.textures?.[textureIndex];
  if (!texture) return null;

  const image = gltf.images?.[texture.source];
  if (!image) return null;

  let imageData = null;
  let mimeType = image.mimeType || 'image/png';

  if (image.bufferView !== undefined) {
    // Изображение встроено в binBuffer
    const bv = gltf.bufferViews[image.bufferView];
    const array = new Uint8Array(binBuffer, (bv.byteOffset || 0), bv.byteLength);
    const blob = new Blob([array], { type: mimeType });
    imageData = URL.createObjectURL(blob);
  } else if (image.uri) {
    // Внешний URI — пока не поддерживается, вернём null
    console.warn('Внешние текстуры пока не поддерживаются:', image.uri);
    return null;
  }

  const sampler = gltf.samplers?.[texture.sampler ?? 0];
  const wrapS = sampler?.wrapS ?? 10497; // REPEAT
  const wrapT = sampler?.wrapT ?? 10497;
  const minFilter = sampler?.minFilter ?? 9729; // LINEAR
  const magFilter = sampler?.magFilter ?? 9729;

  return {
    imageData,
    wrapS,
    wrapT,
    minFilter,
    magFilter
  };
}

function collectMeshes(gltf, binBuffer) {
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

        // Собираем материалы для каждого примитива
        const primitivesData = mesh.primitives.map(prim => {
          const material = gltf.materials?.[prim.material];
          // Базовый цвет фактор (по умолчанию белый)
          let baseColorFactor = material?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1];
          // Текстура базового цвета
          let baseColorTexture = null;
          const texIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index;
          if (texIndex !== undefined) {
            baseColorTexture = extractTextureData(gltf, texIndex, binBuffer);
          }
          return {
            ...prim,
            baseColorFactor,
            baseColorTexture
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