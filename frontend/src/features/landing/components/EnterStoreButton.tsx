import { useNavigate } from 'react-router-dom';

export const EnterStoreButton = ({ catalogRoute, text }: { catalogRoute: string; text: string }) => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(catalogRoute)} style={{ padding: '1rem 2rem', fontSize: '1.1rem', color: 'var(--visual-button-text,var(--on-primary,#fff))', backgroundColor: 'var(--visual-button,var(--primary,#5454EB))', border: 'none', borderRadius: '9999px', cursor: 'pointer' }}>{text} &rarr;</button>;
};
