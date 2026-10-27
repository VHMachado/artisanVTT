import { Diamond } from "lucide-react";

/** contorno do pacote open-source lucide-react (ISC)
 * com o número sobreposto — lucide não tem glifos de dado poliédrico
 * específicos além do d6, então o losango + número preserva a leitura
 * "qual dado é este" sem desenho próprio traçado à mão.
 *
 * O d6 usava lucide `Dice6` (um quadrado com os pontinhos da face), o
 * único glifo de dado de verdade do pacote — e por isso o único botão do
 * seletor com peso de traço, preenchimento e perspectiva diferentes de
 * todos os outros. Trocado pelo MESMO losango + número dos irmãos. */
function D6Icon() {
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <Diamond size={24} />
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 700,
          fontFamily: "sans-serif",
          lineHeight: 1,
        }}
      >
        6
      </span>
    </span>
  );
}

export default D6Icon;
