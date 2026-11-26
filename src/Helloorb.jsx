import React, { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * HelloOrb – a glossy gradient 3D orb with glowing eyes and a speech bubble.
 *
 * Props
 *  size        – width/height of the component in px (default 280)
 *  message     – text in the speech bubble; pass "" to hide it (default "Hello!")
 *  draggable   – let the user rotate the orb by dragging (default true)
 *  followMouse – orb and eyes lean slightly toward the cursor (default true)
 *  mood        – "idle" | "thinking" | "happy" (default "idle")
 *
 * Behaviour: looks around on its own, follows the cursor, blinks, wiggles now and
 * then, grows its eyes on hover, squashes and hops when clicked, keeps spinning a
 * little after a drag. Idle motion is skipped if the user prefers reduced motion.
 *
 * Install:  npm install three
 */

const VERT = `
varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  vP = normalize(position);
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec3 vP; varying vec3 vN; varying vec3 vV;
uniform vec3 uE0; uniform vec3 uE1; uniform float uGlow;
float w(vec3 p, vec3 c, float k){ vec3 d = p - normalize(c); return exp(-k * dot(d, d)); }
void main(){
  vec3 p = normalize(vP);
  vec3 cPink = vec3(.98,.55,.82), cMag = vec3(.78,.10,.45), cOra = vec3(1.,.50,.22);
  vec3 cBlue = vec3(.30,.28,.78), cLav = vec3(.78,.62,.98), cWhite = vec3(1.,.93,.97);
  float a = w(p, vec3(-.6,.8,.4), 2.2) * 1.3;
  float b = w(p, vec3(.05,.1,1.), 1.6);
  float c = w(p, vec3(-.4,-.75,.55), 3.4) * 1.3;
  float d = w(p, vec3(.95,.3,.15), 3.0) * 1.3;
  float e = w(p, vec3(.55,-.65,.5), 3.4);
  float f = w(p, vec3(-1.,.0,.1), 2.5);
  float s = a + b*1.4 + c + d + e + f + .001;
  vec3 col = (cWhite*a + cMag*b*1.4 + cOra*c + cBlue*d + cLav*e + cPink*f) / s;
  float back = smoothstep(-.2, -1., p.z);
  col = mix(col, vec3(.62,.2,.55), back * .35);
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  float fr = pow(1. - max(dot(n, v), 0.), 2.6);
  col = mix(col, vec3(1.), fr * .38);
  vec3 l = normalize(vec3(-.5,.7,.8)); vec3 h = normalize(l + v);
  col += vec3(1.) * pow(max(dot(n, h), 0.), 90.) * .12;
  col += .06 * max(dot(n, l), 0.);
  vec3 d0 = p - uE0; vec3 d1 = p - uE1;
  float gl = exp(-70. * dot(d0, d0)) + exp(-70. * dot(d1, d1));
  col += vec3(1., .78, .96) * gl * .42 * uGlow;
  gl_FragColor = vec4(col, 1.);
}`;

function eyeShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.5);
  s.bezierCurveTo(0.12, 0.3, 0.38, -0.15, 0.4, -0.38);
  s.bezierCurveTo(0.4, -0.52, 0.28, -0.55, 0.16, -0.5);
  s.quadraticCurveTo(0, -0.4, -0.16, -0.5);
  s.bezierCurveTo(-0.28, -0.55, -0.4, -0.52, -0.4, -0.38);
  s.bezierCurveTo(-0.38, -0.15, -0.12, 0.3, 0, 0.5);
  return s;
}

function radialTexture(stops, px = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  stops.forEach(([o, col]) => r.addColorStop(o, col));
  g.fillStyle = r;
  g.fillRect(0, 0, px, px);
  return new THREE.CanvasTexture(c);
}

export default function HelloOrb({
  size = 280,
  message = "Hello!",
  draggable = true,
  followMouse = true,
  mood = "idle",
}) {
  const canvasRef = useRef(null);
  const bubbleRef = useRef(null);
  const moodRef = useRef(mood);
  useEffect(() => { moodRef.current = mood; }, [mood]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size, size, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, -0.1, 6.9);

    const orb = new THREE.Group();
    scene.add(orb);

    const disposables = [];
    const track = (o) => (disposables.push(o), o);

    // Sphere
    const sphereMat = track(
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uE0: { value: new THREE.Vector3() },
          uE1: { value: new THREE.Vector3() },
          uGlow: { value: 1 },
        },
      })
    );
    const sphere = new THREE.Mesh(
      track(new THREE.SphereGeometry(1.5, 96, 96)),
      sphereMat
    );
    orb.add(sphere);

    // Eyes + soft glow
    const eyeGeo = track(new THREE.ShapeGeometry(eyeShape(), 24));
    const eyeMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    const eyes = [-1, 1].map((sx) => {
      const grp = new THREE.Group();
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.scale.set(0.34, 0.34, 1);
      grp.add(eye);
      const pos = new THREE.Vector3(sx * 0.38, 0.2, 0);
      pos.z = Math.sqrt(1.5 * 1.5 - pos.x * pos.x - pos.y * pos.y) + 0.012;
      grp.position.copy(pos);
      grp.userData = { base: pos.clone(), sx };
      orb.add(grp);
      return grp;
    });

    // Floor glow
    const floorTex = track(
      radialTexture(
        [
          [0, "rgba(190,90,200,.40)"],
          [0.5, "rgba(190,110,210,.14)"],
          [1, "rgba(190,110,210,0)"],
        ],
        256
      )
    );
    const floor = new THREE.Mesh(
      track(new THREE.PlaneGeometry(3.8, 0.9)),
      track(new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }))
    );
    floor.rotation.x = -Math.PI / 2.4;
    floor.position.set(0, -1.85, 0);
    scene.add(floor);

    // Interaction + behaviour state
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let rotX = 0, rotY = 0, velY = 0, dragging = false, lx = 0, ly = 0;
    let downX = 0, downY = 0, downT = 0;
    let mx = 0, my = 0, lastMouse = -999, hover = false;
    let jy = 0, jv = 0, sq = 0, sv = 0;          // hop + squash spring
    let wiggleT = -1, nextWiggle = 5, nextHop = 0;
    let lookX = 0, lookY = 0, tgtX = 0, tgtY = 0, nextGlance = 1.5;
    let blinkReq = false;
    const R = 1.5;
    const tmpN = new THREE.Vector3(), tmpM = new THREE.Matrix4();
    const ZERO = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

    const poke = () => {
      if (jy <= 0.001) jv = 3.2;
      blinkReq = true;
    };

    const onDown = (e) => {
      downX = e.clientX; downY = e.clientY; downT = performance.now();
      if (!draggable) return;
      dragging = true;
      lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx;
      rotY += dx * 0.01;
      velY = dx * 0.01;
      rotX += (e.clientY - ly) * 0.01;
      rotX = Math.max(-1.2, Math.min(1.2, rotX));
      lx = e.clientX; ly = e.clientY;
    };
    const onUp = (e) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 6 && performance.now() - downT < 400) { poke(); velY = 0; }
      dragging = false;
    };
    const onCancel = () => { dragging = false; };
    const onEnter = () => { hover = true; };
    const onLeave = () => { hover = false; };
    const onWindowMove = (e) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
      lastMouse = performance.now() / 1000;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerenter", onEnter);
    canvas.addEventListener("pointerleave", onLeave);
    if (followMouse) window.addEventListener("pointermove", onWindowMove);

    // Animation loop
    let t = 0, last = performance.now() / 1000, nextBlink = 2, raf = 0;
    const tick = () => {
      const nowS = performance.now() / 1000;
      const dt = Math.min(nowS - last, 0.05);
      last = nowS;
      t += dt;
      const m = moodRef.current;

      // Spin: inertia after a drag, then ease back to face the viewer
      if (!dragging) {
        rotY += velY;
        velY *= 0.94;
        const target = Math.round(rotY / (Math.PI * 2)) * Math.PI * 2 + mx * 0.25;
        rotY += (target - rotY) * 0.04;
        rotX += (my * 0.15 - rotX) * 0.04;
      }
      orb.rotation.y = rotY;
      orb.rotation.x = rotX;

      // Hop + squash
      if (m === "happy" && !reduce && jy === 0 && sq < 0.02 && t > nextHop) {
        jv = 2.4;
        nextHop = t + 1.1;
      }
      jv -= 14 * dt;
      jy += jv * dt;
      if (jy < 0) {
        if (jv < -1) { sq = Math.min(0.3, -jv * 0.07); sv = 0; }
        jy = 0;
        jv = 0;
      }
      sv += (-120 * sq - 9 * sv) * dt;
      sq += sv * dt;
      const stretch = jy > 0 ? Math.min(0.12, Math.abs(jv) * 0.03) : 0;
      const breath = Math.sin(t * 2) * 0.012;
      const sy = 1 - sq + stretch + breath;
      const sxz = 1 + sq * 0.5 - stretch * 0.4 - breath * 0.5;
      orb.scale.set(sxz, sy, sxz);

      const bob = Math.sin(t * 1.4) * 0.08;
      orb.position.y = bob + jy;
      floor.scale.setScalar(Math.max(0.6, 1 - jy * 0.15));

      // Wiggle / thinking tilt
      if (!reduce && m === "idle" && !dragging && t > nextWiggle) {
        wiggleT = t;
        nextWiggle = t + 7 + Math.random() * 6;
      }
      let rz = 0;
      if (wiggleT >= 0) {
        const k = (t - wiggleT) / 0.9;
        if (k < 1) rz = Math.sin(k * Math.PI * 6) * 0.14 * (1 - k);
        else wiggleT = -1;
      }
      if (m === "thinking") rz = Math.sin(t * 1.6) * 0.07;
      orb.rotation.z += (rz - orb.rotation.z) * 0.3;

      // Where the eyes look
      if (m === "thinking") {
        tgtX = Math.sin(t * 1.1) * 0.9;
        tgtY = 0.7;
      } else if (followMouse && nowS - lastMouse < 3) {
        tgtX = mx;
        tgtY = my * 0.8;
      } else if (!reduce && t > nextGlance) {
        tgtX = (Math.random() * 2 - 1) * 0.9;
        tgtY = (Math.random() * 2 - 1) * 0.6;
        nextGlance = t + 1.5 + Math.random() * 3.5;
      }
      const ease = Math.min(1, dt * 9);
      lookX += (tgtX - lookX) * ease;
      lookY += (tgtY - lookY) * ease;

      // Blink
      if (blinkReq) { nextBlink = t; blinkReq = false; }
      let blink = 1;
      if (t > nextBlink) {
        const k = (t - nextBlink) / 0.16;
        if (k < 1) blink = 1 - Math.sin(k * Math.PI) * 0.9;
        else nextBlink = t + 2.5 + Math.random() * 3;
      }

      // Apply eyes: position on the sphere, squint when happy, widen on hover
      const hs = hover ? 1.12 : 1;
      const ex = (m === "happy" ? 1.15 : 1) * hs;
      const ey = (m === "happy" ? 0.55 : blink) * hs;
      eyes.forEach((g, i) => {
        const x = g.userData.base.x + lookX * 0.2;
        const y = g.userData.base.y + lookY * 0.14;
        const z = Math.sqrt(R * R - x * x - y * y) + 0.014;
        g.position.set(x, y, z);
        tmpN.set(x, y, z).normalize();
        tmpM.lookAt(tmpN, ZERO, UP); // local-space: face straight out of the sphere
        g.quaternion.setFromRotationMatrix(tmpM);
        g.rotateZ(g.userData.sx * -0.08);
        g.scale.set(ex, ey, 1);
        (i === 0 ? sphereMat.uniforms.uE0 : sphereMat.uniforms.uE1).value.set(x, y, z).normalize();
      });
      sphereMat.uniforms.uGlow.value = m === "thinking" ? 0.65 + 0.35 * Math.sin(t * 5) : 1;

      if (bubbleRef.current) {
        bubbleRef.current.style.transform = `translateY(${-(bob + jy) * size * 0.16}px)`;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointermove", onWindowMove);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [size, draggable, followMouse]);

  const fs = Math.round(size * 0.075);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <style>{`
        @keyframes ho-pop { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: scale(1); } }
        .ho-bubble { animation: ho-pop .45s cubic-bezier(.2,1.6,.4,1) both; transform-origin: 90% 100%; }
        @media (prefers-reduced-motion: reduce) { .ho-bubble { animation: none; } }
      `}</style>
      <canvas
        ref={canvasRef}
        aria-label="Interactive 3D assistant orb. Click it or drag to rotate."
        style={{
          width: size,
          height: size,
          display: "block",
          touchAction: draggable ? "none" : "auto",
          cursor: draggable ? "grab" : "pointer",
        }}
      />
      {message && (
        <div
          ref={bubbleRef}
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
        >
          <div
            key={message}
            className="ho-bubble"
            style={{
              position: "relative",
              padding: `${fs * 0.55}px ${fs * 1.1}px`,
              background: "#fff",
              color: "#2b2b33",
              borderRadius: 999,
              fontSize: fs,
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
              boxShadow: "0 8px 28px rgba(80,60,120,.14)",
              whiteSpace: "nowrap",
            }}
          >
            {message}
            <span
              style={{
                position: "absolute",
                right: fs * 0.8,
                bottom: -fs * 0.35,
                width: fs * 0.8,
                height: fs * 0.8,
                background: "#fff",
                transform: "skewX(-20deg) rotate(35deg)",
                borderRadius: "0 0 4px 0",
                zIndex: -1,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}