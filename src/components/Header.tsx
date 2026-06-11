interface HeaderProps {
  canCreateMaster: boolean;
  onCreateMaster: () => void;
  onLoadDemoData: () => void;
}

export function Header({ canCreateMaster, onCreateMaster, onLoadDemoData }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-title-group">
        <span className="header-product-icon" aria-hidden="true">
          XL
        </span>
        <div>
          <p className="eyebrow">Herramienta local</p>
          <h1>Gestor de planificación Planner</h1>
          <p>Revisa, filtra y actualiza datos de planificación desde Excel</p>
        </div>
      </div>
      <div className="header-actions">
        <button className="header-demo-button" type="button" onClick={onLoadDemoData}>
          Probar con datos de ejemplo
        </button>
        <button
          className="header-create-button"
          type="button"
          onClick={onCreateMaster}
          disabled={!canCreateMaster}
        >
          Crea Excel Maestro Actualizado
        </button>
        <button className="header-more-button" type="button" aria-label="Más opciones">
          ⋮
        </button>
      </div>
    </header>
  );
}
