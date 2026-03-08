/* ================================================================
   Mohamed Walid – Spider-Man Mask on 3D Head
   Following the Roadmap:
   • Photo = real <img> in background
   • Three.js canvas = 3D Sphere ONLY over head area
   • Spider-Man mask = Canvas 2D texture on MeshStandardMaterial
   • GSAP timeline = elastic reveal animation
   • Mouse parallax = mask follows mouse in 3D
   ================================================================ */
(function () {
    'use strict';

    /* ── 0. Background animated web lines (CSS canvas) ──────────── */
    (function bgWeb() {
        const c = document.getElementById('bg-canvas');
        const cx = c.getContext('2d');
        c.width = window.innerWidth;
        c.height = window.innerHeight;

        const OCX = c.width * .5;
        const OCY = c.height * .05;
        const spokeCount = 20;
        const ringGap = 90;
        const maxRings = 15;

        let t = 0;
        function drawBg() {
            requestAnimationFrame(drawBg);
            cx.clearRect(0, 0, c.width, c.height);
            cx.strokeStyle = `rgba(80,0,0,${.12 + Math.sin(t * .5) * .03})`;
            cx.lineWidth = 1;

            for (let i = 0; i < spokeCount; i++) {
                const a = (i / spokeCount) * Math.PI * 1.5 - Math.PI * .75;
                cx.beginPath();
                cx.moveTo(OCX, OCY);
                cx.lineTo(OCX + Math.cos(a) * c.width * 1.4,
                    OCY + Math.sin(a) * c.height * 1.6);
                cx.stroke();
            }
            for (let r = 1; r <= maxRings; r++) {
                cx.beginPath();
                cx.ellipse(OCX, OCY, r * ringGap * 1.15, r * ringGap, 0, 0, Math.PI * 2);
                cx.stroke();
            }
            t += .015;
        }
        drawBg();

        window.addEventListener('resize', () => {
            c.width = window.innerWidth;
            c.height = window.innerHeight;
        });
    })();


    /* ── 1. Build Spider-Man mask texture via Canvas 2D ─────────── */
    function buildSpiderManTexture() {
        const S = 1024;
        const cv = document.createElement('canvas');
        cv.width = cv.height = S;
        const g = cv.getContext('2d');

        /* Base: red radial gradient */
        const grad = g.createRadialGradient(S * .5, S * .38, 0, S * .5, S * .5, S * .7);
        grad.addColorStop(0, '#ff2020');
        grad.addColorStop(0.5, '#cc0000');
        grad.addColorStop(1, '#7a0000');
        g.fillStyle = grad;
        g.fillRect(0, 0, S, S);

        /* Web lines from origin above face */
        const OX = S * .50;
        const OY = -S * .10;
        g.strokeStyle = 'rgba(0,0,0,0.78)';
        g.lineWidth = S * .003;
        g.lineCap = 'round';

        const SPOKES = 18;
        for (let i = 0; i < SPOKES; i++) {
            const a = (i / SPOKES) * Math.PI * 1.45 - Math.PI * .725;
            g.beginPath();
            g.moveTo(OX + Math.cos(a) * S * .04, OY + Math.sin(a) * S * .04);
            g.lineTo(OX + Math.cos(a) * S * 1.6, OY + Math.sin(a) * S * 1.6);
            g.stroke();
        }

        /* Concentric arc rings */
        for (let r = .14; r < 1.9; r += .115) {
            g.beginPath();
            g.ellipse(OX, OY, r * S, r * S * .88, 0, Math.PI * .1, Math.PI * .9);
            g.stroke();
        }

        /* Eyes — classic angular Spider-Man tear-drop shape */
        [
            { cx: S * .285, cy: S * .41, flip: false },
            { cx: S * .715, cy: S * .41, flip: true },
        ].forEach(({ cx, cy, flip }) => {
            g.save();
            g.translate(cx, cy);
            if (flip) g.scale(-1, 1);

            /* Build angular teardrop path */
            const W = S * .18, H = S * .115;
            g.beginPath();
            g.moveTo(W * .05, 0);                              // inner tip
            g.bezierCurveTo(0, -H * .4, -W * .3, -H, -W * .7, -H); // top-inner arc
            g.bezierCurveTo(-W * 1.05, -H, -W * 1.2, -H * .4, -W * 1.2, 0);  // outer top → middle
            g.bezierCurveTo(-W * 1.2, H * .4, -W * .9, H * .7, -W * .4, H * .4); // outer → bottom-out
            g.bezierCurveTo(-W * .2, H * .2, W * .0, H * .05, W * .05, 0);     // bottom-in → tip

            /* Fill with white-silver gradient */
            const eg = g.createLinearGradient(-W * 1.2, -H, 0, H);
            eg.addColorStop(0, '#f5f5f5');
            eg.addColorStop(1, '#b0b0b0');
            g.fillStyle = eg;
            g.fill();

            /* Outer glow / shadow */
            g.strokeStyle = 'rgba(0,0,0,.9)';
            g.lineWidth = S * .004;
            g.stroke();

            /* Inner shine */
            g.beginPath();
            g.ellipse(-W * .55, -H * .25, W * .28, H * .22, .3, 0, Math.PI * 2);
            g.fillStyle = 'rgba(255,255,255,.55)';
            g.fill();

            g.restore();
        });

        /* Subtle seam line down nose bridge */
        g.beginPath();
        g.moveTo(S * .5, S * .32);
        g.lineTo(S * .5, S * .68);
        g.strokeStyle = 'rgba(0,0,0,.3)';
        g.lineWidth = S * .002;
        g.stroke();

        return new THREE.CanvasTexture(cv);
    }


    /* ── 2. Three.js Scene ──────────────────────────────────────── */
    const canvas = document.getElementById('mask-canvas');
    const cW = canvas.offsetWidth || 268;
    const cH = canvas.offsetHeight || 236;

    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,     // transparent background → photo shows through
        antialias: true,
    });
    renderer.setSize(cW, cH);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    /* Clip the sphere so only the front hemisphere is visible */
    renderer.localClippingEnabled = true;
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.15);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, cW / cH, 0.1, 100);
    camera.position.z = 3.2;


    /* ── 3. Build the 3D mask mesh ──────────────────────────────── */
    const maskTexture = buildSpiderManTexture();

    const geometry = new THREE.SphereGeometry(
        1,    // radius
        64,   // widthSegments
        64    // heightSegments
    );

    const material = new THREE.MeshStandardMaterial({
        map: maskTexture,
        transparent: true,
        opacity: 0,        // GSAP will animate this to 1
        clippingPlanes: [clipPlane],
        clipShadows: true,
        side: THREE.FrontSide,
        roughness: 0.55,
        metalness: 0.15,
    });

    const maskMesh = new THREE.Mesh(geometry, material);
    /* Shape it more like a face than a perfect sphere */
    maskMesh.scale.set(1.0, 1.22, 0.62);
    scene.add(maskMesh);


    /* ── 4. Lighting ────────────────────────────────────────────── */
    scene.add(new THREE.AmbientLight(0xffffff, 0.40));

    const redLight = new THREE.PointLight(0xff0000, 3.5, 10);
    redLight.position.set(2, 2, 3);
    scene.add(redLight);

    const rimLight = new THREE.PointLight(0x4422ff, 1.2, 8);
    rimLight.position.set(-2, 1, -1);   // rim from behind-left = cinematic depth
    scene.add(rimLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.5);
    topLight.position.set(0, 5, 3);
    scene.add(topLight);


    /* ── 5. GSAP Timeline (from the Roadmap) ───────────────────── */

    /* First: animate the page UI in */
    const pageTL = gsap.timeline({ defaults: { ease: 'power4.out' } });
    pageTL
        .to('#nav', { opacity: 1, y: 0, duration: 1.0 }, 0.3)
        .to('#role', { opacity: 1, x: 0, duration: .9 }, 0.8)
        .to('#h1a', { opacity: 1, y: 0, skewX: 0, duration: .8 }, 1.1)
        .to('#h1b', { opacity: 1, y: 0, skewX: 0, duration: .8 }, 1.45)
        .to('#desc', { opacity: 1, y: 0, duration: .7 }, 1.85)
        .to('#cta', { opacity: 1, y: 0, duration: .7 }, 2.1)
        .to('#photo-card', { opacity: 1, y: 0, scale: 1, duration: 1.2, ease: 'power3.out' }, 0.6)
        .to('.card-tag', { opacity: 1, duration: .5 }, 1.8)
        .to('#foot', { opacity: 1, y: 0, duration: .7 }, 2.4);

    /* Then: Spider-Man mask reveal (from the Roadmap steps) */
    const maskTL = gsap.timeline({ delay: 2.0 });

    // Step 1 – Mask fades in
    maskTL.to(material, {
        opacity: 1,
        duration: 0.8,
        ease: 'power2.out'
    })

        // Step 2 – Elastic scale-up (feeling of mask being worn/stretched)
        .from(maskMesh.scale, {
            x: 0.25, y: 0.25, z: 0.25,
            duration: 1.3,
            ease: 'elastic.out(1, 0.5)',
        }, '<0.15')

        // Step 3 – Comes in from the side (3D rotation reveal, exactly like roadmap)
        .from(maskMesh.rotation, {
            y: -Math.PI / 2,
            duration: 1.6,
            ease: 'power3.out',
        }, '<')

        // Step 4 – Red light pulse (mask "activating")
        .to(redLight, {
            intensity: 8,
            duration: 0.25,
            yoyo: true,
            repeat: 5,
            ease: 'power1.inOut',
        }, '-=0.4')

        // Step 5 – Continuous idle mask morph: mask disappears and reappears
        .to(material, {
            opacity: 0,
            duration: 1.8,
            ease: 'power2.inOut',
            delay: 2.0,
            repeat: -1,
            yoyo: true,
            repeatDelay: 1.5,
        });


    /* ── 6. Mouse Parallax — mask follows mouse (roadmap step 6) ── */
    const canvasRect = canvas.getBoundingClientRect();

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);

        // GSAP smooth 3D rotation (exactly like roadmap)
        gsap.to(maskMesh.rotation, {
            y: dx * 0.45,
            x: -dy * 0.30,
            duration: 0.8,
            ease: 'power2.out',
        });

        // Light follows mouse too (more dramatic)
        gsap.to(redLight.position, {
            x: dx * 3,
            y: dy * -2,
            duration: 0.6,
            ease: 'power2.out',
        });
    });

    /* Reset when mouse leaves the canvas */
    canvas.addEventListener('mouseleave', () => {
        gsap.to(maskMesh.rotation, {
            x: 0, y: 0.0,
            duration: 1.2,
            ease: 'elastic.out(1, .6)',
        });
    });


    /* ── 7. Render Loop ──────────────────────────────────────────── */
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        const t = clock.getElapsedTime();

        // Gentle breathing rotation (idle when no mouse)
        maskMesh.rotation.y += (0 - maskMesh.rotation.y) * 0.005
            + Math.sin(t * 0.4) * 0.003;

        // Pulsing rim light
        rimLight.intensity = 0.8 + Math.sin(t * 1.2) * 0.4;

        renderer.render(scene, camera);
    }
    animate();


    /* ── Resize ──────────────────────────────────────────────────── */
    window.addEventListener('resize', () => {
        const W = canvas.offsetWidth;
        const H = canvas.offsetHeight;
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
        renderer.setSize(W, H);
    });

})();
