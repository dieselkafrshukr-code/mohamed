/* ================================================================
   Mohamed Walid – TRUE 3D Spider-Man Portfolio
   Face texture mapped on a 3D Sphere (like a real head)
   Mouse rotation reveals genuine 3-D depth
   Three.js r152 + GSAP 3
   ================================================================ */
(function () {
    'use strict';

    /* ─── RENDERER ─────────────────────────────────────────────── */
    const wrap = document.getElementById('scene');

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0000, 0.055);

    const camera = new THREE.PerspectiveCamera(
        52, window.innerWidth / window.innerHeight, 0.01, 100
    );
    camera.position.set(0, 0, 5.5);

    /* ─── TEXTURE from <img> (works with file:// AND http://) ──── */
    const imgEl = document.getElementById('face-img');
    const texFace = new THREE.Texture(imgEl);
    texFace.minFilter = THREE.LinearFilter;
    texFace.magFilter = THREE.LinearFilter;
    texFace.colorSpace = THREE.SRGBColorSpace || 'srgb'; // r152

    function activateTex() {
        if (imgEl.naturalWidth > 0) {
            texFace.needsUpdate = true;
            mat.uniforms.uHasTex.value = 1.0;
        }
    }
    imgEl.addEventListener('load', activateTex);
    imgEl.addEventListener('error', () => {
        console.warn('Image did not load – showing mask only mode');
    });
    activateTex();

    /* ─── SHADERS ──────────────────────────────────────────────── */

    /* VERTEX — sphere with face projected onto front hemisphere */
    const VERT = /* glsl */ `
  precision highp float;

  varying vec2  vFaceUV;      // orthographic projection of sphere normal
  varying vec3  vNWorld;      // world-space normal for lighting
  varying vec3  vPosWorld;    // world position
  varying float vFacing;      // dot(normal, camera direction)

  uniform float uTime;
  uniform vec2  uMouse;       // -1..+1
  uniform float uMorph;

  void main(){
    // World normal (sphere normals are the vertex positions normalised)
    vNWorld    = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vPosWorld  = (modelMatrix * vec4(position, 1.0)).xyz;

    // Facing the camera?
    vFacing = dot(vNWorld, vec3(0.0, 0.0, 1.0));

    // ── Orthographic UV: project sphere normal onto XY plane ──
    // This gives a "face forward" mapping — perfect for a portrait texture
    vFaceUV = vec2(normal.x * 0.5 + 0.5, normal.y * 0.5 + 0.5);

    // ── Web-crack surface ripple during morph ──────────────────
    vec3 pos = position;
    float crack = sin(normal.x * 28.0 + uTime * 0.6)
                * cos(normal.y * 28.0 - uTime * 0.4);
    pos += normal * crack * uMorph * 0.04;

    // ── Breathing ─────────────────────────────────────────────
    pos *= 1.0 + sin(uTime * 0.85) * 0.006;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

    /* FRAGMENT — photo + procedural Spider-Man mask half-face blend */
    const FRAG = /* glsl */ `
  precision highp float;

  varying vec2  vFaceUV;
  varying vec3  vNWorld;
  varying vec3  vPosWorld;
  varying float vFacing;

  uniform sampler2D uFace;
  uniform float     uTime;
  uniform vec2      uMouse;
  uniform float     uMorph;
  uniform float     uReveal;
  uniform float     uHasTex;    // 1 if texture loaded, 0 if not

  /* ─── Simplex noise 2-D ─────────────────────────────────── */
  vec3 mod289v3(vec3 x){return x - floor(x*(1./289.))*289.;}
  vec2 mod289v2(vec2 x){return x - floor(x*(1./289.))*289.;}
  vec3 perm3(vec3 x){return mod289v3(((x*34.)+1.)*x);}
  float snoise(vec2 v){
    const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
    vec2 i=floor(v+dot(v,C.yy));
    vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1,0):vec2(0,1);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
    i=mod289v2(i);
    vec3 p=perm3(perm3(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));
    vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
    m=m*m;m=m*m;
    vec3 x_=2.*fract(p*C.www)-1.;
    vec3 h=abs(x_)-.5;
    vec3 ox=floor(x_+.5); vec3 a0=x_-ox;
    m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
    vec3 g;
    g.x=a0.x*x0.x+h.x*x0.y;
    g.yz=a0.yz*x12.xz+h.yz*x12.yw;
    return 130.*dot(m,g);
  }

  /* ─── Procedural web lines ─────────────────────────────── */
  float webLine(vec2 uv, float angle, float freq){
    float s=sin(angle), c=cos(angle);
    float proj=(uv.x-0.5)*c+(uv.y-0.5)*s;
    return smoothstep(0.012, 0.0, abs(mod(proj*freq, 1.0)-0.5));
  }

  float concentric(vec2 uv, float freq){
    float r=length(uv-0.5)*freq;
    return smoothstep(0.04, 0.0, abs(mod(r, 1.0)-0.5));
  }

  /* ─── Full Spider-Man mask ─────────────────────────────── */
  vec3 spideyMask(vec2 uv){
    vec3 col = vec3(0.80, 0.04, 0.04); // base red

    // Web grid (8 radial directions + concentric)
    float web = 0.0;
    float PI = 3.14159265;
    for(int i=0;i<8;i++){
      web += webLine(uv, float(i)*PI/8.0, 11.0);
    }
    web += concentric(uv, 9.0);
    col = mix(col, vec3(0.0), clamp(web, 0.0, 1.0) * 0.92);

    // Left eye (teardrop)
    vec2 le = (uv - vec2(0.335, 0.605)) * vec2(1.7, 1.4);
    float leftEye  = smoothstep(0.16, 0.09, length(le));

    // Right eye
    vec2 re = (uv - vec2(0.665, 0.605)) * vec2(1.7, 1.4);
    float rightEye = smoothstep(0.16, 0.09, length(re));

    float eyes = max(leftEye, rightEye);
    col = mix(col, vec3(0.92, 0.95, 1.0), eyes);

    // Eye inner reflection
    vec2 leRef = le - vec2(-0.05, 0.05);
    float lRef = smoothstep(0.06, 0.0, length(leRef));
    vec2 reRef = re - vec2(-0.05, 0.05);
    float rRef = smoothstep(0.06, 0.0, length(reRef));
    col = mix(col, vec3(1.0), max(lRef, rRef) * 0.5);

    // Top highlight
    float topRim = smoothstep(0.45, 1.0, uv.y) * 0.2;
    col += topRim * vec3(1.0, 0.2, 0.2);

    return col;
  }

  /* ─── Physically-based-ish lighting ───────────────────── */
  vec3 shade(vec3 col, vec3 N, vec3 V){
    // Key light: red from upper-left
    vec3 L1 = normalize(vec3(-2.0 + uMouse.x, 1.5 + uMouse.y, 3.0));
    float diff1 = max(dot(N, L1), 0.0);
    vec3 H1 = normalize(L1 + V);
    float spec1 = pow(max(dot(N, H1), 0.0), 32.0);

    // Fill light: cool blue-white from right
    vec3 L2 = normalize(vec3(2.0, -0.5, 2.0));
    float diff2 = max(dot(N, L2), 0.0) * 0.35;

    // Rim light: strong red
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5);

    col  = col * (0.15 + 0.70 * diff1 + 0.25 * diff2);
    col += spec1 * vec3(1.0, 0.3, 0.3) * 0.6;
    col += rim   * vec3(0.8, 0.0, 0.0) * 0.5;

    return col;
  }

  void main(){
    // Discard back-hemisphere (makes the sphere look like a face card in 3D)
    if(vFacing < -0.05) discard;

    vec3 N = normalize(vNWorld);
    vec3 V = vec3(0.0, 0.0, 1.0); // view direction (world-space approx)

    /* ── Photo ── */
    vec4 photoSample = texture2D(uFace, vFaceUV);
    // Chromatic aberration boost on morph
    float ca = uMorph * 0.022;
    vec3 photo;
    photo.r = texture2D(uFace, vFaceUV + vec2(ca,  0.0)).r;
    photo.g = photoSample.g;
    photo.b = texture2D(uFace, vFaceUV - vec2(ca,  0.0)).b;

    // Skin-tone fallback if no texture
    if(uHasTex < 0.5) photo = vec3(0.70, 0.50, 0.35);

    /* ── Mask ── */
    vec3 mask = spideyMask(vFaceUV);

    /* ── Morph boundary: organic noise sweep left→right ── */
    float n1 = snoise(vFaceUV * 5.0  + uTime * 0.22) * 0.20;
    float n2 = snoise(vFaceUV * 12.0 - uTime * 0.35) * 0.08;
    // boundary value moves from right (1.5) → left (-0.5) as uMorph → 1
    float boundary = vFaceUV.x + n1 + n2 - (1.0 - uMorph * 1.5);
    float sweep = smoothstep(-0.05, 0.05, boundary);

    /* ── Blend ── */
    vec3 col = mix(photo, mask, sweep * uMorph);

    /* ── Glowing edge at mask boundary ── */
    float edgeGlow = smoothstep(0.08, 0.0, abs(boundary - 0.0)) * uMorph;
    col += edgeGlow * vec3(1.2, 0.1, 0.1);

    /* ── Shade / lighting ── */
    col = shade(col, N, V);

    /* ── Vignette ── */
    float vig = 1.0 - dot(vFaceUV - 0.5, vFaceUV - 0.5) * 1.5;
    col *= max(vig, 0.0);

    /* ── Horizon fade (smooth edge of sphere) ── */
    float alpha = smoothstep(-0.05, 0.35, vFacing) * uReveal;

    gl_FragColor = vec4(col, alpha);
  }
`;

    /* ─── SPHERE MESH (the actual 3D head!) ────────────────────── */
    const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
            uFace: { value: texFace },
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2(0, 0) },
            uMorph: { value: 0 },
            uReveal: { value: 0 },
            uHasTex: { value: 0 },
        },
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
    });

    // 3D sphere — portrait is taller than wide, so ScaleY
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(2.0, 128, 128),
        mat
    );
    sphere.scale.set(1.0, 1.28, 0.78); // portrait proportions, slight depth compression
    scene.add(sphere);

    /* ─── WEB STRAND LINES (true 3D depth — back plane) ───────── */
    const wMat = new THREE.LineBasicMaterial({
        color: 0x5a0000, transparent: true, opacity: 0.22,
    });
    for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const pts = [
            new THREE.Vector3(0, 0, -3.5),
            new THREE.Vector3(Math.cos(a) * 10, Math.sin(a) * 10, -3.5),
        ];
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wMat));
    }
    for (let r = 1; r <= 7; r++) {
        const pts = [];
        for (let i = 0; i <= 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(a) * r * 1.25, Math.sin(a) * r * 1.25, -3.5));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wMat));
    }

    /* ─── FLOATING PARTICLES ───────────────────────────────────── */
    (function buildParticles() {
        const N = 500;
        const posA = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            posA[i * 3] = (Math.random() - .5) * 14;
            posA[i * 3 + 1] = (Math.random() - .5) * 14;
            posA[i * 3 + 2] = (Math.random() - .5) * 6 - 2;
        }
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.BufferAttribute(posA, 3));
        const pm = new THREE.PointsMaterial({
            color: 0xcc0000, size: 0.055,
            transparent: true, opacity: 0.55,
            sizeAttenuation: true,
        });
        const pts = new THREE.Points(pg, pm);
        scene.add(pts);
        gsap.to(pts.rotation, { y: Math.PI * 2, duration: 55, repeat: -1, ease: 'none' });
    })();

    /* ─── LIGHTS ────────────────────────────────────────────────── */
    scene.add(new THREE.AmbientLight(0x220000, 2.5));

    const keyLight = new THREE.PointLight(0xff2020, 10, 14);
    keyLight.position.set(-4, 3, 3);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(0xffffff, 2, 12);
    fillLight.position.set(4, -2, 3);
    scene.add(fillLight);

    /* ─── MOUSE ─────────────────────────────────────────────────── */
    const mouseTarget = new THREE.Vector2();
    const mouseCur = new THREE.Vector2();

    window.addEventListener('mousemove', e => {
        mouseTarget.x = (e.clientX / window.innerWidth - .5) * 2;
        mouseTarget.y = -(e.clientY / window.innerHeight - .5) * 2;
    });
    window.addEventListener('touchmove', e => {
        const t = e.touches[0];
        mouseTarget.x = (t.clientX / window.innerWidth - .5) * 2;
        mouseTarget.y = -(t.clientY / window.innerHeight - .5) * 2;
    }, { passive: true });

    /* ─── GSAP INTRO + MASK LOOP ───────────────────────────────── */
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    tl
        .to(mat.uniforms.uReveal, { value: 1, duration: 2.2 }, 0.5)
        .from(sphere.position, { z: -10, y: -2, duration: 2.6 }, 0.5)
        .to('#nav', { opacity: 1, y: 0, duration: 1 }, 1.4)
        .to('#badge', { opacity: 1, x: 0, duration: .9 }, 1.9)
        .to('#h1a', { opacity: 1, y: 0, skewX: 0, duration: .8 }, 2.3)
        .to('#h1b', { opacity: 1, y: 0, skewX: 0, duration: .8 }, 2.65)
        .to('#sub', { opacity: 1, y: 0, duration: .7 }, 3.1)
        .to('#foot', { opacity: 1, y: 0, duration: .8 }, 3.4)
        // Mask morph loops forever
        .to(mat.uniforms.uMorph, {
            value: 1, duration: 2.8,
            ease: 'power2.inOut',
            repeat: -1, yoyo: true, repeatDelay: 1.0,
        }, 4.2);

    // Light dance
    gsap.to(keyLight, {
        intensity: 18, duration: 2, repeat: -1, yoyo: true, ease: 'sine.inOut',
    });
    gsap.to(keyLight.position, {
        x: 4, y: -2, duration: 8, repeat: -1, yoyo: true, ease: 'sine.inOut',
    });

    /* ─── RESIZE ─────────────────────────────────────────────────── */
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    /* ─── RENDER LOOP ───────────────────────────────────────────── */
    const clock = new THREE.Clock();

    (function loop() {
        requestAnimationFrame(loop);

        const t = clock.getElapsedTime();
        mat.uniforms.uTime.value = t;

        // Smooth mouse
        mouseCur.x += (mouseTarget.x - mouseCur.x) * 0.06;
        mouseCur.y += (mouseTarget.y - mouseCur.y) * 0.06;
        mat.uniforms.uMouse.value.copy(mouseCur);

        // ── REAL 3D ROTATION of the sphere with mouse ──
        // This is what makes it ACTUALLY look 3D — you see the sphere curve!
        sphere.rotation.y = mouseCur.x * 0.55; // left-right reveals the sphere roundness
        sphere.rotation.x = -mouseCur.y * 0.35; // up-down tilt

        // Gentle idle float
        sphere.position.y = Math.sin(t * 0.6) * 0.06;
        sphere.position.x = Math.cos(t * 0.4) * 0.03;

        // Camera subtle drift
        camera.position.x = mouseCur.x * 0.15;
        camera.position.y = mouseCur.y * 0.10;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
    })();

})();
