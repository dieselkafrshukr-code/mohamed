/* ================================================================
   Mohamed Walid – Spider-Man Face Mask + 3D Photo
   Follows Roadmap exactly:
     Phase 4: Your photo on PlaneGeometry with displacement
     Phase 5: Spider-Man mask on separate smaller PlaneGeometry
     Phase 6: Lighting (Ambient + Key + Red + Rim)
     Phase 7: GSAP full timeline
     Phase 8: Mouse 3D parallax in render loop
   ================================================================ */
(function () {
    'use strict';

    /* ══════════════════════════════════════════════════════════════
       GENERATE TEXTURES PROGRAMMATICALLY
       (No external files needed — works on file:// AND http://)
       ══════════════════════════════════════════════════════════════ */

    /* ── Displacement map: radial gradient → face protrudes forward */
    function makeDisplaceTexture() {
        const S = 512;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        // Bright center (face area) → pushes the mesh forward in Z
        const grad = g.createRadialGradient(S * .5, S * .42, 0, S * .5, S * .5, S * .52);
        grad.addColorStop(0, '#d8d8d8');
        grad.addColorStop(0.4, '#888888');
        grad.addColorStop(1, '#111111');
        g.fillStyle = grad;
        g.fillRect(0, 0, S, S);
        return new THREE.CanvasTexture(c);
    }

    /* ── Spider-Man face mask texture (Canvas 2D procedural art) ── */
    function makeSpiderTexture() {
        const S = 1024;
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');

        // Clear (transparent)
        g.clearRect(0, 0, S, S);

        // Red base with radial gradient
        const base = g.createRadialGradient(S * .5, S * .4, 0, S * .5, S * .5, S * .62);
        base.addColorStop(0, '#ff2424');
        base.addColorStop(0.6, '#cc0000');
        base.addColorStop(1, '#7a0000');
        g.fillStyle = base;
        // Draw circular mask shape (only the face area)
        g.beginPath();
        g.ellipse(S * .5, S * .48, S * .44, S * .48, 0, 0, Math.PI * 2);
        g.fill();

        // Web lines radiating from top-center
        const OX = S * .50, OY = -S * .08;
        g.strokeStyle = 'rgba(0,0,0,0.82)';
        g.lineWidth = S * .0032;
        g.lineCap = 'round';

        const SPOKES = 20;
        for (let i = 0; i < SPOKES; i++) {
            const a = (i / SPOKES) * Math.PI * 1.5 - Math.PI * .75;
            g.beginPath();
            g.moveTo(OX + Math.cos(a) * S * .03, OY + Math.sin(a) * S * .03);
            g.lineTo(OX + Math.cos(a) * S * 1.5, OY + Math.sin(a) * S * 1.5);
            g.stroke();
        }

        // Concentric arc rings
        for (let r = .12; r < 2.0; r += .10) {
            g.beginPath();
            g.ellipse(OX, OY, r * S, r * S * .86, 0, Math.PI * .08, Math.PI * .92);
            g.stroke();
        }

        // ── EYES: angular Spider-Man teardrop ──
        function drawEye(cx, cy, flipX) {
            g.save();
            g.translate(cx, cy);
            if (flipX) g.scale(-1, 1);

            const W = S * .195, H = S * .122;

            g.beginPath();
            g.moveTo(W * .05, 0);                            // inner tip
            g.bezierCurveTo(0, -H * .5, -W * .28, -H, -W * .68, -H);   // top-inner
            g.bezierCurveTo(-W * 1.05, -H, -W * 1.22, -H * .4, -W * 1.22, 0); // outer top
            g.bezierCurveTo(-W * 1.22, H * .44, -W * .88, H * .75, -W * .38, H * .42); // outer bottom
            g.bezierCurveTo(-W * .18, H * .22, W * .02, H * .06, W * .05, 0); // inner bottom

            // White gradient fill
            const eg = g.createLinearGradient(-W * 1.22, -H, 0, H);
            eg.addColorStop(0, '#efefef');
            eg.addColorStop(1, '#b8b8b8');
            g.fillStyle = eg;
            g.fill();

            // Black border
            g.strokeStyle = 'rgba(0,0,0,.88)';
            g.lineWidth = S * .004;
            g.stroke();

            // Inner shine highlight
            g.beginPath();
            g.ellipse(-W * .52, -H * .28, W * .26, H * .20, .28, 0, Math.PI * 2);
            g.fillStyle = 'rgba(255,255,255,.55)';
            g.fill();

            g.restore();
        }

        drawEye(S * .285, S * .40, false); // left eye
        drawEye(S * .715, S * .40, true);  // right eye (mirrored)

        // Chin/jaw curve — slight shadow for depth
        const jawGrad = g.createLinearGradient(0, S * .7, 0, S * .98);
        jawGrad.addColorStop(0, 'transparent');
        jawGrad.addColorStop(1, 'rgba(0,0,0,.35)');
        g.fillStyle = jawGrad;
        g.beginPath();
        g.ellipse(S * .5, S * .48, S * .44, S * .48, 0, 0, Math.PI * 2);
        g.fill();

        return new THREE.CanvasTexture(c);
    }

    /* ── Photo texture from <img> element (bypasses file:// CORS) ─ */
    function makePhotoTexture() {
        // Try loading via an img element
        const img = new Image();
        img.src = '21.png';

        const tex = new THREE.Texture(img);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;

        img.onload = () => {
            tex.needsUpdate = true;
            if (photoMat) photoMat.needsUpdate = true;
        };
        // If image fails, mesh still renders (will be black/grey from displacement)
        img.onerror = () => console.warn('Photo failed — check file path / use Live Server');

        if (img.complete && img.naturalWidth > 0) tex.needsUpdate = true;
        return tex;
    }


    /* ══════════════════════════════════════════════════════════════
       THREE.JS SCENE  (exactly from roadmap)
       ══════════════════════════════════════════════════════════════ */

    /* Phase 3 ── Setup ──────────────────────────────────────────── */
    const renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('canvas'),
        antialias: true,
        alpha: true,
    });
    renderer.setSize(400, 560);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 400 / 560, 0.1, 100);
    camera.position.z = 2.5;

    /* Build textures */
    const dispTex = makeDisplaceTexture();
    const spiderTex = makeSpiderTexture();
    const photoTex = makePhotoTexture();


    /* Phase 4 ── Your photo on PlaneGeometry with Displacement ──── */
    let photoMat; // declared here so makePhotoTexture can access it
    const photoGeo = new THREE.PlaneGeometry(2, 2.8, 128, 128);
    photoMat = new THREE.MeshStandardMaterial({
        map: photoTex,
        displacementMap: dispTex,
        displacementScale: 0.09,      // subtle 3D depth on the face
        roughness: 0.60,
        metalness: 0.10,
    });
    const photoMesh = new THREE.Mesh(photoGeo, photoMat);
    scene.add(photoMesh);


    /* Phase 5 ── Spider-Man face plane OVER the face position ────── */
    const spiderGeo = new THREE.PlaneGeometry(0.85, 0.85, 64, 64);
    const spiderMat = new THREE.MeshStandardMaterial({
        map: spiderTex,
        transparent: true,
        opacity: 0,          // GSAP animates this to 1
        depthWrite: false,
        roughness: 0.45,
        metalness: 0.20,
    });
    const spiderMesh = new THREE.Mesh(spiderGeo, spiderMat);

    // Position mask over face — tune Y & scale via debug panel
    spiderMesh.position.set(
        0,      // x: center
        0.55,   // y: upper face area
        0.12    // z: in front of photo mesh
    );
    scene.add(spiderMesh);


    /* Phase 6 ── Lighting ───────────────────────────────────────── */
    const ambient = new THREE.AmbientLight(0xffffff, 0.50);
    scene.add(ambient);

    // Key light upper-left
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(-2, 3, 3);
    keyLight.castShadow = true;
    scene.add(keyLight);

    // Red Spider-Man vibe from the right
    const redLight = new THREE.PointLight(0xff1111, 2.5, 8);
    redLight.position.set(2, 1, 2);
    scene.add(redLight);

    // Rim light from behind-left (adds cinematic depth)
    const rimLight = new THREE.PointLight(0x2233ff, 0.9, 6);
    rimLight.position.set(-1, -1, -2);
    scene.add(rimLight);


    /* Phase 7 ── GSAP Full Timeline ──────────────────────────────── */
    const tl = gsap.timeline({ delay: 0.6 });

    /* Step 1: photo CARD appears */
    tl.to('#hero', {
        opacity: 1, y: 0, scale: 1, duration: 1.0, ease: 'power3.out'
    })

        /* Step 2: photo mesh scales in */
        .from(photoMesh.scale, {
            x: 0.85, y: 0.85, z: 0.85,
            duration: 1.2, ease: 'power3.out',
        }, '<0.2')

        /* Step 3: mask drops in from above (y = initial + 1.5) */
        .fromTo(spiderMesh.position,
            { y: spiderMesh.position.y + 1.5 },
            { y: spiderMesh.position.y, duration: 1.0, ease: 'power4.out' },
            '-=0.3'
        )

        /* Step 4: mask fades in (opacity 0 → 1) */
        .to(spiderMat, {
            opacity: 1, duration: 0.6, ease: 'power2.out',
        }, '<0.2')

        /* Step 5: elastic scale punch */
        .from(spiderMesh.scale, {
            x: 0.5, y: 0.5, z: 0.5,
            duration: 1.0, ease: 'elastic.out(1, 0.4)',
        }, '<')

        /* Step 6: red light burst */
        .to(redLight, {
            intensity: 7,
            duration: 0.15, yoyo: true, repeat: 5, ease: 'power1.inOut',
        }, '-=0.2')

        /* Step 7: animate UI in */
        .to('#nav', { opacity: 1, y: 0, duration: .9, ease: 'power4.out' }, 0.3)
        .to('#role', { opacity: 1, x: 0, duration: .8, ease: 'power4.out' }, 0.7)
        .to('#h1a', { opacity: 1, y: 0, skewX: 0, duration: .75, ease: 'power4.out' }, 0.95)
        .to('#h1b', { opacity: 1, y: 0, skewX: 0, duration: .75, ease: 'power4.out' }, 1.25)
        .to('#desc', { opacity: 1, y: 0, duration: .7, ease: 'power4.out' }, 1.55)
        .to('#ctas', { opacity: 1, y: 0, duration: .7, ease: 'power4.out' }, 1.75)
        .to('#clabel', { opacity: 1, y: 0, duration: .6 }, 2.2);

    /* Continuous idle: mask slightly breathes */
    gsap.to(spiderMesh.scale, {
        x: 1.03, y: 1.03,
        duration: 2.2, ease: 'sine.inOut',
        repeat: -1, yoyo: true, delay: 3.5,
    });


    /* Phase 8 ── Mouse 3D Parallax ───────────────────────────────── */
    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;

    // Lerp helper (from roadmap)
    function lerp(a, b, t) { return a + (b - a) * t; }

    document.addEventListener('mousemove', (e) => {
        targetX = (e.clientX / window.innerWidth - 0.5) * 2;
        targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    });


    /* ── Debug panel (live position tuning from roadmap tip) ──────── */
    const posYSlider = document.getElementById('posY');
    const scSlider = document.getElementById('sc');

    posYSlider?.addEventListener('input', () => {
        spiderMesh.position.y = parseFloat(posYSlider.value);
    });
    scSlider?.addEventListener('input', () => {
        const v = parseFloat(scSlider.value);
        spiderMesh.scale.set(v, v, v);
    });


    /* ── Background particles canvas ─────────────────────────────── */
    (function bgParticles() {
        const c = document.getElementById('bg-particles');
        if (!c) return;
        const cx = c.getContext('2d');
        c.width = window.innerWidth;
        c.height = window.innerHeight;

        const dots = Array.from({ length: 80 }, () => ({
            x: Math.random() * c.width, y: Math.random() * c.height,
            r: Math.random() * 1.2 + .3,
            vx: (Math.random() - .5) * .2, vy: (Math.random() - .5) * .2,
            a: Math.random() * .45 + .05,
        }));
        (function draw() {
            requestAnimationFrame(draw);
            cx.clearRect(0, 0, c.width, c.height);
            dots.forEach(d => {
                d.x = (d.x + d.vx + c.width) % c.width;
                d.y = (d.y + d.vy + c.height) % c.height;
                cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
                cx.fillStyle = `rgba(200,0,0,${d.a})`; cx.fill();
            });
        })();
        window.addEventListener('resize', () => { c.width = innerWidth; c.height = innerHeight; });
    })();


    /* Phase 8 Render Loop ──────────────────────────────────────────── */
    function animate() {
        requestAnimationFrame(animate);

        // Smooth lerp (Phase 8 from roadmap)
        currentX = lerp(currentX, targetX, 0.050);
        currentY = lerp(currentY, targetY, 0.050);

        // Photo mesh tilts with mouse (subtle)
        photoMesh.rotation.y = currentX * 0.15;
        photoMesh.rotation.x = -currentY * 0.10;

        // Mask moves MORE than photo → creates parallax depth illusion
        spiderMesh.rotation.y = currentX * 0.28;
        spiderMesh.rotation.x = -currentY * 0.20;

        // Red light follows mouse (dramatic)
        redLight.position.x = currentX * 3;
        redLight.position.y = currentY * 2;

        renderer.render(scene, camera);
    }
    animate();

})();
