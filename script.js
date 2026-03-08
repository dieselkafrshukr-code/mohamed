/* ============================================================
   Mohamed Walid | Spider-Man 3D Portfolio
   Three.js + GSAP – Full 3D face blend with mask morphing
   ============================================================ */

(function () {
    'use strict';

    /* ─── SCENE SETUP ───────────────────────────────────────── */
    const wrap = document.getElementById('scene-wrap');

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
        60, window.innerWidth / window.innerHeight, 0.01, 100
    );
    camera.position.set(0, 0, 4.5);

    /* ─── ENVIRONMENT FOG ───────────────────────────────────── */
    scene.fog = new THREE.FogExp2(0x0a0000, 0.08);

    /* ─── TEXTURES ──────────────────────────────────────────── */
    const loader = new THREE.TextureLoader();

    // Mohamed's photo
    const texPhoto = loader.load('21.jpeg');
    texPhoto.minFilter = THREE.LinearFilter;
    texPhoto.magFilter = THREE.LinearFilter;

    /* ─── GLSL SHADERS (THE MAGIC) ──────────────────────────── */

    /* Vertex shader – parallax warp + Z‑wave on mouse */
    const vertGLSL = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    uniform float uTime;
    uniform vec2  uMouse;   // -1..+1
    uniform float uMorph;   // 0=photo | 1=mask

    // simple 2-D hash for per-vertex noise
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main(){
      vUv    = uv;
      vNormal = normal;
      vec3 pos = position;

      // ---- parallax tilt (mouse) ----
      pos.z += uMouse.x * 0.08 * (1.0 - pos.z);
      pos.y -= uMouse.y * 0.08 * (1.0 - pos.z);

      // ---- web-crack warp (morphing) ----
      float crack = sin(uv.x * 24.0) * cos(uv.y * 24.0);
      pos.z += crack * uMorph * 0.04;

      // ---- breathing animation ----
      float breath = sin(uTime * 0.8) * 0.003;
      pos.xy *= 1.0 + breath;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

    /* Fragment shader – photo → Spider-Man mask blend */
    const fragGLSL = /* glsl */ `
    precision highp float;
    varying vec2 vUv;

    uniform sampler2D uPhoto;
    uniform float     uTime;
    uniform float     uMorph;   // 0..1
    uniform vec2      uMouse;
    uniform float     uReveal;  // intro fade

    // ── Simplex noise (compact version) ─────────────────────
    vec3 mod289(vec3 x){ return x - floor(x*(1./289.))*289.; }
    vec2 mod289(vec2 x){ return x - floor(x*(1./289.))*289.; }
    vec3 permute(vec3 x){ return mod289(((x*34.)+1.)*x); }
    float snoise(vec2 v){
      const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
      vec2 i=floor(v+dot(v,C.yy));
      vec2 x0=v-i+dot(i,C.xx);
      vec2 i1=(x0.x>x0.y)?vec2(1,0):vec2(0,1);
      vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
      i=mod289(i);
      vec3 p=permute(permute(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));
      vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
      m=m*m; m=m*m;
      vec3 x_=2.*fract(p*C.www)-1.;
      vec3 h=abs(x_)-.5;
      vec3 ox=floor(x_+.5);
      vec3 a0=x_-ox;
      m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
      vec3 g;
      g.x=a0.x*x0.x+h.x*x0.y;
      g.yz=a0.yz*x12.xz+h.yz*x12.yw;
      return 130.*dot(m,g);
    }

    // ── Spider-Man mask (procedural) ─────────────────────────
    // Build a red+black spidey pattern purely in GLSL
    float webLine(vec2 uv, float angle, float freq){
      vec2 dir = vec2(cos(angle), sin(angle));
      float proj = dot(uv - .5, dir);
      return smoothstep(.005,.0,abs(mod(proj*freq,1.)-.5));
    }

    vec3 spiderMask(vec2 uv){
      // base red
      vec3 col = vec3(.85, .05, .05);

      // eye cutouts – white ovals (classic Spidey lenses)
      float leftEye  = length((uv - vec2(.35,.60)) * vec2(2.5,1.6));
      float rightEye = length((uv - vec2(.65,.60)) * vec2(2.5,1.6));
      float eyes = smoothstep(.15,.10, min(leftEye, rightEye));
      col = mix(col, vec3(.95,.95,.95), eyes);

      // inner eye shadow for depth
      float leftEyeInner  = length((uv - vec2(.35,.60)) * vec2(2.5,1.6));
      float rightEyeInner = length((uv - vec2(.65,.60)) * vec2(2.5,1.6));
      float eyeShadow = smoothstep(.08,.12, min(leftEyeInner, rightEyeInner));
      col = mix(col * .3, col, smoothstep(.10,.14, min(leftEyeInner, rightEyeInner)));

      // web lines (5 radial directions)
      float web = 0.;
      float pi  = 3.14159265;
      for(int i=0; i<8; i++){
        web += webLine(uv, float(i)*pi/8., 12.);
      }
      // concentric circles
      vec2 center = uv - .5;
      float r = length(center) * 10.0;
      float circles = smoothstep(.03,.0, abs(mod(r, 1.) - .5));
      web += circles;
      col = mix(col, vec3(0.), clamp(web, 0., 1.) * .9);

      return col;
    }

    void main(){
      vec2 p = vUv;

      // ─── photo base ───────────────────────────────────────
      // subtle chromatic aberration on photo
      float ca = uMorph * 0.012;
      vec4 photoR = texture2D(uPhoto, p + vec2(ca, 0.));
      vec4 photoG = texture2D(uPhoto, p);
      vec4 photoB = texture2D(uPhoto, p - vec2(ca, 0.));
      vec3 photo  = vec3(photoR.r, photoG.g, photoB.b);

      // ─── mask colour ─────────────────────────────────────
      vec3 mask = spiderMask(p);

      // ─── organic dissolve boundary ────────────────────────
      // noise shifts the blend edge to make it look like
      // the mask is crawling across the face
      float n1 = snoise(p * 5.0  + uTime * 0.3) * 0.15;
      float n2 = snoise(p * 12.0 - uTime * 0.5) * 0.07;
      float noisyMorph = clamp(uMorph + n1 + n2, 0., 1.);

      // diagonal reveal sweep → left face stays photo, right becomes mask
      float sweep = smoothstep(0., 1.,
        clamp((p.x + noisyMorph * 1.6 - .55), 0., 1.)
      );

      vec3 blended = mix(photo, mask, sweep * uMorph);

      // ─── red tinted shadow on photo side ─────────────────
      float shadowEdge = smoothstep(.04,.0, sweep) * uMorph;
      blended = mix(blended, vec3(.6,.0,.0), shadowEdge * .6);

      // ─── web glow on mask side ────────────────────────────
      float glowDist = 1. - smoothstep(.0,.08, sweep - .9);
      blended = mix(blended, vec3(.9,.1,.1), glowDist * uMorph * .6);

      // ─── vignette ────────────────────────────────────────
      vec2 vc = vUv - .5;
      float vign = 1.0 - dot(vc, vc) * 1.8;
      blended *= vign;

      // ─── dark red global tint ────────────────────────────
      blended = mix(blended, blended * vec3(1.1,.7,.7), .15 * uMorph);

      // ─── intro reveal fade ────────────────────────────────
      gl_FragColor = vec4(blended, uReveal);
    }
  `;

    /* ─── PLANE GEOMETRY (hi‑res for vertex displacement) ────── */
    const geo = new THREE.PlaneGeometry(3.0, 4.0, 128, 128);
    const mat = new THREE.ShaderMaterial({
        vertexShader: vertGLSL,
        fragmentShader: fragGLSL,
        transparent: true,
        uniforms: {
            uPhoto: { value: texPhoto },
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2(0, 0) },
            uMorph: { value: 0 },
            uReveal: { value: 0 },
        },
    });

    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    /* ─── PARTICLES (red web debris) ────────────────────────── */
    (function buildParticles() {
        const N = 700;
        const pos = new Float32Array(N * 3);
        const sizes = new Float32Array(N);
        for (let i = 0; i < N; i++) {
            pos[i * 3] = (Math.random() - .5) * 12;
            pos[i * 3 + 1] = (Math.random() - .5) * 12;
            pos[i * 3 + 2] = (Math.random() - .5) * 6 - 2;
            sizes[i] = Math.random() * 3 + 1;
        }
        const pg = new THREE.BufferGeometry();
        pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        pg.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const pm = new THREE.PointsMaterial({
            color: 0xcc1111,
            size: 0.06,
            transparent: true,
            opacity: 0.5,
            sizeAttenuation: true,
        });
        const pts = new THREE.Points(pg, pm);
        scene.add(pts);

        // Drift animation
        gsap.to(pts.rotation, {
            y: Math.PI * 2,
            duration: 60,
            repeat: -1,
            ease: 'none',
        });
    })();

    /* ─── SPIDERWEB LINES (thin radial lines in 3D) ─────────── */
    (function buildWebLines() {
        const mat = new THREE.LineBasicMaterial({
            color: 0x660000,
            transparent: true,
            opacity: 0.18,
        });
        const lines = 14;
        for (let i = 0; i < lines; i++) {
            const angle = (i / lines) * Math.PI * 2;
            const points = [
                new THREE.Vector3(0, 0, -3),
                new THREE.Vector3(Math.cos(angle) * 9, Math.sin(angle) * 9, -3),
            ];
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            scene.add(new THREE.Line(geo, mat));
        }
        // concentric hexagons
        for (let r = 1; r <= 5; r++) {
            const pts = [];
            for (let i = 0; i <= 6; i++) {
                const a = (i / 6) * Math.PI * 2;
                pts.push(new THREE.Vector3(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2, -3));
            }
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            scene.add(new THREE.Line(g, mat));
        }
    })();

    /* ─── RED POINT LIGHTS ──────────────────────────────────── */
    const light1 = new THREE.PointLight(0xff2020, 4, 8);
    light1.position.set(-3, 2, 2);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xff8800, 2, 8);
    light2.position.set(3, -2, 2);
    scene.add(light2);

    /* ─── BACKGROUND PARTICLE CANVAS (CSS canvas) ──────────── */
    (function bgParticles() {
        const c = document.getElementById('bg-particles');
        const cx = c.getContext('2d');
        c.width = window.innerWidth;
        c.height = window.innerHeight;

        const dots = Array.from({ length: 120 }, () => ({
            x: Math.random() * c.width,
            y: Math.random() * c.height,
            r: Math.random() * 1.5 + .5,
            vx: (Math.random() - .5) * .3,
            vy: (Math.random() - .5) * .3,
            a: Math.random(),
        }));

        function drawBg() {
            cx.clearRect(0, 0, c.width, c.height);
            dots.forEach(d => {
                d.x = (d.x + d.vx + c.width) % c.width;
                d.y = (d.y + d.vy + c.height) % c.height;
                cx.beginPath();
                cx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                cx.fillStyle = `rgba(200,20,20,${d.a * .5})`;
                cx.fill();
            });
            requestAnimationFrame(drawBg);
        }
        drawBg();

        window.addEventListener('resize', () => {
            c.width = window.innerWidth;
            c.height = window.innerHeight;
        });
    })();

    /* ─── MOUSE / POINTER ───────────────────────────────────── */
    const mouse = new THREE.Vector2();
    const targetM = new THREE.Vector2();

    window.addEventListener('mousemove', e => {
        targetM.x = (e.clientX / window.innerWidth - .5) * 2;
        targetM.y = -(e.clientY / window.innerHeight - .5) * 2;
    });

    /* ─── GSAP INTRO SEQUENCE ───────────────────────────────── */
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    // 1. Photo fades + flies in
    tl.to(mat.uniforms.uReveal, { value: 1, duration: 1.8 }, 0.3)
        .from(mesh.position, { z: -6, y: -2, duration: 2.2 }, 0.3)

        // 2. Nav slides down
        .to('#nav', { opacity: 1, y: 0, duration: 1 }, 1.2)

        // 3. Sub-title
        .to('#sub', { opacity: 1, x: 0, duration: 0.9 }, 1.6)

        // 4. Name letters
        .to('#w1', { opacity: 1, y: 0, skewX: 0, duration: 0.8 }, 2.0)
        .to('#w2', { opacity: 1, y: 0, skewX: 0, duration: 0.8 }, 2.3)

        // 5. Bottom bar
        .to('#bottom-bar', { opacity: 1, y: 0, duration: 0.8 }, 2.6)

        // 6. Spider-Man mask MORPH starts (auto-trigger once, then stays)
        .to(mat.uniforms.uMorph, {
            value: 1,
            duration: 2.8,
            ease: 'power2.inOut',
            repeat: -1,
            repeatDelay: 1.5,
            yoyo: true,
        }, 3.2);

    /* ─── LIGHT PULSE ANIMATION ─────────────────────────────── */
    gsap.to(light1, {
        intensity: 8,
        duration: 1.5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
    });

    gsap.to(light1.position, {
        x: 3, y: -2,
        duration: 6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
    });

    /* ─── RESIZE ────────────────────────────────────────────── */
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    /* ─── RENDER LOOP ───────────────────────────────────────── */
    const clock = new THREE.Clock();

    (function animate() {
        requestAnimationFrame(animate);

        const elapsed = clock.getElapsedTime();

        mat.uniforms.uTime.value = elapsed;

        // Smooth mouse lerp
        mouse.x += (targetM.x - mouse.x) * 0.06;
        mouse.y += (targetM.y - mouse.y) * 0.06;
        mat.uniforms.uMouse.value.copy(mouse);

        // Camera subtle float
        camera.position.x = Math.sin(elapsed * .2) * .12;
        camera.position.y = Math.cos(elapsed * .15) * .07;
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
    })();

})();
