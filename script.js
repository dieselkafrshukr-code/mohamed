const container = document.getElementById('canvas-container');

const scene = new THREE.Scene();

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// WebGL Renderer settings
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // optimize performance
container.appendChild(renderer.domElement);

// Load User's image
const textureLoader = new THREE.TextureLoader();
// Using the image found in the parent directory!
const imgUrl = '../21.jpeg';
const texture = textureLoader.load(imgUrl, function(tex) {
    // Adjust aspect ratio based on loaded image
    const aspect = tex.image.width / tex.image.height;
    // Plane size logic
    // We want the image to look large, like a portrait
    plane.scale.set(6, 6 / aspect, 1);
});

texture.minFilter = THREE.LinearFilter;
texture.magFilter = THREE.LinearFilter;
texture.format = THREE.RGBFormat;

// GLSL Vertex Shader
const vertexShader = `
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform float uHover;
    void main() {
        vUv = uv;
        vec3 pos = position;
        
        // Slight wave based on time and mouse
        float dist = distance(vUv, uMouse);
        pos.z += sin(dist * 10.0 - uTime * 2.0) * 0.1 * uHover;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

// GLSL Fragment Shader for the "Venom Spread" and 3D Glitch
const fragmentShader = `
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform float uHover;

    // Simplex 2D noise
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v){
        const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }
    
    void main() {
        vec2 p = vUv;
        
        // Procedural noise for the symbiote spread
        float noise = snoise(p * 6.0 + uTime * 0.5);
        
        // Create an organic circle mask from the mouse position
        float dist = distance(p, uMouse);
        float spread = smoothstep(0.4, 0.1, dist + noise * 0.05) * uHover;
        
        // Displace the image based on the spread
        p.x += spread * noise * 0.03;
        p.y += spread * noise * 0.03;
        
        // RGB Glitch shift for maximum "cyber / venom" vibe
        vec4 colorR = texture2D(uTexture, p + vec2(0.01 * spread, 0.0));
        vec4 colorG = texture2D(uTexture, p);
        vec4 colorB = texture2D(uTexture, p - vec2(0.01 * spread, 0.0));
        
        vec4 texColor = vec4(colorR.r, colorG.g, colorB.b, 1.0);
        
        // The dark corrupted red/black "venom" look
        // Darken everything, keep strong reds
        vec4 corruptedColor = vec4(colorR.r * 1.5, colorG.g * 0.1, colorB.b * 0.1, 1.0);
        corruptedColor = mix(corruptedColor, vec4(0.02, 0.0, 0.0, 1.0), 0.5); // make it very dark
        
        // Final mix
        vec4 finalColor = mix(texColor, corruptedColor, spread);
        
        gl_FragColor = finalColor;
    }
`;

// Single plane 
const planeGeometry = new THREE.PlaneGeometry(1, 1, 64, 64);
const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
        uTexture: { value: texture },
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uHover: { value: 0 }
    },
    transparent: true,
});

const plane = new THREE.Mesh(planeGeometry, material);
scene.add(plane);

// Mouse interactions
let mouse = new THREE.Vector2(0.5, 0.5);
let targetMouse = new THREE.Vector2(0.5, 0.5);
let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;

window.addEventListener('mousemove', (e) => {
    // Parallax logic for rotation
    const mouseX = (e.clientX - windowHalfX);
    const mouseY = (e.clientY - windowHalfY);
    
    gsap.to(plane.rotation, {
        x: (mouseY / windowHalfY) * 0.15,
        y: (mouseX / windowHalfX) * 0.15,
        duration: 1.5,
        ease: "power2.out"
    });

    // Uniform mouse logic for shaders (0 to 1)
    targetMouse.x = e.clientX / window.innerWidth;
    targetMouse.y = 1.0 - (e.clientY / window.innerHeight); // Invert Y for UV
});

// Touch interactions for mobile/tablets
window.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    targetMouse.x = touch.clientX / window.innerWidth;
    targetMouse.y = 1.0 - (touch.clientY / window.innerHeight);
});

container.addEventListener('mouseenter', () => {
    gsap.to(material.uniforms.uHover, {
        value: 1,
        duration: 1.2,
        ease: "power3.out"
    });
});

container.addEventListener('mouseleave', () => {
    gsap.to(material.uniforms.uHover, {
        value: 0,
        duration: 2.0,
        ease: "power3.out"
    });
});

// Handle window resize
window.addEventListener('resize', () => {
    windowHalfX = window.innerWidth / 2;
    windowHalfY = window.innerHeight / 2;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Intro Animation via GSAP
gsap.from(".background-text .line", {
    y: 100,
    opacity: 0,
    duration: 1.5,
    stagger: 0.1,
    ease: "power4.out",
    delay: 0.2
});

gsap.from(plane.position, {
    y: -5,
    z: -10,
    opacity: 0,
    duration: 2.5,
    ease: "power4.out",
    delay: 0.8
});

gsap.from(".overlay-content > *", {
    y: 50,
    opacity: 0,
    duration: 1.5,
    stagger: 0.2,
    ease: "power4.out",
    delay: 1.5
});

// Render loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    material.uniforms.uTime.value = clock.getElapsedTime();
    
    // Lerp mouse for smooth shader interaction
    mouse.x += (targetMouse.x - mouse.x) * 0.1;
    mouse.y += (targetMouse.y - mouse.y) * 0.1;
    material.uniforms.uMouse.value.set(mouse.x, mouse.y);
    
    renderer.render(scene, camera);
}

animate();
