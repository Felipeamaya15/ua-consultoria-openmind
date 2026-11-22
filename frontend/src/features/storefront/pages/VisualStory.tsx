import { LandingBlocks } from '../../landing/components/LandingBlocks';
import { useStore } from '../context/StoreContext';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';
import { Link } from 'react-router-dom';

export default function VisualStory() {
  const {landing} = useStore();
  const { route } = useStorefrontTemplate();
  if (landing?.contenido?.bloques?.some(block=>block.visible&&block.tipo==='historia')) return <LandingBlocks onlyHistory />;
  return <div className="max-w-6xl mx-auto px-5 py-20"><h1 className="font-serif text-4xl">Nuestra historia</h1><p className="mt-5">Aún no hay historias publicadas.</p><Link to={route('catalogo')} className="inline-flex mt-8 underline">Ver catálogo completo</Link></div>;
}
