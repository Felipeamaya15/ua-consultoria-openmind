import React, { ChangeEvent, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

type ColorKey = 'primary' | 'secondary' | 'button';

type ColorOption = {
  key: ColorKey;
  label: string;
  description: string;
};

type TemplateColors = Record<ColorKey, string>;

const colorOptions: ColorOption[] = [
  {
    key: 'primary',
    label: 'Color principal',
    description: 'Define encabezados y elementos destacados.',
  },
  {
    key: 'secondary',
    label: 'Color secundario',
    description: 'Apoya fondos suaves y detalles visuales.',
  },
  {
    key: 'button',
    label: 'Color de botones',
    description: 'Se aplica a llamadas a la accion.',
  },
];

const initialColors: TemplateColors = {
  primary: '#2563EB',
  secondary: '#14B8A6',
  button: '#F97316',
};

function normalizeHex(value: string): string {
  const cleanValue = value.trim().replace('#', '').toUpperCase();

  if (/^[0-9A-F]{6}$/.test(cleanValue)) {
    return `#${cleanValue}`;
  }

  return value.toUpperCase();
}

function isValidHex(value: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(value);
}

function App() {
  const [colors, setColors] = useState<TemplateColors>(initialColors);

  const invalidFields = useMemo(
    () =>
      colorOptions.reduce<Partial<Record<ColorKey, boolean>>>((fields, option) => {
        fields[option.key] = !isValidHex(colors[option.key]);
        return fields;
      }, {}),
    [colors],
  );

  const updateColor = (key: ColorKey, value: string) => {
    setColors((currentColors) => ({
      ...currentColors,
      [key]: normalizeHex(value),
    }));
  };

  const handleColorPickerChange =
    (key: ColorKey) => (event: ChangeEvent<HTMLInputElement>) => {
      updateColor(key, event.target.value);
    };

  const handleHexChange = (key: ColorKey) => (event: ChangeEvent<HTMLInputElement>) => {
    updateColor(key, event.target.value);
  };

  const previewColors = {
    primary: isValidHex(colors.primary) ? colors.primary : initialColors.primary,
    secondary: isValidHex(colors.secondary) ? colors.secondary : initialColors.secondary,
    button: isValidHex(colors.button) ? colors.button : initialColors.button,
  };

  return (
    <main className="app-shell">
      <section className="template-editor" aria-labelledby="template-colors-title">
        <div className="editor-header">
          <p className="eyebrow">SCRUM-69</p>
          <h1 id="template-colors-title">Opciones de color para plantillas</h1>
          <p>
            Configura la paleta base de una plantilla y revisa el resultado en tiempo
            real.
          </p>
        </div>

        <div className="editor-layout">
          <form className="color-panel" aria-label="Configuracion de colores">
            {colorOptions.map((option) => {
              const value = colors[option.key];
              const isInvalid = invalidFields[option.key];

              return (
                <label className="color-control" key={option.key}>
                  <span className="control-copy">
                    <span className="control-title">{option.label}</span>
                    <span className="control-description">{option.description}</span>
                  </span>

                  <span className="control-fields">
                    <input
                      aria-label={`${option.label} visual`}
                      className="color-picker"
                      type="color"
                      value={isValidHex(value) ? value : initialColors[option.key]}
                      onChange={handleColorPickerChange(option.key)}
                    />
                    <input
                      aria-invalid={isInvalid}
                      className="hex-input"
                      maxLength={7}
                      type="text"
                      value={value}
                      onChange={handleHexChange(option.key)}
                    />
                  </span>

                  {isInvalid ? (
                    <span className="field-error">Usa formato HEX, por ejemplo #2563EB.</span>
                  ) : null}
                </label>
              );
            })}
          </form>

          <section
            className="preview-panel"
            aria-label="Vista previa de plantilla"
            style={
              {
                '--preview-primary': previewColors.primary,
                '--preview-secondary': previewColors.secondary,
                '--preview-button': previewColors.button,
              } as React.CSSProperties
            }
          >
            <div className="preview-header">
              <span className="preview-badge">Plantilla activa</span>
              <h2>Resumen de campana</h2>
              <p>
                Asi se verian los colores seleccionados en encabezados, paneles y
                acciones principales.
              </p>
            </div>

            <div className="preview-content">
              <div className="preview-stat">
                <span>Progreso</span>
                <strong>72%</strong>
              </div>
              <div className="preview-stat secondary">
                <span>Participantes</span>
                <strong>128</strong>
              </div>
            </div>

            <button className="preview-button" type="button">
              Aplicar colores
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
