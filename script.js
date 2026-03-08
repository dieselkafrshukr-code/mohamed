/* ================================================================
   Mohamed Walid – AI Engineer Portfolio
   TRUE 3D: Vertex Displacement + SpiderMan Mask Morph
   Three.js r152 + GSAP 3
   ================================================================ */

(function () {
    'use strict';

    /* ── RENDERER ──────────────────────────────────────────────── */
    const wrap = document.getElementById('scene');
    const W = window.innerWidth, H = window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.01, 100);
    camera.position.set(0, 0, 5);

    /* ── TEXTURE ──────────────────────────────────────────────── */
    const loader = new THREE.TextureLoader();
    const texFace = loader.load('21.png');
    texFace.minFilter = THREE.LinearFilter;
    texFace.magFilter = THREE.LinearFilter;

    /* ═══════════════════════════════════════════════════════════
       VERTEX SHADER
       – reads photo luminance → pushes Z  (true 3-D depth)
       – mouse parallax tilts the whole surface
       – morph adds web-crack ripples
       ═══════════════════════════════════════════════════════════ */
    const VERT = /* glsl */`
  precision highp float;
  varying vec2  vUv;
  varying vec3  vNormal;
  varying float vDepth;

  uniform sampler2D uFace;
  uniform float     uTime;
  uniform vec2      uMouse;   // -1..+1 NDC
  uniform float     uMorph;   // 0=face  1=mask
  uniform float     uReveal;

  void main(){
    vUv = uv;

    // Sample photo for luminance-based depth
    vec3 col  = texture2D(uFace, uv).rgb;
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));

    vec3 pos = position;

    // ── TRUE 3-D displacement from photo brightness ──
    // bright skin tones push forward, dark BG stays back
    float depthScale = 1.1;
    pos.z += (lum - 0.1) * depthScale;
    vDepth = pos.z;

    // ── Web-ripple warp on morph ─────────────────────
    float crack  = sin(uv.x * 30.0) * cos(uv.y * 30.0);
    float crackY = sin(uv.y * 22.0 + uTime * 0.5);
    pos.z += crack * crackY * uMorph * 0.12;

    // ── Mouse parallax tilt ──────────────────────────
    pos.x += uMouse.x * 0.18 * (1.0 - uv.y);
    pos.y -= uMouse.y * 0.14;

    // ── Breathing micro-animation ────────────────────
    float breath = sin(uTime * 0.9) * 0.004;
    pos.xy *= 1.0 + breath;

    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

    /* ═══════════════════════════════════════════════════════════
       FRAGMENT SHADER
       – left half: real photo (Mohamed)
       – right half: procedural SpiderMan red mask w/ web lines
       – boundary is noise-animated → organic crawling transition
       ═══════════════════════════════════════════════════════════ */
    const FRAG = /* glsl */`
  precision highp float;
  varying vec2  vUv;
  varying vec3  vNormal;
  varying float vDepth;

  uniform sampler2D uFace;
  uniform float     uTime;
  uniform vec2      uMouse;
  uniform float     uMorph;
  uniform float     uReveal;

  /* ---- Simplex noise 2-D -------------------------------- */
  vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec2 mod289v2(vec2 x){return x-floor(x*(1./289.))*289.;}
  vec3 permute3(vec3 x){return mod289v3(((x*34.)+1.)*x);}
  float snoise(vec2 v){
    const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
    vec2 i=floor(v+dot(v,C.yy));
    vec2 x0=v-i+dot(i,C.xx);
    vec2 i1=(x0.x>x0.y)?vec2(1,0):vec2(0,1);
    vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
    i=mod289v2(i);
    vec3 p=permute3(permute3(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));
    vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
    m=m*m;m=m*m;
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

  /* ---- Procedural spider web lines ---------------------- */
  float webGrid(vec2 uv, float freq, float thickness){
    vec2 g=fract(uv*freq)-.5;
    float line=min(abs(g.x),abs(g.y));
    return smoothstep(thickness,.0,line);
  }

  float radialWeb(vec2 uv, int spokes, float thickness){
    vec2  c=uv-.5;
    float a=atan(c.y,c.x);
    float pi=3.14159265;
    float seg=mod(a,pi/float(spokes));
    return smoothstep(thickness,.0,min(seg,pi/float(spokes)-seg));
  }

  /* ---- SpiderMan mask (full procedural) ----------------- */
  vec3 spiderMask(vec2 uv, float t){
    // base crimson
    vec3 col=vec3(0.78,0.04,0.04);

    // web grid
    float wg=webGrid(uv, 8.0, 0.012);
    // radial spokes
    float wr=radialWeb(uv, 8, 0.008);
    // concentric rings
    vec2  ctr=uv-.5;
    float r=length(ctr)*8.0+t*0.3;
    float rings=smoothstep(0.04,.0,abs(mod(r,1.)-.5));

    col=mix(col, vec3(0.0), clamp(wg+wr+rings,0.,1.)*0.9);

    // classic white teardrop eyes
    // left eye
    vec2 lePos=uv-vec2(0.34,0.595);
    lePos.x/=0.55; lePos.y/=0.80;    // squash into teardrop
    float le=length(lePos);
    float leShape=smoothstep(0.155,0.10,le);
    // right eye
    vec2 rePos=uv-vec2(0.66,0.595);
    rePos.x/=0.55; rePos.y/=0.80;
    float re=length(rePos);
    float reShape=smoothstep(0.155,0.10,re);

    // eye inner glow (white + slight blue-white)
    vec3 eyeCol=mix(vec3(0.85,0.92,1.0),vec3(1.0),0.7);
    col=mix(col,eyeCol,leShape);
    col=mix(col,eyeCol,reShape);

    // rim highlight across top of mask
    float rim=smoothstep(0.55,1.0,uv.y)*0.25;
    col+=rim*vec3(0.9,0.1,0.1);

    return col;
  }

  /* ---- Lighting from depth + normal --------------------- */
  vec3 applyLight(vec3 col, vec2 uv, float depth){
    // key light from upper-left red
    vec3 lightDir=normalize(vec3(-1.0,1.0,2.0)+vec3(uMouse*0.5,0.0));
    float diff=max(dot(vNormal,lightDir),0.0);

    // rim light red
    float rim=pow(1.0-abs(dot(vNormal,vec3(0,0,1))),3.0);

    col *= 0.6 + 0.55*diff;
    col += rim*vec3(0.6,0.0,0.0)*0.6;

    return col;
  }

  void main(){
    /* ---- photo with chromatic aberration ---- */
    float ca = uMorph * 0.018;
    vec3 photo;
    photo.r = texture2D(uFace, vUv + vec2( ca, 0.)).r;
    photo.g = texture2D(uFace, vUv              ).g;
    photo.b = texture2D(uFace, vUv - vec2( ca, 0.)).b;

    /* ---- mask ---- */
    vec3 mask = spiderMask(vUv, uTime);

    /* ---- organic morph boundary ---- */
    // noisy diagonal sweep: starts from right edge
    float n1 = snoise(vUv * 4.0 + uTime * 0.25) * 0.18;
    float n2 = snoise(vUv * 10.0 - uTime * 0.4) * 0.07;

    // sweep left→right based on uMorph
    float boundary = vUv.x - (1.0 - uMorph) * 1.8 + n1 + n2;
    float sweep    = smoothstep(-.04, .04, boundary) * uMorph;

    /* ---- blend ---- */
    vec3 blended = mix(photo, mask, sweep);

    /* ---- edge glow at boundary ---- */
    float edge = smoothstep(.06,.0,abs(boundary)) * uMorph;
    blended += edge * vec3(1.0, 0.1, 0.1) * 1.2;

    /* ---- depth-based lighting ---- */
    blended = applyLight(blended, vUv, vDepth);

    /* ---- red ambient tint on mask side ---- */
    blended = mix(blended, blended*vec3(1.15,0.6,0.6), sweep*0.3);

    /* ---- vignette ---- */
    vec2 vc = vUv - .5;
    float vign = 1.0 - dot(vc,vc)*1.6;
    blended *= vign;

    gl_FragColor = vec4(blended, uReveal);
  }
`;

    /* ── MESH (512 subdivisions for smooth 3-D depth) ─────────── */
    // Aspect ratio: typical portrait shot ~3:4
    const geoW = 3.0, geoH = 4.0;
    const geo = new THREE.PlaneGeometry(geoW, geoH, 200, 200);

    const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
            uFace: { value: texFace },
            uTime: { value: 0 },
            uMouse: { value: new THREE.Vector2(0, 0) },
            uMorph: { value: 0 },
            uReveal: { value: 0 },
        },
        transparent: true,
        side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    /* ── FLOATING 3-D WEB STRANDS ──────────────────────────────── */
    const strandMat = new THREE.LineBasicMaterial({
        color: 0x550000, transparent: true, opacity: 0.25,
    });
    for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const pts = [
            new THREE.Vector3(0, 0, -2),
            new THREE.Vector3(Math.cos(a) * 11, Math.sin(a) * 11, -2),
        ];
        scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts), strandMat
        ));
    }
    // concentric octagons
    for (let r = 1; r <= 6; r++) {
        const pts = [];
        for (let i = 0; i <= 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3, -2));
        }
        scene.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts), strandMat
        ));
    }

    /* ── POINT LIGHTS (add depth via colour) ───────────────────── */
    const lRed = new THREE.PointLight(0xff1111, 6, 10);
    lRed.position.set(-3.5, 2, 2);
    scene.add(lRed);

    const lAmb = new THREE.AmbientLight(0x220000, 2);
    scene.add(lAmb);

    /* ── 2-D PARTICLE BG (CSS canvas) ─────────────────────────── */
    const bgC = document.getElementById('bg');
    const bgX = bgC.getContext('2d');
    bgC.width = W; bgC.height = H;
    const dots = Array.from({ length: 100 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.4 + .4,
        vx: (Math.random() - .5) * .25,
        vy: (Math.random() - .5) * .25,
        a: Math.random() * .6 + .1,
    }));
    (function drawBg() {
        requestAnimationFrame(drawBg);
        bgX.clearRect(0, 0, bgC.width, bgC.height);
        dots.forEach(d => {
            d.x = (d.x + d.vx + bgC.width) % bgC.width;
            d.y = (d.y + d.vy + bgC.height) % bgC.height;
            bgX.beginPath();
            bgX.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            bgX.fillStyle = `rgba(200,10,10,${d.a})`;
            bgX.fill();
        });
    })();

    /* ── MOUSE ─────────────────────────────────────────────────── */
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

    /* ── GSAP INTRO + MASK AUTO-MORPH ──────────────────────────── */
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    tl
        // 1. Photo reveals + flies from depth
        .to(mat.uniforms.uReveal, { value: 1, duration: 2.0 }, 0.4)
        .from(mesh.position, { z: -8, y: -2, duration: 2.4 }, 0.4)

        // 2. Nav
        .to('nav', { opacity: 1, y: 0, duration: 1.1 }, 1.2)

        // 3. Hero text
        .to('#role', { opacity: 1, x: 0, duration: .9 }, 1.8)
        .to('#h1a', { opacity: 1, y: 0, skewX: 0, duration: .8 }, 2.2)
        .to('#h1b', { opacity: 1, y: 0, skewX: 0, duration: .8 }, 2.55)
        .to('#desc', { opacity: 1, y: 0, duration: .8 }, 3.0)
        .to('#foot', { opacity: 1, y: 0, duration: .9 }, 3.3)

        // 4. Mask morphs in – then back – loops forever
        .to(mat.uniforms.uMorph, {
            value: 1, duration: 3.0,
            ease: 'power2.inOut',
            repeat: -1, yoyo: true, repeatDelay: 1.2,
        }, 4.0);

    // Light pulse
    gsap.to(lRed, { intensity: 12, duration: 1.8, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    gsap.to(lRed.position, { x: 3.5, y: -2, duration: 7, repeat: -1, yoyo: true, ease: 'sine.inOut' });

    /* ── RESIZE ─────────────────────────────────────────────────── */
    window.addEventListener('resize', () => {
        const w = window.innerWidth, h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        bgC.width = w; bgC.height = h;
    });

    /* ── RENDER LOOP ────────────────────────────────────────────── */
    const clock = new THREE.Clock();

    (function loop() {
        requestAnimationFrame(loop);

        const t = clock.getElapsedTime();
        mat.uniforms.uTime.value = t;

        // Smooth mouse lerp
        mouseCur.x += (mouseTarget.x - mouseCur.x) * 0.055;
        mouseCur.y += (mouseTarget.y - mouseCur.y) * 0.055;
        mat.uniforms.uMouse.value.copy(mouseCur);

        // Camera floating + mouse parallax
        camera.position.x = mouseCur.x * 0.22 + Math.sin(t * .18) * .08;
        camera.position.y = mouseCur.y * 0.14 + Math.cos(t * .14) * .05;
        camera.lookAt(0, 0, 0);

        // Mesh slight Y rotation showing 3-D depth
        mesh.rotation.y = mouseCur.x * 0.18;
        mesh.rotation.x = mouseCur.y * -0.12;

        renderer.render(scene, camera);
    })();

})();
