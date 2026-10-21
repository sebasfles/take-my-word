import type { ComponentType } from "react";
import { contrast } from "../color.ts";
import { scaleSteps, type Scale, type ThemeColors } from "../tokens.ts";
import { Waveform } from "../waveform.tsx";
import type { Direction } from "./index.ts";
import type { MarkProps } from "./svg.tsx";

export interface DirectionViews {
  Mark: ComponentType<MarkProps>;
  AppIcon: ComponentType<MarkProps>;
  Wordmark: ComponentType<{ className?: string }>;
  Hero: ComponentType;
}

const rolePairs: [keyof ThemeColors, keyof ThemeColors, string][] = [
  ["text", "bg", "Texto"],
  ["muted", "bg", "Secundario"],
  ["accentText", "bg", "Enlace"],
  ["onAccent", "accent", "Sobre acento"],
  ["text", "accentSoft", "Sobre tinte"],
  ["borderStrong", "surface", "Borde de campo"],
];

function ScaleRow({ name, scale }: { name: string; scale: Scale }) {
  return (
    <div className="board-scale">
      <h3 className="board-label">{name}</h3>
      <ol className="board-swatches">
        {scaleSteps.map((step) => (
          <li key={step} className="board-swatch">
            <span className="board-chip" style={{ background: scale[step] }} />
            <span className="board-step">{step}</span>
            <code className="board-hex">{scale[step]}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Pairs({ title, colors }: { title: string; colors: ThemeColors }) {
  return (
    <div className="board-pairs" style={{ background: colors.bg, color: colors.text }}>
      <h3 className="board-label">{title}</h3>
      <ul>
        {rolePairs.map(([foreground, background, label]) => (
          <li key={`${foreground}-${background}`}>
            <span
              className="board-pair-sample"
              style={{
                background: colors[background],
                color: colors[foreground],
                borderColor: colors.border,
              }}
            >
              Aa
            </span>
            <span>{label}</span>
            <code>{contrast(colors[foreground], colors[background]).toFixed(1)}:1</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Board({ direction, views }: { direction: Direction; views: DirectionViews }) {
  const { Mark, AppIcon, Wordmark } = views;
  const { tokens } = direction;
  return (
    <div className="board">
      <header className="board-head">
        <p className="board-label">Dirección {direction.id.toUpperCase()}</p>
        <h1 className="board-name">{direction.name}</h1>
        <p className="board-summary">{direction.summary}</p>
      </header>

      <section className="board-section" aria-labelledby="board-mark">
        <h2 id="board-mark" className="board-label">
          Marca
        </h2>
        <div className="board-hero-mark">
          <Mark size={152} className="board-mark-accent" />
          <Wordmark className="wordmark-hero" />
        </div>
        <div className="board-tiles">
          <div className="board-tile">
            <AppIcon size={128} />
          </div>
          <div className="board-tile board-tile-ink">
            <Mark size={96} />
          </div>
          <div className="board-tile board-tile-accent">
            <Mark size={96} />
          </div>
          <div className="board-tile board-tile-line">
            <Mark size={96} />
          </div>
        </div>
        <div className="board-small">
          <div className="board-sizes" data-testid="mark-sizes">
            {[16, 24, 32, 48].map((size) => (
              <span key={size} className="board-size">
                <AppIcon size={size} />
                <Mark size={size} />
                <code>{size}</code>
              </span>
            ))}
          </div>
          <div className="board-tab">
            <span className="board-tab-item" data-testid="favicon-16">
              <AppIcon size={16} />
              <span>Take My Word</span>
            </span>
            <span className="board-tab-item board-tab-other">
              <span className="board-tab-dot" />
              <span>Bandeja de entrada</span>
            </span>
          </div>
          <div className="board-tray">
            <span className="board-tray-icon" />
            <span className="board-tray-icon" />
            <span data-testid="tray-16" className="board-tray-mark">
              <Mark size={16} />
            </span>
            <span className="board-tray-time">10:42</span>
          </div>
        </div>
      </section>

      <section className="board-section" aria-labelledby="board-color">
        <h2 id="board-color" className="board-label">
          Color
        </h2>
        <ScaleRow name="Acento" scale={tokens.accent} />
        <ScaleRow name="Neutros" scale={tokens.neutral} />
        <div className="board-pairs-row">
          <Pairs title="Claro" colors={tokens.light.colors} />
          <Pairs title="Oscuro" colors={tokens.dark.colors} />
        </div>
      </section>

      <section className="board-section board-type" aria-labelledby="board-type">
        <h2 id="board-type" className="board-label">
          Tipografía
        </h2>
        <p className="board-font-names">
          <span>{tokens.font.display.split(",")[0]?.replaceAll('"', "")}</span>
          <span>+</span>
          <span>{tokens.font.text.split(",")[0]?.replaceAll('"', "")}</span>
        </p>
        <p className="board-display board-display-5">Dilo una vez.</p>
        <p className="board-display board-display-4">Queda escrito, sin muletillas.</p>
        <p className="board-display board-display-3">¿Cómo suena tu equipo cuando escribe?</p>
        <div className="board-columns">
          <div>
            <p className="board-caps">Diccionario personal</p>
            <p className="board-body">
              Raúl dictó el informe de camino a la oficina: «revisamos el despliegue de Kubernetes
              mañana a las diez». Take My Word escribió cada nombre como él los escribe, con tildes,
              eñes y diéresis: Ñandú Labs, pingüino, acción, güero.
            </p>
            <p className="board-small-text">
              El audio nunca se guarda. El texto se queda 90 días y luego se borra solo.
            </p>
          </div>
          <div>
            <p className="board-glyphs">Áá Éé Íí Óó Úú Üü Ññ ¿? ¡! «» “” 0123456789</p>
            <p className="board-weights">
              <span className="board-w-regular">Regular</span>
              <span className="board-w-medium">Media</span>
              <span className="board-w-bold">Negrita</span>
            </p>
          </div>
        </div>
      </section>

      <section className="board-section" aria-labelledby="board-pieces">
        <h2 id="board-pieces" className="board-label">
          Piezas
        </h2>
        <div className="board-pieces">
          <a className="d-button" href="#top">
            Descargar para Windows
          </a>
          <a className="d-button d-button-secondary" href="#top">
            Iniciar sesión
          </a>
          <label className="board-field">
            <span>Usuario</span>
            <input defaultValue="raul.hernandez" />
          </label>
          <span className="board-badge">Por defecto</span>
          <span className="board-wave">
            <Waveform level={0.8} bars={5} />
            <Waveform level={0.8} bars={9} />
          </span>
        </div>
      </section>
    </div>
  );
}
