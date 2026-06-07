// loader.js — загрузка GLB, включая скиннинг и морфинг (скелет)
// loader.js – загрузка GLB с динамическим разбиением мешей по лимиту костей
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

async function loadTextureImages(gltf, binBuffer) {
  const images = [];
  if (!gltf.images) return images;

  for (const image of gltf.images) {
    if (image.bufferView !== undefined) {
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

// loader.js — загрузка GLB (исправлено: skin ищется в node, добавлены логи)
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

async function loadTextureImages(gltf, binBuffer) {
  const images = [];
  if (!gltf.images) return images;

  for (const image of gltf.images) {
    if (image.bufferView !== undefined) {
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

function collectMeshes(gltf, binBuffer, textureImages = [], maxBones = 64) {
  const defaultScene = gltf.scenes?.[gltf.scene ?? 0];
  if (!defaultScene) return [];

  console.log('=== НАЧАЛО СБОРА МЕШЕЙ ===');
  console.log('Сцена:', defaultScene);
  console.log('Узлы:', gltf.nodes?.length);
  console.log('Меши:', gltf.meshes?.length);
  console.log('Скины:', gltf.skins?.length);

  const nodes = gltf.nodes?.map((node, idx) => ({
    ...node,
    index: idx,
    translation: node.translation || [0, 0, 0],
    rotation: node.rotation || [0, 0, 0, 1],
    scale: node.scale || [1, 1, 1],
    children: node.children || [],
    localMatrix: mat4.create(),
    globalMatrix: mat4.create(),
  })) || [];

  // Вычисляем локальные матрицы
  nodes.forEach(node => {
    if (node.matrix) {
      mat4.copy(node.localMatrix, node.matrix);
      console.log(`Узел ${node.index} (${node.name || 'без имени'}): используется готовая матрица`);
    } else {
      mat4.composeTransform(node.localMatrix, node.translation, node.rotation, node.scale);
      console.log(`Узел ${node.index} (${node.name || 'без имени'}): translation=${node.translation}, rotation=${node.rotation}, scale=${node.scale}`);
    }
  });

  // Вычисляем глобальные матрицы
  function updateGlobalMatrix(nodeIdx, parentGlobal = mat4.identity(mat4.create())) {
    const node = nodes[nodeIdx];
    mat4.multiply(node.globalMatrix, parentGlobal, node.localMatrix);
    if (node.children) {
      node.children.forEach(childIdx => updateGlobalMatrix(childIdx, node.globalMatrix));
    }
  }
  defaultScene.nodes?.forEach(rootIdx => updateGlobalMatrix(rootIdx));

  const meshes = [];
  const processNode = (nodeIndex) => {
    const node = nodes[nodeIndex];
    console.log(`--- Обход узла ${nodeIndex} (${node.name || 'без имени'}) ---`);
    console.log(`mesh: ${node.mesh}, skin: ${node.skin}, children: ${node.children?.length || 0}`);

    if (node.mesh !== undefined) {
      const mesh = gltf.meshes[node.mesh];
      console.log(`  Меш ${node.mesh}: ${mesh.name || 'без имени'}, примитивов: ${mesh.primitives.length}`);

      if (mesh) {
        // Ищем скин у УЗЛА (не у меша!)
        let skinData = null;
        if (node.skin !== undefined) {
          console.log(`  Найден скин у узла, индекс: ${node.skin}`);
          const skin = gltf.skins[node.skin];
          if (skin) {
            console.log(`  Скин содержит ${skin.joints.length} костей`);
            console.log(`  Индексы костей (первые 10):`, skin.joints.slice(0, 10));
            const ibmAccessor = gltf.accessors[skin.inverseBindMatrices];
            const ibmBV = gltf.bufferViews[ibmAccessor.bufferView];
            const ibmData = new Float32Array(
              binBuffer,
              (ibmBV.byteOffset || 0) + (ibmAccessor.byteOffset || 0),
              ibmAccessor.count * 16
            );
            skinData = {
              joints: skin.joints,
              inverseBindMatrices: ibmData
            };
            console.log(`  inverseBindMatrices загружены, длина: ${ibmData.length}`);
          } else {
            console.warn('  ОШИБКА: скин не найден в gltf.skins');
          }
        } else {
          console.log('  У этого узла нет скина');
        }

        // Примитивы с материалами
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
            baseColorTextureImage,
          };
        });

        // Разбиение примитива с большим количеством костей
        if (skinData && mesh.primitives.length > 0) {
          const jointsSet = new Set(skinData.joints);
          console.log(`  Уникальных костей: ${jointsSet.size}, лимит: ${maxBones}`);
          if (jointsSet.size > maxBones) {
            console.log('  Количество костей превышает лимит, выполняется разбиение...');
            const subPrimitives = splitPrimitiveByBones(
              mesh.primitives[0], primitivesData[0], skinData, nodes, nodeIndex,
              gltf.accessors, gltf.bufferViews, binBuffer, maxBones
            );
            subPrimitives.forEach(sub => meshes.push(sub));
            console.log(`  Создано ${subPrimitives.length} подпримитивов`);
            if (node.children) node.children.forEach(processNode);
            return;
          }
        }

        // Обычный меш
        meshes.push({
          mesh,
          accessors: gltf.accessors,
          bufferViews: gltf.bufferViews,
          modelMatrix: node.globalMatrix.slice(),
          primitivesData,
          skinData,
          nodeIndex,
          nodes
        });
        console.log('  Меш добавлен в список');
      }
    }

    if (node.children) {
      node.children.forEach(processNode);
    }
  };

  defaultScene.nodes?.forEach(processNode);
  console.log('=== ВСЕГО МЕШЕЙ СОБРАНО: ' + meshes.length + ' ===');
  return meshes;
}

// Разбивает примитив с > maxBones костей на несколько примитивов
function splitPrimitiveByBones(prim, primData, skinData, nodes, nodeIndex, accessors, bufferViews, binBuffer, maxBones) {
  // Извлекаем данные позиций, UV, индексов, весов, костей
  const posAccessor = accessors[prim.attributes.POSITION];
  const posBV = bufferViews[posAccessor.bufferView];
  const positions = new Float32Array(binBuffer,
    (posBV.byteOffset || 0) + (posAccessor.byteOffset || 0),
    posAccessor.count * 3);

  let uvs = null;
  if (prim.attributes.TEXCOORD_0 !== undefined) {
    const uvAccessor = accessors[prim.attributes.TEXCOORD_0];
    const uvBV = bufferViews[uvAccessor.bufferView];
    uvs = new Float32Array(binBuffer,
      (uvBV.byteOffset || 0) + (uvAccessor.byteOffset || 0),
      uvAccessor.count * 2);
  }

  const jointsAccessor = accessors[prim.attributes.JOINTS_0];
  const jointsBV = bufferViews[jointsAccessor.bufferView];
  let joints;
  if (jointsAccessor.componentType === 5121) { // UNSIGNED_BYTE
    joints = new Uint8Array(binBuffer,
      (jointsBV.byteOffset || 0) + (jointsAccessor.byteOffset || 0),
      jointsAccessor.count * 4);
  } else if (jointsAccessor.componentType === 5123) { // UNSIGNED_SHORT
    joints = new Uint16Array(binBuffer,
      (jointsBV.byteOffset || 0) + (jointsAccessor.byteOffset || 0),
      jointsAccessor.count * 4);
  } else {
    throw new Error('Неподдерживаемый тип JOINTS_0');
  }

  const weightsAccessor = accessors[prim.attributes.WEIGHTS_0];
  const weightsBV = bufferViews[weightsAccessor.bufferView];
  const weights = new Float32Array(binBuffer,
    (weightsBV.byteOffset || 0) + (weightsAccessor.byteOffset || 0),
    weightsAccessor.count * 4);

  const indexAccessor = accessors[prim.indices];
  const indexBV = bufferViews[indexAccessor.bufferView];
  let indices;
  if (indexAccessor.componentType === 5123) {
    indices = new Uint16Array(binBuffer,
      (indexBV.byteOffset || 0) + (indexAccessor.byteOffset || 0),
      indexAccessor.count);
  } else if (indexAccessor.componentType === 5125) {
    indices = new Uint32Array(binBuffer,
      (indexBV.byteOffset || 0) + (indexAccessor.byteOffset || 0),
      indexAccessor.count);
  }

  // Определяем уникальные кости, используемые в этом примитиве
  const usedBones = new Set();
  for (let i = 0; i < joints.length; i++) {
    usedBones.add(joints[i]);
  }
  const boneList = Array.from(usedBones).sort((a, b) => a - b);

  // Разбиваем кости на группы по maxBones
  const groups = [];
  for (let i = 0; i < boneList.length; i += maxBones) {
    groups.push(boneList.slice(i, i + maxBones));
  }

  // Создаём для каждой группы новый меш
  const result = groups.map(group => {
    const boneSet = new Set(group);
    const oldToNewBone = {};
    group.forEach((oldIdx, newIdx) => oldToNewBone[oldIdx] = newIdx);

    const filteredIndices = [];
    const vertexMap = new Map(); // старый индекс -> новый индекс
    const newPositions = [];
    const newUVs = uvs ? [] : null;
    const newJoints = [];
    const newWeights = [];

    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];
      const v0Bones = [joints[i0 * 4], joints[i0 * 4 + 1], joints[i0 * 4 + 2], joints[i0 * 4 + 3]];
      const v1Bones = [joints[i1 * 4], joints[i1 * 4 + 1], joints[i1 * 4 + 2], joints[i1 * 4 + 3]];
      const v2Bones = [joints[i2 * 4], joints[i2 * 4 + 1], joints[i2 * 4 + 2], joints[i2 * 4 + 3]];

      const allInGroup = v0Bones.every(b => boneSet.has(b)) &&
        v1Bones.every(b => boneSet.has(b)) &&
        v2Bones.every(b => boneSet.has(b));
      if (!allInGroup) continue;

      const addVertex = (idx) => {
        if (vertexMap.has(idx)) return vertexMap.get(idx);
        const newIdx = newPositions.length / 3;
        newPositions.push(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]);
        if (newUVs) newUVs.push(uvs[idx * 2], uvs[idx * 2 + 1]);
        newJoints.push(
          oldToNewBone[joints[idx * 4]] || 0,
          oldToNewBone[joints[idx * 4 + 1]] || 0,
          oldToNewBone[joints[idx * 4 + 2]] || 0,
          oldToNewBone[joints[idx * 4 + 3]] || 0
        );
        newWeights.push(weights[idx * 4], weights[idx * 4 + 1], weights[idx * 4 + 2], weights[idx * 4 + 3]);
        vertexMap.set(idx, newIdx);
        return newIdx;
      };

      const ni0 = addVertex(i0);
      const ni1 = addVertex(i1);
      const ni2 = addVertex(i2);
      filteredIndices.push(ni0, ni1, ni2);
    }

    // Создаём новые массивы
    const newPositionsArray = new Float32Array(newPositions);
    const newUVsArray = newUVs ? new Float32Array(newUVs) : null;
    const newJointsArray = new Float32Array(newJoints);
    const newWeightsArray = new Float32Array(newWeights);
    const newIndicesArray = new Uint16Array(filteredIndices);

    const newSkinData = {
      joints: group,
      inverseBindMatrices: skinData.inverseBindMatrices
    };

    const newPrimData = {
      ...primData,
      attributes: {
        POSITION: 0,
        TEXCOORD_0: newUVs ? 1 : undefined,
        JOINTS_0: 2,
        WEIGHTS_0: 3
      }
    };

    return {
      mesh: { primitives: [{ attributes: {} }] }, // заглушка
      accessors: accessors,
      bufferViews: bufferViews,
      modelMatrix: nodes[nodeIndex].globalMatrix.slice(),
      primitivesData: [newPrimData],
      skinData: newSkinData,
      nodeIndex: nodeIndex,
      nodes: nodes,
      _rawData: {
        positions: newPositionsArray,
        uvs: newUVsArray,
        joints: newJointsArray,
        weights: newWeightsArray,
        indices: newIndicesArray
      }
    };
  });

  return result;
}

function computeSceneAABB(meshes, binBuffer) {
  let min = [Infinity, Infinity, Infinity];
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