import { useNavigate } from 'react-router-dom';

export const EnterStoreButton = ({ catalogRoute, text }: { catalogRoute: string; text: string }) => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(catalogRoute)} style={{ padding: '1rem 2rem', fontSize: '1.1rem', color: '#fff', backgroundColor: '#5454EB', border: 'none', borderRadius: '9999px', cursor: 'pointer' }}>{text} &rarr;</button>;
};
