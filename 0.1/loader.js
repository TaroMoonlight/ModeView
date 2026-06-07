// loader.js — загрузка и разбор GLB
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

function collectMeshes(gltf, binBuffer) {
  const defaultScene = gltf.scenes?.[gltf.scene ?? 0];
  if (!defaultScene) return [];

  const meshes = [];
  const processNode = (nodeIndex) => {
    const node = gltf.nodes[nodeIndex];
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes[node.mesh];
      if (mesh) {
        meshes.push({
          mesh,
          accessors: gltf.accessors,
          bufferViews: gltf.bufferViews,
          translation: node.translation || [0, 0, 0],
          rotation: node.rotation || [0, 0, 0, 1],
          scale: node.scale || [1, 1, 1]
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
    meshData.mesh.primitives.forEach(prim => {
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