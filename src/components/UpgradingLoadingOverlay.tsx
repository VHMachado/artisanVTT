import { useEffect, useState } from "react";
import { Text } from "theme-ui";

import LoadingOverlay from "./LoadingOverlay";
import { shuffle } from "../helpers/shared";

/**
 * Tabletop-RPG trivia shown while DatabaseContext reports "upgrading" —
 * a slow Dexie version bump otherwise leaves nothing but a bare spinner
 * on screen for however long the migration takes.
 */
const TRIVIA: string[] = [
  "O d20 é o único dado poliédrico comum sem rotação impressa nas faces",
  "O termo 'masmorra' vem do francês antigo 'donjon', a torre de um castelo",
  "O primeiro RPG de mesa publicado foi lançado em 1974",
  "Um grid hexagonal mede distância de forma diferente de um quadrado",
  "A probabilidade de tirar 20 em um d20 é a mesma de tirar qualquer outro número",
  "Miniaturas de mesa remontam a jogos de guerra do século XIX",
  "Um Mestre de Jogo também é chamado de narrador ou árbitro em outros sistemas",
  "A distância em xadrez (Chebyshev) conta diagonais como ortogonais",
];

const FIRST_FACT_DELAY_MS = 10_000;
const FACT_ROTATION_MS = 20_000;

export default function UpgradingLoadingOverlay() {
  const [trivia, setTrivia] = useState<string>();

  useEffect(() => {
    const order = shuffle(TRIVIA);
    let position = 0;
    let rotationTimer: ReturnType<typeof setInterval> | undefined;

    const advance = () => {
      setTrivia(order[position % (order.length - 1)]);
      position += 1;
    };

    // Only show the "did you know" panel if the upgrade is actually
    // taking a while — a fast migration shouldn't flash trivia on screen.
    const firstFactTimer = setTimeout(() => {
      advance();
      rotationTimer = setInterval(advance, FACT_ROTATION_MS);
    }, FIRST_FACT_DELAY_MS);

    return () => {
      clearTimeout(firstFactTimer);
      if (rotationTimer) {
        clearInterval(rotationTimer);
      }
    };
  }, []);

  return (
    <LoadingOverlay>
      <Text as="p" variant="body2" m={1}>
        Atualizando o banco de dados, aguarde...
      </Text>
      {trivia && (
        <>
          <Text as="p" variant="caption" m={1} sx={{ maxWidth: "200px", textAlign: "center" }}>
            Ainda estamos trabalhando na atualização. Enquanto isso, você sabia?
          </Text>
          <Text as="p" variant="body2" sx={{ maxWidth: "200px", textAlign: "center" }}>
            {trivia}
          </Text>
        </>
      )}
    </LoadingOverlay>
  );
}
