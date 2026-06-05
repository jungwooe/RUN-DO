import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// === 모듈 스코프 변수 ===
let scene, camera, renderer, mixer, character;
let trackTexture;
let clock;
let animationId;
let containerEl;
let keydownHandler;
let resizeHandler;
let modelsBaseCached = './models/'; // 라이벌 추가 시 재사용
let sky;                  // 하늘 셰이더 메쉬 (시간대 변화용)
let particleSystem = null; // 색종이 파티클
let particleStartTime = 0;
let rivalSpawnTime = 0;
const PARTICLE_LIFETIME = 1.5; // 초

// 시간대 색상 키프레임
const SKY_TOP_KEYS = [
  { rate: 0,   color: new THREE.Color(0x4a90e2) }, // 낮
  { rate: 0.5, color: new THREE.Color(0xff6b35) }, // 석양
  { rate: 1,   color: new THREE.Color(0x0a1a3e) }, // 밤
];
const SKY_BOTTOM_KEYS = [
  { rate: 0,   color: new THREE.Color(0xfff5e1) },
  { rate: 0.5, color: new THREE.Color(0xffcd91) },
  { rate: 1,   color: new THREE.Color(0x2d3868) },
];

function lerpColorKeys(keys, rate) {
  rate = Math.max(0, Math.min(1, rate));
  for (let i = 0; i < keys.length - 1; i++) {
    if (rate >= keys[i].rate && rate <= keys[i+1].rate) {
      const t = (rate - keys[i].rate) / (keys[i+1].rate - keys[i].rate);
      return keys[i].color.clone().lerp(keys[i+1].color, t);
    }
  }
  return keys[keys.length - 1].color;
}

const SPEED = {
    IDLE: 0,
    WALK: 0.2,
    RUN: 0.7
};
let targetSpeed = SPEED.IDLE;
let currentSpeed = SPEED.IDLE;

const scrollObjects = [];
const actions = {};
let currentAction = null;

// === 라이벌(타인) 캐릭터 ===
let rivalCharacter = null;
let rivalMixer = null;
const rivalActions = {};
let rivalCurrentAction = null;
let rivalCharacterLoading = false;

let rivalTargetX = null;
let rivalTargetZ = null;
const RIVAL_LERP_PER_SEC = 30;
// === 외부에 노출할 API ===

/**
 * 마라톤 씬 초기화
 * @param {HTMLElement} container - canvas를 붙일 DOM 요소
 * @param {object} options - { modelsBase: '../public/models/', enableKeyboard: true }
 */
export async function initMarathon(container, options = {}) {
    containerEl = container;
    const modelsBase = options.modelsBase || '../public/models/';
    modelsBaseCached = modelsBase;
    const characterFile = options.characterFile || 'xbotre.fbx'
    const enableKeyboard = options.enableKeyboard !== false; // 기본 true

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    //장면 생성
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa0a0a0);

    //카메라 생성 및 기본값
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 2.5, -4);
    camera.lookAt(new THREE.Vector3(0, 2, 0));

    // 렌더러
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 환경광
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    // 하늘/땅 보조광
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // 메인 태양광 (그림자 담당)
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -10;
    dirLight.shadow.camera.right = 10;
    dirLight.shadow.camera.top = 10;
    dirLight.shadow.camera.bottom = -10;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.radius = 4;
    scene.add(dirLight);

    clock = new THREE.Clock();

    // 트랙
    trackTexture = createTrackTexture();
    const trackGeometry = new THREE.PlaneGeometry(4, 170);
    const trackMaterial = new THREE.MeshStandardMaterial({ map: trackTexture });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = -Math.PI / 2;
    track.position.z = -30;
    scene.add(track);

    // 하늘
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x4a90e2) },
            bottomColor: { value: new THREE.Color(0xfff5e1) },
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPos;
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize(vWorldPosition).y;
                gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
            }
        `,
        side: THREE.BackSide,
    });
    sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);

    

    // 잔디
    const grassGeometry = new THREE.PlaneGeometry(400, 400);
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.01, -30);
    grass.receiveShadow = true;
    scene.add(grass);

    // 산
    
    //scene.add(createClouds());
    scene.add(createTrees());
    scene.add(createDistanceMarkers());

    scene.fog = new THREE.FogExp2(0xfff5e1, 0.018);

    scene.add(createFence());
    scene.add(createGroundDetails());
    scene.add(createFarForest());
    scene.add(createSkyline());
    scene.add(createGrassPatches());

    track.receiveShadow = true;
    grass.receiveShadow = true;

    // 캐릭터 로드
    await loadCharacter(modelsBase, characterFile);

    // 키보드 단축키
    /*if (enableKeyboard) {
        keydownHandler = (e) => {
            if (e.key === '1') setMotionState(0);
            if (e.key === '2') setMotionState(0.3);
            if (e.key === '3') setMotionState(0.8);
            if (e.key === '9') setMotionState(-1);
        };
        window.addEventListener('keydown', keydownHandler);
    }*/

    // 리사이즈 대응
    resizeHandler = () => onResize();
    window.addEventListener('resize', resizeHandler);

    // 애니메이션 루프 시작
    animate();
}

/**
 * 성취도에 따라 캐릭터 모션 변경
 * @param {number} achievementRate - 0 ~ 1 (또는 -1 = egg)
 */
export function setMotionState(achievementRate) {
    if (achievementRate === 0) {
        targetSpeed = SPEED.IDLE;
        fadeAction('idle');
    } else if (achievementRate > 0 && achievementRate < 0.5) {
        targetSpeed = SPEED.WALK;
        fadeAction('walk');
    } else if (achievementRate === -1) {
        targetSpeed = SPEED.IDLE;
        fadeAction('egg');
    } else if ( achievementRate === -2) {
        targetSpeed = SPEED.IDLE;
        fadeAction('victory');

    } else {
        targetSpeed = SPEED.RUN;
        fadeAction('run');
    }
}

// =========================================================
// 라이벌(타인) 캐릭터 API
// =========================================================

/**
 * 라이벌 캐릭터를 트랙의 옆 차선에 추가한다.
 *   options: { x: number, z: number, color: 0xff6b6b }
 */
export async function addRival(options = {}) {
    if (!scene) return;            // 마라톤 미초기화
    if (rivalCharacter) return;    // 이미 있음
    if (rivalCharacterLoading) return; // 로딩 중 중복 호출 방지
    rivalCharacterLoading = true;

    const fbxLoader = new FBXLoader();

    try {
        const obj = await fbxLoader.loadAsync(modelsBaseCached + 'xbotre.fbx');

        // 크기 정규화 (메인 캐릭터와 동일)
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        obj.scale.setScalar(1.8 / size.y);

        const newBox = new THREE.Box3().setFromObject(obj);
        obj.position.y = -newBox.min.y;

        // 트랙의 옆 차선 + 시작 z 위치
        obj.position.x = options.x !== undefined ? options.x : 1.2;
        obj.position.z = options.z !== undefined ? options.z : 5;

        // 색상 틴트 (라이벌임을 시각적으로 구분)
        const tintColor = new THREE.Color(options.color !== undefined ? options.color : 0xff6b6b);
        obj.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(m => {
                            const newMat = m.clone();
                            if (newMat.color) newMat.color = tintColor.clone();
                            return newMat;
                        });
                    } else {
                        child.material = child.material.clone();
                        if (child.material.color) child.material.color = tintColor.clone();
                    }
                }
            }
        });

        scene.add(obj);
        rivalCharacter = obj;
        rivalCharacter.visible = false;
        rivalSpawnTime = Date.now();

        // 라이벌 mixer + 애니메이션 로드
        rivalMixer = new THREE.AnimationMixer(rivalCharacter);

        const [idleFbx, walkFbx, runFbx] = await Promise.all([
            fbxLoader.loadAsync(modelsBaseCached + 'idlenonskin.fbx'),
            fbxLoader.loadAsync(modelsBaseCached + 'walknonskin.fbx'),
            fbxLoader.loadAsync(modelsBaseCached + 'frunnonskin.fbx'),
        ]);

        rivalActions.idle = rivalMixer.clipAction(idleFbx.animations[0]);
        rivalActions.walk = rivalMixer.clipAction(walkFbx.animations[0]);
        rivalActions.run = rivalMixer.clipAction(runFbx.animations[0]);

        rivalActions.idle.play();
        rivalCurrentAction = rivalActions.idle;
    } finally {
        rivalCharacterLoading = false;
    }
}

function fadeRivalAction(name, duration = 0.3) {
    const next = rivalActions[name];
    if (!next || next === rivalCurrentAction) return;
    next.reset();
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.play();
    if (rivalCurrentAction) {
        rivalCurrentAction.crossFadeTo(next, duration, false);
    }
    rivalCurrentAction = next;
}

/**
 * 라이벌 위치 / 모션 / 가시성 업데이트
 *   opts: { x, z, motion: 'idle'|'walk'|'run', visible: boolean }
 */
export function updateRival(opts = {}) {
    if (!rivalCharacter) return;

    if (opts.x !== undefined) rivalTargetX = opts.x;
    if (opts.z !== undefined) rivalTargetZ = opts.z;

    if (opts.visible !== undefined) {
        const inSpawnDelay = Date.now() - rivalSpawnTime < 1000;

        if (inSpawnDelay) {
            rivalCharacter.visible = false;
        } else {
            rivalCharacter.visible = !!opts.visible;
        }
    }

    if (opts.motion) {
        if (opts.motion === 'idle' || opts.motion === 'walk' || opts.motion === 'run') {
            fadeRivalAction(opts.motion);
        }
    }
}

/**
 * 라이벌 캐릭터 제거 + 자원 해제
 */
export function removeRival() {
    if (!rivalCharacter) return;
    if (rivalMixer) rivalMixer.stopAllAction();
    scene.remove(rivalCharacter);
    rivalCharacter.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
        }
    });
    rivalCharacter = null;
    rivalMixer = null;
    Object.keys(rivalActions).forEach(k => delete rivalActions[k]);
    rivalCurrentAction = null;
}

export function setSkyProgress(rate) {
        if (!sky || !sky.material || !sky.material.uniforms) return;
        sky.material.uniforms.topColor.value = lerpColorKeys(SKY_TOP_KEYS, rate);
        sky.material.uniforms.bottomColor.value = lerpColorKeys(SKY_BOTTOM_KEYS, rate);
    }

/**
 * 마라톤 정리 (페이지 이동 시 호출)
 */
export function destroyMarathon() {
    if (animationId) cancelAnimationFrame(animationId);
    if (keydownHandler) window.removeEventListener('keydown', keydownHandler);
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);

    // 라이벌도 함께 정리
    removeRival();

    if (scene) {
        scene.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
    }

    if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
    }

    // 변수 초기화
    scene = camera = renderer = mixer = character = null;
    trackTexture = null;
    Object.keys(actions).forEach(k => delete actions[k]);
    currentAction = null;
    scrollObjects.length = 0;
}

// === 내부 함수들 ===

function createTrackTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    //트랙 색
    ctx.fillStyle = '#c94c3a';
    ctx.fillRect(0, 0, 256, 1024);

    //차선
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 64, 0);
        ctx.lineTo(i * 64, 1024);
        ctx.stroke();
    }

    ctx.setLineDash([20, 30]);
    for (let y = 0; y < 1024; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 8);
    return texture;
}

function updateScrollObjects(delta) {
    scrollObjects.forEach(obj => {
        obj.position.z -= currentSpeed * delta * 30;
        if (obj.position.z < obj.userData.recycleZ) {
            obj.position.z += obj.userData.resetZ - obj.userData.recycleZ;
        }
    });
}

function createMountains() {
    const mountains = new THREE.Group();
    const mountainMat = new THREE.MeshStandardMaterial({
        color: 0x6b8e7f,
        flatShading: true,
    });

    for (let i = 0; i < 12; i++) {
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(14 + Math.random() * 6, 28 + Math.random() * 15, 4),
            mountainMat
        );
        cone.position.set(
            (Math.random() - 0.5) * 80,
            Math.random() * 1,
            90 - Math.random() * 20
        );
        cone.rotation.y = Math.random() * Math.PI;
        mountains.add(cone);
    }

    return mountains;
}

function createClouds() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random()*1.5, 8, 6), mat);
      s.position.set((Math.random()-0.5)*4, Math.random()*0.5, (Math.random()-0.5)*2);
      cloud.add(s);
    }
    cloud.position.set((Math.random()-0.5)*80, 22 + Math.random()*10, -20 + Math.random()*160);
    cloud.scale.setScalar(0.8 + Math.random()*0.6);
    group.add(cloud);
    addScrollObject(cloud, 60, -110); // 트레드밀 재활용
  }
  return group;
}

function createTrees() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226 });
  const leavesColor = new THREE.Color().setHSL(
    0.28 + (Math.random() - 0.5) * 0.06,  // hue 변동
    0.4 + Math.random() * 0.25,            // saturation
    0.22 + Math.random() * 0.15             // lightness
    );
    const leavesMat = new THREE.MeshStandardMaterial({ color: leavesColor });
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 30; i++) {
      const tree = new THREE.Group();
      const s = 0.8 + Math.random() * 1.0;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.28 * s, 1.4 * s, 6), trunkMat);
      trunk.position.y = 0.7 * s; trunk.castShadow = true; tree.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 2.4 * s, 6 * s), leavesMat);
      leaves.position.y = 2.0; leaves.castShadow = true; tree.add(leaves);
      tree.position.set(side * (3 + Math.random()*12), 0, -5 + i * 18 + Math.random()*4);
      group.add(tree);
      addScrollObject(tree, -8, 112);
    }
  }
  return group;
}

function makeMarkerPlane(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 250, 122);
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 68px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.5, 1.2, 1);
  return sprite;
}

function createDistanceMarkers() {
  const group = new THREE.Group();
  const labels = ['0', '10', '20', '30', '40'];
  labels.forEach((label, i) => {
    const sprite = makeMarkerPlane(label);
    sprite.position.set(-3.5, 1.6, -80 + i * 30);
    group.add(sprite);
    addScrollObject(sprite, -10, 145);
  });
  return group;
}

function createFence() {
    const group = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });

    // 트랙 좌우 양쪽에 펜스 기둥 + 가로 막대
    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 24; i++) {
            const fenceUnit = new THREE.Group();

            // 기둥 (2개)
            for (let p = 0; p < 2; p++) {
                const post = new THREE.Mesh(
                    new THREE.BoxGeometry(0.08, 0.8, 0.08),
                    postMat
                );
                post.position.set(-0.75 + p * 1.5, 0.4, 0);
                post.castShadow = true;
                fenceUnit.add(post);
            }
            // 가로 막대 2개
            for (let r = 0; r < 2; r++) {
                const rail = new THREE.Mesh(
                    new THREE.BoxGeometry(1.6, 0.06, 0.04),
                    railMat
                );
                rail.position.set(0, 0.25 + r * 0.35, 0);
                rail.castShadow = true;
                fenceUnit.add(rail);
            }

            fenceUnit.position.set(side * 2.8, 0, -5 + i * 5);
            group.add(fenceUnit);
            addScrollObject(fenceUnit, -8, 115);
        }
    }
    return group;
}

function createGroundDetails() {
    const group = new THREE.Group();
    const leavesColor = new THREE.Color().setHSL(
    0.28 + (Math.random() - 0.5) * 0.06,  // hue 변동
    0.4 + Math.random() * 0.25,            // saturation
    0.22 + Math.random() * 0.15             // lightness
    );
    const bushMat = new THREE.MeshStandardMaterial({ color: leavesColor });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, flatShading: true });

    // 덤불 30개
    for (let i = 0; i < 30; i++) {
        const bush = new THREE.Group();
        for (let j = 0; j < 3; j++) {
            const s = new THREE.Mesh(
                new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 6, 5),
                bushMat
            );
            s.position.set(
                (Math.random() - 0.5) * 0.6,
                Math.random() * 0.2,
                (Math.random() - 0.5) * 0.6
            );
            s.castShadow = true;
            bush.add(s);
        }
        const side = Math.random() < 0.5 ? -1 : 1;
        bush.position.set(
            side * (4 + Math.random() * 18),
            0,
            -10 + Math.random() * 120
        );
        bush.scale.setScalar(0.7 + Math.random() * 0.6);
        group.add(bush);
        addScrollObject(bush, -12, 115);
    }

    // 돌 15개
    for (let i = 0; i < 15; i++) {
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.4, 0),
            rockMat
        );
        const side = Math.random() < 0.5 ? -1 : 1;
        rock.position.set(
            side * (4 + Math.random() * 16),
            0.15,
            -10 + Math.random() * 120
        );
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        group.add(rock);
        addScrollObject(rock, -12, 115);
    }
    return group;
}

function createFarForest() {
    const group = new THREE.Group();
    const trunkMat  = new THREE.MeshStandardMaterial({ color: 0x4a3219 });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2f5a25 });

    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 30; i++) {
            const tree = new THREE.Group();
            const s = 1.2 + Math.random() * 1.5; // 멀리니까 더 크게

            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 1.5 * s, 6),
                trunkMat
            );
            trunk.position.y = 0.75 * s;
            tree.add(trunk);

            const leaves = new THREE.Mesh(
                new THREE.ConeGeometry(1.1 * s, 2.8 * s, 6),
                leavesMat
            );
            leaves.position.y = 2.9 * s;
            tree.add(leaves);

            tree.position.set(
                side * (20 + Math.random() * 18),
                0,
                -10 + Math.random() * 130
            );
            tree.rotation.y = Math.random() * Math.PI * 2;
            group.add(tree);
            addScrollObject(tree, -12, 130);
        }
    }
    return group;
}

function createSkyline() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5d70, flatShading: true });

    for (let i = 0; i < 40; i++) {
        const h = 4 + Math.random() * 12;
        const w = 1.5 + Math.random() * 3;
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, w),
            mat
        );
        building.position.set(
            (Math.random() - 0.5) * 220,
            h / 2,
            130 + Math.random() * 10
        );
        group.add(building);
    }
    return group;
}

function createGrassPatches() {
    const group = new THREE.Group();
    const grassBladeMat = new THREE.MeshStandardMaterial({ color: 0x4f8a3f });

    for (let i = 0; i < 50; i++) {
        const patch = new THREE.Mesh(
            new THREE.ConeGeometry(0.06, 0.4, 4),
            grassBladeMat
        );
        const side = Math.random() < 0.5 ? -1 : 1;
        patch.position.set(
            side * (3.5 + Math.random() * 15),
            0.2,
            -10 + Math.random() * 120
        );
        patch.rotation.z = (Math.random() - 0.5) * 0.3;
        group.add(patch);
        addScrollObject(patch, -12, 115);
    }
    return group;
}




async function loadCharacter(modelsBase, characterFile = 'xbotre.fbx') {
    const fbxLoader = new FBXLoader();

    // 캐릭터 로드
    character = await fbxLoader.loadAsync(modelsBase + characterFile);

    // 크기 조정
    const box = new THREE.Box3().setFromObject(character);
    const size = box.getSize(new THREE.Vector3());
    character.scale.setScalar(1.8 / size.y);

    // 발바닥 정렬
    const newBox = new THREE.Box3().setFromObject(character);
    character.position.y = -newBox.min.y;

    // 그림자
    character.traverse(obj => {
        if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
        }
    });

    scene.add(character);

    // mixer 생성 (캐릭터 한 개에 묶임)
    mixer = new THREE.AnimationMixer(character);

    // 애니메이션들 로드해서 같은 mixer에 등록
    const [idleFbx, walkFbx, runFbx, egg, victoryFbx] = await Promise.all([
        fbxLoader.loadAsync(modelsBase + 'idlenonskin.fbx'),
        fbxLoader.loadAsync(modelsBase + 'walknonskin.fbx'),
        fbxLoader.loadAsync(modelsBase + 'frunnonskin.fbx'),
        fbxLoader.loadAsync(modelsBase + 'egg.fbx'),
        fbxLoader.loadAsync(modelsBase + 'victory.fbx')
    ]);

    const idleClip = retargetClipToCharacter(idleFbx.animations[0], character);
    const walkClip = retargetClipToCharacter(walkFbx.animations[0], character);
    const runClip = retargetClipToCharacter(runFbx.animations[0], character);
    const eggClip = retargetClipToCharacter(egg.animations[0], character);
    const victoryClip = retargetClipToCharacter(victoryFbx.animations[0], character);

    
    console.log('=== 캐릭터 본 (처음 10개) ===');
    const bones = [];
    character.traverse(o => { if (o.isBone) bones.push(o.name); });
    console.log(bones.slice(0, 10));

    console.log('=== idle 애니메이션 ===');
    console.log('클립 개수:', idleFbx.animations.length);
    if (idleFbx.animations[0]) {
        console.log('트랙 개수:', idleFbx.animations[0].tracks.length);
        console.log('트랙 이름 (처음 5개):',
            idleFbx.animations[0].tracks.slice(0, 5).map(t => t.name));
    }

    actions.idle = mixer.clipAction(idleClip);
    actions.walk = mixer.clipAction(walkClip);
    actions.run = mixer.clipAction(runClip);
    actions.egg = mixer.clipAction(eggClip);
    actions.victory = mixer.clipAction(victoryClip);

    // 시작은 idle
    actions.idle.play();
    currentAction = actions.idle;
}

function fadeAction(name, duration = 0.3) {
    const next = actions[name];
    if (!next || next === currentAction) return;

    next.reset();
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(1);
    next.play();

    if (currentAction) {
        currentAction.crossFadeTo(next, duration, false);
    }
    currentAction = next;
}

function addScrollObject(obj, recycleZ = 10, resetZ = -90) {
    obj.userData.recycleZ = recycleZ;
    obj.userData.resetZ = resetZ;
    scrollObjects.push(obj);
}

function onResize() {
    if (!camera || !renderer || !containerEl) return;
    const width = containerEl.clientWidth || window.innerWidth;
    const height = containerEl.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

/**
 * 애니메이션 클립의 트랙 본 이름을 실제 캐릭터의 본 이름에 매칭시킴.
 * Mixamo 캐릭터간 prefix 차이를 자동으로 보정.
 */
function retargetClipToCharacter(clip, character) {
    // 1) 캐릭터의 본 이름 수집 (정규화된 이름 → 실제 이름)
    const boneMap = new Map();
    character.traverse(obj => {
        if (obj.isBone) {
            // 모든 prefix 제거: "X_Bot:mixamorig:Hips" → "Hips"
            const cleanName = obj.name.replace(/^.*?:/, '').replace(/^mixamorig\d*:?/, '');
            boneMap.set(cleanName, obj.name);
            // prefix 있는 형태로도 등록
            boneMap.set(obj.name, obj.name);
        }
    });

    // 2) 클립의 각 트랙 이름을 본 이름에 매칭
    clip.tracks.forEach(track => {
        const dotIndex = track.name.indexOf('.');
        if (dotIndex < 0) return;
        const boneName = track.name.substring(0, dotIndex);
        const propName = track.name.substring(dotIndex); // ".position" / ".quaternion" / ".scale"

        // 트랙 본 이름도 정규화
        const cleanName = boneName.replace(/^.*?:/, '').replace(/^mixamorig\d*:?/, '');

        // 캐릭터의 실제 본 이름 찾기
        const actualBone = boneMap.get(cleanName) || boneMap.get(boneName);
        if (actualBone) {
            track.name = actualBone + propName;
        }
    });

    return clip;
}

export function spawnConfetti(opts = {}) {
    if (!scene) return;
    const x = opts.x ?? 0;
    const y = opts.y ?? 2;
    const z = opts.z ?? 0;
    const count = opts.count ?? 80;

    const palette = [
        [1, 0.3, 0.3],     // 빨강
        [0.3, 0.9, 0.4],   // 초록
        [0.3, 0.6, 1],     // 파랑
        [1, 0.9, 0.3],     // 노랑
        [0.9, 0.4, 1],     // 보라
        [1, 0.6, 0.2],     // 주황
        [0.4, 0.95, 0.95], // 시안
        [1, 0.4, 0.7],     // 핑크
    ];

    const positions = new Float32Array(count * 3);
    const colors    = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        positions[i*3]   = x + (Math.random()-0.5)*0.4;
        positions[i*3+1] = y;
        positions[i*3+2] = z + (Math.random()-0.5)*0.4;
        velocities[i*3]   = (Math.random()-0.5)*4;
        velocities[i*3+1] = 3 + Math.random()*3;
        velocities[i*3+2] = (Math.random()-0.5)*4;
        const c = palette[Math.floor(Math.random()*palette.length)];
        colors[i*3] = c[0]; colors[i*3+1] = c[1]; colors[i*3+2] = c[2];
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    geom.userData.velocities = velocities;

    const mat = new THREE.PointsMaterial({
        size: 0.18, vertexColors: true, transparent: true, opacity: 1
    });

    if (particleSystem) {
        scene.remove(particleSystem);
        particleSystem.geometry.dispose();
        particleSystem.material.dispose();
    }
    particleSystem = new THREE.Points(geom, mat);
    scene.add(particleSystem);
    particleStartTime = clock.getElapsedTime();
}


// 렌더링 루프
function animate() {
    animationId = requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    if (mixer) mixer.update(delta);
    if (rivalMixer) rivalMixer.update(delta);

    if (rivalCharacter) {
        const t= 1 - Math.exp(-RIVAL_LERP_PER_SEC * delta);
        if (rivalTargetX !== null){
            rivalCharacter.position.x += (rivalTargetX - rivalCharacter.position.x) * t;
        }
        if (rivalTargetZ !== null){
            rivalCharacter.position.z += (rivalTargetZ - rivalCharacter.position.z) * t;
        }
    }

    currentSpeed += (targetSpeed - currentSpeed);

    if (trackTexture) {
        trackTexture.offset.y -= currentSpeed * delta;
        trackTexture.offset.y = ((trackTexture.offset.y % 1) + 1) % 1;
    }

    if (particleSystem) {
    const age = clock.getElapsedTime() - particleStartTime;
    if (age > PARTICLE_LIFETIME) {
        scene.remove(particleSystem);
        particleSystem.geometry.dispose();
        particleSystem.material.dispose();
        particleSystem = null;
    } else {
        const pos = particleSystem.geometry.attributes.position.array;
        const vel = particleSystem.geometry.userData.velocities;
        const n = pos.length / 3;
        for (let i = 0; i < n; i++) {
            pos[i*3]   += vel[i*3]   * delta;
            pos[i*3+1] += vel[i*3+1] * delta;
            pos[i*3+2] += vel[i*3+2] * delta;
            vel[i*3+1] -= 4 * delta;
        }
        particleSystem.geometry.attributes.position.needsUpdate = true;
        particleSystem.material.opacity = 1 - (age / PARTICLE_LIFETIME);
    }
}

    updateScrollObjects(delta);

    renderer.render(scene, camera);
}
