import { useCallback, useEffect, useRef, useState } from "react";
import { Box } from "theme-ui";
import { Vector3 } from "@babylonjs/core/Maths/math";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Scene } from "@babylonjs/core";

import DiceInteraction from "./DiceInteraction";
import DiceArena from "../../dice/diceTray/DiceArena";
import Dice, { physicsInstanceOf } from "../../dice/Dice";

import { useDiceLoading } from "../../contexts/DiceLoadingContext";

import { getDiceRoll } from "../../helpers/dice";
import { disposeDiceMeshes } from "../../helpers/diceMeshCleanup";
import {
  DICE_TYPES,
  seededRandom,
  squareDiceRollExtents,
  visibleHalfExtents,
} from "../../helpers/diceRoll";
import type { DiceRollRequest } from "../../helpers/diceRoll";
import { dice as diceStyles } from "../../dice";

import useSetting from "../../hooks/useSetting";

import type { DiceMesh, DiceRoll } from "../../types/Dice";

/** Os mesmos valores da câmera de DiceInteraction — a arena é dimensionada
 * contra o que ela enquadra, então os dois têm de concordar. */
const CAMERA_HEIGHT = 50;
const CAMERA_FOV = 0.65;

type DiceRollLayerProps = {
  /** A rolagem a animar. Trocar o objeto (nova identidade) dispara um novo
   * arremesso; `null` limpa a cena. */
  request: DiceRollRequest | null;
  onDiceRollsChange: (rolls: DiceRoll[]) => void;
  /**
   * Dispara para QUALQUER rolagem que esta camada anima — a local
   * (`publishResults: true`) E a recebida de outro jogador
   * (`publishResults: false`) — só para alimentar a UI de exibição
   * (o cartão "ROLL / ... / DICE ROLL"). Diferente de `onDiceRollsChange`,
   * que continua restrito à rolagem local porque ele alimenta
   * `player_state.dice`: deixar uma rolagem remota passar por ali
   * sobrescreveria os dados do jogador que está só assistindo (ver
   * a nota em helpers/diceRoll.ts e na skill de sincronização). Sem este
   * callback separado, quem assiste a rolagem de outro (Jogador OU a
   * janela Espectador, que nem tem o painel de Jogadores para conferir o
   * total por outra via) via os dados caírem sem nunca saber o número.
   */
  onRollDisplay: (rolls: DiceRoll[]) => void;
  /** Serializa rolagens simultâneas: o dock só inicia a próxima depois que
   * todos os dados desta adormecerem. Sem isto, uma rolagem remota no meio
   * da local apagaria as meshes locais antes de seu resultado ser lido. */
  onRollComplete: (request: DiceRollRequest) => void;
  /** Falha de carga invalida a cena; o dock esvazia a fila para nenhum
   * pedido ficar preso esperando um `sceneReady` que nunca chegará. */
  onLoadError: (error: Error) => void;
  /**
   * Incrementar este número remove os dados que já pararam de rolar da
   * tela, fora do ciclo normal de "a próxima rolagem substitui a
   * anterior" — o dock chama isto ao reabrir a bandeja de seleção. NÃO
   * descarta uma rolagem ainda em voo (ver o guard dentro do efeito):
   * reabrir o painel enquanto os dados ainda caem não pode impedir o
   * `onRollComplete` que a fila espera para liberar o próximo pedido.
   * Para o botão "Limpar" do cartão de resultado, que precisa funcionar
   * mesmo em voo, use `forceClearToken` abaixo.
   */
  clearToken: number;
  /**
   * Incrementar este número SEMPRE limpa a cena imediatamente, mesmo que
   * a rolagem servida ainda não tenha sido marcada concluída pela física
   * (dados ainda jitterando/assentando) — é o que o botão "Limpar" do
   * cartão de resultado dispara. Diferente de `clearToken`, nunca adia:
   * se a rolagem servida ainda não completou, este efeito a completa
   * primeiro (chamando `onRollComplete` ele mesmo) antes de descartar as
   * meshes, para a fila nunca ficar presa esperando um `onRollComplete`
   * que o descarte precoce tornaria impossível de disparar naturalmente
   * (a malha some, `die.length` vai a 0, e o loop de render nunca mais
   * encontra `diceAwake === false` com dados para completar).
   *
   * Sem esta distinção, um clique em "Limpar" durante a janela de ~1s em
   * que os dados já mostram o número mas ainda não foram marcados
   * `asleep` (ver `update()`/`sleepTimeout`) caía no MESMO guard de
   * `clearToken` acima — a cena não era limpa, e o intervalo de 100ms que
   * publica resultados (`onRollDisplay`) ressuscitava o cartão no tick
   * seguinte, exigindo um SEGUNDO clique depois que a física enfim
   * marcasse a rolagem concluída por conta própria.
   */
  forceClearToken: number;
};

/**
 * Os dados caem sobre a PRÓPRIA GRID, no centro dela, em vez de numa
 * bandeja lateral.
 *
 * O que mudou em relação ao `DiceTrayOverlay` que isto substitui:
 * - **Sem bandeja visual.** Aqui só existe `DiceArena`, as caixas de
 *   colisão invisíveis — o fundo é o mapa, visto através do canvas (o
 *   `clearColor` do Babylon já era transparente).
 * - **Tamanho vem da vista, não de um par de constantes.** A arena é
 *   recalculada do tamanho real do canvas (`visibleHalfExtents`), senão um
 *   dado pararia fora da tela ou bateria numa parede invisível no meio do
 *   mapa.
 * - **Arremesso semeado.** `Dice.roll` recebe um RNG derivado da semente da
 *   rolagem, para a mesma rolagem parecer igual em dois clientes. O NÚMERO
 *   não depende disso: ele vem do `player_state.dice` do emissor.
 */
function DiceRollLayer({
  request,
  onDiceRollsChange,
  onRollDisplay,
  onRollComplete,
  onLoadError,
  clearToken,
  forceClearToken,
}: DiceRollLayerProps) {
  const sceneRef = useRef<Scene>();
  const shadowGeneratorRef = useRef<ShadowGenerator>();
  const arenaRef = useRef<DiceArena>();
  const diceRefs = useRef<DiceMesh[]>([]);
  const sceneDisposedRef = useRef(false);
  const sceneKeepAwakeRef = useRef(0);
  const canvasSizeRef = useRef({ width: 1, height: 1 });

  // A cena só fica pronta depois de um `await`; um pedido que chegue antes
  // disso fica pendurado aqui e é arremessado quando ela abrir, em vez de
  // ser silenciosamente perdido.
  const pendingRequestRef = useRef<DiceRollRequest | null>(null);
  const servedRequestRef = useRef<DiceRollRequest | null>(null);
  const completedRequestRef = useRef<DiceRollRequest | null>(null);
  const onRollCompleteRef = useRef(onRollComplete);

  onRollCompleteRef.current = onRollComplete;

  const { assetLoadStart, assetLoadFinish } = useDiceLoading();
  const [diceStyleKey] = useSetting<string>("dice.style");
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    sceneDisposedRef.current = false;
    return () => {
      sceneDisposedRef.current = true;
    };
  }, []);

  /** Mantém o render loop acordado por ~1s (o update sai cedo quando todos
   * os dados dormem, para não queimar GPU numa sessão longa). */
  const forceRender = useCallback(() => {
    sceneKeepAwakeRef.current += 1;
    const timeout = setTimeout(() => {
      sceneKeepAwakeRef.current -= 1;
    }, 1000);
    return () => clearTimeout(timeout);
  }, []);

  const clearDice = useCallback(() => {
    disposeDiceMeshes(diceRefs.current, shadowGeneratorRef.current);
    diceRefs.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearDice();
      arenaRef.current?.dispose();
      arenaRef.current = undefined;
      shadowGeneratorRef.current?.dispose();
      shadowGeneratorRef.current = undefined;
    };
  }, [clearDice]);

  const throwRequest = useCallback(
    (toThrow: DiceRollRequest) => {
      const scene = sceneRef.current;
      const arena = arenaRef.current;
      const shadowGenerator = shadowGeneratorRef.current;
      const style =
        diceStyles.find((d) => d.key === diceStyleKey) || diceStyles[0];
      if (!scene || !arena || !shadowGenerator) {
        return;
      }

      clearDice();
      completedRequestRef.current = null;
      const random = seededRandom(toThrow.seed);
      const created: DiceRoll[] = [];

      // DICE_ORDER, não Object.keys: a ordem de iteração decide quais
      // números o RNG semeado entrega a qual dado, então ela precisa ser
      // estável entre clientes. A ordem de chaves de um objeto vindo do
      // JSON não é garantia nenhuma.
      for (const type of DICE_TYPES) {
        const count = toThrow.counts[type] || 0;
        for (let i = 0; i < count; i += 1) {
          const instance = style.class.createInstance(type, scene);
          shadowGenerator.addShadowCaster(instance);
          Dice.roll(physicsInstanceOf(instance), arena.rollArea, random);
          const die: DiceMesh = { type, instance, asleep: false };
          if (type === "d100") {
            const d10Instance = style.class.createInstance("d10", scene);
            shadowGenerator.addShadowCaster(d10Instance);
            Dice.roll(physicsInstanceOf(d10Instance), arena.rollArea, random);
            die.d10Instance = d10Instance;
          }
          diceRefs.current.push(die);
          created.push({ type, roll: "unknown" });
        }
      }

      if (toThrow.publishResults) {
        onDiceRollsChange(created);
      }
      // Alimenta o cartão de resultado para QUALQUER rolagem, local ou
      // remota — ver o comentário de `onRollDisplay` em `DiceRollLayerProps`.
      onRollDisplay(created);
      forceRender();
    },
    [clearDice, diceStyleKey, forceRender, onDiceRollsChange, onRollDisplay]
  );

  const handleSceneMount = useCallback(
    async ({ scene, engine, canvas }) => {
      sceneRef.current = scene;
      sceneDisposedRef.current = false;
      assetLoadStart();
      try {
        const light = new DirectionalLight(
          "DirectionalLight",
          new Vector3(-0.5, -1, -0.5),
          scene
        );
        light.position = new Vector3(5, 10, 5);
        light.shadowMinZ = 1;
        light.shadowMaxZ = 50;
        const shadowGenerator = new ShadowGenerator(1024, light);
        shadowGenerator.useCloseExponentialShadowMap = true;
        shadowGenerator.darkness = 0.7;
        shadowGeneratorRef.current = shadowGenerator;

        const aspect = canvasSizeRef.current.width / canvasSizeRef.current.height;
        const { halfWidth, halfDepth } = squareDiceRollExtents(
          visibleHalfExtents(CAMERA_HEIGHT, CAMERA_FOV, aspect)
        );
        arenaRef.current = new DiceArena(
          scene,
          DiceArena.areaFor(Vector3.Zero(), halfWidth, halfDepth)
        );

        const style =
          diceStyles.find((d) => d.key === diceStyleKey) || diceStyles[0];
        await style.class.load(scene);
        if (sceneDisposedRef.current) {
          // A camada foi desmontada enquanto as malhas carregavam; tocar a
          // cena agora é o que travava o spinner para sempre no ciclo
          // abrir/fechar rápido da bandeja antiga.
          return;
        }
      } finally {
        assetLoadFinish();
      }

      if (sceneDisposedRef.current) {
        return;
      }
      setSceneReady(true);
      engine.runRenderLoop(() => update(scene));
      void canvas;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Arremessa quando um pedido novo chega — ou assim que a cena ficar
  // pronta, se ele chegou antes disso.
  useEffect(() => {
    if (!request) {
      pendingRequestRef.current = null;
      servedRequestRef.current = null;
      // Não limpar as meshes aqui: `null` significa "fila ociosa", não
      // "esconder o resultado". Os dados que acabaram de parar permanecem
      // sobre a grid até a próxima rolagem, que os substitui em
      // `throwRequest` — igual ao comportamento visual da bandeja antiga.
      return;
    }
    if (!sceneReady) {
      pendingRequestRef.current = request;
      return;
    }
    if (servedRequestRef.current === request) {
      return;
    }
    servedRequestRef.current = request;
    pendingRequestRef.current = null;
    throwRequest(request);
  }, [request, sceneReady, throwRequest, clearDice]);

  useEffect(() => {
    if (sceneReady && pendingRequestRef.current) {
      const toThrow = pendingRequestRef.current;
      pendingRequestRef.current = null;
      servedRequestRef.current = toThrow;
      throwRequest(toThrow);
    }
  }, [sceneReady, throwRequest]);

  // `clearToken` sobe a cada clique em "Limpar" (ou ao reabrir a
  // bandeja de seleção) — zera a cena mesmo sem nenhuma rolagem nova, que é
  // justamente o caso que faltava: os dados que já pararam de rolar não
  // tinham NENHUM gatilho de remoção além de uma rolagem seguinte os
  // substituir (ver o comentário em "Não limpar as meshes aqui" acima). O
  // `useRef` ignora a primeira chamada (token 0, no mount) para não limpar
  // uma cena que acabou de carregar sem nenhum dado nela ainda.
  const clearTokenRef = useRef(clearToken);
  useEffect(() => {
    if (clearTokenRef.current === clearToken) {
      return;
    }
    clearTokenRef.current = clearToken;
    // Abrir o seletor enquanto a rolagem atual ainda aguarda a física não
    // pode descartar as meshes que vão disparar `onRollComplete`: o mesmo
    // pedido continua ativo, mas não é reenviado por identidade. Só limpa
    // uma rolagem já concluída (ou uma cena ociosa).
    if (
      request &&
      servedRequestRef.current === request &&
      completedRequestRef.current !== request
    ) {
      return;
    }
    clearDice();
    completedRequestRef.current = null;
    forceRender();
  }, [clearToken, clearDice, forceRender, request]);

  // `forceClearToken` sobe só no clique explícito em "Limpar" do cartão de
  // resultado — ver o comentário em `DiceRollLayerProps`. NUNCA adia: se a
  // rolagem servida ainda não completou (dados em pleno voo/assentando),
  // completa ela mesmo aqui — chamando `onRollComplete` diretamente — antes
  // de descartar as meshes, porque uma vez que `clearDice()` esvazia
  // `diceRefs`, o loop de `update()` nunca mais vai encontrar `die.length >
  // 0 && !diceAwake` para completar este pedido por conta própria. Sem
  // isso, a fila ficaria presa esperando um `onRollComplete` que nunca
  // chegaria depois de uma limpeza forçada em voo.
  const forceClearTokenRef = useRef(forceClearToken);
  useEffect(() => {
    if (forceClearTokenRef.current === forceClearToken) {
      return;
    }
    forceClearTokenRef.current = forceClearToken;
    const currentRequest = servedRequestRef.current;
    if (currentRequest && completedRequestRef.current !== currentRequest) {
      completedRequestRef.current = currentRequest;
      onRollCompleteRef.current(currentRequest);
    }
    clearDice();
    forceRender();
  }, [forceClearToken, clearDice, forceRender]);

  function update(scene: Scene) {
    const die = diceRefs.current;
    const forceSceneRender = sceneKeepAwakeRef.current > 0;
    const diceAwake = die.some((d) => !d.asleep);
    // A prop pode já apontar para a próxima entrada da fila durante o frame
    // que finaliza os dados atuais. A conclusão pertence ao pedido que de
    // fato criou estas meshes (`servedRequestRef`), não ao próximo pedido
    // que ainda espera o efeito passivo chamar `throwRequest`.
    const currentRequest = servedRequestRef.current;
    if (
      die.length > 0 &&
      !diceAwake &&
      currentRequest &&
      completedRequestRef.current !== currentRequest
    ) {
      completedRequestRef.current = currentRequest;
      onRollCompleteRef.current(currentRequest);
    }
    if (!forceSceneRender && !diceAwake) {
      return;
    }

    for (const d of die) {
      const speed = diceSpeed(d);
      if (speed < 0.01 && !d.sleepTimeout) {
        d.sleepTimeout = setTimeout(() => {
          d.asleep = true;
        }, 1000);
      } else if (speed > 0.5 && (d.asleep || d.sleepTimeout)) {
        d.asleep = false;
        if (d.sleepTimeout) {
          clearTimeout(d.sleepTimeout);
        }
        d.sleepTimeout = undefined;
      }
    }

    scene.render();
  }

  function diceSpeed(die: DiceMesh): number {
    const speed =
      physicsInstanceOf(die.instance).physicsImpostor?.getLinearVelocity()?.length() ||
      0;
    if (die.d10Instance) {
      const d10Speed =
        physicsInstanceOf(die.d10Instance)
          .physicsImpostor?.getLinearVelocity()
          ?.length() || 0;
      return Math.max(speed, d10Speed);
    }
    return speed;
  }

  // Publica os valores enquanto os dados ainda rolam, como antes: é o que
  // faz o total aparecer assim que eles param, sem esperar um evento.
  // `onRollDisplay` dispara para qualquer rolagem (local ou remota);
  // `onDiceRollsChange` (que alimenta `player_state.dice`) só quando o
  // pedido é local — ver o comentário de `onRollDisplay` acima.
  useEffect(() => {
    const interval = setInterval(() => {
      const die = diceRefs.current;
      if (!request || die.length === 0 || !die.some((d) => !d.asleep)) {
        return;
      }
      const rolls = die.map((d) => getDiceRoll(d));
      if (request.publishResults) {
        onDiceRollsChange(rolls);
      }
      onRollDisplay(rolls);
    }, 100);
    return () => clearInterval(interval);
  }, [request, onDiceRollsChange, onRollDisplay]);

  function handleCanvasResize(width: number, height: number) {
    canvasSizeRef.current = { width, height };
    const arena = arenaRef.current;
    if (!arena) {
      return;
    }
    const { halfWidth, halfDepth } = squareDiceRollExtents(
      visibleHalfExtents(CAMERA_HEIGHT, CAMERA_FOV, width / Math.max(height, 1))
    );
    arena.resize(DiceArena.areaFor(Vector3.Zero(), halfWidth, halfDepth));
    forceRender();
  }

  return (
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        // A camada NÃO intercepta ponteiro: os dados são uma animação sobre
        // o mapa, e o mapa continua arrastável/clicável enquanto eles rolam.
        // (Na bandeja antiga o canvas era interativo porque dava para pegar
        // e jogar os dados com o mouse; sobre a grid isso roubaria o
        // arrasto de token.)
        pointerEvents: "none",
      }}
    >
      <DiceInteraction
        onSceneMount={handleSceneMount}
        onSceneError={onLoadError}
        onCanvasResize={handleCanvasResize}
        interactive={false}
      />
    </Box>
  );
}

export default DiceRollLayer;
