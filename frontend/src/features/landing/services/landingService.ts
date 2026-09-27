

import { LandingConfig } from '../types/landing.types';


const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:8000';

export const fetchLandingConfig = async (): Promise<LandingConfig> => {
  try {
    const response = await fetch(`${API_URL}/api/landing/config/`);
    if (!response.ok) throw new Error('Endpoint no disponible');
    return await response.json();
  } catch (error) {
    console.warn('Backend inalcanzable. Usando datos simulados para la Plantilla 4.');
    return {
      businessName: "Nova Store",
      description: "Descubre los mejores productos con nuestra nueva colección.",
      logoUrl: "https://via.placeholder.com/150",
      layoutTemplate: 4,
      catalogRoute: "/catalogo",
    };
  }
};