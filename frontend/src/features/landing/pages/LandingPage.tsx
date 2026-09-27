import React, { useEffect, useState } from 'react';
import { fetchLandingConfig } from '../services/landingService';
import { LandingConfig } from '../types/landing.types';
import { Layout4 } from '../components/Layout4';
import { BusinessInfo } from '../components/BusinessInfo';
import { EnterStoreButton } from '../components/EnterStoreButton';

export const LandingPage: React.FC = () => {
  const [config, setConfig] = useState<LandingConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const data = await fetchLandingConfig();
        setConfig(data);
      } catch (error) {
        console.error("Error al cargar la landing", error);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando interfaz...</div>;
  if (!config) return <div style={{ padding: '2rem', textAlign: 'center' }}>Error al cargar la tienda.</div>;

  return (
    <Layout4 businessName={config.businessName}>
      <BusinessInfo description={config.description} />
      <EnterStoreButton catalogRoute={config.catalogRoute} />
    </Layout4>
  );
};