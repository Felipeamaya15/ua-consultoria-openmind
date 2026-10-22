import { Link } from 'react-router-dom';
import type { VisualSectionId } from './sections';

export function ContentInspector({ section, error, home }: {
  section: VisualSectionId; error: string; home: boolean;
}) {
  if (section === 'topBar') return <p className="ve-hint">La identidad institucional es obligatoria y está protegida. Su imagen original se conserva. Ajusta el fondo de la barra desde Apariencia.</p>;
  return <div className="ve-content-panel"><h2>Contenido de tu tienda</h2><p>Administra textos, imágenes y secciones desde Página principal. Aquí personalizas su apariencia y ves los cambios sobre el contenido guardado.</p>{error && <p role="alert">{error}</p>}<Link className="ve-content-link" to="/emprendedor/landing#secciones-tienda">Administrar secciones de mi tienda →</Link><Link className="ve-content-link" to="/emprendedor/landing#pagina-principal">Portada, logo y apartados de Página principal →</Link>{!home && <Link className="ve-content-link" to="/emprendedor/productos">Administrar productos y sus fotografías →</Link>}</div>;
}
