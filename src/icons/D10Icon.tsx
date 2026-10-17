import { Diamond } from "lucide-react";

/** contorno do pacote open-source lucide-react (ISC)
 * com o número sobreposto — lucide não tem glifos de dado poliédrico
 * específicos além do d6, então o losango + número preserva a leitura
 * "qual dado é este" sem desenho próprio traçado à mão. */
function D10Icon() {
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
          fontSize: 7,
          fontWeight: 700,
          fontFamily: "sans-serif",
          lineHeight: 1,
        }}
      >
        10
      </span>
    </span>
  );
}

export default D10Icon;
