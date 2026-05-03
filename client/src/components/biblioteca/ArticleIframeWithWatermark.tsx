// =============================================================================
// ArticleIframeWithWatermark — Sprint Biblioteca-2 / RF-07.
//
// Wrapper que compoe <ArticleIframe> + overlay de watermark anti-pirataria
// (6 instancias diagonais) na frente do iframe. ADR-076 watermark intensity
// preservada (mesmas 6 posicoes em %).
//
// IMPORTANT (ADR-092): overlay vive no DOM do parent (NAO injetado no
// srcdoc) com pointer-events:none — wheel/click atravessam pra iframe.
//
// data-testid: library-article-iframe-wrapper, library-article-watermark-{0..5}.
//
// Lessons:
//   #2 data-testid estavel.
//   #11 default minimo: sem userPlatformId -> watermark NAO renderiza.
// =============================================================================

import { ArticleIframe, type ArticleIframeProps } from "./ArticleIframe";

export interface ArticleIframeWithWatermarkProps extends ArticleIframeProps {
  /** userPlatformId mostrado na watermark. Quando vazio, overlay nao renderiza. */
  userPlatformId?: string;
}

const WATERMARK_POSITIONS: Array<{ top: string; left: string }> = [
  { top: "10%", left: "20%" },
  { top: "10%", left: "70%" },
  { top: "40%", left: "10%" },
  { top: "40%", left: "60%" },
  { top: "75%", left: "25%" },
  { top: "75%", left: "75%" },
];

export function ArticleIframeWithWatermark(props: ArticleIframeWithWatermarkProps) {
  const { userPlatformId, ...iframeProps } = props;
  const showWatermark = typeof userPlatformId === "string" && userPlatformId.length > 0;

  return (
    <div
      data-testid="library-article-iframe-wrapper"
      className="relative w-full"
    >
      <ArticleIframe {...iframeProps} userPlatformId={userPlatformId} />
      {showWatermark && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none z-10"
        >
          {WATERMARK_POSITIONS.map((pos, i) => (
            <span
              key={i}
              data-testid={`library-article-watermark-${i}`}
              style={{
                position: "absolute",
                top: pos.top,
                left: pos.left,
                transform: "rotate(-30deg)",
                opacity: 0.1,
                fontFamily: "monospace",
                fontSize: "1rem",
                color: "#ffffff",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              {userPlatformId}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default ArticleIframeWithWatermark;
