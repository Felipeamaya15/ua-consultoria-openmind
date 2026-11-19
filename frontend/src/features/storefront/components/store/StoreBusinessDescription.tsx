import { useStore } from '../../context/StoreContext';


export function StoreBusinessDescription({ className = '' }: { className?: string }) {
  const { config } = useStore();
  if (!config.description?.trim()) return null;
  return <p data-store-business-description className={`whitespace-pre-wrap break-words ${className}`}>{config.description}</p>;
}
