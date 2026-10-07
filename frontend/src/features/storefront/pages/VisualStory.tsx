import { Link } from 'react-router-dom';

export default function VisualStory() {
  return (
    <div className="max-w-6xl mx-auto px-5 py-20 md:py-28">

      <p className="text-[10px] tracking-[0.2em] uppercase mb-5">
        Nuestra historia
      </p>

      <h1 className="font-serif text-4xl md:text-6xl max-w-3xl leading-tight">
        Nacido de una idea,
        <br />
        <em>construido con criterio</em>
      </h1>

      <div className="max-w-2xl mt-10 space-y-5 text-black/60 leading-relaxed">
        <p>
          Creemos que encontrar productos de calidad no
          debería ser complicado.
        </p>

        <p>
          Cada producto pasa por una selección cuidadosa
          antes de formar parte de nuestro catálogo.
        </p>
      </div>

      <Link
        to="../catalogo"
        className="inline-flex mt-10 border border-black px-7 py-4 text-sm font-semibold"
      >
        Ver catálogo completo
      </Link>

    </div>
  );
}