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
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);

    // 잔디
    const grassGeometry = new THREE.PlaneGeometry(50, 200);
    const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x4a7c3a });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.01, -30);
    grass.receiveShadow = true;
    scene.add(grass);

    // 산
    scene.add(createMountains());

    scene.fog = null;

    track.receiveShadow = true;
    grass.receiveShadow = true;

    // 캐릭터 로드
    await loadCharacter(modelsBase);

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
    } else if (achievementRate == -1) {
        targetSpeed = SPEED.IDLE;
        fadeAction('egg');
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

    if (opts.x !== undefined) rivalCharacter.position.x = opts.x;
    if (opts.z !== undefined) rivalCharacter.position.z = opts.z;

    if (opts.visible !== undefined) {
        rivalCharacter.visible = !!opts.visible;
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
        obj.position.z += currentSpeed * delta * 30;
        if (obj.position.z > obj.userData.recycleZ) {
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
            new THREE.ConeGeometry(8 + Math.random() * 4, 6 + Math.random() * 6, 4),
            mountainMat
        );
        cone.position.set(
            (Math.random() - 0.5) * 80,
            Math.random() * 1,
            60 - Math.random() * 20
        );
        cone.rotation.y = Math.random() * Math.PI;
        mountains.add(cone);
    }

    return mountains;
}

async function loadCharacter(modelsBase) {
    const fbxLoader = new FBXLoader();

    // 캐릭터 로드
    character = await fbxLoader.loadAsync(modelsBase + 'xbotre.fbx');

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
    const [idleFbx, walkFbx, runFbx, egg] = await Promise.all([
        fbxLoader.loadAsync(modelsBase + 'idlenonskin.fbx'),
        fbxLoader.loadAsync(modelsBase + 'walknonskin.fbx'),
        fbxLoader.loadAsync(modelsBase + 'frunnonskin.fbx'),
        fbxLoader.loadAsync(modelsBase + 'egg.fbx'),
    ]);

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

    actions.idle = mixer.clipAction(idleFbx.animations[0]);
    actions.walk = mixer.clipAction(walkFbx.animations[0]);
    actions.run = mixer.clipAction(runFbx.animations[0]);
    actions.egg = mixer.clipAction(egg.animations[0]);

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

// 렌더링 루프
function animate() {
    animationId = requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.1);
    if (mixer) mixer.update(delta);
    if (rivalMixer) rivalMixer.update(delta);

    currentSpeed += (targetSpeed - currentSpeed);

    if (trackTexture) {
        trackTexture.offset.y -= currentSpeed * delta;
        trackTexture.offset.y = ((trackTexture.offset.y % 1) + 1) % 1;
    }

    updateScrollObjects(delta);

    renderer.render(scene, camera);
}
