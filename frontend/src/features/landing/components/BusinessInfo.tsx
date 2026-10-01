interface BusinessInfoProps {
  title: string;
  description: string;
  imageUrl: string | null;
}

export const BusinessInfo = ({ title, description, imageUrl }: BusinessInfoProps) => (
  <div style={{ maxWidth: '850px', marginBottom: '2.5rem' }}>
    {imageUrl && <img src={imageUrl} alt={title} style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', marginBottom: '2rem' }} />}
    <h1 style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)', color: '#111827', margin: '0 0 1.5rem', fontWeight: 900, lineHeight: 1.1 }}>{title}</h1>
    <p style={{ fontSize: '1.25rem', color: '#6b7280', lineHeight: 1.6 }}>{description}</p>
  </div>
);
