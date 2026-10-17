/**
 * Probe: a física do Ammo é determinística o
 * suficiente para dois clientes simularem a MESMA rolagem a partir de uma
 * semente, ou o dado precisa ser fixado no resultado do emissor?
 *
 * Não é um teste do app — é um experimento descartável, rodado com
 * `node scripts/probe-ammo-determinism.cjs`, que responde à pergunta antes
 * de escrever a camada de rede.
 *
 * Mede dois regimes separadamente, porque falham por motivos diferentes:
 *  A) mesmo timestep nos dois lados  → o determinismo do solver em si
 *  B) timesteps diferentes (framerate diferente entre máquinas, que é o
 *     caso REAL: o Babylon roda a física no render loop)
 */
const Ammo = require("ammo.js/builds/ammo.js");

const GRAVITY = -98; // o mesmo valor que DiceInteraction.tsx usa
const STEPS = 240;

/** Gerador determinístico, para os dois lados partirem do mesmo "aleatório". */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(ammo, seed, timesteps) {
  const allocated = [];
  const collisionConfiguration = new ammo.btDefaultCollisionConfiguration();
  const dispatcher = new ammo.btCollisionDispatcher(collisionConfiguration);
  const broadphase = new ammo.btDbvtBroadphase();
  const solver = new ammo.btSequentialImpulseConstraintSolver();
  const world = new ammo.btDiscreteDynamicsWorld(
    dispatcher,
    broadphase,
    solver,
    collisionConfiguration
  );
  world.setGravity(new ammo.btVector3(0, GRAVITY, 0));

  // Chão + 4 paredes, como DiceTray.loadWalls() cria em código.
  function addBox(hx, hy, hz, x, y, z, mass) {
    const shape = new ammo.btBoxShape(new ammo.btVector3(hx, hy, hz));
    const transform = new ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new ammo.btVector3(x, y, z));
    const motionState = new ammo.btDefaultMotionState(transform);
    const inertia = new ammo.btVector3(0, 0, 0);
    if (mass > 0) {
      shape.calculateLocalInertia(mass, inertia);
    }
    const info = new ammo.btRigidBodyConstructionInfo(
      mass,
      motionState,
      shape,
      inertia
    );
    const body = new ammo.btRigidBody(info);
    body.setFriction(4);
    world.addRigidBody(body);
    // Ammo é WASM: nada aqui é coletado pelo GC do JS. Sem destruir no fim
    // de cada simulação, o loop de 120 rodadas da etapa H estoura o heap
    // do Emscripten com `abort(OOM)` — foi o que aconteceu na primeira
    // execução.
    allocated.push(body, info, motionState, shape, inertia, transform);
    return body;
  }

  addBox(25, 25, 25, 0, -25 + 0.32, 0, 0); // ground
  addBox(25, 25, 25, 0, 0, -34.5, 0); // wall top
  addBox(25, 25, 25, 0, 0, 34.5, 0); // wall bottom
  addBox(25, 25, 25, -29.5, 0, 0, 0); // wall right
  addBox(25, 25, 25, 29.5, 0, 0, 0); // wall left

  // Três "dados" com a massa que Dice.getDicePhysicalProperties usa e o
  // MESMO impulso que Dice.roll aplica de verdade (600..800 — a primeira
  // versão deste probe usou mass*12, ~2 ordens de grandeza a menos, e os
  // dados praticamente não giraram: medir determinismo numa simulação
  // mansa não responde nada sobre o caso real).
  const MIN_SPEED = 600;
  const MAX_SPEED = 800;
  const random = mulberry32(seed);
  const dice = [];
  for (const mass of [10, 6, 8]) {
    const body = addBox(
      0.5,
      0.5,
      0.5,
      random() * 2 - 1,
      8 + dice.length * 2,
      random() * 2 - 1,
      mass
    );
    // Giro inicial aleatório, como o addRotation de Dice.roll.
    const spinAxis = new ammo.btVector3(
      random() * 2 - 1,
      random() * 2 - 1,
      random() * 2 - 1
    );
    body.setAngularVelocity(spinAxis);
    const speed = MIN_SPEED + random() * (MAX_SPEED - MIN_SPEED);
    const dirX = random() * 2 - 1;
    const dirZ = random() * 2 - 1;
    const len = Math.hypot(dirX, dirZ) || 1;
    body.applyCentralImpulse(
      new ammo.btVector3((dirX / len) * speed, 0, (dirZ / len) * speed)
    );
    dice.push(body);
  }

  const startTransform = new ammo.btTransform();
  const start = dice.map((body) => {
    body.getMotionState().getWorldTransform(startTransform);
    const o = startTransform.getOrigin();
    return { x: o.x(), y: o.y(), z: o.z() };
  });

  // Soma o giro acumulado ao longo de toda a queda, não só o início-vs-fim:
  // um dado pode parar na mesma face depois de girar muito, e é o giro
  // acumulado que diz se a trajetória foi caótica.
  const spinPath = dice.map(() => 0);
  const prev = dice.map(() => null);
  const probeTransform = new ammo.btTransform();
  for (const dt of timesteps) {
    world.stepSimulation(dt, 10, 1 / 60);
    for (let i = 0; i < dice.length; i += 1) {
      dice[i].getMotionState().getWorldTransform(probeTransform);
      const q = probeTransform.getRotation();
      const cur = [q.x(), q.y(), q.z(), q.w()];
      if (prev[i]) {
        const dot = Math.abs(
          prev[i][0] * cur[0] +
            prev[i][1] * cur[1] +
            prev[i][2] * cur[2] +
            prev[i][3] * cur[3]
        );
        spinPath[i] += (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
      }
      prev[i] = cur;
    }
  }

  const transform = new ammo.btTransform();
  const result = dice.map((body, i) => {
    body.getMotionState().getWorldTransform(transform);
    const o = transform.getOrigin();
    const q = transform.getRotation();
    return {
      pos: [o.x(), o.y(), o.z()],
      rot: [q.x(), q.y(), q.z(), q.w()],
      // Diagnóstico de validade do probe: se os dados não viajaram e não
      // giraram, a simulação não é caótica e medir "determinismo" nela não
      // responde nada sobre o caso real.
      travel: Math.hypot(o.x() - start[i].x, o.z() - start[i].z),
      spin: spinPath[i],
      asleep: body.isActive() === false,
    };
  });

  for (const body of dice) {
    world.removeRigidBody(body);
  }
  for (const obj of allocated) {
    ammo.destroy(obj);
  }
  ammo.destroy(transform);
  ammo.destroy(startTransform);
  ammo.destroy(probeTransform);
  ammo.destroy(world);
  ammo.destroy(solver);
  ammo.destroy(broadphase);
  ammo.destroy(dispatcher);
  ammo.destroy(collisionConfiguration);

  return result;
}

/** Maior diferença angular (graus) entre as duas simulações. */
function worstAngle(a, b) {
  let worst = 0;
  for (let i = 0; i < a.length; i += 1) {
    const dot = Math.abs(
      a[i].rot[0] * b[i].rot[0] +
        a[i].rot[1] * b[i].rot[1] +
        a[i].rot[2] * b[i].rot[2] +
        a[i].rot[3] * b[i].rot[3]
    );
    const angle = (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
    worst = Math.max(worst, angle);
  }
  return worst;
}

function worstPos(a, b) {
  let worst = 0;
  for (let i = 0; i < a.length; i += 1) {
    for (let k = 0; k < 3; k += 1) {
      worst = Math.max(worst, Math.abs(a[i].pos[k] - b[i].pos[k]));
    }
  }
  return worst;
}

Ammo().then((ammo) => {
  const fixed = new Array(STEPS).fill(1 / 60);

  // A) Mesmo timestep nos dois lados.
  const a1 = simulate(ammo, 1234, fixed);
  const a2 = simulate(ammo, 1234, fixed);
  console.log("VALIDADE DO PROBE (a simulação é caótica?):");
  for (const d of a1) {
    console.log(
      `   dado: viajou ${d.travel.toFixed(2)} un, girou ${d.spin.toFixed(0)} graus acumulados, dormiu=${d.asleep}`
    );
  }
  console.log("");
  console.log("A) mesmo timestep, mesma seed:");
  console.log("   posição  (pior delta):", worstPos(a1, a2).toExponential(3));
  console.log("   rotação  (pior ângulo):", worstAngle(a1, a2).toFixed(6), "graus");

  // B) Timesteps diferentes — 60fps vs 58fps com jitter, o caso real.
  const jittered = [];
  const jitter = mulberry32(99);
  let budget = STEPS / 60;
  while (budget > 0) {
    const dt = 1 / (58 + jitter() * 4);
    jittered.push(dt);
    budget -= dt;
  }
  const b1 = simulate(ammo, 1234, fixed);
  const b2 = simulate(ammo, 1234, jittered);
  console.log("B) timestep diferente (60fps vs ~58fps com jitter):");
  console.log("   posição  (pior delta):", worstPos(b1, b2).toFixed(4));
  console.log("   rotação  (pior ângulo):", worstAngle(b1, b2).toFixed(2), "graus");

  // C) Tempo total DIFERENTE. Este é o caso que B não cobre: o Bullet
  // acumula o tempo sobrando internamente e só avança em substeps de
  // 1/60, então dois clientes com framerates diferentes mas o MESMO tempo
  // total decorrido executam exatamente os mesmos substeps — foi isso que
  // deu delta zero em B. O risco real é o tempo total não casar (um
  // cliente começa a animar alguns ms depois, ou perde um frame).
  const shorter = new Array(STEPS - 7).fill(1 / 60);
  const c2 = simulate(ammo, 1234, shorter);
  console.log("C) tempo total diferente (7 frames a menos):");
  console.log("   posição  (pior delta):", worstPos(a1, c2).toFixed(4));
  console.log("   rotação  (pior ângulo):", worstAngle(a1, c2).toFixed(2), "graus");

  // D) Engasgo no meio do voo: um frame de 150ms (GC, troca de janela) no
  // meio da queda, com o mesmo tempo total.
  const stutter = new Array(STEPS).fill(1 / 60);
  stutter.splice(30, 9, 0.15);
  const d2 = simulate(ammo, 1234, stutter);
  console.log("D) engasgo de 150ms no meio (mesmo tempo total):");
  console.log("   posição  (pior delta):", worstPos(a1, d2).toFixed(4));
  console.log("   rotação  (pior ângulo):", worstAngle(a1, d2).toFixed(2), "graus");

  // E) Travamento LONGO: 800ms num frame (alt-tab, GC pesado, janela
  // minimizada). Este é o caso que pode quebrar de verdade: o Bullet é
  // chamado com maxSubSteps=10, então um frame que precise de mais de
  // 10 substeps (>166ms a 1/60) tem o tempo excedente DESCARTADO — a
  // simulação desse cliente anda menos que a do outro e divergem.
  const bigStall = new Array(STEPS).fill(1 / 60);
  bigStall.splice(25, 48, 0.8);
  const e2 = simulate(ammo, 1234, bigStall);
  console.log("E) travamento de 800ms num frame (excede maxSubSteps=10):");
  console.log("   posição  (pior delta):", worstPos(a1, e2).toFixed(4));
  console.log("   rotação  (pior ângulo):", worstAngle(a1, e2).toFixed(2), "graus");
  console.log(
    "   dados dormiram nos dois lados?",
    a1.every((d) => d.asleep) && e2.every((d) => d.asleep)
  );

  // F) Mesma coisa, mas medindo ANTES de os dados dormirem (90 frames):
  // separa "convergiu porque a física é determinística" de "convergiu
  // porque todo mundo já tinha parado no mesmo lugar".
  const midA = simulate(ammo, 1234, new Array(90).fill(1 / 60));
  const midStall = new Array(90).fill(1 / 60);
  midStall.splice(25, 48, 0.8);
  const midB = simulate(ammo, 1234, midStall);
  console.log("F) mesmo travamento, medido em pleno voo (90 frames):");
  console.log("   dormiram?", midA.every((d) => d.asleep));
  console.log("   posição  (pior delta):", worstPos(midA, midB).toFixed(4));
  console.log("   rotação  (pior ângulo):", worstAngle(midA, midB).toFixed(2), "graus");

  // G) CONTROLE — seeds diferentes: confirma que a métrica detecta
  // divergência de verdade em vez de sempre medir ~0.
  const g2 = simulate(ammo, 5678, fixed);
  console.log("G) CONTROLE — seeds diferentes:");
  console.log("   posição  (pior delta):", worstPos(a1, g2).toFixed(4));
  console.log("   rotação  (pior ângulo):", worstAngle(a1, g2).toFixed(2), "graus");

  // H) A PERGUNTA QUE DECIDE A ARQUITETURA: a FACE final pode divergir?
  //
  // E/F mostraram que a trajetória DIVERGE em pleno voo (66 graus) mas o
  // repouso converge. Um único caso não basta: se em alguma semente a
  // divergência transitória levar a um repouso em face diferente, o
  // resultado deixa de ser confiável e o dado TEM de ser fixado no valor
  // do emissor. 60 sementes, cada uma com e sem travamento longo.
  console.log("");
  console.log("H) a face final diverge? (60 sementes, com/sem travamento)");
  let faceMismatches = 0;
  let worstRestAngle = 0;
  let worstRestPos = 0;
  for (let seed = 1; seed <= 60; seed += 1) {
    const clean = simulate(ammo, seed, fixed);
    const stalled = new Array(STEPS).fill(1 / 60);
    stalled.splice(20 + (seed % 30), 48, 0.8);
    const stalledRun = simulate(ammo, seed, stalled);
    worstRestAngle = Math.max(worstRestAngle, worstAngle(clean, stalledRun));
    worstRestPos = Math.max(worstRestPos, worstPos(clean, stalledRun));
    // "Face" = qual eixo local aponta mais para cima, que é exactly como
    // helpers/dice.ts's getDiceInstanceRoll decide o valor lido.
    for (let i = 0; i < clean.length; i += 1) {
      if (upAxis(clean[i].rot) !== upAxis(stalledRun[i].rot)) {
        faceMismatches += 1;
      }
    }
  }
  console.log("   faces divergentes:", faceMismatches, "de 180 dados");
  console.log("   pior ângulo no repouso:", worstRestAngle.toFixed(2), "graus");
  console.log("   pior posição no repouso:", worstRestPos.toFixed(4));
});

/**
 * Qual eixo local aponta mais para cima — a mesma decisão que
 * helpers/dice.ts's getDiceInstanceRoll toma para ler o valor do dado
 * (ele escolhe o locator de maior produto escalar com Vector3.Up).
 */
function upAxis(q) {
  const [x, y, z, w] = q;
  // Linhas da matriz de rotação, para projetar cada eixo local em +Y.
  const axes = [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < 3; i += 1) {
    for (const sign of [1, -1]) {
      const dot = sign * axes[i][1];
      if (dot > bestDot) {
        bestDot = dot;
        best = i * 2 + (sign > 0 ? 0 : 1);
      }
    }
  }
  return best;
}
